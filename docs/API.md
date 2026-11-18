<!-- Generated from web/src/lib/apiDocs (same source as the public page /docs/api).
     Do not edit by hand. Rewrite with: UPDATE_API_MD=1 npx vitest run apiDocsFile (in web/). -->

# Tide API

Öffentliche Referenz der HTTP-Schnittstelle für Notizen, Todos und Termine. Ohne Login lesbar und so formuliert, dass auch KI-Assistenten damit arbeiten können.

## Inhalt

1. Überblick
2. Authentifizierung
3. Rechte
4. Notizen
5. Todos
6. Termine
7. Fehlercodes
8. Limits
9. Verschlüsselung

## 1. Überblick

Die Tide-API ist eine REST-Schnittstelle mit JSON. Mit ihr lassen sich Notizen, Todos (Aufgaben) und Termine eines Tide-Kontos abfragen und teilweise ändern. Alle Routen liegen unter `/api/v1`.

|  | Basis-URL |
| --- | --- |
| Produktion | `https://hrw.rocks/api/v1` |

| Ressource | Pfad (relativ zur Basis-URL) | Methoden |
| --- | --- | --- |
| Notizen | `/external/notes`, `/external/notes/{id}` | GET, POST, PUT, PATCH, DELETE |
| Todos | `/todos`, `/todos/{id}` (Alias: `/external/todos`) | GET, POST, PUT, PATCH, DELETE |
| Termine | `/external/events`, `/external/events/{id}` | nur GET |

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

Ein Token darf nur, was ihm beim Erstellen erlaubt wurde. Ein Endpunkt akzeptiert je nach Route eines von mehreren Rechten. Es genügt, wenn der Token mindestens eines davon trägt oder das Recht `*` hat.

| Recht (Klartext) | Technischer Name | Erlaubt |
| --- | --- | --- |
| Termine lesen | `events:read` | `GET /external/events`, `GET /external/events/{id}` |
| Termine ändern | `events:write` | Wird als Recht angenommen, aber es gibt derzeit keine schreibenden Termin-Endpunkte (vom Server als nicht umgesetzt gekennzeichnet). |
| Notizen lesen | `notes:read` | `GET /external/notes`, `GET /external/notes/{id}` |
| Notizen ändern | `notes:write` | Notizen erstellen, ändern, löschen. Schließt Lesen ein. |
| Aufgaben lesen | `todos:read` | `GET /todos`, `GET /todos/{id}` |
| Aufgaben erstellen | `todos:create` | `POST /todos` |
| Aufgaben bearbeiten | `todos:edit` | `PUT /todos/{id}`, `PATCH /todos/{id}` (inklusive Abhaken) |
| Aufgaben löschen | `todos:delete` | `DELETE /todos/{id}` |
| Aufgaben vollständig verwalten | `todos:write` | Alle Todo-Endpunkte (lesen, erstellen, bearbeiten, löschen) |
| Alles | `*` | Voller Zugriff auf alle Endpunkte dieser Seite |
| Große Uploads | `storage:expand` | Betrifft das Upload-Limit der App, hat keinen Endpunkt in dieser Dokumentation. |

> **Nicht verifiziert:** Der Server nimmt `*` beim Erstellen eines Tokens an. Ob die Tide-Oberfläche es zur Auswahl anbietet, ist nicht verifiziert (in der Rechte-Auswahl der App fehlt es laut Code).

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

Notizen haben einen Titel, einen Inhalt (Markdown oder Text) und optional einen Elternordner. Abgefragt werden eigene Notizen und mit dir geteilte, angenommene Notizen.

### Felder

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | string | ID der Notiz |
| `title` | string | Titel der Notiz |
| `content` | string | Inhalt. Fehlt bei verschlüsselten Notizen und in der Liste. |
| `parent_id` | string oder null | ID des Elternordners, `null` ohne Elternordner |
| `encrypted` | boolean | `true`, wenn die Notiz Ende-zu-Ende-verschlüsselt ist (siehe Verschlüsselung) |
| `created_at`, `updated_at` | string (RFC 3339) | Erstellt und zuletzt geändert. Die Liste enthält nur `updated_at`. |
| `note` | object | Antworten zu einer einzelnen Notiz wiederholen die Felder zusätzlich unter `note`. |

#### `GET /external/notes`

Benötigtes Recht: `notes:read` oder `notes:write`. Notizen auflisten und nach Titel durchsuchen.

| Parameter | Typ | Beschreibung |
| --- | --- | --- |
| `q` oder `search` | string | Teil des Titels, Groß- und Kleinschreibung egal |
| `limit` | integer | Standard 100, höchstens 500 |

Die Liste ist nach `updated_at` absteigend sortiert und enthält nur `id`, `title`, `parent_id` und `updated_at`, keinen Inhalt. Den Inhalt liefert `GET /external/notes/{id}`.

**Anfrage**

```bash
curl -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/notes?q=woche&limit=10"
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
      "updated_at": "2026-11-05T14:32:00Z"
    }
  ]
}
```

#### `GET /external/notes/{id}`

Benötigtes Recht: `notes:read` oder `notes:write`. Eine Notiz mit Inhalt abrufen.

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
  "encrypted": false,
  "created_at": "2026-11-01T10:00:00Z",
  "updated_at": "2026-11-05T14:32:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Wochenplanung",
    "content": "## Montag\n- Review vorbereiten",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
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
  "encrypted": true,
  "message": "This note is end-to-end encrypted and cannot be decrypted without the user's private key",
  "parent_id": null,
  "created_at": "2026-11-01T10:00:00Z",
  "updated_at": "2026-11-05T14:32:00Z",
  "note": { "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", "title": "Tagebuch", "encrypted": true }
}
```

> **Hinweis:** Im Beispiel ist `note` bei der verschlüsselten Antwort gekürzt. Der Server wiederholt dort `message`, `parent_id`, `created_at` und `updated_at`.

#### `POST /external/notes`

Benötigtes Recht: `notes:write`. Eine neue Notiz anlegen.

| Feld im Body | Typ | Beschreibung |
| --- | --- | --- |
| `title` | string, optional | Ohne Angabe: "Untitled Note" |
| `content` | string, optional | Inhalt als Markdown oder Text |
| `parent_id` | string, optional | ID eines Ordners, in dem die Notiz liegen soll. Er muss existieren und schreibbar sein, sonst `400` oder `403`. |

**Anfrage**

```bash
curl -X POST -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Standup", "content": "## Agenda\n- API-Tokens", "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9"}' \
  "https://hrw.rocks/api/v1/external/notes"
```

**Antwort 201**

```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Standup",
  "content": "## Agenda\n- API-Tokens",
  "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
  "encrypted": false,
  "created_at": "2026-11-11T15:30:00Z",
  "updated_at": "2026-11-11T15:30:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Standup",
    "content": "## Agenda\n- API-Tokens",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "created_at": "2026-11-11T15:30:00Z",
    "updated_at": "2026-11-11T15:30:00Z"
  }
}
```

> **Achtung:** Per API erstellte Notizen werden unverschlüsselt gespeichert (siehe Verschlüsselung).

#### `PATCH /external/notes/{id}`

Benötigtes Recht: `notes:write`. Eine Notiz ändern. `PUT` verhält sich identisch.

Es werden nur die gesendeten Felder geändert, fehlende Felder bleiben unverändert. Erlaubt sind `title`, `content` und `parent_id`.

- `parent_id` als leere Zeichenkette `""` verschiebt die Notiz in die oberste Ebene. `null` oder ein weggelassenes Feld lässt den Elternordner unverändert.
- Den `content` einer verschlüsselten Notiz kann die API nicht ändern und antwortet mit `400` und `"encrypted": true`. Der Titel lässt sich ändern.

**Anfrage**

```bash
curl -X PATCH -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "## Agenda\n- API-Tokens\n- Release"}' \
  "https://hrw.rocks/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
```

Die Antwort `200` hat dieselbe Form wie beim Abrufen einer Notiz, mit dem neuen Stand.

#### `DELETE /external/notes/{id}`

Benötigtes Recht: `notes:write`. Eine Notiz löschen.

**Anfrage**

```bash
curl -X DELETE -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://hrw.rocks/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
```

**Antwort 200**

```json
{
  "success": true,
  "message": "Note deleted successfully",
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

> **Achtung:** Der Server löscht die Notiz endgültig aus seiner Datenbank. Im Server-Code dieses Pfads ist kein Papierkorb vorgesehen. Frage vor dem Löschen nach, wenn ein Mensch dahintersteht.

## 5. Todos

Todos sind Aufgaben mit Titel, Priorität, Fälligkeit und Tags. Sie gehören immer genau einem Konto. Unter `/external/todos` sind dieselben Endpunkte ein zweites Mal erreichbar.

### Felder

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id`, `user_id` | string | ID des Todos und des Besitzers |
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
| `created_at`, `updated_at` | string (RFC 3339) | Erstellt und zuletzt geändert |

> **Nicht verifiziert:** Der Server prüft `status` und `priority` nicht gegen eine feste Liste und akzeptiert auch andere Texte. Verwende die oben genannten Werte, nur sie haben eine definierte Bedeutung. Auch das Datumsformat wird nicht geprüft.

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
    "created_at": "2026-11-11T12:00:00Z",
    "updated_at": "2026-11-11T12:00:00Z"
  }
]
```

#### `POST /todos`

Benötigtes Recht: `todos:create` oder `todos:write`. Ein Todo anlegen.

Pflicht ist nur `title`. Optional sind `description`, `status`, `priority`, `due_date`, `scheduled_date`, `tags`, `color` und `is_completed`. Ein fehlender `title` führt zu `400` mit "Title is required". Ist `is_completed` gesetzt oder `status` gleich `completed`, trägt der Server `completed_at` ein.

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

## 6. Termine

Termine sind Kalendereinträge. Die API ist hier **nur lesend**: Es gibt keine Endpunkte zum Erstellen, Ändern oder Löschen. Abgefragt werden eigene und mit dir geteilte, angenommene Termine.

### Felder

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | string | ID des Termins |
| `title` | string | Titel. Fehlt er, liefert der Server "Untitled Event". |
| `start`, `end` | string | Beginn und Ende, so wie sie im Termin gespeichert sind (in der Regel ISO 8601) |
| `all_day` | boolean | `true` bei ganztägigen Terminen |
| `color`, `description`, `location` | string | Farbe, Beschreibung, Ort. Das Feld fehlt in der Antwort, wenn es leer ist. |
| `parent_id` | string | ID eines übergeordneten Ordners. Fehlt, wenn es keinen gibt. |
| `source` | string | `tide` für in Tide erstellte Termine, `gcal` für aus Google Kalender übernommene |
| `created_at`, `updated_at` | string (RFC 3339) | Erstellt und zuletzt geändert |

#### `GET /external/events`

Benötigtes Recht: `events:read`. Termine auflisten, aufsteigend nach Beginn sortiert.

| Parameter | Beispiel | Beschreibung |
| --- | --- | --- |
| `start` oder `from` | `2026-11-01` | Nur Termine, die nicht vor diesem Zeitpunkt enden |
| `end` oder `to` | `2026-11-30` | Nur Termine, die nicht nach diesem Zeitpunkt beginnen. Bei einem reinen Datum zählt der ganze Tag. |
| `q` oder `search` | `sprint` | Teiltext in Titel, Beschreibung oder Ort, Groß- und Kleinschreibung egal |
| `limit` | `50` | Standard 100, höchstens 500 |

`start` und `end` akzeptieren ein Datum (`2026-11-01`) oder einen Zeitpunkt nach RFC 3339 (`2026-11-01T00:00:00Z`). Andere Formate führen zu `400`.

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
      "start": "2026-11-16T10:00:00.000Z",
      "end": "2026-11-16T11:30:00.000Z",
      "all_day": false,
      "color": "#3b82f6",
      "description": "Backlog sichten",
      "location": "Raum A",
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
    "start": "2026-11-16T10:00:00.000Z",
    "end": "2026-11-16T11:30:00.000Z",
    "all_day": false,
    "color": "#3b82f6",
    "description": "Backlog sichten",
    "location": "Raum A",
    "source": "tide",
    "created_at": "2026-11-10T14:00:00Z",
    "updated_at": "2026-11-10T14:00:00Z"
  }
}
```

> **Nicht verifiziert:** Das Verhalten schreibender Methoden auf `/external/events` ist nicht dokumentiert, weil der Server dafür keine Handler hat. Die konkrete Fehlerantwort stammt vom Router, nicht aus dem Handler-Code, und ist nicht verifiziert.

## 7. Fehlercodes

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

## 8. Limits

| Angabe | Wert | Gilt für |
| --- | --- | --- |
| `limit` (Standard) | 100 | Notizen, Termine, Todos |
| `limit` (Höchstwert) | 500, größere Werte werden auf 500 gekürzt | Notizen, Termine, Todos |
| `offset` | nur bei Todos verfügbar | Todos |
| Gültigkeit eines Tokens | 30, 60, 90 Tage, 1 Jahr oder unbegrenzt (Auswahl in der App) | Tokens |
| Länge des Token-Namens | höchstens 100 Zeichen | Tokens |

Zu Rate-Limits (Anfragen pro Zeit) und zur Größe von Anfrage-Bodies sind **keine festen Limits dokumentiert**. Im Server-Code ist für diese Endpunkte kein Rate-Limit eingerichtet.

> **Nicht verifiziert:** Ob ein vorgeschalteter Proxy oder Hosting-Dienst eigene Grenzen setzt (zum Beispiel für Anfragehäufigkeit oder Body-Größe), ist nicht verifiziert. Sende Anfragen trotzdem in vernünftigem Takt und lies lieber mit `limit` und Filtern gezielt, statt alles wiederholt abzufragen.

## 9. Verschlüsselung

Notizen in Tide sind Ende-zu-Ende-verschlüsselt, sofern sie nicht ausdrücklich als unverschlüsselt gespeichert sind. Ein API-Token ist kein Schlüssel und kann nichts entschlüsseln. Daraus ergibt sich, was die API bei Notizen kann.

- **Verschlüsselte Notizen:** Die API liefert nur Metadaten (`id`, `title`, `parent_id`, Zeitstempel) und `"encrypted": true`, aber keinen `content`. Den Inhalt zu ändern geht nicht (`400`). Titel und Elternordner lassen sich ändern.
- **Über die API erstellte Notizen:** Sie werden vom Server unverschlüsselt gespeichert und sind für ihn lesbar. Inhalte, die du per API sendest, sind also nicht Ende-zu-Ende-verschlüsselt. Solche Notizen liefern `"encrypted": false` samt `content`.
- **Todos:** Der Server speichert Titel und Beschreibung nach dem Code als normale Felder, die auch die API im Klartext liefert.
- **Termine:** Die API liest sie aus den Metadaten, die der Server lesen kann. Fehlt ein Titel, liefert sie "Untitled Event".

> **Nicht verifiziert:** Nicht verifiziert: ob die Tide-App Todo- oder Termin-Inhalte vor dem Hochladen zusätzlich verschlüsselt und die API dann Platzhalter oder Chiffretext liefern könnte. Aus den Quellen dieser Seite ist dazu keine Aussage belegbar.
