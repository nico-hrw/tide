import { API_BASE_URL as B, TOKEN_PLACEHOLDER as T } from './types';
import type { DocSection } from './types';

const AUTH = `-H "Authorization: Bearer ${T}"`;
const ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const PARENT = '4a7f05b8-d227-440f-90db-2b6214a1c5d9';

export const notesSection: DocSection = {
  id: 'notizen',
  title: 'Notizen',
  blocks: [
    { kind: 'p', text: 'Notizen haben einen Titel, einen Inhalt (Markdown oder Text) sowie optionale Metadaten wie Elternordner, Workspace (`safe`), Tags, Icon und Farbe. Abgefragt werden eigene Notizen und mit dir geteilte, angenommene Notizen.' },
    { kind: 'h3', text: 'Felder' },
    { kind: 'table', head: ['Feld', 'Typ', 'Beschreibung'], rows: [
      ['`id`', 'string', 'ID der Notiz'],
      ['`title`', 'string', 'Titel der Notiz'],
      ['`content`', 'string', 'Inhalt (Markdown oder Text). Bei verschlüsselten Notizen leer und in der Liste nicht enthalten.'],
      ['`parent_id`', 'string oder null', 'ID des Elternordners, `null` ohne Elternordner'],
      ['`safe`', 'string, optional', 'Zugehöriger Workspace/Safe (z. B. `"main"`, `"work"`)'],
      ['`linked_safes`', 'string[], optional', 'Zusätzliche verknüpfte Workspaces/Safes'],
      ['`tag_ids`', 'string[], optional', 'Liste der zugewiesenen Tag-IDs'],
      ['`icon`', 'string, optional', 'Icon-Bezeichner oder Emoji der Notiz'],
      ['`color`', 'string, optional', 'Farbwert oder Farb-Token der Notiz'],
      ['`version`', 'integer, optional', 'Versionszähler der Notiz (beginnt bei `2`, steigt bei jeder Änderung)'],
      ['`encrypted`', 'boolean', '`true`, wenn die Notiz Ende-zu-Ende-verschlüsselt ist (siehe Verschlüsselung)'],
      ['`created_at`, `updated_at`', 'string (RFC 3339)', 'Erstellt und zuletzt geändert. Die Liste enthält nur `updated_at`.'],
      ['`note`', 'object', 'Antworten zu einer einzelnen Notiz wiederholen die Felder zusätzlich unter `note`.'],
    ] },

    { kind: 'endpoint', method: 'GET', path: '/external/notes', scope: '`notes:read` oder `notes:write`', summary: 'Notizen auflisten und nach Titel, Ordner, Workspace oder Tag filtern.' },
    { kind: 'table', head: ['Parameter', 'Typ', 'Beschreibung'], rows: [
      ['`search` oder `q`', 'string', 'Teil des Titels, Groß- und Kleinschreibung egal'],
      ['`parent_id`', 'string', 'Ordner-UUID oder `root` für Notizen auf oberster Ebene ohne Elternordner'],
      ['`safe` oder `workspace`', 'string', 'Filtert auf einen bestimmten Workspace/Safe (z. B. `main`, `work`)'],
      ['`tag_id`', 'string', 'Filtert auf Notizen mit dieser Tag-ID in `tag_ids`'],
      ['`limit`', 'integer', 'Standard `100`, höchstens `500` (positive Ganzzahl)'],
    ] },
    { kind: 'p', text: 'Die Liste ist nach `updated_at` absteigend sortiert und enthält keinen `content` (nur Metadaten wie `id`, `title`, `parent_id`, `safe`, `linked_safes`, `tag_ids`, `icon`, `color`, `version`, `encrypted` und `updated_at`). Den Inhalt liefert `GET /external/notes/{id}`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/notes?search=woche&safe=work&parent_id=root&limit=10"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "count": 1,\n  "notes": [\n    {\n      "id": "${ID}",\n      "title": "Wochenplanung",\n      "parent_id": null,\n      "safe": "work",\n      "tag_ids": ["tag-planung"],\n      "icon": "calendar",\n      "color": "#3b82f6",\n      "encrypted": false,\n      "version": 3,\n      "updated_at": "2026-11-05T14:32:00Z"\n    }\n  ]\n}` },

    { kind: 'endpoint', method: 'GET', path: '/external/notes/{id}', scope: '`notes:read` oder `notes:write`', summary: 'Eine Notiz mit Inhalt und allen Metadaten abrufen.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/notes/${ID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200 (unverschlüsselte Notiz)', code: `{\n  "id": "${ID}",\n  "title": "Wochenplanung",\n  "content": "## Montag\\n- Review vorbereiten",\n  "parent_id": "${PARENT}",\n  "safe": "work",\n  "linked_safes": ["main"],\n  "tag_ids": ["tag-planung"],\n  "icon": "calendar",\n  "color": "#3b82f6",\n  "version": 3,\n  "encrypted": false,\n  "created_at": "2026-11-01T10:00:00Z",\n  "updated_at": "2026-11-05T14:32:00Z",\n  "note": {\n    "id": "${ID}",\n    "title": "Wochenplanung",\n    "content": "## Montag\\n- Review vorbereiten",\n    "parent_id": "${PARENT}",\n    "safe": "work",\n    "linked_safes": ["main"],\n    "tag_ids": ["tag-planung"],\n    "icon": "calendar",\n    "color": "#3b82f6",\n    "encrypted": false,\n    "version": 3,\n    "created_at": "2026-11-01T10:00:00Z",\n    "updated_at": "2026-11-05T14:32:00Z"\n  }\n}` },
    { kind: 'code', lang: 'json', label: 'Antwort 200 (verschlüsselte Notiz, ohne Inhalt)', code: `{\n  "id": "${ID}",\n  "title": "Tagebuch",\n  "content": "",\n  "parent_id": null,\n  "safe": "main",\n  "linked_safes": null,\n  "tag_ids": null,\n  "icon": "",\n  "color": "",\n  "version": 2,\n  "encrypted": true,\n  "message": "This note is end-to-end encrypted and cannot be decrypted without the user's private key",\n  "created_at": "2026-11-01T10:00:00Z",\n  "updated_at": "2026-11-05T14:32:00Z",\n  "note": {\n    "id": "${ID}",\n    "title": "Tagebuch",\n    "content": "",\n    "parent_id": null,\n    "safe": "main",\n    "encrypted": true,\n    "version": 2,\n    "created_at": "2026-11-01T10:00:00Z",\n    "updated_at": "2026-11-05T14:32:00Z"\n  }\n}` },

    { kind: 'endpoint', method: 'POST', path: '/external/notes', scope: '`notes:write`', summary: 'Eine neue Notiz anlegen.' },
    { kind: 'table', head: ['Feld im Body', 'Typ', 'Beschreibung'], rows: [
      ['`title`', 'string, optional', 'Ohne Angabe: `"Untitled Note"`'],
      ['`content`', 'string, optional', 'Inhalt als Markdown oder Text'],
      ['`parent_id`', 'string, optional', 'ID eines Ordners, in dem die Notiz liegen soll. Er muss existieren und schreibbar sein, sonst `400` oder `403`.'],
      ['`safe` oder `workspace`', 'string, optional', 'Ziel-Workspace/Safe (Standard: Safe des Elternordners, sonst Token-Scope bzw. `"main"`). Muss zum Token-Scope passen, sonst `403`.'],
      ['`linked_safes`', 'string[], optional', 'Zusätzliche verknüpfte Workspaces/Safes'],
      ['`tag_ids`', 'string[], optional', 'Liste zuzuweisender Tag-IDs'],
      ['`icon`', 'string, optional', 'Icon-Bezeichner oder Emoji'],
      ['`color`', 'string, optional', 'Farbwert oder Farb-Token'],
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X POST ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"title": "Standup", "content": "## Agenda\\n- API-Tokens", "parent_id": "${PARENT}", "safe": "work", "linked_safes": ["main"], "tag_ids": ["tag-meeting"], "icon": "notebook", "color": "#10b981"}' \\\n  "${B}/external/notes"` },
    { kind: 'code', lang: 'json', label: 'Antwort 201', code: `{\n  "id": "${ID}",\n  "title": "Standup",\n  "content": "## Agenda\\n- API-Tokens",\n  "parent_id": "${PARENT}",\n  "safe": "work",\n  "linked_safes": ["main"],\n  "tag_ids": ["tag-meeting"],\n  "icon": "notebook",\n  "color": "#10b981",\n  "version": 2,\n  "encrypted": false,\n  "created_at": "2026-11-11T15:30:00Z",\n  "updated_at": "2026-11-11T15:30:00Z",\n  "note": {\n    "id": "${ID}",\n    "title": "Standup",\n    "content": "## Agenda\\n- API-Tokens",\n    "parent_id": "${PARENT}",\n    "safe": "work",\n    "linked_safes": ["main"],\n    "tag_ids": ["tag-meeting"],\n    "icon": "notebook",\n    "color": "#10b981",\n    "encrypted": false,\n    "version": 2,\n    "created_at": "2026-11-11T15:30:00Z",\n    "updated_at": "2026-11-11T15:30:00Z"\n  }\n}` },
    { kind: 'note', tone: 'warn', text: 'Per API erstellte Notizen werden unverschlüsselt gespeichert (siehe Verschlüsselung).' },

    { kind: 'endpoint', method: 'PATCH', path: '/external/notes/{id}', scope: '`notes:write`', summary: 'Eine Notiz ändern oder Text anhängen. `PUT` verhält sich identisch.' },
    { kind: 'p', text: 'Es werden nur die gesendeten Felder geändert, fehlende Felder bleiben unverändert.' },
    { kind: 'table', head: ['Feld im Body', 'Typ', 'Beschreibung'], rows: [
      ['`title`', 'string, optional', 'Neuer Titel der Notiz (leer wird zu `"Untitled Note"`)'],
      ['`content`', 'string, optional', 'Ersetzt den gesamten Inhalt (Markdown oder Text)'],
      ['`append_content`', 'string, optional', 'Hängt Text an den bestehenden Inhalt an, ohne ihn zu überschreiben (fügt bei Bedarf vorab `\\n` ein).'],
      ['`parent_id`', 'string, optional', 'Zielordner-UUID; `""` verschiebt die Notiz auf die oberste Ebene (`null`/weggelassen lässt den Ordner unverändert).'],
      ['`safe` oder `workspace`', 'string, optional', 'Neuer Workspace/Safe. Beim Verschieben in einen Ordner wird ohne explizites `safe` dessen Safe übernommen.'],
      ['`linked_safes`', 'string[], optional', 'Ersetzt die Liste verknüpfter Workspaces/Safes'],
      ['`tag_ids`', 'string[], optional', 'Ersetzt die Liste der zugewiesenen Tag-IDs'],
      ['`icon`', 'string, optional', 'Setzt oder leert das Icon'],
      ['`color`', 'string, optional', 'Setzt oder leert die Farbe'],
    ] },
    { kind: 'list', items: [
      'Den `content` einer verschlüsselten Notiz kann die API weder mit `content` noch mit `append_content` ändern und antwortet mit `400` und `"encrypted": true`. Metadaten wie `title`, `tag_ids`, `icon` oder `color` lassen sich weiterhin ändern.',
      'Jedes Update erhöht `version` und liefert unter `200` dieselbe Antwortstruktur wie `GET /external/notes/{id}` mit dem neuen Stand.',
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage (Text anhängen und Tags aktualisieren)', code: `curl -X PATCH ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"append_content": "- Release prüfen", "tag_ids": ["tag-meeting", "tag-release"]}' \\\n  "${B}/external/notes/${ID}"` },
    { kind: 'note', tone: 'info', text: 'Schreibzugriffe über die externe API (`POST` und `PATCH`/`PUT`) setzen bei Inhaltsänderungen automatisch den CRDT-Zustand (Yjs-Snapshots/Updates) zurück und senden ein Live-Update an geöffnete Notizen in der Web-UI — inklusive vollständiger Markdown-Formatierung.' },

    { kind: 'endpoint', method: 'DELETE', path: '/external/notes/{id}', scope: '`notes:write`', summary: 'Eine Notiz in den Papierkorb verschieben oder endgültig löschen.' },
    { kind: 'table', head: ['Parameter', 'Typ', 'Beschreibung'], rows: [
      ['`permanent`', 'boolean, optional', 'Ohne Angabe (oder nicht `true`) verschiebt der Server die Notiz per Soft-Delete in den Papierkorb. Mit `?permanent=true` wird sie endgültig aus Datenbank und Blob-Speicher gelöscht.'],
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage (Soft-Delete in den Papierkorb)', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/notes/${ID}"` },
    { kind: 'code', lang: 'bash', label: 'Anfrage (endgültig löschen)', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/notes/${ID}?permanent=true"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "success": true,\n  "message": "Note deleted successfully",\n  "id": "${ID}"\n}` },
    { kind: 'note', tone: 'warn', text: 'Standardmäßig landet die Notiz im Papierkorb (Soft-Delete) und ist über die API nicht mehr abrufbar. Mit `?permanent=true` wird sie unwiderruflich gelöscht — frage vor dem endgültigen Löschen nach, wenn ein Mensch dahintersteht.' },
  ],
};
