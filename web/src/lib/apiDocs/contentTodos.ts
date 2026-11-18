import { API_BASE_URL as B, TOKEN_PLACEHOLDER as T } from './types';
import type { DocSection } from './types';

const AUTH = `-H "Authorization: Bearer ${T}"`;
const ID = '7df4ba62-a567-4e78-9584-f7b58c743bc1';
const USER = '893d59a2-5b94-4dc4-8399-5ef6ee15c103';

const todoJson = (extra: { status: string; done: boolean; at?: string }) =>
  `{\n  "id": "${ID}",\n  "user_id": "${USER}",\n  "title": "Sicherheitsbericht prüfen",\n  "description": "Token-Hashing und Rechte kontrollieren",\n  "status": "${extra.status}",\n  "priority": "high",\n  "due_date": "2026-11-25",\n  "scheduled_date": "2026-11-24",\n  "tags": ["security", "audit"],\n  "color": "",\n  "is_completed": ${extra.done},\n${extra.at ? `  "completed_at": "${extra.at}",\n` : ''}  "is_overdue": false,\n  "created_at": "2026-11-11T12:00:00Z",\n  "updated_at": "${extra.at ?? '2026-11-11T12:00:00Z'}"\n}`;

export const todosSection: DocSection = {
  id: 'todos',
  title: 'Todos',
  blocks: [
    { kind: 'p', text: 'Todos sind Aufgaben mit Titel, Priorität, Fälligkeit und Tags. Sie gehören immer genau einem Konto. Unter `/external/todos` sind dieselben Endpunkte ein zweites Mal erreichbar.' },
    { kind: 'h3', text: 'Felder' },
    { kind: 'table', head: ['Feld', 'Typ', 'Beschreibung'], rows: [
      ['`id`, `user_id`', 'string', 'ID des Todos und des Besitzers'],
      ['`title`', 'string', 'Titel, Pflichtfeld beim Erstellen'],
      ['`description`', 'string', 'Beschreibung, leer wenn nicht gesetzt'],
      ['`status`', 'string', '`todo` (Standard), `in_progress` oder `completed`'],
      ['`priority`', 'string', '`low`, `medium` (Standard) oder `high`'],
      ['`due_date`', 'string', 'Fälligkeit, empfohlen `YYYY-MM-DD`. Leer wenn nicht gesetzt.'],
      ['`scheduled_date`', 'string', 'Geplantes Datum, empfohlen `YYYY-MM-DD`. Leer wenn nicht gesetzt.'],
      ['`tags`', 'string[]', 'Liste von Tags, leer wenn keine'],
      ['`color`', 'string', 'Farbangabe als Text, leer wenn nicht gesetzt'],
      ['`is_completed`', 'boolean', '`true`, wenn erledigt'],
      ['`completed_at`', 'string (RFC 3339)', 'Zeitpunkt der Erledigung. Fehlt, solange das Todo offen ist.'],
      ['`is_overdue`', 'boolean', 'Vom Server berechnet: offen und Fälligkeit liegt in der Vergangenheit'],
      ['`created_at`, `updated_at`', 'string (RFC 3339)', 'Erstellt und zuletzt geändert'],
    ] },
    { kind: 'note', tone: 'unverified', text: 'Der Server prüft `status` und `priority` nicht gegen eine feste Liste und akzeptiert auch andere Texte. Verwende die oben genannten Werte, nur sie haben eine definierte Bedeutung. Auch das Datumsformat wird nicht geprüft.' },

    { kind: 'endpoint', method: 'GET', path: '/todos', scope: '`todos:read` oder `todos:write`', summary: 'Todos auflisten und filtern. Antwort ist eine JSON-Liste ohne Umschlag.' },
    { kind: 'table', head: ['Parameter', 'Beispiel', 'Beschreibung'], rows: [
      ['`date`', '`2026-11-15`', 'Todos, deren `due_date` oder `scheduled_date` diesem Tag entspricht'],
      ['`priority` oder `prio`', '`high`', 'Nach Priorität filtern'],
      ['`tag`', '`work`', 'Todos, die genau diesen Tag tragen'],
      ['`q`, `search` oder `description`', '`deploy`', 'Teiltext in Titel oder Beschreibung, Groß- und Kleinschreibung egal'],
      ['`overdue`', '`true`', 'Nur überfällige, noch offene Todos. Nur `true` oder `1` schalten den Filter ein.'],
      ['`status`', '`in_progress`', 'Nach Status filtern'],
      ['`completed`', '`false`', '`true` oder `1` für erledigte, jeder andere Wert für offene Todos'],
      ['`limit`', '`50`', 'Standard 100, höchstens 500'],
      ['`offset`', '`100`', 'Anzahl zu überspringender Todos zum Blättern'],
    ] },
    { kind: 'p', text: 'Die Liste ist nach Fälligkeit aufsteigend sortiert, Todos ohne Fälligkeit stehen am Ende.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage: offene Todos mit hoher Priorität', code: `curl ${AUTH} \\\n  "${B}/todos?priority=high&completed=false"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `[\n${todoJson({ status: 'todo', done: false }).replace(/^/gm, '  ')}\n]` },

    { kind: 'endpoint', method: 'POST', path: '/todos', scope: '`todos:create` oder `todos:write`', summary: 'Ein Todo anlegen.' },
    { kind: 'p', text: 'Pflicht ist nur `title`. Optional sind `description`, `status`, `priority`, `due_date`, `scheduled_date`, `tags`, `color` und `is_completed`. Ein fehlender `title` führt zu `400` mit "Title is required". Ist `is_completed` gesetzt oder `status` gleich `completed`, trägt der Server `completed_at` ein.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X POST ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"title": "Sicherheitsbericht prüfen", "description": "Token-Hashing und Rechte kontrollieren", "priority": "high", "due_date": "2026-11-25", "scheduled_date": "2026-11-24", "tags": ["security", "audit"]}' \\\n  "${B}/todos"` },
    { kind: 'code', lang: 'json', label: 'Antwort 201', code: todoJson({ status: 'todo', done: false }) },

    { kind: 'endpoint', method: 'GET', path: '/todos/{id}', scope: '`todos:read` oder `todos:write`', summary: 'Ein einzelnes Todo abrufen. Antwort `200` ist das Todo-Objekt, `404` wenn es nicht existiert.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/todos/${ID}"` },

    { kind: 'endpoint', method: 'PATCH', path: '/todos/{id}', scope: '`todos:edit` oder `todos:write`', summary: 'Ein Todo ändern oder abhaken. `PUT` verhält sich identisch.' },
    { kind: 'p', text: 'Es werden nur die gesendeten Felder geändert. Zu beachten:' },
    { kind: 'list', items: [
      '`is_completed: true` setzt `completed_at` auf die aktuelle Zeit und macht aus dem Status `todo` den Status `completed`.',
      '`is_completed: false` entfernt `completed_at` und setzt den Status `completed` zurück auf `todo`.',
      '`status: "completed"` markiert das Todo ebenfalls als erledigt.',
      'Ein leerer `title` führt zu `400` mit "Title cannot be empty".',
      '`tags` ersetzt die komplette Liste.',
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage: als erledigt markieren', code: `curl -X PATCH ${AUTH} \\\n  -H "Content-Type: application/json" \\\n  -d '{"is_completed": true}' \\\n  "${B}/todos/${ID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: todoJson({ status: 'completed', done: true, at: '2026-11-11T14:15:00Z' }) },

    { kind: 'endpoint', method: 'DELETE', path: '/todos/{id}', scope: '`todos:delete` oder `todos:write`', summary: 'Ein Todo löschen. Antwort `204` ohne Body, `404` wenn es nicht existiert.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X DELETE ${AUTH} \\\n  "${B}/todos/${ID}"` },
  ],
};
