import { API_BASE_URL as B, TOKEN_PLACEHOLDER as T } from './types';
import type { DocSection } from './types';

const AUTH = `-H "Authorization: Bearer ${T}"`;
const ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const PARENT = '4a7f05b8-d227-440f-90db-2b6214a1c5d9';

export const notesSection: DocSection = {
  id: 'notizen',
  title: 'Notizen',
  blocks: [
    { kind: 'p', text: 'Notizen haben einen Titel, einen Inhalt (Markdown oder Text) und optional einen Elternordner. Abgefragt werden eigene Notizen und mit dir geteilte, angenommene Notizen.' },
    { kind: 'h3', text: 'Felder' },
    { kind: 'table', head: ['Feld', 'Typ', 'Beschreibung'], rows: [
      ['`id`', 'string', 'ID der Notiz'],
      ['`title`', 'string', 'Titel der Notiz'],
      ['`content`', 'string', 'Inhalt. Fehlt bei verschlüsselten Notizen und in der Liste.'],
      ['`parent_id`', 'string oder null', 'ID des Elternordners, `null` ohne Elternordner'],
      ['`encrypted`', 'boolean', '`true`, wenn die Notiz Ende-zu-Ende-verschlüsselt ist (siehe Verschlüsselung)'],
      ['`created_at`, `updated_at`', 'string (RFC 3339)', 'Erstellt und zuletzt geändert. Die Liste enthält nur `updated_at`.'],
      ['`note`', 'object', 'Antworten zu einer einzelnen Notiz wiederholen die Felder zusätzlich unter `note`.'],
    ] },

    { kind: 'endpoint', method: 'GET', path: '/external/notes', scope: '`notes:read` oder `notes:write`', summary: 'Notizen auflisten und nach Titel durchsuchen.' },
    { kind: 'table', head: ['Parameter', 'Typ', 'Beschreibung'], rows: [
      ['`q` oder `search`', 'string', 'Teil des Titels, Groß- und Kleinschreibung egal'],
      ['`limit`', 'integer', 'Standard 100, höchstens 500'],
    ] },
    { kind: 'p', text: 'Die Liste ist nach `updated_at` absteigend sortiert und enthält nur `id`, `title`, `parent_id` und `updated_at`, keinen Inhalt. Den Inhalt liefert `GET /external/notes/{id}`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/notes?q=woche&limit=10"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "count": 1,\n  "notes": [\n    {\n      "id": "${ID}",\n      "title": "Wochenplanung",\n      "parent_id": null,\n      "updated_at": "2026-11-05T14:32:00Z"\n    }\n  ]\n}` },

    { kind: 'endpoint', method: 'GET', path: '/external/notes/{id}', scope: '`notes:read` oder `notes:write`', summary: 'Eine Notiz mit Inhalt abrufen.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/notes/${ID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200 (unverschlüsselte Notiz)', code: `{\n  "id": "${ID}",\n  "title": "Wochenplanung",\n  "content": "## Montag\\n- Review vorbereiten",\n  "parent_id": "${PARENT}",\n  "encrypted": false,\n  "created_at": "2026-11-01T10:00:00Z",\n  "updated_at": "2026-11-05T14:32:00Z",\n  "note": {\n    "id": "${ID}",\n    "title": "Wochenplanung",\n    "content": "## Montag\\n- Review vorbereiten",\n    "parent_id": "${PARENT}",\n    "created_at": "2026-11-01T10:00:00Z",\n    "updated_at": "2026-11-05T14:32:00Z"\n  }\n}` },
    { kind: 'code', lang: 'json', label: 'Antwort 200 (verschlüsselte Notiz, ohne Inhalt)', code: `{\n  "id": "${ID}",\n  "title": "Tagebuch",\n  "encrypted": true,\n  "message": "This note is end-to-end encrypted and cannot be decrypted without the user's private key",\n  "parent_id": null,\n  "created_at": "2026-11-01T10:00:00Z",\n  "updated_at": "2026-11-05T14:32:00Z",\n  "note": { "id": "${ID}", "title": "Tagebuch", "encrypted": true }\n}` },
    { kind: 'note', tone: 'info', text: 'Im Beispiel ist `note` bei der verschlüsselten Antwort gekürzt. Der Server wiederholt dort `message`, `parent_id`, `created_at` und `updated_at`.' },

    { kind: 'endpoint', method: 'POST', path: '/external/notes', scope: '`notes:write`', summary: 'Eine neue Notiz anlegen.' },
    { kind: 'table', head: ['Feld im Body', 'Typ', 'Beschreibung'], rows: [
      ['`title`', 'string, optional', 'Ohne Angabe: "Untitled Note"'],
      ['`content`', 'string, optional', 'Inhalt als Markdown oder Text'],
      ['`parent_id`', 'string, optional', 'ID eines Ordners, in dem die Notiz liegen soll. Er muss existieren und schreibbar sein, sonst `400` oder `403`.'],
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X POST ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"title": "Standup", "content": "## Agenda\\n- API-Tokens", "parent_id": "${PARENT}"}' \\\n  "${B}/external/notes"` },
    { kind: 'code', lang: 'json', label: 'Antwort 201', code: `{\n  "id": "${ID}",\n  "title": "Standup",\n  "content": "## Agenda\\n- API-Tokens",\n  "parent_id": "${PARENT}",\n  "encrypted": false,\n  "created_at": "2026-11-11T15:30:00Z",\n  "updated_at": "2026-11-11T15:30:00Z",\n  "note": {\n    "id": "${ID}",\n    "title": "Standup",\n    "content": "## Agenda\\n- API-Tokens",\n    "parent_id": "${PARENT}",\n    "created_at": "2026-11-11T15:30:00Z",\n    "updated_at": "2026-11-11T15:30:00Z"\n  }\n}` },
    { kind: 'note', tone: 'warn', text: 'Per API erstellte Notizen werden unverschlüsselt gespeichert (siehe Verschlüsselung).' },

    { kind: 'endpoint', method: 'PATCH', path: '/external/notes/{id}', scope: '`notes:write`', summary: 'Eine Notiz ändern. `PUT` verhält sich identisch.' },
    { kind: 'p', text: 'Es werden nur die gesendeten Felder geändert, fehlende Felder bleiben unverändert. Erlaubt sind `title`, `content` und `parent_id`.' },
    { kind: 'list', items: [
      '`parent_id` als leere Zeichenkette `""` verschiebt die Notiz in die oberste Ebene. `null` oder ein weggelassenes Feld lässt den Elternordner unverändert.',
      'Den `content` einer verschlüsselten Notiz kann die API nicht ändern und antwortet mit `400` und `"encrypted": true`. Der Titel lässt sich ändern.',
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X PATCH ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"content": "## Agenda\\n- API-Tokens\\n- Release"}' \\\n  "${B}/external/notes/${ID}"` },
    { kind: 'p', text: 'Die Antwort `200` hat dieselbe Form wie beim Abrufen einer Notiz, mit dem neuen Stand.' },

    { kind: 'endpoint', method: 'DELETE', path: '/external/notes/{id}', scope: '`notes:write`', summary: 'Eine Notiz löschen.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/notes/${ID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "success": true,\n  "message": "Note deleted successfully",\n  "id": "${ID}"\n}` },
    { kind: 'note', tone: 'warn', text: 'Der Server löscht die Notiz endgültig aus seiner Datenbank. Im Server-Code dieses Pfads ist kein Papierkorb vorgesehen. Frage vor dem Löschen nach, wenn ein Mensch dahintersteht.' },
  ],
};
