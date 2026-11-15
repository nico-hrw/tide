# Tide — Development & Demo Guide

Dieses Dokument beschreibt die lokale Entwicklungsumgebung, Container-Testing und den Dev-Workflow für Tide.

---

## 1. Übersicht

Tide bietet eine isolierte Entwicklungsumgebung mit schnellem Setup via Docker Compose oder lokalem Go/Next.js-Start.
Die Dev-Umgebung ist über Umgebungsvariablen (`DEV_MODE=true` / `NEXT_PUBLIC_DEV_MODE=true`) abgesichert, sodass Test-Features und 1-Click-Logins die Produktivlogik nicht beeinträchtigen.

---

## 2. Quickstart mit Docker Desktop

Der schnellste Weg, den gesamten Stack (Web-Frontend + Cloud-Backend) reproduzierbar zu starten:

```bash
docker compose up --build
```

### Endpunkte & Services
- **Web Frontend:** [http://localhost:3001](http://localhost:3001)
- **Cloud Backend:** [http://localhost:8081](http://localhost:8081)
- **Health Check:** `http://localhost:8081/health`

### Datenpersistenz
- Die SQLite-Datenbank wird lokal unter `./cloud/data/` persistiert.
- Beim Beenden oder Neustarten der Container bleiben Testdaten erhalten.

---

## 3. Dev Quick Login (Ohne OTP & PIN)

Im Entwicklungsmodus (`DEV_MODE=true` / `NEXT_PUBLIC_DEV_MODE=true`) bietet die Login-Seite praktische 1-Click-Test-Logins:

- ⚡ **Einmal-Gast:** Schneller, temporärer Einweg-Account für isolierte Tests ohne Seiteneffekte.
- 👤 **Dev Alice:** Persistenter Standard-Testaccount (`alice@dev.local`).
- 👥 **Dev Bob:** Zweiter persistenter Testaccount (`bob@dev.local`), z. B. zum Testen von Multi-User-Szenarien oder Kollaboration.

**Vorteile im Dev-Modus:**
- Kein E-Mail-Versand nötig.
- Kein OTP (Einmalpasswort) erforderlich.
- Keine PIN-Abfrage erforderlich.
- Sofortiger Zugriff auf den vollständigen App-Status.

---

## 4. Lokale Alternative ohne Docker

Falls Backend und Frontend nativ auf dem Host-System entwickelt werden sollen:

### 1. Backend starten
```bash
cd cloud
PORT=8081 DEV_MODE=true go run ./cmd/server
```

*(Unter Windows PowerShell: `$env:PORT="8081"; $env:DEV_MODE="true"; go run ./cmd/server`)*

### 2. Web Frontend starten
```bash
cd web
PORT=3001 BACKEND_PORT=8081 npm run dev
```

*(Unter Windows PowerShell: `$env:PORT="3001"; $env:BACKEND_PORT="8081"; npm run dev`)*

Das Frontend bindet nun standardmäßig an Port 3001 und leitet Backend-Anfragen an Port 8081 weiter.

---

## 5. Git Worktree Workflow (`tide-dev/`)

Für paralleles Arbeiten und getrennte Branches wird ein Git-Worktree empfohlen:

- `tide-dev/` ist mit dem Branch `dev` verknüpft.
- Entwickle, committe und teste neue Features bevorzugt innerhalb des `tide-dev/`-Verzeichnisses.

### Änderungen in Produktion (`main`) mergen

Sobald ein Feature fertiggestellt und getestet ist:

```bash
git checkout main
git merge dev
git push
```

> **Sicherheit:** Da Dev-Logins, Mocks und abweichende Routings strikt über Umgebungsvariablen (`DEV_MODE`) gesteuert werden, ist das Mergen von `dev` in `main` zu 100 % sicher — im Produktionsbetrieb (`DEV_MODE=false` bzw. nicht gesetzt) sind sämtliche Dev-Shortcuts deaktiviert.
