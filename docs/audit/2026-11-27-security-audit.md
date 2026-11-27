# Tide – Umfassende Sicherheits-, Architektur- & Qualitätsanalyse

**Audit-Datum:** 27.11.2026 · **App-Version:** `2.1.0` · **Git-Commit:** `e30a614`  
**Umfang:** Frontend (`web/`), Go-Cloud-Backend (`cloud/`), Datenbank & Blob-Storage (`cloud/internal/store/`), Infrastruktur & Deployment (`docker-compose.yml`, `Dockerfile`s, `tide.sh`, `pull-backup.ps1`), Begleitkomponenten (`mcp/`, `core/`), Tests, Linting & Code-Hygiene.  
**Methodik:** Statische Code- & Architektur-Analyse aller sicherheitsrelevanten Pfade, automatisierte Tool-Läufe (`tsc --noEmit`, `go vet`, `go test`, `vitest run`, `eslint`, `npm audit`) sowie Abgleich mit den gemessenen Live-Werten des Performance-Audits vom 24.11.2026 (`docs/audit/2026-11-24-performance-audit.md`). Alle Sicherheitsbefunde sind strikt defensiv dokumentiert.

---

## 1. Executive Summary

**Gesamtscore: `57 / 100` — Erhöhtes Risiko** *(Solide kryptografische & statische Grundlagen, aber kritische E2EE- und Autorisierungslücken vor Produktiv-Skalierung schließen)*

Tide besitzt eine bemerkenswert reife Grundarchitektur in mehreren sicherheitskritischen Einzelbausteinen: Das Go-Backend nutzt konsequent parametrisierte SQL-Queries ohne klassische SQL-Injection, speichert Blobs über Go `os.OpenRoot` mit atomarem `Sync()`/`Rename`, erzwingt `HS256`-JWTs mit Pflicht-Secret, hasht PINs per Argon2id (`m=65536, t=3, p=2`) und schützt WebAuthn/Recovery-Flows sauber. Auch die Frontend-Performance hat sich laut Referenz-Audit vom 24.11.2026 massiv verbessert (`55 → 76 / 100`, Prod `/auth` FCP `164 ms`, `YjsE2EEProvider`-Memory-Leak per GC-Probe geschlossen).

Gleichzeitig offenbart die Gesamtanalyse **34 konsolidierte Befunde** (`4 Kritisch`, `12 Hoch`, `12 Mittel`, `6 Niedrig`), darunter strukturelle Brüche im Zero-Knowledge-Versprechen und der Mandanten-Isolation:

1. **Kritische Vault-Exfiltration (`K-01`):** `GET /api/v1/messages/conversations` liefert über `[]*db.User` die `encrypted_vault`- und `encrypted_pepper`-Felder von Chat-Partnern aus (`models.go:19-20` ohne `json:"-"`). Zusammen mit dem Klartext-Salt im Vault und der im Frontend erzwungenen **5-stelligen PIN** (`10^5 = 100.000` Kombinationen) entsteht ein direktes Offline-Brute-Force-Risiko auf den 4096-Bit-RSA-Master-Private-Key.
2. **E2EE-Metadaten- & Klartext-Bypass (`K-02`):** Notiz-/Ordnertitel, Workspace-Namen (`safe`), Tags, vollständige Kalendertermine (`title`, `start`, `end`, `description`, `recurrence_rule`) und alle `/api/v1/todos` werden unverschlüsselt an den Server gesendet und in SQLite gespeichert.
3. **Defekte DEK-Rotation & fehlende Forward Secrecy (`K-03`):** Beim Widerruf einer Freigabe (`ShareModal.tsx:519-523`) wird der neue DEK nicht im `useActiveNoteStore` aktualisiert, `Editor.tsx` besitzt keinen `onKeyRotated`-Callback, und ohne offenen Editor wird ein leeres `Y.Doc()` verschlüsselt. Mention- und Kalender-Widerrufe rotieren den Schlüssel gar nicht.
4. **Kollaborator-Eskalation & stiller E2EE-Downgrade (`K-04`):** Jeder `edit`-Kollaborator kann über `UpdateFile` Dateien umhängen (`ParentID`), soft-löschen (`deleted_at`) oder über `metadata.unencrypted=true` ein `ResetFileCRDTState` auslösen – woraufhin der Client still auf den deterministischen `derivePublicNoteDEK(fileId)` (`SHA-256`) zurückfällt. Auch External-API-Updates löschen `SecuredMeta`.
5. **Skalierungs- & Betriebshürden (`H-09`, `H-11`, `H-12`):** Synchrones SQLite-Logging pro CRDT-Frame (`MaxOpenConns(1)`), ungebuffertes SSE-Broadcasting, fehlendes Graceful Shutdown in `main.go`, unsichere Live-SQLite-Backups in `tide.sh` sowie Frontend-Batch-Bursts (`fetchDirectory`-Viererpack) und `47` Produktivdateien über 500 LOC.

---

## 2. Bewertungsmatrix nach Dimensionen

| Dimension | Gewichtung | Score | Ampel | Kernbegründung |
| :--- | :---: | :---: | :---: | :--- |
| **Kryptografie & Zero-Knowledge E2EE** | 25 % | **48 / 100** | Kritisch | Gute Primitive (RSA-4096, AES-256-GCM, HKDF, AAD), aber `K-01`..`K-04`, Klartext-Todos/Kalender, 5-stellige PIN und `localStorage`-Tokens. |
| **Authentifizierung, Autorisierung & API-Sicherheit** | 25 % | **56 / 100** | Erhöht | Starke SQLi-/Blob-/JWT-Basis, aber Store-Autorisierungslücken (`H-01`, `H-02`), External-API-Scope-Bypässe (`H-03`), Quicknote-Fläche (`H-04`) und OTP-Race (`H-07`). |
| **Skalierbarkeit, Concurrency & Infrastruktur** | 15 % | **52 / 100** | Erhöht | SQLite WAL + Read/Write-Split vorhanden, aber 1-Writer-Contention (`AppendYjsWAL`), ungebuffertes SSE, kein Graceful Shutdown (`H-09`), Docker als `root`/Dev-Mode. |
| **Performance (Frontend & Backend)** | 15 % | **74 / 100** | Befriedigend | Starke Live-Verbesserung (24.11.: `76/100`, Gzip `-80..90 %`, GC-Leak behoben), verbleibend: `fetchDirectory`-Bursts, ProseMirror-Full-Scans, `Editor`-Remount (`H-11`). |
| **Code-Konsistenz & Architektur-Disziplin** | 10 % | **61 / 100** | Befriedigend | `tsc`/`go vet` sauber, aber `484` Plaintext-`http.Error` vs. `11` JSON-Errors, `1.135` hardcoded Visual-Tokens, `19` Legacy-`/api/`-Calls, `22` Zustand-Stores. |
| **Code-Sauberkeit, Wartbarkeit & Testqualität** | 10 % | **63 / 100** | Befriedigend | `87/87` Go-Tests & `1.351` Web-Tests grün, jedoch `4` Vitest-Fails, `574` ESLint-Errors (`+17`), `47` Monolithen `>500 LOC`, `253+ MB` Repo-/Public-Ballast. |
| **Gewichteter Gesamtscore** | **100 %** | **57 / 100** | **Erhöht** | `0,25×48 + 0,25×56 + 0,15×52 + 0,15×74 + 0,10×61 + 0,10×63 = 57,3 → 57` |

---

## 3. Codebase-, Build-, Test- & Dependency-Telemetrie

### 3.1 Live-Messwerte (Stand 27.11.2026)

| Kennzahl | Ergebnis | Bewertung / Kontext |
| :--- | :--- | :--- |
| **Web-Quellcode (`web/src`, ohne Tests)** | `541` Dateien · `113.117` LOC | Umfangreiche Client-Logik, `41` Dateien > 500 LOC |
| **Web-Tests (`web/src`)** | `142` Dateien · `16.481` LOC | Gute Abdeckung in CryptoV2/Passkey/Recovery, Lücken bei `api.ts`/`crypto.ts`/Slices |
| **Go-Quellcode (`cloud/`, ohne Tests)** | `51` Dateien · `19.094` LOC | `6` Dateien > 500 LOC (Spitzenreiter `sqlite.go`: `3.595` LOC) |
| **Go-Tests (`cloud/`)** | `15` Dateien · `6.114` LOC | Lücken in Core-Files-, Share-, Blob-, WS- & Middleware-Paketen |
| **Gesamt-Codebasis (Web + Go)** | `592` Produktivdateien (`132.211` LOC) · `157` Testdateien (`22.595` LOC) | Test-zu-Code-Ratio: `17,1 %` |
| **TypeScript (`cd web && npx tsc --noEmit`)** | `0` Fehler (Exit `0`) | Sauber |
| **Go Vet (`cd cloud && go vet ./...`)** | `0` Warnungen (Exit `0`) | Sauber |
| **Go Tests (`cd cloud && go test ./...`)** | **`87` PASS · `0` FAIL** (`internal/api` `11,2–11,6 s`, `internal/store` `2,7–3,4 s`) | `cmd/server` und `internal/db` ohne Testdateien |
| **Web Tests (`cd web && npm test`)** | **`1.351` PASS · `4` FAIL** (`138/142` Dateien grün, `120,54 s`) | U. a. `recovery.test.ts:110` 5.000-ms-Timeout |
| **ESLint (`cd web && npm run lint`)** | `959` Probleme (**`574` Errors · `385` Warnings**) | **`+17` Errors über der `AGENTS.md`-Baseline von `557`** (`481` `any` in `70` Dateien) |
| **Dependency-Audit (`npm audit --omit=dev`)** | **`5` Schwachstellen** (`0` Kritisch · **`1` Hoch** · `4` Mittel · `0` Niedrig) | `serialize-javascript <=7.1.2` (High) über `@rollup/plugin-terser` → `workbox-build` → `@ducanh2912/next-pwa` |
| **Git-Tracking sensibler Dateien** | `0` getrackte `.env`/`.db`/`.tar.gz`/Key-Dateien | `.gitignore` greift für Git, aber lokale/untracked Altlasten im Workspace |

### 3.2 `AGENTS.md`-Regel-Compliance

| Regel | Status | Gemessener Ist-Zustand |
| :--- | :---: | :--- |
| Typecheck fehlerfrei (`tsc --noEmit`) | Pass | `0` Fehler |
| Keine neuen ESLint-Errors (Baseline `557`) | Fail | **`574` Errors** (`+17` über Baseline); `481` `any`-Vorkommen in `70` Nicht-Test-Dateien; `25` `eslint-disable`; `0` `@ts-ignore`/`@ts-expect-error` |
| HTTP nur über `apiFetch` | Fail | **`6` direkte `fetch()`-Aufrufe** in 3 Dateien (`animatedEmoji.ts:72`, `mobileConnectionApi.ts:90,132,170`, `yjsE2EEProvider.ts:195,799`) |
| Visuelle Tokens nur in `designTokens.ts` | Fail | **`1.135` Hardcoded-Tokens** in `158` Nicht-Test-Dateien (`605` Hex, `275` `rgba()`, `202` `borderRadius`, `53` `backdrop-blur`) |
| Dateien unter 500 LOC | Fail | **`47` Produktivdateien > 500 LOC** (`41` Web + `6` Go; zzgl. `3` Go-Testdateien > 500 LOC). Positiv: `page.tsx` wurde auf `558` LOC verschlankt (`AGENTS.md` noch veraltet mit `3900 L`). |
| Kein Dual-Crypto-Wildwuchs | Warn | `crypto.ts` in `32` Dateien, `cryptoV2.ts` in `14` Dateien, **`12+` Module nutzen beide parallel** |

---

## 4. Verifizierte Stärken & Sicherheitskontrollen

1. **Keine klassische SQL-Injection:** Alle Datenbankzugriffe in `cloud/internal/store/` nutzen parametrisierte `?`-Platzhalter; `LIKE`-Suchen (`sqlite.go:2543-2574`, `sqlite_todos.go:151-176`) verwenden `escapeLike` mit `ESCAPE '\'`.
2. **Robuste Blob-Speicherung (`cloud/internal/store/blob.go`):** `validateBlobKey` (`L36-59`) erzwingt eine strikte Zeichen-Allowlist (`[a-zA-Z0-9._/-]`) ohne leere/führende `.`-Segmente. Alle Operationen laufen über Go `os.OpenRoot(s.BasePath)` mit `O_CREATE|O_EXCL`-Temp-Dateien, `f.Sync()` und atomarem `Rename` (`L75-128`), wodurch Path-Traversal und Symlink-Ausbrüche zuverlässig verhindert werden.
3. **Kein SSRF im Backend:** Keine der inspizierten Go-API-Routen führt unkontrollierte ausgehende HTTP-Requests durch.
4. **Solide Kern-Authentifizierung:**
   - JWT-Prüfung (`middleware.go:81-91`, `websocket.go:530-535`) erzwingt `HS256` (`jwt.WithValidMethods`), `exp`-Pflicht und verweigert den Serverstart ohne gültiges `JWT_SECRET` (`main.go:200-202`).
   - PIN-Hashing (`auth.go:83-171`) nutzt Argon2id (`m=65536, t=3, p=2`) mit 16-Byte-`crypto/rand`-Salt und `subtle.ConstantTimeCompare`; `UpdateMe` (`L410-423`) scheitert bei leerem `PinHash` fail-closed.
   - WebAuthn (`passkey*.go`) prüft `RPID`/`RPOrigins`, `VerificationRequired`, lehnt geklonte Authenticatoren (`CloneWarning`) ab und sperrt Passkey-Sessions für Vault-/Passkey-Mutationen ohne frische OTP-Session + Key-Proof.
   - `DevLogin` (`main.go:389-391`, `dev_auth.go:46-49`) ist doppelt gegated (`ENV != "production" && DEV_MODE == "true"`).
   - `CSRFMiddleware` (`middleware.go:241-287`) blockt `Sec-Fetch-Site: cross-site`, validiert `Origin` und verlangt `X-Requested-With` bei Cookie-Mutationen.
5. **Starke E2EE-Einzelbausteine im Web:** 4096-Bit RSA-OAEP + AES-256-GCM mit frischen 12B-Nonces, Yjs-AAD-Framing (`fileId || msgType || keyEpoch` in `e2eeFraming.ts`), 160-Bit-Recovery-Secret (`recoverySecret.ts:69-73`) ohne Server-Transmission, Passkey-PRF-HKDF-Envelope (`passkeyEnvelope.ts`), sicheres Avatar-SVG-Rendering (`<img src>` via `.toDataUri()` statt `dangerouslySetInnerHTML`), Workbox `/api/` `NetworkOnly`, Prototype-Pollution-Stripping (`fileSupport.ts`, `bundleImportExport.ts`) und `apiFetch`-Origin-Validierung (`api.ts:80-114`).
6. **Stabile Compile-/Static-Basis & nachgewiesene Performance-Verbesserung:** `tsc --noEmit` (`0`), `go vet` (`0`), `87/87` Go-Tests grün, SQLite WAL + Read/Write-Pool-Trennung, `YjsE2EEProvider`-Leak per V8-GC geschlossen, Gzip-Kompression aktiv (`-80..90 %`).

---

## 5. Detaillierte Risiko- & Sicherheitsbefunde

### 5.1 Kritische Befunde (`K-01` bis `K-04`)

#### `K-01` Cross-User Vault-Exfiltration über Chat-Konversationen in Kombination mit 5-stelliger PIN
- **Betroffene Dateien & Zeilen:** `cloud/internal/api/messages.go:248-263`, `cloud/internal/store/sqlite.go:2197-2239`, `cloud/internal/db/models.go:19-20`, `web/src/lib/crypto.ts:159-163,217-235`, `web/src/app/auth/page.tsx:146-147,298,354`
- **Ursache:** `ListConversations` serialisiert direkt `[]*db.User` aus `GetConversations`. Die SQL-Query (`sqlite.go:2199`) selektiert auch `u.encrypted_vault` und `u.encrypted_pepper` des Gesprächspartners, und `db.User` besitzt für beide Felder JSON-Tags (`json:"encrypted_vault"`, `json:"encrypted_pepper"`) statt `json:"-"`. Gleichzeitig bettet `encryptPrivateKey` das Klartext-Pepper als `salt` unverschlüsselt in das `EncryptedVault`-JSON ein, und die Registrierung begrenzt die Vault-PIN auf 5 Ziffern (`10^5 = 100.000` Möglichkeiten).
- **Auswirkung / Risiko:** Jeder Nutzer, mit dem eine Konversation besteht, erhält über die reguläre API das verschlüsselte Private-Key-Vault samt Salt des Chat-Partners. Da der Suchraum nur 100.000 PINs umfasst, lässt sich der 4096-Bit-RSA-Master-Private-Key des Partners offline in Sekunden bis Minuten per Brute-Force brechen.
- **Konkrete Behebung (defensiv):**
  1. In `GetConversations` ein dediziertes `ConversationPartner`-DTO zurückgeben, das ausschließlich `id`, `username`, `public_key`, `enabled_extensions`, `is_verified` und `created_at` enthält.
  2. `EncryptedVault` und `EncryptedPepper` in `cloud/internal/db/models.go` mit `json:"-"` versehen und nur in dedizierten Auth-Response-DTOs explizit serialisieren.
  3. Im Frontend von einer 5-stelligen Ziffern-PIN auf eine hoch-entropische Passphrase (mind. 12+ Zeichen / Argon2id) migrieren.

#### `K-02` E2EE-Vertraulichkeitsbruch durch Klartext-Metadaten, Kalendertermine & Todos
- **Betroffene Dateien & Zeilen:** `web/src/store/slices/createNotesSlice.ts:169,270,352`, `web/src/store/slices/createTodosSlice.ts:8-36,90-94,190-194`, `web/src/app/calendar/page.tsx:243-251,381-395,489`, `web/src/hooks/dashboard/useCalendarActions.ts:262`, `web/src/hooks/dashboard/useNoteTags.ts:40`, `web/src/hooks/dashboard/useFolderAndGroupActions.ts:92,185,235,332`, `cloud/internal/store/sqlite.go:232-244`, `cloud/internal/store/sqlite_todos.go`
- **Ursache:** Zwar werden `secured_meta` und `content_ciphertext` clientseitig verschlüsselt, doch parallel schreibt das Frontend vertrauliche Nutzerdaten im Klartext in die unverschlüsselte `metadata`-JSON-Spalte sowie an `/api/v1/todos`: Notiz-/Ordnertitel, Workspace-Namen (`safe`), `tagIds`, vollständige Kalendertermine (`title`, `start`, `end`, `description`, `recurrence_rule`, `exdates`, `completed_dates`) und sämtliche Todo-Felder (`title`, `description`, `tags`, `due_date`, `scheduled_date`).
- **Auswirkung / Risiko:** Bei einem Server-Kompromittieren, DB-Leak oder durch den Betreiber selbst sind alle Titel, Kalenderinhalte, Kontakte/Termine, Workspace-Strukturen und Aufgaben vollständig im Klartext lesbar. Das Zero-Knowledge-Schutzniveau beschränkt sich faktisch auf Notiz-Inhalte.
- **Konkrete Behebung (defensiv):**
  1. `metadata` auf `/api/v1/files` strikt auf technische/kryptografische Flags (`has_custom_password`, `pwd_salt`, `pin_hash`, `version`, ggf. Typ-Flags) reduzieren.
  2. Titel, `safe`, `tagIds`, `color` sowie vollständige Event-Felder DEK-verschlüsselt (AES-GCM via `encryptContentV2`, da RSA-OAEP auf ~180–446 Bytes begrenzt ist) in `secured_meta`/`content_ciphertext` ablegen.
  3. `/api/v1/todos` auf V2-Envelope-Verschlüsselung analog zu `decryptTasks` (`fsHelpers.ts:122-160`) umstellen.

#### `K-03` Defekte DEK-Rotation bei Share-Widerruf (fehlende Forward Secrecy & Datenverlustrisiko)
- **Betroffene Dateien & Zeilen:** `web/src/components/ShareModal.tsx:454-528`, `web/src/components/Editor.tsx:119-124,143-150,203`, `web/src/lib/yjsE2EEProvider.ts:646-655`, `web/src/lib/mentionShare.ts:116-119`, `web/src/lib/calendarShareActions.ts:114-117`
- **Ursache:**
  1. `ShareModal.tsx:519-523` aktualisiert im Store nur `keyEpoch` und legt `newDEK` lediglich auf `window.__tideActiveDEK`, ruft aber **nie** `useActiveNoteStore.getState().setActiveDEK(newDEK)` auf. `Editor.tsx:203` übermittelt deshalb den **alten DEK** zusammen mit der neuen `keyEpoch` an `YjsE2EEProvider.updateDEK()`.
  2. `Editor.tsx:143-149` übergibt keinen `onKeyRotated`-Callback an `YjsE2EEProvider`, sodass verbundene Kollaboratoren bei Empfang von `KEY_ROTATED` (`yjsE2EEProvider.ts:646-655`) zwar die Epoche hochzählen, aber ebenfalls mit dem alten DEK weiterarbeiten.
  3. Ist kein Editor gemountet (Widerruf aus Sidebar/Listenansicht), fällt `ShareModal.tsx:466-468` auf `new Y.Doc()` zurück und überschreibt den Server-Snapshot potenziell mit einem leeren Dokument; `content_ciphertext` wird dabei nicht neu verschlüsselt.
  4. `ShareModal.tsx:474-485` kodiert `newSecuredMeta` als rohes `12B IV || AES-GCM`, das keinem der Standard-Decoder (`decryptContentV2` JSON / `decryptMetadata` RSA-OAEP) entspricht.
  5. `revokeMentionShare` und `revokeIdempotent` (Kalender) rufen nur `DELETE .../shares/:userId` ohne jede Schlüsselrotation auf.
- **Auswirkung / Risiko:** Nach dem Entzug von Zugriffsrechten bleiben neue Inhalte für einen passiven Beobachter mit altem DEK weiterhin entschlüsselbar; Metadaten können unleserlich werden, und ein Widerruf außerhalb des Editors droht den CRDT-Zustand zu leeren.
- **Konkrete Behebung (defensiv):**
  1. `setActiveDEK(newDEK)` verbindlich zusammen mit `setKeyEpoch` aufrufen; `window.__tideActiveDEK` entfernen.
  2. `onKeyRotated` in `Editor.tsx` implementieren (Datei-Metadaten neu laden, neuen DEK aus `access_keys[myId]` auspacken und an `provider.updateDEK` übergeben).
  3. Vor `revoke-and-rotate` stets den aktuellen Dokument- und `content_ciphertext`-Zustand laden/entschlüsseln und beide sowie `secured_meta` im einheitlichen V2-Format neu verschlüsseln.
  4. Eine zentrale Revocation+Rotation-Funktion für Dateien, Mentions und Kalender-Shares verwenden.

#### `K-04` Kollaborator-Eskalation (`UpdateFile`), External-API-`SecuredMeta`-Löschung & stiller E2EE-Downgrade
- **Betroffene Dateien & Zeilen:** `cloud/internal/api/files.go:344-352,371-420,450-463,529-537`, `web/src/hooks/autoSaveHelpers.ts:385-400,457-461`, `web/src/lib/cryptoV2.ts:716-728`, `cloud/internal/api/external_events.go:283-304`, `cloud/internal/api/external_folders.go:336-343`, `cloud/internal/api/external_tags.go:214-224`, `cloud/internal/api/external_notes.go:308-321,491-570,609-612`
- **Ursache:**
  1. **Backend `UpdateFile` (`files.go`):** Jeder Kollaborator mit `edit`- oder `share`-Recht passiert die Berechtigungsprüfung und darf `ParentID` ändern (fremde Datei in eigenen Ordner verschieben), `Metadata` komplett überschreiben (`deleted_at` injizieren -> Soft-Delete trotz fehlendem Löschrecht) oder `metadata.unencrypted: true` setzen, was serverseitig `ResetFileCRDTState(ctx, file.ID, true)` (`L529-537`) auslöst und Snapshots + WAL vernichtet.
  2. **Frontend Downgrade (`autoSaveHelpers.ts:385-400`):** Erkennt der Client in der Server-Antwort `visibility === 'public'`, `unencrypted === true` oder `metadata.unencrypted === true`, wechselt er automatisch auf `derivePublicNoteDEK(fileId)` (`SHA-256("tide-public-note-v1:" + noteId)`).
  3. **External API (`external_*.go`):** `UpdateEvent`, `UpdateFolder` und `UpdateTag` setzen `file.SecuredMeta = nil` und überschreiben E2EE-Flags auf `unencrypted: true`; `UpdateNote` schreibt bei E2EE-Notizen weiterhin Titel/Tags/Safe in `PublicMeta` und sendet Klartext-Metadaten über SSE; `parseNoteMeta` wertet `visibility == "public"` pauschal als unverschlüsselt.
- **Auswirkung / Risiko:** Ein `edit`-Kollaborator (oder ein kompromittierter Server) kann fremde geteilte Notizen unbemerkt aus ihrer Ordnerstruktur lösen, in den Papierkorb verschieben, ihre CRDT-Historie zerstören und künftige Client-Edits auf einen öffentlich berechenbaren Schlüssel umleiten. Über die External API werden zudem E2EE-`SecuredMeta`-Payloads zerstört bzw. im Klartext geleakt.
- **Konkrete Behebung (defensiv):**
  1. In `files.go`: Änderungen an `ParentID`, `metadata.deleted_at` und `metadata.unencrypted` (sowie `ResetFileCRDTState`) strikt auf `file.OwnerID == requesterID` begrenzen.
  2. Im Frontend (`autoSaveHelpers.ts`): Niemals still anhand eines Server-Flags von einem verschlüsselten DEK auf `derivePublicNoteDEK` umschalten; bestehende E2EE-Dateien dürfen nur nach expliziter Nutzeraktion/Bestätigung entschlüsselt re-gespeichert werden.
  3. In der External API (`external_*.go`): Schreibzugriffe ablehnen (`400`/`403`), sobald `len(file.SecuredMeta) > 0`, `has_custom_password == true` oder `!isUnencrypted` (auch keine Metadaten nach `PublicMeta`/SSE kopieren).

---

### 5.2 Hohe Befunde (`H-01` bis `H-12`)

#### `H-01` Store-Autorisierungs- & Datenleck-Fehler in `ListAccessibleFiles` & `ListPublicFiles`
- **Dateien & Zeilen:** `cloud/internal/store/sqlite.go:1103-1200,1601-1764,2476-2541`
- **Ursache:** In `ListAccessibleFiles` (`recursive=true` bei `L1633`, `parentID != nil` bei `L1663`) matched `OR COALESCE(f.visibility, 'private') = 'public'` ohne Owner-Filter alle öffentlichen Dateien aller Nutzer in der gesamten Datenbank. Zudem fehlt beim `file_shares`-Join die Bedingung `AND fs.status = 'accepted'`, sodass ausstehende Einladungen bereits `secured_meta` und `access_keys` offenlegen. `COALESCE(fs.status, 'owner')` markiert öffentliche/DEK-Dateien fälschlich als `'owner'`, und `GetAccessibleFile`/`ListAccessibleFiles`/`ListPublicFiles` liefern bei `public`/`contacts`-Dateien sowohl `f.secured_meta` als auch `f.access_keys` (inkl. Collaborator-IDs und gewrappter DEKs) an Nicht-Kollaboratoren aus.
- **Auswirkung:** Fremde öffentliche Dateien fluten rekursive Listings; unakzeptierte Shares und öffentliche Dateien legen Metadaten und Collaborator-Key-Maps offen.
- **Behebung:** `AND fs.status = 'accepted'` in allen Share-Joins erzwingen (offene Einladungen separat abfragen); globale `public`-Dateien aus `ListAccessibleFiles` entfernen; `share_status` via `CASE` sauber berechnen; `secured_meta` und `access_keys` für Nicht-Owner ohne akzeptierten Share im SQL redigieren.

#### `H-02` Fehlende Ownership-Prüfungen & fremdnutzerübergreifende rekursive Ordner-Löschung in `sqlite.go`
- **Dateien & Zeilen:** `cloud/internal/store/sqlite.go:1020-1068,1202-1293,1295-1356,1421-1444,2647-2678`
- **Ursache:** `UpdateFile` und `UpdateFileWithOCC` filtern nur nach `WHERE id = ?` ohne `AND owner_id = ?` und erlauben sogar das Überschreiben von `owner_id = ?` im `SET`. `DeleteFile`, `SoftDeleteFile`, `RestoreFile`, `SetVisibility` und `SetVisibilityRecursive` prüfen im Store keinen `owner_id`. Besonders kritisch: Die rekursiven CTEs traversieren `f.parent_id = d.id` ohne `AND f.owner_id = ?`, sodass beim Löschen/Verschieben/Sichtbarkeitswechsel eines Ordners auch Kindobjekte **anderer Nutzer** innerhalb dieses Ordners gelöscht oder modifiziert werden.
- **Auswirkung:** Fehlende Defense-in-Depth-Schicht bei Handler-Fehlern und reales Risiko fremden Datenverlusts in geteilten Ordnerstrukturen.
- **Behebung:** `callerID`/`ownerID` als Pflichtparameter in allen mutierenden Store-Methoden einführen, `AND owner_id = ?` in `WHERE`-Klauseln und rekursive CTEs aufnehmen sowie `owner_id` aus `UpdateFile*`-`SET`-Klauseln entfernen.

#### `H-03` External-API Scope-Bypässe (`safe:`/`folder:` leer, `workspaces:write`, `linked_safes`)
- **Dateien & Zeilen:** `cloud/internal/api/external.go:80-107,327-341,429-476`, `cloud/internal/api/external_workspaces.go:176-411`, `cloud/internal/api/external_notes.go:142-176,458-460,560`
- **Ursache:**
  1. `tokenMatchesScope` gewährt `notes:read`/`folders:read`/`workspaces:read` für jedes Scope-Präfix `"safe:"` oder `"folder:"`, während `extractScopes` leere Suffixe (`"safe:"`, `"folder:   "`) verwirft – sind beide Slices danach leer, erlaubt `fileMatchesScopeForUser` (`L430-432`) **alle Dateien**.
  2. `folder:<id>`-Tokens erhalten implizit `workspaces:read`, und `ListWorkspaces` prüft nur `safes`, wodurch alle Workspaces ausgelesen werden. `CreateWorkspace`, `UpdateWorkspace`, `SetActiveWorkspaces` und `DeleteWorkspace` ignorieren `safe:`/`folder:`-Scopes komplett (inkl. `RenameWorkspaceInFiles`/`ReassignWorkspaceInFiles`).
  3. `linked_safes` berechtigt über `loadScopedNote` nicht nur zum Lesen, sondern auch zum Überschreiben und Löschen von Notizen aus fremden primären Workspaces; `CreateNote`/`UpdateNote` validieren übergebene `linked_safes` zudem nicht gegen den Token-Scope.
- **Auswirkung:** Scope-eingeschränkte API-Tokens können auf fremde Workspaces, Ordner und Notizen eskalieren.
- **Behebung:** Leere `safe:`/`folder:`-Suffixe strikt ablehnen; `folder:` nicht pauschal mit `workspaces:read` verknüpfen; Workspace-Schreibrouten bei `len(folders) > 0` oder fremdem Workspace mit `403` abweisen; Write/Delete bei Notizen am primären `fileSafe` prüfen und `req.LinkedSafes` gegen `safes` validieren.

#### `H-04` Unauthentifizierte Quicknotes-Angriffsfläche: Ownership-Hijack, 2-GB-DoS & Active-Content-XSS
- **Dateien & Zeilen:** `cloud/internal/api/quicknotes.go:99-111,208-218,240-263,352-357,577-585,624-760,797-828,865-919`, `web/src/lib/quicknotesApi.ts:116-126`
- **Ursache:** Kernrouten (`/tree`, `/crdt-state`, `/compact`, `/files`, `/ws`) liegen außerhalb von `AuthMiddleware`. Anonyme Nutzer können Notizen anlegen, Dateien hochladen/löschen und das globale 2-GB-Quota erschöpfen (`ParseMultipartForm(32 << 20)` pro Upload). Jeder beliebige eingeloggte Nutzer kann nachträglich `OwnerID == nil`-Quicknotes über `GetQuicknote` (`L258`) oder `SetQuicknoteAccess` (`L891-902`) übernehmen. `UploadQuicknoteFile` übernimmt den Client-`Content-Type` ungeprüft, und `DownloadQuicknoteFile` liefert ihn mit MIME-Parametern direkt auf der API-Origin aus (u. a. `application/javascript` oder `image/svg+xml`). Zudem leakt `writeQuicknoteAccessDenied` (`L215-216`) den geschützten `title` im `403`, `SetQuicknoteAccess` trennt keine bestehenden WS-Gäste bei Wechsel auf `approval_required`, `parent_slug` wird ohne Zugriffsprüfung/Zyklenprüfung akzeptiert, und `deriveQuicknoteKey(slug)` leitet den WS-Key deterministisch aus dem Slug ab.
- **Auswirkung:** Speicher-/RAM-DoS, Übernahme anonymer Quicknotes, Stored-Active-Content-/XSS-Risiko auf der API-Origin, Titel-Disclosure und fehlende kryptografische Vertraulichkeit geschützter Quicknotes.
- **Behebung:** `http.DetectContentType` + strikte Inline-Allowlist (`png`/`jpeg`/`gif`/`webp`, ohne MIME-Parameter), sonst `application/octet-stream` + `attachment`; nachträgliches Claimen anonymer Quicknotes blockieren; Capability-/Edit-Token oder Auth für Datei-Mutationen und strikte Per-IP-Quotas erzwingen; `title` aus `403` entfernen; WS-Clients beim Lockdown trennen.

#### `H-05` Session-Token im `localStorage`, Query-String-Tokens (`?token=`/`?api_token=`) & schwache CSP
- **Dateien & Zeilen:** `web/src/app/auth/page.tsx:338,503`, `web/src/lib/api.ts:270-273`, `web/src/components/Chat/ChatPanel.tsx:703-705`, `cloud/internal/api/middleware.go:56-58`, `cloud/internal/api/websocket.go:518-520`, `cloud/internal/api/quicknotes.go:170,645`, `cloud/internal/api/external.go:177,197`, `web/next.config.ts:77-80`
- **Ursache:** Neben dem `HttpOnly`-Cookie speichert das Frontend `tide_session_token` im `localStorage` und sendet ihn per `Authorization`-Header; `ChatPanel.tsx:705` hängt ihn sogar als `?token=` an die `EventSource`-URL. Backend-Middleware, WebSockets und External-API akzeptieren langlebige JWTs/PATs im URL-Query-String. Gleichzeitig erlaubt `web/next.config.ts:79` in Produktion `script-src 'self' 'unsafe-inline'` und `connect-src 'self' https: wss:`.
- **Auswirkung:** Jede XSS-Schwachstelle kann das Session-Token direkt aus dem `localStorage` auslesen und Daten an beliebige externe `https:`/`wss:`-Ziele exfiltrieren; Query-String-Tokens landen in Proxy-/Access-Logs, Browser-Verlauf und `Referer`-Headern.
- **Behebung:** `tide_session_token` aus `localStorage` entfernen und ausschließlich auf `HttpOnly; Secure; SameSite`-Cookies setzen; `?token=`/`?api_token=` im Backend ablösen (für SSE/WS nur kurzlebige Einmal-Tickets); CSP auf Nonces (`PALETTE_BOOT_SCRIPT` in `layout.tsx`) und explizite `connect-src`-Origins härten.

#### `H-06` Schwache 5-stellige PIN-KDF & Legacy-Downgrades (`100k` PBKDF2 / unsalted SHA-256)
- **Dateien & Zeilen:** `web/src/app/auth/page.tsx:146-147,298,354`, `web/src/lib/crypto.ts:83-84,189-203,262-275`, `cloud/internal/api/auth.go:187-200`
- **Ursache:** `10^5 = 100.000` mögliche numerische PINs schützen über `PBKDF2-SHA-256` das `EncryptedVault` (dessen `EncryptedPepper` auf dem Server liegt und bei `verify-otp` ausgeliefert wird). Zudem fallen `decryptPrivateKey` und `unlockVault` bei jedem Fehler still auf `100.000` PBKDF2-Iterationen zurück, und `verifyAndMigratePin` akzeptiert serverseitig noch ungesalzene SHA-256-Legacy-PINs.
- **Auswirkung:** Bei Server-/Backup-Zugriff ist das Nutzer-Vault trivial offline brute-forcebar.
- **Behebung:** Starke Passphrase (12+ Zeichen / Entropieprüfung) mit Argon2id oder ≥600k PBKDF2 erzwingen; KDF-Parameter explizit speichern statt stillem Downgrade; Legacy-SHA-256-PINs ausphasen.

#### `H-07` `RequestOTP` E-Mail-Bombing & `VerifyOTP` Lockout-Race-Condition
- **Dateien & Zeilen:** `cloud/internal/api/auth_otp.go:36-142,233-269`, `cloud/internal/api/ratelimit.go:223-269`
- **Ursache:** `RequestOTP` besitzt weder einen Per-User-Resend-Cooldown noch eine Prüfung gegen `otpLimiter.IsLocked(user.ID)`. In `VerifyOTP` liegen `IsLocked(user.ID)` (`L234`), `h.mu.Lock()` (`L245`) und `RecordFailure(user.ID)` (`L255`) nicht gemeinsam unter Lock; `otpCache[user.ID]` wird erst gelöscht, wenn `RecordFailure` `locked == true` meldet.
- **Auswirkung:** Unbegrenzter OTP-E-Mail-Spam (inkl. Resend-Kontingent-Erschöpfung) sowie parallele `VerifyOTP`-Requests, die das 5-Versuche-Limit gegen einen 6-stelligen Hex-Code umgehen.
- **Behebung:** Per-Account-Cooldown (z. B. 60 s) und Lockout-Check in `RequestOTP`; Fehlversuchszähler direkt auf dem `otpEntry` unter `h.mu.Lock()` atomar prüfen/erhöhen und Eintrag beim 5. Fehlversuch sofort löschen.

#### `H-08` Unauthentifiziertes Profil-/Public-Key-Scraping & `SearchPublicData`-Datenleck
- **Dateien & Zeilen:** `cloud/internal/api/profiles.go:35-79`, `cloud/internal/store/sqlite.go:2550-2591`
- **Ursache:** `GET /api/v1/profiles/{userID}` liegt außerhalb von `AuthMiddleware` und liefert bei fehlendem Nutzer `500` statt `404` (ID-Enumeration + Scraping von `username`, `public_key`, Avatar). In `SearchPublicData` fehlt in der Profilsuche der Filter `profile_status > 0 OR is_verified = 1` (alle privaten Profile werden gefunden), die Notizsuche ignoriert `visibility = 'public'` und `deleted_at IS NULL`, und E-Mails werden per ungesalzenem `sha256.Sum256` abgeglichen.
- **Auswirkung:** Unauthentifiziertes User-ID-Scraping, Offenlegung privater Profile, geleakte Papierkorb-Notizen und E-Mail-Enumeration.
- **Behebung:** `GET /profiles/{userID}` hinter `AuthMiddleware` legen (oder minimalen Public-Endpunkt mit Rate-Limit + `404`), `SearchPublicData` strikt auf `profile_status > 0` / `visibility = 'public'` / `deleted_at IS NULL` filtern und E-Mail-Blind-Index-Lookup aus öffentlicher Suche entfernen.

#### `H-09` Fehlendes Graceful Shutdown & Live-SQLite-Backup-Korruptionsrisiko
- **Dateien & Zeilen:** `cloud/cmd/server/main.go:445-469`, `tide.sh:61-71,122`
- **Ursache:** `main.go` ruft direkt `srv.ListenAndServe()` ohne `signal.NotifyContext` (`SIGINT`/`SIGTERM`), `srv.Shutdown(ctx)`, `sqliteStore.Close()` oder Stoppen der Goroutinen/Limiter. Gleichzeitig führt `tide.sh:62-71` bei laufendem Backend `tar -czf` und `cp -a tide.db*` direkt auf den Live-SQLite-Dateien aus (ignoriert dabei Checkpoint-Fehler mit `|| true`).
- **Auswirkung:** Bei `pm2 reload` oder Container-Neustarts werden laufende Uploads, WebSockets und SQLite-Schreibvorgänge hart abgebrochen; Live-`cp`/`tar`-Backups im WAL-Modus können inkonsistente oder korrupte Datenbank-Snapshots erzeugen.
- **Behebung:** Sauberes Shutdown-Handling in `main.go` implementieren; in `tide.sh` zwingend `sqlite3 "$db" ".backup '$backup_dir/tide.db'"` (oder `VACUUM INTO`) verwenden.

#### `H-10` Unvollständige Parent-/Group-/Tag-ID-Validierung (External API) & `apiFetch`-Auth-Header-Overwrite
- **Dateien & Zeilen:** `cloud/internal/api/external_events.go:180-201,362-416`, `cloud/internal/api/external_notes.go:461-463,561`, `web/src/lib/api.ts:267-274`
- **Ursache:** In der External API wird bei `CreateEvent`/`UpdateEvent` nur `parent_id` (bzw. `groupIDs[0]`) über `validateEventParent` geprüft – und selbst dort ohne Typ-Prüfung (`FileTypeFolder`). Weitere IDs in `group_ids` sowie alle `tag_ids` in `CreateNote`/`UpdateNote` werden ungeprüft gespeichert. Im Frontend überschreibt `apiFetchInner` (`api.ts:270-273`) jeden explizit übergebenen `Authorization`-Header (z. B. frischer OTP-Token für Key-Proof/Vault-Ersatz) mit `localStorage.getItem("tide_session_token")`.
- **Auswirkung:** Fremde File-/Tag-IDs können in Metadaten verlinkt werden; im Frontend schlagen Recovery-/Key-Proof-Aufrufe fehl oder senden das falsche Session-Token, wenn ein altes `localStorage`-Token existiert.
- **Behebung:** Jede `group_id`/`tag_id` auf Existenz, Typ und Zugriffsrecht prüfen; in `apiFetchInner` nur dann einen Default-Token setzen, wenn kein `Authorization`-Header gesetzt wurde.

#### `H-11` Frontend-Performance-Hotspots: `fetchDirectory`-Viererpack, ProseMirror-Traversals & Editor-Remount
- **Dateien & Zeilen:** `web/src/store/slices/createFsSlice.ts:249-315,474`, `web/src/components/extensions/InlineFormulas.ts:166-171`, `web/src/components/extensions/AnimatedEmoji.ts:20-51`, `web/src/components/extensions/BlockId.ts:18-27,117-156`, `web/src/components/Editor/useTipTapConfig.ts:396`, `web/src/components/Editor.tsx:47`, `web/src/app/page.tsx:77-146,440-460`, `web/src/components/Calendar/CalendarWeekTimeGrid.tsx:226-264`, `web/src/components/Layout/Sidebar.tsx:84`, `web/src/components/Layout/sidebar/FolderItem.tsx:73`
- **Ursache & Beleg (inkl. Live-Audit 24.11.2026):**
  - `fetchDirectory(null, true)` feuert nach jeder Mutation pauschal 4 parallele List-GETs (`/files`, `/files?type=event`, `/tasks`, `/todos?limit=500`) -> `64 / 98` Reqs bei 8 Terminen (`C4`), `84 / 236` Reqs bei 8 Notizen (`08`).
  - `InlineFormulas` (auch bei `selectionSet`), `AnimatedEmoji` und `BlockId` (bis zu 3× pro Transaktion) durchlaufen das gesamte ProseMirror-Dokument -> Probe 2 (Formeln/Emojis) bricht auf **`p50 125,4 ms / p95 362,6 ms` (`31,3 FPS`, `18 Long Tasks`)** ein (vs. `19,5 ms @ 59,9 FPS` ohne).
  - `<CollaborativeEditor key={activeTabId}>` (`Editor.tsx:47`) erzwingt harte Unmounts bei jedem Tab-Wechsel (`170,5–236 ms p50`, `23–76 Reqs`).
  - `Dashboard` (`page.tsx`) hält ~26 `useState`-Hooks und reicht `66` Props an nicht-memoisiertes `DashboardDesktopContent` weiter; `10` Komponenten (inkl. `Sidebar.tsx:84` und `FolderItem.tsx:73`) destrukturieren `useDataStore()` ohne Selektor; `CalendarWeekTimeGrid` übergibt allen 42 `<DayColumn>`s ungefiltert `allEvents`.
- **Behebung:** Granulare Slice-Refreshes + SSE-Coalescing (`150–300 ms`); inkrementelles `DecorationSet.map()`; `key={activeTabId}` entfernen; `eventsByDay`-Map für Kalender; `useShallow`-Selektoren in `Sidebar`/`FolderItem` und `React.memo` für Dashboard-Subtrees.

#### `H-12` Single-Node-Skalierungs- & Concurrency-Engpässe (SQLite-Writes, SSE-Broker, WS-Buffer, Rate-Limiter)
- **Dateien & Zeilen:** `cloud/internal/store/sqlite.go:45,2775-2789`, `cloud/internal/api/external.go:157-161`, `cloud/internal/api/events.go:36-37,59-61,173,206,303,367-400`, `cloud/internal/api/websocket.go:103,402,576`, `cloud/internal/api/ratelimit.go:104-122,189-269`
- **Ursache:**
  1. `AppendYjsWAL` führt bei **jedem einzelnen CRDT-Update-Frame** ein synchrones `INSERT` über den 1-Connection-Writer (`MaxOpenConns(1)`) aus; `authenticatePAT` spawnt pro API-Request ein `UPDATE api_tokens SET last_used_at`.
  2. `Broker.messages`, `newClients` und `closedClients` (`events.go:59-61`) sind **unbuffered** – jeder `Broadcast()` blockiert HTTP-Handler bis alle Clients bedient sind; `userStatus`/`lastSeen` werden nie bereinigt; `reaper()` läuft ohne Stop-Kanal.
  3. `GlobalHub` hat **keine Connection-Limits** (weder global noch pro User/Raum); `send: make(chan []byte, 256)` × `10 MB` Read-Limit erlaubt bis zu **2,56 GB Puffer pro langsamem Client**; `/api/ws/notes/{fileID}` hat kein Rate-Limit.
  4. `IPRateLimiter.evictLocked` scannt bei `>=10.000` Einträgen die gesamte Map `O(N)` unter Lock; `FailedAttemptTracker` besitzt weder `maxEntries` noch `Stop()`.
  5. Sämtlicher Echtzeit- und Auth-State (`GlobalHub`, `Broker`, `otpCache`, `keyChallenges`, `wsTicketStore`, `IPRateLimiter`, SQLite, lokale Blobs) liegt prozesslokal.
- **Auswirkung:** Lock-Contention, Handler-Blockaden, potenzieller OOM-DoS durch langsame WebSockets/IP-Spikes und prinzipielle Unmöglichkeit horizontaler Skalierung.
- **Behebung:** Yjs-WAL-Writes puffern (250–500 ms Flush); `last_used_at` drosseln (1× pro 5 Min.); SSE-Kanäle puffern + `offline`-Status evicten; WS-Byte-Budget & Connection-Limits einführen; Batch-Eviction im Rate-Limiter; mittelfristig Postgres + S3 + Redis/NATS.

---

### 5.3 Mittlere Befunde (`M-01` bis `M-12`)

| ID | Thema & Betroffene Stellen | Kurzanalyse & Risiko | Konkrete Behebung |
| :--- | :--- | :--- | :--- |
| **`M-01`** | **Stateless 30-Tage-JWTs ohne Widerruf** (`auth_otp.go:355-366`, `dev_auth.go:272-276`, `middleware.go:124-143`) | `Logout` löscht nur das Cookie; PIN-Wechsel, Vault-Reset und Passkey-Löschung invalidieren gestohlene JWTs bis zu 30 Tage lang nicht. | Kürzere JWT-TTL + Refresh-Token oder serverseitige `token_version` pro User in `AuthMiddleware` prüfen und bei Logout/Security-Änderungen inkrementieren. |
| **`M-02`** | **Globale Slot-Erschöpfung, fehlende Body-Limits & WS/CSRF-Lücken** (`auth_challenge.go:96-111`, `middleware.go:150-217,268-277`, `websocket.go:34-83,505-549`, `auth.go:205-216`, `passkey.go:123`) | Ein Nutzer kann globale 10k-Maps (`keyChallenges`, `wsTicketStore`) füllen; WS-Tickets nicht an `fileID` gebunden; `checkOrigin` erlaubt leeren Origin, `http://` + hardcoded Drittdomains; `CSRFMiddleware` prüft kein Schema; fehlende `MaxBytesReader` auf Auth-JSON-Endpunkten. | Per-User-Caps (analog `ceremonyStore`); `wsTicketEntry` an `fileID` binden; `Origin`-Schema prüfen; leeren Origin bei Cookie-WS ablehnen; `MaxBytesReader` durchgängig anwenden. |
| **`M-03`** | **Klartext-`login_code` ohne DB-TTL & ungesalzene Blind-Indizes** (`sqlite.go:121-123,937-951`, `auth.go:78-81`) | OTP-Codes liegen im Klartext ohne `expires_at` in `users`; `hashString` nutzt ungesalzenes SHA-256 ohne E-Mail-Trim/Lowercase (Wörterbuch-Umkehrung & Case-Bugs). | `login_code` hashen + DB-Ablaufzeit erzwingen; E-Mails kanonisieren und `HMAC-SHA256` mit Server-Pepper für Blind-Indizes nutzen. |
| **`M-04`** | **API-Token-Härtung & `events`/`tags`-Scope-Lücke** (`api_tokens.go:52-59,127-240`, `external_events.go`, `external_tags.go`) | Jede gealterte Session kann unbegrenzte nicht-ablaufende `*`-Tokens erstellen; `safe:` wird ohne Validierung akzeptiert; `events`/`tags` ignorieren `safe:`/`folder:`-Scopes. | `safe:<id>` bei Erstellung validieren, Token-Anzahl pro User deckeln, Step-Up/Fresh-Session für `*`-Tokens verlangen, Scope-Filter in `events`/`tags` prüfen. |
| **`M-05`** | **Settings-Case-Bypass, Preference-Injection, `getFileSafe` & Zyklen** (`external_settings.go:209-271,414-464`, `external.go:397-402`, `external_folders.go:315-325`) | Case-sensitive Map-Prüfung vs. case-insensitives `json.Unmarshal` umgeht Limits; Raw-Map-Merge speichert unbekannte Keys; `getFileSafe` traversiert mit `file.OwnerID` (leakt fremde Safe-Namen); `UpdateFolder` prüft Zyklen ohne `visited`-Map nur bis Tiefe 50. | `DisallowUnknownFields()`, Case-Kollisionen ablehnen, validiertes Struct serialisieren; `getFileSafeForUser(ctx, file, userID)` verwenden; `visited`-Map bei Zyklenprüfung. |
| **`M-06`** | **Client-PIN-Lock-Bypass & defektes Teilen geschützter Dateien** (`pinSecurity.ts:21-47,73-193`, `autoSaveHelpers.ts:409-428`, `shareLogic.ts:45-153`) | `hashPin` nutzt nur `100k` Iterationen; ohne `pwd_iv` sperrt `pinSecurity` nur per änderbarem `sessionStorage`; `shareLogic` ignoriert `has_custom_password`/`pwd_iv` beim Teilen. | Durchgängig Double-Wrapping (`pwd_iv`) + `600k` PBKDF2 erzwingen; `shareLogic` um Passwort-Unwrap/Re-Wrap oder `pwd_iv`-Weitergabe ergänzen. |
| **`M-07`** | **Unverschlüsselte `syncQueue`, Logout-Rückstände & Legacy-JWK-Listener** (`syncQueue.ts:43-85`, `api.ts:53-78,145`, `auth/page.tsx:178-202`) | Offline-Mutationen (Todos/Events) liegen im Klartext in IndexedDB; `tide_user_name`, `tide_stats_*`, `tide_ordered_note_ids` überleben Logout; `logout`-Fetch ohne `Authorization`-Header; totes `tide_auth_signal`-Event importiert JWKs in IDB. | `syncQueue` über `offlineCacheCrypto` verschlüsseln; fehlende `localStorage`-Keys in `clearAllSessionData` aufnehmen; `tide_auth_signal`-Listener in `auth/page.tsx` entfernen. |
| **`M-08`** | **TipTap `Link`-Schema-Prüfung & SSE-Presence-Scoping** (`useTipTapConfig.ts:274,482-488`, `events.go:102-144`) | `javascript:`-Links werden nur im `handleClick` blockiert, nicht per `Link.configure({ isAllowedUri })` im Parser/DOM; SSE-Presence ignoriert `Status == "accepted"` und `c.UserID` und fällt bei `store==nil` auf globalen Broadcast zurück. | `Link.configure({ isAllowedUri: ... })` + `rel="noopener noreferrer nofollow"` setzen; `broadcastPresenceScoped` auf akzeptierte Kontakte (`UserID`/`ContactID`) korrigieren und bei `store==nil` fail-closed agieren. |
| **`M-09`** | **Docker-, Proxy- & Download-Konfiguration** (`docker-compose.yml`, `cloud/Dockerfile`, `web/Dockerfile`, `next.config.ts:69,109-125`, `files_blobs.go:207-263`, `main.go:250`) | Beide Container laufen als `root` ohne `HEALTHCHECK`; `web/Dockerfile` nutzt `npm run dev`; feste Compose-Dev-Secrets; `next.config.ts`-Rewrite `localhost:${backendPort}` bricht in Compose; `DownloadPublicFile` vergisst `SetWriteDeadline`-Reset (60s-Abbruch); `Compress(5)` komprimiert verschlüsselte Blobs. | Non-Root-`USER` + `HEALTHCHECK`, Multi-Stage Prod-Build für `web/Dockerfile`, `API_BACKEND_URL`-Env für Rewrites, `SetWriteDeadline(time.Time{})` in `DownloadPublicFile`, Compression für binäre Blobs/SSE überspringen. |
| **`M-10`** | **SQLite-Abfrage- & Storage-Ineffizienzen** (`sqlite.go:561,1306,1332-1353,1630-1635,2550-2572,2615,2735-2768`, `sqlite_notes.go:40-126`, `files_blobs.go:104-144`) | `json_extract`-Full-Scans (`deleted_at`, `access_keys`); fehlende SQL-`LIMIT`s (Vollladen + Go-Slicing); N+1-Deletes in `DeleteFile`; Reads auf `s.DB`; globale `seq_id % 50` bricht Pro-Datei-Compaction; `DownloadFile` ohne `ETag`/`Content-Length`; synchrones `10 MB` `io.ReadAll` bei Overwrite; kein Orphan-Blob-GC. | `deleted_at`-Spalte + Partial Index, `file_access_keys`-Tabelle, SQL-`LIMIT`, `WHERE ... IN`, `s.readDB()`, Pro-Datei-WAL-Zähler, `ETag`/`Content-Length` und asynchrones Overwrite-Backup. |
| **`M-11`** | **Abhängigkeits-, Test- & Subprojekt-Risiken** (`web/package.json`, `recovery.test.ts:110`, `core/SECURITY_FINDINGS.md`, `mcp/src/client.ts:65`) | `npm audit --omit=dev` meldet `5` Vulns (`1` High `serialize-javascript` via `@ducanh2912/next-pwa`); `4/142` Vitest-Dateien schlagen fehl (u. a. 5s-Timeout); inaktives Rust-`core/` trägt `16` offene Security-Findings; `mcp/client.ts` ohne `AbortSignal.timeout`. | PWA-Paket ersetzen/aktualisieren (`@serwist/next`), Test-Timeouts/Fails beheben, `core/` klar archivieren/abtrennen, `AbortSignal.timeout(30_000)` in `mcp/client.ts`. |
| **`M-12`** | **API-, Store- & Krypto-Architektur-Inkonsistenzen** (`cloud/internal/api/`, `main.go:431-435`, `crypto.ts`/`cryptoV2.ts`, `useDataStore.ts`, `AGENTS.md`) | `484` Plaintext-`http.Error` vs. `11` JSON-Errors (gemischt in denselben Dateien); `19` Legacy-`/api/`-Calls + `/api/files`-Alias; Dual-Crypto-Schulden inkl. `testCryptoV2()` im Prod-Code und fehlerhafter `loadAndMigrateFile`; `22` fragmentierte Zustand-Stores; veraltetes `AGENTS.md`. | Einheitliches `writeJSONError`, Legacy-`/api/`-Aufrufe auf `/api/v1/` migrieren, `testCryptoV2` in Tests verschieben, `AGENTS.md` aktualisieren. |

---

### 5.4 Niedrige & Hygiene-Befunde (`N-01` bis `N-06`)

- **`N-01` Produktions-Krypto-Logging & globale `window.__tide*`-Objekte:** `crypto.ts:55-58,303-404` exportiert für Fingerprints JWKs, loggt Diagnosedaten in Produktion und schreibt bei JSON-Parse-Fehlern sogar `decoded`-Klartext ins `console.error`; `ShareModal.tsx:522` (`window.__tideActiveDEK`) und `Editor.tsx:76` (`window.__tideActiveYDoc`) exponieren aktive Krypto-/Dok-Instanzen global.
- **`N-02` DB-Fehler-Lecks, Enumeration & fehlende Root-Quota:** `files_crdt.go:40,84,101` gibt rohe `err.Error()`-Strings aus; `contacts.go`, `messages.go`, `files_shares.go`, `auth_otp.go` und `files_blobs.go:242-245` (`403` vs. `404`) erlauben Account-/Datei-Enumeration; `UploadFile` (`files_blobs.go:61-92`) prüft Quotas nur für Ordner (`TOCTOU`), nicht für Root-Dateien.
- **`N-03` Store-Defense-in-Depth-Gaps & JSON-Pfad-Hardening:** Fehlende Caller-ID-Prüfungen in Store-Methoden (Shares, Backups, WAL, Links, Messages, Contacts, Quicknotes); unescapte `$."<userID>"`-JSON-Pfade (`sqlite.go:804-816,1469,1634`); fehlendes `SetVisibility`-Enum; N+1 in `ValidateTabs` (`tabs.go:38-86`); `AcceptShare` (`sqlite.go:1596`) und `RemoveShare` (`L1469`) verschlucken Fehler; `GetAPITokenByHash` prüft `expires_at` nicht im SQL; `nullableUserString` (`sqlite_recovery.go:20-23`) konkateniert Spaltennamen ohne Switch-Allowlist.
- **`N-04` Frontend-/Cookie-Randhärtungen:** `MathBlock.tsx:39-53` setzt keine `maxSize`/`maxExpand`-Grenzen in KaTeX (Macro-DoS durch Kollaboratoren); `AuthGuard.tsx:84` prüft veralteten IDB-Cache-Key `api_cache_/api/v1/auth/me` statt user-präfixiertem `mirrorRead`; Cookie-`Secure` traut `X-Forwarded-Proto` auch ohne Trusted-Proxy-Check (`middleware.go:125-127`); `EncryptedPepper` fehlt `user.ID`-AAD; `Register` prüft keine `rsaPub.N.BitLen() >= 2048`.
- **`N-05` Code-Sauberkeit, Monolithen & Repo-Ballast:** `47` Produktivdateien > 500 LOC (Spitzen: `sqlite.go` 3.595 L, `ChatPanel.tsx` 1.597 L, `quicknotes.go` 1.198 L); `574` ESLint-Errors (`+17`); `481` `any`; `1.135` Hardcoded-Visual-Tokens; `6` Raw-`fetch`; `189 MB` Build-Tarballs in `web/`; `64,13 MB` `web/public` (`tide.apk` 22,4 MB, Emoji-SVGs 40,8 MB, `favicon.png` 358 KB); `8` tote Dateien (`WeekView.tsx` 847 L, `fileSupport.ts` 434 L, `useLongPress.ts` 210 L, `useTodoDragAndDrop.ts` 163 L, `PartnerProfileHeader.tsx` 135 L, `EventDock.tsx` 98 L, `MobileSplash.tsx` 6 L, `useIslandStore.ts` 1 L); `8` ungenutzte Pakete (`recharts`, `@xyflow/react`, `iconsax-react`, 5 TipTap/Yjs-Pakete); `0 B` `useMobileSwipeGestures.ts` im Root + `.build-main.log` + `.agent_comm/` + `web/AGENTS.md`.
- **`N-06` Kritische Test-Abdeckungslücken:** `0` dedizierte Unit-Tests für `files.go`, `files_shares.go`, `files_blobs.go`, `files_crdt.go`, `websocket.go`, `middleware.go`, `api_tokens.go`, `auth_otp.go`, `contacts.go`, `messages.go`, `blob.go` (Go) sowie `api.ts`, `crypto.ts`, `yjsE2EEProvider.ts`, `quicknotesApi.ts`, `pinSecurity.ts`, `useAutoSaveSync.ts`, `useSessionRestore.ts` und alle Haupt-Zustand-Slices (Web).

---

## 6. Performance-, Konsistenz- & Sauberkeits-Tiefenanalyse

### 6.1 Integration der Live-Messungen (24.11.2026) & Statische Hotspots
Die Browser-Messungen vom 24.11.2026 (`76/100`, Commit `0f18f76`) zeigen deutliche Fortschritte bei Erstladen (`164 ms` FCP Desktop / `296 ms` LCP Mobile 4× CPU), Gzip-Kompression (`-80..90 %`) und Speichersicherheit (`YjsE2EEProvider`-Heap nach 72× Tab-Thrash + GC sauber von `87,43 → 64,31 MB`). Statisch verbleiben jedoch folgende Bremsen:
- **Netzwerk-Burst (`createFsSlice.ts`):** `64–84` unnötige List-GETs in Batch-Szenarien.
- **Editor-CPU (`InlineFormulas`, `AnimatedEmoji`, `BlockId`, `Editor.tsx:47`):** Volldokument-Scans drücken die Formel-Tipplatenz auf `p95 362,6 ms` (`31,3 FPS`); `katex` und `framer-motion` (in `SidebarNavTree`, `FileItem`, `FolderItem`, `DayColumn`, `Modal` usw.) laden synchron im Shell-/Editor-Pfad.
- **Root-Re-Renders (`page.tsx` + `Sidebar.tsx` + `FolderItem.tsx`):** `26` Root-States + `66`-Prop-Weitergabe an unmemoisiertes `DashboardDesktopContent` + `10` Whole-Store-`useDataStore()`-Aufrufe.
- **Backend-Blob-Latenz:** `DownloadFile` (`files_blobs.go:149-205`) sendet kein `ETag`/`Content-Length`; Overwrite in `files.go:438-460` liest bis `10 MB` synchron vor Start der Backup-Goroutine.

### 6.2 Top-Monolithen (> 800 LOC, ohne Tests)

| Bereich | Datei | Zeilen | Hauptproblem |
| :--- | :--- | :---: | :--- |
| Go Store | `cloud/internal/store/sqlite.go` | **3.595** | Vermischt Schema, Files, Shares, Messages, Contacts, CRDT, Quicknotes |
| Web Chat | `web/src/components/Chat/ChatPanel.tsx` | **1.597** | UI, SSE-Client (`?token=`), Krypto und Nachrichtenstatus in einer Datei |
| Web CSS | `web/src/app/globals.css` | **1.370** | `143` Hex- + `80` `rgba()`-Definitionen |
| Web Editor | `web/src/components/extensions/mentionSuggestion.tsx` | **1.323** | `51` `any`-Typen + direkte Store-/Metadata-Logik |
| Go API | `cloud/internal/api/quicknotes.go` | **1.198** | REST, Tree, Uploads, Downloads, Access-Control & WS-Hub vermischt |
| Web Lib | `web/src/lib/bundleImportExport.ts` | **1.157** | `22` `any`-Typen, V1/V2-Import/Export-Logik gekoppelt |
| Web Todo | `web/src/components/Todo/TodoList.tsx` & `TodoTreeItem.tsx` | **1.112 / 1.100** | Große UI- & Drag/Filter-Logik |
| Web Quicknotes | `web/src/app/notes/[slug]/page.tsx` | **1.106** | Komplette Seite inkl. globalem `window.__tide_active_attachments` |
| Web Calendar | `web/src/components/Calendar/DayColumn.tsx` | **1.039** | Bekommt ungefiltertes `allEvents` für 42 Spalten |

---

## 7. Skalierbarkeits- & Architektur-Analyse

| Stufe | Was zuerst bricht | Technische Ursache | Architektur-Antwort |
| :--- | :--- | :--- | :--- |
| **~100 gleichzeitige Nutzer** | Schreib-Jitter beim gemeinsamen Tippen; Verbindungsabbrüche bei Deploys | Synchrones `AppendYjsWAL` auf SQLite-1-Writer (`MaxOpenConns(1)`); ungebuffertes `Broker.messages` blockiert HTTP-Handler (`events.go:61,303`); kein Graceful Shutdown (`main.go:467`). | Yjs-WAL puffern (250–500 ms), `Broker`-Channels puffern (`1024`), `SIGINT`/`SIGTERM`-Shutdown ergänzen. |
| **~1.000 gleichzeitige Nutzer** | Langsame Verzeichnis-/Such-Queries; Leck/Last durch globale `public`-Dateien; Lock-Contention | `json_extract`-Full-Scans (`sqlite.go:1630-1635,2559-2572`); `OR visibility='public'` in `recursive=true` lädt alle öffentlichen Dateien; `UPDATE api_tokens` pro PAT-GET (`external.go:157`). | Materialisierte `deleted_at`-Spalte + Index, `file_access_keys`-Join-Tabelle, SQL-`LIMIT`s, `last_used_at` drosseln (5 Min.). |
| **~10.000+ gleichzeitige Nutzer** | **Horizontale Skalierung unmöglich**; RAM-/I/O-Erschöpfung | Prozesslokale In-Memory-States (`GlobalHub`, `Broker`, `otpCache`, `keyChallenges`, `wsTicketStore`, `IPRateLimiter`) + lokale SQLite + lokale Blobs (`cloud/data/blobs`). `IPRateLimiter` degradiert ab 10k IPs zu `O(N)`-Mutex-Scans; WS-Send-Queue ohne Byte-Cap (bis 2,56 GB/Client). | **Stateless Backend:** PostgreSQL (mit RLS/Indizes), S3/R2-Object-Storage, Redis (Rate-Limiter, OTP/Tickets, Presence) & Redis/NATS Pub/Sub für SSE/WS-Rooms. |

---

## 8. Priorisierte 4-Phasen-Maßnahmen-Roadmap

### Phase 0 — Sofortmaßnahmen (24–48 Stunden, vor weiterem Produktiveinsatz)
1. **`K-01` schließen:** `EncryptedVault` & `EncryptedPepper` aus `GetConversations` (`sqlite.go:2197`) und per `json:"-"` aus `db.User` (`models.go:19-20`) entfernen.
2. **`K-03` schließen:** `setActiveDEK(newDEK)` in `ShareModal.tsx` aufrufen, `onKeyRotated` in `Editor.tsx` implementieren, Dokument vor Rotation sicher laden und V2-Format für `secured_meta` nutzen.
3. **`K-04` schließen:** `ParentID`, `deleted_at` und `unencrypted`-Wechsel in `files.go` auf `OwnerID` beschränken; stilles Client-Downgrade auf `derivePublicNoteDEK` (`autoSaveHelpers.ts`) blockieren; External API bei verschlüsselten Dateien blockieren.
4. **`H-01` & `H-03` schließen:** `fs.status = 'accepted'` & Entfernung globaler `public`-Dateien in `ListAccessibleFiles`; leere `safe:`/`folder:`-Scopes ablehnen und Workspace-/Linked-Safe-Prüfungen in `external_*.go` korrigieren.
5. **`H-04` (XSS/Hijack) & `H-09` schließen:** `http.DetectContentType` + Allowlist in `DownloadQuicknoteFile`, Ownership-Claim nach Erstellung sperren; `SIGINT`/`SIGTERM`-Shutdown in `main.go` + `sqlite3 .backup` in `tide.sh` umstellen; `SetWriteDeadline`-Reset in `DownloadPublicFile`.

### Phase 1 — Kurzfristig (Woche 1–2)
1. **`K-02` planen & umsetzen:** Vertrauliche `metadata`-Felder (`title`, `safe`, `tagIds`, Event-Details) in DEK-verschlüsselte Payloads verlagern und `/api/v1/todos` auf V2-Envelope-Encryption migrieren.
2. **`H-02` & `H-08` schließen:** Store-Methoden in `sqlite.go` um `owner_id`-Constraints (inkl. rekursive CTEs) härten; `GET /profiles/{userID}` absichern und `SearchPublicData` bereinigen.
3. **`H-05`, `H-06` & `H-07` schließen:** `tide_session_token` aus `localStorage` & `?token=` entfernen; CSP auf Nonces + explizite `connect-src` umstellen; starke Passphrase statt 5-stelliger PIN; `RequestOTP`-Cooldown & atomarer `VerifyOTP`-Lock.
4. **`H-10` schließen:** `group_ids`/`tag_ids`/`FileTypeFolder` in External API validieren; `apiFetch`-Auth-Overwrite beheben (`!headers["Authorization"]`).

### Phase 2 — Mittelfristig (Monat 1)
1. **Performance (`H-11`, `M-10`):** `fetchDirectory` in granulare Slice-Refreshes + SSE-Debouncing aufteilen; inkrementelle ProseMirror-Decorations; `Editor`-Remount (`key={activeTabId}`) auflösen; `eventsByDay`-Map im Kalender; `useShallow` in `Sidebar`/`FolderItem`; SQLite-Indizes (`deleted_at`, `file_access_keys`), `s.readDB()`, `ETag`/`Content-Length`.
2. **Concurrency & Token-Härtung (`H-12`, `M-01`–`M-08`):** Yjs-WAL-Pufferung; gepufferter SSE-Broker + Presence-Fix; WS-Byte-Limits; JWT-`token_version` / kürzere TTL; Per-User-Caps für `keyChallenges`/`wsTicketStore` + `fileID`-Binding; `HMAC-SHA256` Blind-Indizes; verschlüsselte `syncQueue` + sauberes Logout-Cleanup + TipTap `Link`-Allowlist.
3. **Container & Deps (`M-09`, `M-11`):** Non-Root-Dockerfiles + Multi-Stage `web/Dockerfile` + `HEALTHCHECK`; `@ducanh2912/next-pwa` ablösen/updaten (`serialize-javascript`); `4` Vitest-Fails beheben; `AbortSignal.timeout` im `mcp`-Client.

### Phase 3 — Langfristig (Hygiene & Skalierung auf 10.000+ Nutzer)
1. **Code-Sauberkeit & Tests (`M-12`, `N-01`–`N-06`):** `189 MB` Build-Tarballs + `web/public/tide.apk` + tote Dateien + `8` ungenutzte npm-Pakete entfernen; `sqlite.go`, `ChatPanel.tsx` & `quicknotes.go` modularisieren; einheitliches `writeJSONError` im Go-Backend; Legacy-`/api/`-Calls auf `/api/v1/` umstellen; ESLint-Errors (`574 → <557 → 0`) abbauen; Unit-Tests für `api.ts`, `crypto.ts`, `yjsE2EEProvider.ts`, `files*.go`, `websocket.go` und `middleware.go` ergänzen.
2. **Horizontale Skalierung:** Migration von SQLite/Local-Disk/In-Memory-State auf PostgreSQL + S3/R2 + Redis/NATS Pub/Sub.
