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
- Nothing is dropped silently: unreadable parts (V1 files, custom-password files, undecryptable CRDT entries,
  missing images) are listed in `manifest.failures` with the part (`meta`, `content`, `ydoc`, `asset`).
- Image keys (`bek`) live inside `ydoc/<id>.bin`; an importer must re-encrypt each asset with a new key and rewrite
  the `assets` map and every reference through its old-id to new-id table.
- Tags are folders with `isGroup`; events use `parentId` for their main tag. Both are kept as raw records.
- The Yjs state is read without the editor provider (`readFile.ts`), so exporting never touches `activeNoteStore`.

## Not included

Shares and contacts (keys differ per account), files owned by others, sessions and keys. The importer (not built
yet) must run into an empty or explicitly chosen target and verify counts against `manifest.json` afterwards.
