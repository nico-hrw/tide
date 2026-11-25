# Vault export (`tide-vault-export`, version 1)

Full export of everything the signed-in user owns, built in the browser by `src/lib/vaultExport/exportVault.ts`
(Settings > Account > "Alle Daten exportieren"). The archive is a stored ZIP (`zip.ts`, CRC-checked). It contains
**plaintext**; the UI and `LIESMICH.txt` say so.

```
manifest.json        format, version, counts per file type, assetCount, taskCount, skipped[],
                     failures[] (loss), warnings[] (partial), notices[] (info), summary[], unassignedAssets[]
tree.json            { files: VaultFileRecord[] }  old id, type, parentId, title, publicMeta, metadata, securedMeta,
                     securedMetaRaw?, contentPath, rawContentPath?, ydocPath, role?/helperFor?, assets[] (see types.ts)
tasks.json           all todos as held in the store
content/<id>.json    decrypted file blob (editor JSON, event body, sidecar JSON)
content/<id>.txt     the blob exactly as stored when it is not JSON (Markdown of API notes, raw fallback)
ydoc/<id>.bin        decrypted Yjs state (snapshot + WAL merged): images (`assets` map), `canvas`, `overlay`
assets/<assetId>.*   decrypted original images (also old V1 images and unassigned ones)
lesbar/              read-only extras: notes as Markdown in folder structure, kalender.ics, todos.md, PROBLEME.txt
LIESMICH.txt
```

## Read paths (same as the app, `exportFile.ts` / `readFile.ts`)

| File | How the app opens it | Export |
|------|----------------------|--------|
| `visibility: public` or `metadata.unencrypted` (external API / MCP notes and events, old style sidecars) | blob is plain text, live doc key `derivePublicNoteDEK(id)` | raw text; notes also converted with `markdownToTipTap` like `parseUnencryptedNoteContent` |
| version < 2 (V1) | `secured_meta` = RSA({title, fileKey JWK, iv}), blob AES with that key | read the same way; `fileKey`/`iv` are stripped from `securedMeta` |
| V2 | DEK from `access_keys[myId]`, else any other entry (the app falls back to the first; events saved without a session id used the key `""`) | same order; entries wrapped for another key fail |
| `secured_meta` | AES with the DEK ({data, iv}) first, then RSA for the owner | same; if both fail the value is kept as `securedMetaRaw` |
| Events | the calendar reads plain `metadata` (title, start, end, allDay, recurrence_rule, recurrence_end, exdates, removed_dates, groupIds, color, description, location); the blob only repeats title/description | an event without blob or key is complete from `metadata` |
| Old canvas images | element with `blobId` + `encryptedKey` (RSA({fileKey, iv})) + `iv`, no `bek` (CanvasImageWidget legacy path) | read via the element key or the image file's own `secured_meta`; attached to the note (`legacy: true`) |
| `.canvas-img-*` V1 files | old image upload stored as a file | exported as an image, not as a note |
| `.<noteId>_style` sidecars | old canvas style file (public, plain JSON `{elements, strokes}`), migrated into `overlay` when that is empty | `role: 'helper'`; their old images belong to the note |

## Issues (`issues.ts`)

Every problem has a `kind` and a `severity`:

- `loss` (manifest `failures`): content really missing: `content-unreadable`, `no-access-key`, `custom-password` (real
  second password wrap), `v1-unreadable`, `ydoc-unreadable`, `asset-missing` (image file gone, the server answers 403/404),
  `asset-unreadable`.
- `partial` (`warnings`): the item is in the archive, an extra detail is missing or raw: `meta-unreadable`
  (`securedMetaRaw` kept, plain title used), `event-details-unreadable` (blob not readable, all plain fields exported),
  `raw-text`.
- `info` (`notices`): no loss: `plaintext-event`, `plaintext-note`, `helper-file`, `legacy-format`, `unassigned-asset`,
  `orphan-asset` (no reference and no key anywhere), `pin-skipped`.

`summary` groups them per kind (count, count per file type, up to 10 titles), worst first; the same text is written to
`lesbar/PROBLEME.txt`. Error texts are never empty (WebCrypto `OperationError` has no message; it is spelled out).

## PIN-locked files

Files with `metadata.has_custom_password` are **not** exported by default, even when the PIN is only a UI lock (the
archive would remove the protection). The settings card counts them (`countPinProtected`) and offers an opt-in
(`exportVault(onProgress, { includePinProtected: true })`, off by default, second click to confirm). Left out, they
appear as `pin-skipped` notices (their images and old style sidecar too) and the importer lists them as not imported.
With the opt-in, a file with a real second wrap (`pwd_iv` or a non-32-byte inner key) stays unreadable (`custom-password`).

## Rules

- Only owned files are exported. Files shared with the user are listed in `manifest.skipped`.
- Events without a stored blob (todo calendar entries, API events) are complete without content; for notes a missing
  blob is a failure. The app-internal `index` file is skipped (rebuilt by the app).
- Nothing is dropped silently: see Issues.
- Image keys (`bek`) live inside `ydoc/<id>.bin`; an importer must re-encrypt each asset with a new key and rewrite
  the `assets` map and every reference through its old-id to new-id table.
- `kalender.ics`: RRULE (+ `recurrence_end` as UNTIL), `removed_dates` as EXDATE, cancelled occurrences (`exdates`) as
  overrides with STATUS:CANCELLED, tags as CATEGORIES, exclusive all-day DTEND. Plain `metadata` wins over the blob.
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
   snapshot via `/compact`. Old image elements (`encryptedKey`) get the new `bek`. An old style sidecar is merged into
   the note's `overlay` when that is empty (same rule as `useStyleFile`), it is not created as a note.
4. `has_custom_password`, `pwd_salt` and `unencrypted` are removed from metadata (imported copies are always encrypted).
   Events without `contentPath` get a body `{title}`; all their fields come from `metadata`.
5. All writes are strict (`importRemote.ts`): retried, errors recorded per item, abort after 5 failures in a row.
   The store's `createNote`/`addTask` are not used because they fall back to local-only items on server errors.
6. A journal in localStorage (`tide_vault_import:<user>:<exportedAt>`) makes a rerun continue instead of duplicating.
7. Verification: every created id must be listed by the server (files, events, todos); the report shows failures and
   missing items. `exportFailures` counts only `failures` (loss). A clean run clears the journal.

Not imported: `views`, `variables`, `calendar_shares`, `index` and other helper files, style sidecars (merged),
PIN-skipped notes, `unassignedAssets` (they stay in `assets/`). Public links come back private.

## Not included

Shares and contacts (keys differ per account), files owned by others, sessions and keys. Importing into a non-empty
account works but can duplicate tags with the same name.
