# Tide Externe API & Token-Verwaltung

Diese Dokumentation beschreibt die Nutzung des **Tide API-Moduls** zur Abfrage und Integration von Terminen und Notizen durch externe Dienste, Skripte und Drittanbieter-Anwendungen (z. B. Home Assistant, Kalender-Widgets, Backup-Tools oder eigene Skripte).

---

## Inhaltsverzeichnis
1. [Übersicht & Konzept](#1-übersicht--konzept)
2. [Token-Erstellung in der Benutzeroberfläche](#2-token-erstellung-in-der-benutzeroberfläche)
3. [Rechte & Scopes](#3-rechte--scopes)
4. [Authentifizierung bei API-Anfragen](#4-authentifizierung-bei-api-anfragen)
5. [Endpunkte-Referenz](#5-endpunkte-referenz)
   - [Termine abfragen (`GET /api/v1/external/events`)](#get-apiv1externalevents)
   - [Einzelnen Termin abrufen (`GET /api/v1/external/events/{id}`)](#get-apiv1externaleventsid)
   - [Notizen abfragen (`GET /api/v1/external/notes`)](#get-apiv1externalnotes)
6. [Code-Beispiele](#6-code-beispiele)
   - [cURL](#curl)
   - [Python](#python)
   - [JavaScript / TypeScript / Node.js](#javascript--typescript--nodejs)
   - [Home Assistant (REST Sensor)](#home-assistant-rest-sensor)
7. [Fehlerbehandlung & Status-Codes](#7-fehlerbehandlung--status-codes)
8. [Sicherheitsarchitektur](#8-sicherheitsarchitektur)

---

## 1. Übersicht & Konzept

Das API-Modul ermöglicht es externen Anwendungen, über sichere **Personal Access Tokens (PAT)** auf Benutzerdaten zuzugreifen, ohne Passwörter oder Anmelde-Codes weitergeben zu müssen.

- **Token-Präfix**: Jeder Token beginnt mit `tide_pat_` gefolgt von einem kryptografisch sicheren Zufallswert.
- **Sicherheitsmodell**: Plaintext-Tokens werden niemals auf dem Server gespeichert; die Datenbank speichert ausschließlich einen unidirektionalen **SHA-256-Hash**.
- **Scope-basiertes Rechtesystem**: Bei der Erstellung wird festgelegt, auf welche Module der Token zugreifen darf.
- **Aktueller Funktionsumfang**: Die Abfrage von Kalenderterminen (`events:read`) ist vollständig implementiert. Weitere Scopes (`events:write`, `notes:read`, `notes:write`) sind bereits im Modell und der Benutzeroberfläche konfigurierbar und für kommende Versionen vorbereitet.

---

## 2. Token-Erstellung in der Benutzeroberfläche

1. Öffne Tide und klicke auf das **Einstellungen**-Symbol (Zahnrad).
2. Wechsle in den Tab **Zugriff** (bzw. **Access**).
3. Klicke auf **Neuen Token erstellen**.
4. Gib einen aussagekräftigen Namen ein (z. B. `Home Assistant Wohnzimmer`, `Kalender-Sync Skript`).
5. Wähle die gewünschten **Berechtigungen (Scopes)** aus:
   - Mindestens `events:read` (Termine abfragen) auswählen.
6. Lege die **Gültigkeitsdauer** fest:
   - `30 Tage`, `60 Tage`, `90 Tage`, `1 Jahr` oder `Kein Ablauf (Nie)`.
7. Klicke auf **Token erstellen**.
8. **Wichtig:** Kopiere den angezeigten Token sofort mit dem Kopieren-Button. Aus Sicherheitsgründen wird er dir danach nie wieder im Klartext angezeigt.

---

## 3. Rechte & Scopes

Bei der Token-Erstellung stehen folgende Scopes zur Verfügung:

| Scope | Modul | Status | Beschreibung |
|-------|-------|--------|--------------|
| `events:read` | Kalender | **Aktiv** | Erlaubt das Abfragen und Filtern von Kalenderterminen. |
| `events:write` | Kalender | *Vorbereitet* | Erlaubt das Erstellen, Ändern und Löschen von Terminen. |
| `notes:read` | Notizen | *Vorbereitet* | Erlaubt das Auslesen von Notizen über die API. |
| `notes:write` | Notizen | *Vorbereitet* | Erlaubt das Erstellen und Bearbeiten von Notizen. |

Wird ein Endpunkt mit einem Token aufgerufen, dem der entsprechende Scope fehlt, antwortet der Server mit `403 Forbidden`.

---

## 4. Authentifizierung bei API-Anfragen

Jede Anfrage an die externe API muss den Token über einen der folgenden Header übermitteln:

### Methode 1: HTTP Authorization Header (Empfohlen)
```http
Authorization: Bearer tide_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Methode 2: X-API-Key Header
```http
X-API-Key: tide_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Methode 3: URL-Query-Parameter (z. B. für Webhooks oder einfache GET-Links)
```http
https://go-tide.app/api/v1/external/events?api_token=tide_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 5. Endpunkte-Referenz

Basis-URL: `https://<deine-tide-domain>/api/v1/external` (lokal z. B. `http://localhost:8080/api/v1/external`)

---

### `GET /api/v1/external/events`

Gibt eine Liste aller Termine des Nutzers zurück, sortiert nach Startzeitpunkt aufsteigend.

#### Berechtigung
- Erfordert Scope: `events:read`

#### URL-Query-Parameter

| Parameter | Typ | Beschreibung | Beispiel |
|-----------|-----|--------------|----------|
| `start` / `from` | String (ISO 8601) | Filtert Termine, die an oder nach diesem Datum enden. | `2026-10-01` oder `2026-10-01T00:00:00Z` |
| `end` / `to` | String (ISO 8601) | Filtert Termine, die vor oder an diesem Datum beginnen. | `2026-10-31` oder `2026-10-31T23:59:59Z` |
| `q` / `search` | String | Volltext-Suche in Titel, Beschreibung und Ort (Groß-/Kleinschreibung egal). | `Zahnarzt` oder `Meeting` |
| `limit` | Integer | Maximale Anzahl zurückgegebener Termine (Default: `100`, Maximum: `500`). | `25` |

#### Beispiel-Anfrage
```bash
curl -H "Authorization: Bearer tide_pat_your_token_here" \
  "https://go-tide.app/api/v1/external/events?start=2026-10-13&end=2026-10-20&limit=10"
```

#### Beispiel-Antwort (`200 OK`)
```json
{
  "count": 2,
  "events": [
    {
      "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
      "title": "Team Standup",
      "start": "2026-10-13T09:00:00.000Z",
      "end": "2026-10-13T09:30:00.000Z",
      "all_day": false,
      "color": "#3b82f6",
      "description": "Täglicher Statusabgleich via Video-Call",
      "location": "Online / Zoom",
      "parent_id": null,
      "source": "tide",
      "created_at": "2026-10-10T14:22:01Z",
      "updated_at": "2026-10-12T08:15:30Z"
    },
    {
      "id": "f5a2b1c8-9876-4321-ba98-fedcba987654",
      "title": "Zahnarzttermin",
      "start": "2026-10-15T14:00:00.000Z",
      "end": "2026-10-15T15:00:00.000Z",
      "all_day": false,
      "color": "#ef4444",
      "description": "Kontrolle & Prophylaxe",
      "location": "Dr. Muster, Hauptstraße 12",
      "parent_id": null,
      "source": "tide",
      "created_at": "2026-10-01T10:00:00Z",
      "updated_at": "2026-10-01T10:00:00Z"
    }
  ]
}
```

---

### `GET /api/v1/external/events/{id}`

Gibt die Detailinformationen zu einem einzelnen Termin zurück.

#### Berechtigung
- Erfordert Scope: `events:read`

#### Beispiel-Anfrage
```bash
curl -H "Authorization: Bearer tide_pat_your_token_here" \
  "https://go-tide.app/api/v1/external/events/e4b3c9a0-1234-4567-89ab-cdef01234567"
```

#### Beispiel-Antwort (`200 OK`)
```json
{
  "event": {
    "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
    "title": "Team Standup",
    "start": "2026-10-13T09:00:00.000Z",
    "end": "2026-10-13T09:30:00.000Z",
    "all_day": false,
    "color": "#3b82f6",
    "description": "Täglicher Statusabgleich via Video-Call",
    "location": "Online / Zoom",
    "parent_id": null,
    "source": "tide",
    "created_at": "2026-10-10T14:22:01Z",
    "updated_at": "2026-10-12T08:15:30Z"
  }
}
```

---

### `GET /api/v1/external/notes`

*(Vorbereitet für zukünftige Updates)*

#### Berechtigung
- Erfordert Scope: `notes:read`

#### Antwort (`501 Not Implemented`)
```json
{
  "error": "Not Implemented",
  "message": "Notes querying via external API is planned and will be available in an upcoming update.",
  "required_scope": "notes:read"
}
```

---

## 6. Code-Beispiele

### cURL

```bash
# 1. Alle Termine für heute abfragen
TODAY=$(date +%Y-%m-%d)
curl -s -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://go-tide.app/api/v1/external/events?start=${TODAY}&end=${TODAY}" | jq .

# 2. Termine nach Stichwort durchsuchen
curl -s -H "Authorization: Bearer tide_pat_DEIN_TOKEN" \
  "https://go-tide.app/api/v1/external/events?q=Projekt" | jq .
```

---

### Python

```python
import os
import requests
from datetime import datetime, timedelta

API_URL = "https://go-tide.app/api/v1/external/events"
TOKEN = os.getenv("TIDE_API_TOKEN", "tide_pat_DEIN_TOKEN")

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}

# Termine der nächsten 7 Tage abfragen
now = datetime.utcnow()
next_week = now + timedelta(days=7)

params = {
    "start": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "end": next_week.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "limit": 50
}

response = requests.get(API_URL, headers=headers, params=params)

if response.status_code == 200:
    data = response.json()
    print(f"Gefundene Termine: {data['count']}")
    for ev in data.get("events", []):
        all_day_badge = "[Ganztägig] " if ev.get("all_day") else ""
        print(f"• {all_day_badge}{ev['title']} ({ev['start']} - {ev['end']})")
        if ev.get("location"):
            print(f"  Ort: {ev['location']}")
else:
    print(f"Fehler {response.status_code}: {response.text}")
```

---

### JavaScript / TypeScript / Node.js

```typescript
const TIDE_BASE_URL = 'https://go-tide.app/api/v1/external';
const API_TOKEN = process.env.TIDE_API_TOKEN || 'tide_pat_DEIN_TOKEN';

interface TideEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    all_day: boolean;
    color?: string;
    description?: string;
    location?: string;
}

interface EventsResponse {
    count: number;
    events: TideEvent[];
}

async function fetchUpcomingEvents(): Promise<TideEvent[]> {
    const today = new Date().toISOString().split('T')[0];
    const url = new URL(`${TIDE_BASE_URL}/events`);
    url.searchParams.set('start', today);
    url.searchParams.set('limit', '20');

    const res = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error(`Tide API Error ${res.status}: ${await res.text()}`);
    }

    const json: EventsResponse = await res.json();
    return json.events;
}

// Ausführen
fetchUpcomingEvents()
    .then(events => console.log('Anstehende Termine:', events))
    .catch(console.error);
```

---

### Home Assistant (REST Sensor)

In deiner `configuration.yaml` kannst du Tide als RESTful Sensor einbinden, um z. B. den nächsten Termin auf dem Dashboard oder auf einem Smart-Home-Display anzuzeigen:

```yaml
sensor:
  - platform: rest
    name: "Tide Nächste Termine"
    resource: "https://go-tide.app/api/v1/external/events"
    headers:
      Authorization: "Bearer tide_pat_DEIN_TOKEN"
    params:
      limit: 5
    scan_interval: 300 # Alle 5 Minuten abfragen
    value_template: "{{ value_json.count }}"
    json_attributes:
      - events
      - count
```

---

## 7. Fehlerbehandlung & Status-Codes

Die API nutzt standardisierte HTTP-Status-Codes und gibt Fehlermeldungen als strukturiertes JSON zurück:

| Code | Bedeutung | Ursache / Lösung |
|------|-----------|------------------|
| `200 OK` | Erfolg | Die Anfrage wurde erfolgreich verarbeitet. |
| `400 Bad Request` | Ungültige Parameter | Ein Datumsformat ist inkorrekt (nutze ISO 8601 wie `2026-10-13` oder `2026-10-13T10:00:00Z`). |
| `401 Unauthorized` | Nicht authentifiziert | Der Token fehlt, ist ungültig oder abgelaufen. |
| `403 Forbidden` | Fehlende Berechtigung | Dem Token fehlt der für diesen Endpunkt erforderliche Scope (z. B. `events:read`). Erstelle einen neuen Token mit dem benötigten Scope. |
| `404 Not Found` | Nicht gefunden | Der angeforderte Termin existiert nicht oder gehört nicht zu deinem Account. |
| `501 Not Implemented` | Noch nicht implementiert | Das angefragte Modul (z. B. Notizen-API) ist im Rechtesystem vorbereitet, aber noch in der Entwicklung. |
| `500 Server Error` | Serverfehler | Interner Fehler beim Abfragen der Datenbank. |

### Beispiel für Fehler-Antwort:
```json
{
  "error": "Forbidden",
  "message": "Token lacks required scope 'events:read'",
  "required_scope": "events:read",
  "token_scopes": ["notes:read"]
}
```

---

## 8. Sicherheitsarchitektur

1. **Keine Plaintext-Speicherung**:
   - Beim Erstellen wird der Token (`tide_pat_<random-hex>`) einmalig dem Nutzer im Browser angezeigt.
   - Die Datenbank speichert ausschließlich `token_hash = SHA256(token)`.
   - Bei einem Datenbank-Leak können keine Tokens kompromittiert werden.

2. **Sichere Token-Generierung**:
   - Tokens werden mit `crypto/rand` aus dem Go-Standardpaket erzeugt (kryptografisch sichere 256-Bit-Zufallszahlen).

3. **Sofortiger Widerruf**:
   - Sobald ein Token in den Einstellungen gelöscht wird, ist er mit sofortiger Wirkung für alle externen Anfragen ungültig.

4. **Nutzungs-Tracking**:
   - Bei jeder erfolgreichen Anfrage wird `last_used_at` asynchron aktualisiert, sodass du in den Einstellungen immer siehst, wann ein Token zuletzt aktiv war.
