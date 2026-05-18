# Folder Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement folder sharing with two modes — Snapshot (recipient gets file copies) and Live (recipient gets ongoing access including future files; revocation on removal).

**Architecture:** Server stores folder-sharing records (no crypto). Client handles all DEK wrapping. On file creation inside a live-shared folder, the client fetches the folder's sharing config and auto-shares with each recipient. SSE delivers `folder_shared` / `file_shared` / `file_access_revoked` events so the recipient's sidebar updates without reload.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Zustand, Web Crypto API (RSA-OAEP + AES-GCM), existing `shareLogic.ts`, existing SSE infrastructure.

**Prerequisite:** The bug-fixes plan must be applied first (especially Task 5 — `fetchDirectory` after share).

---

## Task 1: Backend — Folder Sharing Endpoints

**Files:**
- Backend: add `POST /api/v1/folders/{folderId}/share`
- Backend: add `GET /api/v1/folders/{folderId}/sharing`
- Backend: add `DELETE /api/v1/folders/{folderId}/sharing/{userId}`
- Backend: add `PATCH /api/v1/folders/{folderId}/sharing/{userId}`
- Backend: emit SSE `folder_shared` / `file_access_revoked` events

**Note:** Exact backend file paths depend on your backend framework. The following describes the required behaviour.

- [ ] **Step 1: Create folder_sharing table/collection**

  Schema:
  ```
  folder_sharing {
    id:            UUID (primary key)
    folder_id:     UUID (references files.id where type='folder')
    owner_id:      UUID
    recipient_id:  UUID
    permission:    enum('view', 'edit', 'share')
    share_type:    enum('live')  -- snapshot is one-shot, no row needed
    created_at:    timestamp
  }
  ```

- [ ] **Step 2: Implement POST /api/v1/folders/{folderId}/share**

  Behaviour:
  - Validate `folderId` exists and belongs to the requesting user
  - Body: `{ recipient_id, permission, share_type: 'snapshot' | 'live' }`
  - For `share_type: 'live'`: insert a `folder_sharing` row; return 201
  - For `share_type: 'snapshot'`: return 200 with list of all file IDs in folder recursively (client handles DEK sharing)
  - Emit SSE event to recipient_id: `{ type: 'folder_shared', folder_id, share_type, permission }`

- [ ] **Step 3: Implement GET /api/v1/folders/{folderId}/sharing**

  Returns array of `{ user_id, permission, share_type }` for the folder.
  Only accessible by folder owner.

- [ ] **Step 4: Implement DELETE /api/v1/folders/{folderId}/sharing/{userId}**

  - Remove the `folder_sharing` row
  - Revoke `access_keys` for `userId` from ALL files in the folder recursively
  - Emit SSE to `userId`: `{ type: 'folder_access_revoked', folder_id }`

- [ ] **Step 5: Implement PATCH /api/v1/folders/{folderId}/sharing/{userId}**

  - Body: `{ permission }`
  - Update the permission in `folder_sharing`
  - Optionally emit SSE to recipient: `{ type: 'folder_permission_updated', folder_id, permission }`

- [ ] **Step 6: Auto-revoke on file removal from folder**

  When a file is deleted or moved (its `parent_id` changes away from a live-shared folder):
  - Check if the old `parent_id` folder has any live-sharing records
  - If yes: remove `access_keys` for each live-sharing `recipient_id` from the moved/deleted file
  - Emit SSE to each affected recipient: `{ type: 'file_access_revoked', file_id }`

- [ ] **Step 7: Commit backend**

  ```bash
  git commit -m "feat: add folder sharing endpoints and auto-revoke on file removal"
  ```

---

## Task 2: Frontend — Folder Sharing Logic

**Files:**
- Create: `web/src/lib/folderShareLogic.ts`

- [ ] **Step 1: Write folderShareLogic.ts**

  ```typescript
  // web/src/lib/folderShareLogic.ts
  import { apiFetch } from './api';
  import { performMessengerShare } from './shareLogic';
  
  export interface FolderSharingRecord {
      user_id: string;
      permission: 'view' | 'edit' | 'share';
      share_type: 'live';
  }
  
  /** Fetch the live-sharing config for a folder. Returns [] if none. */
  export async function getFolderSharing(folderId: string): Promise<FolderSharingRecord[]> {
      const res = await apiFetch(`/api/v1/folders/${folderId}/sharing`);
      if (!res.ok) return [];
      return res.json();
  }
  
  /** Share all files in a list with a recipient (snapshot or live setup). */
  export async function shareFileList(
      fileIds: string[],
      shareModalFile: { id: string; title: string; type?: string },
      myId: string,
      privateKey: CryptoKey,
      publicKey: CryptoKey,
      events: any[],
      recipientId: string,
      recipientEmail: string,
      recipientPubKeySpki: string,
      permission: 'view' | 'edit' | 'share',
      onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
      for (let i = 0; i < fileIds.length; i++) {
          await performMessengerShare(
              { id: fileIds[i], title: '', type: undefined },
              myId, privateKey, publicKey, events,
              recipientId, recipientEmail, recipientPubKeySpki, permission,
          );
          onProgress?.(i + 1, fileIds.length);
      }
  }
  
  /** Fetch all file IDs in a folder recursively. */
  export async function getFolderFileIds(folderId: string): Promise<string[]> {
      const res = await apiFetch(`/api/v1/files?parent_id=${folderId}`);
      if (!res.ok) return [];
      const files: { id: string; type: string }[] = await res.json();
      const ids: string[] = [];
      for (const f of files) {
          if (f.type === 'folder') {
              const sub = await getFolderFileIds(f.id);
              ids.push(...sub);
          } else if (f.type !== 'canvas-asset') {
              ids.push(f.id);
          }
      }
      return ids;
  }
  
  /** Revoke live sharing for a recipient. */
  export async function revokeFolderSharing(folderId: string, userId: string): Promise<void> {
      await apiFetch(`/api/v1/folders/${folderId}/sharing/${userId}`, { method: 'DELETE' });
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add web/src/lib/folderShareLogic.ts
  git commit -m "feat: add folderShareLogic utility (share file list, get config, revoke)"
  ```

---

## Task 3: Frontend — Auto-Share on New File Creation

**Files:**
- Modify: `web/src/store/useDataStore.ts` (createNote, createCanvasNote)

**Context:** When a file is created inside a live-shared folder, all live recipients need to receive the file's DEK. The store's `createNote` and `createCanvasNote` actions know the `parentId`. After file creation, call `getFolderSharing` and auto-share if any live records exist.

- [ ] **Step 1: Locate createNote and createCanvasNote in useDataStore.ts**

  Find both functions. They return the new file's ID.

- [ ] **Step 2: Add auto-share hook after file creation**

  Import the helper at the top of `useDataStore.ts`:
  ```typescript
  import { getFolderSharing, shareFileList } from '@/lib/folderShareLogic';
  ```

  In both `createNote` and `createCanvasNote`, after the API call returns the new file ID, add:
  ```typescript
  // Auto-share with live-sharing recipients of parent folder
  const parentId = state.activeParentId;
  if (parentId) {
      const sharingRecords = await getFolderSharing(parentId);
      if (sharingRecords.length > 0) {
          const { privateKey, publicKey, myId, events } = state;
          for (const rec of sharingRecords) {
              // Fetch recipient's public key from their profile
              const profileRes = await apiFetch(`/api/v1/profiles/${rec.user_id}`);
              if (!profileRes.ok) continue;
              const profile = await profileRes.json();
              if (!profile.public_key_spki) continue;
              await shareFileList(
                  [newFileId],
                  { id: newFileId, title: '', type: 'note' },
                  myId, privateKey, publicKey, events,
                  rec.user_id, profile.email || '',
                  profile.public_key_spki,
                  rec.permission,
              );
          }
      }
  }
  ```
  Replace `newFileId` with the actual variable name used in the store action.

  **Note:** `privateKey`, `publicKey`, `myId`, `events` must be available in the store or passed from the calling component. If not in the store, add them as store state (they are already available in `page.tsx` as component state).

- [ ] **Step 3: Test**

  1. Set up live sharing on a folder (Task 4 UI).
  2. Create a new note inside that folder.
  3. On the recipient's browser: the new note should appear in the sidebar without reload.

- [ ] **Step 4: Commit**

  ```bash
  git add web/src/store/useDataStore.ts
  git commit -m "feat: auto-share new files with live-sharing recipients of parent folder"
  ```

---

## Task 4: Frontend — Extend ShareModal for Folder Sharing

**Files:**
- Modify: `web/src/components/ShareModal.tsx`

**Context:** When `shareModalFile.type === 'folder'`, the modal needs to show a share-type selector (Snapshot / Live) above the existing recipient + permission UI.

- [ ] **Step 1: Add share type state to ShareModal**

  Find `ShareModal.tsx` and add state for the share type:
  ```tsx
  const [folderShareType, setFolderShareType] = useState<'snapshot' | 'live'>('live');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const isFolder = shareModalFile?.type === 'folder';
  ```

- [ ] **Step 2: Add share type selector UI**

  Inside the modal JSX, before the existing recipient/permission UI, conditionally render for folders:
  ```tsx
  {isFolder && (
      <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Art des Teilens</p>
          <div className="flex gap-2">
              <button
                  onClick={() => setFolderShareType('snapshot')}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      folderShareType === 'snapshot'
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                  <div className="font-semibold">Aktueller Zustand</div>
                  <div className="text-xs opacity-70 mt-0.5">Einmalige Kopie</div>
              </button>
              <button
                  onClick={() => setFolderShareType('live')}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      folderShareType === 'live'
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                  <div className="font-semibold">Live</div>
                  <div className="text-xs opacity-70 mt-0.5">Dauerhafter Zugriff</div>
              </button>
          </div>
      </div>
  )}
  ```

- [ ] **Step 3: Add progress indicator**

  Below the share button, conditionally render the progress bar:
  ```tsx
  {progress && (
      <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Teile Dateien...</span>
              <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
          </div>
      </div>
  )}
  ```

- [ ] **Step 4: Update share handler for folders**

  Find the existing share submit handler in `ShareModal.tsx`. After the existing `performShare` call (which handles single files/events), add folder-specific logic:
  ```typescript
  const handleSubmit = async () => {
      if (!selectedRecipient) return;
      setIsLoading(true);
      try {
          if (isFolder && shareModalFile) {
              const folderId = shareModalFile.id;
              // Get all file IDs in folder
              const { getFolderFileIds, shareFileList } = await import('@/lib/folderShareLogic');
              const fileIds = await getFolderFileIds(folderId);
              setProgress({ done: 0, total: fileIds.length });
  
              // For live: register the sharing config on the server first
              if (folderShareType === 'live') {
                  await apiFetch(`/api/v1/folders/${folderId}/share`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          recipient_id: selectedRecipient.id,
                          permission: selectedPermission,
                          share_type: 'live',
                      }),
                  });
              }
  
              // Share all current files with the recipient
              await shareFileList(
                  fileIds,
                  shareModalFile,
                  myId, privateKey!, publicKey!, events,
                  selectedRecipient.id,
                  selectedRecipient.email,
                  selectedRecipient.publicKeySpki,
                  selectedPermission,
                  (done, total) => setProgress({ done, total }),
              );
              setProgress(null);
          } else {
              await performShare(selectedRecipient.id, selectedRecipient.email, selectedRecipient.publicKeySpki, selectedPermission);
          }
          onClose();
      } catch (err) {
          console.error('Share failed:', err);
          setError('Teilen fehlgeschlagen. Bitte erneut versuchen.');
      } finally {
          setIsLoading(false);
      }
  };
  ```
  The exact variable names (`myId`, `privateKey`, `publicKey`, `events`, `selectedRecipient`, `selectedPermission`) may differ — align with the existing ShareModal prop/state names.

- [ ] **Step 5: Test folder sharing**

  1. Right-click a folder in the sidebar → Share.
  2. Modal shows share type selector.
  3. Select "Aktueller Zustand", choose a contact, click Share.
  4. Progress bar shows file count.
  5. On recipient's device: files appear in their sidebar (after `folder_shared` SSE event — see Task 5).

- [ ] **Step 6: Commit**

  ```bash
  git add web/src/components/ShareModal.tsx
  git commit -m "feat: extend ShareModal with folder share type selector and progress bar"
  ```

---

## Task 5: Frontend — SSE Handler for New Share Events

**Files:**
- Modify: `web/src/app/page.tsx` (SSE event handler, around line 1100–1130)

**Context:** The existing SSE handler processes `file_updated` events. We need to add `file_shared`, `folder_shared`, and `file_access_revoked` to show/hide entries in the sidebar without reload.

- [ ] **Step 1: Extend SSE event handler**

  Find the SSE message handler in `page.tsx` (around line 1106). Extend the switch/if block:
  ```typescript
  eventSource.onmessage = (event) => {
      try {
          const data = JSON.parse(event.data);
          const store = useDataStore.getState();
  
          if (data.type === 'file_updated') {
              // existing logic
              const msSinceOwnSave = Date.now() - lastOwnSaveRef.current;
              if (msSinceOwnSave < 3000) {
                  console.log(`[SSE] Suppressing own file_updated refetch (${msSinceOwnSave}ms since last save)`);
              } else {
                  store.fetchDirectory(null);
              }
          } else if (data.type === 'file_shared') {
              // A file was shared with us — refresh to show it
              store.fetchDirectory(null);
          } else if (data.type === 'folder_shared') {
              // A folder was shared with us — refresh to show it and its contents
              store.fetchDirectory(null, true);
          } else if (data.type === 'file_access_revoked') {
              // We lost access to a file — remove it from local state
              const { file_id } = data;
              store.setNotes((store.notes as any[]).filter((f: any) => f.id !== file_id));
              store.setEvents((store.events as any[]).filter((e: any) => e.id !== file_id));
              // If this file is currently open, navigate away
              if (activeNoteId === file_id) {
                  setActiveNoteId(null);
              }
          } else if (data.type === 'folder_access_revoked') {
              // We lost access to a folder — refresh to remove it
              store.fetchDirectory(null, true);
          }
      } catch (e) { console.error("SSE Parse Error", e); }
  };
  ```
  Replace `store.setNotes` / `store.setEvents` with the actual store action names if different (check `useDataStore.ts`).

- [ ] **Step 2: Test SSE delivery**

  1. On Browser A (sender): share a folder with Browser B.
  2. On Browser B (recipient): the folder should appear in the sidebar within 1–2 seconds without reload.
  3. On Browser A: delete a file from the shared folder.
  4. On Browser B: the file should disappear from the sidebar without reload.

- [ ] **Step 3: Commit**

  ```bash
  git add web/src/app/page.tsx
  git commit -m "feat: handle file_shared, folder_shared, file_access_revoked SSE events"
  ```

---

## Task 6: Frontend — Sidebar Live-Sharing Indicator and Management

**Files:**
- Modify: `web/src/components/Layout/Sidebar.tsx` (FolderItem component)

- [ ] **Step 1: Add Users icon import**

  At the top of `Sidebar.tsx`, ensure `Users` is imported from `lucide-react`:
  ```typescript
  import { ..., Users } from 'lucide-react';
  ```

- [ ] **Step 2: Add live-sharing indicator to FolderItem**

  In `FolderItem`, after the folder name span, conditionally render the indicator:
  ```tsx
  {(folder as any).has_live_sharing && (
      <Users size={11} className="shrink-0 text-indigo-400 ml-1" />
  )}
  ```
  The `has_live_sharing` boolean should be set on folders returned by `GET /api/v1/folders/{id}/sharing` when records exist. Alternatively, add it as a field on the folder metadata (set by the backend when a live-sharing record exists).

- [ ] **Step 3: Add "Teilen verwalten" to folder context menu**

  In `Sidebar.tsx`, find the folder context menu items. Add:
  ```tsx
  {contextMenu.type === 'folder' && (
      // existing items...
      <button
          onClick={() => {
              setManageSharingFolderId(contextMenu.id);
              setContextMenu(null);
          }}
          className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
      >
          Teilen verwalten
      </button>
  )}
  ```
  `setManageSharingFolderId` is new state in the sidebar or parent component — see next step.

- [ ] **Step 4: Create ManageSharingModal component**

  Create `web/src/components/ManageSharingModal.tsx`:
  ```tsx
  "use client";
  
  import { useEffect, useState } from 'react';
  import { X, Trash2 } from 'lucide-react';
  import { apiFetch } from '@/lib/api';
  import { revokeFolderSharing, FolderSharingRecord } from '@/lib/folderShareLogic';
  
  interface Props {
      folderId: string;
      onClose: () => void;
  }
  
  export default function ManageSharingModal({ folderId, onClose }: Props) {
      const [records, setRecords] = useState<(FolderSharingRecord & { email?: string })[]>([]);
      const [loading, setLoading] = useState(true);
  
      useEffect(() => {
          apiFetch(`/api/v1/folders/${folderId}/sharing`)
              .then(r => r.json())
              .then(setRecords)
              .finally(() => setLoading(false));
      }, [folderId]);
  
      const handleRevoke = async (userId: string) => {
          await revokeFolderSharing(folderId, userId);
          setRecords(prev => prev.filter(r => r.user_id !== userId));
      };
  
      return (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
                  <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Teilen verwalten</h2>
                      <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
                  </div>
                  {loading ? (
                      <p className="text-sm text-gray-400">Lade...</p>
                  ) : records.length === 0 ? (
                      <p className="text-sm text-gray-400">Dieser Ordner wird mit niemandem geteilt.</p>
                  ) : (
                      <ul className="space-y-2">
                          {records.map(r => (
                              <li key={r.user_id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                  <div>
                                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.email || r.user_id}</p>
                                      <p className="text-xs text-gray-400">{r.permission} · {r.share_type}</p>
                                  </div>
                                  <button onClick={() => handleRevoke(r.user_id)}>
                                      <Trash2 size={14} className="text-red-400 hover:text-red-600" />
                                  </button>
                              </li>
                          ))}
                      </ul>
                  )}
              </div>
          </div>
      );
  }
  ```

- [ ] **Step 5: Wire ManageSharingModal in page.tsx**

  In `page.tsx`, add state:
  ```typescript
  const [manageSharingFolderId, setManageSharingFolderId] = useState<string | null>(null);
  ```

  And render the modal:
  ```tsx
  {manageSharingFolderId && (
      <ManageSharingModal
          folderId={manageSharingFolderId}
          onClose={() => setManageSharingFolderId(null)}
      />
  )}
  ```

  Pass `setManageSharingFolderId` down to the Sidebar via a new prop `onManageSharing`.

- [ ] **Step 6: Commit**

  ```bash
  git add web/src/components/Layout/Sidebar.tsx web/src/components/ManageSharingModal.tsx web/src/app/page.tsx
  git commit -m "feat: sidebar live-sharing indicator and manage-sharing modal for folders"
  ```
