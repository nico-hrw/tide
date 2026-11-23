package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type ExternalHandler struct {
	Store     *store.SQLiteStore
	BlobStore store.BlobStore
	Broker    *Broker
}

func NewExternalHandler(s *store.SQLiteStore, b ...store.BlobStore) *ExternalHandler {
	h := &ExternalHandler{Store: s}
	if len(b) > 0 {
		h.BlobStore = b[0]
	}
	return h
}

func (h *ExternalHandler) WithBroker(b *Broker) *ExternalHandler {
	h.Broker = b
	return h
}

func (h *ExternalHandler) broadcastToUser(userID, message string) {
	if h.Broker != nil && userID != "" {
		h.Broker.Broadcast(userID, message)
	}
}

func (h *ExternalHandler) broadcastToFileUsers(fileID, ownerID, message string) {
	if h.Broker == nil {
		return
	}
	seen := make(map[string]bool)
	if ownerID != "" {
		seen[ownerID] = true
		h.Broker.Broadcast(ownerID, message)
	}
	if fileID == "" || h.Store == nil {
		return
	}
	shares, err := h.Store.ListSharesForFile(context.Background(), fileID)
	if err != nil {
		return
	}
	for _, s := range shares {
		if s.UserID != "" && !seen[s.UserID] {
			seen[s.UserID] = true
			h.Broker.Broadcast(s.UserID, message)
		}
	}
}

func writeExternalJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func writeExternalError(w http.ResponseWriter, status int, errTitle, message string) {
	writeExternalJSON(w, status, map[string]string{"error": errTitle, "message": message})
}

// tokenMatchesScope checks whether tokenScopes satisfy at least one required scope.
// Empty requiredScopes matches any valid token.
func tokenMatchesScope(tokenScopes []string, requiredScopes []string) bool {
	if len(requiredScopes) == 0 {
		return true
	}
	for _, sc := range tokenScopes {
		if sc == "*" {
			return true
		}
		for _, req := range requiredScopes {
			if sc == req {
				return true
			}
			// Write scope implies read scope (never vice versa).
			if strings.HasSuffix(req, ":read") && sc == strings.TrimSuffix(req, ":read")+":write" {
				return true
			}
			if (req == "todos:create" || req == "todos:edit" || req == "todos:delete") && sc == "todos:write" {
				return true
			}
			if (req == "surveys:create" || req == "surveys:delete") && sc == "surveys:write" {
				return true
			}
			// safe:... and folder:... narrow read access only; they never grant write access.
			if (req == "notes:read" || req == "folders:read" || req == "workspaces:read") &&
				(strings.HasPrefix(sc, "safe:") || strings.HasPrefix(sc, "folder:")) {
				return true
			}
		}
	}
	return false
}

func validateJWTToken(tokenString string) (string, bool) {
	jwtKeyStr := os.Getenv("JWT_SECRET")
	if jwtKeyStr == "" || tokenString == "" {
		return "", false
	}
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, http.ErrAbortHandler
		}
		return []byte(jwtKeyStr), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil || token == nil || !token.Valid {
		return "", false
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", false
	}
	userID, ok := claims["sub"].(string)
	return userID, ok && userID != ""
}

func extractBearer(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}

func authenticatePAT(w http.ResponseWriter, r *http.Request, s *store.SQLiteStore, tokenString string, requiredScopes []string) (*http.Request, bool) {
	hashBytes := sha256.Sum256([]byte(tokenString))
	apiToken, err := s.GetAPITokenByHash(r.Context(), hex.EncodeToString(hashBytes[:]))
	if err != nil {
		writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Invalid API token")
		return nil, false
	}
	if apiToken.ExpiresAt != nil && time.Now().After(*apiToken.ExpiresAt) {
		writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "API token has expired")
		return nil, false
	}
	if !tokenMatchesScope(apiToken.Scopes, requiredScopes) {
		reqDesc := strings.Join(requiredScopes, " or ")
		writeExternalJSON(w, http.StatusForbidden, map[string]interface{}{
			"error": "Forbidden", "message": "Token lacks required scope '" + reqDesc + "'",
			"required_scope": reqDesc, "required_scopes": requiredScopes, "token_scopes": apiToken.Scopes,
		})
		return nil, false
	}
	go func(tokenID string) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.UpdateAPITokenLastUsed(ctx, tokenID, time.Now())
	}(apiToken.ID)
	ctx := context.WithValue(r.Context(), "user_id", apiToken.UserID)
	ctx = context.WithValue(ctx, "api_token_id", apiToken.ID)
	ctx = context.WithValue(ctx, "token_scopes", apiToken.Scopes)
	return r.WithContext(ctx), true
}

// APITokenAuth middleware validates Bearer, X-API-Key, or ?api_token= tokens against api_tokens.
func APITokenAuth(s *store.SQLiteStore, requiredScopes ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenString := extractBearer(r)
			if tokenString == "" {
				tokenString = strings.TrimSpace(r.Header.Get("X-API-Key"))
			}
			if tokenString == "" {
				tokenString = strings.TrimSpace(r.URL.Query().Get("api_token"))
			}
			if tokenString == "" {
				writeExternalError(w, http.StatusUnauthorized, "Unauthorized",
					"Missing API token. Provide via 'Authorization: Bearer <token>' or 'X-API-Key: <token>' header.")
				return
			}
			if authedReq, ok := authenticatePAT(w, r, s, tokenString, requiredScopes); ok {
				next.ServeHTTP(w, authedReq)
			}
		})
	}
}

// DualAuthMiddleware accepts both PATs and JWT session auth without header conflicts.
func DualAuthMiddleware(s *store.SQLiteStore, requiredScopes ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			explicitPAT := strings.TrimSpace(r.Header.Get("X-API-Key"))
			if explicitPAT == "" {
				explicitPAT = strings.TrimSpace(r.URL.Query().Get("api_token"))
			}
			bearerVal := extractBearer(r)
			if explicitPAT == "" && strings.HasPrefix(bearerVal, "tide_pat_") {
				explicitPAT = bearerVal
			}
			if explicitPAT != "" {
				if authedReq, ok := authenticatePAT(w, r, s, explicitPAT, requiredScopes); ok {
					next.ServeHTTP(w, authedReq)
				}
				return
			}
			if uid, ok := r.Context().Value("user_id").(string); ok && uid != "" {
				next.ServeHTTP(w, r)
				return
			}
			if bearerVal != "" {
				if userID, ok := validateJWTToken(bearerVal); ok {
					next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), "user_id", userID)))
					return
				}
				if !(strings.Count(bearerVal, ".") == 2 && !strings.HasPrefix(bearerVal, "tide_pat_")) {
					if authedReq, ok := authenticatePAT(w, r, s, bearerVal, requiredScopes); ok {
						next.ServeHTTP(w, authedReq)
					}
					return
				}
				writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Missing or invalid authentication token")
				return
			}
			if cookie, err := r.Cookie("tide_session"); err == nil && cookie.Value != "" {
				if userID, ok := validateJWTToken(cookie.Value); ok {
					next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), "user_id", userID)))
					return
				}
			}
			writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Missing or invalid authentication token")
		})
	}
}

// GetTokenInfo returns safe metadata for the authenticated API token and its owner.
func (h *ExternalHandler) GetTokenInfo(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value("user_id").(string)
	tokenID, _ := r.Context().Value("api_token_id").(string)
	scopes, _ := r.Context().Value("token_scopes").([]string)
	if userID == "" {
		writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Missing user identity")
		return
	}
	if scopes == nil {
		scopes = []string{}
	}
	username := ""
	if user, err := h.Store.GetUser(r.Context(), userID); err == nil && user != nil {
		username = user.Username
	}
	resp := map[string]interface{}{"user_id": userID, "username": username, "token_id": tokenID, "scopes": scopes}
	if tokenID != "" {
		if tokens, err := h.Store.ListAPITokensForUser(r.Context(), userID); err == nil {
			for _, t := range tokens {
				if t.ID == tokenID {
					resp["name"], resp["token_prefix"], resp["expires_at"], resp["created_at"] = t.Name, t.TokenPrefix, t.ExpiresAt, t.CreatedAt
					break
				}
			}
		}
	}
	writeExternalJSON(w, http.StatusOK, resp)
}

func (h *ExternalHandler) RegisterRoutes(r chi.Router) {
	auth := func(scopes ...string) func(http.Handler) http.Handler {
		return APITokenAuth(h.Store, scopes...)
	}
	mountCRUD := func(prefix, res string, list, get, create, update, del http.HandlerFunc) {
		r.Group(func(r chi.Router) {
			r.Use(auth(res + ":read"))
			r.Get(prefix, list)
			r.Get(prefix+"/{id}", get)
		})
		r.Group(func(r chi.Router) {
			r.Use(auth(res + ":write"))
			r.Post(prefix, create)
			r.Put(prefix+"/{id}", update)
			r.Patch(prefix+"/{id}", update)
			r.Delete(prefix+"/{id}", del)
		})
	}

	r.With(auth()).Get("/me", h.GetTokenInfo)
	mountCRUD("/events", "events", h.ListEvents, h.GetEvent, h.CreateEvent, h.UpdateEvent, h.DeleteEvent)
	mountCRUD("/notes", "notes", h.ListNotes, h.GetNote, h.CreateNote, h.UpdateNote, h.DeleteNote)
	mountCRUD("/folders", "folders", h.ListFolders, h.GetFolder, h.CreateFolder, h.UpdateFolder, h.DeleteFolder)
	mountCRUD("/tags", "tags", h.ListTags, h.GetTag, h.CreateTag, h.UpdateTag, h.DeleteTag)

	r.With(auth("workspaces:read")).Get("/workspaces", h.ListWorkspaces)
	r.Group(func(r chi.Router) {
		r.Use(auth("workspaces:write"))
		r.Post("/workspaces", h.CreateWorkspace)
		r.Put("/workspaces/active", h.SetActiveWorkspaces)
		r.Put("/workspaces/{name}", h.UpdateWorkspace)
		r.Patch("/workspaces/{name}", h.UpdateWorkspace)
		r.Delete("/workspaces/{name}", h.DeleteWorkspace)
	})
	r.With(auth("settings:read")).Get("/settings", h.GetSettings)
	r.Group(func(r chi.Router) {
		r.Use(auth("settings:write"))
		r.Put("/settings", h.UpdateSettings)
		r.Patch("/settings", h.UpdateSettings)
	})

	r.Route("/todos", NewTodosHandler(h.Store).WithBroker(h.Broker).RegisterRoutes)
	r.Route("/surveys", NewSurveysHandler(h.Store).RegisterRoutes)
}

type externalFileMeta struct {
	Safe        string      `json:"safe"`
	LinkedSafes []string    `json:"linkedSafes"`
	DeletedAt   interface{} `json:"deleted_at"`
	IsGroup     bool        `json:"isGroup"`
}

func parseExternalFileMeta(raw json.RawMessage) externalFileMeta {
	var meta externalFileMeta
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &meta)
	}
	return meta
}

func extractScopes(r *http.Request) (safes []string, folders []string) {
	scopes, _ := r.Context().Value("token_scopes").([]string)
	for _, sc := range scopes {
		if strings.HasPrefix(sc, "safe:") {
			if s := strings.TrimSpace(strings.TrimPrefix(sc, "safe:")); s != "" {
				safes = append(safes, s)
			}
		} else if strings.HasPrefix(sc, "folder:") {
			if f := strings.TrimSpace(strings.TrimPrefix(sc, "folder:")); f != "" {
				folders = append(folders, f)
			}
		}
	}
	return
}

func normSafeName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "Standard" {
		return "main"
	}
	return s
}

func isSoftDeleted(file *db.File) bool {
	if file == nil {
		return false
	}
	meta := parseExternalFileMeta(file.Metadata)
	if meta.DeletedAt == nil {
		return false
	}
	if s, ok := meta.DeletedAt.(string); ok {
		return strings.TrimSpace(s) != ""
	}
	return true
}

func isGroupFolder(file *db.File) bool {
	if file == nil {
		return false
	}
	return parseExternalFileMeta(file.PublicMeta).IsGroup || parseExternalFileMeta(file.Metadata).IsGroup
}

func (h *ExternalHandler) walkAncestors(ctx context.Context, file *db.File, userID string, visit func(*db.File) bool) {
	if file == nil {
		return
	}
	if userID == "" {
		userID = file.OwnerID
	}
	visited := map[string]bool{file.ID: true}
	currParentID := file.ParentID
	for depth := 0; depth < 50 && currParentID != nil && *currParentID != ""; depth++ {
		if visited[*currParentID] {
			break
		}
		visited[*currParentID] = true
		parent, err := h.Store.GetAccessibleFile(ctx, *currParentID, userID)
		if err != nil {
			break
		}
		if visit(parent) {
			return
		}
		currParentID = parent.ParentID
	}
}

func (h *ExternalHandler) getFileSafe(ctx context.Context, file *db.File) string {
	if file == nil {
		return "main"
	}
	return h.getFileSafeForUser(ctx, file, file.OwnerID)
}

func (h *ExternalHandler) getFileSafeForUser(ctx context.Context, file *db.File, userID string) string {
	if file == nil {
		return "main"
	}
	if meta := parseExternalFileMeta(file.Metadata); meta.Safe != "" {
		return normSafeName(meta.Safe)
	}
	found := "main"
	h.walkAncestors(ctx, file, userID, func(parent *db.File) bool {
		if meta := parseExternalFileMeta(parent.Metadata); meta.Safe != "" {
			found = normSafeName(meta.Safe)
			return true
		}
		return false
	})
	return found
}

func (h *ExternalHandler) noteMatchesScope(ctx context.Context, file *db.File, safes []string, folders []string) bool {
	if file == nil {
		return false
	}
	return h.fileMatchesScopeForUser(ctx, file, file.OwnerID, safes, folders)
}

func (h *ExternalHandler) fileMatchesScopeForUser(ctx context.Context, file *db.File, userID string, safes []string, folders []string) bool {
	if len(safes) == 0 && len(folders) == 0 {
		return true
	}
	if file == nil {
		return false
	}
	if len(folders) > 0 {
		hasID := func(id string) bool {
			for _, fID := range folders {
				if id == fID {
					return true
				}
			}
			return false
		}
		matched := hasID(file.ID)
		if !matched {
			h.walkAncestors(ctx, file, userID, func(p *db.File) bool {
				if hasID(p.ID) {
					matched = true
					return true
				}
				return false
			})
		}
		if !matched {
			return false
		}
	}
	if len(safes) > 0 {
		fileSafe := h.getFileSafeForUser(ctx, file, userID)
		linked := parseExternalFileMeta(file.Metadata).LinkedSafes
		for _, s := range safes {
			ns := normSafeName(s)
			if ns == fileSafe {
				return true
			}
			for _, ls := range linked {
				if normSafeName(ls) == ns {
					return true
				}
			}
		}
		return false
	}
	return true
}
