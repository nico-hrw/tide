package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ValidateJWTSecret must be called once at server startup.
// In production, it returns an error if JWT_SECRET is shorter than 32 characters.
// In non-production environments, it terminates if JWT_SECRET is empty and logs
// a warning if it is shorter than 32 characters.
func ValidateJWTSecret() error {
	secret := os.Getenv("JWT_SECRET")
	if strings.EqualFold(os.Getenv("ENV"), "production") {
		if len(secret) < 32 {
			return errors.New("JWT_SECRET must be at least 32 characters in production")
		}
		return nil
	}
	if secret == "" {
		log.Fatal("[SECURITY FATAL] JWT_SECRET environment variable is not set. " +
			"Refusing to start without a secure JWT signing key. " +
			"Set JWT_SECRET to a cryptographically random 32-byte value.")
	}
	if len(secret) < 32 {
		log.Printf("[SECURITY WARNING] JWT_SECRET is shorter than 32 characters (%d bytes); "+
			"use a cryptographically random value of at least 32 characters.", len(secret))
	}
	return nil
}

// AuthMiddleware extracts the user ID from a JWT and injects it into context.
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenString string

		// 1. Try Authorization Bearer header
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// 2. Fallback to 'token' query parameter (for SSE/EventSource)
		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}

		// 3. Fallback to session cookie
		if tokenString == "" {
			if cookie, err := r.Cookie("tide_session"); err == nil {
				tokenString = cookie.Value
			}
		}

		if tokenString == "" {
			http.Error(w, "Unauthorized: Missing session token", http.StatusUnauthorized)
			return
		}

		jwtKeyStr := os.Getenv("JWT_SECRET")
		// [FIX MITTEL-1] No fallback. ValidateJWTSecret() guarantees this is set at startup.
		// If the variable disappears at runtime (e.g. env mutation), reject the request.
		if jwtKeyStr == "" {
			http.Error(w, "Server misconfiguration", http.StatusInternalServerError)
			return
		}
		jwtKey := []byte(jwtKeyStr)

		token, err := jwt.Parse(
			tokenString,
			func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, http.ErrAbortHandler
				}
				return jwtKey, nil
			},
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
			jwt.WithExpirationRequired(),
		)

		if err != nil || !token.Valid {
			http.Error(w, "Unauthorized: Invalid or expired token", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "Unauthorized: Invalid token claims", http.StatusUnauthorized)
			return
		}

		userID, ok := claims["sub"].(string)
		if !ok || userID == "" {
			http.Error(w, "Unauthorized: Missing subject in token", http.StatusUnauthorized)
			return
		}

		// Securely inject the verified User ID into the request context
		ctx := context.WithValue(r.Context(), "user_id", userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Logout clears the HttpOnly tide_session cookie and returns a 200 OK JSON response.
func Logout(w http.ResponseWriter, r *http.Request) {
	isSecure := r.TLS != nil ||
		strings.EqualFold(os.Getenv("ENV"), "production") ||
		strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")

	http.SetCookie(w, &http.Cookie{
		Name:     "tide_session",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecure,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

const (
	wsTicketTTL  = 30 * time.Second
	maxWSTickets = 10000
)

type wsTicketEntry struct {
	userID    string
	expiresAt time.Time
}

var (
	wsTicketMu    sync.Mutex
	wsTicketStore = make(map[string]wsTicketEntry)
)

// IssueWSTicket generates a short-lived, single-use WebSocket authentication ticket.
func IssueWSTicket(userID string) (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	ticket := hex.EncodeToString(raw[:])

	now := time.Now()
	wsTicketMu.Lock()
	defer wsTicketMu.Unlock()

	for k, entry := range wsTicketStore {
		if !now.Before(entry.expiresAt) {
			delete(wsTicketStore, k)
		}
	}

	for len(wsTicketStore) >= maxWSTickets {
		var oldestKey string
		var oldestExp time.Time
		first := true
		for k, entry := range wsTicketStore {
			if first || entry.expiresAt.Before(oldestExp) {
				oldestKey = k
				oldestExp = entry.expiresAt
				first = false
			}
		}
		if first {
			break
		}
		delete(wsTicketStore, oldestKey)
	}

	wsTicketStore[ticket] = wsTicketEntry{
		userID:    userID,
		expiresAt: now.Add(wsTicketTTL),
	}
	return ticket, nil
}

// ConsumeWSTicket validates and immediately consumes a one-time WebSocket ticket.
func ConsumeWSTicket(ticket string) (string, bool) {
	wsTicketMu.Lock()
	defer wsTicketMu.Unlock()

	entry, ok := wsTicketStore[ticket]
	if !ok {
		return "", false
	}
	delete(wsTicketStore, ticket)

	if time.Now().Before(entry.expiresAt) {
		return entry.userID, true
	}
	return "", false
}

// IssueWSTicketHandler issues a short-lived one-time WebSocket ticket for the authenticated user.
func IssueWSTicketHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ticket, err := IssueWSTicket(userID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ticket":     ticket,
		"expires_in": int(wsTicketTTL.Seconds()),
	})
}

// CSRFMiddleware validates state-changing cookie-authenticated requests against cross-site forgery.
func CSRFMiddleware(isTrustedOrigin func(string) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			default:
				next.ServeHTTP(w, r)
				return
			}

			if _, err := r.Cookie("tide_session"); err != nil {
				next.ServeHTTP(w, r)
				return
			}

			if r.URL.Path != "/api/v1/auth/logout" &&
				(r.Header.Get("Authorization") != "" || r.Header.Get("X-API-Key") != "") {
				next.ServeHTTP(w, r)
				return
			}

			if strings.EqualFold(r.Header.Get("Sec-Fetch-Site"), "cross-site") {
				http.Error(w, "CSRF validation failed: cross-site request blocked", http.StatusForbidden)
				return
			}

			if origin := r.Header.Get("Origin"); origin != "" {
				trusted := isTrustedOrigin != nil && isTrustedOrigin(origin)
				if !trusted {
					u, err := url.Parse(origin)
					if err != nil || u.Host == "" || !strings.EqualFold(u.Host, r.Host) {
						http.Error(w, "CSRF validation failed: untrusted origin", http.StatusForbidden)
						return
					}
				}
			}

			if strings.TrimSpace(r.Header.Get("X-Requested-With")) == "" {
				http.Error(w, "CSRF validation failed: missing X-Requested-With header", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
