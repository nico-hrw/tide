package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/nicoh/tide/internal/api"
	"github.com/nicoh/tide/internal/store"
)

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
		"/home/nicoh/tide/.env",
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
	if masterKeyStr == "" {
		log.Println("WARNING: SERVER_MASTER_KEY not set. Using insecure dev key.")
		masterKeyStr = "12345678901234567890123456789012" // 32 bytes for DEV ONLY!
	}
	if len(masterKeyStr) != 32 {
		log.Fatalf("SERVER_MASTER_KEY must be exactly 32 bytes, got %d", len(masterKeyStr))
	}
	masterKey := []byte(masterKeyStr)

	// [FIX MITTEL-1] Abort startup immediately if JWT_SECRET is not set.
	// This prevents any issued JWTs from being signed with an insecure fallback key.
	api.ValidateJWTSecret()

	// 1. Initialize Stores
	dataDir := filepath.Join(baseDir, "data")
	sqliteStore, err := store.NewSQLiteStore(dataDir)
	if err != nil {
		log.Fatalf("Failed to init db: %v", err)
	}

	blobStore := store.NewLocalBlobStore(filepath.Join(dataDir, "blobs"))

	// 2. Initialize Handlers
	broker := api.NewBroker()
	authHandler := api.NewAuthHandler(sqliteStore, masterKey)
	fileHandler := api.NewFileHandler(sqliteStore, blobStore, broker)
	linkHandler := api.NewLinkHandler(sqliteStore)
	messageHandler := &api.MessageHandler{Store: sqliteStore, Broker: broker}
	contactHandler := &api.ContactHandler{Store: sqliteStore}
	profileHandler := &api.ProfileHandler{Store: sqliteStore}
	extensionsHandler := api.NewExtensionsHandler(sqliteStore)
	taskHandler := api.NewTaskHandler(sqliteStore)

	tabsHandler := api.NewTabsHandler(sqliteStore)
	financeHandler := api.NewFinanceHandler(sqliteStore, broker)

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
			trustedOrigins := []string{
				"http://localhost:3000",
				"http://localhost:3001",
				"https://go-tide.app",
			}

			isTrusted := false
			if origin != "" {
				for _, tr := range trustedOrigins {
					if origin == tr || strings.HasPrefix(origin, "http://localhost") {
						isTrusted = true
						break
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
		// Flattened Auth routes to avoid sub-router 404 confusion
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/request-otp", authHandler.RequestOTP)
		r.Post("/auth/verify-otp", authHandler.VerifyOTP)
		r.With(api.AuthMiddleware).Get("/auth/me", authHandler.Me)
		r.With(api.AuthMiddleware).Put("/auth/me", authHandler.UpdateMe)

		r.Route("/files", fileHandler.RegisterRoutes)
		r.Route("/links", linkHandler.RegisterRoutes)
		r.Route("/messages", messageHandler.RegisterRoutes)
		r.Route("/contacts", contactHandler.RegisterRoutes)
		r.Route("/profiles", profileHandler.RegisterRoutes)
		r.Get("/search", profileHandler.Search)
		r.Route("/user/extensions", extensionsHandler.RegisterRoutes)
		r.Route("/tabs", tabsHandler.RegisterRoutes)
		r.Route("/tasks", taskHandler.RegisterRoutes)
		r.Route("/finance", financeHandler.RegisterRoutes)

		// SSE Endpoint (Wrapped with AuthMiddleware for security)
		r.With(api.AuthMiddleware).Get("/events", broker.ServeHTTP)
	})

	log.Printf("Server starting on port %s...", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
