# Sicherheitsaudit-Bericht: `core/` (`tide-daemon` & `tide-core`)

> **⚠️ WICHTIGER HINWEIS — AKTUELL INAKTIV / NICHT PRODUKTIV NUTZEN**
>
> Das Verzeichnis `core/` (Rust-Komponenten `tide-core` und `tide-daemon`) ist **derzeit ungenutzt** und wurde auf ausdrückliche Anweisung im Rahmen der Live-Behebung ignoriert.
> **Nehmen Sie `tide-daemon` keinesfalls in den Produktivbetrieb**, bevor alle in diesem Dokument aufgeführten Befunde (insbesondere **HIGH-1 bis HIGH-4** sowie **MEDIUM-1 bis MEDIUM-8**) vollständig behoben und die **Pre-Activation Checklist** am Ende dieses Dokuments abgearbeitet wurden.

---

## 1. Executive Summary

Im Rahmen der Sicherheitsüberprüfung der Rust-Komponenten unter `core/` wurden insgesamt **16 sicherheitsrelevante Schwachstellen** identifiziert (**4 High**, **8 Medium**, **4 Low**). Die schwerwiegendsten Risiken betreffen die fehlende Aktivierung der SQLCipher-Datenbankverschlüsselung (wodurch Notizen im Klartext auf der Festplatte liegen), ungeschützte Session-/Vault-Dateien mit Standard-Dateiberechtigungen sowie fehlende Validierungen von URL-Pfaden und Basis-URLs bei authentifizierten API-Aufrufen.

### Verifizierte positive Baseline

Folgende grundlegende Sicherheitspraktiken sind im geprüften Rust-Code bereits positiv umgesetzt:
- **Speichersicherheit:** `0` `unsafe`-Blöcke im gesamten `core/`-Codebase.
- **Keine OS-Command-Injection:** `0` Shell-/Prozess-Aufrufe (`std::process::Command`).
- **SQL-Injection-Schutz:** Durchgängige Verwendung parametrisierter SQL-Abfragen über `rusqlite`.
- **Minimale Angriffsfläche beim MCP-Transport:** Der MCP-Server kommuniziert ausschließlich über `stdio` (kein offener Netzwerk-Port/HTTP-Listener).

---

## 2. Severity Overview

| ID | Schweregrad | Titel | Betroffene Stellen |
| :--- | :--- | :--- | :--- |
| **HIGH-1** | 🔴 High | Lokale SQLite-Datenbank unverschlüsselt trotz gebündeltem SQLCipher | `core/crates/tide-core/src/db.rs:86-100`, `core/Cargo.toml:10`, `core/crates/tide-core/src/sync.rs:434-444` |
| **HIGH-2** | 🔴 High | Klartext-`session.json` ohne restriktive Dateiberechtigungen | `core/crates/tide-core/src/sync.rs:13-25, 36-47`, `core/crates/tide-daemon/src/main.rs:282-286` |
| **HIGH-3** | 🔴 High | URL-Path-Traversal / Parameter-Injection über unvalidierte Note-`id` | `core/crates/tide-core/src/sync.rs:252-255, 332-338` |
| **HIGH-4** | 🔴 High | Unvalidierte `session.base_url` (Klartext-HTTP-Token-Leak / SSRF) | `core/crates/tide-core/src/sync.rs:76-84`, `core/crates/tide-daemon/src/main.rs:243-245` |
| **MEDIUM-1** | 🟠 Medium | Veraltetes `rsa = "0.9"` anfällig für Marvin Attack (`RUSTSEC-2023-0071`) | `core/Cargo.toml:14`, `core/crates/tide-core/src/crypto.rs:127-151` |
| **MEDIUM-2** | 🟠 Medium | PBKDF2 ignoriert `iterations`-Feld, 100k-Fallback & Salt wird durch Pepper ersetzt | `core/crates/tide-core/src/crypto.rs:14-21, 69-111` |
| **MEDIUM-3** | 🟠 Medium | Fehlende Speicher-Zeroisierung sensibler Schlüssel & PINs | `core/crates/tide-core/src/crypto.rs:25-29, 61-143` |
| **MEDIUM-4** | 🟠 Medium | Secrets über CLI-Argumente & unmaskierte PIN-Eingabe | `core/crates/tide-daemon/src/main.rs:31-49, 263-269` |
| **MEDIUM-5** | 🟠 Medium | Integer-Overflow `limit as i64` -> SQLite `LIMIT -1` (Unbegrenzter Dump) | `core/crates/tide-daemon/src/mcp.rs:224-227`, `core/crates/tide-core/src/db.rs:238-255` |
| **MEDIUM-6** | 🟠 Medium | Unbegrenzte Stdin-/HTTP-Reads & fehlende HTTP-Timeouts | `core/crates/tide-daemon/src/mcp.rs:8-11`, `core/crates/tide-core/src/sync.rs:80, 139, 221, 342, 463, 624` |
| **MEDIUM-7** | 🟠 Medium | Unsanitierte HTML-/Attribut-Injection & Zeitstempel-Mismatch in `tide_patch_block` | `core/crates/tide-daemon/src/mcp.rs:415-445` |
| **MEDIUM-8** | 🟠 Medium | Docker- & Supply-Chain-Schwächen | `core/Dockerfile:1-31`, `core/build.sh:15, 34` |
| **LOW-1** | 🟡 Low | Stilles Überschreiben lokaler Notizen mit Leerstring bei Entschlüsselungs-/Downloadfehler | `core/crates/tide-core/src/sync.rs:368-382, 434-447` |
| **LOW-2** | 🟡 Low | Blockierendes `"Press Enter to exit..."` bei Fehlern hängt MCP-Hosts auf | `core/crates/tide-daemon/src/main.rs:58-65` |
| **LOW-3** | 🟡 Low | Uninitialisiertes `tracing_subscriber` verwirft Krypto-Warnungen; rohe HTTP-Bodies in Fehlern | `core/crates/tide-daemon/src/main.rs`, `core/crates/tide-core/src/sync.rs:107, 134, 216` |
| **LOW-4** | 🟡 Low | Stilles Ignorieren fehlerhafter JSON-RPC-Anfragen statt `-32700`/`-32600` | `core/crates/tide-daemon/src/mcp.rs:17-25` |

---

## 3. Detaillierte Befunde

### HIGH-1: Lokale SQLite-Datenbank unverschlüsselt trotz gebündeltem SQLCipher

- **Schweregrad:** 🔴 High
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-core/src/db.rs:86-100`
  - `core/Cargo.toml:10`
  - `core/crates/tide-core/src/sync.rs:434-444`
- **Ursache (Root Cause):**
  In `core/Cargo.toml:10` wird `rusqlite` zwar mit dem Feature `bundled-sqlcipher-vendored-openssl` eingebunden, `Database::open` (`db.rs:86-100`) setzt jedoch nach `Connection::open` niemals `PRAGMA key`. Zusätzlich setzt `sync.rs:439` das Flag `is_encrypted: true` fälschlich auf Basis der Annahme, dass eine lokale Verschlüsselung aktiv sei.
- **Auswirkung (Impact):**
  Sämtliche entschlüsselten Notizinhalte (`content_markdown`), der Volltext-Suchindex (`fts_notes`), Links und Todos werden unverschlüsselt im Klartext unter `~/.tide/local.db` auf dem Datenträger gespeichert — trotz gegenteiliger Kennzeichnung im Sync-Status.
- **Behebung (Remediation):**
  1. Einen 256-Bit-Datenbankschlüssel aus dem entsperrten Vault oder dem OS-Keyring ableiten.
  2. Unmittelbar nach `Connection::open` das Kommando `PRAGMA key = "x'<hex-key>'"` ausführen.
  3. Direkt danach eine Validierungsabfrage (z. B. `SELECT count(*) FROM sqlite_master;`) ausführen, um ein falsches Schlüsselmaterial oder fehlende Verschlüsselung sofort als harten Fehler zu erkennen.
  4. Migration/Neuaufbau bestehender unverschlüsselter `local.db`-Dateien über `sqlcipher_export` oder Re-Sync vorsehen.

---

### HIGH-2: Klartext-`session.json` ohne restriktive Dateiberechtigungen

- **Schweregrad:** 🔴 High
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-core/src/sync.rs:13-25, 36-47`
  - `core/crates/tide-daemon/src/main.rs:282-286`
- **Ursache (Root Cause):**
  Sensible Authentifizierungs- und Kryptodaten (Bearer-Token, `encrypted_vault` und `pepper`) werden mittels Standard-Dateioperationen und Standard-Umask (typischerweise `0755` für Verzeichnisse / `0644` für Dateien) in `~/.tide/session.json` persistiert. Gleiches gilt für `~/.tide/local.db`.
- **Auswirkung (Impact):**
  Andere lokale Benutzerkonten, unprivilegierte Prozesse oder Backup-Tools auf demselben System können das Bearer-Token sowie Vault-/Pepper-Material auslesen und damit unbefugten Zugriff auf die Cloud-API und lokale Daten erlangen.
- **Behebung (Remediation):**
  1. Primär: Speicherung von Bearer-Token und Schlüsselmaterial im plattformspezifischen OS-Keyring (z. B. über das `keyring`-Crate).
  2. Fallback / Dateisystem-Schutz: Verzeichnis `~/.tide` explizit mit `0700` und Dateien (`session.json`, `local.db`) mit `0600` unter Unix (`std::os::unix::fs::OpenOptionsExt` / `PermissionsExt`) anlegen; unter Windows restriktive DACLs (nur aktueller Benutzer) über Windows-Security-APIs erzwingen.

---

### HIGH-3: URL-Path-Traversal / Parameter-Injection über unvalidierte Note-`id`

- **Schweregrad:** 🔴 High
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-core/src/sync.rs:252-255, 332-338`
- **Ursache (Root Cause):**
  In `sync.rs` wird die Ziel-URL für Datei-Downloads per String-Interpolation gebildet (`format!("{}/files/{id}/download", self.base_url)`), wobei `id` ungeprüft aus der JSON-Antwort stammt und der Request mit einem `Authorization: Bearer ...`-Header abgesetzt wird.
- **Auswirkung (Impact):**
  Enthält eine manipulierte oder fehlerhafte `id` Pfadsegmente wie `../`, `?` oder `#`, kann der Request auf beliebige andere API-Endpunkte der Ziel-Domain umgelenkt werden (Path-Traversal / Parameter-Injection unter Verwendung des Bearer-Tokens des Nutzers).
- **Behebung (Remediation):**
  1. Jede empfangene Note-/Datei-`id` strikt als UUID validieren (`uuid::Uuid::parse_str(id)?`), bevor sie in URLs oder Dateipfaden verwendet wird.
  2. URLs niemals über `format!` zusammensetzen, sondern sauber über `reqwest::Url::parse` und `url.path_segments_mut()` konstruieren.

---

### HIGH-4: Unvalidierte `session.base_url` (Klartext-HTTP-Token-Leak / SSRF)

- **Schweregrad:** 🔴 High
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-core/src/sync.rs:76-84`
  - `core/crates/tide-daemon/src/main.rs:243-245`
- **Ursache (Root Cause):**
  Die aus `session.json` geladene bzw. konfigurierte `base_url` wird weder auf ein sicheres Transportprotokoll (`https://`) noch auf eine Whitelist erlaubter Hostnamen geprüft.
- **Auswirkung (Impact):**
  Eine manipulierte `session.json` oder Fehlkonfiguration mit `http://` überträgt Bearer-Tokens und verschlüsselte/entschlüsselte Nutzdaten unverschlüsselt über das Netzwerk (Man-in-the-Middle-Risiko). Zudem können beliebige interne oder externe Ziele mit Bearer-Auth angesprochen werden (SSRF / Token-Exfiltration an Angreifer-Server).
- **Behebung (Remediation):**
  1. URL mittels `url::Url::parse` strikt validieren.
  2. Ausschließlich `https://` akzeptieren (optional `http://localhost` / `http://127.0.0.1` nur bei explizitem Dev-Feature-Flag oder lokalem Modus).
  3. Erlaubte Ziel-Hostnamen über eine Konfigurations-Allowlist / bekannte Produktions-Domain absichern.

---

### MEDIUM-1: Veraltetes `rsa = "0.9"` anfällig für Marvin Attack (`RUSTSEC-2023-0071`)

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/Cargo.toml:14`
  - `core/crates/tide-core/src/crypto.rs:127-151`
- **Ursache (Root Cause):**
  Das Projekt bindet `rsa = "0.9"` ein und nutzt RSA-OAEP zur Entschlüsselung. Für die `0.9.x`-Reihe existiert das bekannte Timing-Side-Channel-Advisory **RUSTSEC-2023-0071** (*Marvin Attack*) ohne verfügbaren Patch im `0.9`-Zweig.
- **Auswirkung (Impact):**
  Unter Bedingungen, in denen ein Angreifer präzise Laufzeitmessungen von RSA-Entschlüsselungen vornehmen kann (z. B. über wiederholte Operationen / Shared-Host-Szenarien), lassen sich über Timing-Seitenkanäle Rückschlüsse auf Klartexte oder das Schlüsselmaterial ziehen.
- **Behebung (Remediation):**
  1. Auf eine gepatchte `rsa`-Version (`>= 0.10`, sobald stabil/gepatcht) aktualisieren **oder**
  2. Langfristig auf ein modernes, konstantzeitiges asymmetrisches Verfahren (z. B. X25519 + AEAD / HPKE gemäß RFC 9180) migrieren.
  3. `cargo audit` fest in die CI-Pipeline integrieren.

---

### MEDIUM-2: PBKDF2 ignoriert `iterations`-Feld, Fallback auf 100k & Salt wird durch Pepper ersetzt

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-core/src/crypto.rs:14-21, 69-111`
- **Ursache (Root Cause):**
  1. Das Feld `payload.iterations` wird bei der Schlüsselableitung nicht ausgewertet.
  2. Bei beliebigem Fehler greift ein stiller Fallback auf 100.000 Iterationen.
  3. Wenn `pepper_base64` vorhanden ist, ersetzt dieser den eigentlichen `payload.salt`, anstatt mit ihm kombiniert zu werden.
- **Auswirkung (Impact):**
  Schwächung der KDF-Sicherheit durch fest verdrahtete bzw. zu niedrige Iterationszahlen, Verfälschung der kryptographischen Domänentrennung bei Verlust des Per-User-Salts sowie verschleierte Fehlerzustände durch stille Fallbacks.
- **Behebung (Remediation):**
  1. `payload.iterations` zwingend auslesen und eine Mindestanzahl von **600.000 Iterationen** (OWASP-Empfehlung für PBKDF2-HMAC-SHA256) durchsetzen.
  2. Stille 100k-Fallbacks entfernen; KDF-Parameterfehler explizit abweisen.
  3. Salt und Pepper sauber kombinieren (z. B. `salt || pepper` oder via HKDF-Extract/HMAC über beide Werte), niemals das Salt verwerfen.

---

### MEDIUM-3: Fehlende Speicher-Zeroisierung sensibler Schlüssel & PINs

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-core/src/crypto.rs:25-29, 61-143`
- **Ursache (Root Cause):**
  Schlüsselmaterial (`kek`, `dek`), PKCS#8-Private-Key-Bytes und die Benutzer-`pin` werden als reguläre `Vec<u8>` bzw. `String` gehalten und nach Verwendung nicht aus dem Arbeitsspeicher überschrieben.
- **Auswirkung (Impact):**
  Sensible Geheimnisse verbleiben nach dem `Drop` ungelöscht im Heap/Stack und können über Core-Dumps, Swap-Dateien oder Speicher-Ausleseangriffe rekonstruiert werden.
- **Behebung (Remediation):**
  Das `zeroize`-Crate einbinden und für alle Schlüssel, abgeleiteten Secrets, privaten PKCS#8-Puffer und PINs konsequent `zeroize::Zeroizing<Vec<u8>>` bzw. `Zeroizing<String>` verwenden (inkl. `ZeroizeOnDrop` auf relevanten Key-Structs).

---

### MEDIUM-4: Secrets über CLI-Argumente & unmaskierte PIN-Eingabe

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-daemon/src/main.rs:31-49, 263-269`
- **Ursache (Root Cause):**
  - Die CLI-Flags `--pin`, `--token` und `--code` erlauben die Übergabe geheimer Werte direkt auf der Kommandozeile (`main.rs:31-49`).
  - Bei interaktiver Abfrage gibt `prompt_input` (`main.rs:263-269`) die eingegebene PIN sichtbar im Terminal aus (Echo aktiviert).
- **Auswirkung (Impact):**
  CLI-Argumente sind systemweit über Prozesslisten (`ps aux`, `/proc/<pid>/cmdline`, Task-Manager/WMI) sowie in Shell-Histories (`.bash_history`, `.zsh_history`, PowerShell PSReadLine) einsehbar. Unmaskierte Eingaben ermöglichen Schulterblick-Leaks und landen in Terminal-Logs.
- **Behebung (Remediation):**
  1. `--pin`, `--token` und `--code` vollständig als CLI-Argumente entfernen.
  2. Interaktive PIN-Abfragen über `rpassword::prompt_password` (ohne Echo) umsetzen.
  3. Nicht-interaktive Übergabe ausschließlich über `stdin` oder dedizierte Dateideskriptoren/Umgebungsvariablen (mit sofortigem Löschen nach dem Einlesen) unterstützen.

---

### MEDIUM-5: Integer-Overflow `limit as i64` -> SQLite `LIMIT -1` (Unbegrenzter Dump)

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-daemon/src/mcp.rs:224-227`
  - `core/crates/tide-core/src/db.rs:238-255`
- **Ursache (Root Cause):**
  Ein vorzeichenloser `u64`/`usize`-Parameter `limit` wird ungeprüft per `limit as i64` gecastet und an die SQLite-Abfrage übergeben. Bei Werten `>= 2^63` kippt der Cast ins Negative (z. B. `-1`), was SQLite als **„kein Limit“** interpretiert.
- **Auswirkung (Impact):**
  Ein MCP-Client oder manipulierter Tool-Call kann durch Übergabe eines großen `limit`-Wertes einen vollständigen Dump aller gespeicherten Notizen erzwingen (DoS durch Speicher-/I/O-Erschöpfung sowie Umgehung erwarteter Paginierungsgrenzen).
- **Behebung (Remediation):**
  Den Parameter vor dem Cast und vor der Übergabe an `db.rs` strikt begrenzen: `let limit = limit.clamp(1, 100) as i64;` (und innerhalb von `db.rs` zusätzlich absichern).

---

### MEDIUM-6: Unbegrenzte Stdin-/HTTP-Reads & fehlende HTTP-Timeouts

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-daemon/src/mcp.rs:8-11`
  - `core/crates/tide-core/src/sync.rs:80, 139, 221, 342, 463, 624`
- **Ursache (Root Cause):**
  - In `mcp.rs:8-11` werden Zeilen von `stdin` unbegrenzt eingelesen, ohne maximale Zeilenlänge festzulegen.
  - In `sync.rs` wird `reqwest::Client` ohne Request-/Connect-Timeouts konfiguriert, und HTTP-Antwort-Bodies werden unbegrenzt in den Speicher gelesen.
- **Auswirkung (Impact):**
  Übergroße Eingaben über `stdin` oder ein bösartiger/fehlerhafter Server können unbegrenzten Speicherverbrauch (OOM-Crash) auslösen; fehlende HTTP-Timeouts führen zu dauerhaft hängenden Sync-Operationen.
- **Behebung (Remediation):**
  1. `reqwest::Client::builder().connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(30)).build()` verwenden.
  2. Maximale Größe für HTTP-Antwort-Bodies (z. B. via `Content-Length`-Prüfung und gestreamtem `.take(MAX_BODY_BYTES)`) erzwingen.
  3. `stdin`-Reads im MCP-Server mittels `BufRead::take(MAX_LINE_BYTES)` auf ein sicheres Limit (z. B. 1–4 MiB) deckeln.

---

### MEDIUM-7: Unsanitierte HTML-/Attribut-Injection & Zeitstempel-Mismatch in `tide_patch_block`

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-daemon/src/mcp.rs:415-445`
- **Ursache (Root Cause):**
  `tide_patch_block` übernimmt benutzer- bzw. LLM-generierte Eingaben mit rohem HTML (`<...>`) ungefiltert in `content_markdown`. Zudem nutzt die Methode `as_secs()` für Zeitstempel statt `as_millis()`, was nicht zum übrigen Systemformat passt.
- **Auswirkung (Impact):**
  1. **Stored-XSS-Risiko:** Werden manipulierte Inhalte mit der Web-UI synchronisiert und dort gerendert, kann eingeschleustes HTML/Event-Handler-Markup zu Cross-Site-Scripting führen.
  2. **Integritäts-/Sync-Konflikte:** Durch Sekunden- statt Millisekunden-Timestamps entstehen fehlerhafte Sortierungen und Last-Write-Wins-Konflikte beim Sync.
- **Behebung (Remediation):**
  1. Eingaben in `tide_patch_block` strikt validieren/sanitisieren (HTML-Tags/Attribute escapen oder über eine strikte Allowlist bereinigen, sofern Markdown-HTML überhaupt zulässig ist).
  2. Zeitstempel konsequent auf `as_millis()` (u64/i64 Millisekunden seit Unix-Epoch) vereinheitlichen.

---

### MEDIUM-8: Docker- & Supply-Chain-Schwächen

- **Schweregrad:** 🟠 Medium
- **Betroffene Dateien & Zeilen:**
  - `core/Dockerfile:1-31`
  - `core/build.sh:15, 34`
- **Ursache (Root Cause):**
  - `Dockerfile` nutzt unpinnte Floating-Tags (`rust:bookworm`) sowie `mingw-w64` ohne Versions-/Hash-Pinning.
  - Es existiert keine `Cargo.lock` im Repository (und folglich kein `--locked`-Build-Flag).
  - Es fehlt eine `.dockerignore`-Datei (Gefahr, lokale `.env`-, Target- oder `.git`-Verzeichnisse in den Build-Kontext zu kopieren).
  - Build und Container-Ausführung erfolgen als `root`.
  - Das Artefakt `core/dist/tide-daemon.exe` liegt unsigniert und ohne nachvollziehbaren CI-Build vor.
- **Auswirkung (Impact):**
  Nicht reproduzierbare Builds, potenzielles Einschleusen kompromittierter Upstream-Crates oder Basis-Images (Supply-Chain-Risiko), unnötige Rechteausweitung im Container sowie Risiko versehentlicher Secret-Leaks im Docker-Kontext.
- **Behebung (Remediation):**
  1. `Cargo.lock` generieren, committen und in `Dockerfile` sowie `build.sh` konsequent `cargo build --locked` verwenden.
  2. Basis-Images im `Dockerfile` per SHA256-Digest pinnen und einen dedizierten Non-Root-User (`USER nonroot`) einrichten.
  3. Eine restriktive `.dockerignore` anlegen (`target/`, `.git/`, `*.db`, `.env*`, `dist/`).
  4. Vorkompilierte Binaries aus dem Repo entfernen (`core/dist/tide-daemon.exe`), Builds ausschließlich über reproduzierbare CI-Workflows erzeugen und mit SHA256-Checksummen/Signaturen versehen.

---

### LOW-1: Stilles Überschreiben lokaler Notizen mit Leerstring bei Entschlüsselungs-/Downloadfehler

- **Schweregrad:** 🟡 Low
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-core/src/sync.rs:368-382, 434-447`
- **Ursache (Root Cause):**
  Schlägt während des Syncs das Herunterladen oder Entschlüsseln eines Notizinhalts fehl, wird der Fehler nicht als Abbruch behandelt, sondern ein leerer String (`""`) als Notizinhalt weiterverarbeitet/gespeichert.
- **Auswirkung (Impact):**
  Lokale oder zwischengespeicherte Notizinhalte können im Fehlerfall stillschweigend durch leere Inhalte überschrieben werden (Datenverlust-Risiko).
- **Behebung (Remediation):**
  Bei Download- oder Entschlüsselungsfehlern die betroffene Notiz überspringen, einen expliziten Fehler/Sync-Status protokollieren und bestehende lokale Daten niemals mit einem Leerstring überschreiben.

---

### LOW-2: Blockierendes `"Press Enter to exit..."` bei Fehlern hängt MCP-Hosts auf

- **Schweregrad:** 🟡 Low
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-daemon/src/main.rs:58-65`
- **Ursache (Root Cause):**
  Im Fehlerpfad wartet `main.rs` interaktiv auf eine Eingabe (`"Press Enter to exit..."`).
- **Auswirkung (Impact):**
  Wird `tide-daemon` als Headless-MCP-Server von einem Host-Prozess gestartet, schließt der Host stdin nicht bzw. erwartet einen sauberen Prozess-Exit — der Daemon blockiert unbegrenzt und hängt den MCP-Client auf.
- **Behebung (Remediation):**
  Die blockierende Eingabeaufforderung entfernen (oder maximal auf einen expliziten interaktiven Windows-Doppelklick-Setup-Modus beschränken) und bei Fehlern im Daemon-/MCP-Modus direkt mit einem Exit-Code `!= 0` sowie Fehlermeldung auf `stderr` beenden.

---

### LOW-3: Uninitialisiertes `tracing_subscriber` verwirft Krypto-Warnungen; rohe HTTP-Bodies in Fehlern

- **Schweregrad:** 🟡 Low
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-daemon/src/main.rs`
  - `core/crates/tide-core/src/sync.rs:107, 134, 216`
- **Ursache (Root Cause):**
  In `main.rs` wird kein `tracing_subscriber` initialisiert, sodass alle `tracing`-Logs und Krypto-Warnungen still verworfen werden. Gleichzeitig werden in `sync.rs:107, 134, 216` rohe HTTP-Response-Bodies ungefiltert in Fehlermeldungen aufgenommen.
- **Auswirkung (Impact):**
  Kryptographische oder sicherheitsrelevante Warnungen bleiben im Betrieb unsichtbar; gleichzeitig können im Fehlerfall ungekürzte Server-Antworten (inkl. interner Fehlerdetails oder potenzieller Token-/Nutzerdaten) in Logs/Fehlerausgaben gelangen.
- **Behebung (Remediation):**
  1. `tracing_subscriber` in `main.rs` sauber auf `stderr` initialisieren (niemals auf `stdout`, um den MCP-JSON-RPC-Stream nicht zu korrumpieren).
  2. HTTP-Fehlertexte vor der Ausgabe auf Statuscode + gekürzte/sanitisierte Fehlermeldung beschränken, niemals rohe Response-Bodies loggen.

---

### LOW-4: Stilles Ignorieren fehlerhafter JSON-RPC-Anfragen statt `-32700`/`-32600`

- **Schweregrad:** 🟡 Low
- **Betroffene Dateien & Zeilen:**
  - `core/crates/tide-daemon/src/mcp.rs:17-25`
- **Ursache (Root Cause):**
  Ungültige JSON-Eingaben oder fehlerhafte JSON-RPC-Objekte werden in `mcp.rs:17-25` still verworfen, ohne eine standardkonforme JSON-RPC-2.0-Fehlermeldung zurückzugeben.
- **Auswirkung (Impact):**
  Protokollverletzung gegenüber MCP-Clients; fehlerhafte Payloads oder Parsing-Probleme führen zu Timeouts beim Client statt zu klaren Fehlerdiagnosen.
- **Behebung (Remediation):**
  Bei JSON-Syntaxfehlern standardkonform `-32700` (*Parse error*) und bei strukturell ungültigen Requests `-32600` (*Invalid Request*) auf `stdout` zurücksenden.

---

## 4. Pre-Activation Checklist (Vor Inbetriebnahme von `tide-daemon` zwingend abzuarbeiten)

Bevor `core/` bzw. `tide-daemon` jemals gebaut, verteilt oder produktiv eingesetzt wird, **müssen** alle folgenden Punkte verifiziert und abgehakt sein:

- [ ] **HIGH-1:** `PRAGMA key` + Validierungsabfrage in `Database::open` (`db.rs`) implementiert; verifiziert, dass `local.db` ohne Schlüssel nicht lesbar ist; `is_encrypted`-Flag in `sync.rs` nur bei tatsächlich aktiver SQLCipher-Verschlüsselung auf `true` gesetzt.
- [ ] **HIGH-2:** Secrets (`bearer_token`, `encrypted_vault`, `pepper`) in OS-Keyring (`keyring`) ausgelagert oder `~/.tide/` mit `0700` und `session.json`/`local.db` mit `0600` (Unix) bzw. strikten Benutzer-DACLs (Windows) geschützt.
- [ ] **HIGH-3:** Alle Note-/File-IDs strikt über `uuid::Uuid::parse_str` validiert; URL-Konstruktion auf `Url::path_segments_mut` umgestellt.
- [ ] **HIGH-4:** `base_url`-Validierung erzwingt `https://` und erlaubte Ziel-Hosts.
- [ ] **MEDIUM-1:** `rsa`-Crate auf eine gegen `RUSTSEC-2023-0071` gepatchte Version aktualisiert oder auf X25519/HPKE migriert (`cargo audit` ohne High/Critical-Treffer).
- [ ] **MEDIUM-2:** `payload.iterations` ausgewertet (Minimum `600_000`), 100k-Fallback entfernt und `salt || pepper` sauber kombiniert.
- [ ] **MEDIUM-3:** `zeroize::Zeroizing` für `kek`, `dek`, PKCS#8-Private-Keys und `pin` im gesamten `crypto.rs` umgesetzt.
- [ ] **MEDIUM-4:** CLI-Flags `--pin`, `--token`, `--code` entfernt; `rpassword` für interaktive PIN-Abfragen eingeführt.
- [ ] **MEDIUM-5:** `limit.clamp(1, 100)` vor `as i64` in `mcp.rs` und `db.rs` erzwungen.
- [ ] **MEDIUM-6:** HTTP-Connect-/Request-Timeouts in `sync.rs`, maximale Body-Größe sowie `stdin`-Zeilenlimit in `mcp.rs` implementiert.
- [ ] **MEDIUM-7:** HTML-Sanitizing/Escaping in `tide_patch_block` ergänzt und Zeitstempel auf `as_millis()` vereinheitlicht.
- [ ] **MEDIUM-8:** `Cargo.lock` eingecheckt, `--locked`-Builds, Digest-Pinning und Non-Root-User im `Dockerfile`, `.dockerignore` erstellt und unsigniertes `core/dist/tide-daemon.exe` aus dem Repository entfernt.
- [ ] **LOW-1 bis LOW-4:** Keine stille Überschreibung lokaler Notizen mit Leerstrings, kein blockierendes `"Press Enter to exit..."`, `tracing_subscriber` auf `stderr` initialisiert (ohne rohe HTTP-Bodies), JSON-RPC-Fehlercodes `-32700`/`-32600` korrekt zurückgegeben.
- [ ] **Abschlussprüfung:** `cargo test`, `cargo clippy -- -D warnings` und `cargo audit` erfolgreich im CI durchgelaufen.
