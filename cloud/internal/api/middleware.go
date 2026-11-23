package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
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
