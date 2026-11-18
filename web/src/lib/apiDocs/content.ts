import { API_BASE_URL as B, TOKEN_PLACEHOLDER as T } from './types';
import type { ApiDoc, DocSection } from './types';
import { notesSection } from './contentNotes';
import { todosSection } from './contentTodos';
import { eventsSection } from './contentEvents';

const overview: DocSection = {
  id: 'ueberblick',
  title: 'Überblick',
  blocks: [
    { kind: 'p', text: 'Die Tide-API ist eine REST-Schnittstelle mit JSON. Mit ihr lassen sich Notizen, Todos (Aufgaben) und Termine eines Tide-Kontos abfragen und teilweise ändern. Alle Routen liegen unter `/api/v1`.' },
    { kind: 'table', head: ['', 'Basis-URL'], rows: [['Produktion', `\`${B}\``]] },
    { kind: 'table', head: ['Ressource', 'Pfad (relativ zur Basis-URL)', 'Methoden'], rows: [
      ['Notizen', '`/external/notes`, `/external/notes/{id}`', 'GET, POST, PUT, PATCH, DELETE'],
      ['Todos', '`/todos`, `/todos/{id}` (Alias: `/external/todos`)', 'GET, POST, PUT, PATCH, DELETE'],
      ['Termine', '`/external/events`, `/external/events/{id}`', 'nur GET'],
    ] },
    { kind: 'h3', text: 'Konventionen' },
    { kind: 'list', items: [
      'Anfragen mit Body senden JSON und den Header `Content-Type: application/json`.',
      'Antworten sind JSON. IDs sind Zeichenketten (UUIDs). Zeitstempel wie `created_at` sind RFC 3339.',
      'Jede Anfrage braucht einen persönlichen Zugriffstoken (siehe Authentifizierung).',
      'Ein Token wirkt immer im Namen des Kontos, das ihn erstellt hat.',
    ] },
    { kind: 'h3', text: 'Kürzestes Beispiel' },
    { kind: 'code', lang: 'bash', label: 'Offene Todos abrufen', code: `curl -H "Authorization: Bearer ${T}" \\\n  "${B}/todos?completed=false"` },
    { kind: 'note', tone: 'info', text: 'Beispielwerte (IDs, Titel, Daten) sind ausgedacht. Pfade, Feldnamen, Statuscodes und Verhalten entsprechen dem Server-Code. Was sich daraus nicht belegen ließ, ist mit "Nicht verifiziert" markiert.' },
  ],
};

const auth: DocSection = {
  id: 'authentifizierung',
  title: 'Authentifizierung',
  blocks: [
    { kind: 'p', text: 'Die API nutzt **Personal Access Tokens**. Ein Mensch erstellt den Token in Tide und gibt ihn dem Skript oder dem KI-Assistenten.' },
    { kind: 'h3', text: 'Token erstellen' },
    { kind: 'list', items: [
      'In Tide die Einstellungen öffnen, Bereich **Zugriff**, neuen Token anlegen.',
      'Einen Namen vergeben und die benötigten Rechte wählen (siehe Rechte).',
      'Die Gültigkeit wählen: 30, 60 oder 90 Tage, 1 Jahr oder kein Ablauf.',
      'Den Token sofort kopieren. Er wird nur einmal angezeigt.',
    ] },
    { kind: 'p', text: 'Ein Token beginnt mit `tide_pat_` und hat danach 64 Hexadezimalzeichen. Der Server speichert nur einen SHA-256-Hash, der Klartext ist später nicht mehr abrufbar. In Tide lässt sich ein Token jederzeit widerrufen, externe Dienste verlieren dann sofort den Zugriff.' },
    { kind: 'h3', text: 'Token mitsenden' },
    { kind: 'p', text: 'Drei Wege werden akzeptiert. Der Server prüft sie in dieser Reihenfolge: `Authorization`-Header, `X-API-Key`-Header, Query-Parameter.' },
    { kind: 'code', lang: 'http', label: 'Empfohlen: Bearer-Header', code: `Authorization: Bearer ${T}` },
    { kind: 'code', lang: 'http', label: 'Alternative: X-API-Key', code: `X-API-Key: ${T}` },
    { kind: 'code', lang: 'http', label: 'Notlösung: Query-Parameter', code: `GET ${B}/todos?api_token=${T}` },
    { kind: 'note', tone: 'warn', text: 'Ein Token in der URL kann in Server- und Proxy-Logs landen. Nutze den Query-Parameter nur, wenn keine Header möglich sind, etwa bei Widgets oder Webhooks.' },
    { kind: 'p', text: 'Ein fehlender, unbekannter oder abgelaufener Token führt zu `401`, ein Token ohne passendes Recht zu `403` (siehe Fehlercodes).' },
  ],
};

const rights: DocSection = {
  id: 'rechte',
  title: 'Rechte',
  blocks: [
    { kind: 'p', text: 'Ein Token darf nur, was ihm beim Erstellen erlaubt wurde. Ein Endpunkt akzeptiert je nach Route eines von mehreren Rechten. Es genügt, wenn der Token mindestens eines davon trägt oder das Recht `*` hat.' },
    { kind: 'table', head: ['Recht (Klartext)', 'Technischer Name', 'Erlaubt'], rows: [
      ['Termine lesen', '`events:read`', '`GET /external/events`, `GET /external/events/{id}`'],
      ['Termine ändern', '`events:write`', 'Wird als Recht angenommen, aber es gibt derzeit keine schreibenden Termin-Endpunkte (vom Server als nicht umgesetzt gekennzeichnet).'],
      ['Notizen lesen', '`notes:read`', '`GET /external/notes`, `GET /external/notes/{id}`'],
      ['Notizen ändern', '`notes:write`', 'Notizen erstellen, ändern, löschen. Schließt Lesen ein.'],
      ['Aufgaben lesen', '`todos:read`', '`GET /todos`, `GET /todos/{id}`'],
      ['Aufgaben erstellen', '`todos:create`', '`POST /todos`'],
      ['Aufgaben bearbeiten', '`todos:edit`', '`PUT /todos/{id}`, `PATCH /todos/{id}` (inklusive Abhaken)'],
      ['Aufgaben löschen', '`todos:delete`', '`DELETE /todos/{id}`'],
      ['Aufgaben vollständig verwalten', '`todos:write`', 'Alle Todo-Endpunkte (lesen, erstellen, bearbeiten, löschen)'],
      ['Alles', '`*`', 'Voller Zugriff auf alle Endpunkte dieser Seite'],
      ['Große Uploads', '`storage:expand`', 'Betrifft das Upload-Limit der App, hat keinen Endpunkt in dieser Dokumentation.'],
    ] },
    { kind: 'note', tone: 'unverified', text: 'Der Server nimmt `*` beim Erstellen eines Tokens an. Ob die Tide-Oberfläche es zur Auswahl anbietet, ist nicht verifiziert (in der Rechte-Auswahl der App fehlt es laut Code).' },
    { kind: 'h3', text: 'Bereichs-Rechte für Notizen: safe und folder' },
    { kind: 'p', text: 'Ein Token kann zusätzlich auf einen Safe (`safe:<name>`, z. B. `safe:work`) oder einen Ordner (`folder:<id>`) beschränkt werden. Die Rechte werden kombiniert, zum Beispiel:' },
    { kind: 'code', lang: 'json', label: 'Rechte eines eingeschränkten Tokens', code: '["notes:read", "notes:write", "safe:work"]' },
    { kind: 'list', items: [
      'Gilt nur für Notizen. Für Todos und Termine haben `safe:` und `folder:` keine Wirkung, dort sind die jeweiligen Todo- und Termin-Rechte nötig.',
      'Notizen außerhalb des Bereichs fehlen in der Liste. Beim direkten Zugriff antwortet die API mit `403` und der Meldung "Note does not belong to scoped workspace or folder".',
      'Neue Notizen landen im Safe des Tokens, bei `folder:` im Ordner (ohne `parent_id` im ersten Ordner des Tokens). Ein Ordner-Token kann Notizen nicht in die Wurzel verschieben.',
      'Ein Ordner-Bereich umfasst nach dem Code den Ordner und seine Unterordner bis fünf Ebenen tief.',
    ] },
    { kind: 'note', tone: 'warn', text: 'Nach dem Server-Code besteht ein Token, das nur `safe:` oder `folder:` trägt, die Rechteprüfung aller Notiz-Endpunkte, auch der schreibenden. Gib solche Tokens nur weiter, wenn schreibender Zugriff auf den Bereich gewollt ist.' },
  ],
};

const errors: DocSection = {
  id: 'fehlercodes',
  title: 'Fehlercodes',
  blocks: [
    { kind: 'table', head: ['Status', 'Bedeutung', 'Typische Ursache'], rows: [
      ['`200`', 'Erfolg', 'Abfrage oder Änderung erfolgreich, Antwort mit Inhalt'],
      ['`201`', 'Erstellt', 'Notiz oder Todo wurde angelegt'],
      ['`204`', 'Kein Inhalt', 'Todo gelöscht, Antwort ohne Body'],
      ['`400`', 'Ungültige Anfrage', 'Ungültiges JSON, fehlender Titel beim Todo, ungültiges Datumsformat bei Terminen, Elternordner nicht gefunden, Inhalt einer verschlüsselten Notiz ändern'],
      ['`401`', 'Nicht authentifiziert', 'Token fehlt, ist unbekannt oder abgelaufen'],
      ['`403`', 'Recht fehlt', 'Dem Token fehlt das nötige Recht, oder die Notiz liegt außerhalb des Token-Bereichs'],
      ['`404`', 'Nicht gefunden', 'Eintrag existiert nicht oder gehört nicht zu diesem Konto'],
      ['`500`', 'Serverfehler', 'Unerwarteter Fehler beim Lesen oder Speichern'],
    ] },
    { kind: 'h3', text: 'Fehlerformat' },
    { kind: 'p', text: 'Fehler kommen als JSON mit den Feldern `error` (Statustext) und `message` (Beschreibung auf Englisch).' },
    { kind: 'code', lang: 'json', label: '400 Bad Request', code: '{\n  "error": "Bad Request",\n  "message": "Title is required"\n}' },
    { kind: 'p', text: 'Bei `401` lauten die Meldungen "Missing API token", "Invalid API token" oder "API token has expired" (bei Todos zusätzlich "Missing or invalid API token").' },
    { kind: 'h3', text: 'Fehlendes Recht (403)' },
    { kind: 'p', text: 'Die Antwort nennt die Rechte des Tokens. Das Feld mit dem benötigten Recht heißt bei Notizen und Terminen `required_scope` (eine Zeichenkette), bei Todos `required_scopes` (eine Liste).' },
    { kind: 'code', lang: 'json', label: '403 bei Notizen oder Terminen', code: '{\n  "error": "Forbidden",\n  "message": "Token lacks required scope \'notes:write\'",\n  "required_scope": "notes:write",\n  "token_scopes": ["notes:read"]\n}' },
    { kind: 'code', lang: 'json', label: '403 bei Todos', code: '{\n  "error": "Forbidden",\n  "message": "Token lacks required scope",\n  "required_scopes": ["todos:create", "todos:write"],\n  "token_scopes": ["todos:read"]\n}' },
    { kind: 'note', tone: 'unverified', text: 'In seltenen Fehlerpfaden verwendet der Server-Code eine Klartext-Antwort statt JSON (zum Beispiel bei fehlender Nutzerzuordnung). Behandle einen Body, der kein JSON ist, deshalb nicht als Programmfehler.' },
  ],
};

const limits: DocSection = {
  id: 'limits',
  title: 'Limits',
  blocks: [
    { kind: 'table', head: ['Angabe', 'Wert', 'Gilt für'], rows: [
      ['`limit` (Standard)', '100', 'Notizen, Termine, Todos'],
      ['`limit` (Höchstwert)', '500, größere Werte werden auf 500 gekürzt', 'Notizen, Termine, Todos'],
      ['`offset`', 'nur bei Todos verfügbar', 'Todos'],
      ['Gültigkeit eines Tokens', '30, 60, 90 Tage, 1 Jahr oder unbegrenzt (Auswahl in der App)', 'Tokens'],
      ['Länge des Token-Namens', 'höchstens 100 Zeichen', 'Tokens'],
    ] },
    { kind: 'p', text: 'Zu Rate-Limits (Anfragen pro Zeit) und zur Größe von Anfrage-Bodies sind **keine festen Limits dokumentiert**. Im Server-Code ist für diese Endpunkte kein Rate-Limit eingerichtet.' },
    { kind: 'note', tone: 'unverified', text: 'Ob ein vorgeschalteter Proxy oder Hosting-Dienst eigene Grenzen setzt (zum Beispiel für Anfragehäufigkeit oder Body-Größe), ist nicht verifiziert. Sende Anfragen trotzdem in vernünftigem Takt und lies lieber mit `limit` und Filtern gezielt, statt alles wiederholt abzufragen.' },
  ],
};

const e2ee: DocSection = {
  id: 'verschluesselung',
  title: 'Verschlüsselung',
  blocks: [
    { kind: 'p', text: 'Notizen in Tide sind Ende-zu-Ende-verschlüsselt, sofern sie nicht ausdrücklich als unverschlüsselt gespeichert sind. Ein API-Token ist kein Schlüssel und kann nichts entschlüsseln. Daraus ergibt sich, was die API bei Notizen kann.' },
    { kind: 'list', items: [
      '**Verschlüsselte Notizen:** Die API liefert nur Metadaten (`id`, `title`, `parent_id`, Zeitstempel) und `"encrypted": true`, aber keinen `content`. Den Inhalt zu ändern geht nicht (`400`). Titel und Elternordner lassen sich ändern.',
      '**Über die API erstellte Notizen:** Sie werden vom Server unverschlüsselt gespeichert und sind für ihn lesbar. Inhalte, die du per API sendest, sind also nicht Ende-zu-Ende-verschlüsselt. Solche Notizen liefern `"encrypted": false` samt `content`.',
      '**Todos:** Der Server speichert Titel und Beschreibung nach dem Code als normale Felder, die auch die API im Klartext liefert.',
      '**Termine:** Die API liest sie aus den Metadaten, die der Server lesen kann. Fehlt ein Titel, liefert sie "Untitled Event".',
    ] },
    { kind: 'note', tone: 'unverified', text: 'Nicht verifiziert: ob die Tide-App Todo- oder Termin-Inhalte vor dem Hochladen zusätzlich verschlüsselt und die API dann Platzhalter oder Chiffretext liefern könnte. Aus den Quellen dieser Seite ist dazu keine Aussage belegbar.' },
  ],
};

export const API_DOC: ApiDoc = {
  title: 'Tide API',
  lead: 'Öffentliche Referenz der HTTP-Schnittstelle für Notizen, Todos und Termine. Ohne Login lesbar und so formuliert, dass auch KI-Assistenten damit arbeiten können.',
  sections: [overview, auth, rights, notesSection, todosSection, eventsSection, errors, limits, e2ee],
};
