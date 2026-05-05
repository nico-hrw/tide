# Sport Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baue einen Offline-First Sport-Tracker unter `track.go-tide.app` als separate Next.js-App mit Go-Backend-Erweiterung.

**Architecture:** Go-Backend um `cloud/internal/api/tracker.go` erweitern (Finance-Handler-Pattern, direkte DB-Queries). Separate Next.js-App in `tracker/` mit IndexedDB-Offline-Speicher und automatischer Sync via `window.online`-Event. Cookie-Domain auf `.go-tide.app` ausweiten für geteilte Auth.

**Tech Stack:** Go + chi + SQLite (bestehend), Next.js 16 + Tailwind + Zustand + Recharts, IndexedDB (nativ)

---

## Datei-Übersicht

**Modify:**
- `cloud/internal/store/sqlite.go` — 4 neue Tabellen + Seed-Daten in `migrate()`
- `cloud/internal/api/auth.go:381-389` — Cookie-Domain `.go-tide.app`
- `cloud/cmd/server/main.go:96-99` — CORS + TrackerHandler registrieren

**Create (Go):**
- `cloud/internal/api/tracker.go` — TrackerHandler mit allen Routes

**Create (Frontend — alle unter `tracker/`):**
- `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`
- `src/types/tracker.ts`
- `src/lib/api.ts`, `src/lib/db.ts`, `src/lib/sync.ts`, `src/lib/analytics.ts`
- `src/store/useTrackerStore.ts`
- `src/app/layout.tsx`, `src/app/page.tsx`
- `src/app/workout/page.tsx`, `src/app/history/page.tsx`, `src/app/stats/page.tsx`
- `src/components/BottomNav.tsx`, `src/components/StatCard.tsx`
- `src/components/ExercisePicker.tsx`, `src/components/SetLogger.tsx`
- `src/components/SyncStatus.tsx`

---

## Task 1: DB-Migration — 4 Tracker-Tabellen + Seed-Daten

**Files:**
- Modify: `cloud/internal/store/sqlite.go:177` (nach `tasks`-Tabelle, vor schließendem Backtick)

- [ ] **Schritt 1: Tracker-Tabellen in `migrate()` einfügen**

In `sqlite.go`, die 4 Tabellen direkt nach der `tasks`-Tabelle (Zeile ~185) und vor dem schließenden Backtick der `tables`-Variable einfügen:

```sql
CREATE TABLE IF NOT EXISTS ext_tracker_exercises (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    default_tracking_type TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ext_tracker_workouts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    notes TEXT,
    started_at DATETIME NOT NULL,
    finished_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ext_tracker_workout_exercises (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY(workout_id) REFERENCES ext_tracker_workouts(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES ext_tracker_exercises(id)
);

CREATE TABLE IF NOT EXISTS ext_tracker_sets (
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

- [ ] **Schritt 2: Seed-Daten nach den Indices einfügen**

Nach dem `if _, err := s.DB.Exec(indices)` Block (Zeile ~237), vor dem `return nil`:

```go
// Seed global exercises (INSERT OR IGNORE to be idempotent)
seeds := []struct{ id, name, category, trackingType string }{
    {"ex-bench-press", "Bench Press", "strength", "weight_reps"},
    {"ex-squat", "Squat", "strength", "weight_reps"},
    {"ex-deadlift", "Deadlift", "strength", "weight_reps"},
    {"ex-ohp", "Overhead Press", "strength", "weight_reps"},
    {"ex-pull-up", "Pull-Up", "strength", "weight_reps"},
    {"ex-barbell-row", "Barbell Row", "strength", "weight_reps"},
    {"ex-running", "Running", "cardio", "distance_time"},
    {"ex-cycling", "Cycling", "cardio", "distance_time"},
    {"ex-rowing", "Rowing", "cardio", "distance_time"},
    {"ex-swimming", "Swimming", "cardio", "distance_time"},
    {"ex-yoga", "Yoga", "flexibility", "time_only"},
    {"ex-stretching", "Stretching", "flexibility", "time_only"},
}
seedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
for _, seed := range seeds {
    _, _ = s.DB.Exec(
        `INSERT OR IGNORE INTO ext_tracker_exercises (id, user_id, name, category, default_tracking_type, created_at) VALUES (?, NULL, ?, ?, ?, ?)`,
        seed.id, seed.name, seed.category, seed.trackingType, seedTime,
    )
}
```

- [ ] **Schritt 3: Server starten und prüfen**

```bash
cd cloud && go build ./... 
```

Erwartung: kein Fehler. Danach `go run ./cmd/server` starten, in den Logs erscheint kein Migration-Error.

- [ ] **Schritt 4: Commit**

```bash
git add cloud/internal/store/sqlite.go
git commit -m "feat(tracker): add ext_tracker_* tables and seed exercises"
```

---

## Task 2: Cookie-Domain + CORS für `track.go-tide.app`

**Files:**
- Modify: `cloud/internal/api/auth.go:381-389`
- Modify: `cloud/cmd/server/main.go:96-99`

- [ ] **Schritt 1: Cookie-Domain ändern**

In `cloud/internal/api/auth.go`, Zeile 381, `http.SetCookie` erweitern:

```go
http.SetCookie(w, &http.Cookie{
    Name:     "tide_session",
    Value:    tokenString,
    Expires:  time.Now().Add(14 * 24 * time.Hour),
    HttpOnly: true,
    Secure:   false, // Set true in production over HTTPS
    SameSite: http.SameSiteLaxMode,
    Path:     "/",
    Domain:   ".go-tide.app",
})
```

- [ ] **Schritt 2: CORS um `track.go-tide.app` erweitern**

In `cloud/cmd/server/main.go`, `trustedOrigins` slice:

```go
trustedOrigins := []string{
    "http://localhost:3000",
    "http://localhost:3001",
    "https://go-tide.app",
    "https://track.go-tide.app",
}
```

- [ ] **Schritt 3: TrackerHandler registrieren**

In `main.go`, `NewTrackerHandler` und Route registrieren. Zuerst Import-Block prüfen — `tracker.go` ist noch nicht da, daher diesen Schritt nach Task 3 ausführen. Placeholder hier eintragen:

Im `r.Route("/api/v1", ...)` Block direkt nach `financeHandler`:
```go
r.Route("/tracker", trackerHandler.RegisterRoutes)
```

Und in der Handler-Initialisierung vor dem Router:
```go
trackerHandler := api.NewTrackerHandler(sqliteStore)
```

- [ ] **Schritt 4: Commit**

```bash
git add cloud/internal/api/auth.go cloud/cmd/server/main.go
git commit -m "feat(tracker): extend cookie domain to .go-tide.app, add CORS for track subdomain"
```

---

## Task 3: TrackerHandler — Exercises + Bulk Workout Endpoints

**Files:**
- Create: `cloud/internal/api/tracker.go`

- [ ] **Schritt 1: Datei anlegen**

```go
package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

type TrackerHandler struct {
	Store *store.SQLiteStore
}

func NewTrackerHandler(s *store.SQLiteStore) *TrackerHandler {
	return &TrackerHandler{Store: s}
}

func (h *TrackerHandler) RegisterRoutes(r chi.Router) {
	r.Use(AuthMiddleware)
	r.Get("/exercises", h.ListExercises)
	r.Post("/exercises", h.CreateExercise)
	r.Get("/workouts", h.ListWorkouts)
	r.Post("/workouts/bulk", h.BulkSaveWorkout)
}

// ── Request / Response types ──────────────────────────────────────────────────

type trackerExercise struct {
	ID                  string  `json:"id"`
	UserID              *string `json:"user_id"`
	Name                string  `json:"name"`
	Category            string  `json:"category"`
	DefaultTrackingType string  `json:"default_tracking_type"`
	CreatedAt           string  `json:"created_at"`
}

type createExerciseRequest struct {
	Name                string `json:"name"`
	Category            string `json:"category"`
	DefaultTrackingType string `json:"default_tracking_type"`
}

type bulkSetRequest struct {
	ID              string   `json:"id"`
	SortOrder       int      `json:"sort_order"`
	Reps            *int     `json:"reps"`
	WeightKg        *float64 `json:"weight_kg"`
	DistanceMeters  *float64 `json:"distance_meters"`
	DurationSeconds *int     `json:"duration_seconds"`
	IsWarmup        bool     `json:"is_warmup"`
	Completed       bool     `json:"completed"`
}

type bulkExerciseRequest struct {
	ID         string           `json:"id"`
	ExerciseID string           `json:"exercise_id"`
	SortOrder  int              `json:"sort_order"`
	Sets       []bulkSetRequest `json:"sets"`
}

type bulkWorkoutRequest struct {
	ID         string                `json:"id"`
	Name       string                `json:"name"`
	Notes      *string               `json:"notes"`
	StartedAt  time.Time             `json:"started_at"`
	FinishedAt time.Time             `json:"finished_at"`
	Exercises  []bulkExerciseRequest `json:"exercises"`
}

type trackerSet struct {
	ID              string   `json:"id"`
	SortOrder       int      `json:"sort_order"`
	Reps            *int     `json:"reps"`
	WeightKg        *float64 `json:"weight_kg"`
	DistanceMeters  *float64 `json:"distance_meters"`
	DurationSeconds *int     `json:"duration_seconds"`
	IsWarmup        bool     `json:"is_warmup"`
	Completed       bool     `json:"completed"`
}

type trackerWorkoutExercise struct {
	ID         string       `json:"id"`
	ExerciseID string       `json:"exercise_id"`
	Exercise   *trackerExercise `json:"exercise,omitempty"`
	SortOrder  int          `json:"sort_order"`
	Sets       []trackerSet `json:"sets"`
}

type trackerWorkout struct {
	ID         string                   `json:"id"`
	Name       string                   `json:"name"`
	Notes      *string                  `json:"notes"`
	StartedAt  string                   `json:"started_at"`
	FinishedAt *string                  `json:"finished_at"`
	Exercises  []trackerWorkoutExercise `json:"exercises"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *TrackerHandler) ListExercises(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := h.Store.DB.QueryContext(r.Context(), `
		SELECT id, user_id, name, category, default_tracking_type, created_at
		FROM ext_tracker_exercises
		WHERE user_id IS NULL OR user_id = ?
		ORDER BY CASE WHEN user_id IS NULL THEN 0 ELSE 1 END, name ASC
	`, userID)
	if err != nil {
		http.Error(w, "Failed to query exercises", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	exercises := []trackerExercise{}
	for rows.Next() {
		var e trackerExercise
		var uid sql.NullString
		var createdAt time.Time
		if err := rows.Scan(&e.ID, &uid, &e.Name, &e.Category, &e.DefaultTrackingType, &createdAt); err != nil {
			http.Error(w, "Failed to scan exercise", http.StatusInternalServerError)
			return
		}
		if uid.Valid {
			e.UserID = &uid.String
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		exercises = append(exercises, e)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(exercises)
}

func (h *TrackerHandler) CreateExercise(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req createExerciseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Category == "" || req.DefaultTrackingType == "" {
		http.Error(w, "name, category, and default_tracking_type are required", http.StatusBadRequest)
		return
	}

	id := generateID()
	now := time.Now()
	_, err := h.Store.DB.ExecContext(r.Context(), `
		INSERT INTO ext_tracker_exercises (id, user_id, name, category, default_tracking_type, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, userID, req.Name, req.Category, req.DefaultTrackingType, now)
	if err != nil {
		http.Error(w, "Failed to create exercise", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func (h *TrackerHandler) BulkSaveWorkout(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req bulkWorkoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.ID == "" || req.Name == "" {
		http.Error(w, "id and name are required", http.StatusBadRequest)
		return
	}

	tx, err := h.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(r.Context(), `
		INSERT INTO ext_tracker_workouts (id, user_id, name, notes, started_at, finished_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, req.ID, userID, req.Name, req.Notes, req.StartedAt, req.FinishedAt)
	if err != nil {
		http.Error(w, "Failed to save workout", http.StatusInternalServerError)
		return
	}

	for _, ex := range req.Exercises {
		_, err = tx.ExecContext(r.Context(), `
			INSERT INTO ext_tracker_workout_exercises (id, workout_id, exercise_id, sort_order)
			VALUES (?, ?, ?, ?)
		`, ex.ID, req.ID, ex.ExerciseID, ex.SortOrder)
		if err != nil {
			http.Error(w, "Failed to save workout exercise", http.StatusInternalServerError)
			return
		}

		for _, s := range ex.Sets {
			_, err = tx.ExecContext(r.Context(), `
				INSERT INTO ext_tracker_sets (id, workout_exercise_id, sort_order, reps, weight_kg, distance_meters, duration_seconds, is_warmup, completed)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, s.ID, ex.ID, s.SortOrder, s.Reps, s.WeightKg, s.DistanceMeters, s.DurationSeconds, s.IsWarmup, s.Completed)
			if err != nil {
				http.Error(w, "Failed to save set", http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to commit workout", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *TrackerHandler) ListWorkouts(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	// 1. Load workouts
	wRows, err := h.Store.DB.QueryContext(r.Context(), `
		SELECT id, name, notes, started_at, finished_at
		FROM ext_tracker_workouts
		WHERE user_id = ?
		ORDER BY started_at DESC
		LIMIT ? OFFSET ?
	`, userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to list workouts", http.StatusInternalServerError)
		return
	}
	defer wRows.Close()

	workouts := []trackerWorkout{}
	workoutIDs := []string{}
	workoutIndex := map[string]int{}

	for wRows.Next() {
		var wo trackerWorkout
		var notes sql.NullString
		var startedAt time.Time
		var finishedAt sql.NullTime
		if err := wRows.Scan(&wo.ID, &wo.Name, &notes, &startedAt, &finishedAt); err != nil {
			http.Error(w, "Failed to scan workout", http.StatusInternalServerError)
			return
		}
		if notes.Valid {
			wo.Notes = &notes.String
		}
		wo.StartedAt = startedAt.Format(time.RFC3339)
		if finishedAt.Valid {
			s := finishedAt.Time.Format(time.RFC3339)
			wo.FinishedAt = &s
		}
		wo.Exercises = []trackerWorkoutExercise{}
		workoutIndex[wo.ID] = len(workouts)
		workoutIDs = append(workoutIDs, wo.ID)
		workouts = append(workouts, wo)
	}

	if len(workoutIDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]trackerWorkout{})
		return
	}

	// 2. Load exercises for these workouts
	exRows, err := h.Store.DB.QueryContext(r.Context(), `
		SELECT we.id, we.workout_id, we.exercise_id, we.sort_order,
		       e.name, e.category, e.default_tracking_type
		FROM ext_tracker_workout_exercises we
		JOIN ext_tracker_exercises e ON e.id = we.exercise_id
		WHERE we.workout_id IN (SELECT id FROM ext_tracker_workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?)
		ORDER BY we.workout_id, we.sort_order
	`, userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to list workout exercises", http.StatusInternalServerError)
		return
	}
	defer exRows.Close()

	exIndex := map[string]map[string]int{} // workoutID -> exID -> index in Exercises slice
	for exRows.Next() {
		var we trackerWorkoutExercise
		var wID string
		var ex trackerExercise
		if err := exRows.Scan(&we.ID, &wID, &we.ExerciseID, &we.SortOrder, &ex.Name, &ex.Category, &ex.DefaultTrackingType); err != nil {
			http.Error(w, "Failed to scan workout exercise", http.StatusInternalServerError)
			return
		}
		ex.ID = we.ExerciseID
		we.Exercise = &ex
		we.Sets = []trackerSet{}
		wIdx := workoutIndex[wID]
		if exIndex[wID] == nil {
			exIndex[wID] = map[string]int{}
		}
		exIndex[wID][we.ID] = len(workouts[wIdx].Exercises)
		workouts[wIdx].Exercises = append(workouts[wIdx].Exercises, we)
	}

	// 3. Load sets
	sRows, err := h.Store.DB.QueryContext(r.Context(), `
		SELECT s.id, s.workout_exercise_id, s.sort_order, s.reps, s.weight_kg,
		       s.distance_meters, s.duration_seconds, s.is_warmup, s.completed
		FROM ext_tracker_sets s
		JOIN ext_tracker_workout_exercises we ON we.id = s.workout_exercise_id
		JOIN ext_tracker_workouts w ON w.id = we.workout_id
		WHERE w.user_id = ?
		  AND w.id IN (SELECT id FROM ext_tracker_workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?)
		ORDER BY we.workout_id, we.sort_order, s.sort_order
	`, userID, userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to list sets", http.StatusInternalServerError)
		return
	}
	defer sRows.Close()

	for sRows.Next() {
		var s trackerSet
		var weID string
		var reps sql.NullInt64
		var weightKg, distanceMeters sql.NullFloat64
		var durationSeconds sql.NullInt64
		if err := sRows.Scan(&s.ID, &weID, &s.SortOrder, &reps, &weightKg, &distanceMeters, &durationSeconds, &s.IsWarmup, &s.Completed); err != nil {
			http.Error(w, "Failed to scan set", http.StatusInternalServerError)
			return
		}
		if reps.Valid {
			v := int(reps.Int64)
			s.Reps = &v
		}
		if weightKg.Valid {
			s.WeightKg = &weightKg.Float64
		}
		if distanceMeters.Valid {
			s.DistanceMeters = &distanceMeters.Float64
		}
		if durationSeconds.Valid {
			v := int(durationSeconds.Int64)
			s.DurationSeconds = &v
		}

		// Find which workout/exercise this set belongs to
		for wID, exMap := range exIndex {
			if eIdx, ok := exMap[weID]; ok {
				wIdx := workoutIndex[wID]
				workouts[wIdx].Exercises[eIdx].Sets = append(workouts[wIdx].Exercises[eIdx].Sets, s)
				break
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(workouts)
}

// generateID returns a new UUID string using the uuid package already in go.mod.
func generateID() string {
	// Re-use the uuid package already imported by other handlers
	return newUUID()
}
```

- [ ] **Schritt 2: Imports am Anfang der Datei korrigieren**

Die `import`-Sektion ganz oben in `tracker.go` muss `uuid` enthalten. Sicherstellen, dass sie so aussieht:

```go
import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/store"
)
```

Die `generateID()` Funktion am Ende muss so aussehen (kein Aufruf von `newUUID`):

```go
func generateID() string {
	return uuid.New().String()
}
```

- [ ] **Schritt 3: Kompilieren**

```bash
cd cloud && go build ./...
```

Erwartung: kein Fehler.

- [ ] **Schritt 4: Route in `main.go` eintragen** (falls noch nicht in Task 2 gemacht)

```go
trackerHandler := api.NewTrackerHandler(sqliteStore)
// ... in r.Route("/api/v1", ...) Block:
r.Route("/tracker", trackerHandler.RegisterRoutes)
```

- [ ] **Schritt 5: Server starten + Endpunkte manuell testen**

```bash
cd cloud && go run ./cmd/server
```

In einem zweiten Terminal (mit gültigem JWT-Token):
```bash
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:8080/api/v1/tracker/exercises | head -c 200
```

Erwartung: JSON-Array mit 12 globalen Übungen.

- [ ] **Schritt 6: Commit**

```bash
git add cloud/internal/api/tracker.go cloud/cmd/server/main.go
git commit -m "feat(tracker): add TrackerHandler with exercises and workout bulk endpoints"
```

---

## Task 4: `tracker/` Projekt-Scaffold

**Files:** Create alle Config-Dateien in `tracker/`

- [ ] **Schritt 1: `tracker/package.json`**

```json
{
  "name": "tide-tracker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001"
  },
  "dependencies": {
    "next": "16.2.4",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "zustand": "^5.0.0",
    "recharts": "^3.7.0",
    "lucide-react": "^0.564.0",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^3.4.17",
    "postcss": "^8",
    "autoprefixer": "^10",
    "eslint": "^9",
    "eslint-config-next": "16.2.4"
  }
}
```

- [ ] **Schritt 2: `tracker/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*',
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Schritt 3: `tracker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Schritt 4: `tracker/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5F4F0',
        card: '#FFFFFF',
        strength: '#3B82F6',
        cardio: '#22C55E',
        flexibility: '#A855F7',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Schritt 5: `tracker/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Schritt 6: Dependencies installieren**

```bash
cd tracker && npm install
```

Erwartung: `node_modules/` wird erstellt, kein Fehler.

- [ ] **Schritt 7: Commit**

```bash
git add tracker/
git commit -m "feat(tracker): scaffold Next.js app with Tailwind config"
```

---

## Task 5: TypeScript-Typen + API-Client

**Files:**
- Create: `tracker/src/types/tracker.ts`
- Create: `tracker/src/lib/api.ts`

- [ ] **Schritt 1: `tracker/src/types/tracker.ts`**

```typescript
export type TrackingType = 'weight_reps' | 'distance_time' | 'time_only'
export type Category = 'strength' | 'cardio' | 'flexibility'

export interface TrackerExercise {
  id: string
  userId: string | null
  name: string
  category: Category
  defaultTrackingType: TrackingType
  createdAt: string
}

export interface TrackerSet {
  id: string
  sortOrder: number
  reps?: number
  weightKg?: number
  distanceMeters?: number
  durationSeconds?: number
  isWarmup: boolean
  completed: boolean
}

export interface TrackerWorkoutExercise {
  id: string
  exerciseId: string
  exercise?: TrackerExercise
  sortOrder: number
  sets: TrackerSet[]
}

export interface TrackerWorkout {
  id: string
  name: string
  notes?: string
  startedAt: string
  finishedAt?: string
  exercises: TrackerWorkoutExercise[]
}

export interface ActiveWorkout {
  id: string
  name: string
  startedAt: string
  exercises: ActiveWorkoutExercise[]
}

export interface ActiveWorkoutExercise {
  id: string
  exercise: TrackerExercise
  sortOrder: number
  sets: TrackerSet[]
}

export interface BulkWorkoutPayload {
  id: string
  name: string
  notes?: string
  startedAt: string
  finishedAt: string
  exercises: Array<{
    id: string
    exerciseId: string
    sortOrder: number
    sets: Array<{
      id: string
      sortOrder: number
      reps?: number
      weightKg?: number
      distanceMeters?: number
      durationSeconds?: number
      isWarmup: boolean
      completed: boolean
    }>
  }>
}

export interface SyncQueueEntry {
  id: string
  workout: BulkWorkoutPayload
  status: 'pending' | 'failed'
  attempts: number
  lastError?: string
  createdAt: string
}
```

- [ ] **Schritt 2: `tracker/src/lib/api.ts`**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}/api/v1${endpoint}`
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (res.status === 401) {
    window.location.href = 'https://go-tide.app/auth'
    throw new Error('Unauthorized')
  }
  return res
}
```

- [ ] **Schritt 3: TypeScript prüfen**

```bash
cd tracker && npx tsc --noEmit
```

Erwartung: keine Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add tracker/src/
git commit -m "feat(tracker): add TypeScript types and API client"
```

---

## Task 6: IndexedDB-Wrapper + Sync-Logik

**Files:**
- Create: `tracker/src/lib/db.ts`
- Create: `tracker/src/lib/sync.ts`

- [ ] **Schritt 1: `tracker/src/lib/db.ts`**

```typescript
import type { ActiveWorkout, SyncQueueEntry } from '@/types/tracker'

const DB_NAME = 'tide-tracker'
const DB_VERSION = 1

let _db: IDBDatabase | null = null

async function getDB(): Promise<IDBDatabase> {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('active_workout')) {
        db.createObjectStore('active_workout', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' })
      }
    }
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result
      resolve(_db)
    }
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(storeName: string, mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const req = op(transaction.objectStore(storeName))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export const saveActiveWorkout = (w: ActiveWorkout) => tx('active_workout', 'readwrite', (s) => s.put(w))
export const clearActiveWorkout = () => tx('active_workout', 'readwrite', (s) => s.clear())
export const getActiveWorkout = (): Promise<ActiveWorkout | undefined> =>
  getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction('active_workout', 'readonly').objectStore('active_workout').getAll()
        req.onsuccess = () => resolve((req.result as ActiveWorkout[])[0])
        req.onerror = () => reject(req.error)
      })
  )

export const addToSyncQueue = (entry: SyncQueueEntry) => tx('sync_queue', 'readwrite', (s) => s.put(entry))
export const updateSyncEntry = (entry: SyncQueueEntry) => tx('sync_queue', 'readwrite', (s) => s.put(entry))
export const removeSyncEntry = (id: string) => tx<undefined>('sync_queue', 'readwrite', (s) => s.delete(id))
export const getSyncQueue = (): Promise<SyncQueueEntry[]> =>
  getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction('sync_queue', 'readonly').objectStore('sync_queue').getAll()
        req.onsuccess = () => resolve(req.result as SyncQueueEntry[])
        req.onerror = () => reject(req.error)
      })
  )
```

- [ ] **Schritt 2: `tracker/src/lib/sync.ts`**

```typescript
import { apiFetch } from './api'
import * as idb from './db'

let syncing = false

export async function triggerSync(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const queue = await idb.getSyncQueue()
    for (const entry of queue) {
      try {
        const res = await apiFetch('/tracker/workouts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.workout),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await idb.removeSyncEntry(entry.id)
      } catch (e) {
        await idb.updateSyncEntry({
          ...entry,
          status: 'failed',
          attempts: entry.attempts + 1,
          lastError: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    }
  } finally {
    syncing = false
  }
}

export function initSyncListener(): () => void {
  const handler = () => triggerSync()
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
```

- [ ] **Schritt 3: Commit**

```bash
git add tracker/src/lib/db.ts tracker/src/lib/sync.ts
git commit -m "feat(tracker): add IndexedDB wrapper and online-event sync logic"
```

---

## Task 7: Analytics-Berechnungen

**Files:**
- Create: `tracker/src/lib/analytics.ts`

- [ ] **Schritt 1: `tracker/src/lib/analytics.ts`**

```typescript
import type { TrackerSet, TrackerWorkout, TrackingType } from '@/types/tracker'

export function calcVolume(sets: TrackerSet[]): number {
  return sets
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
}

export function calcOneRM(sets: TrackerSet[]): number {
  const values = sets
    .filter((s) => s.completed && !s.isWarmup && s.weightKg && s.reps && s.reps > 0)
    .map((s) => s.weightKg! * (1 + s.reps! / 30))
  return values.length > 0 ? Math.max(...values) : 0
}

export function calcPaceMinPerKm(durationSeconds: number, distanceMeters: number): number {
  if (distanceMeters === 0) return 0
  return durationSeconds / 60 / (distanceMeters / 1000)
}

export function formatPace(minPerKm: number): string {
  if (minPerKm === 0) return '—'
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')} /km`
}

export interface WorkoutDataPoint {
  date: string
  volume?: number
  oneRM?: number
  paceMinPerKm?: number
  distanceKm?: number
  durationMin?: number
}

export function buildChartData(
  workouts: TrackerWorkout[],
  exerciseId: string,
  trackingType: TrackingType
): WorkoutDataPoint[] {
  return workouts
    .filter((w) => w.finishedAt)
    .flatMap((w) => {
      const we = w.exercises.find((e) => e.exerciseId === exerciseId)
      if (!we) return []
      const sets = we.sets

      const point: WorkoutDataPoint = { date: w.startedAt.slice(0, 10) }

      if (trackingType === 'weight_reps') {
        point.volume = calcVolume(sets)
        point.oneRM = calcOneRM(sets)
      } else if (trackingType === 'distance_time') {
        const totalDist = sets.filter((s) => s.completed).reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0)
        const totalDur = sets.filter((s) => s.completed).reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)
        point.distanceKm = totalDist / 1000
        point.paceMinPerKm = calcPaceMinPerKm(totalDur, totalDist)
      } else {
        const totalDur = sets.filter((s) => s.completed).reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)
        point.durationMin = totalDur / 60
      }

      return [point]
    })
    .reverse()
}

export function calcStreak(workouts: TrackerWorkout[]): number {
  const days = new Set(workouts.filter((w) => w.finishedAt).map((w) => w.startedAt.slice(0, 10)))
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (days.has(key)) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  return streak
}

export function workoutsThisWeek(workouts: TrackerWorkout[]): number {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return workouts.filter((w) => w.finishedAt && new Date(w.startedAt) >= monday).length
}

export function volumeThisWeek(workouts: TrackerWorkout[]): number {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return workouts
    .filter((w) => w.finishedAt && new Date(w.startedAt) >= monday)
    .flatMap((w) => w.exercises.flatMap((e) => e.sets))
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
}
```

- [ ] **Schritt 2: TypeScript-Check**

```bash
cd tracker && npx tsc --noEmit
```

Erwartung: keine Fehler.

- [ ] **Schritt 3: Commit**

```bash
git add tracker/src/lib/analytics.ts
git commit -m "feat(tracker): add analytics calculation functions"
```

---

## Task 8: Zustand Store

**Files:**
- Create: `tracker/src/store/useTrackerStore.ts`

- [ ] **Schritt 1: Store anlegen**

```typescript
'use client'
import { create } from 'zustand'
import * as idb from '@/lib/db'
import { triggerSync as runSync } from '@/lib/sync'
import { apiFetch } from '@/lib/api'
import type {
  TrackerExercise,
  TrackerWorkout,
  ActiveWorkout,
  ActiveWorkoutExercise,
  TrackerSet,
  SyncQueueEntry,
  BulkWorkoutPayload,
} from '@/types/tracker'

interface TrackerState {
  exercises: TrackerExercise[]
  activeWorkout: ActiveWorkout | null
  workouts: TrackerWorkout[]
  syncQueue: SyncQueueEntry[]
  syncStatus: 'idle' | 'syncing' | 'error'

  loadFromDB: () => Promise<void>
  fetchExercises: () => Promise<void>
  createExercise: (name: string, category: string, defaultTrackingType: string) => Promise<void>
  startWorkout: (name: string) => Promise<void>
  addExerciseToWorkout: (exercise: TrackerExercise) => Promise<void>
  addSet: (workoutExerciseId: string, setData: Partial<TrackerSet>) => Promise<void>
  updateSet: (workoutExerciseId: string, setId: string, updates: Partial<TrackerSet>) => Promise<void>
  removeSet: (workoutExerciseId: string, setId: string) => Promise<void>
  finishWorkout: () => Promise<void>
  fetchWorkouts: () => Promise<void>
  refreshSyncQueue: () => Promise<void>
  triggerSync: () => Promise<void>
  exportQueue: () => void
  importQueue: (file: File) => Promise<void>
}

function uid(): string {
  return crypto.randomUUID()
}

export const useTrackerStore = create<TrackerState>((set, get) => ({
  exercises: [],
  activeWorkout: null,
  workouts: [],
  syncQueue: [],
  syncStatus: 'idle',

  loadFromDB: async () => {
    const [active, queue] = await Promise.all([idb.getActiveWorkout(), idb.getSyncQueue()])
    set({ activeWorkout: active ?? null, syncQueue: queue })
  },

  fetchExercises: async () => {
    const res = await apiFetch('/tracker/exercises')
    if (!res.ok) return
    const data: Array<{
      id: string; user_id: string | null; name: string
      category: string; default_tracking_type: string; created_at: string
    }> = await res.json()
    const exercises: TrackerExercise[] = data.map((e) => ({
      id: e.id,
      userId: e.user_id,
      name: e.name,
      category: e.category as TrackerExercise['category'],
      defaultTrackingType: e.default_tracking_type as TrackerExercise['defaultTrackingType'],
      createdAt: e.created_at,
    }))
    set({ exercises })
  },

  createExercise: async (name, category, defaultTrackingType) => {
    const res = await apiFetch('/tracker/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, default_tracking_type: defaultTrackingType }),
    })
    if (!res.ok) throw new Error('Failed to create exercise')
    await get().fetchExercises()
  },

  startWorkout: async (name) => {
    const workout: ActiveWorkout = {
      id: uid(),
      name,
      startedAt: new Date().toISOString(),
      exercises: [],
    }
    await idb.saveActiveWorkout(workout)
    set({ activeWorkout: workout })
  },

  addExerciseToWorkout: async (exercise) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const we: ActiveWorkoutExercise = {
      id: uid(),
      exercise,
      sortOrder: activeWorkout.exercises.length,
      sets: [],
    }
    const updated = { ...activeWorkout, exercises: [...activeWorkout.exercises, we] }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  addSet: async (workoutExerciseId, setData) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const updated = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((we) => {
        if (we.id !== workoutExerciseId) return we
        const newSet: TrackerSet = {
          id: uid(),
          sortOrder: we.sets.length,
          isWarmup: false,
          completed: false,
          ...setData,
        }
        return { ...we, sets: [...we.sets, newSet] }
      }),
    }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  updateSet: async (workoutExerciseId, setId, updates) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const updated = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((we) => {
        if (we.id !== workoutExerciseId) return we
        return {
          ...we,
          sets: we.sets.map((s) => (s.id === setId ? { ...s, ...updates } : s)),
        }
      }),
    }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  removeSet: async (workoutExerciseId, setId) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const updated = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((we) => {
        if (we.id !== workoutExerciseId) return we
        return { ...we, sets: we.sets.filter((s) => s.id !== setId) }
      }),
    }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  finishWorkout: async () => {
    const { activeWorkout } = get()
    if (!activeWorkout) return

    const payload: BulkWorkoutPayload = {
      id: activeWorkout.id,
      name: activeWorkout.name,
      startedAt: activeWorkout.startedAt,
      finishedAt: new Date().toISOString(),
      exercises: activeWorkout.exercises.map((we, eIdx) => ({
        id: we.id,
        exerciseId: we.exercise.id,
        sortOrder: eIdx,
        sets: we.sets.map((s, sIdx) => ({
          id: s.id,
          sortOrder: sIdx,
          reps: s.reps,
          weightKg: s.weightKg,
          distanceMeters: s.distanceMeters,
          durationSeconds: s.durationSeconds,
          isWarmup: s.isWarmup,
          completed: s.completed,
        })),
      })),
    }

    const entry: SyncQueueEntry = {
      id: activeWorkout.id,
      workout: payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    }

    await Promise.all([idb.addToSyncQueue(entry), idb.clearActiveWorkout()])
    const queue = await idb.getSyncQueue()
    set({ activeWorkout: null, syncQueue: queue })
    get().triggerSync()
  },

  fetchWorkouts: async () => {
    const res = await apiFetch('/tracker/workouts')
    if (!res.ok) return
    // API returns snake_case — map to camelCase TypeScript types
    const raw = await res.json()
    const workouts: TrackerWorkout[] = raw.map((w: any) => ({
      id: w.id,
      name: w.name,
      notes: w.notes,
      startedAt: w.started_at,
      finishedAt: w.finished_at,
      exercises: (w.exercises ?? []).map((we: any) => ({
        id: we.id,
        exerciseId: we.exercise_id,
        sortOrder: we.sort_order,
        exercise: we.exercise ? {
          id: we.exercise.id,
          userId: we.exercise.user_id,
          name: we.exercise.name,
          category: we.exercise.category,
          defaultTrackingType: we.exercise.default_tracking_type,
          createdAt: we.exercise.created_at,
        } : undefined,
        sets: (we.sets ?? []).map((s: any) => ({
          id: s.id,
          sortOrder: s.sort_order,
          reps: s.reps,
          weightKg: s.weight_kg,
          distanceMeters: s.distance_meters,
          durationSeconds: s.duration_seconds,
          isWarmup: s.is_warmup,
          completed: s.completed,
        })),
      })),
    }))
    set({ workouts })
  },

  refreshSyncQueue: async () => {
    const queue = await idb.getSyncQueue()
    set({ syncQueue: queue })
  },

  triggerSync: async () => {
    set({ syncStatus: 'syncing' })
    await runSync()
    const queue = await idb.getSyncQueue()
    set({ syncQueue: queue, syncStatus: queue.some((e) => e.status === 'failed') ? 'error' : 'idle' })
  },

  exportQueue: () => {
    const { syncQueue } = get()
    const data = syncQueue.map((e) => e.workout)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  importQueue: async (file) => {
    const text = await file.text()
    const payloads: BulkWorkoutPayload[] = JSON.parse(text)
    const entries: SyncQueueEntry[] = payloads.map((p) => ({
      id: p.id,
      workout: p,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    }))
    await Promise.all(entries.map(idb.addToSyncQueue))
    get().triggerSync()
  },
}))
```

- [ ] **Schritt 2: TypeScript prüfen**

```bash
cd tracker && npx tsc --noEmit
```

- [ ] **Schritt 3: Commit**

```bash
git add tracker/src/store/useTrackerStore.ts
git commit -m "feat(tracker): add Zustand store with offline-first workout state"
```

---

## Task 9: App Layout + BottomNav

**Files:**
- Create: `tracker/src/app/layout.tsx`
- Create: `tracker/src/components/BottomNav.tsx`
- Create: `tracker/src/app/globals.css`

- [ ] **Schritt 1: `tracker/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  background-color: #F5F4F0;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100dvh;
  font-family: Inter, system-ui, sans-serif;
}
```

- [ ] **Schritt 2: `tracker/src/components/BottomNav.tsx`**

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Dumbbell, History, BarChart2 } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/history', label: 'Verlauf', icon: History },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 flex justify-around py-2 z-50">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = path === href
        return (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 px-4 py-1">
            <Icon size={22} className={active ? 'text-black' : 'text-gray-400'} strokeWidth={active ? 2.5 : 1.8} />
            <span className={`text-[10px] font-medium ${active ? 'text-black' : 'text-gray-400'}`}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Schritt 3: `tracker/src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SyncInit from '@/components/SyncInit'

export const metadata: Metadata = {
  title: 'Tide Tracker',
  description: 'Sport Tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <main className="pb-20 min-h-dvh">
          {children}
        </main>
        <BottomNav />
        <SyncInit />
      </body>
    </html>
  )
}
```

- [ ] **Schritt 4: `tracker/src/components/SyncInit.tsx`** (initialisiert Sync-Listener einmalig)

```typescript
'use client'
import { useEffect } from 'react'
import { useTrackerStore } from '@/store/useTrackerStore'
import { initSyncListener } from '@/lib/sync'

export default function SyncInit() {
  const { loadFromDB, triggerSync } = useTrackerStore()

  useEffect(() => {
    loadFromDB()
    triggerSync()
    const cleanup = initSyncListener()
    return cleanup
  }, [])

  return null
}
```

- [ ] **Schritt 5: Dev-Server starten**

```bash
cd tracker && npm run dev
```

Öffne `http://localhost:3001` — Erwartung: leere Seite mit Bottom-Navigation, kein Fehler in der Konsole.

- [ ] **Schritt 6: Commit**

```bash
git add tracker/src/app/ tracker/src/components/BottomNav.tsx tracker/src/components/SyncInit.tsx
git commit -m "feat(tracker): add app layout, BottomNav, and sync initializer"
```

---

## Task 10: StatCard + Home Tab

**Files:**
- Create: `tracker/src/components/StatCard.tsx`
- Create: `tracker/src/components/SyncStatus.tsx`
- Create: `tracker/src/app/page.tsx`

- [ ] **Schritt 1: `tracker/src/components/StatCard.tsx`**

```typescript
interface StatCardProps {
  label: string
  value: string | number
  icon?: string
}

export default function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-1">
      <div className="text-2xl font-bold text-black">
        {icon && <span className="mr-1">{icon}</span>}
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
```

- [ ] **Schritt 2: `tracker/src/components/SyncStatus.tsx`**

```typescript
'use client'
import { useTrackerStore } from '@/store/useTrackerStore'

export default function SyncStatus() {
  const { syncQueue, syncStatus, triggerSync, exportQueue, importQueue } = useTrackerStore()
  const pending = syncQueue.filter((e) => e.status === 'pending').length
  const failed = syncQueue.filter((e) => e.status === 'failed').length

  if (syncQueue.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-800">
          {syncStatus === 'syncing' ? '⏳ Synchronisiere…' : failed > 0 ? `⚠️ ${failed} fehlgeschlagen` : `🕐 ${pending} ausstehend`}
        </span>
        <button
          onClick={() => triggerSync()}
          className="text-xs bg-black text-white rounded-full px-3 py-1"
        >
          Sync
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={exportQueue} className="text-xs text-gray-500 underline">
          Exportieren
        </button>
        <label className="text-xs text-gray-500 underline cursor-pointer">
          Importieren
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importQueue(e.target.files[0])}
          />
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 3: `tracker/src/app/page.tsx`**

```typescript
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTrackerStore } from '@/store/useTrackerStore'
import StatCard from '@/components/StatCard'
import SyncStatus from '@/components/SyncStatus'
import { calcStreak, workoutsThisWeek, volumeThisWeek } from '@/lib/analytics'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

export default function HomePage() {
  const { workouts, activeWorkout, fetchWorkouts } = useTrackerStore()
  const router = useRouter()

  useEffect(() => { fetchWorkouts() }, [])

  const streak = calcStreak(workouts)
  const thisWeek = workoutsThisWeek(workouts)
  const weekVol = volumeThisWeek(workouts)

  return (
    <div className="px-4 pt-12 pb-4">
      <h1 className="text-2xl font-bold text-black mb-0.5">{greeting()} 👋</h1>
      <p className="text-sm text-gray-500 mb-6">
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Streak" value={streak} icon="🔥" />
        <StatCard label="Diese Woche" value={thisWeek} />
        <StatCard label="Volumen (kg)" value={weekVol > 0 ? `${Math.round(weekVol / 1000)}t` : '—'} />
      </div>

      <SyncStatus />

      <div className="mt-6">
        {activeWorkout ? (
          <button
            onClick={() => router.push('/workout')}
            className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
          >
            Workout fortsetzen → {activeWorkout.name}
          </button>
        ) : (
          <button
            onClick={() => router.push('/workout')}
            className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
          >
            + Neues Workout starten
          </button>
        )}
      </div>

      {workouts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Letzte Sessions</h2>
          <div className="flex flex-col gap-2">
            {workouts.slice(0, 3).map((w) => (
              <div key={w.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="font-semibold text-black">{w.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(w.startedAt).toLocaleDateString('de-DE')} · {w.exercises.length} Übungen
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Schritt 4: Im Browser prüfen**

`http://localhost:3001` aufrufen. Erwartung: Greeting, 3 Stat-Cards (alle "—" oder 0), "Neues Workout starten" Button, kein Konsolen-Fehler.

- [ ] **Schritt 5: Commit**

```bash
git add tracker/src/components/StatCard.tsx tracker/src/components/SyncStatus.tsx tracker/src/app/page.tsx
git commit -m "feat(tracker): add Home tab with stats and sync status"
```

---

## Task 11: SetLogger Bottom Sheet

**Files:**
- Create: `tracker/src/components/SetLogger.tsx`

- [ ] **Schritt 1: `tracker/src/components/SetLogger.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import type { ActiveWorkoutExercise, TrackerSet } from '@/types/tracker'

interface SetLoggerProps {
  workoutExercise: ActiveWorkoutExercise
  onClose: () => void
}

export default function SetLogger({ workoutExercise, onClose }: SetLoggerProps) {
  const { addSet, updateSet, removeSet } = useTrackerStore()
  const ex = workoutExercise.exercise
  const type = ex.defaultTrackingType

  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [distance, setDistance] = useState('')
  const [duration, setDuration] = useState('')
  const [isWarmup, setIsWarmup] = useState(false)

  const catColor = ex.category === 'strength' ? 'bg-blue-500' : ex.category === 'cardio' ? 'bg-green-500' : 'bg-purple-500'

  async function handleAddSet() {
    const setData: Partial<TrackerSet> = { isWarmup, completed: true }
    if (type === 'weight_reps') {
      if (weight) setData.weightKg = parseFloat(weight)
      if (reps) setData.reps = parseInt(reps)
    } else if (type === 'distance_time') {
      if (distance) setData.distanceMeters = parseFloat(distance) * 1000
      if (duration) setData.durationSeconds = parseDuration(duration)
    } else {
      if (duration) setData.durationSeconds = parseDuration(duration)
    }
    await addSet(workoutExercise.id, setData)
    setWeight(''); setReps(''); setDistance(''); setDuration('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />

        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className={`w-1 h-6 rounded-full ${catColor}`} />
              <h2 className="text-xl font-bold text-black">{ex.name}</h2>
            </div>
            <p className="text-sm text-gray-500 ml-3">{ex.category}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-3 mb-4">
          {type === 'weight_reps' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Gewicht (kg)</label>
                <input
                  type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)}
                  className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                  placeholder="0"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Wiederholungen</label>
                <input
                  type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)}
                  className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                  placeholder="0"
                />
              </div>
            </div>
          )}
          {type === 'distance_time' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Distanz (km)</label>
                <input
                  type="number" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)}
                  className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                  placeholder="0.0"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Dauer (mm:ss)</label>
                <input
                  type="text" value={duration} onChange={(e) => setDuration(e.target.value)}
                  className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                  placeholder="00:00"
                />
              </div>
            </div>
          )}
          {type === 'time_only' && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Dauer (mm:ss)</label>
              <input
                type="text" value={duration} onChange={(e) => setDuration(e.target.value)}
                className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                placeholder="00:00"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={isWarmup} onChange={(e) => setIsWarmup(e.target.checked)} className="rounded" />
            Aufwärmsatz
          </label>
        </div>

        {/* Existing sets */}
        {workoutExercise.sets.length > 0 && (
          <div className="mb-4 flex flex-col gap-1">
            {workoutExercise.sets.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-sm text-gray-700">
                  Satz {i + 1}{s.isWarmup ? ' (W)' : ''}{' '}
                  {s.weightKg != null ? `${s.weightKg}kg` : ''}{s.reps != null ? ` × ${s.reps}` : ''}
                  {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(1)}km` : ''}
                  {s.durationSeconds != null ? ` ${formatSecs(s.durationSeconds)}` : ''}
                </span>
                <button onClick={() => removeSet(workoutExercise.id, s.id)} className="text-gray-300 hover:text-red-400">✕</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={handleAddSet} className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base">
          + Satz hinzufügen
        </button>
      </div>
    </div>
  )
}

function parseDuration(s: string): number {
  const parts = s.split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return parseInt(s) * 60
}

function formatSecs(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
```

- [ ] **Schritt 2: Commit**

```bash
git add tracker/src/components/SetLogger.tsx
git commit -m "feat(tracker): add SetLogger bottom sheet for set input"
```

---

## Task 12: Workout Tab + ExercisePicker

**Files:**
- Create: `tracker/src/components/ExercisePicker.tsx`
- Create: `tracker/src/app/workout/page.tsx`

- [ ] **Schritt 1: `tracker/src/components/ExercisePicker.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import type { TrackerExercise } from '@/types/tracker'

const CATEGORY_LABELS = { strength: 'Kraft', cardio: 'Cardio', flexibility: 'Beweglichkeit' }
const CATEGORY_COLORS = { strength: 'bg-blue-100 text-blue-700', cardio: 'bg-green-100 text-green-700', flexibility: 'bg-purple-100 text-purple-700' }

interface ExercisePickerProps {
  onSelect: (exercise: TrackerExercise) => void
  onClose: () => void
}

export default function ExercisePicker({ onSelect, onClose }: ExercisePickerProps) {
  const { exercises } = useTrackerStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)

  const filtered = exercises.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter == null || e.category === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl shadow-2xl p-6 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Übung wählen</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="w-full bg-gray-50 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
          />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(['strength', 'cardio', 'flexibility'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(filter === cat ? null : cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${filter === cat ? CATEGORY_COLORS[cat] : 'bg-gray-100 text-gray-600'}`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex flex-col gap-2">
          {filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => { onSelect(ex); onClose() }}
              className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 text-left hover:bg-gray-100"
            >
              <div className={`w-2 h-2 rounded-full ${ex.category === 'strength' ? 'bg-blue-500' : ex.category === 'cardio' ? 'bg-green-500' : 'bg-purple-500'}`} />
              <div>
                <div className="text-sm font-medium text-black">{ex.name}</div>
                <div className="text-xs text-gray-400">{CATEGORY_LABELS[ex.category]}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: `tracker/src/app/workout/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, CheckCircle } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import ExercisePicker from '@/components/ExercisePicker'
import SetLogger from '@/components/SetLogger'
import type { ActiveWorkoutExercise, TrackerExercise } from '@/types/tracker'

export default function WorkoutPage() {
  const { activeWorkout, startWorkout, addExerciseToWorkout, finishWorkout, fetchExercises } = useTrackerStore()
  const router = useRouter()
  const [showPicker, setShowPicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState<ActiveWorkoutExercise | null>(null)
  const [workoutName, setWorkoutName] = useState('')

  useEffect(() => { fetchExercises() }, [])

  async function handleStart() {
    const name = workoutName.trim() || 'Training'
    await startWorkout(name)
  }

  async function handleFinish() {
    await finishWorkout()
    router.push('/')
  }

  async function handleSelectExercise(ex: TrackerExercise) {
    await addExerciseToWorkout(ex)
  }

  if (!activeWorkout) {
    return (
      <div className="px-4 pt-12">
        <h1 className="text-2xl font-bold mb-6">Neues Workout</h1>
        <input
          type="text"
          value={workoutName}
          onChange={(e) => setWorkoutName(e.target.value)}
          placeholder="Name (z.B. Push Day)"
          className="w-full bg-white rounded-2xl px-4 py-4 text-lg font-medium outline-none shadow-sm mb-4"
        />
        <button onClick={handleStart} className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base">
          Starten
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-1">{activeWorkout.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gestartet: {new Date(activeWorkout.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
      </p>

      <div className="flex flex-col gap-3 mb-4">
        {activeWorkout.exercises.map((we) => {
          const completedSets = we.sets.filter((s) => s.completed).length
          return (
            <button
              key={we.id}
              onClick={() => setActiveExercise(we)}
              className="bg-white rounded-2xl p-4 shadow-sm text-left flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${we.exercise.category === 'strength' ? 'bg-blue-500' : we.exercise.category === 'cardio' ? 'bg-green-500' : 'bg-purple-500'}`} />
                  <span className="font-semibold text-black">{we.exercise.name}</span>
                </div>
                <span className="text-xs text-gray-500 ml-4">{completedSets} Sätze</span>
              </div>
              {completedSets > 0 && <CheckCircle size={18} className="text-green-500" />}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setShowPicker(true)}
        className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-gray-500 mb-4"
      >
        <Plus size={18} /> Übung hinzufügen
      </button>

      <button onClick={handleFinish} className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base">
        Workout beenden ✓
      </button>

      {showPicker && (
        <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />
      )}
      {activeExercise && (
        <SetLogger
          workoutExercise={activeWorkout.exercises.find((e) => e.id === activeExercise.id) ?? activeExercise}
          onClose={() => setActiveExercise(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Schritt 3: Im Browser testen**

`http://localhost:3001/workout` aufrufen → Workout starten → Übung hinzufügen → Bottom Sheet öffnet sich → Satz eingeben → "Satz hinzufügen" → Satz erscheint in der Liste.

- [ ] **Schritt 4: Commit**

```bash
git add tracker/src/components/ExercisePicker.tsx tracker/src/app/workout/
git commit -m "feat(tracker): add Workout tab with ExercisePicker and SetLogger integration"
```

---

## Task 13: History Tab

**Files:**
- Create: `tracker/src/app/history/page.tsx`

- [ ] **Schritt 1: `tracker/src/app/history/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import type { TrackerWorkout } from '@/types/tracker'

function durationStr(w: TrackerWorkout): string {
  if (!w.finishedAt) return 'Aktiv'
  const ms = new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()
  const mins = Math.round(ms / 60000)
  return `${mins} Min`
}

export default function HistoryPage() {
  const { workouts, fetchWorkouts } = useTrackerStore()
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { fetchWorkouts() }, [])

  if (workouts.length === 0) {
    return (
      <div className="px-4 pt-12 text-center text-gray-400 mt-20">
        <p className="text-4xl mb-4">🏋️</p>
        <p className="font-medium">Noch keine Workouts</p>
        <p className="text-sm mt-1">Starte dein erstes Training!</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-6">Verlauf</h1>
      <div className="flex flex-col gap-3">
        {workouts.map((w) => (
          <div key={w.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              className="w-full p-4 text-left flex items-center justify-between"
              onClick={() => setExpanded(expanded === w.id ? null : w.id)}
            >
              <div>
                <div className="font-semibold text-black">{w.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(w.startedAt).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}{durationStr(w)}{' · '}{w.exercises.length} Übungen
                </div>
              </div>
              {expanded === w.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>

            {expanded === w.id && (
              <div className="px-4 pb-4 border-t border-gray-50">
                {w.exercises.map((we) => (
                  <div key={we.id} className="mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${we.exercise?.category === 'strength' ? 'bg-blue-500' : we.exercise?.category === 'cardio' ? 'bg-green-500' : 'bg-purple-500'}`} />
                      <span className="text-sm font-medium">{we.exercise?.name ?? we.exerciseId}</span>
                    </div>
                    {we.sets.filter((s) => s.completed).map((s, i) => (
                      <div key={s.id} className="text-xs text-gray-500 ml-4">
                        Satz {i + 1}{s.isWarmup ? ' (W)' : ''}:
                        {s.weightKg != null ? ` ${s.weightKg}kg` : ''}
                        {s.reps != null ? ` × ${s.reps}` : ''}
                        {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(2)}km` : ''}
                        {s.durationSeconds != null ? ` ${Math.floor(s.durationSeconds / 60)}:${(s.durationSeconds % 60).toString().padStart(2, '0')}` : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: Commit**

```bash
git add tracker/src/app/history/
git commit -m "feat(tracker): add History tab with expandable workout details"
```

---

## Task 14: Stats Tab

**Files:**
- Create: `tracker/src/app/stats/page.tsx`

- [ ] **Schritt 1: `tracker/src/app/stats/page.tsx`**

```typescript
'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useTrackerStore } from '@/store/useTrackerStore'
import { buildChartData, formatPace } from '@/lib/analytics'
import type { TrackerExercise } from '@/types/tracker'

export default function StatsPage() {
  const { workouts, exercises, fetchWorkouts, fetchExercises } = useTrackerStore()
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    fetchWorkouts()
    fetchExercises()
  }, [])

  useEffect(() => {
    if (!selectedId && exercises.length > 0) setSelectedId(exercises[0].id)
  }, [exercises])

  const selected = exercises.find((e) => e.id === selectedId)
  const chartData = useMemo(
    () => (selected ? buildChartData(workouts, selectedId, selected.defaultTrackingType) : []),
    [workouts, selectedId, selected]
  )

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-6">Statistiken</h1>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="w-full bg-white rounded-2xl px-4 py-3 text-sm font-medium shadow-sm outline-none mb-6"
      >
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>{ex.name}</option>
        ))}
      </select>

      {chartData.length === 0 && (
        <div className="text-center text-gray-400 mt-20">
          <p className="text-4xl mb-4">📊</p>
          <p className="font-medium">Noch keine Daten</p>
          <p className="text-sm mt-1">Tracke diese Übung, um Statistiken zu sehen.</p>
        </div>
      )}

      {chartData.length > 0 && selected?.defaultTrackingType === 'weight_reps' && (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Volumen (kg total)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`${Math.round(v)} kg`, 'Volumen']} />
                <Line type="monotone" dataKey="volume" stroke="#3B82F6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Geschätztes 1RM (Epley)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`${Math.round(v)} kg`, '1RM']} />
                <Line type="monotone" dataKey="oneRM" stroke="#8B5CF6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {chartData.length > 0 && selected?.defaultTrackingType === 'distance_time' && (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Pace (min/km)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.floor(v)}:${Math.round((v % 1) * 60).toString().padStart(2, '0')}`} />
                <Tooltip formatter={(v: number) => [formatPace(v), 'Pace']} />
                <Line type="monotone" dataKey="paceMinPerKm" stroke="#22C55E" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Distanz (km)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)} km`, 'Distanz']} />
                <Bar dataKey="distanceKm" fill="#22C55E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {chartData.length > 0 && selected?.defaultTrackingType === 'time_only' && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Dauer (Minuten)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [`${Math.round(v)} min`, 'Dauer']} />
              <Bar dataKey="durationMin" fill="#A855F7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Schritt 2: Im Browser prüfen**

`http://localhost:3001/stats` — Übungs-Picker erscheint, nach erstem echten Workout zeigen Charts Daten.

- [ ] **Schritt 3: Finaler TypeScript-Check**

```bash
cd tracker && npx tsc --noEmit
```

Erwartung: keine Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add tracker/src/app/stats/ tracker/src/app/history/
git commit -m "feat(tracker): add Stats tab with Recharts visualizations"
```

---

## Task 15: End-to-End-Test des vollen Flows

- [ ] **Schritt 1: Backend + Frontend starten**

Terminal 1:
```bash
cd cloud && go run ./cmd/server
```
Terminal 2:
```bash
cd tracker && npm run dev
```

- [ ] **Schritt 2: Workout-Flow testen**

1. `http://localhost:3001` aufrufen → Home erscheint
2. → Workout-Tab → Name eingeben → Starten
3. → Übung hinzufügen (z.B. "Bench Press")
4. → Karte antippen → Bottom Sheet öffnet sich
5. → 100kg, 8 Reps eingeben → "Satz hinzufügen"
6. → Zweiten Satz eingeben → Fertig
7. → "Workout beenden ✓"
8. → Redirect auf Home → SyncStatus erscheint kurz, verschwindet nach erfolgreichem Sync

- [ ] **Schritt 3: Offline-Flow testen**

1. Netzwerk in DevTools auf "Offline" setzen
2. Neues Workout starten und beenden
3. → SyncStatus zeigt "1 ausstehend"
4. → Netzwerk wieder aktivieren → Auto-Sync läuft → SyncStatus verschwindet
5. → History-Tab zeigt beide Workouts

- [ ] **Schritt 4: Export/Import testen**

1. Offline ein Workout beenden
2. → SyncStatus → "Exportieren" klicken → JSON-Datei wird heruntergeladen
3. Sync-Queue in IndexedDB löschen (DevTools → Application → IndexedDB → sync_queue → Clear)
4. → "Importieren" → JSON-Datei hochladen → SyncStatus erscheint → Sync läuft

- [ ] **Schritt 5: Finaler Commit**

```bash
git add .
git commit -m "feat(tracker): complete sport tracker prototype - offline-first with IndexedDB sync"
```
