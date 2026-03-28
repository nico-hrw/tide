package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/nicoh/tide/internal/api"
	"github.com/nicoh/tide/internal/store"
)

func main() {
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

	// 1. Initialize Stores
	// memStore := store.NewMemoryStore() // Deprecated
	sqliteStore, err := store.NewSQLiteStore("data")
	if err != nil {
		log.Fatalf("Failed to init db: %v", err)
	}

	blobStore := store.NewLocalBlobStore("data/blobs")

	// 2. Initialize Handlers
	broker := api.NewBroker()
	authHandler := api.NewAuthHandler(sqliteStore, masterKey)
	fileHandler := api.NewFileHandler(sqliteStore, blobStore, broker)
	linkHandler := api.NewLinkHandler(sqliteStore)
	messageHandler := &api.MessageHandler{Store: sqliteStore, Broker: broker}
	contactHandler := &api.ContactHandler{Store: sqliteStore}
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
				"https://hrw-tide.duckdns.org",
				"http://hrw-tide.duckdns.org",
			}

			isTrusted := false
			if origin == "" {
				// Non-CORS request (like a simple browser navigation or backend-to-backend)
				// We still set a default for safety, but origin is empty
				isTrusted = true 
			} else {
				for _, tr := range trustedOrigins {
					if origin == tr || strings.HasPrefix(origin, "http://localhost") {
						isTrusted = true
						break
					}
				}
			}

			if isTrusted && origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else if origin == "" {
				// No origin header, might be a proxy. 
				// To be safe with Credentials, we can't use "*". 
				// We'll echo the Host if it looks like ours or just allow localhost as fallback.
				w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
			} else {
				// Origin present but not explicitly in list – for ease of testing on Raspi, let's be permissive
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}

			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-ID, Authorization, X-Requested-With, Accept, Origin")
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

		r.Route("/files", fileHandler.RegisterRoutes)
		r.Route("/links", linkHandler.RegisterRoutes)
		r.Route("/messages", messageHandler.RegisterRoutes)
		r.Route("/contacts", contactHandler.RegisterRoutes)
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
