# Tide Externe API & Token-Verwaltung

Diese Dokumentation beschreibt die Nutzung des **Tide API-Moduls** zur Abfrage und Verwaltung von Terminen, Notizen, Aufgaben, Ordnern, Tags, Workspaces, Einstellungen und Umfragen durch externe Dienste, Skripte und Drittanbieter-Anwendungen (z. B. Home Assistant, MCP-Clients, Backup-Tools oder eigene Skripte).

---

## Inhaltsverzeichnis
1. [Übersicht & Konzept](#1-übersicht--konzept)
2. [Token-Erstellung in der Benutzeroberfläche](#2-token-erstellung-in-der-benutzeroberfläche)
3. [Rechte & Scopes](#3-rechte--scopes)
4. [Authentifizierung bei API-Anfragen](#4-authentifizierung-bei-api-anfragen)
5. [Endpunkte-Referenz](#5-endpunkte-referenz)
   - [Token-Info (`GET /api/v1/external/me`)](#get-apiv1externalme)
   - [Termine (`/api/v1/external/events`)](#termine-apiv1externalevents)
   - [Notizen (`/api/v1/external/notes`)](#notizen-apiv1externalnotes)
   - [Aufgaben / Todos (`/api/v1/external/todos`)](#aufgaben--todos-apiv1externaltodos)
   - [Ordner (`/api/v1/external/folders`)](#ordner-apiv1externalfolders)
   - [Tags (`/api/v1/external/tags`)](#tags-apiv1externaltags)
   - [Workspaces (`/api/v1/external/workspaces`)](#workspaces-apiv1externalworkspaces)
   - [Einstellungen (`/api/v1/external/settings`)](#einstellungen-apiv1externalsettings)
   - [Umfragen (`/api/v1/external/surveys`)](#umfragen-apiv1externalsurveys)
   - [Web-UI-Sync-Endpunkte](#web-ui-sync-endpunkte)
6. [Code-Beispiele](#6-code-beispiele)
7. [Fehlerbehandlung & Status-Codes](#7-fehlerbehandlung--status-codes)
8. [Sicherheitsarchitektur](#8-sicherheitsarchitektur)

---

## 1. Übersicht & Konzept

Das API-Modul ermöglicht es externen Anwendungen, über **Personal Access Tokens (PAT)** sicher auf Benutzerdaten zuzugreifen, ohne Passwörter oder Anmelde-Codes weitergeben zu müssen.

- **Token-Präfix**: Jeder Token beginnt mit `tide_pat_` gefolgt von einem kryptografisch sicheren Zufallswert.
- **Sicherheitsmodell**: Plaintext-Tokens werden niemals auf dem Server gespeichert; die Datenbank speichert ausschließlich einen unidirektionalen **SHA-256-Hash**.
- **Granulares Scope-System**: Bei der Erstellung wird exakt festgelegt, auf welche Module, Aktionen, Workspaces (`safe:<name>`) oder Ordner (`folder:<uuid>`) ein Token zugreifen darf.
- **Echtzeit-Synchronisation**: Schreibende API-Aufrufe (z. B. für Notizen, Todos, Ordner, Tags, Workspaces und Einstellungen) synchronisieren sich direkt über den Server-Broker (SSE) mit der Web-UI.

---

## 2. Token-Erstellung in der Benutzeroberfläche

1. Öffne Tide und klicke auf das **Einstellungen**-Symbol (Zahnrad).
2. Wechsle in den Tab **Zugriff** (bzw. **Access**).
3. Klicke auf **Neuen Token erstellen**.
4. Gib einen aussagekräftigen Namen ein (z. B. `Home Assistant Wohnzimmer`, `Notizen-Sync`).
5. Wähle die gewünschten **Berechtigungen (Scopes)** aus (einzeln, als `*` oder eingeschränkt via `safe:<name>` / `folder:<uuid>`).
6. Lege die **Gültigkeitsdauer** fest (`30 Tage`, `60 Tage`, `90 Tage`, `1 Jahr` oder `Kein Ablauf (Nie)`).
7. Klicke auf **Token erstellen** und kopiere den angezeigten Token sofort – er wird danach nie wieder im Klartext angezeigt.

---

## 3. Rechte & Scopes

### Verfügbare Scopes

| Scope | Modul / Zweck | Beschreibung |
|-------|---------------|--------------|
| `events:read`, `events:write` | Kalender | Termine abfragen (`read`) bzw. erstellen, bearbeiten & löschen (`write`). |
| `notes:read`, `notes:write` | Notizen | Notizen abfragen (`read`) bzw. erstellen, bearbeiten & löschen (`write`). |
| `todos:read`, `todos:write`, `todos:create`, `todos:edit`, `todos:delete` | Aufgaben | Todos abfragen (`read`), erstellen (`create`), bearbeiten (`edit`), löschen (`delete`) oder voll verwalten (`write`). |
| `folders:read`, `folders:write` | Ordner | Ordner abfragen (`read`) bzw. erstellen, bearbeiten & löschen (`write`). |
| `tags:read`, `tags:write` | Tags | Tags abfragen (`read`) bzw. erstellen, bearbeiten & löschen (`write`). |
| `workspaces:read`, `workspaces:write` | Workspaces | Workspaces abfragen (`read`) bzw. erstellen, umbenennen, aktivieren & löschen (`write`). |
| `settings:read`, `settings:write` | Einstellungen | Benutzereinstellungen abfragen (`read`) bzw. ändern (`write`). Sensible Kontodaten bleiben blockiert. |
| `surveys:read`, `surveys:write`, `surveys:create`, `surveys:delete` | Umfragen | Umfrage-Antworten abfragen (`read`), erstellen (`create`), löschen (`delete`) oder voll verwalten (`write`). |
| `storage:expand` | Speicher | Upload-Speicher-Erweiterung (>250 MB). |
| `*` | Vollzugriff | Vollzugriff auf alle API-Endpunkte (ausgenommen blockierte Kontodaten wie PIN, E-Mail, Vault, Keys & Tokens). |
| `safe:<name>` | Workspace-Filter | Beschränkt den Zugriff auf den angegebenen Workspace/Safe (z. B. `safe:main` oder `safe:Arbeit`). |
| `folder:<uuid>` | Ordner-Filter | Beschränkt den Zugriff auf den angegebenen Ordner und dessen Unterelemente. |

### Scope-Regeln & Vererbung
- **Implizite Leserechte**: Jeder `<resource>:write`-Scope impliziert automatisch `<resource>:read` (niemals umgekehrt).
- **Sub-Scopes**: `todos:write` impliziert `todos:create`, `todos:edit` und `todos:delete`. `surveys:write` impliziert `surveys:create` und `surveys:delete`.
- **Filter-Scopes (`safe:<name>`, `folder:<uuid>`)**: Diese Scopes grenzen den sichtbaren Bestand ein und erfüllen bei Leseprüfungen auf `notes:read`, `folders:read` und `workspaces:read` auch die Lese-Anforderung, gewähren aber **niemals** Schreibrechte (`*:write` muss bei Bedarf zusätzlich vergeben werden).
- Fehlende Berechtigungen beantwortet der Server mit `403 Forbidden`.

---

## 4. Authentifizierung bei API-Anfragen

Jede Anfrage an `/api/v1/external/*` muss den PAT über eine der folgenden Methoden übermitteln:

1. **`Authorization`-Header (Empfohlen):** `Authorization: Bearer tide_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
2. **`X-API-Key`-Header:** `X-API-Key: tide_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
3. **Query-Parameter:** `?api_token=tide_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

## 5. Endpunkte-Referenz

Basis-URL: `https://<deine-tide-domain>/api/v1/external` (lokal z. B. `http://localhost:8080/api/v1/external`)

---

### `GET /api/v1/external/me`

Gibt Metadaten zum authentifizierten Token und zugehörigen Benutzer zurück (`user_id`, `username`, `token_id`, `scopes`, `name`, `token_prefix`, `expires_at`, `created_at`).
- **Berechtigung**: Jeder gültige PAT (kein spezifischer Ressource-Scope erforderlich).

---

### Termine (`/api/v1/external/events`)

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/events` | `events:read` | Termine auflisten. Filter: `start`/`from`, `end`/`to` (ISO 8601), `q`/`search`, `group_id`/`tag_id`, `parent_id`, `limit` (Default `100`, Max `500`). |
| `GET` | `/events/{id}` | `events:read` | Einzelnen Termin abrufen. |
| `POST` | `/events` | `events:write` | Neuen Termin erstellen (`title`, `start`, `end`, `all_day`, `color`, `description`, `location`, `parent_id`, `group_ids`, `tag_ids`, `recurrence_rule`, `recurrence_end`, `exdates`, `completed_dates`, `is_task`, `is_completed`, `is_cancelled`, `is_important`, `effect`). |
| `PUT` / `PATCH` | `/events/{id}` | `events:write` | Bestehenden Termin partiell oder vollständig aktualisieren. |
| `DELETE` | `/events/{id}` | `events:write` | Termin löschen. |

#### Beispiel-Anfrage & -Antwort (`GET /api/v1/external/events`)
```bash
curl -H "Authorization: Bearer tide_pat_your_token_here" \
  "https://hrw.rocks/api/v1/external/events?start=2026-10-13&end=2026-10-20&limit=10"
```

```json
{
  "count": 1,
  "events": [
    {
      "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
      "title": "Team Standup",
      "start": "2026-10-13T09:00:00.000Z",
      "end": "2026-10-13T09:30:00.000Z",
      "all_day": false,
      "color": "#3b82f6",
      "description": "Täglicher Statusabgleich via Video-Call",
      "location": "Online / Zoom",
      "parent_id": null,
      "source": "tide",
      "created_at": "2026-10-10T14:22:01Z",
      "updated_at": "2026-10-12T08:15:30Z"
    }
  ]
}
```

---

### Notizen (`/api/v1/external/notes`)

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/notes` | `notes:read` | Notizen auflisten. Filter: `q`/`search`, `parent_id` (auch `root`/`null`), `safe`/`workspace`, `tag_id`, `limit` (Default `100`, Max `500`). |
| `GET` | `/notes/{id}` | `notes:read` | Einzelne Notiz inkl. Inhalt abrufen (`encrypted: true` liefert aus E2E-Gründen keinen Klartext-`content`). |
| `POST` | `/notes` | `notes:write` | Neue unverschlüsselte Notiz erstellen (`title`, `content`, `parent_id`, `safe`/`workspace`, `linked_safes`, `tag_ids`, `icon`, `color`). |
| `PUT` / `PATCH` | `/notes/{id}` | `notes:write` | Notiz aktualisieren (`title`, `content`, `append_content`, `parent_id`, `safe`/`workspace`, `linked_safes`, `tag_ids`, `icon`, `color`). |
| `DELETE` | `/notes/{id}` | `notes:write` | Notiz in den Papierkorb verschieben (mit `?permanent=true` endgültig inkl. unreferenzierter Blobs löschen). |

**Wichtige Besonderheiten bei Notizen:**
- **`append_content`**: Bei `PUT`/`PATCH /notes/{id}` hängt `append_content` den übergebenen Text (mit automatischem `\n`-Trenner, falls nötig) an den bestehenden unverschlüsselten Inhalt an, ohne dass der Client den alten Inhalt vorher abrufen muss.
- **`Version: 2` & Versionierung**: Neu erstellte externe Notizen erhalten `version: 2`. Bei Updates wird `version` auf mindestens `2` gesetzt bzw. hochgezählt.
- **Automatischer CRDT-Reset**: Sobald `content` oder `append_content` geändert wird, setzt der Server automatisch den Yjs-/CRDT-Zustand (`ResetFileCRDTState`, `SnapshotSeqID = 0`) zurück, sodass Web-Clients den neuen Inhalt sauber übernehmen.
- **SSE Live-Sync**: Erstellen, Aktualisieren und Löschen lösen sofort Echtzeit-Events (`file_created`, `file_updated`, `file_deleted` mit `"source": "external_api"`) für alle berechtigten Benutzer aus.
- **E2E-Verschlüsselung**: End-to-End-verschlüsselte Notizen können über die externe API weder entschlüsselt noch inhaltlich überschrieben werden (`400 Bad Request`).

---

### Aufgaben / Todos (`/api/v1/external/todos`)

Die Endpunkte unter `/api/v1/external/todos` sind vollständig mit der Web-UI (`/api/v1/todos`) synchronisiert und senden Live-Updates via SSE.

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/todos` | `todos:read` (oder `todos:write`) | Todos auflisten & filtern (`date`, `prio`/`priority`, `tag`, `description`/`q`/`search`, `overdue`, `status`, `completed`, `folder`, `include_archived`, `limit`, `offset`). |
| `GET` | `/todos/{id}` | `todos:read` (oder `todos:write`) | Einzelnes Todo abrufen. |
| `POST` | `/todos` | `todos:create` (oder `todos:write`) | Neues Todo anlegen. |
| `PUT` / `PATCH` | `/todos/{id}` | `todos:edit` (oder `todos:write`) | Todo bearbeiten oder Status ändern. |
| `DELETE` | `/todos/{id}` | `todos:delete` (oder `todos:write`) | Todo löschen. |

---

### Ordner (`/api/v1/external/folders`)

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/folders` | `folders:read` | Ordner auflisten (respektiert `safe:<name>` und `folder:<uuid>`). |
| `GET` | `/folders/{id}` | `folders:read` | Einzelnen Ordner abrufen. |
| `POST` | `/folders` | `folders:write` | Neuen Ordner erstellen (`title`, `parent_id`, `color`, `safe`/`workspace`, `icon`). |
| `PUT` / `PATCH` | `/folders/{id}` | `folders:write` | Ordner aktualisieren/verschieben. |
| `DELETE` | `/folders/{id}` | `folders:write` | Ordner löschen (mit SSE-Broadcast). |

---

### Tags (`/api/v1/external/tags`)

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/tags` | `tags:read` | Tags auflisten. |
| `GET` | `/tags/{id}` | `tags:read` | Einzelnen Tag abrufen. |
| `POST` | `/tags` | `tags:write` | Neuen Tag erstellen (`title`, `color`, `effect`: `none`, `stripes`, `waves`, `dots`, `chess`, `diamonds`, `gradient`, `bars`, `dimmed`). |
| `PUT` / `PATCH` | `/tags/{id}` | `tags:write` | Tag aktualisieren. |
| `DELETE` | `/tags/{id}` | `tags:write` | Tag löschen. |

---

### Workspaces (`/api/v1/external/workspaces`)

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/workspaces` | `workspaces:read` | Workspaces inkl. `active_workspaces` und Dateianzahl (`file_count`) abrufen. |
| `POST` | `/workspaces` | `workspaces:write` | Neuen Workspace anlegen (`name`, optional `active`). |
| `PUT` | `/workspaces/active` | `workspaces:write` | Aktive Workspaces setzen. |
| `PUT` / `PATCH` | `/workspaces/{name}` | `workspaces:write` | Workspace umbenennen (`new_name`) oder Aktivierungsstatus (`active`) ändern (`main` kann nicht umbenannt werden). |
| `DELETE` | `/workspaces/{name}` | `workspaces:write` | Workspace löschen. |

Alle Änderungen lösen ein `workspaces_updated`-SSE-Event für die Web-UI aus.

---

### Einstellungen (`/api/v1/external/settings`)

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/settings` | `settings:read` | Strukturierte Benutzereinstellungen abrufen (`profile`, `appearance`, `notes`, `calendar`, `extensions`, `presence`). |
| `PUT` / `PATCH` | `/settings` | `settings:write` | Erlaubte Einstellungs-Sektionen partiell per Deep-Merge aktualisieren (inkl. `settings_updated`-SSE-Event). |

**Explizite Sicherheits-Blocklist (`403 Forbidden`):**
Aus Sicherheitsgründen blockiert die Settings-API – **auch bei `*`-Scope** – jegliche Zugriffe bzw. Änderungen auf sensible Kontofelder mit `403 Forbidden` (`"error": "forbidden_setting"`):
- **PIN / Passwort / Login**: `pin`, `new_pin`, `pin_hash`, `current_pin`, `password`, `new_password`, `login_code`, `delete_account`
- **E-Mail / Telefon**: `email`, `new_email`, `email_blind_index`, `phone`, `phone_blind_index`
- **Vault & Schlüssel**: `vault`, `encrypted_vault`, `encrypted_pepper`, `pepper`, `public_key`, `private_key`, `master_key`, `recovery_key`
- **Tokens**: `api_tokens`, `tokens`, `token`, `whisper_token`, `mobile_token`

---

### Umfragen (`/api/v1/external/surveys`)

| Methode | Pfad | Scope | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/surveys/responses` | `surveys:read` (oder `surveys:write`) | Umfrage-Antworten abfragen (optional `?survey_id=`). |
| `POST` | `/surveys/responses` | `surveys:create` (oder `surveys:write`) | Umfrage-Antwort speichern (`survey_id`, `data`, optional `id`, `created_at`). |
| `DELETE` | `/surveys/responses/{id}` | `surveys:delete` (oder `surveys:write`) | Umfrage-Antwort löschen. |

---

### Web-UI-Sync-Endpunkte

Die Web-UI nutzt für Einstellungen und Workspaces dieselben Backend-Handler und Datenmodelle wie die externe API (authentifiziert per Benutzer-Session/JWT):
- **`/api/v1/user/settings`** (`GET`, `PUT`, `PATCH`)
- **`/api/v1/user/workspaces`** (`GET`, `POST`, `PUT /active`, `PUT/PATCH /{name}`, `DELETE /{name}`)

Dadurch sind Änderungen zwischen Web-UI und externer API jederzeit konsistent und werden gegenseitig per SSE synchronisiert.

---

## 6. Code-Beispiele

### cURL
```bash
# 1. Token-Info prüfen
curl -s -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/me" | jq .

# 2. Text an eine unverschlüsselte Notiz anhängen
curl -s -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"append_content": "- Neuer Eintrag via API"}' \
  "https://hrw.rocks/api/v1/external/notes/<NOTE_ID>" | jq .

# 3. Offene Todos abrufen
curl -s -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/todos?completed=false&limit=20" | jq .
```

### Python
```python
import os
import requests

API_URL = "https://hrw.rocks/api/v1/external/events"
TOKEN = os.getenv("TIDE_API_TOKEN", "tide_pat_DEIN_TOKEN")

res = requests.get(
    API_URL,
    headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"},
    params={"limit": 20},
)
res.raise_for_status()
for ev in res.json().get("events", []):
    print(f"• {ev['title']} ({ev['start']} - {ev['end']})")
```

### Home Assistant (REST Sensor)
```yaml
sensor:
  - platform: rest
    name: "Tide Nächste Termine"
    resource: "https://hrw.rocks/api/v1/external/events"
    headers:
      Authorization: "Bearer tide_pat_DEIN_TOKEN"
    params:
      limit: 5
    scan_interval: 300
    value_template: "{{ value_json.count }}"
    json_attributes:
      - events
      - count
```

---

## 7. Fehlerbehandlung & Status-Codes

| Code | Bedeutung | Ursache / Lösung |
|------|-----------|------------------|
| `200 OK` / `201 Created` | Erfolg | Anfrage erfolgreich verarbeitet bzw. Ressource erstellt. |
| `400 Bad Request` | Ungültige Anfrage | Fehlerhaftes JSON, ungültiges Datumsformat (ISO 8601 nutzen) oder Inhaltsänderung an einer E2E-verschlüsselten Notiz. |
| `401 Unauthorized` | Nicht authentifiziert | Token fehlt, ist ungültig oder abgelaufen. |
| `403 Forbidden` | Fehlende Berechtigung | Benötigter Scope fehlt, Ressource liegt außerhalb von `safe:`/`folder:`, oder blockierter Settings-Key (`forbidden_setting`). |
| `404 Not Found` | Nicht gefunden | Ressource existiert nicht oder gehört nicht zum Account. |
| `409 Conflict` | Konflikt | Ressource existiert bereits (z. B. Workspace-Name vergeben). |
| `500 Internal Server Error` | Serverfehler | Interner Fehler bei Datenbank- oder Blob-Zugriff. |

### Beispiel für Fehler-Antwort (`403 Forbidden`)
```json
{
  "error": "Forbidden",
  "message": "Token lacks required scope 'notes:write'",
  "required_scope": "notes:write",
  "required_scopes": ["notes:write"],
  "token_scopes": ["notes:read"]
}
```

---

## 8. Sicherheitsarchitektur

1. **Keine Plaintext-Speicherung**: Tokens (`tide_pat_<random-hex>`) werden nach der Erstellung nur einmalig angezeigt; gespeichert wird ausschließlich `SHA256(token)`.
2. **Sichere Generierung**: Tokens werden über `crypto/rand` mit kryptografisch sicheren Zufallsdaten erzeugt.
3. **Sofortiger Widerruf**: Das Löschen eines Tokens in den Einstellungen macht ihn sofort ungültig.
4. **Nutzungs-Tracking**: Bei jeder erfolgreichen Anfrage wird `last_used_at` asynchron aktualisiert.
5. **E2E- & Kontoschutz**: E2E-verschlüsselte Notizinhalte und sicherheitskritische Kontoeinstellungen (PIN, E-Mail, Vault, Keys, Tokens) sind über die externe API grundsätzlich geschützt.
