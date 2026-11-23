import { API_BASE_URL as B, TOKEN_PLACEHOLDER as T } from './types';
import type { DocSection } from './types';

const AUTH = `-H "Authorization: Bearer ${T}"`;
const ID = 'e4b3c9a0-1234-4567-89ab-cdef01234567';
const PARENT = '4a7f05b8-d227-440f-90db-2b6214a1c5d9';

const eventJson = (indent: string) =>
  [
    '{',
    `  "id": "${ID}",`,
    '  "title": "Sprint Planning",',
    '  "start": "2026-11-16T10:00:00Z",',
    '  "end": "2026-11-16T11:30:00Z",',
    '  "all_day": false,',
    '  "color": "#3b82f6",',
    '  "description": "Backlog sichten",',
    '  "location": "Raum A",',
    `  "parent_id": "${PARENT}",`,
    `  "group_ids": ["${PARENT}"],`,
    '  "version": 2,',
    '  "source": "tide",',
    '  "created_at": "2026-11-10T14:00:00Z",',
    '  "updated_at": "2026-11-10T14:00:00Z"',
    '}',
  ].map((l) => indent + l).join('\n');

export const eventsSection: DocSection = {
  id: 'termine',
  title: 'Termine',
  blocks: [
    { kind: 'p', text: 'Termine sind Kalendereinträge (optional auch Aufgaben-Termine und Wiederholungen). Abgefragt werden eigene und mit dir geteilte, angenommene Termine. Mit dem Scope `events:write` lassen sie sich auch erstellen, ändern und löschen.' },
    { kind: 'h3', text: 'Felder' },
    { kind: 'table', head: ['Feld', 'Typ', 'Beschreibung'], rows: [
      ['`id`', 'string', 'ID des Termins'],
      ['`title`', 'string', 'Titel. Fehlt er in gespeicherten Daten, liefert der Server "Untitled Event".'],
      ['`start`, `end`', 'string', 'Beginn und Ende (in der Regel RFC 3339 / ISO 8601)'],
      ['`all_day`', 'boolean', '`true` bei ganztägigen Terminen'],
      ['`color`, `description`, `location`', 'string', 'Farbe, Beschreibung, Ort. Das Feld fehlt in der Antwort, wenn es leer ist.'],
      ['`parent_id`', 'string', 'ID eines übergeordneten Ordners oder Tags. Fehlt, wenn es keinen gibt.'],
      ['`group_ids`', 'string[]', 'IDs zugeordneter Gruppen/Ordner. Fehlt, wenn leer.'],
      ['`tags`', 'string[]', 'Tag-Namen aus den Metadaten. Fehlt, wenn leer.'],
      ['`recurrence_rule`, `recurrence_end`', 'string', 'Wiederholungsregel und Enddatum. Fehlen, wenn leer.'],
      ['`exdates`, `completed_dates`', 'string[]', 'Ausgeschlossene bzw. als erledigt markierte Seriendaten. Fehlen, wenn leer.'],
      ['`is_task`, `is_completed`, `is_cancelled`, `is_important`', 'boolean', 'Flags für Aufgaben-Termine, Erledigung, Absage und Wichtigkeit. Fehlen, wenn `false`.'],
      ['`effect`', 'string', 'Visueller Effekt des Termins. Fehlt, wenn leer.'],
      ['`version`', 'integer', 'Revisionsnummer des Termins (wird bei Updates hochgezählt). Fehlt, wenn `0`.'],
      ['`source`', 'string', '`tide` für in Tide erstellte Termine, `gcal` für aus Google Kalender übernommene'],
      ['`created_at`, `updated_at`', 'string (RFC 3339)', 'Erstellt und zuletzt geändert'],
    ] },

    { kind: 'endpoint', method: 'GET', path: '/external/events', scope: '`events:read`', summary: 'Termine auflisten, aufsteigend nach Beginn sortiert.' },
    { kind: 'table', head: ['Parameter', 'Beispiel', 'Beschreibung'], rows: [
      ['`start` oder `from`', '`2026-11-01`', 'Nur Termine, die nicht vor diesem Zeitpunkt enden'],
      ['`end` oder `to`', '`2026-11-30`', 'Nur Termine, die nicht nach diesem Zeitpunkt beginnen. Bei einem reinen Datum zählt der ganze Tag.'],
      ['`q` oder `search`', '`sprint`', 'Teiltext in Titel, Beschreibung oder Ort, Groß- und Kleinschreibung egal'],
      ['`group_id` oder `tag_id`', `\`${PARENT}\``, 'Nur Termine, deren `parent_id` oder `group_ids` diese ID enthält'],
      ['`parent_id`', `\`${PARENT}\``, 'Nur Termine mit genau dieser `parent_id`'],
      ['`limit`', '`50`', 'Standard 100, höchstens 500. Ungültige Werte (`<= 0` oder keine Ganzzahl) liefern `400`.'],
    ] },
    { kind: 'p', text: '`start` und `end` akzeptieren ein Datum (`2026-11-01`) oder einen Zeitpunkt nach RFC 3339 (`2026-11-01T00:00:00Z`). Andere Formate sowie ein ungültiges `limit` führen zu `400`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage: Termine im November', code: `curl ${AUTH} \\\n  "${B}/external/events?start=2026-11-01&end=2026-11-30&limit=50"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "count": 1,\n  "events": [\n${eventJson('    ')}\n  ]\n}` },

    { kind: 'endpoint', method: 'GET', path: '/external/events/{id}', scope: '`events:read`', summary: 'Einen einzelnen Termin abrufen. `404`, wenn er nicht existiert.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/events/${ID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "event": ${eventJson('  ').trimStart()}\n}` },

    { kind: 'endpoint', method: 'POST', path: '/external/events', scope: '`events:write`', summary: 'Einen neuen Termin anlegen.' },
    { kind: 'table', head: ['Feld im Body', 'Typ', 'Beschreibung'], rows: [
      ['`title`', 'string, Pflicht', 'Titel des Termins (darf nicht leer sein, sonst `400`)'],
      ['`start`', 'string, Pflicht', 'Beginn als RFC 3339, `YYYY-MM-DDTHH:MM:SS` oder `YYYY-MM-DD` (wird nach RFC 3339 normalisiert)'],
      ['`end`', 'string, optional', 'Ende (`>= start`, sonst `400`). Fehlt es, setzt der Server `+1 Stunde` (bei `all_day: true`: `23:59:59` desselben Tages).'],
      ['`all_day`', 'boolean, optional', '`true` für ganztägigen Termin (Standard `false`)'],
      ['`color`, `description`, `location`, `effect`', 'string, optional', 'Farbe, Beschreibung, Ort oder visueller Effekt'],
      ['`parent_id`', 'string, optional', 'ID eines Ordners/Tags (`""` oder `"__none__"` wird ignoriert). Muss existieren und schreibbar sein (`400`/`403`).'],
      ['`group_ids`, `tag_ids`', 'string[], optional', 'Zugeordnete Gruppen-/Tag-IDs (`tag_ids` als Fallback). Setzt `parent_id` auf das erste Element, wenn `parent_id` fehlt (und umgekehrt).'],
      ['`recurrence_rule`, `recurrence_end`', 'string, optional', 'Wiederholungsregel und Enddatum'],
      ['`exdates`, `completed_dates`', 'string[], optional', 'Ausgeschlossene bzw. als erledigt markierte Seriendaten'],
      ['`is_task`, `is_completed`, `is_cancelled`, `is_important`', 'boolean, optional', 'Flags für Aufgaben-Termin, Erledigung, Absage und Wichtigkeit'],
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X POST ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"title": "Sprint Planning", "start": "2026-11-16T10:00:00Z", "end": "2026-11-16T11:30:00Z", "color": "#3b82f6", "description": "Backlog sichten", "location": "Raum A", "parent_id": "${PARENT}"}' \\\n  "${B}/external/events"` },
    { kind: 'code', lang: 'json', label: 'Antwort 201', code: `{\n  "event": ${eventJson('  ').trimStart()}\n}` },
    { kind: 'note', tone: 'warn', text: 'Per API erstellte oder geänderte Termine werden unverschlüsselt gespeichert (`unencrypted: true`).' },

    { kind: 'endpoint', method: 'PATCH', path: '/external/events/{id}', scope: '`events:write`', summary: 'Einen Termin ändern. `PUT` verhält sich identisch.' },
    { kind: 'p', text: 'Es werden nur die gesendeten Felder geändert, fehlende Felder bleiben unverändert. `title` darf nicht leer sein (`400`), `end` muss `>= start` bleiben (`400`).' },
    { kind: 'table', head: ['Feld im Body', 'Typ', 'Beschreibung'], rows: [
      ['`title`', 'string, optional', 'Neuer Titel (nicht leer)'],
      ['`start`, `end`', 'string, optional', 'Neuer Beginn bzw. neues Ende (`end >= start`)'],
      ['`all_day`', 'boolean, optional', 'Ganztägig ein- oder ausschalten'],
      ['`color`, `description`, `location`, `effect`', 'string, optional', 'Farbe, Beschreibung, Ort oder visueller Effekt'],
      ['`parent_id`', 'string, optional', 'Neuer Elternordner. `"__none__"` (oder `""`) entfernt `parent_id` und leert `group_ids`, sofern `group_ids`/`tag_ids` nicht mitgesendet werden.'],
      ['`group_ids`, `tag_ids`', 'string[], optional', 'Gruppen-/Tag-IDs ersetzen (`tag_ids` als Fallback). Eine leere Liste `[]` ohne `parent_id` entfernt auch `parent_id`.'],
      ['`recurrence_rule`, `recurrence_end`', 'string, optional', 'Wiederholungsregel und Enddatum'],
      ['`exdates`, `completed_dates`', 'string[], optional', 'Ausnahmen und erledigte Seriendaten ersetzen'],
      ['`is_task`, `is_completed`, `is_cancelled`, `is_important`', 'boolean, optional', 'Aufgaben- und Status-Flags'],
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage: Termin aktualisieren und parent_id entfernen', code: `curl -X PATCH ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"location": "Raum B", "parent_id": "__none__", "is_important": true}' \\\n  "${B}/external/events/${ID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "event": {\n    "id": "${ID}",\n    "title": "Sprint Planning",\n    "start": "2026-11-16T10:00:00Z",\n    "end": "2026-11-16T11:30:00Z",\n    "all_day": false,\n    "color": "#3b82f6",\n    "description": "Backlog sichten",\n    "location": "Raum B",\n    "is_important": true,\n    "version": 3,\n    "source": "tide",\n    "created_at": "2026-11-10T14:00:00Z",\n    "updated_at": "2026-11-12T09:15:00Z"\n  }\n}` },

    { kind: 'endpoint', method: 'DELETE', path: '/external/events/{id}', scope: '`events:write`', summary: 'Einen Termin löschen (standardmäßig Soft-Delete).' },
    { kind: 'table', head: ['Parameter', 'Typ', 'Beschreibung'], rows: [
      ['`permanent`', 'boolean (Query)', 'Bei `permanent=true` wird der Termin endgültig aus der Datenbank gelöscht (erfordert Eigentümer- oder Admin-Recht, sonst `403`). Ohne Angabe erfolgt ein Soft-Delete (`deleted_at`, erfordert Schreibrecht).'],
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage (Soft-Delete)', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/events/${ID}"` },
    { kind: 'code', lang: 'bash', label: 'Anfrage (Endgültig löschen)', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/events/${ID}?permanent=true"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "success": true,\n  "message": "Event deleted successfully",\n  "id": "${ID}"\n}` },
  ],
};
