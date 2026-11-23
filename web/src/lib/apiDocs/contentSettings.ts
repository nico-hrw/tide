import { API_BASE_URL, TOKEN_PLACEHOLDER, type DocSection } from './types';

export const settingsSection: DocSection = {
  id: 'einstellungen',
  title: 'Einstellungen & Token-Info',
  blocks: [
    {
      kind: 'p',
      text: 'Über `/external/me` lässt sich der aktuell verwendete Token samt Konto-Zuordnung prüfen. Über `/external/settings` können nicht-sensitive Benutzereinstellungen gelesen und partiell aktualisiert werden.',
    },
    {
      kind: 'h3',
      text: 'Aktiven Token & Benutzer prüfen',
    },
    {
      kind: 'endpoint',
      method: 'GET',
      path: '/external/me',
      scope: 'jeder gültige Token',
      summary: 'Gibt Informationen zum angemeldeten Benutzer und zum verwendeten API-Token zurück.',
    },
    {
      kind: 'p',
      text: 'Dieser Endpunkt erfordert keinen speziellen Scope — jeder gültige Bearer-Token ist berechtigt. Die Antwort enthält `user_id`, `username`, `token_id`, `scopes` sowie `expires_at`.',
    },
    {
      kind: 'code',
      lang: 'bash',
      label: 'Beispiel: Token-Info abrufen',
      code: `curl -sS "${API_BASE_URL}/external/me" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`,
    },
    {
      kind: 'code',
      lang: 'json',
      label: 'Antwort (200 OK)',
      code: `{
  "user_id": "usr_01J...",
  "username": "nico",
  "token_id": "tok_01J...",
  "scopes": ["notes:read", "settings:read", "settings:write"],
  "expires_at": "2027-01-01T00:00:00Z"
}`,
    },
    {
      kind: 'h3',
      text: 'Benutzereinstellungen lesen & aktualisieren',
    },
    {
      kind: 'endpoint',
      method: 'GET',
      path: '/external/settings',
      scope: 'settings:read',
      summary: 'Liefert die freigegebenen Benutzereinstellungen strukturiert nach Gruppen.',
    },
    {
      kind: 'endpoint',
      method: 'PATCH',
      path: '/external/settings',
      scope: 'settings:write',
      summary: 'Aktualisiert Einstellungen partiell. `PUT /external/settings` wird als Alias akzeptiert.',
    },
    {
      kind: 'h3',
      text: 'Einstellungsgruppen & erlaubte Werte',
    },
    {
      kind: 'table',
      head: ['Gruppe', 'Felder & erlaubte Werte', 'Beschreibung'],
      rows: [
        [
          '`profile`',
          '`language`: `en` | `de`',
          'Profilbezogene Grundeinstellungen wie die Oberflächensprache.',
        ],
        [
          '`appearance`',
          '`theme`: `light` | `dark` | `system`',
          'Darstellung und Farbschema der Anwendung.',
        ],
        [
          '`notes`',
          '`note_layout`: `a4` | `thin` | `normal` | `wide` | `extra-wide`',
          'Layout-Breite und Darstellungsoptionen für den Notiz-Editor.',
        ],
        [
          '`calendar`',
          '`week_starts_on`: `0` | `1`, `holiday_package`: `DE` | `AT` | `CH` | `US`',
          'Wochenbeginn (`0` = Sonntag, `1` = Montag) und Feiertagspaket.',
        ],
        [
          '`extensions`',
          'Erweiterungs- und Integrations-Flags',
          'Konfiguration aktivierter Erweiterungen.',
        ],
        [
          '`presence`',
          'Status- und Sichtbarkeitsoptionen',
          'Einstellungen für Präsenz- und Aktivitätsanzeigen.',
        ],
      ],
    },
    {
      kind: 'note',
      tone: 'warn',
      text: 'Sicherheitskritische Felder sind über die External-API strikt gesperrt: `pin`, `new_pin`, `email`, `phone`, `password`, `vault`, `encrypted_vault`, `private_key`, `master_key`, `api_tokens` und `whisper_token`. Jeder Zugriff bzw. Änderungsversuch auf diese Felder wird **immer** mit `403 Forbidden` abgelehnt — auch bei Tokens mit Wildcard-Scope `*`.',
    },
    {
      kind: 'code',
      lang: 'bash',
      label: 'Beispiel: Einstellungen abrufen & aktualisieren',
      code: `# Aktuelle Einstellungen lesen
curl -sS "${API_BASE_URL}/external/settings" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}"

# Einzelne Felder partiell aktualisieren (PATCH oder PUT)
curl -sS -X PATCH "${API_BASE_URL}/external/settings" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appearance": { "theme": "dark" },
    "profile": { "language": "de" },
    "notes": { "note_layout": "wide" },
    "calendar": { "week_starts_on": 1, "holiday_package": "DE" }
  }'`,
    },
    {
      kind: 'code',
      lang: 'json',
      label: 'Antwort (200 OK)',
      code: `{
  "profile": { "language": "de" },
  "appearance": { "theme": "dark" },
  "notes": { "note_layout": "wide" },
  "calendar": { "week_starts_on": 1, "holiday_package": "DE" },
  "extensions": {},
  "presence": {}
}`,
    },
  ],
};
