import { API_BASE_URL as B, TOKEN_PLACEHOLDER as T } from './types';
import type { DocSection } from './types';

const AUTH = `-H "Authorization: Bearer ${T}"`;
const JSON_H = `-H "Content-Type: application/json"`;
const FID = 'f1a2b3c4-1111-4222-8333-444455556666';
const TID = 'a9b8c7d6-2222-4333-8444-555566667777';

const folderJson = (indent: string) =>
  [
    '{',
    `  "id": "${FID}",`,
    '  "title": "Projekte",',
    '  "parent_id": null,',
    '  "color": "#3b82f6",',
    '  "safe": "main",',
    '  "icon": "folder",',
    '  "version": 1,',
    '  "created_at": "2026-11-10T12:00:00Z",',
    '  "updated_at": "2026-11-10T12:00:00Z"',
    '}',
  ].map((l) => indent + l).join('\n');

export const foldersSection: DocSection = {
  id: 'ordner',
  title: 'Ordner',
  blocks: [
    { kind: 'p', text: 'Ordner strukturieren Notizen und untergeordnete Ordner hierarchisch innerhalb eines Workspaces (`safe`). Tag-Gruppen werden intern getrennt und tauchen hier nicht auf.' },
    { kind: 'h3', text: 'Felder' },
    { kind: 'table', head: ['Feld', 'Typ', 'Beschreibung'], rows: [
      ['`id`', 'string (UUID)', 'Eindeutige Ordner-ID'],
      ['`title`', 'string', 'Name des Ordners'],
      ['`parent_id`', 'string | null', 'ID des übergeordneten Ordners oder `null` auf oberster Ebene'],
      ['`color`', 'string', 'Optionale Farbe (z. B. Hex-Wert `#3b82f6`)'],
      ['`safe`', 'string', 'Zugehöriger Workspace-Name (Standard `main`)'],
      ['`icon`', 'string', 'Optionaler Icon-Bezeichner'],
      ['`version`', 'number', 'Fortlaufende Versionsnummer für Synchronisation'],
      ['`created_at`, `updated_at`', 'string (RFC 3339)', 'Erstell- und letzter Änderungszeitpunkt'],
    ] },

    { kind: 'endpoint', method: 'GET', path: '/external/folders', scope: '`folders:read`', summary: 'Aktive Ordner auflisten.' },
    { kind: 'table', head: ['Parameter', 'Beispiel', 'Beschreibung'], rows: [
      ['`parent_id`', '`root`', 'Nach Elternordner filtern (`root` oder `null` für oberste Ebene)'],
      ['`safe`', '`main`', 'Auf einen Workspace filtern (Alias: `workspace`)'],
      ['`search`', '`projekt`', 'Teiltextsuche im Titel (Alias: `q`)'],
      ['`limit`', '`50`', 'Standard 100, höchstens 500'],
    ] },
    { kind: 'code', lang: 'bash', label: 'Anfrage: Root-Ordner abrufen', code: `curl ${AUTH} \\\n  "${B}/external/folders?parent_id=root&safe=main&limit=50"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "count": 1,\n  "folders": [\n${folderJson('    ')}\n  ]\n}` },

    { kind: 'endpoint', method: 'GET', path: '/external/folders/{id}', scope: '`folders:read`', summary: 'Einen einzelnen Ordner anhand seiner ID abrufen.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/folders/${FID}"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "folder": ${folderJson('  ').trimStart()}\n}` },

    { kind: 'endpoint', method: 'POST', path: '/external/folders', scope: '`folders:write`', summary: 'Neuen Ordner anlegen. Liefert `201 Created`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X POST ${AUTH} ${JSON_H} \\\n  -d '{"title":"Projekte","color":"#3b82f6","safe":"main","icon":"folder"}' \\\n  "${B}/external/folders"` },

    { kind: 'endpoint', method: 'PATCH', path: '/external/folders/{id}', scope: '`folders:write`', summary: 'Ordner aktualisieren oder verschieben (auch als `PUT` verfügbar).' },
    { kind: 'note', tone: 'info', text: 'Eingebauter **Zirkel-Schutz**: Ein Ordner kann weder sich selbst noch einen seiner Nachfahren als `parent_id` erhalten (`400`). Mit `parent_id: ""` wird der Ordner auf die Root-Ebene verschoben.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage: Nach Root verschieben & umbenennen', code: `curl -X PATCH ${AUTH} ${JSON_H} \\\n  -d '{"title":"Archiv","parent_id":""}' \\\n  "${B}/external/folders/${FID}"` },

    { kind: 'endpoint', method: 'DELETE', path: '/external/folders/{id}', scope: '`folders:write`', summary: 'Ordner löschen. Standardmäßig Soft-Delete (Papierkorb); `?permanent=true` löscht endgültig.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage: Endgültig löschen', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/folders/${FID}?permanent=true"` },
  ],
};

export const tagsSection: DocSection = {
  id: 'tags',
  title: 'Tags',
  blocks: [
    { kind: 'p', text: 'Tags sind bereichsübergreifende Kennzeichnungen mit Farbe und optionalem visuellen Effekt. Sie funktionieren einheitlich über **Notizen** (`tag_ids`), **Kalender-Termine** (`group_ids`) und **Todos** (`tags`).' },
    { kind: 'p', text: 'Erlaubte Werte für `effect`: `none` (Standard), `stripes`, `waves`, `dots`, `chess`, `diamonds`, `gradient`, `bars`, `dimmed`.' },

    { kind: 'endpoint', method: 'GET', path: '/external/tags', scope: '`tags:read`', summary: 'Alle aktiven Tags auflisten. Unterstützt `?search=` (oder `?q=`) und `?limit=` (Standard 100, max. 500).' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/tags?search=wichtig&limit=50"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: `{\n  "count": 1,\n  "tags": [\n    {\n      "id": "${TID}",\n      "title": "Wichtig",\n      "color": "#ef4444",\n      "effect": "stripes"\n    }\n  ]\n}` },

    { kind: 'endpoint', method: 'GET', path: '/external/tags/{id}', scope: '`tags:read`', summary: 'Einen einzelnen Tag anhand seiner ID abrufen (`404`, wenn nicht vorhanden).' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/tags/${TID}"` },

    { kind: 'endpoint', method: 'POST', path: '/external/tags', scope: '`tags:write`', summary: 'Neuen Tag erstellen. Liefert `201 Created` mit `{"tag": ...}`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X POST ${AUTH} ${JSON_H} \\\n  -d '{"title":"Wichtig","color":"#ef4444","effect":"stripes"}' \\\n  "${B}/external/tags"` },

    { kind: 'endpoint', method: 'PATCH', path: '/external/tags/{id}', scope: '`tags:write`', summary: 'Titel, Farbe oder Effekt eines Tags ändern (auch als `PUT` verfügbar).' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X PATCH ${AUTH} ${JSON_H} \\\n  -d '{"color":"#f97316","effect":"waves"}' \\\n  "${B}/external/tags/${TID}"` },

    { kind: 'endpoint', method: 'DELETE', path: '/external/tags/{id}', scope: '`tags:write`', summary: 'Tag löschen.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/tags/${TID}"` },
  ],
};

export const workspacesSection: DocSection = {
  id: 'workspaces',
  title: 'Workspaces (Safes)',
  blocks: [
    { kind: 'p', text: 'Workspaces (in der Oberfläche oft als Safes bezeichnet) trennen Notizen und Ordner thematisch. Alle Änderungen synchronisieren **live mit der Web-UI** über Echtzeit-Events.' },
    { kind: 'note', tone: 'warn', text: 'Der Standard-Workspace `main` ist **geschützt**: Er existiert immer und kann weder umbenannt noch gelöscht werden.' },

    { kind: 'endpoint', method: 'GET', path: '/external/workspaces', scope: '`workspaces:read`', summary: 'Alle Workspaces inkl. aktiver Auswahl und Dateianzahl abrufen.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl ${AUTH} \\\n  "${B}/external/workspaces"` },
    { kind: 'code', lang: 'json', label: 'Antwort 200', code: '{\n  "count": 2,\n  "workspaces": [\n    { "name": "main", "is_default": true, "is_active": true, "file_count": 14 },\n    { "name": "Studium", "is_default": false, "is_active": false, "file_count": 6 }\n  ],\n  "active_workspaces": ["main"]\n}' },

    { kind: 'endpoint', method: 'POST', path: '/external/workspaces', scope: '`workspaces:write`', summary: 'Neuen Workspace anlegen (optional direkt aktivieren mit `active: true`). Liefert `201 Created`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X POST ${AUTH} ${JSON_H} \\\n  -d '{"name":"Uni","active":true}' \\\n  "${B}/external/workspaces"` },

    { kind: 'endpoint', method: 'PATCH', path: '/external/workspaces/{name}', scope: '`workspaces:write`', summary: 'Workspace umbenennen (`new_name`) oder Aktivierungsstatus (`active`) ändern (auch als `PUT`).' },
    { kind: 'note', tone: 'info', text: 'Beim Umbenennen werden **alle zugehörigen Dateien und Ordner automatisch migriert** — die Anzahl geänderter Einträge steht in `files_updated`.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage: Umbenennen mit Dateimigration', code: `curl -X PATCH ${AUTH} ${JSON_H} \\\n  -d '{"new_name":"Studium","active":true}' \\\n  "${B}/external/workspaces/Uni"` },

    { kind: 'endpoint', method: 'PUT', path: '/external/workspaces/active', scope: '`workspaces:write`', summary: 'Aktive Workspaces für die UI festlegen (`active_workspaces` als nicht-leeres Array).' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X PUT ${AUTH} ${JSON_H} \\\n  -d '{"active_workspaces":["main","Studium"]}' \\\n  "${B}/external/workspaces/active"` },

    { kind: 'endpoint', method: 'DELETE', path: '/external/workspaces/{name}', scope: '`workspaces:write`', summary: 'Workspace löschen und enthaltene Dateien über `?move_files_to=` (Standard `main`) sicher verschieben.' },
    { kind: 'code', lang: 'bash', label: 'Anfrage', code: `curl -X DELETE ${AUTH} \\\n  "${B}/external/workspaces/Studium?move_files_to=main"` },
  ],
};
