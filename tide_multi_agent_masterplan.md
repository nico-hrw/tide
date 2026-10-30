# MASTER-ORCHESTRIERUNGSPLAN: TIDE E2EE-KOLLABORATION & CRDT-ARCHITEKTUR

**Zielgruppe dieses Dokuments:** KI-Koordinator-Agent (Orchestrator) & spezialisierte Subagenten  
**Zielsystem:** Tide Productivity Platform (`web/` Next.js 16 + TypeScript, `cloud/` Go 1.24 + Chi + SQLite 3)  
**Oberstes Gebot:** Minimale Token-Nutzung pro Subagent durch strikte Datei-Isolation, null Merge-Konflikte und 100 % Einhaltung der globalen Schnittstellenverträge (Contracts).

---

## 0. ANWEISUNGEN FÜR DEN KOORDINATOR-AGENTEN (ORCHESTRATOR)

Du bist der **Lead-Koordinator**. Deine Aufgabe ist es **nicht**, den gesamten Code selbst in einem einzigen riesigen Kontextfenster zu schreiben, sondern die Arbeit in **3 Wellen (Execution Waves)** über insgesamt **10 spezialisierte Subagenten** parallel auszuführen.

### Deine 5 eisernen Koordinations-Regeln:
1. **Kontext-Minimierung (Token-Sparmodus):** Gib einem Subagenten niemals den gesamten Audit-Bericht oder das gesamte Repository! Jeder Subagent erhält bei seinem Start **exakt**:
   - **Sektion 1** dieses Dokuments (*Unveränderliche Globale Contracts*).
   - Seinen **eigenen Subagenten-Block** aus Sektion 2 (z. B. *Subagent 1: DB-SEC-AGENT*).
2. **Strikter File-Lock (Keine Datei-Kollisionen):** Jeder Subagent hat eine fest zugewiesene Liste von Dateien (`Erlaubte Dateien`). Ein Subagent darf **niemals** Dateien außerhalb seiner Liste modifizieren. Dadurch können alle Subagenten innerhalb einer Welle zu 100 % parallel arbeiten, ohne sich gegenseitig zu überschreiben.
3. **Wellen-Synchronisation (DAG-Gates):**
   - Starte **Welle 1 (Subagenten 1 bis 5)** parallel.
   - Warte, bis alle 5 Subagenten fertig sind. Führe einen kurzen Build-/Syntax-Check im Backend (`go build ./...`) aus.
   - Starte erst danach **Welle 2 (Subagenten 6 bis 9)** parallel.
   - Starte zum Schluss **Welle 3 (Subagent 10)** zur Endabnahme.
4. **Verbot von „Quick-Fixes“:** Weise jeden Subagenten an, sich exakt an die kryptografischen und architektonischen Vorgaben zu halten. Eigenmächtige Abkürzungen (wie Klartext-Keys im JSON, `COALESCE(..., 'owner')` oder unverschlüsselte WebSocket-Payloads) führen zum sofortigen Abbruch.
5. **Subagenten-Antwortformat:** Verlange von jedem Subagenten am Ende seiner Arbeit nur eine kompakte Zusammenfassung (max. 15 Zeilen): *Geänderte Dateien, gelöste Bug-IDs, Status der Abnahmekriterien*.

---

## 1. UNVERÄNDERLICHE GLOBALE CONTRACTS (FÜR ALLE SUBAGENTEN VERBINDLICH)

> **WICHTIG FÜR KOORDINATOR:** Kopiere diese Sektion 1 in den System-Prompt **jedes** Subagenten, damit Backend (Go) und Frontend (TypeScript) exakt dasselbe Binärprotokoll, Datenbankschema und JSON-Format sprechen!

### Contract 1.1: Das Binäre E2EE-WebSocket-Framing-Protokoll
Standard-`y-websocket` überträgt Daten im Klartext. Um Zero-Knowledge (E2EE) zu wahren und dem Go-Server dennoch zu erlauben, Schreibzugriffe von `view`-Nutzern zu blockieren sowie flüchtige Cursor-Daten von persistenten Dokument-Updates zu unterscheiden, nutzt Tide folgendes Binär-Frame-Format über WebSockets (`/api/ws/notes/{id}`):

$$\text{Frame} = \underbrace{\text{MsgType}}_{1\text{ Byte}} \parallel \underbrace{\text{KeyEpoch}}_{4\text{ Bytes (Big Endian uint32)}} \parallel \underbrace{\text{IV}}_{12\text{ Bytes}} \parallel \underbrace{\text{Ciphertext + GCM-Tag}}_{N\text{ Bytes}}$$

* **Gesamtlänge des unverschlüsselten Headers:** $1 + 4 + 12 = 17\text{ Bytes}$ (Minimale gültige Paketgröße für `0x01` und `0x02` ist $17 + 16\text{ (GCM-Tag)} = 33\text{ Bytes}$).
* **`MsgType` (Byte 0):**
  * `0x01` (`FrameTypeCRDTUpdate`): Verschlüsseltes Yjs-Dokument-Update oder Sync-Step. **Muss** vom Go-Server für `permission == "view"` verworfen werden! **Muss** vom Go-Server sofort in SQLite (`yjs_wal`) gespeichert werden!
  * `0x02` (`FrameTypeAwareness`): Verschlüsseltes Yjs-Awareness-/Cursor-Update. Erlaubt für alle Rollen (`owner`, `share`, `edit`, `view`). Wird vom Go-Server **nur im RAM** an andere Clients im Raum weitergeleitet und **niemals** in SQLite gespeichert!
  * `0x03` (`FrameTypeControl`): Unverschlüsselte JSON-Steuernachricht zwischen Server und Client (Format nach Byte 0: UTF-8 JSON-Bytes).
    * Server $\rightarrow$ Client JSON-Struktur:
      ```json
      {
        "action": "ROLE_CHANGED" | "REVOKED" | "KEY_ROTATED" | "COMPACT_REQUEST" | "PEER_LEFT",
        "permission": "edit" | "view" | "share",
        "keyEpoch": 2,
        "yClientId": 12345678
      }
      ```
* **Additional Authenticated Data (AAD) für AES-256-GCM (`0x01` & `0x02`):**
  Damit weder ein Angreifer noch der Server den Header manipulieren oder Pakete zwischen Notizen vertauschen kann, wird der ASCII-String der `fileID` verkettet mit den ersten 5 Bytes des Frames (`MsgType` + `KeyEpoch`) als AAD in `crypto.subtle.encrypt` und `crypto.subtle.decrypt` übergeben:
  $$\text{AAD} = \text{UTF8Encode}(\text{fileID}) \parallel \text{Frame}[0..5]$$

---

### Contract 1.2: Die Einheitliche `Y.Doc`-Struktur & Zweistufige Schlüsselhierarchie ($\text{DEK} \rightarrow \text{BEK}$)
Der periodische REST-JSON-Autosave (`PUT /api/files/:id` über `useAutoSaveSync`) und die `.{noteId}_style`-Sidecar-Dateien entfallen als Synchronisationsmechanismus. Jede Notiz wird durch **ein einziges `Y.Doc`** repräsentiert:

1. **`ydoc.getXmlFragment('prosemirror')`**: Enthält den TipTap-Rich-Text.
2. **`ydoc.getMap('canvas')`**: Enthält für Standalone-Canvas-Notizen für jedes Element eine verschachtelte `Y.Map` (`key = item.id`). Attribute in der inneren `Y.Map`: `id`, `type`, `x`, `y`, `width`, `height`, `rotation`, `color`, `strokeWidth`, `assetId`, sowie `text` (als `Y.Text`).
3. **`ydoc.getMap('overlay')`**: Enthält die Freihand-Zeichnungen und Formen des `CanvasLayer` (ersetzt `.{noteId}_style`). Jedes gezeichnete Element ist eine `Y.Map` mit `id`, `points`, `color`, `size`, `tool`.
4. **`ydoc.getMap('assets')`**: Speichert die Entschlüsselungsinformationen für alle in der Notiz oder auf dem Canvas verwendeten Bilder/Medien-Blobs (`key = assetId`).
   * Wert-Format in `ydoc.getMap('assets').get(assetId)`:
     ```typescript
     interface AssetKeyRecord {
       assetId: string;
       bekBase64: string; // 32 Bytes (256-bit AES-GCM Key), Base64-kodiert
       ivBase64: string;  // 12 Bytes IV des Blobs, Base64-kodiert
       mimeType: string;
     }
     ```
   * **Warum $\text{BEK}$ (Blob Encryption Key) in `ydoc`?** Das `Y.Doc` selbst ist bereits mit dem Notiz-$\text{DEK}$ verschlüsselt. Jedes Bild wird beim Upload mit einem eigenen zufälligen $\text{BEK} \xleftarrow{\$} \{0,1\}^{256}$ verschlüsselt. Bei einer Rotation des Notiz-$\text{DEK}$ (wenn ein Nutzer entfernt wird) muss nur das `Y.Doc` neu verschlüsselt werden, **niemals** die großen Medien-Blobs auf der Festplatte!

---

### Contract 1.3: SQLite-Datenbankschema & REST-Verträge

#### Erweiterung der Tabelle `files`:
```sql
-- Neue Spalten in Tabelle `files` (per Migration falls noch nicht vorhanden):
ALTER TABLE files ADD COLUMN parent_file_id TEXT REFERENCES files(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN key_epoch INTEGER NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN snapshot_seq_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN snapshot_iv BLOB;
-- Der kompaktierte Yjs-Base-Snapshot liegt im bestehenden Blob/Content-Feld von `files`.
```

#### Neue Tabelle `yjs_wal` (Write-Ahead-Log für E2EE-CRDT-Deltas):
```sql
CREATE TABLE IF NOT EXISTS yjs_wal (
    seq_id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL,
    key_epoch INTEGER NOT NULL,
    iv BLOB NOT NULL,
    ciphertext BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_yjs_wal_file_seq ON yjs_wal(file_id, seq_id);
```

#### Neue / Aktualisierte REST-Endpunkte:
1. **`GET /api/files/:id/crdt-state`**:
   Liefert den aktuellen Base-Snapshot plus alle seitdem aufgelaufenen WAL-Einträge (`seq_id > snapshot_seq_id`):
   ```json
   {
     "fileId": "uuid",
     "permission": "owner" | "share" | "edit" | "view",
     "keyEpoch": 1,
     "accessKeys": { "user_id": { "enc_dek": "...", "iv": "..." } },
     "securedMeta": "...",
     "snapshot": {
       "seqId": 142,
       "keyEpoch": 1,
       "ivBase64": "...",
       "ciphertextBase64": "..."
     },
     "wal": [
       { "seqId": 143, "keyEpoch": 1, "ivBase64": "...", "ciphertextBase64": "..." }
     ]
   }
   ```
2. **`POST /api/files/:id/compact`** (Nur `owner`, `share`, `edit`):
   Nimmt einen vom Client kompaktierten Yjs-Zustand (`Y.encodeStateAsUpdate(ydoc)`) entgegen und löscht atomar alle WAL-Einträge mit `seq_id <= upToSeqId`.
   * Request:
     ```json
     {
       "upToSeqId": 180,
       "keyEpoch": 1,
       "ivBase64": "...",
       "ciphertextBase64": "..."
     }
     ```
3. **`POST /api/files/:id/revoke-and-rotate`** (Nur `owner`):
   Entfernt `targetUserId` aus `file_shares`, inkrementiert `key_epoch`, ersetzt `access_keys` durch die neu verpackten $\text{DEK}_{\text{neu}}$-Einträge der verbleibenden Nutzer, speichert den mit $\text{DEK}_{\text{neu}}$ verschlüsselten Base-Snapshot, löscht alle alten `yjs_wal`-Einträge dieser Datei und wirft den entfernten Nutzer live aus dem WebSocket-Raum.
   * Request:
     ```json
     {
       "targetUserId": "usr_b",
       "newKeyEpoch": 2,
       "newAccessKeys": { "usr_owner": { "enc_dek": "...", "iv": "..." } },
       "newSecuredMeta": "...",
       "snapshot": {
         "ivBase64": "...",
         "ciphertextBase64": "..."
       }
     }
     ```

---

## 2. AUSFÜHRUNGS-WELLEN & SUBAGENTEN-AUFTRÄGE

---

# WELLE 1: BACKEND-FUNDAMENT, SQL-SICHERHEIT & KRYPTO-PRIMITIVE
*(Koordinator: Starte Subagent 1, 2, 3, 4 und 5 gleichzeitig!)*

---

### SUBAGENT 1: `DB-SEC-AGENT` (SQLite Store, Berechtigungen & WAL-Persistenz)

* **Erlaubte Dateien (Strict File Lock):**
  * `cloud/internal/store/sqlite.go`
  * (Falls separate Store-Interfaces existieren: `cloud/internal/store/store.go`)
* **Zu lösende Audit-Bugs:** `BUG-02` (Privilege Escalation nach Revoke), `BUG-05` (Pre-Acceptance Exfiltration), `BUG-08` (Teil 1: SQLite WAL-Persistenz), `BUG-17` (Child Asset 403 Forbidden).

#### Aufgaben & Exakte Vorgaben:
1. **Schema-Migration beim Start (`Init` / `Migrate` in `sqlite.go`):**
   * Füge die Tabelle `yjs_wal` gemäß *Contract 1.3* hinzu.
   * Füge (idempotent, d. h. Fehler bei „duplicate column name“ ignorieren oder via `PRAGMA table_info(files)` prüfen) die Spalten `parent_file_id TEXT`, `key_epoch INTEGER NOT NULL DEFAULT 1`, `snapshot_seq_id INTEGER NOT NULL DEFAULT 0` und `snapshot_iv BLOB` zur Tabelle `files` hinzu.
2. **Fix von `GetAccessibleFile` (`BUG-02`, `BUG-05`, `BUG-17`):**
   * Entferne das lebensgefährliche `COALESCE(fs.permission, 'owner')` und entferne `OR f.access_keys LIKE ...` aus der `WHERE`-Klausel!
   * Implementiere die Berechtigungsabfrage so, dass:
     1. `file_shares` **nur** gejoint wird, wenn `fs.status = 'accepted'` ist (`BUG-05`).
     2. Falls `f.parent_file_id IS NOT NULL` (z. B. bei `canvas-asset` oder Medien-Anhängen), werden `owner_id` und `file_shares` auch über die Eltern-Datei (`parent`) geprüft (`BUG-17`).
     3. Die Rolle wird strikt über ein `CASE`-Statement ermittelt:
        ```sql
        CASE 
            WHEN f.owner_id = ? OR parent.owner_id = ? THEN 'owner'
            WHEN fs.status = 'accepted' AND fs.permission IN ('share', 'edit', 'view') THEN fs.permission
            ELSE ''
        END AS permission
        ```
     4. Falls `permission == ""` ist, gib `sql.ErrNoRows` (bzw. `ErrForbidden`) zurück.
3. **Helper-Methoden für Rollenprüfung bereitstellen:**
   * Implementiere auf dem File/Permission-Model oder Store klare Helper:
     * `CanRead(perm string) bool` (`owner`, `share`, `edit`, `view`)
     * `CanWrite(perm string) bool` (`owner`, `share`, `edit`)
     * `CanAdmin(perm string) bool` (`owner`)
4. **CRDT-WAL & Compaction Store-Methoden implementieren:**
   * `AppendYjsWAL(ctx, fileID string, keyEpoch uint32, iv, ciphertext []byte) (int64, error)`: Fügt einen neuen Datensatz in `yjs_wal` ein und gibt die generierte `seq_id` zurück.
   * `GetCRDTState(ctx, fileID, userID string) (*CRDTStateResponse, error)`: Prüft zuerst `GetAccessibleFile`, lädt dann den Base-Snapshot aus `files` sowie alle Einträge aus `yjs_wal WHERE file_id = ? AND seq_id > files.snapshot_seq_id ORDER BY seq_id ASC`.
   * `CompactYjsWAL(ctx, fileID string, upToSeqID int64, keyEpoch uint32, iv, ciphertext []byte) error`: Aktualisiert in einer SQL-Transaktion (`BeginTx`) den Base-Snapshot in `files` (`snapshot_seq_id = upToSeqID`, `key_epoch = keyEpoch`, `snapshot_iv = iv`, `content = ciphertext`, `version = version + 1`) **nur wenn** `upToSeqID >= snapshot_seq_id` ist, und führt `DELETE FROM yjs_wal WHERE file_id = ? AND seq_id <= ?` aus.
   * `RevokeShareAndRotateKey(ctx, fileID, targetUserID string, newKeyEpoch uint32, newAccessKeysJSON, newSecuredMeta string, snapshotIV, snapshotCiphertext []byte) error`: Führt in einer einzigen SQL-Transaktion aus:
     1. `DELETE FROM file_shares WHERE file_id = ? AND user_id = ?`
     2. `DELETE FROM yjs_wal WHERE file_id = ?`
     3. `UPDATE files SET key_epoch = ?, access_keys = ?, secured_meta = ?, snapshot_iv = ?, snapshot_seq_id = 0, version = version + 1 WHERE id = ?` (plus Speichern des neuen Snapshot-Ciphertexts).

#### Verbotene Anti-Patterns:
* Niemals `COALESCE(fs.permission, 'owner')` verwenden!
* Niemals Shares mit `status = 'pending'` als zugriffsberechtigt für Datei-Inhalte durchlassen (für die Inbox gibt es die separate `ListPendingShares`-Abfrage).

#### Abnahmekriterien:
* `go build ./internal/store/...` kompiliert fehlerfrei.
* Ein widerrufener Nutzer erhält bei `GetAccessibleFile` sofort einen Fehler statt `'owner'`.

---

### SUBAGENT 2: `API-SEC-AGENT` (REST-Endpunkte, Auth-Guards & Media-Uploads)

* **Erlaubte Dateien (Strict File Lock):**
  * `cloud/internal/api/files.go`
  * `cloud/internal/api/links.go`
  * `cloud/internal/store/blob.go`
* **Zu lösende Audit-Bugs:** `BUG-03` (Backup Overwrite durch Viewers), `BUG-04` (Unauthenticated Link Graph), `BUG-06` (Media Upload 403 für Editoren), sowie Punkt 7.6 (Orphaned Blobs GC).

#### Aufgaben & Exakte Vorgaben:
1. **Fix `BUG-04` in `cloud/internal/api/links.go`:**
   * Stelle sicher, dass `/links/graph` (und alle anderen Routen in `links.go`) zwingend innerhalb der `s.authMiddleware`-Gruppe liegen.
   * Stelle sicher, dass der Handler `userID` aus dem Request-Context ausliest und nur Links für Dateien zurückgibt, auf die `userID` Lesezugriff hat.
2. **Fix `BUG-03` in `cloud/internal/api/files.go` (Backup-Handler):**
   * Ersetze in allen Backup-Erstellungs- und Restore-Handlern (`RestoreBackupHandler` etc.) den einfachen Aufruf `UserHasFileAccess` durch `file, err := s.store.GetAccessibleFile(ctx, fileID, userID)` und prüfe explizit:
     ```go
     if !store.CanWrite(file.Permission) {
         http.Error(w, "Forbidden: write permission required", http.StatusForbidden)
         return
     }
     ```
3. **Fix `BUG-06` in `cloud/internal/api/files.go` (Media/Attachment Upload):**
   * Entferne in `UploadFileMediaHandler` (und beim Erstellen von `canvas-asset`-Dateien) die Prüfung `if file.OwnerID != currentUserID`.
   * Prüfe stattdessen über `GetAccessibleFile` auf die Eltern-Notiz (`parent_file_id`), ob `store.CanWrite(parentFile.Permission)` wahr ist (`owner`, `share` oder `edit`).
   * Speichere beim Anlegen des Asset-Datensatzes zwingend `parent_file_id = parentNoteID` in der `files`-Tabelle, damit die Berechtigungsvererbung aus Subagent 1 greift!
4. **Neue Endpunkte gemäß Contract 1.3 in `files.go` registrieren & implementieren:**
   * `GET /api/files/{id}/crdt-state` $\rightarrow$ ruft `s.store.GetCRDTState` auf.
   * `POST /api/files/{id}/compact` $\rightarrow$ prüft `CanWrite(file.Permission)`, ruft `s.store.CompactYjsWAL` auf.
   * `POST /api/files/{id}/revoke-and-rotate` $\rightarrow$ prüft `file.Permission == "owner"`, ruft `s.store.RevokeShareAndRotateKey` auf und benachrichtigt den WebSocket-Hub via `s.hub.EnforcePermissionChange(fileID, req.TargetUserID, "revoked")` sowie `s.hub.BroadcastKeyRotation(fileID, req.NewKeyEpoch)`.
   * Wenn die Rolle eines bestehenden Shares geändert wird (`PATCH /api/files/{id}/shares/{shareId}`), rufe `s.hub.EnforcePermissionChange(fileID, targetUserID, newPermission)` auf.
5. **Blob Garbage Collection beim Löschen (`files.go` & `blob.go`):**
   * Wenn `DELETE /api/files/{assetId}` aufgerufen wird (erlaubt für `CanWrite` auf der Parent-Note), lösche den Datenbankeintrag und prüfe in SQLite, ob noch irgendeine andere Zeile in `files` denselben `blob_hash` referenziert (`SELECT COUNT(1) FROM files WHERE blob_hash = ?`). Falls der Zähler `0` ist, lösche die physische Chiffrat-Datei im CAS-Blobstore (`blob.go`).

#### Abnahmekriterien:
* `BUG-03`, `BUG-04` und `BUG-06` sind geschlossen.
* Die neuen Endpunkte `/crdt-state`, `/compact` und `/revoke-and-rotate` sind im Chi-Router hinter `authMiddleware` registriert.

---

### SUBAGENT 3: `WS-HUB-AGENT` (Go WebSocket Hub, E2EE-Frame-Filterung & Live-Eviction)

* **Erlaubte Dateien (Strict File Lock):**
  * `cloud/internal/api/websocket.go`
* **Zu lösende Audit-Bugs:** `BUG-01` (Viewer Yjs Hijacking), `BUG-07` (100-Nachrichten-Guillotine), `BUG-08` (Volatile Room Teardown), sowie Kapitel 5.2.1 (Ghost-Cursor bei Disconnect).

#### Aufgaben & Exakte Vorgaben:
1. **Implementierung des Binären E2EE-Frame-Protokolls (*Contract 1.1*):**
   * Definiere die Konstanten:
     ```go
     const (
         FrameTypeCRDTUpdate byte = 0x01
         FrameTypeAwareness  byte = 0x02
         FrameTypeControl    byte = 0x03
         MinEncryptedFrameLen     = 1 + 4 + 12 + 16 // 33 Bytes
     )
     ```
   * Beim WebSocket-Handshake (`ServeWs`) wird `yClientId` optional aus dem Query-Parameter `?yClientId=...` gelesen und in `ClientSession.yClientID` gespeichert.
   * Lade die Berechtigung über `file, err := s.store.GetAccessibleFile(r.Context(), fileID, userID)` und speichere `file.Permission` thread-safe (geschützt durch ein `sync.RWMutex` auf `ClientSession`) in der Session.
2. **Strikte Nachrichten-Inspektion in `readPump` (`BUG-01`, `BUG-07`, `BUG-08`):**
   * Lies jedes binäre WebSocket-Paket `payload`:
   * Falls `len(payload) < 1`: verwerfen.
   * `msgType := payload[0]`
   * **Fall A: `msgType == FrameTypeCRDTUpdate` (`0x01`):**
     1. Prüfe `if len(payload) < MinEncryptedFrameLen`: verwerfen.
     2. **Security-Gate (`BUG-01`):** Prüfe `if !store.CanWrite(c.getPermission())`. Wenn der Client nur `view`-Rechte hat, logge eine Sicherheitswarnung und **verwirf das Paket sofort** (`continue`)!
     3. Extrahiere `keyEpoch := binary.BigEndian.Uint32(payload[1:5])`, `iv := payload[5:17]`, `ciphertext := payload[17:]`.
     4. **Sofortige SQLite-WAL-Persistenz (`BUG-08`):** Rufe `seqID, err := s.store.AppendYjsWAL(ctx, c.roomID, keyEpoch, iv, ciphertext)` auf.
     5. **Kein 100-Nachrichten-Ringpuffer mehr (`BUG-07`):** Entferne `room.history` komplett! Da jedes `0x01`-Update in `yjs_wal` steht und neue Clients über `GET /api/files/:id/crdt-state` initialisieren, gehen niemals Updates durch Cursor-Floods verloren.
     6. Broadcaste `payload` an alle anderen Clients im Raum.
     7. Falls die Anzahl der WAL-Einträge seit dem letzten Snapshot ein Vielfaches von 50 erreicht (`seqID % 50 == 0`), sende ein `FrameTypeControl`-Paket (`{"action":"COMPACT_REQUEST"}`) an den aktuellen Sender `c`.
     8. Feuere gedrosselt (max. 1x alle 5 Sekunden pro Raum) ein globales SSE-Event `NOTE_ACTIVITY_PULSE` und `NOTE_WAL_APPENDED`, damit Nutzer außerhalb der Notiz Live-Indikatoren und Background-Syncs erhalten.
   * **Fall B: `msgType == FrameTypeAwareness` (`0x02`):**
     1. Erlaubt für alle Berechtigungsstufen (auch `view`).
     2. Wird **nicht** in SQLite gespeichert, sondern nur direkt im RAM an alle anderen Clients in `room.clients` weitergeleitet.
3. **Live-Rechteverwaltung & Sofortige Ghost-Cursor-Entfernung:**
   * Implementiere auf dem Hub:
     * `EnforcePermissionChange(fileID, targetUserID, newPermission string)`:
       * Wenn `newPermission == "revoked"` oder `""`: Sende `FrameTypeControl` mit `{"action":"REVOKED"}` an den betroffenen Client, schließe seine Connection und broadcaste an alle verbleibenden Clients im Raum ein `FrameTypeControl` mit `{"action":"PEER_LEFT","yClientId": client.yClientID}`.
       * Wenn `newPermission` z. B. von `"edit"` auf `"view"` wechselt: Aktualisiere `client.setPermission(newPermission)` im laufenden Betrieb und sende `FrameTypeControl` mit `{"action":"ROLE_CHANGED","permission":newPermission}`.
     * `BroadcastKeyRotation(fileID string, newKeyEpoch uint32)`: Sendet `FrameTypeControl` mit `{"action":"KEY_ROTATED","keyEpoch":newKeyEpoch}` an alle verbleibenden Raum-Teilnehmer.
4. **Heartbeat & Disconnect-Cleanup (Ghost-Cursor Fix):**
   * Sende in `writePump` alle 15 Sekunden einen WebSocket `PingMessage` und setze in `readPump` ein `SetReadDeadline` von 30 Sekunden (erneuert im `PongHandler`).
   * Sobald `readPump` beendet wird (`defer`), sende automatisch das Control-Frame `{"action":"PEER_LEFT","yClientId": c.yClientID}` an alle anderen Clients im Raum, damit deren UI den fremden Cursor in **0 Millisekunden** entfernt (statt 30 Sekunden zu warten).

#### Abnahmekriterien:
* Kein `room.history`-Ringpuffer mehr vorhanden.
* Ein Viewer kann keine `0x01`-Frames durch den Hub schleusen.
* Schließt ein Nutzer den Tab, erhalten alle anderen sofort `PEER_LEFT`.

---

### SUBAGENT 4: `CRYPTO-FRAME-AGENT` (Frontend E2EE-Framing, AAD & Asset-BEK-Krypto)

* **Erlaubte Dateien (Strict File Lock):**
  * `web/src/lib/crypto.ts`
  * `web/src/lib/e2eeFraming.ts` *(Neu erstellen)*
  * `web/src/lib/assetCrypto.ts` *(Neu erstellen)*
* **Zu lösende Audit-Bugs:** Kryptografische Grundlage für `BUG-01`, `BUG-18`, `BUG-19` und Kapitel 2.3 (DEK-Rotation).

#### Aufgaben & Exakte Vorgaben:
1. **Erstelle `web/src/lib/e2eeFraming.ts` (*Contract 1.1*):**
   * Implementiere den Encoder und Decoder für das binäre WebSocket-Protokoll:
     ```typescript
     export const FRAME_TYPE_CRDT = 0x01;
     export const FRAME_TYPE_AWARENESS = 0x02;
     export const FRAME_TYPE_CONTROL = 0x03;

     export function buildFrameAAD(fileId: string, msgType: number, keyEpoch: number): Uint8Array {
       const fileIdBytes = new TextEncoder().encode(fileId);
       const aad = new Uint8Array(fileIdBytes.length + 5);
       aad.set(fileIdBytes, 0);
       aad[fileIdBytes.length] = msgType;
       const view = new DataView(aad.buffer, aad.byteOffset + fileIdBytes.length + 1, 4);
       view.setUint32(0, keyEpoch, false); // Big Endian
       return aad;
     }

     export async function encryptWSFrame(
       fileId: string,
       msgType: typeof FRAME_TYPE_CRDT | typeof FRAME_TYPE_AWARENESS,
       keyEpoch: number,
       dek: CryptoKey,
       plaintextPayload: Uint8Array
     ): Promise<Uint8Array> {
       const iv = window.crypto.getRandomValues(new Uint8Array(12));
       const aad = buildFrameAAD(fileId, msgType, keyEpoch);
       const ciphertextBuf = await window.crypto.subtle.encrypt(
         { name: 'AES-GCM', iv, additionalData: aad },
         dek,
         plaintextPayload
       );
       const ciphertext = new Uint8Array(ciphertextBuf);
       const frame = new Uint8Array(17 + ciphertext.length);
       frame[0] = msgType;
       new DataView(frame.buffer, 1, 4).setUint32(0, keyEpoch, false);
       frame.set(iv, 5);
       frame.set(ciphertext, 17);
       return frame;
     }

     export async function decryptWSFrame(
       fileId: string,
       frame: Uint8Array,
       dek: CryptoKey
     ): Promise<{ msgType: number; keyEpoch: number; plaintext: Uint8Array }> {
       if (frame.length < 33) throw new Error('Frame too short');
       const msgType = frame[0];
       const keyEpoch = new DataView(frame.buffer, frame.byteOffset + 1, 4).getUint32(0, false);
       const iv = frame.subarray(5, 17);
       const ciphertext = frame.subarray(17);
       const aad = buildFrameAAD(fileId, msgType, keyEpoch);
       const plainBuf = await window.crypto.subtle.decrypt(
         { name: 'AES-GCM', iv, additionalData: aad },
         dek,
         ciphertext
       );
       return { msgType, keyEpoch, plaintext: new Uint8Array(plainBuf) };
     }
     ```
   * Implementiere zusätzlich Hilfsfunktionen `encryptSnapshot(fileId, keyEpoch, dek, yjsStateUint8Array)` und `decryptSnapshot(...)`, die ebenfalls AAD (`buildFrameAAD(fileId, FRAME_TYPE_CRDT, keyEpoch)`) verwenden, damit WAL-Einträge und Snapshots mit exakt derselben Logik ver- und entschlüsselt werden.
2. **Erstelle `web/src/lib/assetCrypto.ts` (*Contract 1.2* – Löst `BUG-18` & `BUG-19`):**
   * Implementiere die zweistufige Blob-Verschlüsselung über einen pro Bild zufällig erzeugten **Blob Encryption Key ($\text{BEK}$)**:
     * `encryptAssetWithNewBEK(blob: Blob)`: Erzeugt einen zufälligen 256-Bit AES-GCM Key (`bek`), exportiert die 32 Rohbytes als `bekBase64`, erzeugt 12 Bytes `iv` (`ivBase64`), verschlüsselt den Blob und gibt `{ encryptedBlob, bekBase64, ivBase64, mimeType }` zurück.
     * `decryptAssetWithBEK(encryptedBuffer: ArrayBuffer, bekBase64: string, ivBase64: string, mimeType: string)`: Importiert `bekBase64` via `crypto.subtle.importKey('raw', ...)` und entschlüsselt das Bild zu einem `Blob` / `ObjectURL`.
3. **Erweitere `web/src/lib/crypto.ts` um DEK-Rotation-Helper:**
   * Füge eine Funktion `generateAndWrapRotatedDEK(remainingCollaboratorPublicKeys: Record<string, CryptoKey>): Promise<{ newDEK: CryptoKey; wrappedKeys: Record<string, { enc_dek: string; iv: string }> }>` hinzu, die einen neuen 256-Bit AES-GCM $\text{DEK}$ erzeugt und ihn für jeden verbleibenden Teilnehmer per RSA-OAEP verpackt.

#### Abnahmekriterien:
* Kein Klartext-JWK-Export in unverschlüsselten Strukturen (`BUG-19`).
* Alle Funktionen sind streng typisiert (TypeScript) und nutzen ausschließlich native `window.crypto.subtle`-Aufrufe.

---

### SUBAGENT 5: `STATE-STORE-AGENT` (Globaler Realtime-Sync, Background IndexedDB & Sidebar-Präsenz)

* **Erlaubte Dateien (Strict File Lock):**
  * `web/src/hooks/useRealtimeSync.ts`
  * Zustand-Stores unter `web/src/store/` (insb. `activeNoteStore`, `fileTreeStore`, `collaboratorsStore`)
* **Zu lösende Audit-Bugs:** `BUG-12` (Disconnect-Triggered State Annihilation) sowie die Anforderung *„Änderungen sofort an alle übertragen, auch wenn man gar nicht in der Notiz ist“*.

#### Aufgaben & Exakte Vorgaben:
1. **Fix `BUG-12` in `web/src/hooks/useRealtimeSync.ts`:**
   * **Goldene Regel:** Wenn über die SSE-Verbindung (`/api/events`) ein `file_updated`- oder `NOTE_WAL_APPENDED`-Event hereinkommt und `data.fileId === activeNoteStore.getState().currentNoteId` ist, darf **niemals** `reloadFromRemote` auf dem aktiven Editor-Inhalt aufgerufen werden! Der offene Editor synchronisiert seinen Inhalt ausschließlich über das CRDT (`Y.Doc`).
2. **Sofortige Hintergrund-Synchronisation für geschlossene Notizen:**
   * Wenn `data.fileId !== currentNoteId` ist:
     * Bei `NOTE_META_UPDATED` / `file_updated`: Entschlüssele `secured_meta` sofort im Hintergrund und aktualisiere Titel, Icon, Tags und Kalender-Termine im `fileTreeStore`, sodass die Sidebar und das Dashboard sich **live ohne Reload** aktualisieren.
     * Bei `NOTE_WAL_APPENDED`: Lade im Hintergrund (gedrosselt / via `requestIdleCallback`) die neuen Deltas über `GET /api/files/${data.fileId}/crdt-state`, entschlüssele sie mit dem Notiz-DEK und wende sie auf die lokale IndexedDB-Replik des `Y.Doc` an. Aktualisiere den lokalen Suchindex / Preview-Snippet.
3. **Live-Aktivitäts-Indikatoren außerhalb der Notiz:**
   * Verarbeite das SSE-Event `NOTE_ACTIVITY_PULSE` (`{ fileId, activeUsers }`) und speichere in `collaboratorsStore` eine Map `activeUsersByNoteId: Record<string, string[]>`. Damit zeigt die Sidebar neben Notizen, in denen gerade Kommilitonen schreiben, live deren farbige Punkte/Avatare an.
4. **Erweiterung von `activeNoteStore`:**
   * Speichere `keyEpoch: number`, `permission: 'owner' | 'share' | 'edit' | 'view'`, `activeYDoc: Y.Doc | null` und `lastCompactedSeqId: number`.
   * Biete eine Action `setLivePermission(perm)` an, die bei einem WebSocket-Control-Frame (`ROLE_CHANGED`) die Berechtigung sofort reaktiv im gesamten UI umschaltet.

#### Abnahmekriterien:
* Ein kurzer WLAN-/WebSocket-Abbruch löscht niemals ungespeicherte Zeichen im offenen Editor (`BUG-12`).
* Änderungen an geschlossenen Notizen aktualisieren sofort die Sidebar und den lokalen Cache.

---

# WELLE 2: EDITOR, CANVAS, OVERLAY & MEDIA-INTEGRATION
*(Koordinator: Starte Welle 2 erst, wenn alle 5 Subagenten aus Welle 1 fertig sind! Starte Subagent 6, 7, 8 und 9 parallel!)*

---

### SUBAGENT 6: `TIPTAP-CRDT-AGENT` (TipTap-Konfiguration, E2EE-WS-Provider, Carets & Image-Paste)

* **Erlaubte Dateien (Strict File Lock):**
  * `web/src/hooks/useTipTapConfig.ts`
  * `web/src/components/notes/Editor.tsx`
  * `web/src/lib/yjsE2EEProvider.ts` *(Neu erstellen)*
* **Zu lösende Audit-Bugs:** `BUG-09` (Double-Seeding Duplication), `BUG-10` (Hardcoded `clientID = 1`), `BUG-13` (Guest Profile Fallback Race), `BUG-20` (TipTap Paste Black Hole), sowie Kapitel 5.2.3 (`isShared`-Gate).

#### Aufgaben & Exakte Vorgaben:
1. **Erstelle den E2EE-Yjs-WebSocket-Provider (`web/src/lib/yjsE2EEProvider.ts`):**
   * Da Standard-`y-websocket` unverschlüsselt sendet, kapselst du die WebSocket-Verbindung zu `/api/ws/notes/${noteId}?yClientId=${ydoc.clientID}`:
     * **Beim Öffnen (Bootstrap):** Rufe `GET /api/files/${noteId}/crdt-state` auf. Entschlüssele den `snapshot` (falls vorhanden) und alle `wal`-Einträge in aufsteigender Reihenfolge der `seqId` mittels `decryptWSFrame` / `decryptSnapshot` aus `e2eeFraming.ts`. Wende jedes entschlüsselte Uint8Array via `Y.applyUpdate(ydoc, update, 'remote')` an.
     * *(Fallback für Legacy-Notizen vor der Migration)*: Nur wenn `snapshot` leer ist und `wal.length === 0` ist, aber ein alter REST-`initialContent` existiert, initialisiere das `Y.Doc` **einmalig** durch den Owner/Editor und führe sofort einen `/compact`-Call aus.
     * **Bei lokalen Dokument-Änderungen (`ydoc.on('update', (update, origin) => ...)`):** Wenn `origin !== 'remote'` und `permission !== 'view'`, verschlüssele `update` mit `encryptWSFrame(noteId, FRAME_TYPE_CRDT, keyEpoch, dek, update)` und sende es als Binär-Frame über den WebSocket.
     * **Bei lokalen Cursor-/Awareness-Änderungen (`awareness.on('update', ...)`):** Kodiere das Awareness-Update via `encodeAwarenessUpdate`, verschlüssele es mit `encryptWSFrame(noteId, FRAME_TYPE_AWARENESS, keyEpoch, dek, awarenessBytes)` und sende es über den WebSocket (auch für `view` erlaubt!).
     * **Beim Empfang von WebSocket-Frames:**
       * `0x01`: Entschlüsseln via `decryptWSFrame` $\rightarrow$ `Y.applyUpdate(ydoc, plaintext, 'remote')`.
       * `0x02`: Entschlüsseln via `decryptWSFrame` $\rightarrow$ `applyAwarenessUpdate(awareness, plaintext, 'remote')`.
       * `0x03` (`FRAME_TYPE_CONTROL`): Parse JSON nach Byte 0:
         * `PEER_LEFT`: Rufe sofort `removeAwarenessStates(awareness, [msg.yClientId], 'server')` auf (Ghost-Cursor verschwindet sofort!).
         * `ROLE_CHANGED`: Rufe `activeNoteStore.getState().setLivePermission(msg.permission)` auf.
         * `REVOKED`: Zerstöre das `Y.Doc`, zeige Toast „Zugriff wurde vom Eigentümer entzogen“ und navigiere zum Dashboard.
         * `KEY_ROTATED`: Lade über `GET /api/files/${noteId}/crdt-state` den neuen `enc_dek` für `msg.keyEpoch`, entschlüssele ihn mit dem eigenen privaten RSA-Key und aktualisiere `activeDEK` + `keyEpoch` im Store.
         * `COMPACT_REQUEST`: Triggere die Checkpoint-Kompaktierung (siehe Subagent 7).
2. **Fixes in `web/src/hooks/useTipTapConfig.ts` & `Editor.tsx`:**
   * **Fix `BUG-10`:** Lösche `ydoc.clientID = 1;` restlos! Yjs vergibt automatisch eine eindeutige zufällige Client-ID.
   * **Fix `BUG-09`:** Lösche den Block `if (provider && !provider.synced && initialContent) { editor.commands.setContent(initialContent); }`! Der Inhalt kommt ausschließlich aus dem `Y.Doc`-Bootstrap.
   * **Fix `BUG-13` (Guest Profile Race):** Füge einen `useEffect` hinzu, der auf `[userProfile?.name, userProfile?.color, provider]` hört und bei jeder Änderung `provider.awareness.setLocalStateField('user', { name: userProfile.name, color: userProfile.color })` aktualisiert.
   * **Fix `isShared`-Gate in `Editor.tsx:63`:** Entferne `if (!isShared) return;`. Jede Notiz nutzt immer das `Y.Doc` und den Provider, sodass neu hinzukommende Kollaborateure ohne Verzögerung sichtbar sind.
   * **Reaktive Schreibsperre für Viewers:** Füge in `Editor.tsx` einen `useEffect` auf `permission` hinzu: `editor?.setEditable(permission !== 'view')`.
   * **Fix `BUG-20` (Vollständiger Image-Paste-Handler mit $\text{BEK}$):**
     * In `handlePaste`: Wenn ein Bild in der Zwischenablage liegt, verschlüssele es mit `encryptAssetWithNewBEK(file)` aus `assetCrypto.ts`.
     * Lade den verschlüsselten Blob als Attachment mit `parent_file_id = noteId` hoch (`POST /api/files/${noteId}/attachments`).
     * Speichere den Schlüssel-Datensatz `{ assetId, bekBase64, ivBase64, mimeType }` in `ydoc.getMap('assets').set(assetId, record)`.
     * Füge einen TipTap-Image-Node mit `attrs: { dataAssetId: assetId }` an der Cursor-Position ein (eine Custom NodeView oder ein Resolver entschlüsselt das Bild beim Rendern über `ydoc.getMap('assets').get(assetId)` und `decryptAssetWithBEK`).

#### Abnahmekriterien:
* Kein doppelter Text mehr beim Beitreten eines zweiten Nutzers (`BUG-09`).
* Cursor tragen immer den echten Benutzernamen (`BUG-13`) und verschwinden beim Schließen des Tabs sofort.
* `Strg+V` fügt Bilder Ende-zu-Ende-verschlüsselt ein, die bei allen Kollaborateuren sofort erscheinen (`BUG-20`).

---

### SUBAGENT 7: `COMPACT-ROTATE-AGENT` (CRDT-Compaction-Manager & Share-Revocation mit DEK-Rotation)

* **Erlaubte Dateien (Strict File Lock):**
  * `web/src/hooks/useAutoSaveSync.ts`
  * `web/src/components/modals/ShareModal.tsx` (bzw. zugehörige Share-Management-Komponente)
* **Zu lösende Audit-Bugs:** `BUG-11` (OCC / LWW Overwrite bei 409 Conflict) sowie Kapitel 2.3 (Fehlende Schlüsselrotation / Forward Secrecy bei Share-Widerruf).

#### Aufgaben & Exakte Vorgaben:
1. **Umbau von `web/src/hooks/useAutoSaveSync.ts` zum CRDT-Compaction-Manager (`BUG-11`):**
   * Entferne das alte Verhalten, das alle 2–5 Sekunden das TipTap-JSON serialisiert und bei einem `409 Conflict` blind `currentVersion = err.serverVersion + 1` setzt!
   * Da jedes einzelne Tasten-Delta bereits in Echtzeit über den WebSocket in `yjs_wal` gesichert wird, hat dieser Hook nur noch die Aufgabe der **Hintergrund-Kompaktierung (Checkpointing)**:
     * Wenn der Nutzer Schreibrechte hat (`owner`, `share`, `edit`) und entweder:
       a) der Server ein `COMPACT_REQUEST`-Control-Frame gesendet hat,
       b) seit 15 Sekunden Inaktivität nach lokalen Änderungen herrscht, oder
       c) die Komponente unmountet / `visibilitychange === 'hidden'` feuert:
     * Erzeuge den kompaktierten Gesamtzustand: `const stateBytes = Y.encodeStateAsUpdate(ydoc)`.
     * Verschlüssele `stateBytes` via `encryptSnapshot(noteId, keyEpoch, activeDEK, stateBytes)` aus `e2eeFraming.ts`.
     * Sende `POST /api/files/${noteId}/compact` mit `{ upToSeqId, keyEpoch, ivBase64, ciphertextBase64 }`.
     * Aktualisiere zusätzlich (falls sich Notiztitel, Icon oder Preview-Text geändert haben) `secured_meta` mit dem `activeDEK`.
2. **Echte Kryptografische DEK-Rotation beim Entfernen eines Nutzers in `ShareModal.tsx` (Kapitel 2.3):**
   * Wenn der Eigentümer (`owner`) auf „Zugriff entziehen / Entfernen“ für `targetUserId` klickt:
     1. Lade die Liste aller *verbleibenden* Teilnehmer der Notiz (Owner + alle akzeptierten/eingeladenen Shares außer `targetUserId`) und deren öffentliche RSA-OAEP-Schlüssel.
     2. Rufe `generateAndWrapRotatedDEK(remainingPublicKeys)` aus `crypto.ts` auf, um $\text{DEK}_{\text{neu}}$ und das neue `access_keys`-Objekt zu erstellen.
     3. Erhöhe `newKeyEpoch = currentKeyEpoch + 1`.
     4. Kodiere das aktuelle `Y.Doc` (`Y.encodeStateAsUpdate(ydoc)`) und verschlüssele es mit $\text{DEK}_{\text{neu}}$ und `newKeyEpoch`.
     5. Verschlüssele auch die Notiz-Metadaten (`secured_meta`) mit $\text{DEK}_{\text{neu}}$.
     6. Sende alles an `POST /api/files/${noteId}/revoke-and-rotate`.
     7. Aktualisiere im lokalen `activeNoteStore` sofort `activeDEK = newDEK` und `keyEpoch = newKeyEpoch`.
   * Implementiere im `ShareModal.tsx` zudem ein Dropdown zum Live-Ändern der Rolle (`view` $\leftrightarrow$ `edit` $\leftrightarrow$ `share`), das `PATCH /api/files/${noteId}/shares/${shareId}` aufruft (wodurch der Go-Hub die Rolle des Nutzers live umschaltet).

#### Abnahmekriterien:
* Kein einziger `409 Conflict`-Überschreibungsfehler mehr möglich (`BUG-11`).
* Nach dem Entfernen eines Nutzers rotiert der Notiz-DEK auf `keyEpoch + 1`, ohne dass Bilder neu hochgeladen werden müssen.

---

### SUBAGENT 8: `CANVAS-CRDT-AGENT` (Standalone-Canvas auf Y.Map, 60-FPS-Cursor & BEK-Bilder)

* **Erlaubte Dateien (Strict File Lock):**
  * `web/src/components/canvas/CanvasNoteEditor.tsx`
  * `web/src/components/canvas/CanvasNoteItem.tsx`
  * `web/src/hooks/useCanvasImageUpload.ts`
* **Zu lösende Audit-Bugs:** `BUG-14` (Canvas State Freeze), `BUG-18` (RSA Decrypt Crash bei Canvas-Bildern), `BUG-19` (Plaintext JWK Leak im Canvas-JSON), sowie Kapitel 5.2.4 (Fehlende Canvas-Cursors).

#### Aufgaben & Exakte Vorgaben:
1. **Migration von `CanvasNoteEditor.tsx` auf verschachtelte `Y.Map`s (`BUG-14`):**
   * Entferne das isolierte `const [items, setItems] = useState(initialData.items)` ohne Synchronisation!
   * Binde das Canvas über denselben `yjsE2EEProvider` (aus Subagent 6) an `const yCanvas = ydoc.getMap<Y.Map<any>>('canvas')`.
   * Jedes Canvas-Element wird als eigene `Y.Map` unter seiner `id` in `yCanvas` gespeichert (*Contract 1.2*).
   * Nutze `yCanvas.observeDeep(...)`, um Änderungen (auch an einzelnen Attributen wie `x`, `y`, `color`) reaktiv in den lokalen Render-State zu spiegeln.
   * *(Einmal-Migration)*: Falls `yCanvas.size === 0`, aber `initialData?.items?.length > 0` vorhanden ist, überführe die Elemente in einer initialen `ydoc.transact(...)` in `yCanvas`.
2. **60-FPS Live-Canvas-Cursor & Drag-Vorschau über Awareness (Kapitel 5.2.4):**
   * Sende bei Mausbewegungen (`onPointerMove`, gedrosselt via `requestAnimationFrame`) die aktuellen Weltkoordinaten und ein eventuelles Drag-Delta über `provider.awareness.setLocalStateField('canvasPresence', { x, y, selectedIds, dragDelta })`:
     * Während der Nutzer ein Objekt zieht, wird `dragDelta: { id, dx, dy }` über Awareness (`0x02`) gestreamt.
     * Erst bei `onPointerUp` wird die finale Position `(x + dx, y + dy)` persistent in die `Y.Map` des Elements geschrieben (`0x01`).
   * Rendere auf dem Canvas für jeden fremden Teilnehmer aus `awareness.getStates()` einen farbigen Echtzeit-Mauszeiger mit Namens-Label sowie einen farbigen Auswahlrahmen um seine `selectedIds`.
3. **Sichere Bild-Verschlüsselung auf dem Canvas (`BUG-18` & `BUG-19`):**
   * **In `useCanvasImageUpload.ts`:** Lösche das Speichern von `fileKeyJwk` im Klartext (`BUG-19`) und lösche die RSA-Verschlüsselung mit dem eigenen Public-Key (`BUG-18`)!
   * Verschlüssele das Bild stattdessen mit `encryptAssetWithNewBEK(file)` aus `assetCrypto.ts`.
   * Lade das Chiffrat mit `parent_file_id = noteId` hoch (`POST /api/files/${noteId}/attachments`).
   * Speichere `{ assetId, bekBase64, ivBase64, mimeType }` in `ydoc.getMap('assets').set(assetId, ...)`.
   * Das Canvas-Item selbst speichert nur `assetId`.
   * **In `CanvasNoteItem.tsx`:** Lies für ein Bild-Element den Datensatz aus `ydoc.getMap('assets').get(item.assetId)`, lade den verschlüsselten Blob von `/api/files/${item.assetId}/blob` und entschlüssele ihn über `decryptAssetWithBEK(...)`.
   * Wenn ein Bild-Element vom Canvas gelöscht wird, lösche den Eintrag aus `ydoc.getMap('assets')` und sende `DELETE /api/files/${item.assetId}`, damit der Server den verwaisten Blob bereinigt.

#### Abnahmekriterien:
* Paralleles Verschieben und Bearbeiten auf dem Canvas läuft in Echtzeit ohne State-Freeze (`BUG-14`).
* Alle Kollaborateure sehen live die Mauszeiger der anderen auf dem Canvas.
* Alle Kollaborateure können hochgeladene Canvas-Bilder ohne RSA-Crash (`BUG-18`) und ohne Klartext-Key-Leak (`BUG-19`) sehen.

---

### SUBAGENT 9: `OVERLAY-MIGRATION-AGENT` (Sidecar-Zeichnungsebene in Y.Doc überführen)

* **Erlaubte Dateien (Strict File Lock):**
  * `web/src/components/notes/CanvasLayer.tsx`
  * `web/src/hooks/useStyleFile.ts`
* **Zu lösende Audit-Bugs:** `BUG-15` (Sidecar-Isolation durch `ownerId === currentUserId`) und `BUG-16` (Zero-Knowledge-Bruch durch unverschlüsselte `public` `.{noteId}_style`-Dateien).

#### Aufgaben & Exakte Vorgaben:
1. **Vollständige Ablösung der `.{noteId}_style`-Dateien (`BUG-15` & `BUG-16`):**
   * Entferne in `useStyleFile.ts` jeglichen Code, der neue Dateien mit `visibility: 'public'` und unverschlüsseltem `JSON.stringify(styleData)` anlegt!
   * Verbinde `CanvasLayer.tsx` / `useStyleFile.ts` stattdessen direkt mit `const yOverlay = ydoc.getMap<Y.Map<any>>('overlay')` des aktiven Notiz-`Y.Doc` (*Contract 1.2*).
   * Jeder gezeichnete Strich (Stroke) oder jedes Overlay-Element wird als Eintrag in `yOverlay` gespeichert. Da `ydoc` über den E2EE-WebSocket-Provider läuft, sind alle Zeichnungen automatisch mit dem Notiz-DEK Ende-zu-Ende-verschlüsselt (`BUG-16` gelöst) und für alle Kollaborateure in derselben Sekunde sichtbar (`BUG-15` gelöst).
2. **Automatische Einmal-Migration bestehender `.{noteId}_style`-Dateien:**
   * Falls beim Öffnen einer Notiz `yOverlay.size === 0` ist, prüfe einmalig, ob in der Dateiliste noch eine alte Datei `.${noteId}_style` existiert.
   * Falls ja: Lade deren Striche, schreibe sie in einer `ydoc.transact(...)` in `yOverlay` und lösche anschließend die unsichere alte `.${noteId}_style`-Datei über `DELETE /api/files/${legacyStyleFile.id}` vom Server.

#### Abnahmekriterien:
* Es werden niemals wieder `.{noteId}_style`-Dateien erzeugt.
* Zeichnungen auf der Notiz-Overlay-Ebene erscheinen live bei allen Teilnehmern und sind vollständig E2EE-geschützt.

---

# WELLE 3: INTEGRATIONS-PRÜFUNG & ENDABNAHME
*(Koordinator: Starte Subagent 10 erst, wenn alle Subagenten aus Welle 1 und Welle 2 abgeschlossen sind!)*

---

### SUBAGENT 10: `QA-VERIFY-AGENT` (Compiler-, Security- & Integrations-Audit)

* **Erlaubte Aktionen:** Lesezugriff auf alle geänderten Dateien, Ausführen von Build- und Test-Befehlen (`go build`, `go test`, `npm run typecheck` / `npx tsc --noEmit`). Darf kleinere Typ- oder Import-Unstimmigkeiten zwischen den Modulen beheben.

#### Checkliste für die Endabnahme (Muss Punkt für Punkt verifiziert werden):
1. **Backend-Kompilierung & Tests:**
   * Führe in `cloud/` den Befehl `go build ./...` und `go test ./...` aus. Behebe eventuelle fehlende Imports oder Signatur-Abweichungen zwischen `sqlite.go`, `files.go` und `websocket.go`.
2. **Frontend-Typprüfung:**
   * Führe in `web/` den Befehl `npx tsc --noEmit` aus. Stelle sicher, dass alle Aufrufe zwischen `e2eeFraming.ts`, `assetCrypto.ts`, `yjsE2EEProvider.ts` und den Komponenten typensicher zusammenpassen.
3. **Security-Grep-Audit (Null-Toleranz-Prüfung):**
   * Suche im gesamten Code nach folgenden verbotenen Mustern und stelle sicher, dass **0 Treffer** existieren:
     * `COALESCE(fs.permission, 'owner')` in `cloud/` (`BUG-02`).
     * `ydoc.clientID = 1` in `web/` (`BUG-10`).
     * `fileKeyJwk` in `web/` (`BUG-19`).
     * `visibility: 'public'` in `useStyleFile.ts` (`BUG-16`).
     * `room.history` in `websocket.go` (`BUG-07`).
4. **Abschlussbericht an den Koordinator:**
   * Erstelle eine finale Status-Tabelle aller 20 Bugs (`BUG-01` bis `BUG-20`) mit dem Verifikationsstatus `VERIFIED FIXED`.