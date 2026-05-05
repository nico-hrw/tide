# Sport Tracker — Design Spec
**Datum:** 2026-05-06  
**Subdomain:** `track.go-tide.app`  
**Status:** Approved

---

## 1. Gesamtarchitektur

```
track.go-tide.app          go-tide.app
       │                        │
  tracker/ (Next.js)       web/ (Next.js)
       │                        │
       └────────┬───────────────┘
                │
         localhost:8080 (Go, bestehend)
          /api/v1/tracker/*   ← neue Routen
          /api/v1/auth/*      ← bestehend, unverändert
                │
           tide.db (SQLite)
           ext_tracker_* Tabellen
```

- **Backend:** Bestehender Go-Server wird um `cloud/internal/api/tracker.go` erweitert. Kein zweiter Server.
- **Frontend:** Separater Ordner `tracker/` neben `web/`. Eigene `package.json`, eigenes Next.js + Tailwind. `next.config.ts` enthält Rewrite `/api/:path* → http://localhost:8080/api/:path*` (identisch mit `web/`). Auth-Redirect auf `https://go-tide.app/auth` wenn 401.
- **Auth:** Cookie `tide_session` wird auf Domain `.go-tide.app` (mit führendem Punkt) gesetzt. Eine Zeile Änderung in `main.go`. Danach funktioniert Auth automatisch auf allen Subdomains — kein separater Login.
- **Daten:** Klartext in der DB (wie Finance-Extension), kein E2EE.
- **Offline:** IndexedDB + `online`-Event (kein Service Worker).

---

## 2. Datenbankschema

Vier neue Tabellen, Präfix `ext_tracker_*`. Migrationen werden inline in `cloud/internal/store/sqlite.go` in der `migrate()`-Funktion ergänzt (bestehende Konvention).

```sql
-- Übungswörterbuch
CREATE TABLE ext_tracker_exercises (
    id TEXT PRIMARY KEY,
    user_id TEXT,                          -- NULL = globale Systemübung
    name TEXT NOT NULL,
    category TEXT NOT NULL,                -- 'strength', 'cardio', 'flexibility'
    default_tracking_type TEXT NOT NULL,   -- 'weight_reps', 'distance_time', 'time_only'
    created_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Workout-Session
CREATE TABLE ext_tracker_workouts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,                    -- z.B. "Push Day"
    notes TEXT,
    started_at DATETIME NOT NULL,
    finished_at DATETIME,                  -- NULL = noch aktiv
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Übungen innerhalb einer Session
CREATE TABLE ext_tracker_workout_exercises (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY(workout_id) REFERENCES ext_tracker_workouts(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES ext_tracker_exercises(id)
);

-- Sätze (flexibles Kernstück — alle Metrik-Felder nullable)
CREATE TABLE ext_tracker_sets (
    id TEXT PRIMARY KEY,
    workout_exercise_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    reps INTEGER,
    weight_kg REAL,
    distance_meters REAL,
    duration_seconds INTEGER,
    is_warmup BOOLEAN NOT NULL DEFAULT FALSE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY(workout_exercise_id) REFERENCES ext_tracker_workout_exercises(id) ON DELETE CASCADE
);
```

**Seed-Daten:** Beim ersten Start werden globale Standardübungen eingefügt (user_id = NULL):
- Kraft: Bench Press, Squat, Deadlift, Overhead Press, Pull-Up, Barbell Row
- Cardio: Running, Cycling, Rowing, Swimming
- Flexibility: Yoga, Stretching

---

## 3. Go Backend

### Datei: `cloud/internal/api/tracker.go`

Handler-Struct nach bestehendem Pattern:

```go
type TrackerHandler struct {
    Store *store.SQLiteStore
}

func NewTrackerHandler(s *store.SQLiteStore) *TrackerHandler
func (h *TrackerHandler) RegisterRoutes(r chi.Router)
```

### Routen (alle JWT-geschützt via `AuthMiddleware`)

| Method | Path | Beschreibung |
|--------|------|--------------|
| `GET` | `/api/v1/tracker/exercises` | Globale + eigene Übungen |
| `POST` | `/api/v1/tracker/exercises` | Neue eigene Übung anlegen |
| `GET` | `/api/v1/tracker/workouts` | Vergangene Sessions (History + Stats) |
| `POST` | `/api/v1/tracker/workouts/bulk` | Komplettes Workout atomar speichern |

### `POST /api/v1/tracker/workouts/bulk` — Payload

```json
{
  "id": "uuid-v4",
  "name": "Push Day",
  "notes": "Felt strong today",
  "started_at": "2026-05-06T08:00:00Z",
  "finished_at": "2026-05-06T09:15:00Z",
  "exercises": [
    {
      "id": "uuid-v4",
      "exercise_id": "uuid-of-exercise",
      "sort_order": 0,
      "sets": [
        {
          "id": "uuid-v4",
          "sort_order": 0,
          "reps": 5,
          "weight_kg": 60.0,
          "is_warmup": true,
          "completed": true
        },
        {
          "id": "uuid-v4",
          "sort_order": 1,
          "reps": 8,
          "weight_kg": 100.0,
          "is_warmup": false,
          "completed": true
        }
      ]
    }
  ]
}
```

Alles wird in einer einzigen DB-Transaktion gespeichert. Bei Fehler: vollständiges Rollback, HTTP 500 mit Fehlermeldung.

### Cookie-Änderung

In `cloud/internal/api/auth.go` beim Setzen des `tide_session`-Cookies (im `VerifyOTP`-Handler):
```go
// Vorher:
http.SetCookie(w, &http.Cookie{Name: "tide_session", Domain: "go-tide.app", ...})
// Nachher:
http.SetCookie(w, &http.Cookie{Name: "tide_session", Domain: ".go-tide.app", ...})
```

### `GET /api/v1/tracker/workouts` — Response

Gibt vollständig verschachtelte Workout-Daten zurück (Workout + Exercises + Sets), damit der Client sowohl History als auch Analytics ohne weitere Requests berechnen kann. Query-Parameter: `?limit=50` (Standard), `?offset=0` für Pagination.

---

## 4. Frontend (`tracker/`)

### Struktur

```
tracker/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, AuthGuard, Bottom-Nav
│   │   ├── page.tsx            # Home Tab
│   │   ├── workout/page.tsx    # Aktive Workout-Session
│   │   ├── history/page.tsx    # Vergangene Workouts
│   │   └── stats/page.tsx      # Analytics Dashboard
│   ├── components/
│   │   ├── BottomNav.tsx
│   │   ├── StatCard.tsx
│   │   ├── WorkoutCard.tsx
│   │   ├── ExerciseCard.tsx
│   │   ├── SetLogger.tsx       # Bottom Sheet für Satz-Eingabe
│   │   └── SyncStatus.tsx      # Badge + Retry-Button
│   ├── store/
│   │   └── useTrackerStore.ts  # Zustand Store
│   ├── lib/
│   │   ├── api.ts              # apiFetch wrapper (analog zu web/)
│   │   ├── db.ts               # IndexedDB wrapper
│   │   └── sync.ts             # Sync-Logik
│   └── types/
│       └── tracker.ts          # Alle TypeScript-Typen
├── package.json
├── next.config.ts
├── tailwind.config.js
└── tsconfig.json
```

### Visueller Stil

Orientiert an den Referenzbildern:
- Hintergrund: warmes Neutral (`#F5F4F0` o.ä.), nicht reines Weiß
- Cards: weiß, `rounded-2xl`, leichter Schatten
- Farbige Punkte/Akzente je Kategorie (Kraft = blau, Cardio = grün, Flexibility = lila)
- Große fette Zahlen für Stats
- Bottom Navigation mit 4 Tabs: Home, Workout, History, Stats
- **Ausschließlich Mobile-optimiert** (max-width ~430px, kein Desktop-Layout im Prototypen)

### Bottom Sheet (Satz-Logging)

Tippt der Nutzer eine Übung an, gleitet ein Bottom Sheet hoch mit:
- Übungsname + Kategorie
- Streak-Badge (Trainingstage in Folge mit dieser Übung)
- Input-Felder je nach `default_tracking_type`:
  - `weight_reps`: Gewicht (kg) + Wiederholungen + Warmup-Toggle
  - `distance_time`: Distanz (km) + Dauer (min:sec)
  - `time_only`: Dauer (min:sec)
- "Satz hinzufügen" Button
- Liste bereits geloggter Sätze
- "Fertig" Button schließt Sheet

### Vier App-Tabs

**Home:**
- Greeting ("Guten Morgen, [Name]") + Datum
- Stat-Cards: Streak, Workouts diese Woche, Wochenvolumen
- "Heutiges Workout" Card (falls aktiv) oder "Neues Workout starten" Button
- SyncStatus-Komponente (bei pending Einträgen sichtbar)

**Workout:**
- Name der Session (editierbar)
- Liste der Übungen als Cards
- "Übung hinzufügen" Button → Übungs-Picker (Suche + Kategorie-Filter)
- "Workout beenden" Button → schreibt in IndexedDB `sync_queue`, löscht `active_workout`

**History:**
- Liste vergangener Workouts (Datum, Name, Dauer, Übungsanzahl)
- Tap → Detail-Ansicht mit allen Sätzen

**Stats:**
- Übungs-Picker oben
- Charts je nach Typ (siehe Abschnitt 5)

### Offline-Logik (`tracker/src/lib/`)

**`db.ts` — IndexedDB mit zwei Object Stores:**

```typescript
// active_workout: das laufende Workout
// sync_queue: abgeschlossene Workouts

interface SyncQueueEntry {
  id: string
  workout: BulkWorkoutPayload
  status: 'pending' | 'failed'
  attempts: number
  last_error?: string
  created_at: string
}
```

**`sync.ts` — Sync-Mechanismus:**

```typescript
// Automatisch beim App-Start + beim online-Event
window.addEventListener('online', triggerSync)

async function triggerSync() {
  const pending = await db.getSyncQueue()  // status: 'pending' | 'failed'
  for (const entry of pending) {
    try {
      await apiFetch('/tracker/workouts/bulk', { method: 'POST', body: entry.workout })
      await db.removeSyncEntry(entry.id)
    } catch (e) {
      await db.markFailed(entry.id, e.message)  // attempts++
    }
  }
}
```

**Export / Import (Fallback bei dauerhaftem Fehler):**

- **Export:** Button in Settings/SyncStatus → lädt alle `sync_queue`-Einträge als `tracker-backup-YYYY-MM-DD.json` herunter
- **Import:** File-Input → parsed JSON → Einträge landen wieder in `sync_queue` → normaler Sync-Flow
- Format: Array von `BulkWorkoutPayload` — identisch mit dem was an den Bulk-Endpunkt gesendet wird

---

## 5. Analytics Dashboard (Stats-Tab)

**Bibliothek:** Recharts (bereits als Dependency genutzt in `web/`, wird auch in `tracker/` installiert).

### Charts nach `default_tracking_type`

**`weight_reps` (Kraft):**
- Liniendiagramm: Trainingsvolumen (Gewicht × Reps × Sätze) pro Session
- Liniendiagramm: Geschätztes 1RM nach Epley (`weight × (1 + reps / 30)`) — bestes Set pro Session

**`distance_time` (Cardio):**
- Liniendiagramm: Pace (duration_seconds / distance_meters → in min/km) pro Session
- Balkendiagramm: Gesamtdistanz (km) pro Session

**`time_only`:**
- Balkendiagramm: Gesamtdauer (Minuten) pro Session

### Berechnung (clientseitig aus rohen Workout-Daten)

```typescript
// Volumen
const volume = sets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)

// 1RM (Epley)
const oneRM = Math.max(...sets.map(s => (s.weight_kg ?? 0) * (1 + (s.reps ?? 0) / 30)))

// Pace (min/km)
const pace = (durationSeconds / 60) / (distanceMeters / 1000)
```

### Home-Tab Stats (übungsunabhängig)

- **Streak:** Aufeinanderfolgende Tage mit mindestens einem abgeschlossenen Workout
- **Diese Woche:** Anzahl Workouts (z.B. "3/5")
- **Wochenvolumen:** Summe aller Kraft-Sätze (Gewicht × Reps) der laufenden Woche

---

## 6. Nicht im Prototypen (später)

- Desktop-Layout / responsive Breakpoints
- Push Notifications
- Workout-Templates (gespeicherte Übungsreihenfolgen)
- Soziale Features (Workouts teilen)
- Apple Health / Google Fit Integration
- Detaillierte Muskelgruppen-Kategorisierung
