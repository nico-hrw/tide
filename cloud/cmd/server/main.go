package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/nicoh/tide/internal/api"
	"github.com/nicoh/tide/internal/store"
)

const AppVersion = "0.2.0"

func getAppVersion() string {
	if envVer := os.Getenv("APP_VERSION"); envVer != "" {
		return envVer
	}
	return AppVersion
}

func main() {
	// Determine stable base directory for path resolution
	baseDir := "."
	exePath, err := os.Executable()
	if err == nil {
		if !strings.Contains(exePath, "tmp") && !strings.Contains(exePath, "Temp") {
			baseDir = filepath.Dir(exePath)
		} else {
			baseDir, _ = os.Getwd()
		}
	}

	// Load .env file automatically
	envPaths := []string{
		filepath.Join(baseDir, ".env"),
		".env",
	}
	for _, p := range envPaths {
		if err := godotenv.Load(p); err == nil {
			log.Printf("Loaded environment variables from %s", p)
			break
		}
	}

	port := "8080"
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}

	masterKeyStr := os.Getenv("SERVER_MASTER_KEY")
	if os.Getenv("ENV") == "production" {
		if len(masterKeyStr) < 32 {
			log.Fatal("CRITICAL: SERVER_MASTER_KEY must be set and at least 32 characters long")
		}
	} else {
		if len(masterKeyStr) < 32 {
			log.Println("DEV WARNING: SERVER_MASTER_KEY not set or too short (<32 bytes), using fallback dev key")
			masterKeyStr = "12345678901234567890123456789012"
		}
	}
	masterKey := []byte(masterKeyStr[:32])

	// [FIX MITTEL-1] Abort startup immediately if JWT_SECRET is not set.
	// This prevents any issued JWTs from being signed with an insecure fallback key.
	api.ValidateJWTSecret()

	// 1. Initialize Stores
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(baseDir, "data")
	}
	sqliteStore, err := store.NewSQLiteStore(dataDir)
	if err != nil {
		log.Fatalf("Failed to init db: %v", err)
	}

	blobStore := store.NewLocalBlobStore(filepath.Join(dataDir, "blobs"))

	// 2. Initialize Handlers and Rate Limiters
	broker := api.NewBroker()
	authHandler := api.NewAuthHandler(sqliteStore, masterKey)
	authLimiter := api.NewIPRateLimiter(0.1, 5)
	otpVerifyLimiter := api.NewIPRateLimiter(0.166, 5)
	searchLimiter := api.NewIPRateLimiter(20.0/60.0, 20)
	fileHandler := api.NewFileHandler(sqliteStore, blobStore, broker)
	linkHandler := api.NewLinkHandler(sqliteStore)
	messageHandler := &api.MessageHandler{Store: sqliteStore, Broker: broker}
	contactHandler := &api.ContactHandler{Store: sqliteStore, Broker: broker}
	presenceHandler := &api.PresenceHandler{Broker: broker}
	profileHandler := &api.ProfileHandler{Store: sqliteStore}
	extensionsHandler := api.NewExtensionsHandler(sqliteStore)
	taskHandler := api.NewTaskHandler(sqliteStore)

	tabsHandler := api.NewTabsHandler(sqliteStore)
	apiTokenHandler := api.NewAPITokenHandler(sqliteStore)
	externalHandler := api.NewExternalHandler(sqliteStore)

	// 3. Setup Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.RedirectSlashes)

	// CORS Middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			trustedOrigins := map[string]bool{
				"http://localhost:3000":   true,
				"http://localhost:5173":   true,
				"http://127.0.0.1:3000":   true,
				"http://127.0.0.1:5173":   true,
				"https://go-tide.app":     true,
				"https://www.go-tide.app": true,
			}

			if appURL := os.Getenv("APP_URL"); appURL != "" {
				trustedOrigins[strings.TrimRight(strings.TrimSpace(appURL), "/")] = true
			}
			if allowedOrigins := os.Getenv("ALLOWED_ORIGINS"); allowedOrigins != "" {
				for _, o := range strings.Split(allowedOrigins, ",") {
					o = strings.TrimRight(strings.TrimSpace(o), "/")
					if o != "" {
						trustedOrigins[o] = true
					}
				}
			}

			isTrusted := false
			if origin != "" {
				cleanOrigin := strings.TrimRight(origin, "/")
				if trustedOrigins[cleanOrigin] {
					isTrusted = true
				} else if os.Getenv("ENV") != "production" {
					if strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1") {
						isTrusted = true
					}
				}
			} else {
				// No Origin header (same-origin or non-browser request)
				isTrusted = true
			}

			if isTrusted && origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else if origin == "" {
				// If no origin but we trust the requester (e.g. server-to-server),
				// we don't set the header or set it to a safe default if needed.
			}

			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-ID, Authorization, X-Requested-With, Accept, Origin, Cache-Control")
			w.Header().Set("Access-Control-Max-Age", "3600")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	// 4. Register Routes
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Tide Cloud Server Running"))
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/version", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"version":   getAppVersion(),
				"timestamp": time.Now().Unix(),
			})
		})

		// Flattened Auth routes to avoid sub-router 404 confusion
		r.With(api.RateLimitMiddleware(authLimiter)).Post("/auth/register", authHandler.Register)
		r.With(api.RateLimitMiddleware(authLimiter)).Post("/auth/request-otp", authHandler.RequestOTP)
		r.With(api.RateLimitMiddleware(otpVerifyLimiter)).Post("/auth/verify-otp", authHandler.VerifyOTP)
		r.With(api.AuthMiddleware).Get("/auth/me", authHandler.Me)
		r.With(api.AuthMiddleware).Put("/auth/me", authHandler.UpdateMe)

		r.Route("/files", fileHandler.RegisterRoutes)
		r.Route("/links", linkHandler.RegisterRoutes)
		r.Route("/messages", messageHandler.RegisterRoutes)
		r.Route("/contacts", contactHandler.RegisterRoutes)
		r.Route("/profiles", profileHandler.RegisterRoutes)
		r.With(api.AuthMiddleware, api.RateLimitMiddleware(searchLimiter)).Get("/search", profileHandler.Search)
		r.Route("/user/extensions", extensionsHandler.RegisterRoutes)
		r.With(api.AuthMiddleware).Put("/user/status", presenceHandler.UpdateStatus)
		r.With(api.AuthMiddleware).Post("/user/heartbeat", presenceHandler.Heartbeat)
		r.Route("/tabs", tabsHandler.RegisterRoutes)
		r.Route("/tasks", taskHandler.RegisterRoutes)
		r.Route("/api-tokens", apiTokenHandler.RegisterRoutes)
		r.Route("/external", externalHandler.RegisterRoutes)

		// SSE Endpoint (Wrapped with AuthMiddleware for security)
		r.With(api.AuthMiddleware).Get("/events", broker.ServeHTTP)
	})

	// Start background cleanup worker for trashed files older than 1 week
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		// Run once on startup:
		if err := sqliteStore.PurgeOldTrashedFiles(context.Background(), blobStore); err != nil {
			log.Printf("[GC] Error purging old trashed files: %v", err)
		}
		for range ticker.C {
			if err := sqliteStore.PurgeOldTrashedFiles(context.Background(), blobStore); err != nil {
				log.Printf("[GC] Error purging old trashed files: %v", err)
			}
		}
	}()

	log.Printf("Server starting on port %s...", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
