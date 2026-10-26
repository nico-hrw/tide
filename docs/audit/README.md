# Tide System & Security Audit 2026

> **Status:** Abgeschlossen  
> **Datum:** Oktober 2026  
> **Klassifizierung:** Vertraulich / Intern  
> **Umfang:** Full-Stack Architecture, End-to-End Cryptography, Zero-Knowledge Guarantees, Data Consistency, Documentation & Future Scalability

---

## Executive Summary

Das Projekt **Tide** positioniert sich als moderne, lokale und Cloud-synchronisierte Notiz-, Kalender- und Produktivitäts-Plattform mit striktem Zero-Knowledge- und Client-Side-Encryption-Anspruch. Die Plattform besteht im Kern aus:
- Einem **Next.js 16 (App Router) Frontend** mit TipTap Editor, mobilen Touch-Optimierungen und lokaler IndexedDB/Cache-Verwaltung.
- Einem schlanken, performanten **Go Chi v5 Backend** mit SQLite-Datenbank (`modernc.org/sqlite`), SSE/WebSocket-Echtzeitschnittstellen und lokalem/S3-kompatiblem Blob-Speicher.
- Einer **hybriden kryptografischen Architektur**, die sich aktuell in einer unvollständigen Transition von einer RSA-4096-basierten V1-Verschlüsselung zu einer modernen AES-256-GCM / PBKDF2 Envelope-Verschlüsselung (V2 DEK) befindet.

### Kernbefund
Obwohl die architektonischen Leitplanken von Tide außergewöhnlich ambitiös und in weiten Teilen des Kerns (z. B. Notizkörper- und Event-Payload-Verschlüsselung) vorbildlich implementiert sind, deckt dieses Audit **substanzielle architektonische Schulden** sowie **zwei kritische Sicherheitslücken (P0)** auf, die den beworbenen Zero-Knowledge-Status unterlaufen:

1. **Finanzmodul-Klartext-Exposition (P0):** Erweiterungen wie `ext_finance_*` umgehen die Verschlüsselungspipeline vollständig und persistieren sensible Finanzdaten (Kontonamen, Salden, IBANs, Transaktionsbeschreibungen) unverschlüsselt in der SQLite-Datenbank des Servers.
2. **Lokales Notiz-Leaking via Unencrypted Keystroke Backups (P0):** Der TipTap-Editor speichert bei jedem Tastenanschlag vollständige, unverschlüsselte HTML/JSON-Notizinhalte im Browser-`localStorage` (`tide_backup_*`), wodurch der Schutz von IndexedDB Non-Extractable Keys und Client-Side Cryptography bei XSS oder Shared-Device-Szenarien ausgehebelt wird.
3. **Frontend-Monolith & Split-Brain State:** `web/src/app/page.tsx` ist auf über 3.160 Zeilen angewachsen, verwaltet über 40 unkoordinierte `useState`-Hooks parallel zu Zustand-Stores und leidet unter massivem Prop-Drilling (z. B. `Sidebar` mit 37 Props).
4. **Speicher- und Disk-Leak im Backend:** In `PurgeOldTrashedFiles` werden DB-Metadaten gelöscht, ohne die zugehörigen physischen Blobs im `LocalBlobStore` zu entfernen, was zu unbereinigbarem Plattenwachstum führt.

---

## Health Scorecard

| Dimension | Score | Status | Primäre Risiken / Befunde |
| :--- | :---: | :---: | :--- |
| **Architektur & Struktur** | **5.5 / 10** | ⚠️ Bedenklich | `page.tsx` Monolith (>3.100 Zeilen), Split-Brain State (Zustand vs. 40+ useState), 37-Prop Drilling, SQLite Single-Writer Flaschenhals, fehlendes `foreign_keys(ON)`. |
| **Sicherheit & Zero-Knowledge** | **4.0 / 10** | 🛑 Kritisch | P0 Klartext-Finanzdaten in Server-DB, P0 Unverschlüsseltes LocalStorage-Backup, permissive CSP (`unsafe-inline`, `unsafe-eval`), JWT in LocalStorage, unvollständige V1/V2 Krypto-Transition. |
| **Code-Qualität & Hygiene** | **6.0 / 10** | ⚠️ Mäßig | 557 pre-existing ESLint-Fehler (`any`, unused-vars), 0 Unit-/E2E-Tests im Frontend, Dateigrößen-Verstöße (>500 Zeilen Richtlinie), Disk-Leak bei Blob-Purge. |
| **Dokumentation & Alignment** | **6.5 / 10** | ⚠️ Lückenhaft | Gute Komponenten- und AGENTS-Register, aber gravierende Divergenzen zwischen Doku (Zero-Knowledge) und Code-Realität (Finanzdaten im Klartext), kein Krypto-Migrationsplan. |
| **Skalierbarkeit & Vision** | **5.0 / 10** | ⚠️ Begrenzt | In-Memory SSE/WS Hub verhindert horizontales Scaling, LWW führt zu Datenverlust bei Offline-Merge, fehlende S3 Continuous WAL Replication (Litestream). |

---

## Übersicht über die Audit-Berichte

Der vollständige Audit-Bericht ist modular in fünf themenspezifische Detailanalysen unterteilt:

```
docs/audit/
├── README.md                           # Executive Summary & Health Scorecard (dieses Dokument)
├── 01-ARCHITECTURE-AND-STRUCTURE.md   # Frontend-Monolith, State Management, Go Backend & Storage
├── 02-SECURITY-AND-PRIVACY.md          # Krypto-Analyse, P0-Lücken, Zero-Knowledge Audit & Auth
├── 03-DOCUMENTATION-AUDIT.md           # Doku vs. Code Drift, fehlende Runbooks & Migrationspläne
├── 04-FUTURE-VISION-AND-SCALABILITY.md # SQLite Concurrency, Litestream, CRDTs & Next.js Refactoring
└── 05-ACTION-PLAN.md                   # Priorisierte 4-Phasen-Roadmap (P0 bis P3) mit Aufwänden
```

### 1. [01-ARCHITECTURE-AND-STRUCTURE.md](file:///C:/Users/nicoh/Documents/tide/docs/audit/01-ARCHITECTURE-AND-STRUCTURE.md)
Detaillierte Dekonstruktion der Codebasis:
- **Frontend:** Analyse von `web/src/app/page.tsx` (3.160 Zeilen), Untersuchung der 40+ parallelen `useState`-Hooks vs. Zustand-Slices (`useDataStore`), Untersuchung des extremen Prop Drillings (`Sidebar` 37 Props, `ModalsHost` 30+ Props) und Design-Token-Divergenzen vs. Tailwind Arbitrary Classes.
- **Backend:** Go Chi v5 Middleware-Stack, Dual-Connection Pool in `sqlite.go` (1 Writer vs Readers), Fehlen von `_pragma=foreign_keys(ON)`.
- **Storage & Disk Leak:** Analyse von `LocalBlobStore`, atomares `os.Rename`, und der fatale Disk-Leak in `PurgeOldTrashedFiles` (Orphaned Blobs).
- **Code-Metriken:** Verletzung der 500-Zeilen-Regel in 8 Schlüsseldateien, 557 ESLint-Warnungen, Testabdeckung bei 0%.

### 2. [02-SECURITY-AND-PRIVACY.md](file:///C:/Users/nicoh/Documents/tide/docs/audit/02-SECURITY-AND-PRIVACY.md)
Tiefenanalyse der Angriffsflächen und Krypto-Implementierung:
- **Krypto-Architektur:** Dual-Crypto-Zustand zwischen `crypto.ts` (V1 RSA/AES) und `cryptoV2.ts` (V2 Envelope DEK mit AES-256-GCM und PBKDF2), Key Derivation und Non-Extractable Key Storage in IndexedDB.
- **Zero-Knowledge Realitätscheck:** Was der Server tatsächlich sieht (Folder-Hierarchie, Tag-IDs, Notizgrößen, Metadaten).
- **P0 Sicherheitslücke 1:** Unverschlüsselte Persistierung von Bankkonten und Transaktionen im Finanzmodul (`ext_finance_*`).
- **P0 Sicherheitslücke 2:** TipTap Keystroke-Backup im unverschlüsselten `localStorage` (`tide_backup_*`).
- **Auth, Session & CSP:** JWT im LocalStorage vs. HttpOnly Cookie, Argon2id PIN Hashing, permissive Content-Security-Policy mit `unsafe-inline` und `unsafe-eval`.

### 3. [03-DOCUMENTATION-AUDIT.md](file:///C:/Users/nicoh/Documents/tide/docs/audit/03-DOCUMENTATION-AUDIT.md)
Gegenüberstellung von Anspruch und Wirklichkeit:
- **Code vs. Doku Drift:** Die Dokumentation verspricht striktes Zero-Knowledge, verschweigt jedoch die Klartext-Tabellen der Erweiterungen.
- **Fehlende Spezifikationen:** Keine Dokumentation für `keyStorage.ts`, fehlender Migrationsleitfaden für V1-zu-V2-Payloads.
- **Disaster Recovery:** Fehlende Runbooks für Vault-Passwort-Verlust, Key-Rotationsprozeduren und Server-At-Rest-Verschlüsselung.

### 4. [04-FUTURE-VISION-AND-SCALABILITY.md](file:///C:/Users/nicoh/Documents/tide/docs/audit/04-FUTURE-VISION-AND-SCALABILITY.md)
Strategische Roadmap zur Zukunftsfähigkeit:
- **Datenbank & Concurrency:** Überwindung des SQLite Single-Writer Flaschenhalses; Distributed State via Redis / NATS für WebSockets & SSE.
- **Sync & Kollaboration:** Evolution von LWW über OCC (Optimistic Concurrency Control) zu CRDTs (Yjs / Automerge) für kollaboratives Notiz-Editing.
- **Storage-Replikation:** Live S3 WAL-Replikation via Litestream, Evaluierung von Turso / libSQL für Edge-Read-Replikation.
- **Frontend-Modernisierung:** Einführung von TanStack Query (React Query) mit Offline IndexedDB Persistenz und Aufteilung von `page.tsx` in Next.js Sub-Routes.

### 5. [05-ACTION-PLAN.md](file:///C:/Users/nicoh/Documents/tide/docs/audit/05-ACTION-PLAN.md)
Strukturierter Maßnahmenkatalog:
- **Phase 0: Sofortmaßnahmen (Notfall-Fixes, 1-2 Wochen):** Beseitigung der beiden P0-Lücken, Behebung des Disk-Leaks in `sqlite.go`, Aktivierung von `foreign_keys(ON)`.
- **Phase 1: Stabilisierung & Hygiene (Wochen 3-5):** Bereinigung der 557 ESLint-Warnungen, CSP-Härtung, HttpOnly Cookie Migration.
- **Phase 2: Refactoring & Entflechtung (Wochen 6-10):** Dekonstruktion von `page.tsx`, Vereinheitlichung des Zustand Stores, Abschluss der Krypto V2 Migration.
- **Phase 3: Skalierung & Kollaboration (Wochen 11-16):** Litestream-Integration, Yjs CRDT-PoC für TipTap, Sub-Routing.

---

> [!IMPORTANT]
> Die in Abschnitt 02 identifizierten P0-Sicherheitslücken sollten vor jedem weiteren Feature-Rollout oder öffentlichem Release behoben werden. Insbesondere die unverschlüsselte Speicherung von Notizen im LocalStorage und Finanzdaten in der SQLite-Datenbank widersprechen den Kernversprechen der Plattform.
