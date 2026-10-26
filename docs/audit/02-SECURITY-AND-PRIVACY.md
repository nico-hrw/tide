# 02 — Sicherheit & Zero-Knowledge Audit

> **Audit-Bereich:** End-to-End Verschlüsselung, Zero-Knowledge Garantien, Authentifizierung, Angriffsflächen  
> **Status:** 🛑 KRITISCH (Zwei P0-Sicherheitslücken mit Daten-Exposition)  
> **Betroffene Komponenten:** `web/src/lib/crypto.ts`, `web/src/lib/cryptoV2.ts`, `web/src/hooks/useTipTapConfig.ts`, `cloud/internal/store/sqlite.go`, `web/src/lib/api.ts`

---

## 1. Kryptografische Architektur: Der Dual-Crypto Schwebezustand

Tide betreibt derzeit zwei völlig unterschiedliche kryptografische Subsysteme parallel:

```mermaid
graph LR
    subgraph Legacy V1 [crypto.ts - V1 Legacy]
        RSA[RSA-OAEP 4096-bit]
        AES_CBC[AES-CBC 256-bit]
        PBKDF2_V1[PBKDF2 100k Iterations]
    end

    subgraph Modern V2 [cryptoV2.ts - V2 Envelope]
        AES_GCM[AES-256-GCM]
        DEK[Data Encryption Key per Item]
        PBKDF2_V2[PBKDF2 600k Iterations SHA-256]
        KEK[Key Encryption Key - Master]
    end

    Notes[Notizen & Events] -.->|Migration unvollständig| Legacy V1
    Notes -->|Neu erstellte Items| Modern V2
```

### 1.1 V1 Legacy (`crypto.ts`)
- **Verfahren:** Asymmetrische RSA-OAEP (4096-bit) Schlüsselpaare in Kombination mit AES-CBC.
- **Schwachstellen:**
  - Hohe Rechenlast bei RSA-Operationen auf Mobilgeräten.
  - AES-CBC bietet keine native Integritätsprüfung (kein Authenticated Encryption wie AEAD), wodurch Bit-Flipping-Attacken theoretisch möglich sind, falls die Signatur-Validierung lückenhaft ist.
  - Veraltete PBKDF2-Iterationszahl (100.000 Runden).

### 1.2 V2 Envelope Cryptography (`cryptoV2.ts`)
- **Verfahren:** Modernes Envelope-Verfahren (DEK/KEK-Hierarchie) nach NIST- und BSI-Empfehlungen:
  - **DEK (Data Encryption Key):** Zufälliger 256-bit AES-GCM Schlüssel pro Datensatz (Notiz, Event).
  - **KEK (Key Encryption Key):** Aus dem Master-Passwort des Benutzers abgeleitet via PBKDF2 (600.000 Iterationen, SHA-256) und Zufalls-Salt.
  - **Double-Wrapping:** Der DEK wird mit dem KEK verschlüsselt auf dem Server abgelegt. Bei geteilten Notizen wird der DEK zusätzlich mit dem Public Key des Empfängers gewrappt.
- **Sicherheitsniveau:** Kryptografisch exzellent und zukunftssicher.

> [!WARNING]
> **Das Migrations-Vakuum:**  
> Laut `AGENTS.md` ("Dual crypto libs: crypto.ts and cryptoV2.ts are both in active use. Do not remove either.") existiert kein automatisierter Migrationspfad. Altdaten verbleiben dauerhaft in V1, wodurch die Codebasis zweigleisig gepflegt werden muss und Alt-Payloads anfälliger für kryptografische Alterung sind.

---

## 2. Zero-Knowledge Audit: Was der Server sieht

Tide wirbt mit Zero-Knowledge. Ein vollständiger Audit des Datenbankschemas in [`cloud/internal/store/sqlite.go`](file:///C:/Users/nicoh/Documents/tide/cloud/internal/store/sqlite.go) offenbart, welche Metadaten der Serverbetreiber im Klartext einsehen kann:

| Datenelement | Verschlüsselt? | Sichtbarkeit auf dem Server | Privatsphäre-Auswirkung |
| :--- | :---: | :---: | :--- |
| **Notiztitel & Inhalt** | ✅ Ja (AES-GCM) | Nur Base64 Ciphertext & Auth-Tag | ✅ Vollständiger Zero-Knowledge Schutz. |
| **Kalender-Events** | ✅ Ja (AES-GCM) | Nur verschlüsselter Payload | ✅ Vollständiger Zero-Knowledge Schutz. |
| **Ordner-Hierarchie** | ❌ **Nein** | Klartext UUIDs & Parent-Child Relationen | ⚠️ Server kennt die Struktur und Organisation des Nutzers. |
| **Tag-Namen** | ❌ **Nein** | Klartext Strings (`tag_name`) | ⚠️ Schlagwörter (z. B. "Medizin", "Kündigung", "Finanzen") sind für den Serverbetreiber lesbar. |
| **Dateianhänge (Blobs)** | ✅ Ja (Inhalt) | Name & MIME-Type im Klartext | ⚠️ Dateigrößen und Typen (z. B. `.pdf`, `.png`) sind sichtbar (Traffic- & File-Size-Fingerprinting). |
| **Aktivitäts-Timestamps** | ❌ **Nein** | `created_at`, `updated_at`, Synchronisationszeitpunkte | ⚠️ Exaktes Nutzer-Verhaltensprofil rekonstruierbar. |

---

## 3. KRITISCHE SICHERHEITSLÜCKEN (P0)

---

### 🚨 Lücke 1: Finanzmodul speichert Bankdaten im Klartext in SQLite

In [`cloud/internal/store/sqlite.go`](file:///C:/Users/nicoh/Documents/tide/cloud/internal/store/sqlite.go) existieren Tabellen für das Erweiterungsmodul Finanzen (`ext_finance_*`). 

#### Befund im Code
Im Gegensatz zu Notizen und Events, bei denen Nutzdaten als `encrypted_data` (BLOB) gespeichert werden, speichert das Finanzmodul sensible Bank- und Vermögensdaten als **reine SQL-Klartext-Felder**:

```sql
-- Auszug cloud/internal/store/sqlite.go
CREATE TABLE IF NOT EXISTS ext_finance_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,           -- KLARTEXT: z.B. "Girokonto Deutsche Bank"
    type TEXT NOT NULL,           -- KLARTEXT: z.B. "checking", "crypto"
    balance REAL NOT NULL,        -- KLARTEXT: z.B. 14250.50 (Exakter Kontostand!)
    currency TEXT NOT NULL,       -- KLARTEXT: "EUR"
    iban TEXT,                    -- KLARTEXT: Reale Bankverbindung des Nutzers!
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ext_finance_transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    amount REAL NOT NULL,         -- KLARTEXT: Betrag
    payee TEXT NOT NULL,          -- KLARTEXT: z.B. "Psychotherapeut", "Vermieter"
    category TEXT NOT NULL,       -- KLARTEXT: z.B. "Gesundheit", "Gehalt"
    description TEXT,             -- KLARTEXT: Vollständiger Verwendungszweck!
    date INTEGER NOT NULL
);
```

> [!CAUTION]
> **P0 SICHERHEITSVORFALL:**  
> Dies ist eine **eklatante Verletzung des Zero-Knowledge-Prinzips**.  
> Jeder Serverbetreiber, jeder Cloud-Host und jeder Angreifer mit SQL-Injection- oder Datenbank-Lesezugriff kann:
> 1. Die exakten Vermögensverhältnisse jedes Nutzers einsehen.
> 2. Reale IBAN-Nummern und Bankverbindungen abgreifen.
> 3. Vollständige Ausgabenprofile (inkl. sensibler medizinischer, politischer oder privater Zahlungen) im Klartext analysieren.

---

### 🚨 Lücke 2: Unverschlüsseltes Notiz-Leaking via LocalStorage Keystroke Backup

In [`web/src/hooks/useTipTapConfig.ts`](file:///C:/Users/nicoh/Documents/tide/web/src/hooks/useTipTapConfig.ts) (sowie im Autosave-Zyklus des TipTap Editors) wurde eine Notfall-Backup-Funktion implementiert, die Datenverlust bei Browser-Crashes verhindern soll:

#### Befund im Code
```typescript
// web/src/hooks/useTipTapConfig.ts (bzw. Autosave-Logik)
editor.on('update', ({ editor }) => {
    const rawHtml = editor.getHTML();
    const rawJson = JSON.stringify(editor.getJSON());
    
    // KRITISCH: Schreibt unverschlüsselte Rohinhalte per Tastendruck in LocalStorage!
    localStorage.setItem(`tide_backup_${noteId}`, rawJson);
});
```

> [!CAUTION]
> **P0 DATEN-LEAK IM BROWSER:**  
> Während Tide immensen Aufwand betreibt, um kryptografische Schlüssel non-extractable in der `IndexedDB` abzuschotten, werden die entschlüsselten Notizkörper **bei jedem Tastenanschlag im Klartext in den `localStorage` geschrieben**:
> 1. **Dauerhafte Persistenz:** Diese Einträge verbleiben oft monatelang im `localStorage`, selbst nachdem der Benutzer sich abgemeldet oder den Vault gesperrt hat!
> 2. **XSS-Angriffsvektor:** Jedes Third-Party-Skript oder eine erfolgreiche XSS-Attacke kann mit einem simplen `localStorage.getItem(...)` sämtliche privaten Notizen des Benutzers im Klartext exfiltrieren.
> 3. **Shared Devices:** Nutzt jemand ein öffentliches Terminal oder teilt sich ein Notebook, sind alle Notizen über die Browser Developer Tools sofort einsehbar.

---

## 4. Authentifizierung, Session-Management & PIN Hashing

### 4.1 JWT Speicherung im LocalStorage vs. HttpOnly Cookie
- **Ist-Zustand:** Das Authentifizierungs-Token (`tide_token`) wird in [`web/src/lib/api.ts`](file:///C:/Users/nicoh/Documents/tide/web/src/lib/api.ts) aus dem `localStorage` ausgelesen und als `Bearer`-Token im HTTP-Header mitgesendet.
- **Risiko:** `localStorage` ist ausnahmslos anfällig für Exfiltration durch XSS. 
- **Empfehlung:** Migration auf `HttpOnly`, `Secure`, `SameSite=Strict` Cookies mit CSRF-Double-Submit-Tokens.

### 4.2 PIN-Hashing mit Argon2id
- **Positivbefund:** Der lokale App-Lock / Vault-PIN nutzt modernes Argon2id für die Schlüsselableitung:
  - Memory: 64 MB
  - Iterations: 3
  - Parallelism: 1
- Dies bietet robusten Schutz gegen lokale Offline-Brute-Force-Angriffe auf schwache 4- bis 6-stellige PINs.

### 4.3 Fehlendes Backend Rate Limiting
- Das Go-Backend verfügt in `cloud/cmd/server/main.go` über **keine standardmäßige IP- oder Account-basierte Rate-Limiting-Middleware** auf Authentifizierungs- und Vault-Endpunkten (`/api/v1/auth/login`, `/api/v1/auth/unlock`).
- Angreifer können verteilte Brute-Force- und Credential-Stuffing-Attacken ohne zeitliche Verzögerung durchführen.

---

## 5. Content Security Policy (CSP) & XSS-Vektoren

### 5.1 Permissive CSP Konfiguration
In [`web/src/app/layout.tsx`](file:///C:/Users/nicoh/Documents/tide/web/src/app/layout.tsx) bzw. den Next.js Header-Konfigurationen ist die Content Security Policy unzureichend restriktiv:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src *;
```

- `'unsafe-inline'` und `'unsafe-eval'` machen moderne CSP-Schutzmechanismen gegen Stored-XSS nahezu wirkungslos.
- `connect-src *` erlaubt einem Angreifer, via XSS exfiltrierte Daten an beliebige externe C2-Server zu streamen.

### 5.2 TipTap Paste & KaTeX Sanitization
- Notizen unterstützen mathematische Formeln via KaTeX und komplexe Tabellen.
- **Paste-Event:** Beim Einfügen von formatiertem HTML aus der Zwischenablage (`onPaste`) fehlt ein strikter DOMPurify-Sanitization-Pass. Böswillige Payloads (z. B. `<img src=x onerror=...>` oder formatierte SVG-XML-Inhalte) können unter bestimmten Umständen am TipTap-Parser vorbeigeschleust werden.

---

## 6. Zusammenfassendes Sicherheitsurteil

Tide besitzt das Fundament für ein extrem sicheres System, ist jedoch durch **sekundäre Erweiterungen und unbedachte Convenience-Funktionen kompromittiert**:

```
[Verschlüsselungs-Kern: Notizen/Events] ──> EXZELLENT (AES-256-GCM Envelope)
                                             │
                                             ├─ [Finanz-Modul] ──> KLARTEXT-PANNE (P0)
                                             │
                                             └─ [LocalStorage Backup] ──> BROWSER-LEAK (P0)
```

Beide P0-Lücken müssen sofort geschlossen werden, bevor Tide weiterhin als "Zero-Knowledge" tituliert werden kann.
