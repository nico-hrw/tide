<!-- Generated from web/src/lib/apiDocs (same source as the public page /docs/api).
     Do not edit by hand. Rewrite with: UPDATE_API_MD=1 npx vitest run apiDocsFile (in web/). -->

# Tide API

Öffentliche Referenz der HTTP-Schnittstelle für Notizen, Termine, Todos, Ordner, Tags, Workspaces und Einstellungen. Ohne Login lesbar und so formuliert, dass auch KI-Assistenten damit arbeiten können.

## Inhalt

1. Überblick
2. Authentifizierung
3. Rechte
4. Notizen
5. Termine
6. Todos
7. Ordner
8. Tags
9. Workspaces (Safes)
10. Einstellungen & Token-Info
11. Fehlercodes
12. Limits
13. Verschlüsselung

## 1. Überblick

Die Tide-API ist eine REST-Schnittstelle mit JSON. Mit ihr lassen sich Notizen, Termine, Todos (Aufgaben), Ordner, Tags, Workspaces, Einstellungen und Umfragen eines Tide-Kontos abfragen und verwalten. Alle Routen liegen unter `/api/v1`.

|  | Basis-URL |
| --- | --- |
| Produktion | `https://hrw.rocks/api/v1` |

| Ressource | Pfad (relativ zur Basis-URL) | Methoden |
| --- | --- | --- |
| Notizen | `/external/notes`, `/external/notes/{id}` | GET, POST, PUT, PATCH, DELETE |
| Termine | `/external/events`, `/external/events/{id}` | GET, POST, PUT, PATCH, DELETE |
| Todos | `/todos`, `/todos/{id}` (Alias: `/external/todos`) | GET, POST, PUT, PATCH, DELETE |
| Ordner | `/external/folders`, `/external/folders/{id}` | GET, POST, PUT, PATCH, DELETE |
| Tags | `/external/tags`, `/external/tags/{id}` | GET, POST, PUT, PATCH, DELETE |
| Workspaces | `/external/workspaces`, `/external/workspaces/{name}`, `/external/workspaces/active` | GET, POST, PUT, PATCH, DELETE |
| Einstellungen | `/external/settings` | GET, PUT, PATCH |
| Token-Info | `/external/me` | GET |
| Umfragen | `/surveys/responses`, `/surveys/responses/{id}` (Alias: `/external/surveys/responses`) | GET, POST, DELETE |

### Konventionen

- Anfragen mit Body senden JSON und den Header `Content-Type: application/json`.
- Antworten sind JSON. IDs sind Zeichenketten (UUIDs). Zeitstempel wie `created_at` sind RFC 3339.
- Jede Anfrage braucht einen persönlichen Zugriffstoken (siehe Authentifizierung).
- Ein Token wirkt immer im Namen des Kontos, das ihn erstellt hat.

### Kürzestes Beispiel

**Offene Todos abrufen**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/todos?completed=false"
```

> **Hinweis:** Beispielwerte (IDs, Titel, Daten) sind ausgedacht. Pfade, Feldnamen, Statuscodes und Verhalten entsprechen dem Server-Code. Was sich daraus nicht belegen ließ, ist mit "Nicht verifiziert" markiert.

## 2. Authentifizierung

Die API nutzt **Personal Access Tokens**. Ein Mensch erstellt den Token in Tide und gibt ihn dem Skript oder dem KI-Assistenten.

### Token erstellen

- In Tide die Einstellungen öffnen, Bereich **Zugriff**, neuen Token anlegen.
- Einen Namen vergeben und die benötigten Rechte wählen (siehe Rechte).
- Die Gültigkeit wählen: 30, 60 oder 90 Tage, 1 Jahr oder kein Ablauf.
- Den Token sofort kopieren. Er wird nur einmal angezeigt.

Ein Token beginnt mit `tide_pat_` und hat danach 64 Hexadezimalzeichen. Der Server speichert nur einen SHA-256-Hash, der Klartext ist später nicht mehr abrufbar. In Tide lässt sich ein Token jederzeit widerrufen, externe Dienste verlieren dann sofort den Zugriff.

### Token mitsenden

Drei Wege werden akzeptiert. Der Server prüft sie in dieser Reihenfolge: `Authorization`-Header, `X-API-Key`-Header, Query-Parameter.

**Empfohlen: Bearer-Header**

```http
Authorization: Bearer tide_pat_DEIN_TOKEN
```

**Alternative: X-API-Key**

```http
X-API-Key: tide_pat_DEIN_TOKEN
```

**Notlösung: Query-Parameter**

```http
GET https://hrw.rocks/api/v1/todos?api_token=tide_pat_DEIN_TOKEN
```

> **Achtung:** Ein Token in der URL kann in Server- und Proxy-Logs landen. Nutze den Query-Parameter nur, wenn keine Header möglich sind, etwa bei Widgets oder Webhooks.

Ein fehlender, unbekannter oder abgelaufener Token führt zu `401`, ein Token ohne passendes Recht zu `403` (siehe Fehlercodes).

## 3. Rechte

Ein Token darf nur, was ihm beim Erstellen erlaubt wurde. Ein Endpunkt akzeptiert je nach Route eines von mehreren Rechten. Es genügt, wenn der Token mindestens eines davon trägt oder das Recht `*` hat. Grundsätzlich gilt: **`<resource>:write` schließt `<resource>:read` automatisch ein**.

| Recht (Klartext) | Technischer Name | Erlaubt |
| --- | --- | --- |
| Termine lesen | `events:read` | `GET /external/events`, `GET /external/events/{id}` |
| Termine ändern | `events:write` | Termine erstellen, bearbeiten und löschen (`POST`, `PUT`, `PATCH`, `DELETE /external/events`). Schließt `events:read` ein. |
| Notizen lesen | `notes:read` | `GET /external/notes`, `GET /external/notes/{id}` |
| Notizen ändern | `notes:write` | Notizen erstellen, ändern und löschen (`POST`, `PUT`, `PATCH`, `DELETE /external/notes`). Schließt `notes:read` ein. |
| Aufgaben lesen | `todos:read` | `GET /todos`, `GET /todos/{id}` |
| Aufgaben erstellen | `todos:create` | `POST /todos` |
| Aufgaben bearbeiten | `todos:edit` | `PUT /todos/{id}`, `PATCH /todos/{id}` (inklusive Abhaken) |
| Aufgaben löschen | `todos:delete` | `DELETE /todos/{id}` |
| Aufgaben vollständig verwalten | `todos:write` | Alle Todo-Endpunkte (lesen, erstellen, bearbeiten, löschen). Schließt `todos:read` ein. |
| Ordner lesen | `folders:read` | `GET /external/folders`, `GET /external/folders/{id}` |
| Ordner ändern | `folders:write` | Ordner erstellen, ändern, verschieben und löschen. Schließt `folders:read` ein. |
| Tags lesen | `tags:read` | `GET /external/tags`, `GET /external/tags/{id}` |
| Tags ändern | `tags:write` | Tags erstellen, ändern und löschen. Schließt `tags:read` ein. |
| Workspaces lesen | `workspaces:read` | `GET /external/workspaces` |
| Workspaces ändern | `workspaces:write` | Workspaces anlegen, umbenennen, aktivieren und löschen. Schließt `workspaces:read` ein. |
| Einstellungen lesen | `settings:read` | `GET /external/settings` |
| Einstellungen ändern | `settings:write` | Nicht-sensitive Einstellungen per `PUT` oder `PATCH /external/settings` aktualisieren. Schließt `settings:read` ein. |
| Umfragen lesen | `surveys:read` | `GET /surveys/responses` (bzw. `/external/surveys/responses`) |
| Umfragen ändern | `surveys:write` | Umfrage-Antworten erstellen und löschen (`POST`, `DELETE`). Schließt `surveys:read` ein. |
| Große Uploads | `storage:expand` | Betrifft das Upload-Limit der App, hat keinen Endpunkt in dieser Dokumentation. |
| Vollzugriff | `*` | Voller Zugriff auf alle API-Endpunkte. **Ausnahme:** Sicherheitskritische Felder (`pin`, `email`, `vault`, API-Tokens u. Ä.) bleiben auch mit `*` strikt geschützt (`403`). |
| Workspace-Bereich (Notizen) | `safe:<name>` | Beschränkt Notiz-Zugriffe auf einen bestimmten Workspace/Safe (z. B. `safe:work`). |
| Ordner-Bereich (Notizen) | `folder:<uuid>` | Beschränkt Notiz-Zugriffe auf einen Ordner inkl. Unterordner (bis 5 Ebenen tief). |

> **Hinweis:** Jeder gültige Token darf ohne gesonderten Scope `GET /external/me` abrufen. Bei allen Ressource-Scopes gilt die Vererbung: `<resource>:write` enthält automatisch `<resource>:read`.

> **Achtung:** Auch der Wildcard-Scope `*` erlaubt **keinen** Zugriff auf PIN, E-Mail-Adresse, Vault-/Verschlüsselungsschlüssel oder API-Tokens — entsprechende Felder und Aktionen bleiben über die External-API gesperrt.

### Bereichs-Rechte für Notizen: safe und folder

Ein Token kann zusätzlich auf einen Safe (`safe:<name>`, z. B. `safe:work`) oder einen Ordner (`folder:<id>`) beschränkt werden. Die Rechte werden kombiniert, zum Beispiel:

**Rechte eines eingeschränkten Tokens**

```json
["notes:read", "notes:write", "safe:work"]
```

- Gilt nur für Notizen. Für Todos und Termine haben `safe:` und `folder:` keine Wirkung, dort sind die jeweiligen Todo- und Termin-Rechte nötig.
- Notizen außerhalb des Bereichs fehlen in der Liste. Beim direkten Zugriff antwortet die API mit `403` und der Meldung "Note does not belong to scoped workspace or folder".
- Neue Notizen landen im Safe des Tokens, bei `folder:` im Ordner (ohne `parent_id` im ersten Ordner des Tokens). Ein Ordner-Token kann Notizen nicht in die Wurzel verschieben.
- Ein Ordner-Bereich umfasst nach dem Code den Ordner und seine Unterordner bis fünf Ebenen tief.

> **Achtung:** Nach dem Server-Code besteht ein Token, das nur `safe:` oder `folder:` trägt, die Rechteprüfung aller Notiz-Endpunkte, auch der schreibenden. Gib solche Tokens nur weiter, wenn schreibender Zugriff auf den Bereich gewollt ist.

## 4. Notizen

Notizen haben einen Titel, einen Inhalt (Markdown oder Text) sowie optionale Metadaten wie Elternordner, Workspace (`safe`), Tags, Icon und Farbe. Abgefragt werden eigene Notizen und mit dir geteilte, angenommene Notizen.

### Felder

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | string | ID der Notiz |
| `title` | string | Titel der Notiz |
| `content` | string | Inhalt (Markdown oder Text). Bei verschlüsselten Notizen leer und in der Liste nicht enthalten. |
| `parent_id` | string oder null | ID des Elternordners, `null` ohne Elternordner |
| `safe` | string, optional | Zugehöriger Workspace/Safe (z. B. `"main"`, `"work"`) |
| `linked_safes` | string[], optional | Zusätzliche verknüpfte Workspaces/Safes |
| `tag_ids` | string[], optional | Liste der zugewiesenen Tag-IDs |
| `icon` | string, optional | Icon-Bezeichner oder Emoji der Notiz |
| `color` | string, optional | Farbwert oder Farb-Token der Notiz |
| `version` | integer, optional | Versionszähler der Notiz (beginnt bei `2`, steigt bei jeder Änderung) |
| `encrypted` | boolean | `true`, wenn die Notiz Ende-zu-Ende-verschlüsselt ist (siehe Verschlüsselung) |
| `created_at`, `updated_at` | string (RFC 3339) | Erstellt und zuletzt geändert. Die Liste enthält nur `updated_at`. |
| `note` | object | Antworten zu einer einzelnen Notiz wiederholen die Felder zusätzlich unter `note`. |

#### `GET /external/notes`

Benötigtes Recht: `notes:read` oder `notes:write`. Notizen auflisten und nach Titel, Ordner, Workspace oder Tag filtern.

| Parameter | Typ | Beschreibung |
| --- | --- | --- |
| `search` oder `q` | string | Teil des Titels, Groß- und Kleinschreibung egal |
| `parent_id` | string | Ordner-UUID oder `root` für Notizen auf oberster Ebene ohne Elternordner |
| `safe` oder `workspace` | string | Filtert auf einen bestimmten Workspace/Safe (z. B. `main`, `work`) |
| `tag_id` | string | Filtert auf Notizen mit dieser Tag-ID in `tag_ids` |
| `limit` | integer | Standard `100`, höchstens `500` (positive Ganzzahl) |

Die Liste ist nach `updated_at` absteigend sortiert und enthält keinen `content` (nur Metadaten wie `id`, `title`, `parent_id`, `safe`, `linked_safes`, `tag_ids`, `icon`, `color`, `version`, `encrypted` und `updated_at`). Den Inhalt liefert `GET /external/notes/{id}`.

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/notes?search=woche&safe=work&parent_id=root&limit=10"
```

**Antwort 200**

```json
{
  "count": 1,
  "notes": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "title": "Wochenplanung",
      "parent_id": null,
      "safe": "work",
      "tag_ids": ["tag-planung"],
      "icon": "calendar",
      "color": "#3b82f6",
      "encrypted": false,
      "version": 3,
      "updated_at": "2026-11-05T14:32:00Z"
    }
  ]
}
```

#### `GET /external/notes/{id}`

Benötigtes Recht: `notes:read` oder `notes:write`. Eine Notiz mit Inhalt und allen Metadaten abrufen.

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
```

**Antwort 200 (unverschlüsselte Notiz)**

```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Wochenplanung",
  "content": "## Montag\n- Review vorbereiten",
  "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
  "safe": "work",
  "linked_safes": ["main"],
  "tag_ids": ["tag-planung"],
  "icon": "calendar",
  "color": "#3b82f6",
  "version": 3,
  "encrypted": false,
  "created_at": "2026-11-01T10:00:00Z",
  "updated_at": "2026-11-05T14:32:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Wochenplanung",
    "content": "## Montag\n- Review vorbereiten",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "safe": "work",
    "linked_safes": ["main"],
    "tag_ids": ["tag-planung"],
    "icon": "calendar",
    "color": "#3b82f6",
    "encrypted": false,
    "version": 3,
    "created_at": "2026-11-01T10:00:00Z",
    "updated_at": "2026-11-05T14:32:00Z"
  }
}
```

**Antwort 200 (verschlüsselte Notiz, ohne Inhalt)**

```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Tagebuch",
  "content": "",
  "parent_id": null,
  "safe": "main",
  "linked_safes": null,
  "tag_ids": null,
  "icon": "",
  "color": "",
  "version": 2,
  "encrypted": true,
  "message": "This note is end-to-end encrypted and cannot be decrypted without the user's private key",
  "created_at": "2026-11-01T10:00:00Z",
  "updated_at": "2026-11-05T14:32:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Tagebuch",
    "content": "",
    "parent_id": null,
    "safe": "main",
    "encrypted": true,
    "version": 2,
    "created_at": "2026-11-01T10:00:00Z",
    "updated_at": "2026-11-05T14:32:00Z"
  }
}
```

#### `POST /external/notes`

Benötigtes Recht: `notes:write`. Eine neue Notiz anlegen.

| Feld im Body | Typ | Beschreibung |
| --- | --- | --- |
| `title` | string, optional | Ohne Angabe: `"Untitled Note"` |
| `content` | string, optional | Inhalt als Markdown oder Text |
| `parent_id` | string, optional | ID eines Ordners, in dem die Notiz liegen soll. Er muss existieren und schreibbar sein, sonst `400` oder `403`. |
| `safe` oder `workspace` | string, optional | Ziel-Workspace/Safe (Standard: Safe des Elternordners, sonst Token-Scope bzw. `"main"`). Muss zum Token-Scope passen, sonst `403`. |
| `linked_safes` | string[], optional | Zusätzliche verknüpfte Workspaces/Safes |
| `tag_ids` | string[], optional | Liste zuzuweisender Tag-IDs |
| `icon` | string, optional | Icon-Bezeichner oder Emoji |
| `color` | string, optional | Farbwert oder Farb-Token |

**Anfrage**

```bash
curl -X POST -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Standup", "content": "## Agenda\n- API-Tokens", "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9", "safe": "work", "linked_safes": ["main"], "tag_ids": ["tag-meeting"], "icon": "notebook", "color": "#10b981"}' \
  "https://hrw.rocks/api/v1/external/notes"
```

**Antwort 201**

```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Standup",
  "content": "## Agenda\n- API-Tokens",
  "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
  "safe": "work",
  "linked_safes": ["main"],
  "tag_ids": ["tag-meeting"],
  "icon": "notebook",
  "color": "#10b981",
  "version": 2,
  "encrypted": false,
  "created_at": "2026-11-11T15:30:00Z",
  "updated_at": "2026-11-11T15:30:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Standup",
    "content": "## Agenda\n- API-Tokens",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "safe": "work",
    "linked_safes": ["main"],
    "tag_ids": ["tag-meeting"],
    "icon": "notebook",
    "color": "#10b981",
    "encrypted": false,
    "version": 2,
    "created_at": "2026-11-11T15:30:00Z",
    "updated_at": "2026-11-11T15:30:00Z"
  }
}
```

> **Achtung:** Per API erstellte Notizen werden unverschlüsselt gespeichert (siehe Verschlüsselung).

#### `PATCH /external/notes/{id}`

Benötigtes Recht: `notes:write`. Eine Notiz ändern oder Text anhängen. `PUT` verhält sich identisch.

Es werden nur die gesendeten Felder geändert, fehlende Felder bleiben unverändert.

| Feld im Body | Typ | Beschreibung |
| --- | --- | --- |
| `title` | string, optional | Neuer Titel der Notiz (leer wird zu `"Untitled Note"`) |
| `content` | string, optional | Ersetzt den gesamten Inhalt (Markdown oder Text) |
| `append_content` | string, optional | Hängt Text an den bestehenden Inhalt an, ohne ihn zu überschreiben (fügt bei Bedarf vorab `\n` ein). |
| `parent_id` | string, optional | Zielordner-UUID; `""` verschiebt die Notiz auf die oberste Ebene (`null`/weggelassen lässt den Ordner unverändert). |
| `safe` oder `workspace` | string, optional | Neuer Workspace/Safe. Beim Verschieben in einen Ordner wird ohne explizites `safe` dessen Safe übernommen. |
| `linked_safes` | string[], optional | Ersetzt die Liste verknüpfter Workspaces/Safes |
| `tag_ids` | string[], optional | Ersetzt die Liste der zugewiesenen Tag-IDs |
| `icon` | string, optional | Setzt oder leert das Icon |
| `color` | string, optional | Setzt oder leert die Farbe |

- Den `content` einer verschlüsselten Notiz kann die API weder mit `content` noch mit `append_content` ändern und antwortet mit `400` und `"encrypted": true`. Metadaten wie `title`, `tag_ids`, `icon` oder `color` lassen sich weiterhin ändern.
- Jedes Update erhöht `version` und liefert unter `200` dieselbe Antwortstruktur wie `GET /external/notes/{id}` mit dem neuen Stand.

**Anfrage (Text anhängen und Tags aktualisieren)**

```bash
curl -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"append_content": "- Release prüfen", "tag_ids": ["tag-meeting", "tag-release"]}' \
  "https://hrw.rocks/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
```

> **Hinweis:** Schreibzugriffe über die externe API (`POST` und `PATCH`/`PUT`) setzen bei Inhaltsänderungen automatisch den CRDT-Zustand (Yjs-Snapshots/Updates) zurück und senden ein Live-Update an geöffnete Notizen in der Web-UI — inklusive vollständiger Markdown-Formatierung.

#### `DELETE /external/notes/{id}`

Benötigtes Recht: `notes:write`. Eine Notiz in den Papierkorb verschieben oder endgültig löschen.

| Parameter | Typ | Beschreibung |
| --- | --- | --- |
| `permanent` | boolean, optional | Ohne Angabe (oder nicht `true`) verschiebt der Server die Notiz per Soft-Delete in den Papierkorb. Mit `?permanent=true` wird sie endgültig aus Datenbank und Blob-Speicher gelöscht. |

**Anfrage (Soft-Delete in den Papierkorb)**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
```

**Anfrage (endgültig löschen)**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d?permanent=true"
```

**Antwort 200**

```json
{
  "success": true,
  "message": "Note deleted successfully",
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

> **Achtung:** Standardmäßig landet die Notiz im Papierkorb (Soft-Delete) und ist über die API nicht mehr abrufbar. Mit `?permanent=true` wird sie unwiderruflich gelöscht — frage vor dem endgültigen Löschen nach, wenn ein Mensch dahintersteht.

## 5. Termine

Termine sind Kalendereinträge (optional auch Aufgaben-Termine und Wiederholungen). Abgefragt werden eigene und mit dir geteilte, angenommene Termine. Mit dem Scope `events:write` lassen sie sich auch erstellen, ändern und löschen.

### Felder

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | string | ID des Termins |
| `title` | string | Titel. Fehlt er in gespeicherten Daten, liefert der Server "Untitled Event". |
| `start`, `end` | string | Beginn und Ende (in der Regel RFC 3339 / ISO 8601) |
| `all_day` | boolean | `true` bei ganztägigen Terminen |
| `color`, `description`, `location` | string | Farbe, Beschreibung, Ort. Das Feld fehlt in der Antwort, wenn es leer ist. |
| `parent_id` | string | ID eines übergeordneten Ordners oder Tags. Fehlt, wenn es keinen gibt. |
| `group_ids` | string[] | IDs zugeordneter Gruppen/Ordner. Fehlt, wenn leer. |
| `tags` | string[] | Tag-Namen aus den Metadaten. Fehlt, wenn leer. |
| `recurrence_rule`, `recurrence_end` | string | Wiederholungsregel und Enddatum. Fehlen, wenn leer. |
| `exdates`, `completed_dates` | string[] | Ausgeschlossene bzw. als erledigt markierte Seriendaten. Fehlen, wenn leer. |
| `is_task`, `is_completed`, `is_cancelled`, `is_important` | boolean | Flags für Aufgaben-Termine, Erledigung, Absage und Wichtigkeit. Fehlen, wenn `false`. |
| `effect` | string | Visueller Effekt des Termins. Fehlt, wenn leer. |
| `version` | integer | Revisionsnummer des Termins (wird bei Updates hochgezählt). Fehlt, wenn `0`. |
| `source` | string | `tide` für in Tide erstellte Termine, `gcal` für aus Google Kalender übernommene |
| `created_at`, `updated_at` | string (RFC 3339) | Erstellt und zuletzt geändert |

#### `GET /external/events`

Benötigtes Recht: `events:read`. Termine auflisten, aufsteigend nach Beginn sortiert.

| Parameter | Beispiel | Beschreibung |
| --- | --- | --- |
| `start` oder `from` | `2026-11-01` | Nur Termine, die nicht vor diesem Zeitpunkt enden |
| `end` oder `to` | `2026-11-30` | Nur Termine, die nicht nach diesem Zeitpunkt beginnen. Bei einem reinen Datum zählt der ganze Tag. |
| `q` oder `search` | `sprint` | Teiltext in Titel, Beschreibung oder Ort, Groß- und Kleinschreibung egal |
| `group_id` oder `tag_id` | `4a7f05b8-d227-440f-90db-2b6214a1c5d9` | Nur Termine, deren `parent_id` oder `group_ids` diese ID enthält |
| `parent_id` | `4a7f05b8-d227-440f-90db-2b6214a1c5d9` | Nur Termine mit genau dieser `parent_id` |
| `limit` | `50` | Standard 100, höchstens 500. Ungültige Werte (`<= 0` oder keine Ganzzahl) liefern `400`. |

`start` und `end` akzeptieren ein Datum (`2026-11-01`) oder einen Zeitpunkt nach RFC 3339 (`2026-11-01T00:00:00Z`). Andere Formate sowie ein ungültiges `limit` führen zu `400`.

**Anfrage: Termine im November**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/events?start=2026-11-01&end=2026-11-30&limit=50"
```

**Antwort 200**

```json
{
  "count": 1,
  "events": [
    {
      "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
      "title": "Sprint Planning",
      "start": "2026-11-16T10:00:00Z",
      "end": "2026-11-16T11:30:00Z",
      "all_day": false,
      "color": "#3b82f6",
      "description": "Backlog sichten",
      "location": "Raum A",
      "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
      "group_ids": ["4a7f05b8-d227-440f-90db-2b6214a1c5d9"],
      "version": 2,
      "source": "tide",
      "created_at": "2026-11-10T14:00:00Z",
      "updated_at": "2026-11-10T14:00:00Z"
    }
  ]
}
```

#### `GET /external/events/{id}`

Benötigtes Recht: `events:read`. Einen einzelnen Termin abrufen. `404`, wenn er nicht existiert.

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/events/e4b3c9a0-1234-4567-89ab-cdef01234567"
```

**Antwort 200**

```json
{
  "event": {
    "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
    "title": "Sprint Planning",
    "start": "2026-11-16T10:00:00Z",
    "end": "2026-11-16T11:30:00Z",
    "all_day": false,
    "color": "#3b82f6",
    "description": "Backlog sichten",
    "location": "Raum A",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "group_ids": ["4a7f05b8-d227-440f-90db-2b6214a1c5d9"],
    "version": 2,
    "source": "tide",
    "created_at": "2026-11-10T14:00:00Z",
    "updated_at": "2026-11-10T14:00:00Z"
  }
}
```

#### `POST /external/events`

Benötigtes Recht: `events:write`. Einen neuen Termin anlegen.

| Feld im Body | Typ | Beschreibung |
| --- | --- | --- |
| `title` | string, Pflicht | Titel des Termins (darf nicht leer sein, sonst `400`) |
| `start` | string, Pflicht | Beginn als RFC 3339, `YYYY-MM-DDTHH:MM:SS` oder `YYYY-MM-DD` (wird nach RFC 3339 normalisiert) |
| `end` | string, optional | Ende (`>= start`, sonst `400`). Fehlt es, setzt der Server `+1 Stunde` (bei `all_day: true`: `23:59:59` desselben Tages). |
| `all_day` | boolean, optional | `true` für ganztägigen Termin (Standard `false`) |
| `color`, `description`, `location`, `effect` | string, optional | Farbe, Beschreibung, Ort oder visueller Effekt |
| `parent_id` | string, optional | ID eines Ordners/Tags (`""` oder `"__none__"` wird ignoriert). Muss existieren und schreibbar sein (`400`/`403`). |
| `group_ids`, `tag_ids` | string[], optional | Zugeordnete Gruppen-/Tag-IDs (`tag_ids` als Fallback). Setzt `parent_id` auf das erste Element, wenn `parent_id` fehlt (und umgekehrt). |
| `recurrence_rule`, `recurrence_end` | string, optional | Wiederholungsregel und Enddatum |
| `exdates`, `completed_dates` | string[], optional | Ausgeschlossene bzw. als erledigt markierte Seriendaten |
| `is_task`, `is_completed`, `is_cancelled`, `is_important` | boolean, optional | Flags für Aufgaben-Termin, Erledigung, Absage und Wichtigkeit |

**Anfrage**

```bash
curl -X POST -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Sprint Planning", "start": "2026-11-16T10:00:00Z", "end": "2026-11-16T11:30:00Z", "color": "#3b82f6", "description": "Backlog sichten", "location": "Raum A", "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9"}' \
  "https://hrw.rocks/api/v1/external/events"
```

**Antwort 201**

```json
{
  "event": {
    "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
    "title": "Sprint Planning",
    "start": "2026-11-16T10:00:00Z",
    "end": "2026-11-16T11:30:00Z",
    "all_day": false,
    "color": "#3b82f6",
    "description": "Backlog sichten",
    "location": "Raum A",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "group_ids": ["4a7f05b8-d227-440f-90db-2b6214a1c5d9"],
    "version": 2,
    "source": "tide",
    "created_at": "2026-11-10T14:00:00Z",
    "updated_at": "2026-11-10T14:00:00Z"
  }
}
```

> **Achtung:** Per API erstellte oder geänderte Termine werden unverschlüsselt gespeichert (`unencrypted: true`).

#### `PATCH /external/events/{id}`

Benötigtes Recht: `events:write`. Einen Termin ändern. `PUT` verhält sich identisch.

Es werden nur die gesendeten Felder geändert, fehlende Felder bleiben unverändert. `title` darf nicht leer sein (`400`), `end` muss `>= start` bleiben (`400`).

| Feld im Body | Typ | Beschreibung |
| --- | --- | --- |
| `title` | string, optional | Neuer Titel (nicht leer) |
| `start`, `end` | string, optional | Neuer Beginn bzw. neues Ende (`end >= start`) |
| `all_day` | boolean, optional | Ganztägig ein- oder ausschalten |
| `color`, `description`, `location`, `effect` | string, optional | Farbe, Beschreibung, Ort oder visueller Effekt |
| `parent_id` | string, optional | Neuer Elternordner. `"__none__"` (oder `""`) entfernt `parent_id` und leert `group_ids`, sofern `group_ids`/`tag_ids` nicht mitgesendet werden. |
| `group_ids`, `tag_ids` | string[], optional | Gruppen-/Tag-IDs ersetzen (`tag_ids` als Fallback). Eine leere Liste `[]` ohne `parent_id` entfernt auch `parent_id`. |
| `recurrence_rule`, `recurrence_end` | string, optional | Wiederholungsregel und Enddatum |
| `exdates`, `completed_dates` | string[], optional | Ausnahmen und erledigte Seriendaten ersetzen |
| `is_task`, `is_completed`, `is_cancelled`, `is_important` | boolean, optional | Aufgaben- und Status-Flags |

**Anfrage: Termin aktualisieren und parent_id entfernen**

```bash
curl -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"location": "Raum B", "parent_id": "__none__", "is_important": true}' \
  "https://hrw.rocks/api/v1/external/events/e4b3c9a0-1234-4567-89ab-cdef01234567"
```

**Antwort 200**

```json
{
  "event": {
    "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
    "title": "Sprint Planning",
    "start": "2026-11-16T10:00:00Z",
    "end": "2026-11-16T11:30:00Z",
    "all_day": false,
    "color": "#3b82f6",
    "description": "Backlog sichten",
    "location": "Raum B",
    "is_important": true,
    "version": 3,
    "source": "tide",
    "created_at": "2026-11-10T14:00:00Z",
    "updated_at": "2026-11-12T09:15:00Z"
  }
}
```

#### `DELETE /external/events/{id}`

Benötigtes Recht: `events:write`. Einen Termin löschen (standardmäßig Soft-Delete).

| Parameter | Typ | Beschreibung |
| --- | --- | --- |
| `permanent` | boolean (Query) | Bei `permanent=true` wird der Termin endgültig aus der Datenbank gelöscht (erfordert Eigentümer- oder Admin-Recht, sonst `403`). Ohne Angabe erfolgt ein Soft-Delete (`deleted_at`, erfordert Schreibrecht). |

**Anfrage (Soft-Delete)**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/events/e4b3c9a0-1234-4567-89ab-cdef01234567"
```

**Anfrage (Endgültig löschen)**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/events/e4b3c9a0-1234-4567-89ab-cdef01234567?permanent=true"
```

**Antwort 200**

```json
{
  "success": true,
  "message": "Event deleted successfully",
  "id": "e4b3c9a0-1234-4567-89ab-cdef01234567"
}
```

## 6. Todos

Todos sind Aufgaben mit Titel, Priorität, Fälligkeit und Tags. Sie gehören immer genau einem Konto. Unter `/external/todos` sind dieselben Endpunkte ein zweites Mal erreichbar.

### Felder

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id`, `user_id` | string | ID des Todos (UUID) und des Besitzers |
| `title` | string | Titel, Pflichtfeld beim Erstellen |
| `description` | string | Beschreibung, leer wenn nicht gesetzt |
| `status` | string | `todo` (Standard), `in_progress` oder `completed` |
| `priority` | string | `low`, `medium` (Standard) oder `high` |
| `due_date` | string | Fälligkeit, empfohlen `YYYY-MM-DD`. Leer wenn nicht gesetzt. |
| `scheduled_date` | string | Geplantes Datum, empfohlen `YYYY-MM-DD`. Leer wenn nicht gesetzt. |
| `tags` | string[] | Liste von Tags, leer wenn keine |
| `color` | string | Farbangabe als Text, leer wenn nicht gesetzt |
| `is_completed` | boolean | `true`, wenn erledigt |
| `completed_at` | string (RFC 3339) | Zeitpunkt der Erledigung. Fehlt, solange das Todo offen ist. |
| `is_overdue` | boolean | Vom Server berechnet: offen und Fälligkeit liegt in der Vergangenheit |
| `folder` | string | Ordnername zur Gruppierung in der Web-UI. Fehlt, wenn nicht gesetzt. |
| `linked_note_id` | string | ID einer verknüpften Notiz (UUID). Fehlt, wenn nicht gesetzt. |
| `recurrence` | string | Einfaches Wiederholungsintervall (z. B. `daily`, `weekly`, `monthly`). Fehlt, wenn nicht gesetzt. |
| `recurrence_rule` | string | Wiederholungsregel im RRULE-Format (z. B. `FREQ=WEEKLY;BYDAY=MO`). Fehlt, wenn nicht gesetzt. |
| `recurrence_end` | string | Enddatum der Wiederholung (`YYYY-MM-DD`). Fehlt, wenn nicht gesetzt. |
| `completed_dates` | string[] | Liste erledigter Instanzdaten (`YYYY-MM-DD`) bei wiederkehrenden Todos |
| `show_in_calendar` | boolean | `true`, wenn das Todo im Kalender angezeigt wird |
| `is_archived` | boolean | `true`, wenn das Todo archiviert ist |
| `parent_id` | string | ID des übergeordneten Todos bei Unteraufgaben (UUID). Fehlt, wenn nicht gesetzt. |
| `order` | number | Sortierposition innerhalb der Liste bzw. des Ordners |
| `created_at`, `updated_at` | string (RFC 3339) | Erstellt und zuletzt geändert |

> **Hinweis:** Todos werden in Echtzeit per SSE über `/api/v1/todos` mit der Web-UI synchronisiert. Änderungen über die REST-API erscheinen sofort in der Oberfläche und umgekehrt.

#### `GET /todos`

Benötigtes Recht: `todos:read` oder `todos:write`. Todos auflisten und filtern. Antwort ist eine JSON-Liste ohne Umschlag.

| Parameter | Beispiel | Beschreibung |
| --- | --- | --- |
| `date` | `2026-11-15` | Todos, deren `due_date` oder `scheduled_date` diesem Tag entspricht |
| `priority` oder `prio` | `high` | Nach Priorität filtern |
| `tag` | `work` | Todos, die genau diesen Tag tragen |
| `q`, `search` oder `description` | `deploy` | Teiltext in Titel oder Beschreibung, Groß- und Kleinschreibung egal |
| `overdue` | `true` | Nur überfällige, noch offene Todos. Nur `true` oder `1` schalten den Filter ein. |
| `status` | `in_progress` | Nach Status filtern |
| `completed` | `false` | `true` oder `1` für erledigte, jeder andere Wert für offene Todos |
| `folder` | `Security` | Nur Todos aus genau diesem Ordner |
| `include_archived` | `false` | Bei `false` werden archivierte Todos ausgeblendet; `true` (oder Weglassen) liefert auch archivierte Todos |
| `limit` | `50` | Standard 100, höchstens 500 |
| `offset` | `100` | Anzahl zu überspringender Todos zum Blättern |

Die Liste ist nach Fälligkeit aufsteigend sortiert, Todos ohne Fälligkeit stehen am Ende.

**Anfrage: offene Todos mit hoher Priorität**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/todos?priority=high&completed=false"
```

**Antwort 200**

```json
[
  {
    "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
    "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
    "title": "Sicherheitsbericht prüfen",
    "description": "Token-Hashing und Rechte kontrollieren",
    "status": "todo",
    "priority": "high",
    "due_date": "2026-11-25",
    "scheduled_date": "2026-11-24",
    "tags": ["security", "audit"],
    "color": "",
    "is_completed": false,
    "is_overdue": false,
    "folder": "Security",
    "linked_note_id": "3f2a1b4c-8d9e-4a1b-9c2d-1234567890ab",
    "recurrence": "weekly",
    "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
    "recurrence_end": "2026-12-31",
    "completed_dates": [],
    "show_in_calendar": true,
    "is_archived": false,
    "parent_id": "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ef",
    "order": 1,
    "created_at": "2026-11-11T12:00:00Z",
    "updated_at": "2026-11-11T12:00:00Z"
  }
]
```

#### `POST /todos`

Benötigtes Recht: `todos:create` oder `todos:write`. Ein Todo anlegen.

Pflicht ist nur `title`. Optional kann eine eigene UUID als `id` mitgegeben werden (sonst erzeugt der Server eine UUID; eine ungültige UUID führt zu `400` mit "Invalid todo ID"). Ebenfalls optional sind `description`, `status`, `priority`, `due_date`, `scheduled_date`, `tags`, `color`, `is_completed`, `folder`, `linked_note_id`, `recurrence`, `recurrence_rule`, `recurrence_end`, `completed_dates`, `show_in_calendar`, `is_archived`, `parent_id` und `order`. Ein fehlender `title` führt zu `400` mit "Title is required". Ist `is_completed` gesetzt oder `status` gleich `completed`, trägt der Server `completed_at` ein.

**Anfrage**

```bash
curl -X POST -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Sicherheitsbericht prüfen", "description": "Token-Hashing und Rechte kontrollieren", "priority": "high", "due_date": "2026-11-25", "scheduled_date": "2026-11-24", "tags": ["security", "audit"]}' \
  "https://hrw.rocks/api/v1/todos"
```

**Antwort 201**

```json
{
  "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
  "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
  "title": "Sicherheitsbericht prüfen",
  "description": "Token-Hashing und Rechte kontrollieren",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-11-25",
  "scheduled_date": "2026-11-24",
  "tags": ["security", "audit"],
  "color": "",
  "is_completed": false,
  "is_overdue": false,
  "folder": "Security",
  "linked_note_id": "3f2a1b4c-8d9e-4a1b-9c2d-1234567890ab",
  "recurrence": "weekly",
  "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
  "recurrence_end": "2026-12-31",
  "completed_dates": [],
  "show_in_calendar": true,
  "is_archived": false,
  "parent_id": "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ef",
  "order": 1,
  "created_at": "2026-11-11T12:00:00Z",
  "updated_at": "2026-11-11T12:00:00Z"
}
```

#### `GET /todos/{id}`

Benötigtes Recht: `todos:read` oder `todos:write`. Ein einzelnes Todo abrufen. Antwort `200` ist das Todo-Objekt, `404` wenn es nicht existiert.

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1"
```

#### `PATCH /todos/{id}`

Benötigtes Recht: `todos:edit` oder `todos:write`. Ein Todo ändern oder abhaken. `PUT` verhält sich identisch.

Es werden nur die gesendeten Felder geändert. Zu beachten:

- `is_completed: true` setzt `completed_at` auf die aktuelle Zeit und macht aus dem Status `todo` den Status `completed`.
- `is_completed: false` entfernt `completed_at` und setzt den Status `completed` zurück auf `todo`.
- `status: "completed"` markiert das Todo ebenfalls als erledigt.
- Ein leerer `title` führt zu `400` mit "Title cannot be empty".
- `tags` ersetzt die komplette Liste.

**Anfrage: als erledigt markieren**

```bash
curl -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_completed": true}' \
  "https://hrw.rocks/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1"
```

**Antwort 200**

```json
{
  "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
  "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
  "title": "Sicherheitsbericht prüfen",
  "description": "Token-Hashing und Rechte kontrollieren",
  "status": "completed",
  "priority": "high",
  "due_date": "2026-11-25",
  "scheduled_date": "2026-11-24",
  "tags": ["security", "audit"],
  "color": "",
  "is_completed": true,
  "completed_at": "2026-11-11T14:15:00Z",
  "is_overdue": false,
  "folder": "Security",
  "linked_note_id": "3f2a1b4c-8d9e-4a1b-9c2d-1234567890ab",
  "recurrence": "weekly",
  "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
  "recurrence_end": "2026-12-31",
  "completed_dates": ["2026-11-11"],
  "show_in_calendar": true,
  "is_archived": false,
  "parent_id": "a1b2c3d4-e5f6-4a7b-8c9d-0123456789ef",
  "order": 1,
  "created_at": "2026-11-11T12:00:00Z",
  "updated_at": "2026-11-11T14:15:00Z"
}
```

#### `DELETE /todos/{id}`

Benötigtes Recht: `todos:delete` oder `todos:write`. Ein Todo löschen. Antwort `204` ohne Body, `404` wenn es nicht existiert.

**Anfrage**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1"
```

## 7. Ordner

Ordner strukturieren Notizen und untergeordnete Ordner hierarchisch innerhalb eines Workspaces (`safe`). Tag-Gruppen werden intern getrennt und tauchen hier nicht auf.

### Felder

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | string (UUID) | Eindeutige Ordner-ID |
| `title` | string | Name des Ordners |
| `parent_id` | string \| null | ID des übergeordneten Ordners oder `null` auf oberster Ebene |
| `color` | string | Optionale Farbe (z. B. Hex-Wert `#3b82f6`) |
| `safe` | string | Zugehöriger Workspace-Name (Standard `main`) |
| `icon` | string | Optionaler Icon-Bezeichner |
| `version` | number | Fortlaufende Versionsnummer für Synchronisation |
| `created_at`, `updated_at` | string (RFC 3339) | Erstell- und letzter Änderungszeitpunkt |

#### `GET /external/folders`

Benötigtes Recht: `folders:read`. Aktive Ordner auflisten.

| Parameter | Beispiel | Beschreibung |
| --- | --- | --- |
| `parent_id` | `root` | Nach Elternordner filtern (`root` oder `null` für oberste Ebene) |
| `safe` | `main` | Auf einen Workspace filtern (Alias: `workspace`) |
| `search` | `projekt` | Teiltextsuche im Titel (Alias: `q`) |
| `limit` | `50` | Standard 100, höchstens 500 |

**Anfrage: Root-Ordner abrufen**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/folders?parent_id=root&safe=main&limit=50"
```

**Antwort 200**

```json
{
  "count": 1,
  "folders": [
    {
      "id": "f1a2b3c4-1111-4222-8333-444455556666",
      "title": "Projekte",
      "parent_id": null,
      "color": "#3b82f6",
      "safe": "main",
      "icon": "folder",
      "version": 1,
      "created_at": "2026-11-10T12:00:00Z",
      "updated_at": "2026-11-10T12:00:00Z"
    }
  ]
}
```

#### `GET /external/folders/{id}`

Benötigtes Recht: `folders:read`. Einen einzelnen Ordner anhand seiner ID abrufen.

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/folders/f1a2b3c4-1111-4222-8333-444455556666"
```

**Antwort 200**

```json
{
  "folder": {
    "id": "f1a2b3c4-1111-4222-8333-444455556666",
    "title": "Projekte",
    "parent_id": null,
    "color": "#3b82f6",
    "safe": "main",
    "icon": "folder",
    "version": 1,
    "created_at": "2026-11-10T12:00:00Z",
    "updated_at": "2026-11-10T12:00:00Z"
  }
}
```

#### `POST /external/folders`

Benötigtes Recht: `folders:write`. Neuen Ordner anlegen. Liefert `201 Created`.

**Anfrage**

```bash
curl -X POST -H "Authorization: Bearer tide_pat_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Projekte","color":"#3b82f6","safe":"main","icon":"folder"}' \
  "https://hrw.rocks/api/v1/external/folders"
```

#### `PATCH /external/folders/{id}`

Benötigtes Recht: `folders:write`. Ordner aktualisieren oder verschieben (auch als `PUT` verfügbar).

> **Hinweis:** Eingebauter **Zirkel-Schutz**: Ein Ordner kann weder sich selbst noch einen seiner Nachfahren als `parent_id` erhalten (`400`). Mit `parent_id: ""` wird der Ordner auf die Root-Ebene verschoben.

**Anfrage: Nach Root verschieben & umbenennen**

```bash
curl -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Archiv","parent_id":""}' \
  "https://hrw.rocks/api/v1/external/folders/f1a2b3c4-1111-4222-8333-444455556666"
```

#### `DELETE /external/folders/{id}`

Benötigtes Recht: `folders:write`. Ordner löschen. Standardmäßig Soft-Delete (Papierkorb); `?permanent=true` löscht endgültig.

**Anfrage: Endgültig löschen**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/folders/f1a2b3c4-1111-4222-8333-444455556666?permanent=true"
```

## 8. Tags

Tags sind bereichsübergreifende Kennzeichnungen mit Farbe und optionalem visuellen Effekt. Sie funktionieren einheitlich über **Notizen** (`tag_ids`), **Kalender-Termine** (`group_ids`) und **Todos** (`tags`).

Erlaubte Werte für `effect`: `none` (Standard), `stripes`, `waves`, `dots`, `chess`, `diamonds`, `gradient`, `bars`, `dimmed`.

#### `GET /external/tags`

Benötigtes Recht: `tags:read`. Alle aktiven Tags auflisten. Unterstützt `?search=` (oder `?q=`) und `?limit=` (Standard 100, max. 500).

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/tags?search=wichtig&limit=50"
```

**Antwort 200**

```json
{
  "count": 1,
  "tags": [
    {
      "id": "a9b8c7d6-2222-4333-8444-555566667777",
      "title": "Wichtig",
      "color": "#ef4444",
      "effect": "stripes"
    }
  ]
}
```

#### `GET /external/tags/{id}`

Benötigtes Recht: `tags:read`. Einen einzelnen Tag anhand seiner ID abrufen (`404`, wenn nicht vorhanden).

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/tags/a9b8c7d6-2222-4333-8444-555566667777"
```

#### `POST /external/tags`

Benötigtes Recht: `tags:write`. Neuen Tag erstellen. Liefert `201 Created` mit `{"tag": ...}`.

**Anfrage**

```bash
curl -X POST -H "Authorization: Bearer tide_pat_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Wichtig","color":"#ef4444","effect":"stripes"}' \
  "https://hrw.rocks/api/v1/external/tags"
```

#### `PATCH /external/tags/{id}`

Benötigtes Recht: `tags:write`. Titel, Farbe oder Effekt eines Tags ändern (auch als `PUT` verfügbar).

**Anfrage**

```bash
curl -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"color":"#f97316","effect":"waves"}' \
  "https://hrw.rocks/api/v1/external/tags/a9b8c7d6-2222-4333-8444-555566667777"
```

#### `DELETE /external/tags/{id}`

Benötigtes Recht: `tags:write`. Tag löschen.

**Anfrage**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/tags/a9b8c7d6-2222-4333-8444-555566667777"
```

## 9. Workspaces (Safes)

Workspaces (in der Oberfläche oft als Safes bezeichnet) trennen Notizen und Ordner thematisch. Alle Änderungen synchronisieren **live mit der Web-UI** über Echtzeit-Events.

> **Achtung:** Der Standard-Workspace `main` ist **geschützt**: Er existiert immer und kann weder umbenannt noch gelöscht werden.

#### `GET /external/workspaces`

Benötigtes Recht: `workspaces:read`. Alle Workspaces inkl. aktiver Auswahl und Dateianzahl abrufen.

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/workspaces"
```

**Antwort 200**

```json
{
  "count": 2,
  "workspaces": [
    { "name": "main", "is_default": true, "is_active": true, "file_count": 14 },
    { "name": "Studium", "is_default": false, "is_active": false, "file_count": 6 }
  ],
  "active_workspaces": ["main"]
}
```

#### `POST /external/workspaces`

Benötigtes Recht: `workspaces:write`. Neuen Workspace anlegen (optional direkt aktivieren mit `active: true`). Liefert `201 Created`.

**Anfrage**

```bash
curl -X POST -H "Authorization: Bearer tide_pat_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Uni","active":true}' \
  "https://hrw.rocks/api/v1/external/workspaces"
```

#### `PATCH /external/workspaces/{name}`

Benötigtes Recht: `workspaces:write`. Workspace umbenennen (`new_name`) oder Aktivierungsstatus (`active`) ändern (auch als `PUT`).

> **Hinweis:** Beim Umbenennen werden **alle zugehörigen Dateien und Ordner automatisch migriert** — die Anzahl geänderter Einträge steht in `files_updated`.

**Anfrage: Umbenennen mit Dateimigration**

```bash
curl -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"new_name":"Studium","active":true}' \
  "https://hrw.rocks/api/v1/external/workspaces/Uni"
```

#### `PUT /external/workspaces/active`

Benötigtes Recht: `workspaces:write`. Aktive Workspaces für die UI festlegen (`active_workspaces` als nicht-leeres Array).

**Anfrage**

```bash
curl -X PUT -H "Authorization: Bearer tide_pat_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"active_workspaces":["main","Studium"]}' \
  "https://hrw.rocks/api/v1/external/workspaces/active"
```

#### `DELETE /external/workspaces/{name}`

Benötigtes Recht: `workspaces:write`. Workspace löschen und enthaltene Dateien über `?move_files_to=` (Standard `main`) sicher verschieben.

**Anfrage**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/workspaces/Studium?move_files_to=main"
```

## 10. Einstellungen & Token-Info

Über `/external/me` lässt sich der aktuell verwendete Token samt Konto-Zuordnung prüfen. Über `/external/settings` können nicht-sensitive Benutzereinstellungen gelesen und partiell aktualisiert werden.

### Aktiven Token & Benutzer prüfen

#### `GET /external/me`

Benötigtes Recht: jeder gültige Token. Gibt Informationen zum angemeldeten Benutzer und zum verwendeten API-Token zurück.

Dieser Endpunkt erfordert keinen speziellen Scope — jeder gültige Bearer-Token ist berechtigt. Die Antwort enthält `user_id`, `username`, `token_id`, `scopes` sowie `expires_at`.

**Beispiel: Token-Info abrufen**

```bash
curl -sS "https://hrw.rocks/api/v1/external/me" \
  -H "Authorization: Bearer tide_pat_DEIN_TOKEN"
```

**Antwort (200 OK)**

```json
{
  "user_id": "usr_01J...",
  "username": "nico",
  "token_id": "tok_01J...",
  "scopes": ["notes:read", "settings:read", "settings:write"],
  "expires_at": "2027-01-01T00:00:00Z"
}
```

### Benutzereinstellungen lesen & aktualisieren

#### `GET /external/settings`

Benötigtes Recht: settings:read. Liefert die freigegebenen Benutzereinstellungen strukturiert nach Gruppen.

#### `PATCH /external/settings`

Benötigtes Recht: settings:write. Aktualisiert Einstellungen partiell. `PUT /external/settings` wird als Alias akzeptiert.

### Einstellungsgruppen & erlaubte Werte

| Gruppe | Felder & erlaubte Werte | Beschreibung |
| --- | --- | --- |
| `profile` | `language`: `en` \| `de` | Profilbezogene Grundeinstellungen wie die Oberflächensprache. |
| `appearance` | `theme`: `light` \| `dark` \| `system` | Darstellung und Farbschema der Anwendung. |
| `notes` | `note_layout`: `a4` \| `thin` \| `normal` \| `wide` \| `extra-wide` | Layout-Breite und Darstellungsoptionen für den Notiz-Editor. |
| `calendar` | `week_starts_on`: `0` \| `1`, `holiday_package`: `DE` \| `AT` \| `CH` \| `US` | Wochenbeginn (`0` = Sonntag, `1` = Montag) und Feiertagspaket. |
| `extensions` | Erweiterungs- und Integrations-Flags | Konfiguration aktivierter Erweiterungen. |
| `presence` | Status- und Sichtbarkeitsoptionen | Einstellungen für Präsenz- und Aktivitätsanzeigen. |

> **Achtung:** Sicherheitskritische Felder sind über die External-API strikt gesperrt: `pin`, `new_pin`, `email`, `phone`, `password`, `vault`, `encrypted_vault`, `private_key`, `master_key`, `api_tokens` und `whisper_token`. Jeder Zugriff bzw. Änderungsversuch auf diese Felder wird **immer** mit `403 Forbidden` abgelehnt — auch bei Tokens mit Wildcard-Scope `*`.

**Beispiel: Einstellungen abrufen & aktualisieren**

```bash
# Aktuelle Einstellungen lesen
curl -sS "https://hrw.rocks/api/v1/external/settings" \
  -H "Authorization: Bearer tide_pat_DEIN_TOKEN"

# Einzelne Felder partiell aktualisieren (PATCH oder PUT)
curl -sS -X PATCH "https://hrw.rocks/api/v1/external/settings" \
  -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appearance": { "theme": "dark" },
    "profile": { "language": "de" },
    "notes": { "note_layout": "wide" },
    "calendar": { "week_starts_on": 1, "holiday_package": "DE" }
  }'
```

**Antwort (200 OK)**

```json
{
  "profile": { "language": "de" },
  "appearance": { "theme": "dark" },
  "notes": { "note_layout": "wide" },
  "calendar": { "week_starts_on": 1, "holiday_package": "DE" },
  "extensions": {},
  "presence": {}
}
```

## 11. Fehlercodes

| Status | Bedeutung | Typische Ursache |
| --- | --- | --- |
| `200` | Erfolg | Abfrage oder Änderung erfolgreich, Antwort mit Inhalt |
| `201` | Erstellt | Notiz oder Todo wurde angelegt |
| `204` | Kein Inhalt | Todo gelöscht, Antwort ohne Body |
| `400` | Ungültige Anfrage | Ungültiges JSON, fehlender Titel beim Todo, ungültiges Datumsformat bei Terminen, Elternordner nicht gefunden, Inhalt einer verschlüsselten Notiz ändern |
| `401` | Nicht authentifiziert | Token fehlt, ist unbekannt oder abgelaufen |
| `403` | Recht fehlt | Dem Token fehlt das nötige Recht, oder die Notiz liegt außerhalb des Token-Bereichs |
| `404` | Nicht gefunden | Eintrag existiert nicht oder gehört nicht zu diesem Konto |
| `500` | Serverfehler | Unerwarteter Fehler beim Lesen oder Speichern |

### Fehlerformat

Fehler kommen als JSON mit den Feldern `error` (Statustext) und `message` (Beschreibung auf Englisch).

**400 Bad Request**

```json
{
  "error": "Bad Request",
  "message": "Title is required"
}
```

Bei `401` lauten die Meldungen "Missing API token", "Invalid API token" oder "API token has expired" (bei Todos zusätzlich "Missing or invalid API token").

### Fehlendes Recht (403)

Die Antwort nennt die Rechte des Tokens. Das Feld mit dem benötigten Recht heißt bei Notizen und Terminen `required_scope` (eine Zeichenkette), bei Todos `required_scopes` (eine Liste).

**403 bei Notizen oder Terminen**

```json
{
  "error": "Forbidden",
  "message": "Token lacks required scope 'notes:write'",
  "required_scope": "notes:write",
  "token_scopes": ["notes:read"]
}
```

**403 bei Todos**

```json
{
  "error": "Forbidden",
  "message": "Token lacks required scope",
  "required_scopes": ["todos:create", "todos:write"],
  "token_scopes": ["todos:read"]
}
```

> **Nicht verifiziert:** In seltenen Fehlerpfaden verwendet der Server-Code eine Klartext-Antwort statt JSON (zum Beispiel bei fehlender Nutzerzuordnung). Behandle einen Body, der kein JSON ist, deshalb nicht als Programmfehler.

## 12. Limits

| Angabe | Wert | Gilt für |
| --- | --- | --- |
| `limit` (Standard) | 100 | Notizen, Termine, Todos |
| `limit` (Höchstwert) | 500, größere Werte werden auf 500 gekürzt | Notizen, Termine, Todos |
| `offset` | nur bei Todos verfügbar | Todos |
| Gültigkeit eines Tokens | 30, 60, 90 Tage, 1 Jahr oder unbegrenzt (Auswahl in der App) | Tokens |
| Länge des Token-Namens | höchstens 100 Zeichen | Tokens |

Zu Rate-Limits (Anfragen pro Zeit) und zur Größe von Anfrage-Bodies sind **keine festen Limits dokumentiert**. Im Server-Code ist für diese Endpunkte kein Rate-Limit eingerichtet.

> **Nicht verifiziert:** Ob ein vorgeschalteter Proxy oder Hosting-Dienst eigene Grenzen setzt (zum Beispiel für Anfragehäufigkeit oder Body-Größe), ist nicht verifiziert. Sende Anfragen trotzdem in vernünftigem Takt und lies lieber mit `limit` und Filtern gezielt, statt alles wiederholt abzufragen.

## 13. Verschlüsselung

Notizen in Tide können Ende-zu-Ende-verschlüsselt (Zero-Knowledge) gespeichert sein. Ein API-Token ist kein Verschlüsselungsschlüssel und kann verschlüsselte Inhalte nicht entschlüsseln. Je nach Ressource und Verschlüsselungsstatus verhält sich die API unterschiedlich:

- **E2EE-geschützte Notizen:** Bleiben Zero-Knowledge-verschlüsselt. Die API liefert nur Metadaten (`id`, `title`, `parent_id`, Zeitstempel) und `"encrypted": true`, aber keinen `content`. Den Inhalt zu ändern geht nicht (`400`); Titel, Tags und Elternordner lassen sich anpassen.
- **Über die API erstellte oder unverschlüsselte Notizen:** Sie werden ohne E2EE mit `"encrypted": false` gespeichert, unterstützen vollständiges **Markdown** im `content`-Feld und setzen beim Speichern den **CRDT-Zustand live zurück**, sodass Änderungen sofort in der Web-UI erscheinen.
- **Todos:** Über die Web-UI und die API erstellte Todos werden im Klartext gespeichert und in Echtzeit zwischen API und Web-UI live synchronisiert.
- **Termine:** Über die Web-UI und die API erstellte Termine werden serverlesbar gespeichert und vollständig in Echtzeit zwischen API und Web-UI live synchronisiert.

> **Hinweis:** Änderungen an unverschlüsselten Notizen (inkl. CRDT-Live-Reset), Terminen, Todos, Ordnern, Tags, Workspaces und Einstellungen werden per Echtzeit-Event unmittelbar an verbundene Tide-Clients übertragen.
