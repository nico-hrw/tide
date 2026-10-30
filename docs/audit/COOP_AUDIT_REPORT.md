# VOLLSTÄNDIGER TECHNISCHER AUDIT-BERICHT: KOLLABORATION & VERSCHLÜSSELUNG ("COOP IN NOTIZEN") IN TIDE

**Dokument-Version:** 1.0.0  
**Datum:** 29. Oktober 2026  
**Klassifizierung:** Vertraulich / Technischer Sicherheits- & Architektur-Audit  
**Zielsystem:** Tide Productivity Platform (Next.js 16 PWA + Go 1.24 Backend + SQLite/Blobstore)  
**Autor:** Leitender Systemarchitekt & Sicherheitsprüfer  

---

## Inhaltsverzeichnis

1. [Executive Summary & Systemübersicht](#1-executive-summary--systemübersicht)
   - 1.1 Einleitung & Architekturkontext
   - 1.2 Das architektonische Kernproblem: CRDT vs. OCC/LWW
   - 1.3 Systemkomponenten im Überblick
2. [Kryptografische Architektur (Ende-zu-Ende-Verschlüsselung, E2EE)](#2-kryptografische-architektur-e2ee)
   - 2.1 Einzelnutzer-Notizen & Schlüsselableitung
   - 2.2 Multi-Nutzer-Kollaboration (2, 3, 4+ Teilnehmer)
   - 2.3 Schlüssel-Widerruf & Rotation (Revocation, PFS, PCS)
   - 2.4 Authentifizierung & Serverseitige Sicherheit
3. [Rechteverwaltung & Zugriffskontrolle (Access Control)](#3-rechteverwaltung--zugriffskontrolle-access-control)
   - 3.1 Rollenmodell & Berechtigungsmatrix
   - 3.2 Datenbankschema & Frontend-Zustandsverwaltung
   - 3.3 Durchsetzung der Zugriffskontrollen (Enforcement)
   - 3.4 Einladungs- und Freigabe-Workflow
   - 3.5 Detaillierte Sicherheitslücken & Autorisierungs-Bypässe
4. [Live-Synchronisation (Bidirektional in Echtzeit)](#4-live-synchronisation-bidirektional-in-echtzeit)
   - 4.1 Die zwei konkurrierenden Synchronisations-Pipelines
   - 4.2 End-to-End-Trace eines Tastenanschlags
   - 4.3 Das 100-Nachrichten-Guillotine-Problem
   - 4.4 Volatile Room Teardown & Fehlende Server-Persistenz
   - 4.5 Double-Seeding Duplication Bug
   - 4.6 Hardcoded `clientID = 1`
   - 4.7 OCC / LWW Überschreibungs-Kollision
   - 4.8 Disconnect-Triggered State Annihilation
5. [Cursor-Präsenz & Awareness](#5-cursor-präsenz--awareness)
   - 5.1 Implementierungsstand
   - 5.2 Fehler & Lücken in der Awareness-Pipeline
6. [Canvas-Synchronisation](#6-canvas-synchronisation)
   - 6.1 Die zwei Canvas-Systeme in Tide
   - 6.2 Standalone Canvas: Vollständiges Fehlen von CRDT/WebSockets
   - 6.3 Der State-Freeze-Bug (`useState` ohne Re-Sync)
   - 6.4 Parallele Bearbeitungskonflikte (Monolithisches LWW)
   - 6.5 Sidecar-Isolation (`.{noteId}_style`)
   - 6.6 Zero-Knowledge-Bruch in Sidecars
7. [Bilder & Multimedia-Anhänge](#7-bilder--multimedia-anhänge)
   - 7.1 Blob-Speicherung im Go-Backend
   - 7.2 Der 403-Forbidden-Fehler für Kollaborateure
   - 7.3 Der RSA-Krypto-Crash bei Multimedia-Elementen
   - 7.4 Zero-Knowledge-Bruch bei Canvas-Bildern
   - 7.5 TipTap-Editor Paste-Vakuum
   - 7.6 Verwaiste Speicher-Blobs (Storage Leak)
8. [Vollständiger Audit- & Schwachstellen-Katalog (Matrix aller 16+ Bugs)](#8-vollständiger-audit---schwachstellen-katalog-matrix-aller-16-bugs)
9. [Detaillierte Lösungs-Roadmap für ein Top-Klasse KI-Modell (Actionable Fixes & Code-Blueprints)](#9-detaillierte-lösungs-roadmap-für-ein-top-klasse-ki-modell-actionable-fixes--code-blueprints)
   - 9.1 Go WebSocket Hub: Robuster CRDT-Relay & Message Filtering
   - 9.2 Viewer-Write-Bypass & Backup-Schutz absichern
   - 9.3 Incomplete Revocation & Privilege Escalation Fix
   - 9.4 Canvas Yjs-Migration (Y.Array / Y.Map)
   - 9.5 Multimedia-Berechtigungsvererbung & DEK-Wrapping
   - 9.6 TipTap Image Paste & Upload Handler

---

# 1. Executive Summary & Systemübersicht

## 1.1 Einleitung & Architekturkontext

Tide ist als hochmoderne, lokale-first (**Local-First**) Produktivitätsplattform konzipiert, die Notizenverwaltung, kollaboratives Schreiben und visuelles Whiteboarding unter strikter Wahrung der informationellen Selbstbestimmung via Ende-zu-Ende-Verschlüsselung (**End-to-End Encryption, E2EE**) bereitstellt.

Das Gesamtsystem gliedert sich in zwei Hauptkomponenten:
1. **Frontend-Anwendung (`web/`):** Eine Progressive Web App (PWA) auf Basis von **Next.js 16 (App Router)**, React 19, TailwindCSS, Zustand für clientseitigen State und **TipTap / ProseMirror** für die Textverarbeitung. Zur kryptografischen Verarbeitung wird die native Web Cryptography API (`window.crypto.subtle`) genutzt.
2. **Backend-Dienst (`cloud/`):** Ein in **Go 1.24** entwickelter Microservice unter Verwendung des HTTP-Routers `github.com/go-chi/chi/v5`, WebSockets via `github.com/gorilla/websocket` (bzw. `nhooyr.io/websocket`), einer eingebetteten **SQLite 3** Datenbank (im WAL-Modus) und einem dateisystembasierten Content-Addressable Blobstore für Multimedia-Artefakte.

Das primäre Architekturversprechen von Tide ist das **Zero-Knowledge-Prinzip**: Der Cloud-Server besitzt zu keinem Zeitpunkt Kenntnis über Dateiinhalte, Notiztitel, Tags oder eingebettete Medien. Alle Klartextdaten werden ausschließlich auf den Endgeräten der Benutzer ver- und entschlüsselt.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  KLIENT-SYSTEME (E2EE)                                 │
│                                                                                        │
│   ┌──────────────────────────────────┐        ┌──────────────────────────────────┐     │
│   │           BENUTZER A             │        │           BENUTZER B             │     │
│   │  TipTap / Canvas / Zustand       │        │  TipTap / Canvas / Zustand       │     │
│   │  WebCrypto (DEK, RSA-4096)       │        │  WebCrypto (DEK, RSA-4096)       │     │
│   └──────────┬──────────────┬────────┘        └──────────┬──────────────┬────────┘     │
└──────────────┼──────────────┼────────────────────────────┼──────────────┼──────────────┘
               │              │                            │              │               
       Yjs WS  │      REST    │                    Yjs WS  │      REST    │               
      (Binary) │    (AES-GCM) │                   (Binary) │    (AES-GCM) │               
               ▼              ▼                            ▼              ▼               
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              TIDE BACKEND (Go 1.24 / Chi)                              │
│                                                                                        │
│   ┌──────────────────────────────────┐        ┌──────────────────────────────────┐     │
│   │       Go WebSocket Hub           │        │         Go REST API              │     │
│   │    (Blindes Binary Broadcast)    │        │   (/api/files, /api/shares)      │     │
│   └──────────────────────────────────┘        └─────────────────┬────────────────┘     │
│                                                                 │                      │
│                                               ┌─────────────────▼────────────────┐     │
│                                               │       SQLite 3 (WAL Mode)        │     │
│                                               │    (files, file_shares, users)   │     │
│                                               └─────────────────┬────────────────┘     │
│                                                                 │                      │
│                                               ┌─────────────────▼────────────────┐     │
│                                               │      Lokaler CAS Blobstore       │     │
│                                               │   (SHA-256 Chunks auf Disk)      │     │
│                                               └──────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1.2 Das architektonische Kernproblem: CRDT vs. OCC/LWW

Die durchgeführte Code-Analyse des Gesamtsystems offenbart eine **fundamentale architektonische Divergenz**. Im System existieren zwei völlig unabhängige, unkoordinierte und gegeneinander arbeitende Synchronisationsmechanismen für dieselben Daten:

```
                  ┌────────────────────────────────────────────────┐
                  │              TIPTAP PROSEMIRROR               │
                  └───────┬────────────────────────────────┬───────┘
                          │                                │
             (Pfad 1: Live-Streaming)            (Pfad 2: Snapshot-OCC)
                          │                                │
                          ▼                                ▼
              ┌───────────────────────┐        ┌───────────────────────┐
              │  Yjs CRDT Provider    │        │  useAutoSaveSync      │
              │  (y-websocket)        │        │  Timer (2 bis 5 Sek)  │
              └──────────┬────────────┘        └──────────┬────────────┘
                         │                                │
             Yjs Binary Delta (RAM)             AES-GCM-256 Voll-Verschl.
                         │                                │
                         ▼                                ▼
              ┌───────────────────────┐        ┌───────────────────────┐
              │  Go WebSocket Hub     │        │  PUT /api/files/:id   │
              │  (Ephemer, kein Disk) │        │  Version N (SQLite)   │
              └───────────────────────┘        └──────────┬────────────┘
                                                          │
                                                    Triggert SSE
                                                  "file_updated"
                                                          │
                                                          ▼
                                               ┌───────────────────────┐
                                               │ Alle anderen Klienten │
                                               │ Zerstört Editor-State!│
                                               └───────────────────────┘
```

1. **Pfad 1 (Echtzeit-CRDT):** TipTap bindet sich über `@tiptap/extension-collaboration` an ein lokales `Y.Doc`. Mutationen werden als binäre Yjs-Deltas über WebSockets an das Go-Backend gestreamt (`cloud/internal/api/websocket.go`). Der Go-Server fungiert hierbei als rein ephemerer Relayer (`GlobalHub.broadcast`), ohne den Inhalt zu validieren, zu verstehen oder auf Festplatte zu sichern.
2. **Pfad 2 (Snapshot-OCC/LWW):** Parallel läuft ein periodischer Autosave-Hook (`web/src/hooks/useAutoSaveSync.ts`), der alle 2 bis 5 Sekunden den gesamten Editor-Inhalt serialisiert, mit dem symmetrischen DEK via AES-256-GCM verschlüsselt und per `PUT /api/files/:id` an das REST-Backend sendet. Das Backend speichert das Chiffrat in SQLite und feuert ein Server-Sent Event (SSE) an alle verbundenen Clients.

**Die fatale Konsequenz:**
Wenn zwei Benutzer gleichzeitig schreiben, überträgt Yjs ihre Tastenanschläge in Millisekunden konfliktfrei im RAM. Wenige Sekunden später feuert jedoch der Autosave-Timer beider Clients:
- Client A überschreibt Version $N$ mit Version $N+1$.
- Client B erhält beim Speichern einen HTTP 409 Conflict oder überschreibt Version $N+1$ blind mit Version $N+2$.
- Parallel empfängt Client B das SSE-Signal `file_updated`, lädt den veralteten oder kollidierenden Snapshot von Client A herunter, entschlüsselt ihn und injiziert ihn zurück in den Zustand, wodurch aktive Cursor zerschlagen und Yjs-CRDT-Deltas überschrieben werden.

---

## 1.3 Systemkomponenten im Überblick

| Komponente | Datei / Modul | Primäre Aufgabe | Identifizierter Integritätsstatus |
| :--- | :--- | :--- | :--- |
| **Krypto-Engine** | `web/src/lib/crypto.ts` | RSA-OAEP, AES-GCM, PBKDF2 | Mathematisch solide, aber schwerwiegende Logikfehler bei Rotation |
| **Editor-Config** | `web/src/hooks/useTipTapConfig.ts` | Yjs-Bindung, Collaboration, Carets | Kritische Bugs: Hardcoded ClientID, Double Seeding, Paste Black Hole |
| **Autosave** | `web/src/hooks/useAutoSaveSync.ts` | REST-Snapshot-Persistenz | Zerstörerisches LWW bei 409-Konflikten |
| **Realtime Sync** | `web/src/hooks/useRealtimeSync.ts` | SSE-Event-Handling | Vernichtet ungespeicherte Eingaben bei WS-Disconnect |
| **Go Hub** | `cloud/internal/api/websocket.go` | WS-Relay, Raum-Verwaltung | Droppt Dokument-Updates ab 100 Nachrichten, kein Disk-Save |
| **Go File API** | `cloud/internal/api/files.go` | CRUD, Berechtigungsprüfung | Rechte-Eskalation nach Share-Widerruf, Viewer-Bypass bei Backups |
| **SQLite Store** | `cloud/internal/store/sqlite.go` | Datenpersistenz & JSON-Handling | Pre-Acceptance Exfiltration, defektes Rollen-Fallback |
| **Canvas Note** | `web/src/components/canvas/CanvasNoteEditor.tsx` | Standalone Whiteboard | Keinerlei CRDT/WS, State Freeze durch `useState` ohne `useEffect` |
| **Canvas Layer** | `web/src/components/notes/CanvasLayer.tsx` | Notiz-Overlay | Sidecar-Dateien isolieren Nutzer voneinander, Zero-Knowledge-Bruch |
| **Blob API** | `cloud/internal/store/blob.go` | Multimedia Content-Addressable Store | 403 Forbidden für Kollaborateure wegen fehlender Share-Vererbung |

---

# 2. Kryptografische Architektur (E2EE)

## 2.1 Einzelnutzer-Notizen & Schlüsselableitung

### Mathematische Definitionen und Algorithmen
Jede Notiz wird durch einen individuellen, symmetrischen **Document Encryption Key (DEK)** geschützt:
$$\text{DEK} \xleftarrow{\$} \{0, 1\}^{256}$$

Der DEK wird kryptografisch sicher über `window.crypto.getRandomValues(new Uint8Array(32))` erzeugt.

#### Dokumenten-Verschlüsselung (AES-256-GCM)
Der Inhalt einer Notiz (TipTap JSON-DOM oder Canvas-Struktur) wird als Klartext-Bytefolge $P$ serialisiert und mittels AES-GCM geschützt:
$$C = \text{AES-GCM-256}_{\text{DEK}}(IV, P, AAD)$$
- **Initialisierungsvektor ($IV$):** $IV \xleftarrow{\$} \{0, 1\}^{96}$ (12 Bytes, kryptografisch zufällig generiert für jede einzelne Speicheroperation).
- **Zusätzliche authentifizierte Daten ($AAD$):** Die Datei-ID und die Versionsnummer fließen als AAD ein, um Ciphertext-Transpositions-Angriffe zwischen Notizen zu verhindern.
- **Authentifizierungs-Tag:** 128 Bit (standardmäßig in WebCrypto integriert).

#### Master-Identitätsschlüsselpaar
Bei der Registrierung eines Nutzers generiert `web/src/lib/crypto.ts:68-81` ein asymmetrisches RSA-OAEP Schlüsselpaar:
$$(PK_{\text{user}}, SK_{\text{user}}) \leftarrow \text{RSA-OAEP-KeyGen}(4096 \text{ Bit}, e = 65537, \text{Hash} = \text{SHA-256})$$
- Der öffentliche Schlüssel $PK_{\text{user}}$ wird als SPKI/JWK an den Go-Server übertragen und öffentlich hinterlegt.
- Der private Schlüssel $SK_{\text{user}}$ verlässt das Gerät des Nutzers **niemals** im Klartext.

#### Tresor-Ableitung (PIN-Vault)
Zur Absicherung von $SK_{\text{user}}$ im lokalen IndexedDB-Speicher wird ein Schlüssel aus der Benutzer-PIN abgeleitet:
$$K_{\text{vault}} = \text{PBKDF2}(\text{HMAC-SHA-256}, \text{Passphrase} = \text{PIN}, \text{Salt} \in \{0,1\}^{128}, \text{Iter} = 600\,000, \text{KeyLen} = 256)$$
$$SK_{\text{enc}} = \text{AES-GCM-256}_{K_{\text{vault}}}(IV_{\text{vault}}, \text{PKCS\#8}(SK_{\text{user}}))$$

#### Optionales Notizpasswort (Doppel-Wrapping)
Wird eine Notiz zusätzlich mit einem individuellen Passwort geschützt, implementiert `crypto.ts` ein zweistufiges Enveloping:
1. **Innere Verschlüsselung:**
   $$K_{\text{note\_pwd}} = \text{PBKDF2}(\text{HMAC-SHA-256}, \text{Password}, \text{Salt}_{\text{note}}, 600\,000, 256)$$
   $$\text{DEK}_{\text{inner\_wrap}} = \text{AES-GCM-256}_{K_{\text{note\_pwd}}}(IV_{\text{pwd}}, \text{DEK})$$
2. **Äußere Verschlüsselung (Tresor-Anbindung):**
   $$\text{DEK}_{\text{outer\_wrap}} = \text{RSA-OAEP}_{PK_{\text{owner}}}(\text{DEK}_{\text{inner\_wrap}})$$

---

## 2.2 Multi-Nutzer-Kollaboration (2, 3, 4+ Teilnehmer)

### 2.2.1 Peer-to-Peer Enveloping: Symmetrischer DEK-Konsens
In kollaborativen Echtzeitsystemen (CRDT/Yjs) ist es kryptografisch und rechentechnisch unmöglich, jedes binäre Update für jeden Empfänger individuell asymmetrisch zu verschlüsseln (dies würde $O(N)$ Verschlüsselungsoperationen pro Tastenanschlag erfordern).

Tide verwendet daher ein **Peer-to-Peer Enveloping Modell**:
Alle berechtigten Teilnehmer einer Notiz (Owner, Editor, Viewer) **teilen sich exakt denselben symmetrischen DEK**.

```
                           ┌────────────────────────┐
                           │ Symmetrischer DEK      │
                           │ (256-bit AES-GCM)      │
                           └───────────┬────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│ RSA-OAEP Wrap    │          │ RSA-OAEP Wrap    │          │ RSA-OAEP Wrap    │
│ PK_Owner         │          │ PK_User_B        │          │ PK_User_C        │
└────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
         │                             │                             │
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│ files.access_keys│          │ files.access_keys│          │ files.access_keys│
│ ["owner_uuid"]   │          │ ["user_b_uuid"]  │          │ ["user_c_uuid"]  │
└──────────────────┘          └──────────────────┘          └──────────────────┘
```

### 2.2.2 Step-by-Step Kryptografischer Handshake
Wenn Eigentümer A eine Notiz mit Benutzer B teilt:
1. **Lokales Entschlüsseln:** Client A lädt seinen eigenen Key-Eintrag aus `files.access_keys[user_A]` und entschlüsselt den DEK:
   $$\text{DEK} = \text{RSA-OAEP-Decrypt}_{SK_A}(\text{enc\_dek}_A)$$
2. **Blind-Index-Lookup:** Client A hasht die E-Mail/den Nutzernamen von B mit dem globalen Salt des Blind-Index-Systems:
   $$\text{BlindIndex}_B = \text{HMAC-SHA-256}(K_{\text{blind}}, \text{Identifikator}_B)$$
   Client A fragt beim Go-Backend den öffentlichen Schlüssel für $\text{BlindIndex}_B$ ab.
3. **Schlüssel-Verpackung:** Client A verpackt den DEK für B:
   $$\text{enc\_dek}_B = \text{RSA-OAEP-Encrypt}_{PK_B}(\text{DEK})$$
4. **Metadaten-Verschlüsselung:** Client A verschlüsselt Notiztitel, Vorschau und Icon für B:
   $$\text{secured\_meta}_B = \text{AES-GCM-256}_{\text{DEK}}(IV_{\text{meta}}, \text{JSON}(\text{meta}))$$
5. **Transaktion im Backend:** Der Server persistiert das Share-Record in `file_shares` und führt in `cloud/internal/store/sqlite.go:497-502` ein atomares SQLite `json_set` aus:
   ```sql
   UPDATE files 
   SET access_keys = json_set(COALESCE(access_keys, '{}'), '$.' || ?, ?) 
   WHERE id = ?
   ```

### 2.2.3 Skalierung auf User C, D und weitere Teilnehmer
Die Struktur von `files.access_keys` in SQLite skaliert als flaches JSON-Dictionary:
```json
{
  "usr_owner_aaaa": {
    "enc_dek": "base64(RSA_OAEP(PK_A, DEK))",
    "iv": "base64(IV_A)"
  },
  "usr_collab_bbbb": {
    "enc_dek": "base64(RSA_OAEP(PK_B, DEK))",
    "iv": "base64(IV_B)"
  },
  "usr_collab_cccc": {
    "enc_dek": "base64(RSA_OAEP(PK_C, DEK))",
    "iv": "base64(IV_C)"
  }
}
```

### 2.2.4 Metadaten-Verschlüsselung (`files.secured_meta` vs `file_shares.secured_meta`)
In SQLite existieren zwei Orte für verschlüsselte Metadaten:
- `files.secured_meta`: Enthält die Metadaten aus Sicht des Owners.
- `file_shares.secured_meta`: Enthält Metadaten, die spezifisch für den eingeladenen Nutzer bereitgestellt werden.

Beim Abruf über `GetAccessibleFile` (`cloud/internal/store/sqlite.go:785`) wird ein SQL-Fallback genutzt:
```sql
COALESCE(fs.secured_meta, f.secured_meta) AS secured_meta
```
Da der Inhalt beider Felder mit demselben DEK chiffriert ist, kann jeder autorisierte Nutzer, der den DEK besitzt, die Metadaten dechiffrieren.

---

## 2.3 Schlüssel-Widerruf & Rotation (Revocation, PFS, PCS)

### 2.3.1 Die gravierende Schwachstelle: Mangelnde Schlüsselrotation
In `cloud/internal/api/files.go:469-503` implementiert die Handler-Funktion `RevokeFileShareHandler` den Entzug von Zugriffsrechten. 
Der Server führt bei einem Widerruf lediglich folgendes aus:
```go
// cloud/internal/api/files.go:495
err = s.store.DeleteFileShare(r.Context(), shareID)
```
Optional wird der Schlüssel von User B aus `files.access_keys` via `json_remove` gelöscht.

**Das kryptografische Sicherheitsversagen:**
- Der Server rotiert den $\text{DEK}$ **nicht**!
- Der Dokumentinhalt wird **nicht** re-verschlüsselt!
- Benutzer B hat den symmetrischen $\text{DEK}$ bereits auf seinem Endgerät (in IndexedDB oder im JavaScript-Speicher).

### 2.3.2 Fehlende Forward Secrecy (PFS) und Post-Compromise Security (PCS)
- **Verlust von Forward Secrecy:** Da $\text{DEK}_{\text{alt}}$ nach dem Rauswurf von Benutzer B für künftige Notiz-Revisionen weiterverwendet wird, kann Benutzer B alle zukünftigen Revisionen entschlüsseln, sofern er über das Netzwerk Zugriff auf den verschlüsselten Datenstrom erhält (z.B. über unberechtigte WebSocket-Verbindungen, SSE-Sniffing oder Backup-Leaks).
- **Verlust von Post-Compromise Security:** Wird das Endgerät von Benutzer B Wochen nach dem Entzug kompromittiert, ermöglicht der extrahierte $\text{DEK}_{\text{alt}}$ den rückwirkenden und zukünftigen Zugriff auf alle Dokumenten-Updates.

---

## 2.4 Authentifizierung & Serverseitige Sicherheit

### Passwort-Hashing & Master-Pepper
Die Benutzer-Passwörter werden serverseitig in Go mit **Argon2id** geschützt:
$$\text{Hash} = \text{Argon2id}(\text{Password}, \text{Salt} \in \{0, 1\}^{128}, \text{Time} = 3, \text{Memory} = 64 \text{ MB}, \text{Threads} = 2, \text{KeyLen} = 32)$$

Vor dem Einfügen in die Datenbank wird der generierte Hash mit einem serverseitigen Secretschlüssel (`SERVER_MASTER_KEY`) via AES-256-GCM gepeppert:
$$\text{DB\_Secret} = \text{AES-GCM-256}_{\text{SERVER\_MASTER\_KEY}}(IV, \text{Hash}, \text{UserID})$$

### Session-Tokens (JWT)
Nach erfolgreicher Verifikation signiert das Backend ein JSON Web Token:
$$\text{JWT} = \text{HMAC-SHA-256}_{\text{JWT\_SECRET}}(\text{Header} \parallel \text{Payload})$$
- Lebensdauer: 15 Minuten.
- Refresh-Mechanismus: HTTP-Only, Secure, SameSite=Strict Cookies.

---

# 3. Rechteverwaltung & Zugriffskontrolle (Access Control)

## 3.1 Rollenmodell & Berechtigungsmatrix

Tide unterscheidet formal vier Zugriffsstufen:
1. `owner`: Uneingeschränkte Eigentümerrechte (Löschen, Freigeben, Bearbeiten, Lesen).
2. `share`: Kollaborateur mit Vollzugriff und der Berechtigung, die Notiz an Dritte weiterzugeben (`can_reshare = true`).
3. `edit`: Bearbeiter mit Lese- und Schreibzugriff (darf Notiztext und Canvas ändern).
4. `view`: Reiner Lesezugriff (darf Notiztext und Canvas nur ansehen; keine Änderungen erlaubt).

| Recht / Aktion | Owner | Share | Edit | View (Soll) | View (Ist - Sicherheitsaudit) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Notiz lesen (REST)** | Ja | Ja | Ja | Ja | Ja |
| **Notiz bearbeiten (REST PUT)** | Ja | Ja | Ja | Nein | **Ja (Bypass über Versions-Increment)** |
| **Live-Edits via WebSocket** | Ja | Ja | Ja | Nein | **Ja (Kritischer Broadcast-Bypass!)** |
| **Backups erstellen / restoren** | Ja | Ja | Ja | Nein | **Ja (Schwerwiegender Bypass!)** |
| **Canvas bearbeiten** | Ja | Ja | Ja | Nein | **Ja (LWW-Überschreibung)** |
| **Bilder / Medien hochladen** | Ja | Ja | Ja (Soll) / **Nein (Ist)** | Nein | **Nein (Blockiert Editoren mit 403!)** |
| **Notiz weiterfreigeben** | Ja | Ja (wenn can_reshare) | Nein | Nein | Nein |
| **Notiz löschen** | Ja | Nein | Nein | Nein | Nein |

---

## 3.2 Datenbankschema & Frontend-Zustandsverwaltung

### 3.2.1 SQLite Schema (`files` & `file_shares`)
```sql
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL,               -- 'note', 'canvas', 'canvas-asset'
    visibility TEXT NOT NULL,         -- 'private', 'shared', 'public'
    version INTEGER NOT NULL DEFAULT 1,
    access_keys TEXT,                 -- JSON: {"user_id": {"enc_dek": "...", "iv": "..."}}
    secured_meta TEXT,                -- Verschlüsselte Metadaten (Titel, Icons)
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE file_shares (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    permission TEXT NOT NULL,         -- 'share', 'edit', 'view'
    can_reshare BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL,             -- 'pending', 'accepted', 'rejected'
    secured_meta TEXT,                -- Verschlüsselte Metadaten für Empfänger
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(file_id, user_id)
);
```

### 3.2.2 Frontend Zustand (Zustand Slices)
- `activeNoteStore`: Hält die aktuell geöffnete Notiz, ihren Entschlüsselungsstatus, den abgeleiteten DEK und die Berechtigung (`permission`).
- `fileTreeStore`: Hält die hierarchische Struktur aller verfügbaren Notizen.
- `collaboratorsStore`: Verwaltet die Liste der aktiven Teilnehmer und deren Awareness-Zustände.

---

## 3.3 Durchsetzung der Zugriffskontrollen (Enforcement)

Die Zugriffskontrolle erfolgt asymmetrisch und lückenhaft:
1. **Client UI Guards:** Im Frontend werden Bearbeitungselemente ausgeblendet, wenn `permission === 'view'` gesetzt ist. Dies ist rein kosmetisch.
2. **Go REST API:** Prüft Berechtigungen über die Hilfsfunktion `s.store.GetAccessibleFile(ctx, fileID, userID)`. Hierbei treten gravierende SQL-Logikfehler auf (siehe 3.5).
3. **Go WebSocket Server:** Prüft Berechtigungen **nur beim Verbindungsaufbau**. Während der gesamten Session findet **keinerlei Berechtigungs- oder Nachrichtenfilterung** statt!

---

## 3.4 Einladungs- und Freigabe-Workflow

1. **Share-Initiierung (`ShareModal.tsx`):**
   Der Benutzer öffnet das Share-Modal und gibt die E-Mail des Empfängers ein.
2. **Blind-Index-Identifikation:**
   Der Client berechnet `HMAC-SHA-256(K_blind, email)` und fragt `POST /api/users/lookup` ab. Das Backend liefert `userID` und `publicKeySPKI`.
3. **Krypto-Wrapping:**
   Der Client verpackt den DEK mit dem empfangenen `publicKeySPKI` und generiert `enc_dek`.
4. **Backend-Registrierung:**
   Der Client sendet `POST /api/files/:id/shares` mit `{ userId, permission, canReshare, encDek, securedMeta }`. Der Server trägt den Share mit `status = 'pending'` ein und ergänzt `files.access_keys`.
5. **Accept-Workflow:**
   Empfänger B sieht die Einladung in seiner Inbox, klickt auf "Akzeptieren", woraufhin `POST /api/shares/:id/accept` den Status auf `'accepted'` setzt.

> **Wichtig:** Anonyme Freigabelinks (Public Link Sharing) sind in diesem E2EE-Modell technisch nicht möglich, da ein anonymer Dritter über kein registriertes RSA-Schlüsselpaar verfügt, an welches der DEK sicher verpackt werden könnte.

---

## 3.5 Detaillierte Sicherheitslücken & Autorisierungs-Bypässe

### BUG-01: WebSocket Yjs Hijacking – Vollständiger Write-Bypass für "Viewer"
- **Betroffene Datei:** `cloud/internal/api/websocket.go:218-254`
- **Schweregrad:** **KRITISCH (CVSS 9.1)**
- **Mechanismus:**
  Ein Benutzer mit der zugewiesenen Rolle `view` verbindet sich auf den WebSocket-Endpunkt `/api/ws/notes/{id}`. Der Server validiert in Zeile 225 lediglich:
  ```go
  file, err := s.store.GetAccessibleFile(r.Context(), fileID, userID)
  if err != nil {
      http.Error(w, "Unauthorized", http.StatusUnauthorized)
      return
  }
  ```
  Da ein Viewer Lesezugriff hat, gibt `GetAccessibleFile` keinen Fehler zurück. Der WebSocket-Upgrade wird genehmigt.
  In der anschließenden Leseschleife (`websocket.go:240-252`) liest der Server binäre Frames ein:
  ```go
  for {
      messageType, p, err := conn.ReadMessage()
      if err != nil { break }
      // BUG: Es wird NICHT geprüft, ob file.Permission == "view" ist!
      // Jede eingehende Nachricht wird blind an alle Teilnehmer im Raum geflutet!
      room.hub.broadcast <- BroadcastMessage{
          sender:  conn,
          roomID:  fileID,
          payload: p,
      }
  }
  ```
- **Auswirkung:**
  Ein Angreifer mit reinen Leserechten kann präparierte Yjs-Binary-Updates (z.B. `Y.encodeStateAsUpdate`) über den WebSocket senden. Der Server broadcastet dieses Update an alle Teilnehmer. Die TipTap-Instanz des **Owners** empfängt das Update, wendet es konfliktfrei im RAM an – und der Autosave-Prozess des Owners verschlüsselt und persistiert die bösartigen Änderungen des Viewers über seinen eigenen privilegierten Account in die Datenbank!

---

### BUG-02: Rechte-Eskalation nach Share-Widerruf (Privilege Escalation to Owner)
- **Betroffene Datei:** `cloud/internal/api/files.go:132-142` und `cloud/internal/store/sqlite.go:782-788`
- **Schweregrad:** **KRITISCH (CVSS 8.8)**
- **Mechanismus:**
  In `sqlite.go:782-788` ist die SQL-Abfrage für `GetAccessibleFile` wie folgt formuliert:
  ```sql
  SELECT f.id, f.owner_id, f.type, f.visibility, f.version, f.access_keys,
         COALESCE(fs.secured_meta, f.secured_meta) as secured_meta,
         COALESCE(fs.permission, 'owner') as permission
  FROM files f
  LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
  WHERE f.id = ? AND (f.owner_id = ? OR fs.user_id = ? OR f.access_keys LIKE '%"' || ? || '"%')
  ```
  Wenn ein Share widerrufen wird (`DELETE FROM file_shares`), aber das Dictionary `files.access_keys` aus Performance- oder Transaktionsgründen den Schlüssel des Nutzers noch enthält (oder der Join ins Leere läuft):
  1. `fs.user_id` ist `NULL`.
  2. Die Bedingung `f.access_keys LIKE '%"user_id"%'` matcht positiv!
  3. Da `fs.permission` nun `NULL` ist, greift:
     ```sql
     COALESCE(fs.permission, 'owner')
     ```
- **Auswirkung:**
  Der zuvor entfernte Kollaborateur wird vom System plötzlich als **`owner`** eingestuft! Er erhält die Berechtigung, die Notiz zu löschen, andere Nutzer auszusperren oder Dokumenten-Snapshots zu überschreiben.

---

### BUG-03: Backup-Snapshot-Überschreibung durch Viewers
- **Betroffene Datei:** `cloud/internal/api/files.go:1149-1153`
- **Schweregrad:** **HOCH (CVSS 8.2)**
- **Mechanismus:**
  Der Endpunkt zum Wiederherstellen oder Erstellen von Datei-Snapshots / Backups (`/api/files/:id/backups/restore`) validiert den Aufrufer mit:
  ```go
  ok, err := s.store.UserHasFileAccess(ctx, fileID, userID)
  if err != nil || !ok {
      http.Error(w, "Forbidden", http.StatusForbidden)
      return
  }
  ```
  `UserHasFileAccess` prüft lediglich die Existenz eines beliebigen Lesezugriffs. Es wird **nicht** geprüft, ob der Nutzer `edit`-, `share`- oder `owner`-Rechte besitzt.
- **Auswirkung:**
  Jeder Benutzer mit Leserechten (`view`) kann ein veraltetes oder manipuliertes Backup einspielen und damit den aktuellen Arbeitsstand aller bearbeitenden Benutzer zerstören.

---

### BUG-04: Unauthentifizierte Link-Graphen-Offenlegung
- **Betroffene Datei:** `cloud/internal/api/links.go:21-25`
- **Schweregrad:** **MITTEL (CVSS 5.3)**
- **Mechanismus:**
  Die Route zur Abfrage von Notiz-Verlinkungen (`/api/links/graph`) wurde im Chi-Router versehentlich außerhalb der Authentifizierungs-Middleware deklariert:
  ```go
  r.Group(func(r chi.Router) {
      // FEHLT: r.Use(s.authMiddleware)
      r.Get("/links/graph", s.GetLinkGraphHandler)
  })
  ```
- **Auswirkung:**
  Unauthentifizierte externe Angreifer können die gesamte topologische Beziehungsstruktur aller Notizen im System einsehen (Notiz-IDs, Verbindungs-Kanten, Wissensgraphen).

---

### BUG-05: Pre-Acceptance Exfiltration von Notiz-Inhalten
- **Betroffene Datei:** `cloud/internal/store/sqlite.go:782-788`
- **Schweregrad:** **HOCH (CVSS 7.5)**
- **Mechanismus:**
  Die SQL-Abfrage in `GetAccessibleFile` führt einen `LEFT JOIN file_shares` ohne Filterung auf das Status-Feld aus:
  ```sql
  LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
  ```
  Es fehlt die zwingende Bedingung: `AND fs.status = 'accepted'`.
- **Auswirkung:**
  Sobald ein Owner eine Freigabe-Einladung an eine E-Mail versendet (`status = 'pending'`), kann der Empfänger den gesamten verschlüsselten Notizinhalt und den verpackten DEK über die API abrufen und dechiffrieren, **ohne** die Einladung jemals formell angenommen zu haben. Ein leiser Datenabgriff ohne Audit-Trail ist möglich.

---

### BUG-06: Editor-Kollaborateure erhalten 403 Forbidden bei Media-Uploads
- **Betroffene Datei:** `cloud/internal/api/files.go:840-843`
- **Schweregrad:** **HOCH (Funktionaler Blocker)**
- **Mechanismus:**
  In `UploadFileMediaHandler` implementiert der Go-Server folgende Zugriffskontrolle:
  ```go
  if file.OwnerID != currentUserID {
      http.Error(w, "Only the owner can upload attachments", http.StatusForbidden)
      return
  }
  ```
- **Auswirkung:**
  Berechtigte Kollaborateure mit der Rolle `edit` oder `share` können keine Bilder, Skizzen oder Anhänge in Notizen einfügen. Jeder Upload-Versuch schlägt hart mit `403 Forbidden` fehl.

---

# 4. Live-Synchronisation (Bidirektional in Echtzeit)

## 4.1 Die zwei konkurrierenden Synchronisations-Pipelines

In Tide existieren zwei parallele Synchronisations-Welten:
- **Yjs-CRDT-Pipeline:** Arbeitet auf binären Operations-Logs über WebSockets. Ziel: Latenzfreie kollaborative Bearbeitung von Rich-Text im Arbeitsspeicher.
- **REST/SSE-Pipeline:** Arbeitet auf zustandsbasierten JSON-Snapshots über HTTP PUT und SSE. Ziel: Langlebige Speicherung in SQLite.

Da beide Pipelines **nicht synchronisiert** sind, kommt es zu gravierenden Race Conditions.

---

## 4.2 End-to-End-Trace eines Tastenanschlags

Betrachten wir die exakte Kette von Ereignissen, wenn Benutzer A den Buchstaben "X" tippt:

```
Benutzer A tippt "X" in TipTap
  │
  ▼
TipTap erzeugt ProseMirror-Transaction
  │
  ▼
y-prosemirror fängt Transaction ab -> mutiert Y.XmlFragment
  │
  ▼
Yjs generiert binäres Update: delta = Y.encodeUpdate(ydoc)
  │
  ▼
y-websocket Provider fängt 'update' Event ab
  │
  ▼
WebSocket Frame (Binary, Typ 0 / SyncStep 2 / Update) geht an Go Backend
  │
  ▼
Go WebSocket Handler: conn.ReadMessage() empfängt Bytes
  │
  ▼
hub.broadcast <- BroadcastMessage{ payload: delta }
  │
  ▼
Go Hub iteriert über alle Clients im Raum (außer Sender)
  │
  ▼
Benutzer B empfängt WebSocket Frame
  │
  ▼
y-websocket Provider auf Client B empfängt Bytes
  │
  ▼
Y.applyUpdate(ydoc, delta) auf Client B
  │
  ▼
y-prosemirror Binding feuert -> aktualisiert ProseMirror-State
  │
  ▼
React / DOM rendert Buchstabe "X" bei Benutzer B
```

---

## 4.3 Das 100-Nachrichten-Guillotine-Problem
- **Betroffene Datei:** `cloud/internal/api/websocket.go:140-146`
- **Schweregrad:** **KRITISCH (Datenverlust / Desynchronisation)**
- **Mechanismus:**
  Der Go WebSocket Hub puffert Nachrichten in einem ephemeren Ringpuffer im Arbeitsspeicher, um neu beitretenden Clients die Historie nachzuliefern:
  ```go
  // cloud/internal/api/websocket.go:140
  if len(room.history) > 100 {
      room.history = room.history[len(room.history)-100:]
  }
  ```
  Wenn zwei oder drei Benutzer kollaborieren, erzeugt die Maus- und Cursorbewegung (Awareness-Updates) problemlos **50 bis 100 Nachrichten pro Sekunde**.
- **Auswirkung:**
  Innerhalb von 1 bis 2 Sekunden verdrängen ephemere Awareness-Events (Cursor-Koordinaten) die kritischen Dokumenten-Update-Nachrichten (`Y.Update`) vollständig aus dem Puffer!
  Tritt nun ein dritter Benutzer dem Raum bei oder verbindet sich ein Nutzer nach einem kurzen WLAN-Aussetzer neu, erhält er nur noch Cursor-Events, aber nicht mehr den vollständigen Dokumentenstatus. Das Dokument verbleibt in einem zersplitterten Zustand.

---

## 4.4 Volatile Room Teardown & Fehlende Server-Persistenz
- **Betroffene Datei:** `cloud/internal/api/websocket.go:125-128`
- **Schweregrad:** **KRITISCH (Totaler Datenverlust bei Browser-Crash)**
- **Mechanismus:**
  ```go
  if len(room.clients) == 0 {
      delete(h.rooms, roomID)
  }
  ```
  Das Backend verwaltet Räume ausschließlich in einer flüchtigen Go-Map (`map[string]*Room`).
  Der Server parst oder deserialisiert das Yjs-CRDT-Dokument **nicht**. Er speichert die Yjs-Updates **nicht** auf Festplatte oder in SQLite.
- **Auswirkung:**
  Wenn alle Benutzer den Raum verlassen oder der Tab geschlossen wird, bevor der REST-Autosave-Timer (`useAutoSaveSync.ts`) erfolgreich ausgeführt wurde, wird der gesamte Raum im Go-Arbeitsspeicher gelöscht. Alle seit dem letzten REST-Autosave getätigten Änderungen sind unwiederbringlich verloren.

---

## 4.5 Double-Seeding Duplication Bug
- **Betroffene Datei:** `web/src/hooks/useTipTapConfig.ts:353-362`
- **Schweregrad:** **HOCH (Integritätsverlust)**
- **Mechanismus:**
  Beim Initialisieren des TipTap-Editors lädt der Client die Notiz aus dem REST-Backend (`initialContent`).
  In `useTipTapConfig.ts` existiert folgende Logik:
  ```typescript
  // web/src/hooks/useTipTapConfig.ts:355
  if (provider && !provider.synced && initialContent) {
      editor.commands.setContent(initialContent);
  }
  ```
- **Auswirkung:**
  Client B öffnet eine bereits existierende Notiz. Das lokale `Y.Doc` ist im ersten Render-Frame noch leer. Der Code detektiert ein leeres Dokument und initialisiert TipTap mit dem `initialContent`.
  Eine halbe Sekunde später schließt `y-websocket` den Handshake (`SyncStep 2`) ab und empfängt das remote `Y.Doc` von Client A.
  Da TipTap bereits initialen Text in das Fragment geschrieben hat, betrachtet Yjs die eingehenden Daten als zusätzliche Absätze und **hängt den gesamten Notiztext noch einmal an!** Der Textinhalt verdoppelt sich bei jedem Beitritt.

---

## 4.6 Hardcoded `clientID = 1`
- **Betroffene Datei:** `web/src/hooks/useTipTapConfig.ts:299-301`
- **Schweregrad:** **KRITISCH (CRDT-Invarianten-Bruch)**
- **Mechanismus:**
  In `useTipTapConfig.ts` wurde die Client-ID des `Y.Doc` statisch konfiguriert oder fest verdrahtet:
  ```typescript
  // useTipTapConfig.ts:299
  const ydoc = new Y.Doc({ gc: true });
  ydoc.clientID = 1; // FEHLER: Hardcodierte ID!
  ```
- **Auswirkung:**
  Das mathematische Fundament von CRDTs basiert darauf, dass jeder Akteur eine weltweit eindeutige `clientID` besitzt, um Operationen in der Lamport-Uhr partiell zu ordnen.
  Wenn Client A und Client B beide mit `clientID = 1` senden, erkennen die Yjs-Algorithmen remote Operationen fälschlicherweise als eigene lokale Operationen oder überschreiben Struct-Sequenzen im Y-Array. Dies führt zu massiven Zeichen-Verschluckungen und Programmabstürzen.

---

## 4.7 OCC / LWW Überschreibungs-Kollision
- **Betroffene Datei:** `web/src/hooks/useAutoSaveSync.ts:315-335`
- **Schweregrad:** **HOCH (Stilles Überschreiben von Daten)**
- **Mechanismus:**
  Der Autosave-Hook speichert Snapshots mit optimistischer Nebenläufigkeitskontrolle (OCC). Sendet Client B ein Update auf Basis von Version 5, während Client A bereits Version 6 geschrieben hat, antwortet der Server mit `409 Conflict`.
  In `useAutoSaveSync.ts:328` wird der Konflikt wie folgt abgefangen:
  ```typescript
  } catch (err: any) {
      if (err.status === 409) {
          // FEHLER: Blindes Erhöhen der Version ohne Re-Base!
          currentVersion = err.serverVersion + 1;
          await saveNotePayload(noteId, currentVersion, encryptedBlob);
      }
  }
  ```
- **Auswirkung:**
  Client B holt nicht den aktuellen Stand von Client A ab, sondern erhöht einfach blind die Versionsnummer und feuert den PUT-Request erneut ab. Die Änderungen von Client A werden in der SQLite-Datenbank stillschweigend durch den Zustand von Client B überschrieben (Last-Write-Wins Katastrophe).

---

## 4.8 Disconnect-Triggered State Annihilation
- **Betroffene Datei:** `web/src/hooks/useRealtimeSync.ts:305-317`
- **Schweregrad:** **HOCH (Zerstörung ungespeicherter Eingaben)**
- **Mechanismus:**
  Wenn die WebSocket-Verbindung kurz abreißt (z.B. bei Netzwerk-Jitter), detektiert `useRealtimeSync.ts` den Ausfall und greift auf die SSE-Pipeline zurück.
  Das SSE-Event `file_updated` empfängt den letzten Datenbank-Snapshot:
  ```typescript
  // useRealtimeSync.ts:312
  eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'file_updated') {
          // FEHLER: Zwingt den aktiven Zustand zum Neuladen aus der DB!
          activeNoteStore.getState().reloadFromRemote(data.fileId);
      }
  };
  ```
- **Auswirkung:**
  Da der Datenbank-Snapshot typischerweise 2 bis 5 Sekunden hinter den Live-Eingaben des Benutzers hinterherhinkt, radiert `reloadFromRemote` alle Zeichen aus dem Editor-Speicher aus, die der Benutzer in den letzten Sekunden getippt hat.

---

# 5. Cursor-Präsenz & Awareness

## 5.1 Implementierungsstand

Die visuelle Präsenz von Kollaborateuren wird über folgende Komponenten realisiert:
1. **TipTap Extension:** `@tiptap/extension-collaboration-caret` kapselt die Awareness-Zustände von Yjs.
2. **CSS-Styling:** In `web/src/styles/globals.css:860-906` sind CSS-Klassen für Carets definiert:
   ```css
   .collaboration-carets__cursor {
       position: relative;
       margin-left: -1px;
       margin-right: -1px;
       border-left: 2px solid;
       word-break: normal;
       pointer-events: none;
   }
   .collaboration-carets__label {
       position: absolute;
       top: -1.4em;
       left: -1px;
       font-size: 11px;
       font-weight: 600;
       padding: 1px 4px;
       border-radius: 4px;
       white-space: nowrap;
   }
   ```
3. **Top-Bar Avatare:** Ein Stack aus farbigen Benutzer-Chips zeigt an, welche Accounts aktuell online sind.

---

## 5.2 Fehler & Lücken in der Awareness-Pipeline

### 5.2.1 Ghost-Cursor bei Verbindungsabbruch
Schließt ein Kollaborateur seinen Laptop oder verliert das WLAN, sendet der Browser keinen sauberen WebSocket-Close-Frame.
- Der Go-Server erkennt den TCP-Timeout erst nach mehreren Minuten.
- Der Go-Server sendet **keine** Yjs-Awareness-Entfernungsnachricht (`{ added: [], updated: [], removed: [clientID] }`) an die verbleibenden Clients.
- **Auswirkung:** Der Cursor des getrennten Nutzers bleibt als "Geist" 30 Sekunden lang (dem Standard-Timeout von Yjs) auf der letzten Position im Editor stehen.

### 5.2.2 Guest-Profile Fallback Race
- **Betroffene Datei:** `web/src/hooks/useTipTapConfig.ts:126`
- Beim Laden der Seite initialisiert sich TipTap schneller, als der HTTP-Request `/api/users/me` das Benutzerprofil zurückgeben kann:
  ```typescript
  // useTipTapConfig.ts:126
  const userName = userProfile?.name || "Guest";
  const userColor = userProfile?.color || "#6366f1";
  ```
- **Auswirkung:** Wenn das Profil noch lädt, registriert sich der Nutzer dauerhaft als "Guest" mit Standard-Indigofarbe. Nach Abschluss des Profil-Loads wird der Yjs-Awareness-State nicht aktualisiert. Alle Teilnehmer sehen sich gegenseitig als namenlose "Guests".

### 5.2.3 Blockierendes Gate auf `isShared`
- **Betroffene Datei:** `web/src/components/notes/Editor.tsx:63`
- Die Collaboration- und Caret-Extensions werden nur bedingt eingebunden:
  ```typescript
  if (!isShared) return;
  ```
- **Auswirkung:** Solange das Frontend den Share-Status einer Notiz via REST asynchron lädt (`isShared` ist anfangs `false`), startet der WebSocket-Provider nicht. Cursors werden erst nach einer deutlichen Verzögerung sichtbar.

### 5.2.4 Vollständiges Fehlen von Canvas-Cursors
Im visuellen Canvas-Editor existiert **keinerlei** Cursor- oder Präsenzsystem. Die Bewegung von Mauszeigern oder ausgewählten Objekten anderer Nutzer ist zu 0 % implementiert.

---

# 6. Canvas-Synchronisation

## 6.1 Die zwei Canvas-Systeme in Tide

In der Architektur existieren zwei grundverschiedene Canvas-Implementierungen:
1. **Standalone Canvas Note (`web/src/components/canvas/CanvasNoteEditor.tsx`):** Eine vollwertige Notiz vom Typ `canvas`, auf der Formen, Pfeile, Textkarten und Bilder frei platziert werden können.
2. **Sidecar Canvas Layer (`web/src/components/notes/CanvasLayer.tsx`):** Eine transparente Zeichnungsebene, die wie eine Klarsichtfolie über eine reguläre TipTap-Textnotiz gelegt wird.

---

## 6.2 Standalone Canvas: Vollständiges Fehlen von CRDT/WebSockets
Während der Rich-Text-Editor (TipTap) zumindest rudimentär an Yjs angebunden ist, existiert für das Standalone Canvas **überhaupt keine CRDT- oder WebSocket-Integrierung**!
- Der Canvas serialisiert seinen Zustand in ein monolithisches JSON-Array:
  ```json
  {
    "items": [
      { "id": "box_1", "type": "rectangle", "x": 120, "y": 80, "width": 200, "height": 100 },
      { "id": "text_2", "type": "text", "x": 350, "y": 200, "text": "Architektur" }
    ]
  }
  ```
- Die Speicherung erfolgt ausschließlich über periodische `PUT /api/files/:id` HTTP-Requests mit dem gesamten Array als Chiffrat.

---

## 6.3 Der State-Freeze-Bug (`useState` ohne Re-Sync)
- **Betroffene Datei:** `web/src/components/canvas/CanvasNoteEditor.tsx:28`
- **Schweregrad:** **KRITISCH (Funktionale Blindheit)**
- **Code-Befund:**
  ```typescript
  // CanvasNoteEditor.tsx:28
  export function CanvasNoteEditor({ initialData, noteId }: CanvasProps) {
      // FEHLER: State wird einmalig initialisiert und nie wieder synchronisiert!
      const [items, setItems] = useState<CanvasItem[]>(initialData.items);
      
      // Es existiert KEIN useEffect, der auf externe Daten-Updates oder SSE reagiert!
  ```
- **Auswirkung:**
  Wenn Benutzer A und Benutzer B dasselbe Canvas öffnen:
  - Benutzer A verschiebt ein Rechteck.
  - Benutzer A speichert den Stand in der Datenbank.
  - Bei Benutzer B passiert auf dem Bildschirm **exakt gar nichts**!
  - Benutzer B sieht die Änderungen von Benutzer A **niemals live**. Er muss die Notiz manuell schließen und aus der Seitenleiste komplett neu öffnen, um den neuen Stand zu sehen.

---

## 6.4 Parallele Bearbeitungskonflikte (Monolithisches LWW)
Da keine granularen Element-Updates existieren, gilt das strikte Last-Write-Wins-Prinzip auf Dokumentebene:
- Benutzer A verschiebt Element 1.
- Benutzer B zeichnet Element 3.
- Beide speichern nach 2 Sekunden per HTTP PUT.
- Der Server übernimmt den Request von Benutzer B.
- Das Verschieben von Element 1 durch Benutzer A ist **vollständig verloren**, da Benutzer B noch das alte Element 1 in seinem State hatte und dieses den Server-State überschrieben hat.

---

## 6.5 Sidecar-Isolation (`.{noteId}_style`)
- **Betroffene Datei:** `web/src/hooks/useStyleFile.ts:40-49`
- **Schweregrad:** **HOCH (Kollaborations-Bruch)**
- **Mechanismus:**
  Der Sidecar-Canvas speichert seine Daten in einer unsichtbaren Begleitdatei mit dem Namen `.{noteId}_style`.
  In `useStyleFile.ts` lautet die Suchabfrage nach dieser Datei:
  ```typescript
  // useStyleFile.ts:42
  const styleFile = files.find(f => 
      f.name === `.${noteId}_style` && f.ownerId === currentUserId
  );
  ```
- **Auswirkung:**
  Die Abfrage filtert hart nach `f.ownerId === currentUserId`.
  Wenn der Eigentümer Zeichnungen auf dem Notizen-Overlay anfertigt, sucht Kollaborateur B nach einer Datei mit *seiner eigenen* User-ID. Da diese nicht existiert, legt Kollaborateur B eine völlig neue, leere Sidecar-Datei an.
  **Ergebnis:** Jeder Kollaborateur malt auf seiner eigenen, isolierten "Insel". Niemand sieht jemals die Zeichnungen der anderen.

---

## 6.6 Zero-Knowledge-Bruch in Sidecars
- **Betroffene Datei:** `web/src/hooks/useStyleFile.ts:65`
- **Schweregrad:** **KRITISCH (Datenschutzverletzung)**
- **Mechanismus:**
  Beim Erstellen der Sidecar-Datei wird diese mit folgenden Parametern initialisiert:
  ```typescript
  // useStyleFile.ts:65
  await createFile({
      name: `.${noteId}_style`,
      visibility: 'public', // SICHERHEITSLÜCKE: Public statt private!
      type: 'canvas-style',
      content: JSON.stringify(styleData) // SICHERHEITSLÜCKE: Klartext unverschlüsselt!
  });
  ```
- **Auswirkung:**
  Die Zeichnungen, Markierungen und Hervorhebungen auf einer E2EE-Notiz werden unverschlüsselt und als "public" auf den Server geladen! Der Serverbetreiber kann alle Zeichnungen im Klartext mitlesen.

---

# 7. Bilder & Multimedia-Anhänge

## 7.1 Blob-Speicherung im Go-Backend

Das Go-Backend nutzt einen inhaltsadressierbaren Speicher (**Content-Addressable Storage, CAS**) unter `cloud/internal/store/blob.go`:
- Eingehende Binärdaten werden gehasht: $\text{Hash} = \text{SHA-256}(\text{Bytes})$.
- Der Blob wird im Dateisystem unter `blobs/{hash[0:2]}/{hash[2:4]}/{hash}` abgelegt.
- Deduplizierung: Identische Chiffrate belegen nur einmal Speicherplatz.

---

## 7.2 Der 403-Forbidden-Fehler für Kollaborateure
- **Betroffene Datei:** `cloud/internal/store/sqlite.go:783-788` & `cloud/internal/api/files.go:870`
- **Schweregrad:** **KRITISCH (Funktionaler Ausfall)**
- **Mechanismus:**
  Wenn ein Bild in ein Canvas hochgeladen wird, legt das System einen neuen Datenbankeintrag in `files` an:
  - `type`: `'canvas-asset'`
  - `visibility`: `'private'`
  - `owner_id`: `UserID_des_Uploaders`
  
  Wird nun die übergeordnete Notiz (Parent Note) für Benutzer B freigegeben, erzeugt das Backend **ausschließlich** einen Eintrag in `file_shares` für die `Parent Note ID`.
  
  Möchte Benutzer B das Canvas rendern, lädt sein Browser das Bild über den Endpunkt:
  `GET /api/files/{canvasAssetId}/blob`
  
  Die Autorisierungsprüfung in `sqlite.go:783-788` prüft:
  ```sql
  SELECT f.id FROM files f
  LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
  WHERE f.id = ? AND (f.owner_id = ? OR fs.user_id = ?)
  ```
- **Auswirkung:**
  Da für `canvasAssetId` niemals ein Eintrag in `file_shares` angelegt wurde und Benutzer B nicht der `owner_id` ist, schlägt die SQL-Abfrage fehl.
  Der Server antwortet mit **`403 Forbidden`**. Kollaborateure sehen auf dem Canvas anstelle von Bildern nur zerbrochene Platzhalter-Symbole.

---

## 7.3 Der RSA-Krypto-Crash bei Multimedia-Elementen
- **Betroffene Datei:** `web/src/components/canvas/CanvasNoteItem.tsx:40`
- **Schweregrad:** **KRITISCH (Client-Crash)**
- **Mechanismus:**
  Um das Bild E2EE zu schützen, generiert der Uploader einen symmetrischen `AssetKey` (AES-256-GCM), verschlüsselt das Bild damit und speichert den Schlüssel verpackt im Canvas-Item:
  ```typescript
  // CanvasNoteItem.tsx:40
  const decryptedKey = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      currentUserPrivateKey, // FEHLER: Private Key des aktuellen Lesers!
      base64ToArrayBuffer(item.encryptedAssetKey)
  );
  ```
  Der Uploader hat `item.encryptedAssetKey` jedoch mit **seinem eigenen** öffentlichen RSA-Schlüssel ($PK_{\text{Uploader}}$) verschlüsselt!
- **Auswirkung:**
  Wenn Kollaborateur B versucht, das Bild zu entschlüsseln, wirft die WebCrypto-Engine eine Exception:
  ```
  OperationError: The operation failed for an operation-specific reason (RSA decrypt error)
  ```
  Die JavaScript-Ausführung bricht ab, und das gesamte Canvas stürzt ab.

---

## 7.4 Zero-Knowledge-Bruch bei Canvas-Bildern
- **Betroffene Datei:** `web/src/hooks/useCanvasImageUpload.ts:60-69`
- **Schweregrad:** **KRITISCH (Komplette E2EE-Kapitulation)**
- **Mechanismus:**
  Um den unter 7.3 beschriebenen Absturz im Eilverfahren zu "flicken", hat ein Entwickler folgenden Workaround eingebaut:
  ```typescript
  // useCanvasImageUpload.ts:65
  const canvasItem = {
      id: generateId(),
      type: 'image',
      assetId: uploadedFile.id,
      // SICHERHEITSLÜCKE: Schlüssel wird im Klartext im JSON abgelegt!
      fileKeyJwk: await window.crypto.subtle.exportKey("jwk", rawAssetKey)
  };
  ```
- **Auswirkung:**
  Der symmetrische Schlüssel zum Entschlüsseln des privaten Bildes wird als Klartext-JSON-Objekt in das Canvas eingebettet. Da Sidecars oder Metadaten teilweise unverschlüsselt übertragen werden, ist das Bild **de facto unverschlüsselt**.

---

## 7.5 TipTap-Editor Paste-Vakuum
- **Betroffene Datei:** `web/src/hooks/useTipTapConfig.ts:281-284`
- **Schweregrad:** **HOCH (Funktionaler Mangel)**
- **Code-Befund:**
  ```typescript
  // useTipTapConfig.ts:281
  handlePaste: (view, event, slice) => {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find(item => item.type.startsWith('image/'));
      if (imageItem) {
          event.preventDefault();
          // FEHLER: Logik bricht hier einfach ab!
          return true; // Signalisiert TipTap, dass der Paste "behandelt" wurde!
      }
      return false;
  }
  ```
- **Auswirkung:**
  Kopiert ein Benutzer einen Screenshot oder eine Bilddatei und fügt sie mit `Strg+V` in den Editor ein, fängt das Event den Vorgang ab und gibt `true` zurück. Es findet jedoch weder ein Upload noch ein Einfügen eines TipTap-Bildknotens statt. Das Bild verschwindet spurlos.

---

## 7.6 Verwaiste Speicher-Blobs (Storage Leak)
Wird ein Bild auf dem Canvas oder im Editor gelöscht:
- Das Frontend entfernt lediglich den Knoten aus dem DOM/JSON.
- Es wird **kein** API-Call an `DELETE /api/files/:assetId` gesendet.
- Der Blob verbleibt für immer auf der Festplatte des Servers. Es existiert kein Garbage-Collection-Worker im Go-Backend.

---

# 8. Vollständiger Audit- & Schwachstellen-Katalog (Matrix aller 16+ Bugs)

| ID | Komponente | Datei & Zeilenreferenz | Schweregrad | Schwachstellen-Typ | Kurzbeschreibung & Auswirkung |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **BUG-01** | Backend WS | `cloud/internal/api/websocket.go:218-254` | **KRITISCH** | Broken Access Control | **Viewer Yjs Hijacking:** Viewer können über WebSockets binäre Schreib-Updates senden; Owner-Autosave persistiert diese in DB. |
| **BUG-02** | Backend SQL | `cloud/internal/store/sqlite.go:782-788`<br>`cloud/internal/api/files.go:132-142` | **KRITISCH** | Privilege Escalation | **Revocation Escalation to Owner:** Nach Share-Widerruf fällt `COALESCE(fs.permission, 'owner')` auf 'owner' zurück. |
| **BUG-03** | Backend API | `cloud/internal/api/files.go:1149-1153` | **HOCH** | Broken Authorization | **Backup Snapshot Overwrite:** `UserHasFileAccess` erlaubt Viewers das Erstellen und Wiederherstellen von Backups. |
| **BUG-04** | Backend Router| `cloud/internal/api/links.go:21-25` | **MITTEL** | Information Disclosure | **Unauthenticated Link Graph:** Topologischer Beziehungsgraph aller Notizen ohne Authentifizierungs-Token abrufbar. |
| **BUG-05** | Backend SQL | `cloud/internal/store/sqlite.go:782-788` | **HOCH** | Information Disclosure | **Pre-Acceptance Exfiltration:** Einladungen mit `status='pending'` gewähren sofortigen Lese- und DEK-Zugriff. |
| **BUG-06** | Backend API | `cloud/internal/api/files.go:840-843` | **HOCH** | Functional Blocker | **Collaborator Media Upload 403:** Prüft `file.OwnerID != currentUserID`; berechtigte Editoren können keine Medien uploaden. |
| **BUG-07** | Backend WS | `cloud/internal/api/websocket.go:140-146` | **KRITISCH** | Data Integrity Loss | **100-Nachrichten-Guillotine:** Cursor-Awareness flutet 100-Msg-Ringpuffer; Dokument-Updates werden gedroppt. |
| **BUG-08** | Backend WS | `cloud/internal/api/websocket.go:125-128` | **KRITISCH** | Permanent Data Loss | **Volatile Room Teardown:** Go persistiert kein Yjs auf Disk; Schließen des Tabs vor Autosave löscht die Session im RAM. |
| **BUG-09** | Frontend Hook | `web/src/hooks/useTipTapConfig.ts:353-362`| **HOCH** | Data Duplication | **Double-Seeding Duplication:** Unsynchronisierter Provider initialisiert Text neu; Yjs-Sync verdoppelt den Inhalt. |
| **BUG-10** | Frontend Hook | `web/src/hooks/useTipTapConfig.ts:299-301`| **KRITISCH** | CRDT Invariant Violation | **Hardcoded clientID = 1:** Alle Klienten nutzen dieselbe Lamport-Identität; führt zu Kollisionen und Dropouts. |
| **BUG-11** | Frontend Hook | `web/src/hooks/useAutoSaveSync.ts:315-335`| **HOCH** | Silent Data Loss | **OCC / LWW Overwrite:** 409 Conflict wird durch blindes Erhöhen der Version gelöst; überschreibt Fremd-Edits. |
| **BUG-12** | Frontend Hook | `web/src/hooks/useRealtimeSync.ts:305-317`| **HOCH** | State Loss | **Disconnect State Annihilation:** WS-Disconnect triggert SSE-Reload; radiert ungespeicherte Eingaben aus. |
| **BUG-13** | Frontend UI | `web/src/hooks/useTipTapConfig.ts:126` | **NIEDRIG** | UI Inconsistency | **Guest Profile Fallback Race:** Asynchroner Profil-Load verharrt auf "Guest"; Awareness aktualisiert Namen nie. |
| **BUG-14** | Canvas Editor | `web/src/components/canvas/CanvasNoteEditor.tsx:28` | **KRITISCH** | Functional Blindness | **Canvas State Freeze:** `useState` ohne `useEffect` ignoriert Server-Updates; Remote-Änderungen bleiben unsichtbar. |
| **BUG-15** | Sidecar Hook | `web/src/hooks/useStyleFile.ts:40-49` | **HOCH** | Functional Isolation | **Sidecar User Isolation:** Filtert nach `ownerId === currentUserId`; Kollaborateure erzeugen getrennte Sidecars. |
| **BUG-16** | Sidecar Hook | `web/src/hooks/useStyleFile.ts:65` | **KRITISCH** | Zero-Knowledge Breach | **Public Unencrypted Sidecar:** Sidecar wird mit `visibility: 'public'` und im Klartext-JSON hochgeladen. |
| **BUG-17** | Backend SQL | `cloud/internal/store/sqlite.go:783-788` | **KRITISCH** | Broken Authorization | **Child Asset 403 Forbidden:** Kind-Dateien (`canvas-asset`) erben Freigaben der Eltern-Notiz nicht. |
| **BUG-18** | Canvas Item | `web/src/components/canvas/CanvasNoteItem.tsx:40` | **KRITISCH** | Cryptographic Failure | **RSA Decrypt Trap:** Bild-Key wird mit Uploader-PubKey verschlüsselt; Leser wirft WebCrypto `OperationError`. |
| **BUG-19** | Canvas Upload| `web/src/hooks/useCanvasImageUpload.ts:60-69`| **KRITISCH** | Zero-Knowledge Breach | **Plaintext JWK Leak:** Entwickler legte `fileKeyJwk` im Klartext im Canvas-JSON ab, um RSA-Bug zu umgehen. |
| **BUG-20** | Editor Paste | `web/src/hooks/useTipTapConfig.ts:281-284`| **MITTEL** | Missing Feature | **Paste Black Hole:** `handlePaste` fängt Bilder ab und gibt `true` zurück, führt aber keinen Upload aus. |

---

# 9. Detaillierte Lösungs-Roadmap für ein Top-Klasse KI-Modell (Actionable Fixes & Code-Blueprints)

Dieses Kapitel liefert präzise, direkt implementierbare Code-Blueprints zur Behebung aller identifizierten Kernschwachstellen.

---

## 9.1 Go WebSocket Hub: Robuster CRDT-Relay & Message Filtering

### Ziel:
1. Validierung der Benutzerrolle bei **jeder** eingehenden WebSocket-Nachricht.
2. Herausfiltern von Schreibnachrichten (Yjs Update-Nachrichten), falls der Benutzer nur `view`-Rechte besitzt.
3. Nur Awareness-Nachrichten (Cursor) von Viewern zulassen.
4. Trennung des Puffers in Awareness (flüchtig) vs. Document Updates (dauerhaft).

### Blueprint: `cloud/internal/api/websocket.go`
```go
package api

import (
	"log"
	"net/http"
	"sync"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// Yjs Protokoll Nachrichtentypen (y-protocols)
const (
	YjsMsgSync      = 0
	YjsMsgAwareness = 1
	YjsSyncStep1    = 0
	YjsSyncStep2    = 1
	YjsSyncUpdate   = 2
)

type ClientSession struct {
	conn       *websocket.Conn
	userID     string
	permission string // "owner", "share", "edit", "view"
	roomID     string
	send       chan []byte
}

type SafeRoom struct {
	sync.RWMutex
	id         string
	clients    map[*ClientSession]bool
	docUpdates [][]byte // Echter CRDT-Verlauf (keine Awareness!)
}

// Prüft, ob eine binäre Yjs-Nachricht Schreiboperationen auf das Dokument enthält
func isDocumentWritePayload(p []byte) bool {
	if len(p) == 0 {
		return false
	}
	// Yjs Sync Protocol
	if p[0] == YjsMsgSync && len(p) > 1 {
		subType := p[1]
		if subType == YjsSyncStep2 || subType == YjsSyncUpdate {
			return true
		}
	}
	return false
}

func (s *Server) ServeWs(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "id")
	userID := r.Context().Value("userID").(string)

	// 1. Berechtigungen strikt aus der Datenbank laden
	file, err := s.store.GetAccessibleFile(r.Context(), fileID, userID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &ClientSession{
		conn:       conn,
		userID:     userID,
		permission: file.Permission,
		roomID:     fileID,
		send:       make(chan []byte, 256),
	}

	room := s.getOrCreateRoom(fileID)
	room.registerClient(client)

	// Send initial document updates
	room.RLock()
	for _, update := range room.docUpdates {
		client.conn.WriteMessage(websocket.BinaryMessage, update)
	}
	room.RUnlock()

	go client.writePump()
	client.readPump(room)
}

func (c *ClientSession) readPump(room *SafeRoom) {
	defer func() {
		room.unregisterClient(c)
		c.conn.Close()
	}()

	for {
		msgType, payload, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		if msgType != websocket.BinaryMessage {
			continue
		}

		// BUG-01 FIX: Viewers dürfen KEINE Document Updates senden!
		if c.permission == "view" && isDocumentWritePayload(payload) {
			log.Printf("[SECURITY VIOLATION] Viewer %s tried to mutate doc %s", c.userID, c.roomID)
			continue // Drop update silently or close connection
		}

		// Pufferung: Nur Dokument-Updates speichern, keine ephemeren Cursors
		if isDocumentWritePayload(payload) {
			room.Lock()
			room.docUpdates = append(room.docUpdates, payload)
			room.Unlock()
		}

		// An alle anderen Clients im Raum broadcasten
		room.RLock()
		for otherClient := range room.clients {
			if otherClient != c {
				select {
				case otherClient.send <- payload:
				default:
					close(otherClient.send)
					delete(room.clients, otherClient)
				}
			}
		}
		room.RUnlock()
	}
}
```

---

## 9.2 Viewer-Write-Bypass & Backup-Schutz absichern

### Ziel:
In `cloud/internal/api/files.go` muss bei allen schreibenden Aktionen (`RestoreBackup`, `UpdateFile`, `DeleteFile`) explizit auf `edit`, `share` oder `owner` geprüft werden.

### Blueprint: `cloud/internal/api/files.go:1149`
```go
// BUG-03 FIX: Absicherung des Backup-Restore Handlers
func (s *Server) RestoreBackupHandler(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "id")
	userID := r.Context().Value("userID").(string)

	file, err := s.store.GetAccessibleFile(r.Context(), fileID, userID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Berechtigungsprüfung verschärfen
	if file.Permission != "owner" && file.Permission != "share" && file.Permission != "edit" {
		http.Error(w, "Forbidden: Viewers cannot restore backups", http.StatusForbidden)
		return
	}

	// ... Ausführung des Restores ...
}
```

---

## 9.3 Incomplete Revocation & Privilege Escalation Fix

### Ziel:
1. `COALESCE(fs.permission, 'owner')` eliminieren. Wenn keine Owner-Übereinstimmung vorliegt und kein Share existiert, darf niemals `'owner'` zurückgegeben werden!
2. Nur angenommene Shares (`status = 'accepted'`) zulassen.
3. Beim Share-Widerruf `files.access_keys` atomar bereinigen.

### Blueprint: `cloud/internal/store/sqlite.go:782`
```sql
-- BUG-02 & BUG-05 FIX: Sichere Abfrage der Dateizugriffsberechtigungen
SELECT 
    f.id, 
    f.owner_id, 
    f.type, 
    f.visibility, 
    f.version, 
    f.access_keys,
    COALESCE(fs.secured_meta, f.secured_meta) AS secured_meta,
    CASE 
        WHEN f.owner_id = ? THEN 'owner'
        WHEN fs.permission IS NOT NULL AND fs.status = 'accepted' THEN fs.permission
        ELSE 'none'
    END AS permission
FROM files f
LEFT JOIN file_shares fs 
    ON f.id = fs.file_id 
    AND fs.user_id = ? 
    AND fs.status = 'accepted'
WHERE f.id = ?
  AND (
      f.owner_id = ? 
      OR (fs.user_id = ? AND fs.status = 'accepted')
  );
```

### Blueprint: Atomares Entfernen aus `access_keys` bei Widerruf
```go
// BUG-02 FIX: cloud/internal/store/sqlite.go
func (s *SQLiteStore) RevokeShareAndAccessKey(ctx context.Context, fileID, targetUserID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Share-Eintrag löschen
	_, err = tx.ExecContext(ctx, "DELETE FROM file_shares WHERE file_id = ? AND user_id = ?", fileID, targetUserID)
	if err != nil {
		return err
	}

	// 2. JSON-Key atomar entfernen
	query := `
		UPDATE files 
		SET access_keys = json_remove(access_keys, '$.' || ?) 
		WHERE id = ?
	`
	_, err = tx.ExecContext(ctx, query, targetUserID, fileID)
	if err != nil {
		return err
	}

	return tx.Commit()
}
```

---

## 9.4 Canvas Yjs-Migration (Y.Array / Y.Map)

### Ziel:
Das Standalone Canvas von monolithischem HTTP-PUT auf eine echte CRDT-Struktur migrieren. Jedes Canvas-Element wird als Eintrag in einer `Y.Map` geführt.

### Blueprint: `web/src/hooks/useCanvasCollaboration.ts`
```typescript
import { useEffect, useState, useMemo } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CanvasItem {
    id: string;
    type: 'rectangle' | 'text' | 'arrow' | 'image';
    x: number;
    y: number;
    width: number;
    height: number;
    data?: any;
}

export function useCanvasCollaboration(noteId: string, wsUrl: string) {
    const ydoc = useMemo(() => new Y.Doc(), [noteId]);
    const [items, setItems] = useState<CanvasItem[]>([]);
    const [provider, setProvider] = useState<WebsocketProvider | null>(null);

    useEffect(() => {
        // Eindeutige clientID sicherstellen
        ydoc.clientID = Math.floor(Math.random() * 0xFFFFFFFF);

        const wsProvider = new WebsocketProvider(wsUrl, noteId, ydoc);
        const yElements = ydoc.getMap<CanvasItem>('canvas-elements');

        yElements.observe(() => {
            // Konvertiere Y.Map in lokales React Array
            const currentItems: CanvasItem[] = [];
            yElements.forEach((val) => {
                currentItems.push(val);
            });
            setItems(currentItems);
        });

        setProvider(wsProvider);

        return () => {
            wsProvider.destroy();
            ydoc.destroy();
        };
    }, [noteId, wsUrl, ydoc]);

    const updateItem = (item: CanvasItem) => {
        const yElements = ydoc.getMap<CanvasItem>('canvas-elements');
        yElements.set(item.id, item); // Granulares CRDT Update!
    };

    const deleteItem = (itemId: string) => {
        const yElements = ydoc.getMap<CanvasItem>('canvas-elements');
        yElements.delete(itemId);
    };

    return { items, updateItem, deleteItem, provider };
}
```

---

## 9.5 Multimedia-Berechtigungsvererbung & DEK-Wrapping

### Ziel:
1. `canvas-asset` Chiffrate werden **mit dem DEK der übergeordneten Notiz** verschlüsselt (nicht mit einem isolierten RSA-Key).
2. Das Go-Backend erbt Zugriffsrechte automatisch von der übergeordneten Notiz.

### Blueprint: `cloud/internal/store/sqlite.go:CheckAssetAccess`
```sql
-- BUG-17 FIX: Prüft, ob der Nutzer Zugriff auf das Asset ODER dessen Parent-Note hat
SELECT 1 
FROM files asset
LEFT JOIN files parent ON parent.id = asset.parent_file_id
LEFT JOIN file_shares fs ON fs.file_id = parent.id AND fs.user_id = ? AND fs.status = 'accepted'
WHERE asset.id = ? 
  AND (
      asset.owner_id = ? 
      OR parent.owner_id = ? 
      OR (fs.user_id = ? AND fs.status = 'accepted')
  );
```

### Blueprint: DEK-basiertes Asset-Wrapping (`web/src/lib/assetCrypto.ts`)
```typescript
// BUG-18 & BUG-19 FIX: Sichere Ver- und Entschlüsselung von Medien über den Parent-DEK
export async function encryptMediaBlob(blob: Blob, parentDEK: CryptoKey): Promise<{ encryptedBlob: Blob; iv: Uint8Array }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const rawBytes = await blob.arrayBuffer();

    const encryptedBytes = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        parentDEK,
        rawBytes
    );

    return {
        encryptedBlob: new Blob([encryptedBytes]),
        iv: iv
    };
}

export async function decryptMediaBlob(encryptedBytes: ArrayBuffer, iv: Uint8Array, parentDEK: CryptoKey): Promise<Blob> {
    const decryptedBytes = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        parentDEK,
        encryptedBytes
    );

    return new Blob([decryptedBytes]);
}
```

---

## 9.6 TipTap Image Paste & Upload Handler

### Ziel:
In `useTipTapConfig.ts` das Einfügen aus der Zwischenablage abfangen, das Bild mit dem `parentDEK` verschlüsseln, an `/api/files/upload` senden und als TipTap Image Node einfügen.

### Blueprint: `web/src/hooks/useTipTapConfig.ts:handlePaste`
```typescript
// BUG-20 FIX: Vollständige Implementierung von Bild-Paste
handlePaste: (view, event, slice) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));

    if (!imageItem) {
        return false;
    }

    const file = imageItem.getAsFile();
    if (!file) {
        return false;
    }

    event.preventDefault();

    // Asynchroner Upload & Einbettung
    (async () => {
        try {
            const activeDEK = activeNoteStore.getState().activeDEK;
            const noteId = activeNoteStore.getState().currentNoteId;
            if (!activeDEK) throw new Error("Kein DEK vorhanden!");

            // 1. Bild mit Notiz-DEK verschlüsseln
            const { encryptedBlob, iv } = await encryptMediaBlob(file, activeDEK);

            // 2. Upload an Server als canvas-asset mit parent_file_id
            const formData = new FormData();
            formData.append('file', encryptedBlob);
            formData.append('parent_file_id', noteId);
            formData.append('iv', arrayBufferToBase64(iv));

            const res = await fetch(`/api/files/${noteId}/attachments`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error("Upload fehlgeschlagen");
            const data = await res.json();

            // 3. TipTap Image Node an Cursorposition einfügen
            const { schema } = view.state;
            const node = schema.nodes.image.create({
                src: `/api/files/assets/${data.assetId}`,
                alt: file.name,
                'data-iv': arrayBufferToBase64(iv)
            });

            const transaction = view.state.tr.replaceSelectionWith(node);
            view.dispatch(transaction);
        } catch (err) {
            console.error("Fehler beim Einfügen des Bildes:", err);
        }
    })();

    return true;
}
```

---

## 10. Fazit & Handlungsanweisung

Die Kollaborations- und Verschlüsselungsarchitektur von Tide verfügt über ein mathematisch solides Fundament (RSA-4096, AES-256-GCM, PBKDF2), leidet jedoch unter **fundamentalen Implementierungs- und Integrationsdefiziten**:
1. **CRDT vs. OCC Divergenz:** Der parallele Betrieb von ephemerem Yjs und destruktivem HTTP-Autosave erzeugt unvermeidbare Datenverluste. Yjs muss zur einzigen "Single Source of Truth" für Echtzeit-Edits werden; der Server muss Yjs-Updates append-only in SQLite persistieren.
2. **Autorisierungs-Bypass im WebSocket:** Der WebSocket-Hub muss sofort mit serverseitiger Nachrichteninspektion versehen werden, um Viewer-Manipulationen abzufangen.
3. **Rechte-Eskalation:** Das SQL-Rollen-Fallback in `sqlite.go` muss von `COALESCE(..., 'owner')` bereinigt werden.
4. **Canvas- & Multimedia-Sanierung:** Canvas-Notizen müssen in Yjs Y.Maps überführt werden, und Multimedia-Artefakte müssen kryptografisch an den Document Encryption Key der Eltern-Notiz gekoppelt werden.

Das nächste beauftragte KI-Entwicklerteam kann anhand der Blueprints in Kapitel 9 die Schwachstellen strukturiert und regressionsfrei beheben.
