# 03 — Dokumentations-Audit & Code-Alignment

> **Audit-Bereich:** Bestandsdokumentation, Code-to-Doc Drift, kryptografische Spezifikationen, Disaster Recovery  
> **Status:** ⚠️ Inkonsistent & lückenhaft bei Kernmodulen  
> **Untersuchte Quellen:** `README.md`, `AGENTS.md`, `web/docs/COMPONENTS.md`, `cloud/docs/`, `web/src/lib/keyStorage.ts`

---

## 1. Analyse der bestehenden Dokumentationslandschaft

Das Tide-Repository verfügt über eine überdurchschnittlich strukturierte Ausgangsdokumentation für Entwickler:

1. **[`AGENTS.md`](file:///C:/Users/nicoh/Documents/tide/AGENTS.md):** Hervorragende, strikte Direktiven für LLM- und menschliche Entwickler (Regeln zu Verhalten, Linting, 500-Zeilen-Grenze, Verbot von Secrets).
2. **[`web/docs/COMPONENTS.md`](file:///C:/Users/nicoh/Documents/tide/web/docs/COMPONENTS.md):** Umfassendes Register der Frontend-Komponenten inklusive bekannter Gotchas (z. B. Mobile Drag `flushSync`, TouchAction-Verhalten, iOS Scroll Freeze).
3. **`cloud/docs/`:** Dokumentation des Datenbankschemas und der REST-Routen.

Trotz dieser soliden Basis offenbart die detaillierte Code-Analyse erhebliche **Diskrepanzen ("Documentation Drift")** und **kritische blinde Flecken**.

---

## 2. Abgleich zwischen Dokumentation und Code-Realität

### 2.1 Das "Zero-Knowledge"-Versprechen vs. Extension-Realität
- **Dokumentationsbehauptung:** Sowohl die globale `README.md` als auch `cloud/docs/` proklamieren:
  > *"All user data is end-to-end encrypted on the client using AES-256-GCM. The server is completely zero-knowledge."*
- **Code-Realität:**
  Wie im Sicherheitsbericht ([`02-SECURITY-AND-PRIVACY.md`](file:///C:/Users/nicoh/Documents/tide/docs/audit/02-SECURITY-AND-PRIVACY.md)) nachgewiesen, persistieren die Finanz-Tabellen `ext_finance_accounts` und `ext_finance_transactions` Beträge, IBANs, Empfänger und Beschreibungen im Klartext.
- **Urteil:** Die Dokumentation führt Nutzer und Auditoren in die Irre. Erweiterungen wurden nachträglich ohne E2EE-Kapselung implementiert, ohne die Sicherheitsarchitektur-Dokumentation anzupassen.

---

### 2.2 Fehlende Dokumentation von `keyStorage.ts` (IndexedDB Non-Extractable Keys)
In [`web/src/lib/keyStorage.ts`](file:///C:/Users/nicoh/Documents/tide/web/src/lib/keyStorage.ts) befindet sich eine der sicherheitskritischsten Implementierungen des gesamten Projekts:
- Verwendung der Web Crypto API mit `extractable: false` CryptoKeys.
- Speicherung dieser Handles in einer dedizierten IndexedDB-Instanz, um Memory-Dumping und einfache Script-Exfiltration zu verhindern.
- **Befund:** In weder `web/docs/COMPONENTS.md` noch in einer Architekturübersicht wird dieses Subsystem auch nur erwähnt. Neue Entwickler oder Subagents laufen Gefahr, diese sensiblen Mechanismen versehentlich durch simplere LocalStorage-Wrapper zu ersetzen.

---

## 3. Fehlende Dokumentations-Artefakte

Im Repository fehlen essentielle Architektur- und Betriebsdokumente, die für ein professionelles E2EE-System zwingend erforderlich sind:

```
[Fehlende Spezifikationen]
 ├── Krypto-Migrationsplan (V1 -> V2 Roadmap)
 ├── Disaster Recovery & Vault Recovery Runbook
 └── Server-Härtungsleitfaden (At-Rest Encryption & Backups)
```

### 3.1 Krypto-Migrationsplan (V1 -> V2 Deprecation)
- **Problem:** `crypto.ts` (RSA/V1) und `cryptoV2.ts` (Envelope/V2) koexistieren ohne Zeitplan oder Migrationsstrategie.
- **Bedarf:** Es fehlt eine dokumentierte Spezifikation für:
  1. Wie Clients erkennen, ob ein Payload V1 oder V2 ist (Version-Header im Payload).
  2. Wann und wie Alt-Payloads im Hintergrund automatisch beim nächsten Lesezugriff re-verschlüsselt (Re-wrapped) und im V2-Format persistiert werden.
  3. Den Stichtag (Sunset Date), ab dem `crypto.ts` vollständig aus dem Bundle entfernt wird.

---

### 3.2 Notfall-Runbooks & Disaster Recovery
Da Tide clientseitig verschlüsselt, führt ein Verlust des Master-Passworts zum unwiederbringlichen Datenverlust. Hierzu fehlen jegliche Prozessbeschreibungen:
- **Vault-Reset-Prozedur:** Was passiert, wenn ein Benutzer sein Master-Passwort vergisst? Wie kann der Server die unbrauchbaren Ciphertexte löschen, ohne den Benutzer-Account zu korrumpieren?
- **Key-Rotation-Handbuch:** Wie rotiert ein Benutzer seinen KEK/DEK im Falle eines kompromittierten Geräts?
- **Backup & Restore Runbook:** Wie werden SQLite-Snapshots konsistent erstellt, während der Writer-Pool aktiv ist?

---

### 3.3 Server At-Rest Verschlüsselung
Die Dokumentation schweigt sich darüber aus, wie die SQLite-Datenbankdatei und der `LocalBlobStore` auf dem Server abgesichert werden müssen. Da Metadaten (Tags, Ordner, MIME-Types) und Finanzdaten im Klartext vorliegen, ist eine LUKS- oder SQLite-interne Verschlüsselung (z. B. SQLCipher) auf Host-Ebene zwingend erforderlich, wird jedoch nirgends erwähnt.

---

## 4. Handlungsempfehlungen zur Dokumentation

1. **Ehrlichkeit bei Zero-Knowledge:** Sofortige Aktualisierung der `README.md`, um klarzustellen, welche Daten aktuell clientseitig verschlüsselt sind (Notizen, Events) und welche Metadaten/Module serverseitig liegen.
2. **Krypto-Architektur-Whitepaper anlegen:** Erstellung von `docs/CRYPTO_SPEC.md` mit formaler Definition des Envelope-Formats, Key-Derivation-Parametern und IndexedDB-Storage-Lifecycle.
3. **Disaster-Recovery-Guide verfassen:** Erstellung von `docs/RUNBOOK_DISASTER_RECOVERY.md`.
