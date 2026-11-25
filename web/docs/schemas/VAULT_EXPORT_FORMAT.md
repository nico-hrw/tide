# Vault export (`tide-vault-export`, version 1)

Full export of everything the signed-in user owns, built in the browser by `src/lib/vaultExport/exportVault.ts`
(Settings > Account > "Alle Daten exportieren"). The archive is a stored ZIP (`zip.ts`, CRC-checked). It contains
**plaintext**; the UI and `LIESMICH.txt` say so.

```
manifest.json        format, version, counts per file type, assetCount, taskCount, skipped[], failures[]
tree.json            { files: VaultFileRecord[] }  old id, type, parentId, title, publicMeta, metadata, securedMeta,
                     contentPath, ydocPath, assets[]  (see types.ts)
tasks.json           all todos as held in the store
content/<id>.json    decrypted file blob (editor JSON, event body)
ydoc/<id>.bin        decrypted Yjs state (snapshot + WAL merged): images (`assets` map), `canvas`, `overlay`
assets/<assetId>.*   decrypted original images
lesbar/              read-only extras: notes as Markdown in folder structure, kalender.ics, todos.md
LIESMICH.txt
```

## Rules

- Only owned files are exported. Files shared with the user are listed in `manifest.skipped`.
- Events without a stored blob (the calendar entry of a dated todo, `is_task`) are complete without content; for notes
  a missing blob is a failure. The app-internal `index` file is skipped (rebuilt by the app).
- Nothing is dropped silently: unreadable parts (V1 files, custom-password files, undecryptable CRDT entries,
  missing images) are listed in `manifest.failures` with the part (`meta`, `content`, `ydoc`, `asset`).
- Image keys (`bek`) live inside `ydoc/<id>.bin`; an importer must re-encrypt each asset with a new key and rewrite
  the `assets` map and every reference through its old-id to new-id table.
- Tags are folders with `isGroup`; events use `parentId` for their main tag. Both are kept as raw records.
- The Yjs state is read without the editor provider (`readFile.ts`), so exporting never touches `activeNoteStore`.

## Import (`importVault.ts`)

Settings > Account > "Export einspielen". The archive is validated first (`archive.ts`: format, version, every referenced
path present, manifest counts equal tree counts); nothing is written when that fails.

1. Every file, tag, image and todo gets a new UUID, allocated up front (old id -> new id table, `rewriteIds.ts`).
2. Folders and tags (parent first), then notes/canvas, events, todos. Optional wrapper folder "Import <date>" holds
   everything except tags and events.
3. Per note: file created under the new key, images re-encrypted with fresh keys and uploaded as `canvas-asset`
   children, Yjs state rewritten (asset map, canvas elements, editor attrs, ids in links) and stored as the encrypted
   snapshot via `/compact`.
4. All writes are strict (`importRemote.ts`): retried, errors recorded per item, abort after 5 failures in a row.
   The store's `createNote`/`addTask` are not used because they fall back to local-only items on server errors.
5. A journal in localStorage (`tide_vault_import:<user>:<exportedAt>`) makes a rerun continue instead of duplicating.
6. Verification: every created id must be listed by the server (files, events, todos); the report shows failures and
   missing items. A clean run clears the journal.

Not imported: `views`, `calendar_shares`, `index` and other helper files (listed in the report). Public links come back
private.

## Not included

Shares and contacts (keys differ per account), files owned by others, sessions and keys. Importing into a non-empty
account works but can duplicate tags with the same name.
