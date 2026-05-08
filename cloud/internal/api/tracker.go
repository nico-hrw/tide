package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
	r.Delete("/exercises/{id}", h.DeleteExercise)
	r.Get("/workouts", h.ListWorkouts)
	r.Post("/workouts/bulk", h.BulkSaveWorkout)
	r.Delete("/workouts/{id}", h.DeleteWorkout)
}

// ── Request / Response types ──────────────────────────────────────────────────

type trackerExercise struct {
	ID                  string   `json:"id"`
	UserID              *string  `json:"user_id"`
	Name                string   `json:"name"`
	Category            string   `json:"category"`
	DefaultTrackingType string   `json:"default_tracking_type"`
	Muscles             string   `json:"muscles"`
	PrimaryMuscles      []string `json:"primary_muscles"`
	SecondaryMuscles    []string `json:"secondary_muscles"`
	CreatedAt           string   `json:"created_at"`
}

type createExerciseRequest struct {
	Name                string   `json:"name"`
	Category            string   `json:"category"`
	DefaultTrackingType string   `json:"default_tracking_type"`
	Muscles             string   `json:"muscles"`
	PrimaryMuscles      []string `json:"primary_muscles"`
	SecondaryMuscles    []string `json:"secondary_muscles"`
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
	Rir             *int     `json:"rir"`
	Rpe             *float64 `json:"rpe"`
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
	Rir             *int     `json:"rir"`
	Rpe             *float64 `json:"rpe"`
}

type trackerWorkoutExercise struct {
	ID         string           `json:"id"`
	ExerciseID string           `json:"exercise_id"`
	Exercise   *trackerExercise `json:"exercise,omitempty"`
	SortOrder  int              `json:"sort_order"`
	Sets       []trackerSet     `json:"sets"`
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
		SELECT id, user_id, name, category, default_tracking_type, muscles, primary_muscles, secondary_muscles, created_at
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
		var primaryStr, secondaryStr string
		if err := rows.Scan(&e.ID, &uid, &e.Name, &e.Category, &e.DefaultTrackingType, &e.Muscles, &primaryStr, &secondaryStr, &createdAt); err != nil {
			http.Error(w, "Failed to scan exercise", http.StatusInternalServerError)
			return
		}
		if uid.Valid {
			e.UserID = &uid.String
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		if primaryStr != "" {
			e.PrimaryMuscles = strings.Split(primaryStr, ",")
		} else {
			e.PrimaryMuscles = []string{}
		}
		if secondaryStr != "" {
			e.SecondaryMuscles = strings.Split(secondaryStr, ",")
		} else {
			e.SecondaryMuscles = []string{}
		}
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

	id := trackerGenerateID()
	now := time.Now()
	_, err := h.Store.DB.ExecContext(r.Context(), `
		INSERT INTO ext_tracker_exercises (id, user_id, name, category, default_tracking_type, muscles, primary_muscles, secondary_muscles, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, userID, req.Name, req.Category, req.DefaultTrackingType, req.Muscles,
		strings.Join(req.PrimaryMuscles, ","), strings.Join(req.SecondaryMuscles, ","), now)
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
				INSERT INTO ext_tracker_sets (id, workout_exercise_id, sort_order, reps, weight_kg, distance_meters, duration_seconds, is_warmup, completed, rir, rpe)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, s.ID, ex.ID, s.SortOrder, s.Reps, s.WeightKg, s.DistanceMeters, s.DurationSeconds, s.IsWarmup, s.Completed, s.Rir, s.Rpe)
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
		       e.name, e.category, e.default_tracking_type, e.primary_muscles, e.secondary_muscles
		FROM ext_tracker_workout_exercises we
		JOIN ext_tracker_exercises e ON e.id = we.exercise_id
		WHERE we.workout_id IN (
			SELECT id FROM ext_tracker_workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?
		)
		ORDER BY we.workout_id, we.sort_order
	`, userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to list workout exercises", http.StatusInternalServerError)
		return
	}
	defer exRows.Close()

	exIndex := map[string]map[string]int{}
	for exRows.Next() {
		var we trackerWorkoutExercise
		var wID string
		var ex trackerExercise
		var primaryStr, secondaryStr string
		if err := exRows.Scan(&we.ID, &wID, &we.ExerciseID, &we.SortOrder, &ex.Name, &ex.Category, &ex.DefaultTrackingType, &primaryStr, &secondaryStr); err != nil {
			http.Error(w, "Failed to scan workout exercise", http.StatusInternalServerError)
			return
		}
		ex.ID = we.ExerciseID
		if primaryStr != "" {
			ex.PrimaryMuscles = strings.Split(primaryStr, ",")
		} else {
			ex.PrimaryMuscles = []string{}
		}
		if secondaryStr != "" {
			ex.SecondaryMuscles = strings.Split(secondaryStr, ",")
		} else {
			ex.SecondaryMuscles = []string{}
		}
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
		       s.distance_meters, s.duration_seconds, s.is_warmup, s.completed, s.rir, s.rpe
		FROM ext_tracker_sets s
		JOIN ext_tracker_workout_exercises we ON we.id = s.workout_exercise_id
		WHERE we.workout_id IN (
			SELECT id FROM ext_tracker_workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?
		)
		ORDER BY we.sort_order, s.sort_order
	`, userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to list sets", http.StatusInternalServerError)
		return
	}
	defer sRows.Close()

	for sRows.Next() {
		var s trackerSet
		var weID string
		var reps, durationSeconds, rir sql.NullInt64
		var weightKg, distanceMeters, rpe sql.NullFloat64
		if err := sRows.Scan(&s.ID, &weID, &s.SortOrder, &reps, &weightKg, &distanceMeters, &durationSeconds, &s.IsWarmup, &s.Completed, &rir, &rpe); err != nil {
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
		if rir.Valid {
			v := int(rir.Int64)
			s.Rir = &v
		}
		if rpe.Valid {
			s.Rpe = &rpe.Float64
		}

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

func (h *TrackerHandler) DeleteExercise(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	_, err := h.Store.DB.ExecContext(r.Context(),
		`DELETE FROM ext_tracker_exercises WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		http.Error(w, "Failed to delete exercise", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *TrackerHandler) DeleteWorkout(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	_, err := h.Store.DB.ExecContext(r.Context(),
		`DELETE FROM ext_tracker_workouts WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		http.Error(w, "Failed to delete workout", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func trackerGenerateID() string {
	return uuid.New().String()
}
