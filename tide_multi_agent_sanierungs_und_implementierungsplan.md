# Tide — Multi-Agent Sanierungs- & Implementierungsplan (Master-Blueprint)

Dieses Dokument dient als verbindliche Spezifikation für Entwickler und autonome KI-Coding-Agenten. Es gliedert alle identifizierten Schwachstellen aus den System-Audits in **chronologische Ausführungswellen (Waves)** und **strikt getrennte Agenten-Arbeitsbereiche (Tracks)**, um Merge-Konflikte auszuschließen und Abhängigkeiten sauber aufzulösen.

---

## 0. Globale Regeln für alle Agenten (Strikte Vorgaben)

Jeder Agent **muss** vor und während der Ausführung folgende Grundregeln einhalten:

1. **Kein Kosmetik-Code & keine Dummy-Fallbacks:** Es ist strikt untersagt, Sicherheitsfunktionen durch statische Fallbacks (wie `"123456..."`), `// eslint-disable`-Kommentare, `@ts-ignore`, `as any` oder verworfene Fehler (`_, _ = ...`) zu umgehen.
2. **Strikte Dateigrenzen (File Ownership):** Ein Agent darf **nur** die in seinem Track zugewiesenen Dateien bearbeiten. Müssen Schnittstellen geteilt werden, gilt die Reihenfolge der Ausführungswellen (Waves).
3. **Verifikationspflicht (Definition of Done):** Ein Ticket gilt erst als abgeschlossen, wenn die am Ende jedes Tracks definierten Verifikationsbefehle (`go vet`, `go test`, `npx tsc --noEmit`, `npx vitest`) mit Exit-Code $0$ durchlaufen.
4. **Einhaltung der Dateigrößen-Regel:** Neue oder refaktorisierte Dateien dürfen maximal $500$ Zeilen umfassen (siehe `AGENTS.md` Regel 8).

---

## 1. Ausführungs-Reihenfolge & Parallelisierungs-Matrix (Waves)

Um zu verhindern, dass Agenten gleichzeitig dieselben Dateien bearbeiten oder beim Refactoring ungetesteten Code zerstören, erfolgt die Umsetzung in **4 chronologischen Wellen**:

| Welle (Wave) | Fokus | Parallel ausführbare Agenten-Tracks | Warum diese Reihenfolge? |
| :--- | :--- | :--- | :--- |
| **Wave 1 (Sofort / P0 & P1 Security)** | Akute Sicherheitslücken schließen (Backend & Client Krypto) | **Track A** (Backend Auth & Net Security)<br>**Track B** (Client Key-Storage & Krypto)<br>**Track C** (Backend DB, Blobs & Layer) | Diese 3 Tracks berühren disjunkte Dateipfade (`api/auth.go` vs. `web/src/lib/crypto*` vs. `store/sqlite.go` & `blob.go`) und können **parallel** starten. |
| **Wave 2 (P1 Gatekeeper & Tests)** | Automatisierte Tests & Security-Headers aufbauen | **Track D** (Test-Suite & CI-Pipeline)<br>**Track E** (Frontend Security Headers & XSS) | **Zwingend vor dem großen Refactoring!** Bevor der $4.168$-Zeilen-Monolith zerlegt wird, müssen Krypto-, Store- und API-Tests als Sicherheitsnetz stehen. |
| **Wave 3 (P2 De-Monolithisierung)** | Zerlegung von Store und UI-Monolithen (`< 500` Zeilen) | **Track F-1** (Zustand Store Slices)<br>*danach:* **Track F-2** (`page.tsx` Split)<br>*parallel dazu:* **Track F-3** (Sub-Monolithen) | Zuerst muss `useDataStore.ts` in Slices geteilt werden (**F-1**), bevor `page.tsx` (**F-2**) und Komponenten (**F-3**) darauf umgestellt werden. |
| **Wave 4 (P2/P3 Polish & DevOps)** | Design-Tokens, ESLint-Abbau, Skalierung & Docker | **Track G** (Design-Tokens & ESLint)<br>**Track H** (SSE-Scaling, Backups & Docker) | Erst wenn die Komponenten in kleine Dateien zerlegt sind (Wave 3), lohnt sich das Durchziehen der Design-Tokens und Linter-Fixes ohne Merge-Konflikte. |

---

## WAVE 1: Notfall-Sicherheit, Krypto-Härtung & Datenintegrität

In **Wave 1** können **Agent A**, **Agent B** und **Agent C** gleichzeitig arbeiten, da ihre Dateibereiche strikt voneinander getrennt sind.

---

### Track A: Backend Auth, Krypto & Netzwerk-Härtung (Agent A)

* **Erlaubte Dateien:** `cloud/internal/api/auth.go`, `cloud/cmd/server/main.go`, `cloud/internal/api/websocket.go`, `cloud/internal/api/messages.go`, `cloud/go.mod`, `cloud/go.sum`
* **Verbotene Dateien:** Alle Dateien unter `web/` sowie `cloud/internal/store/` (Ausnahme: Aufruf bestehender Store-Methoden).

#### A.1: OTP-Leakage im API-Response eliminieren (SEC-01 — KRITISCH)
* **Ort:** `cloud/internal/api/auth.go` (Zeilen 218–232)
* **Problem:** Bei fehlendem `RESEND_API_KEY`, im Dev-Mode oder bei Versandfehlern gibt `/api/v1/auth/request-otp` den 6-stelligen OTP-Code im HTTP-JSON-Response zurück (`"otp": otp`).
* **Umsetzung:**
  1. Entferne das Feld `"otp"` **vollständig und bedingungslos** aus allen JSON-Response-Strukturen und `http.ResponseWriter`-Ausgaben.
  2. Wenn die Umgebungsvariable `ENV == "development"` (oder äquivalent) gesetzt ist und kein Mailer konfiguriert ist, gib den OTP ausschließlich im lokalen Server-Log aus: `slog.Info("[DEV ONLY] Generated OTP", "email", req.Email, "otp", otp)`.
  3. Ist der Server im Produktionsmodus und der E-Mail-Versand schlägt fehl oder ist nicht konfiguriert, brich mit HTTP Status $503$ (`Service Unavailable`) oder $500$ ab, ohne den OTP-Code preiszugeben.

#### A.2: PIN-Hashing von ungesalzenem SHA-256 auf Argon2id umstellen (SEC-02 — KRITISCH)
* **Ort:** `cloud/internal/api/auth.go` (Zeilen 68–71, 135)
* **Problem:** Benutzer-PINs werden aktuell mit `sha256.Sum256([]byte(req.PIN))` ohne Salt gehasht (Suchraum $10^4$ bis $10^6$ wird auf GPUs in $< 1\text{ ms}$ geknackt).
* **Umsetzung:**
  1. Implementiere eine Hilfsfunktion `HashPIN(pin string) (string, error)` und `VerifyPIN(pin, encodedHash string) (bool, error)` mittels `golang.org/x/crypto/argon2` (`Argon2id`).
  2. Parameter: Memory $= 64 \times 1024\text{ KiB}$ ($64\text{ MB}$), Iterations $t = 3$, Parallelism $p = 2$, Salt-Länge $= 16\text{ Bytes}$ (`crypto/rand`), Key-Länge $= 32\text{ Bytes}$. Speichere den Hash im Standard-Format `$argon2id$v=19$m=65536,t=3,p=2$<base64-salt>$<base64-hash>`.
  3. **Migrations-Pfad beim Login:** Prüfe in `VerifyPIN`, ob der gespeicherte Hash mit `$argon2id$` beginnt. Falls nein (Legacy-Hex-SHA256 mit $64$ Zeichen), prüfe einmalig gegen `sha256.Sum256` per `subtle.ConstantTimeCompare`. Bei Erfolg: Berechne sofort den neuen `Argon2id`-Hash und aktualisiere den Datensatz in der Datenbank.

#### A.3: Hardcoded Master-Key Fallback entfernen (SEC-06 — HOCH)
* **Ort:** `cloud/cmd/server/main.go` (Zeilen 48–56)
* **Problem:** Fehlt `SERVER_MASTER_KEY`, fällt der Server auf `"12345678901234567890123456789012"` zurück.
* **Umsetzung:**
  1. Prüfe beim Start in `main.go`, ob `os.Getenv("SERVER_MASTER_KEY")` gesetzt ist und nach Dekodierung (oder als String) mindestens $32\text{ Bytes}$ Entropie aufweist.
  2. Falls leer oder zu kurz: Beende den Prozess sofort mit `log.Fatal("FATAL: SERVER_MASTER_KEY environment variable is missing or shorter than 32 bytes. Refusing to start.")`.

#### A.4: Öffentliche Account-Enumeration auf `/api/v1/search` schließen (SEC-05 — HOCH)
* **Ort:** `cloud/cmd/server/main.go` (Zeile 172)
* **Problem:** `api.POST("/search", h.Search)` ist ohne Authentifizierung erreichbar.
* **Umsetzung:**
  1. Verschiebe die Route `/api/v1/search` in die durch `authMiddleware` geschützte Routen-Gruppe.
  2. Füge ein striktes pro-User Rate-Limiting für Suchanfragen hinzu (z. B. maximal $20$ Anfragen pro Minute).

#### A.5: CORS-Präfix-Bypass & Cross-Site WebSocket Hijacking beheben (SEC-07 & SEC-08 — HOCH)
* **Ort:** `cloud/cmd/server/main.go` (Zeilen 114–121) und `cloud/internal/api/websocket.go` (Zeilen 15–19)
* **Problem:** `strings.HasPrefix(origin, "http://localhost")` erlaubt `http://localhost.attacker.com`. Zudem gibt `CheckOrigin` im WebSocket-Upgrader pauschal `true` zurück.
* **Umsetzung:**
  1. Erstelle eine zentrale Funktion `IsAllowedOrigin(origin string) bool`.
  2. Parse `origin` mit `u, err := url.Parse(origin)`. Vergleiche exakt `u.Hostname()` gegen eine konfigurierbare Whitelist aus `os.Getenv("ALLOWED_ORIGINS")` (kommagetrennt). Erlaube `u.Hostname() == "localhost"` oder `"127.0.0.1"` nur, wenn explizit im Dev-Modus gearbeitet wird.
  3. Nutze `IsAllowedOrigin` sowohl in der CORS-Middleware (`main.go`) als auch im `websocket.Upgrader.CheckOrigin` (`websocket.go`).

#### A.6: Umgehung der Kontaktprüfung bei Shares schließen (SEC-11 — MITTEL)
* **Ort:** `cloud/internal/api/messages.go` (Zeilen 108–116)
* **Problem:** `file_share_request` und `event_share` umgehen die Freundschaftsprüfung.
* **Umsetzung:** Entferne den Bypass oder führe einen dedizierten Status `pending_request` ein, sodass Nicht-Kontakte keine direkten Payloads in fremde Postfächer pushen können.

* **Verifikation für Agent A:**
  ```bash
  cd cloud && go vet ./... && go build ./...
  ```

---

### Track B: Client Key-Management & Krypto-Konsolidierung (Agent B)

* **Erlaubte Dateien:** `web/src/lib/crypto.ts`, `web/src/lib/cryptoV2.ts`, `web/src/lib/keyStorage.ts` (neu), `web/src/app/auth/page.tsx` (nur Key-Handling Zeilen 150–180), `web/package.json`
* **Hinweis zu `page.tsx` & `SettingsModal.tsx`:** Da diese Dateien riesig sind, kapselt Agent B die gesamte Speicherlogik in einem neuen Modul `web/src/lib/keyStorage.ts` und ersetzt in `auth/page.tsx`, `SettingsModal.tsx` (Zeile 754) und `app/page.tsx` (Zeile 2088) **ausschließlich** die direkten `localStorage.getItem/setItem("tide_session_key")`-Aufrufe durch Aufrufe an `keyStorage.ts`.

#### B.1: Master RSA Private Key aus `localStorage` entfernen (SEC-03 — KRITISCH)
* **Ort:** `web/src/app/auth/page.tsx:163`, `web/src/components/Settings/SettingsModal.tsx:754`, `web/src/app/page.tsx:2088`
* **Problem:** Der entschlüsselte Master RSA Private Key wird mittels `exportKey("jwk", privateKey)` als Klartext-JSON in `localStorage` (`tide_session_key`) gespeichert und ist bei jedem XSS-Angriff sofort exfiltrierbar.
* **Umsetzung:**
  1. Erstelle `web/src/lib/keyStorage.ts`.
  2. Importiere den entschlüsselten RSA Private Key über `window.crypto.subtle.importKey(..., false, ["decrypt", "unwrapKey"])` zwingend mit **`extractable: false`**.
  3. Speichere das resultierende `CryptoKey`-Objekt direkt in `IndexedDB` (über `idb-keyval` unter einem dedizierten Store). In `IndexedDB` gespeicherte `CryptoKey`-Objekte mit `extractable: false` können selbst bei einem XSS-Angriff nicht als Rohtext/JWK exportiert werden, sondern nur lokal im Browser genutzt werden.
  4. Halte den aktiven Schlüssel zur Laufzeit zusätzlich im RAM-Singleton von `keyStorage.ts` und führe beim App-Start `localStorage.removeItem("tide_session_key")` sowie `sessionStorage.removeItem("tide_session_key")` aus, um Altlasten auf Client-Geräten sofort zu säubern.

#### B.2: Vault-Ableitung (KEK) härten & PIN-Entropie erhöhen (SEC-04 — KRITISCH)
* **Ort:** `web/src/lib/crypto.ts:168` und `web/src/lib/cryptoV2.ts:48`
* **Problem:** Der KEK zum Schutz des Master-Keys wird per PBKDF2 ($100.000$ Iterationen) aus einer 5-stelligen PIN abgeleitet (offline in Sekunden per Brute-Force knackbar).
* **Umsetzung:**
  1. Erhöhe bei PBKDF2-SHA256 die Iterationen für neue Vault-Schlüsselableitungen auf mindestens $600.000$ (aktueller OWASP-Standard) oder integriere ein WebAssembly-basiertes `Argon2id`.
  2. Erzwinge für das Verpacken des Master-Vault-Keys bei Neuregistrierung / Passwortänderung eine vollwertige Passphrase ($\ge 12$ Zeichen) ODER kopple eine kurze PIN zwingend an ein serverseitig gespeichertes, rate-limitiertes High-Entropy-Secret (Server-Assisted Key Wrapping), sodass ein Offline-Brute-Force auf den Vault-Blob ohne Mitwirkung des Servers mathematisch unmöglich ist.

#### B.3: Vollständige Migration von Legacy v1 (`AES-CBC`) auf v2 (`AES-GCM`)
* **Ort:** `web/src/lib/crypto.ts`, `web/src/lib/cryptoV2.ts`, `web/package.json`
* **Problem:** `crypto.ts` (v1) nutzt unauthentifiziertes `AES-CBC` mit nur $10.000$ PBKDF2-Iterationen und schleppt `crypto-js` als Bundle-Ballast mit.
* **Umsetzung:**
  1. Markiere alle Encrypt-Funktionen in `crypto.ts` als `@deprecated` und leite sämtliche **neuen** Verschlüsselungsvorgänge ausnahmslos auf `cryptoV2.ts` (`AES-256-GCM` mit `window.crypto.subtle`) um.
  2. Schreibe eine automatische Migrations-Routine `migrateV1ToV2IfNeeded(entity)`: Sobald ein v1-Datensatz geladen und entschlüsselt wird (`!isV2Encrypted(blob)`), wird er sofort mit `cryptoV2` neu verschlüsselt und als Update markiert.
  3. Ersetze das Entschlüsseln von Legacy-v1-Daten in `crypto.ts` durch natives `window.crypto.subtle.decrypt({ name: "AES-CBC", iv }, ...)` und entferne die Abhängigkeit `crypto-js` aus `web/package.json`.

* **Verifikation für Agent B:**
  ```bash
  cd web && npx tsc --noEmit
  ```

---

### Track C: Backend Datenbank-Migrationen, Blob-Lifecycle & Layer-Cleanup (Agent C)

* **Erlaubte Dateien:** `cloud/internal/store/sqlite.go`, `cloud/internal/store/blob.go`, `cloud/internal/store/store.go`, `cloud/internal/api/files.go`, `cloud/internal/api/finance.go`, `cloud/internal/api/notes.go`
* **Verbotene Dateien:** `cloud/internal/api/auth.go`, `cloud/cmd/server/main.go`, alle Dateien unter `web/`.

#### C.1: Versionierte SQLite-Schemamigrationen statt blinder `ALTER TABLE`-Aufrufe (ARC-02 — HOCH)
* **Ort:** `cloud/internal/store/sqlite.go`
* **Problem:** Migrationen laufen aktuell als `_, _ = s.DB.Exec("ALTER TABLE ...")`. Fehler werden ignoriert, es gibt keine Versionshistorie.
* **Umsetzung:**
  1. Implementiere einen deterministischen Migrations-Runner in `sqlite.go` (oder `cloud/internal/store/migrations.go`) auf Basis von `PRAGMA user_version` (oder `goose`).
  2. Definiere ein geordnetes Array von Migrationen (`version int`, `name string`, `upSQL string`).
  3. Lies beim Start `PRAGMA user_version` aus. Führe jede ausstehende Migration innerhalb einer Datenbank-Transaktion (`tx, err := s.WriterDB.Begin()`) aus und setze am Ende der Transaktion `PRAGMA user_version = <new_version>`.
  4. Schlägt eine Migration fehl, führe `tx.Rollback()` aus und gib den Fehler zwingend an `main.go` zurück (Fail-Fast statt `_, _`).

#### C.2: `BlobStore.Delete`, Kaskaden-Löschung & User-Quotas implementieren (ARC-02 — HOCH)
* **Ort:** `cloud/internal/store/blob.go`, `cloud/internal/store/sqlite.go`, `cloud/internal/api/files.go`, `cloud/internal/api/notes.go`
* **Problem:** `BlobStore` hat keine `Delete`-Methode; gelöschte Dateien/Notizen hinterlassen dauerhaft verwaiste Binärdateien auf der Festplatte; es gibt keine Upload-Quotas pro Benutzer.
* **Umsetzung:**
  1. Erweitere das `BlobStore`-Interface in `blob.go` um `Delete(ctx context.Context, hash string) error` und implementiere das sichere Löschen der Datei im Dateisystem (inklusive Prüfung, ob die Hash-ID valide ist, um Path Traversal auszuschließen).
  2. Wenn eine Datei oder Notiz gelöscht wird, prüfe in SQLite per Referenzzählung (`SELECT COUNT(*) FROM blobs WHERE hash = ?`), ob noch andere Datensätze auf denselben Blob-Hash verweisen. Falls die Anzahl $0$ erreicht, rufe `BlobStore.Delete` auf.
  3. Implementiere einen Hintergrund-Job (`RunOrphanBlobGC`), der beim Serverstart und alle $24$ Stunden verwaiste Dateien im Blob-Ordner abgleicht und bereinigt.
  4. Füge eine Quota-Prüfung vor jedem Blob-Upload hinzu (`SELECT COALESCE(SUM(size), 0) FROM blobs WHERE user_id = ?`). Überschreitet der Nutzer sein Limit (z. B. konfigurierbar über `MAX_USER_STORAGE_BYTES`, Default $5\text{ GB}$), lehne den Upload mit HTTP $413$ (`Payload Too Large`) oder $507$ (`Insufficient Storage`) ab.

#### C.3: Backend Layer-Leaks in `files.go` und `finance.go` beseitigen
* **Ort:** `cloud/internal/api/files.go` (Zeilen 384, 751) und `cloud/internal/api/finance.go` (Zeilen 64–96)
* **Problem:** API-Handler greifen über `h.Store.DB.ExecContext(...)` direkt auf SQLite zu und umgehen das `Store`-Interface.
* **Umsetzung:**
  1. Kapsle die SQL-Abfragen und Transaktionen aus `files.go` und `finance.go` als saubere Methoden im `Store`-Interface (`store.go`) und implementiere sie in `sqlite.go`.
  2. Entferne den direkten Export des rohen `DB`-Feldes für die API-Schicht oder nutze in `internal/api/` ausschließlich Methoden des `Store`-Interfaces.

* **Verifikation für Agent C:**
  ```bash
  cd cloud && go vet ./... && go build ./...
  ```

---

## WAVE 2: Automatisierte Test-Infrastruktur (Gatekeeper) & Client-Härtung

**Wichtig:** Wave 2 startet nach Abschluss von Wave 1. **Track D** und **Track E** können parallel ausgeführt werden. Wave 2 **muss** abgeschlossen sein, bevor in Wave 3 die großen Monolithen aufgeteilt werden!

---

### Track D: Test-Vakuum beheben & CI-Pipeline aufbauen (Agent D)

* **Erlaubte Dateien:** `web/vitest.config.ts` (neu), `web/src/**/__tests__/*.test.ts` (neu), `cloud/internal/**/*_test.go` (neu), `.github/workflows/ci.yml` (neu), `web/package.json`

#### D.1: Frontend Unit-Tests für Krypto & Key-Storage (Vitest)
* **Problem:** $0\%$ Testabdeckung. Jede Änderung an `cryptoV2.ts` oder `useDataStore.ts` gefährdet die Entschlüsselbarkeit von Nutzerdaten.
* **Umsetzung:**
  1. Richte `vitest` in `web/` ein (`npm install -D vitest happy-dom`).
  2. Erstelle `web/src/lib/__tests__/cryptoV2.test.ts`: Teste Key-Generierung, DEK-Erstellung, AES-256-GCM Encrypt/Decrypt, RSA-OAEP Key-Wrapping/Unwrapping, Fehlerverhalten bei manipulierten Chiffretexten (Bit-Flipping im Auth-Tag) und die v1-zu-v2-Migration.
  3. Erstelle `web/src/store/__tests__/useDataStore.test.ts`: Teste die wichtigsten CRUD-Mutationen und Optimistic Updates im Zustand-Store, damit beim anschließenden Splitting in Wave 3 sofort geprüft werden kann, ob sich der Store identisch verhält.

#### D.2: Backend Unit- & Integrationstests (Go `:memory:` SQLite)
* **Umsetzung:**
  1. Erstelle `cloud/internal/store/sqlite_test.go`: Initialisiere eine In-Memory-SQLite-Instanz, führe alle versionierten Migrationen (aus Track C.1) aus, teste User-Anlage, Notiz-/Event-CRUD, IDOR-Isolierung (`user_a` darf niemals Daten von `user_b` lesen/überschreiben) und Blob-Quota-Checks.
  2. Erstelle `cloud/internal/api/auth_test.go`: Teste mit `net/http/httptest`, dass `/api/v1/auth/request-otp` **niemals** das Feld `"otp"` im JSON-Body enthält, dass Argon2id-PIN-Hashing und Legacy-SHA256-Migration funktionieren und dass `/api/v1/search` ohne gültiges Token mit HTTP $401$ abgewiesen wird.

#### D.3: GitHub Actions CI-Pipeline einrichten
* **Umsetzung:**
  1. Erstelle `.github/workflows/ci.yml`, die bei jedem Push und Pull Request automatisch ausführt:
     * Backend: `cd cloud && go vet ./... && go test -v -race ./...`
     * Frontend: `cd web && npm ci && npx tsc --noEmit && npx vitest run`

* **Verifikation für Agent D:**
  ```bash
  cd cloud && go test -v ./...
  cd web && npx vitest run
  ```

---

### Track E: Frontend Security-Headers (CSP), StrictMode & XSS-Sanitizing (Agent E)

* **Erlaubte Dateien:** `web/next.config.ts`, `web/src/components/extensions/MathBlock.tsx`

#### E.1: Strikte Content Security Policy (CSP) & Security Headers (SEC-09 — MITTEL-HOCH)
* **Ort:** `web/next.config.ts`
* **Problem:** Keine CSP oder Sicherheitsheader konfiguriert; `reactStrictMode` ist auf `false` gesetzt.
* **Umsetzung:**
  1. Aktiviere `reactStrictMode: true` in `web/next.config.ts`.
  2. Konfiguriere `async headers()` in `web/next.config.ts` für alle Routen (`/(.*)`):
     * `Content-Security-Policy`: Restriktives Regelwerk (`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';`)
     * `X-Content-Type-Options: nosniff`
     * `X-Frame-Options: DENY`
     * `Referrer-Policy: strict-origin-when-cross-origin`

#### E.2: KaTeX XSS-Schwachstelle in `MathBlock.tsx` schließen (SEC-10 — MITTEL)
* **Ort:** `web/src/components/extensions/MathBlock.tsx` (Zeile 44)
* **Problem:** Im `catch (e)`-Block wird `${e}` unbereinigt als HTML-String zurückgegeben und per `dangerouslySetInnerHTML` gerendert.
* **Umsetzung:**
  1. Erstelle eine kleine HTML-Escape-Funktion (`escapeHtml(str)`), die `&`, `<`, `>`, `"` und `'` in sichere HTML-Entities umwandelt, bevor die Fehlermeldung in `<span class="katex-error">...</span>` eingesetzt wird – oder gib im Fehlerfall ein reguläres React-Element statt `dangerouslySetInnerHTML` zurück.

* **Verifikation für Agent E:**
  ```bash
  cd web && npx tsc --noEmit && npm run build
  ```

---

## WAVE 3: Frontend De-Monolithisierung & Architektur-Refactoring

**Wichtig:** In Wave 3 werden die 8 großen Frontend-Monolithen ($18.360$ Zeilen Code gesamt) aufgeteilt, sodass die $< 500$-Zeilen-Regel aus `AGENTS.md` wieder eingehalten wird.
* **Schritt 3.1:** Zuerst läuft **Track F-1** (Store-Aufteilung).
* **Schritt 3.2:** Sobald F-1 fertig ist, können **Track F-2** (`page.tsx`) und **Track F-3** (Sub-Komponenten) **parallel** ausgeführt werden!

---

### Track F-1: Dekomposition von `useDataStore.ts` ($1.441$ Zeilen) (Agent F1)

* **Erlaubte Dateien:** `web/src/store/useDataStore.ts`, neue Dateien unter `web/src/store/slices/*.ts`, `web/src/store/sync/broadcast.ts`

#### F1.1: Aufteilung in Domain-Slices & Selektor-Optimierung
* **Problem:** `useDataStore.ts` verwaltet Notes, Events, Todos, Finance, Contacts und UI-State in einer einzigen $1.441$-Zeilen-Datei. Komponenten abonnieren oft den gesamten Store, was Re-Render-Kaskaden auslöst.
* **Umsetzung:**
  1. Zerlege `useDataStore.ts` nach dem offiziellen Zustand-Slice-Pattern in einzelne Dateien unter `web/src/store/slices/` (jede Datei $< 350$ Zeilen):
     * `createNotesSlice.ts`
     * `createEventsSlice.ts`
     * `createTodosSlice.ts`
     * `createFinanceSlice.ts`
     * `createContactsSlice.ts`
     * `createUiSlice.ts`
  2. `useDataStore.ts` führt diese Slices nur noch zusammen und exportiert den kombinierten Store (sodass bestehende Imports `import { useDataStore } from "@/store/useDataStore"` zunächst rückwärtskompatibel bleiben!) sowie granulare Custom-Selector-Hooks (`useNotes()`, `useCalendarEvents()`, `useUiActions()`).
  3. **Multi-Tab-Synchronisation:** Füge `web/src/store/sync/broadcast.ts` auf Basis der nativen `BroadcastChannel("tide_state_sync")`-API hinzu, damit Änderungen in einem Browser-Tab andere offene Tabs invalidieren und Überschreibungen verhindern.

* **Verifikation für Agent F1:**
  ```bash
  cd web && npx tsc --noEmit && npx vitest run
  ```

---

### Track F-2: Zerlegung des `page.tsx`-Monolithen ($4.168$ Zeilen) (Agent F2)

* **Erlaubte Dateien:** `web/src/app/page.tsx`, neue Dateien unter `web/src/components/Workspaces/*.tsx`, `web/src/components/Modals/*.tsx` und `web/src/hooks/*.ts`
* **Verbotene Dateien:** Bestehende Dateien wie `MobileLayout.tsx`, `TodoList.tsx`, `CalendarView.tsx` (diese gehören Agent F3).

#### F2.1: Extraktion von Custom Hooks und Domain-Workspaces
* **Problem:** `web/src/app/page.tsx` umfasst $4.168$ Zeilen, $> 40$ `useState`/`useRef`-Hooks, globale Keydown-/Touch-Listener, Auto-Save, Canvas, Finance, Jobs und Inline-Modals.
* **Umsetzung:**
  1. **Hooks auslagern (`web/src/hooks/`):**
     * `useGlobalShortcuts.ts`: Alle globalen `keydown`-Listener und Hotkeys.
     * `useAutoSaveSync.ts`: Debounced Auto-Save, Polling und Offline-Indikator-Logik.
     * `useSplitViewDrag.ts`: Drag-and-Drop- und Split-Screen-Resize-Handler.
  2. **Inline-Modals auslagern (`web/src/components/Modals/`):**
     * `GlobalModalsHost.tsx`: Bündelt Delete-Confirmation-Modal, Tag-Management-Modal, Vault-Unlock/Passphrase-Dialog und Share-Dialoge in getrennten Subkomponenten (jeweils $< 300$ Zeilen).
  3. **Domain-Workspaces auslagern (`web/src/components/Workspaces/`):**
     * `CanvasWorkspace.tsx` (Notiz-Canvas & Split-Editor-Container)
     * `FinanceWorkspace.tsx` (Finanz-Ansicht)
     * `JobsWorkspace.tsx` (Jobs/Projekte-Ansicht)
     * `SearchOverlay.tsx` (Globale Suche)
  4. **Zielgröße:** `web/src/app/page.tsx` fungiert am Ende nur noch als schlanker App-Shell-Router und Layout-Orchestrator mit **unter $400$ Zeilen Code**.

* **Verifikation für Agent F2:**
  ```bash
  cd web && npx tsc --noEmit && npx vitest run && npm run build
  ```

---

### Track F-3: Zerlegung der 6 Sekundär-Monolithen (Agent F3)

* **Erlaubte Dateien:**
  1. `web/src/components/Layout/MobileLayout.tsx` ($3.159$ Zeilen) + neue Sub-Dateien in `Layout/mobile/`
  2. `web/src/components/Todo/TodoList.tsx` ($2.203$ Zeilen) + neue Sub-Dateien in `Todo/`
  3. `web/src/components/Settings/SettingsModal.tsx` ($1.977$ Zeilen) + neue Sub-Dateien in `Settings/tabs/`
  4. `web/src/components/Editor.tsx` ($1.897$ Zeilen) + neue Sub-Dateien in `Editor/`
  5. `web/src/components/Calendar/CalendarView.tsx` ($1.825$ Zeilen) + neue Sub-Dateien in `Calendar/`
  6. `web/src/components/Layout/Sidebar.tsx` ($1.690$ Zeilen) + neue Sub-Dateien in `Layout/sidebar/`

#### F3.1: Modulare Aufteilung unter Beachtung der iOS/Touch-Regeln aus `COMPONENTS.md`
* **Wichtige Warnung für Agent F3:** Beim Auslagern von Touch- und Gesten-Code in `MobileLayout.tsx` und `CalendarView.tsx` dürfen die in `web/docs/COMPONENTS.md` dokumentierten Workarounds (`flushSync` bei `setEvDrag(null)`, iOS Scroll-Freeze Jiggle `scrollTop ± 1`, 3-Slide Carousel Snap) **nicht verändert oder entfernt** werden!
* **Umsetzung:**
  1. **`MobileLayout.tsx` ($3.159 \rightarrow < 450$ Zeilen):** Extrahiere `MobileDateWheel.tsx`, `MobileAgendaTimeline.tsx`, `MobileBottomSheets.tsx` und `useMobileSwipeGestures.ts`.
  2. **`TodoList.tsx` ($2.203 \rightarrow < 450$ Zeilen):** Extrahiere `TodoTreeItem.tsx`, `TodoFilterBar.tsx`, `TodoBatchActions.tsx` und `useTodoDragAndDrop.ts`.
  3. **`SettingsModal.tsx` ($1.977 \rightarrow < 350$ Zeilen):** Extrahiere jeden Einstellungs-Tab in eine eigene Komponente unter `Settings/tabs/` (`ProfileTab.tsx`, `SecurityVaultTab.tsx`, `SyncCloudTab.tsx`, `AppearanceTab.tsx`, `IntegrationsTab.tsx`).
  4. **`Editor.tsx` ($1.897 \rightarrow < 450$ Zeilen):** Extrahiere `EditorToolbar.tsx`, `EditorBubbleMenu.tsx`, `EditorSlashCommand.tsx` und `useTipTapConfig.ts`.
  5. **`CalendarView.tsx` ($1.825 \rightarrow < 450$ Zeilen):** Extrahiere `CalendarMonthGrid.tsx`, `CalendarWeekTimeGrid.tsx`, `CalendarEventChip.tsx` und `useCalendarDragResize.ts`.
  6. **`Sidebar.tsx` ($1.690 \rightarrow < 400$ Zeilen):** Extrahiere `SidebarNavTree.tsx`, `SidebarQuickNotes.tsx`, `SidebarSyncIndicator.tsx` und `SidebarUserMenu.tsx`.

* **Verifikation für Agent F3:**
  ```bash
  cd web && npx tsc --noEmit && npx vitest run && npm run build
  ```

---

## WAVE 4: Code-Qualität, Design-Tokens, Skalierbarkeit & DevOps

Wave 4 startet, sobald die großen Dateien in Wave 3 erfolgreich aufgeteilt wurden. **Track G** (Frontend) und **Track H** (Backend & DevOps) können **parallel** arbeiten.

---

### Track G: Design-Token-Harmonisierung & ESLint-Bereinigung (Agent G)

* **Erlaubte Dateien:** Alle Dateien unter `web/src/` sowie `web/eslint.config.mjs` (bzw. `.eslintrc.json`)

#### G.1: Abbau der $1.016$ ESLint-Fehler & Verbot von `any`
* **Problem:** Der Linter meldet $701$ Fehler und $315$ Warnungen (viele `@typescript-eslint/no-explicit-any` und `no-unused-vars`) und bricht den Build bei Fehlern nicht ab.
* **Umsetzung:**
  1. Entferne alle ungenutzten Variablen und Imports im gesamten `web/src/`-Verzeichnis.
  2. Ersetze sämtliche `as any`- und `: any`-Typisierungen durch saubere TypeScript-Interfaces (insbesondere für TipTap-Nodes, API-Payloads und Event-Handler).
  3. Konfiguriere ESLint in `package.json` und `.github/workflows/ci.yml` so, dass Linter-Fehler den Build mit einem Non-Zero-Exit-Code abbrechen (`--max-warnings 0`).

#### G.2: Konsequente Durchsetzung von `designTokens.ts` (Regel 7 aus `AGENTS.md`)
* **Problem:** $127$ von $132$ Frontend-Dateien nutzen hartcodierte Farben (`bg-[#1c1c1e]`, `bg-zinc-900`) und Radien (`rounded-[22px]`) statt `web/src/lib/designTokens.ts`.
* **Umsetzung:**
  1. Erweitere bei Bedarf `designTokens.ts` bzw. die CSS-Variablen in `tailwind.config.ts` / `globals.css`, sodass alle Token-Farben und Radien als semantische Tailwind-Klassen (z. B. `bg-surface-primary`, `border-subtle`, `rounded-card`) zur Verfügung stehen.
  2. Ersetze systematisch die hartcodierten Hex-Werte und Graustufen-Klassen in den Komponenten durch die zentralen Design-Tokens.

* **Verifikation für Agent G:**
  ```bash
  cd web && npx eslint src/ --max-warnings 0 && npx tsc --noEmit && npm run build
  ```

---

### Track H: Backend-Skalierbarkeit, Auto-Backups, Docker & Doku-Sync (Agent H)

* **Erlaubte Dateien:** `cloud/internal/api/events.go`, `cloud/internal/store/backup.go` (neu), `Dockerfile.cloud` (neu), `Dockerfile.web` (neu), `docker-compose.yml` (neu), `AGENTS.md`, `README.md`, `docs/`

#### H.1: Gepufferte SSE-Channels & Entkopplung von In-Memory-Locks
* **Ort:** `cloud/internal/api/events.go`
* **Problem:** SSE-Kanäle werden ungepuffert mit `make(chan string)` erstellt; ein langsamer Client blockiert den Server-Writer-Loop.
* **Umsetzung:**
  1. Initialisiere SSE-Client-Channels gepuffert mit `make(chan string, 64)`.
  2. Nutze beim Senden ein nicht-blockierendes `select { case ch <- msg: default: ... }` mit sauberem Logging/Reconnect-Signal, damit langsame Clients niemals andere Goroutinen blockieren.
  3. Kapsle das Event-Broadcasting und das Rate-Limiting hinter ein schlankes Go-Interface (`EventBroker` / `RateLimiter`), damit neben der Default-In-Memory-Implementierung später problemlos ein Redis/NATS-Adapter eingehängt werden kann.

#### H.2: Automatisiertes SQLite Online-Backup (`VACUUM INTO`)
* **Ort:** `cloud/internal/store/backup.go` (neu)
* **Problem:** Keine automatische Backup-Routine für die SQLite-Datenbank.
* **Umsetzung:**
  1. Implementiere einen periodischen Hintergrund-Ticker (z. B. alle $6$ Stunden, konfigurierbar über `BACKUP_INTERVAL_HOURS`), der über `VACUUM INTO 'backups/tide_backup_<timestamp>.db'` einen konsistenten, transaktionssicheren Snapshot der SQLite-Datenbank im laufenden WAL-Betrieb erstellt.
  2. Behalte automatisch die letzten $N$ Backups (z. B. $7$ Tage) und rotiere ältere Snapshots aus.

#### H.3: Containerisierung (Docker) & Dokumentations-Abgleich
* **Umsetzung:**
  1. Erstelle ein schlankes Multi-Stage `Dockerfile` für `cloud/` (Build mit `golang:1.24-alpine`, Runtime auf `gcr.io/distroless/static-debian12` oder `alpine:3.20` mit Non-Root-User).
  2. Erstelle ein Multi-Stage `Dockerfile` für `web/` (Next.js `output: "standalone"`).
  3. Erstelle eine produktionsreife `docker-compose.yml` mit Healthchecks, persistenten Volumes für SQLite-DB, Backups und Blobs sowie einer `.env.example` (ohne unsichere Default-Keys!).
  4. Aktualisiere `AGENTS.md`, `README.md` und `docs/ARCHITECTURE.md`, sodass die neue Dateistruktur (Slices, Workspaces), das `Argon2id`-Hashing, die `IndexedDB`-Key-Speicherung und ein Mermaid-Systemarchitekturdiagramm wahrheitsgemäß dokumentiert sind.

* **Verifikation für Agent H:**
  ```bash
  cd cloud && go test -v ./... && go build ./...
  docker compose config
  ```

---

## 2. Checkliste zur Abnahme durch den Projektleiter

Nutze diese kurze Checkliste, um nach jeder Welle zu prüfen, ob die Agenten sauber gearbeitet haben (und nicht wieder nur Kosmetik betrieben wurde):

- [ ] **Check nach Wave 1:**
  - Suche in `cloud/internal/api/auth.go` nach `"otp":` $\rightarrow$ Darf im HTTP-Response **nicht** mehr existieren.
  - Suche in `cloud/internal/api/auth.go` nach `sha256.Sum256` $\rightarrow$ Muss für neue PINs durch `argon2.IDKey` ersetzt sein.
  - Suche in `cloud/cmd/server/main.go` nach `"1234567890` $\rightarrow$ Muss entfernt und durch `log.Fatal` ersetzt sein.
  - Suche in `web/src/` nach `localStorage.setItem("tide_session_key"` $\rightarrow$ Darf **0 Treffer** liefern.
  - Suche in `cloud/internal/store/sqlite.go` nach `_, _ =` bei `ALTER TABLE` $\rightarrow$ Darf **0 Treffer** liefern.
- [ ] **Check nach Wave 2:**
  - Führe `cd cloud && go test ./...` und `cd web && npx vitest run` aus $\rightarrow$ Es müssen echte Tests ausgeführt werden und grün sein.
- [ ] **Check nach Wave 3:**
  - Prüfe die Zeilenanzahl aller `.tsx`- und `.ts`-Dateien: `find web/src -name "*.tsx" -o -name "*.ts" | xargs wc -l | sort -nr | head -n 15` $\rightarrow$ `page.tsx` und alle anderen Komponenten müssen deutlich geschrumpft sein (Ziel: $< 500$ Zeilen).
- [ ] **Check nach Wave 4:**
  - Führe `cd web && npx eslint src/ --max-warnings 0` aus $\rightarrow$ Muss mit **0 Fehlern und 0 Warnungen** durchlaufen.