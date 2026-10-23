# Whisper Hub — API Integration Guide / API Integrationsleitfaden

> **Status:** Production Ready  
> **API Version:** `v1`  
> **Base URL:** `https://go-tide.app/whisper/api`  
> **WebSocket Gateway:** `wss://go-tide.app/whisper/ws`  
> **Web Dashboard & Token Generator:** [https://go-tide.app/whisper/](https://go-tide.app/whisper/)

---

## 🇩🇪 DEUTSCHER LEITFADEN

### 1. Übersicht & Architektur
Whisper Hub ist ein Push-Benachrichtigungs- und Glance-Widget-Synchronisationsdienst für Android-Terminals. Drittanbieter-Dienste (wie **Home Assistant**, **Grafana**, **Uptime Kuma**, **CI/CD-Runner** oder **Shell-Cronjobs**) können über gesicherte HTTP-Endpunkte Echtzeit-Benachrichtigungen mit High-Priority Heads-Up Sound oder Widget-Zustände an Android-Geräte übermitteln.

---

### 2. Authentifizierungs-Mechanismen
Alle schreibenden Endpunkte (`/notify`, `/broadcast`, `/widgets/update`) erfordern ein gültiges API-Token mit passendem Berechtigungsscope.

Whisper Hub unterstützt drei standardisierte Authentifizierungswege:

#### A. HTTP Authorization Header (Empfohlen)
```http
POST /whisper/api/notify HTTP/1.1
Host: go-tide.app
Authorization: Bearer wsp_live_9a7b6c5d4e3f2a1b0c9d8e7f
Content-Type: application/json
```

#### B. Benutzerdefinierter Header `X-Whisper-Token`
Ideal für Webhooks und Systeme (z.B. Grafana), bei denen Custom Header konfiguriert werden:
```http
POST /whisper/api/notify HTTP/1.1
Host: go-tide.app
X-Whisper-Token: wsp_live_9a7b6c5d4e3f2a1b0c9d8e7f
Content-Type: application/json
```

#### C. URL-Abfrageparameter `?token=`
Nützlich für einfache Webhooks oder Legacy-Clients, die keine HTTP-Header konfigurieren können:
```http
POST /whisper/api/notify?token=wsp_live_9a7b6c5d4e3f2a1b0c9d8e7f HTTP/1.1
Host: go-tide.app
Content-Type: application/json
```

---

### 3. API-Token Lebenszyklus & Berechtigungs-Scopes

Tokens beginnen immer mit dem Präfix `wsp_live_` und bestehen aus kryptografisch sicheren Zufallsbytes.

#### Scopes:
- `*` (Wildcard Master): Voller Zugriff auf alle Endpunkte.
- `notify:write`: Darf Benachrichtigungen an Geräte und Topics senden (`/notify`, `/broadcast`).
- `widgets:write`: Darf Glance-Widget-Zustände aktualisieren (`/widgets/update`).

#### Sicherheit & Maskierung:
- Der geheime Token-Schlüssel wird **nur ein einziges Mal** bei der Erstellung über `POST /whisper/api/tokens` im Klartext zurückgegeben.
- Beim Abruf über `GET /whisper/api/tokens` wird das Geheimnis maskiert ausgegeben (z.B. `wsp_live_9a7b••••••••7667`).
- Bei jeder Nutzung eines Tokens wird der Zeitstempel `last_used_at` automatisch aktualisiert.
- Widerrufene Tokens (`DELETE /whisper/api/tokens/:id`) werden mit HTTP 401 (`Token has been revoked`) sofort abgelehnt.

---

### 4. Sofort einsatzbereite Code-Beispiele

#### 1. cURL (Bash)
```bash
curl -X POST https://go-tide.app/whisper/api/notify \
  -H "Authorization: Bearer wsp_live_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_id": "alerts",
    "priority": "urgent",
    "title": "Produktions-Server Alarm",
    "body": "Postgres p99 Latenz übersteigt 450ms.",
    "sound": "alarm_beep"
  }'
```

#### 2. Python (`requests`)
```python
import requests

WHISPER_URL = "https://go-tide.app/whisper/api/notify"
WHISPER_TOKEN = "wsp_live_YOUR_TOKEN"

def send_whisper_alert(title: str, message: str, priority: str = "high"):
    headers = {
        "Authorization": f"Bearer {WHISPER_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "channel_id": "alerts",
        "priority": priority, # "urgent", "high", "normal", "low"
        "title": title,
        "body": message,
        "sound": "alarm_beep" if priority == "urgent" else "default",
        "data": {
            "source": "backup-script",
            "host": "prod-fra1"
        }
    }
    response = requests.post(WHISPER_URL, json=payload, headers=headers, timeout=5)
    response.raise_for_status()
    return response.json()

if __name__ == "__main__":
    result = send_whisper_alert("Postgres Backup Erfolgreich", "Dump mit 14.2 GB erstellt.")
    print("Delivered to devices:", result["data"]["delivered_count"])
```

#### 3. JavaScript / Node.js (`fetch`)
```javascript
const WHISPER_API = 'https://go-tide.app/whisper/api/notify';
const WHISPER_TOKEN = 'wsp_live_YOUR_TOKEN';

async function dispatchNotification() {
  const response = await fetch(WHISPER_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHISPER_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel_id: 'alerts',
      priority: 'urgent',
      title: 'CI/CD Pipeline Fehlgeschlagen',
      body: 'Branch main Build #412 ist fehlgeschlagen.',
      sound: 'alarm_beep'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper Error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log('Push-Zustellung bestätigt:', result.data.notification_id);
}

dispatchNotification();
```

#### 4. Linux Shell Script (Systemd Failure Alert / Backup Hook)
Speichere dieses Skript z.B. als `/usr/local/bin/whisper-alert.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

TITLE="${1:-System Event}"
BODY="${2:-Automatische Benachrichtigung vom Server $(hostname)}"
PRIORITY="${3:-normal}"
TOKEN="wsp_live_YOUR_TOKEN"

curl -s -X POST https://go-tide.app/whisper/api/notify \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "channel_id": "alerts",
  "priority": "${PRIORITY}",
  "title": "${TITLE}",
  "body": "${BODY}",
  "sound": "alarm_beep"
}
EOF
echo ""
```
Verwendung z.B. in `OnFailure=` einer Systemd-Unit:
```ini
[Unit]
Description=Database Backup Service
OnFailure=whisper-notify-failure@%n.service
```

#### 5. Home Assistant Integration
Füge folgende Konfiguration in deine `configuration.yaml` ein:

```yaml
# configuration.yaml
notify:
  - name: whisper_push
    platform: rest
    resource: https://go-tide.app/whisper/api/notify
    method: POST_JSON
    headers:
      Authorization: "Bearer wsp_live_YOUR_TOKEN"
      Content-Type: "application/json"
    data:
      channel_id: "alerts"
      priority: "high"
      sound: "default"
    title_param_name: "title"
    message_param_name: "body"
```

Verwendung in Home Assistant Automationen (`automations.yaml`):
```yaml
alias: "Waschmaschine Fertig Whisper Alarm"
trigger:
  - platform: numeric_state
    entity_id: sensor.waschmaschine_leistung
    below: 2.0
    for: "00:02:00"
action:
  - service: notify.whisper_push
    data:
      title: "🧺 Waschmaschine Fertig"
      message: "Die Wäsche im Keller ist fertig und kann entnommen werden."
      data:
        priority: "normal"
        sound: "default"
```

#### 6. Grafana Alerting Contact Point Webhook
In Grafana unter **Alerting** -> **Contact points** -> **New contact point**:
- **Name:** `Whisper Mobile Push`
- **Integration:** `Webhook`
- **URL:** `https://go-tide.app/whisper/api/notify`
- **HTTP Method:** `POST`
- **HTTP Header Name:** `Authorization`
- **HTTP Header Value:** `Bearer wsp_live_YOUR_TOKEN`

Oder mit individuellem JSON-Payload:
```json
{
  "channel_id": "alerts",
  "priority": "urgent",
  "title": "{{ .CommonLabels.alertname }} ({{ .Status | toUpper }})",
  "body": "{{ .CommonAnnotations.description }}",
  "sound": "alarm_beep"
}
```

#### 7. Glance-Widget Aktualisierung (Python & cURL)
Um interaktive Android Glance-Widgets auf dem Homescreen live zu aktualisieren:
```bash
curl -X POST https://go-tide.app/whisper/api/widgets/update \
  -H "Authorization: Bearer wsp_live_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "widget_id": "server-load-prod",
    "template": "metric_badge",
    "data": {
      "title": "Prod Cluster CPU",
      "value": "84%",
      "status": "warning",
      "accent_color": "#FFA500",
      "progress": 0.84,
      "subtitle": "Node-01 Auslastung steigt"
    }
  }'
```

---

### 5. HTTP Statuscodes & Fehlerbehebung

| HTTP Status | Bedeutung | Typische Ursache |
| :--- | :--- | :--- |
| **`200 OK`** | Anfrage erfolgreich verarbeitet | Push-Benachrichtigung oder Widget-Update zugestellt. |
| **`201 Created`** | Ressource erfolgreich erstellt | Neuer API-Token wurde generiert. |
| **`400 Bad Request`** | Ungültiger Request-Body | Fehlende Pflichtfelder (`title`, `widget_id`, etc.) oder ungültiges JSON. |
| **`401 Unauthorized`** | Authentifizierung fehlgeschlagen | Token fehlt, ist ungültig oder wurde widerrufen. |
| **`403 Forbidden`** | Fehlende Berechtigung | Token besitzt nicht den erforderlichen Scope (z.B. `notify:write` versucht Widget-Update). |
| **`404 Not Found`** | Endpunkt oder Ressource nicht gefunden | Ungültige Token-ID bei `DELETE /whisper/api/tokens/:id`. |
| **`500 Internal Error`**| Serverfehler | Unerwarteter Laufzeitfehler auf dem Server. |

---
---

## 🇬🇧 ENGLISH INTEGRATION GUIDE

### 1. Overview & Architecture
Whisper Hub is an ultra-low latency push notification and Glance home screen widget synchronization service for Android terminals. Third-party platforms (**Home Assistant**, **Grafana**, **Uptime Kuma**, **CI/CD runners**, and **backend scripts**) authenticate against Whisper via cryptographically signed API tokens to dispatch priority push events and real-time widget states.

---

### 2. Authentication Schemes
All mutating endpoints require an active API token with appropriate scopes.

#### A. Authorization Bearer Header (Standard)
```http
POST /whisper/api/notify HTTP/1.1
Host: go-tide.app
Authorization: Bearer wsp_live_YOUR_TOKEN
Content-Type: application/json
```

#### B. Header `X-Whisper-Token`
```http
POST /whisper/api/notify HTTP/1.1
Host: go-tide.app
X-Whisper-Token: wsp_live_YOUR_TOKEN
Content-Type: application/json
```

#### C. Query Parameter `?token=`
```http
POST /whisper/api/notify?token=wsp_live_YOUR_TOKEN HTTP/1.1
Host: go-tide.app
Content-Type: application/json
```

---

### 3. API Endpoints Reference

#### Create New Token
```http
POST /whisper/api/tokens
Content-Type: application/json

{
  "label": "HomeAssistant",
  "scopes": ["notify:write", "widgets:write"]
}
```
**Response (201 Created):**
```json
{
  "status": "success",
  "message": "Token created successfully. Copy the token now; it will not be shown again.",
  "data": {
    "id": "tok_9a12b3c4",
    "label": "HomeAssistant",
    "token": "wsp_live_5a8f2b1c4e9d3a7e0f8c2b1a9e8d7c6b5a4f3e2d1c0b9a8f",
    "prefix": "wsp_live_5a8f2b1c...",
    "scopes": ["notify:write", "widgets:write"],
    "created_at": "2026-10-23T15:00:00.000Z",
    "last_used_at": null,
    "is_active": true
  }
}
```

#### List Tokens (Masked Secrets)
```http
GET /whisper/api/tokens
```
**Response (200 OK):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "tok_9a12b3c4",
      "label": "HomeAssistant",
      "prefix": "wsp_live_5a8f2b1c...",
      "token_masked": "wsp_live_5a8f••••••••9a8f",
      "scopes": ["notify:write", "widgets:write"],
      "created_at": "2026-10-23T15:00:00.000Z",
      "last_used_at": "2026-10-23T15:10:00.000Z",
      "is_active": true
    }
  ]
}
```

#### Revoke Token
```http
DELETE /whisper/api/tokens/tok_9a12b3c4
```
**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Token revoked successfully",
  "data": {
    "id": "tok_9a12b3c4",
    "is_active": false,
    "revoked_at": "2026-10-23T15:15:00.000Z"
  }
}
```

#### Dispatch Notification
```http
POST /whisper/api/notify
Authorization: Bearer wsp_live_YOUR_TOKEN
Content-Type: application/json

{
  "channel_id": "alerts",
  "priority": "urgent",
  "title": "Database High Latency Alert",
  "body": "Postgres p99 latency exceeds 450ms.",
  "sound": "alarm_beep"
}
```

#### Update Glance Widget
```http
POST /whisper/api/widgets/update
Authorization: Bearer wsp_live_YOUR_TOKEN
Content-Type: application/json

{
  "widget_id": "server-load-prod",
  "template": "metric_badge",
  "data": {
    "title": "Prod Cluster CPU",
    "value": "84%",
    "status": "warning",
    "accent_color": "#FFA500"
  }
}
```

---

### 4. Language Snippets (Go & PHP)

#### Go (`net/http`)
```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "https://go-tide.app/whisper/api/notify"
	payload := map[string]interface{}{
		"channel_id": "alerts",
		"priority":   "urgent",
		"title":      "Production Outage",
		"body":       "Kubernetes cluster node unreachable.",
		"sound":      "alarm_beep",
	}
	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		panic(err)
	}
	req.Header.Set("Authorization", "Bearer wsp_live_YOUR_TOKEN")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("HTTP %s: %s\n", resp.Status, string(body))
}
```

#### PHP (`curl`)
```php
<?php
$token = 'wsp_live_YOUR_TOKEN';
$ch = curl_init('https://go-tide.app/whisper/api/notify');

$payload = json_encode([
    'channel_id' => 'alerts',
    'priority'   => 'urgent',
    'title'      => 'Server Disk Full',
    'body'       => 'Root partition usage reached 98%.',
    'sound'      => 'alarm_beep'
]);

curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        "Authorization: Bearer {$token}",
        "Content-Type: application/json"
    ]
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP {$httpCode}: {$response}\n";
?>
```
