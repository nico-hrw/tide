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

	// 1. Initialize Stores
	// memStore := store.NewMemoryStore() // Deprecated
	sqliteStore, err := store.NewSQLiteStore("data")
	if err != nil {
		log.Fatalf("Failed to init db: %v", err)
	}

	blobStore := store.NewLocalBlobStore("data/blobs")

	// 2. Initialize Handlers
	broker := api.NewBroker()
	authHandler := api.NewAuthHandler(sqliteStore)
	fileHandler := api.NewFileHandler(sqliteStore, blobStore, broker)
	linkHandler := api.NewLinkHandler(sqliteStore)
	messageHandler := &api.MessageHandler{Store: sqliteStore, Broker: broker}
	contactHandler := &api.ContactHandler{Store: sqliteStore}
	extensionsHandler := api.NewExtensionsHandler(sqliteStore)

	tabsHandler := api.NewTabsHandler(sqliteStore)
	financeHandler := api.NewFinanceHandler(sqliteStore, broker)

	// 3. Setup Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// CORS Middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-ID, Authorization")
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
		r.Route("/auth", authHandler.RegisterRoutes)
		r.Route("/files", fileHandler.RegisterRoutes)
		r.Route("/links", linkHandler.RegisterRoutes)
		r.Route("/messages", messageHandler.RegisterRoutes)
		r.Route("/contacts", contactHandler.RegisterRoutes)
		r.Route("/user/extensions", extensionsHandler.RegisterRoutes)
		r.Route("/tabs", tabsHandler.RegisterRoutes)
		r.Route("/finance", financeHandler.RegisterRoutes)

		// SSE Endpoint
		r.Get("/events", broker.ServeHTTP)
	})

	log.Printf("Server starting on port %s...", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
