import { API_BASE_URL as B, TOKEN_PLACEHOLDER as T } from './types';
import type { DocSection } from './types';

const AUTH = `-H "Authorization: Bearer ${T}"`;
const ID = 'e4b3c9a0-1234-4567-89ab-cdef01234567';

const eventJson = (indent: string) =>
  [
    '{',
    `  "id": "${ID}",`,
    '  "title": "Sprint Planning",',
    '  "start": "2026-11-16T10:00:00.000Z",',
    '  "end": "2026-11-16T11:30:00.000Z",',
    '  "all_day": false,',
    '  "color": "#3b82f6",',
    '  "description": "Backlog sichten",',
    '  "location": "Raum A",',
    '  "source": "tide",',
    '  "created_at": "2026-11-10T14:00:00Z",',
    '  "updated_at": "2026-11-10T14:00:00Z"',
    '}',
  ].map((l) => indent + l).join('\n');

export const eventsSection: DocSection = {
  id: 'termine',
  title: 'Termine',
  blocks: [
    { kind: 'p', text: 'Termine sind Kalendereinträge. Die API ist hier **nur lesend**: Es gibt keine Endpunkte zum Erstellen, Ändern oder Löschen. Abgefragt werden eigene und mit dir geteilte, angenommene Termine.' },
    { kind: 'h3', text: 'Felder' },
    { kind: 'table', head: ['Feld', 'Typ', 'Beschreibung'], rows: [
      ['`id`', 'string', 'ID des Termins'],
      ['`title`', 'string', 'Titel. Fehlt er, liefert der Server "Untitled Event".'],
      ['`start`, `end`', 'string', 'Beginn und Ende, so wie sie im Termin gespeichert sind (in der Regel ISO 8601)'],
      ['`all_day`', 'boolean', '`true` bei ganztägigen Terminen'],
      ['`color`, `description`, `location`', 'string', 'Farbe, Beschreibung, Ort. Das Feld fehlt in der Antwort, wenn es leer ist.'],
      ['`parent_id`', 'string', 'ID eines übergeordneten Ordners. Fehlt, wenn es keinen gibt.'],
      ['`source`', 'string', '`tide` für in Tide erstellte Termine, `gcal` für aus Google Kalender übernommene'],
      ['`created_at`, `updated_at`', 'string (RFC 3339)', 'Erstellt und zuletzt geändert'],
    ] },

    { kind: 'endpoint', method: 'GET', path: '/external/events', scope: '`events:read`', summary: 'Termine auflisten, aufsteigend nach Beginn sortiert.' },
    { kind: 'table', head: ['Parameter', 'Beispiel', 'Beschreibung'], rows: [
      ['`start` oder `from`', '`2026-11-01`', 'Nur Termine, die nicht vor diesem Zeitpunkt enden'],
      ['`end` oder `to`', '`2026-11-30`', 'Nur Termine, die nicht nach diesem Zeitpunkt beginnen. Bei einem reinen Datum zählt der ganze Tag.'],
      ['`q` oder `search`', '`sprint`', 'Teiltext in Titel, Beschreibung oder Ort, Groß- und Kleinschreibung egal'],
      ['`limit`', '`50`', 'Standard 100, höchstens 500'],
    ] },
    { kind: 'p', text: '`start` und `end` akzeptieren ein Datum (`2026-11-01`) oder einen Zeitpunkt nach RFC 3339 (`2026-11-01T00:00:00Z`). Andere Formate führen zu `400`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage: Termine im November', code: `curl ${AUTH} \\\n  "${B}/external/events?start=2026-11-01&end=2026-11-30&limit=50"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "count": 1,\n  "events": [\n${eventJson('    ')}\n  ]\n}` },

    { kind: 'endpoint', method: 'GET', path: '/external/events/{id}', scope: '`events:read`', summary: 'Einen einzelnen Termin abrufen. `404`, wenn er nicht existiert.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/events/${ID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "event": ${eventJson('  ').trimStart()}\n}` },
    { kind: 'note', tone: 'unverified', text: 'Das Verhalten schreibender Methoden auf `/external/events` ist nicht dokumentiert, weil der Server dafür keine Handler hat. Die konkrete Fehlerantwort stammt vom Router, nicht aus dem Handler-Code, und ist nicht verifiziert.' },
  ],
};
