package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
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

// parseTrustedProxies builds the trusted proxy CIDR allowlist, always
// including IPv4/IPv6 loopback so local reverse proxies work out of the box.
func parseTrustedProxies(envVal string) []*net.IPNet {
	defaults := []string{"127.0.0.1/32", "::1/128"}
	var nets []*net.IPNet
	for _, cidr := range defaults {
		if _, ipNet, err := net.ParseCIDR(cidr); err == nil {
			nets = append(nets, ipNet)
		}
	}
	for _, raw := range strings.Split(envVal, ",") {
		entry := strings.TrimSpace(raw)
		if entry == "" {
			continue
		}
		if strings.Contains(entry, "/") {
			if _, ipNet, err := net.ParseCIDR(entry); err == nil {
				nets = append(nets, ipNet)
			} else {
				log.Printf("WARNING: ignoring invalid TRUSTED_PROXIES CIDR %q: %v", entry, err)
			}
			continue
		}
		if ip := net.ParseIP(entry); ip != nil {
			if ip4 := ip.To4(); ip4 != nil {
				nets = append(nets, &net.IPNet{IP: ip4, Mask: net.CIDRMask(32, 32)})
			} else {
				nets = append(nets, &net.IPNet{IP: ip, Mask: net.CIDRMask(128, 128)})
			}
		} else {
			log.Printf("WARNING: ignoring invalid TRUSTED_PROXIES IP %q", entry)
		}
	}
	return nets
}

func parseIPFromAddr(addr string) net.IP {
	host := strings.TrimSpace(addr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	if idx := strings.IndexByte(host, '%'); idx != -1 {
		host = host[:idx]
	}
	return net.ParseIP(host)
}

func isTrustedIP(ip net.IP, nets []*net.IPNet) bool {
	if ip == nil {
		return false
	}
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// trustedProxyRealIP resolves the client IP from X-Forwarded-For (rightmost
// untrusted hop) or X-Real-IP only when the direct peer is in trustedNets.
func trustedProxyRealIP(trustedNets []*net.IPNet) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			peerIP := parseIPFromAddr(r.RemoteAddr)
			if isTrustedIP(peerIP, trustedNets) {
				var realIP net.IP
				if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
					parts := strings.Split(xff, ",")
					for i := len(parts) - 1; i >= 0; i-- {
						hopIP := parseIPFromAddr(parts[i])
						if hopIP == nil {
							break
						}
						realIP = hopIP
						if !isTrustedIP(hopIP, trustedNets) {
							break
						}
					}
				}
				if realIP == nil {
					if xri := r.Header.Get("X-Real-IP"); xri != "" {
						realIP = parseIPFromAddr(xri)
					}
				}
				if realIP != nil {
					r.RemoteAddr = realIP.String()
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// redactingLogger logs HTTP requests while masking sensitive query parameters.
func redactingLogger(next http.Handler) http.Handler {
	sensitiveKeys := map[string]bool{
		"token":        true,
		"api_token":    true,
		"ticket":       true,
		"access_token": true,
		"secret":       true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		displayPath := r.URL.Path
		if r.URL.RawQuery != "" {
			q := r.URL.Query()
			for k := range q {
				if sensitiveKeys[strings.ToLower(k)] {
					q.Set(k, "[REDACTED]")
				}
			}
			displayPath += "?" + q.Encode()
		}
		log.Printf("%s %s -> %d (%dB in %s)", r.Method, displayPath, ww.Status(), ww.BytesWritten(), time.Since(start))
	})
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

	isProduction := strings.EqualFold(os.Getenv("ENV"), "production")

	masterKeyStr := os.Getenv("SERVER_MASTER_KEY")
	if isProduction {
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
	if err := api.ValidateJWTSecret(); err != nil {
		log.Fatal(err)
	}

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
	broker.SetStore(sqliteStore)
	authHandler := api.NewAuthHandler(sqliteStore, masterKey)
	authLimiter := api.NewIPRateLimiter(0.1, 5)
	otpVerifyLimiter := api.NewIPRateLimiter(0.166, 5)
	searchLimiter := api.NewIPRateLimiter(20.0/60.0, 20)
	quicknoteLimiter := api.NewIPRateLimiter(5.0, 30) // 5 req/s, burst 30 to prevent spamming
	apiLimiter := api.NewIPRateLimiter(10.0, 60)
	fileHandler := api.NewFileHandler(sqliteStore, blobStore, broker)
	linkHandler := api.NewLinkHandler(sqliteStore)
	messageHandler := &api.MessageHandler{Store: sqliteStore, Broker: broker}
	contactHandler := &api.ContactHandler{Store: sqliteStore, Broker: broker}
	contactHandler.SetSearchLimiter(searchLimiter)
	presenceHandler := &api.PresenceHandler{Broker: broker}
	profileHandler := &api.ProfileHandler{Store: sqliteStore}
	profileHandler.SetSearchLimiter(searchLimiter)
	extensionsHandler := api.NewExtensionsHandler(sqliteStore)
	taskHandler := api.NewTaskHandler(sqliteStore)
	quicknoteHandler := api.NewQuicknoteHandler(sqliteStore, blobStore, api.GlobalHub)

	tabsHandler := api.NewTabsHandler(sqliteStore)
	apiTokenHandler := api.NewAPITokenHandler(sqliteStore)
	externalHandler := api.NewExternalHandler(sqliteStore, blobStore)
	todosHandler := api.NewTodosHandler(sqliteStore)

	// 3. Setup Router
	trustedProxies := parseTrustedProxies(os.Getenv("TRUSTED_PROXIES"))
	r := chi.NewRouter()
	r.Use(redactingLogger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(trustedProxyRealIP(trustedProxies))
	r.Use(middleware.RedirectSlashes)

	// Global Security Headers Middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			if strings.HasPrefix(r.URL.Path, "/api/") &&
				!strings.Contains(r.URL.Path, "/download") &&
				!(r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/v1/quicknotes/") && strings.Contains(r.URL.Path, "/files/")) {
				w.Header().Set("Cache-Control", "no-store")
			}
			next.ServeHTTP(w, r)
		})
	})

	trustedOrigins := map[string]bool{
		"https://go-tide.app":     true,
		"https://www.go-tide.app": true,
		"https://hrw.rocks":       true,
		"https://www.hrw.rocks":   true,
		"https://track.hrw.rocks": true,
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

	isTrustedOrigin := func(origin string) bool {
		if origin == "" {
			// No Origin header (same-origin or non-browser request)
			return true
		}
		cleanOrigin := strings.TrimRight(origin, "/")
		if trustedOrigins[cleanOrigin] {
			return true
		}
		if !isProduction {
			if u, err := url.Parse(origin); err == nil && u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") {
				return true
			}
		}
		return false
	}

	// CORS Middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Add("Vary", "Origin")
			origin := r.Header.Get("Origin")

			if isTrustedOrigin(origin) {
				if origin != "" {
					w.Header().Set("Access-Control-Allow-Origin", origin)
				}
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-ID, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-Access-Token, X-API-Key")
				w.Header().Set("Access-Control-Max-Age", "3600")
			}

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	// CSRF protection for cookie-authenticated state-changing requests
	r.Use(api.CSRFMiddleware(isTrustedOrigin))

	// Request body size limits (10MB default, 250MB for upload routes)
	r.Use(func(next http.Handler) http.Handler {
		const defaultMaxBodyBytes int64 = 10 << 20 // 10MB
		const uploadMaxBodyBytes int64 = 250 << 20 // 250MB
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil && r.Header.Get("Upgrade") == "" {
				path := strings.TrimSuffix(r.URL.Path, "/")
				limit := defaultMaxBodyBytes
				if strings.HasSuffix(path, "/upload") ||
					(r.Method == http.MethodPost && strings.HasPrefix(path, "/api/v1/quicknotes/") && strings.HasSuffix(path, "/files")) {
					limit = uploadMaxBodyBytes
				}
				r.Body = http.MaxBytesReader(w, r.Body, limit)
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
		r.With(api.AuthMiddleware).Post("/auth/ws-ticket", api.IssueWSTicketHandler)
		r.Post("/auth/logout", api.Logout)
		if !isProduction && strings.EqualFold(os.Getenv("DEV_MODE"), "true") {
			r.With(api.RateLimitMiddleware(authLimiter)).Post("/auth/dev-login", authHandler.DevLogin)
		}

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
		r.Route("/todos", func(r chi.Router) {
			r.Use(api.RateLimitMiddleware(apiLimiter))
			todosHandler.RegisterRoutes(r)
		})
		r.Route("/api-tokens", apiTokenHandler.RegisterRoutes)
		r.Route("/external", func(r chi.Router) {
			r.Use(api.RateLimitMiddleware(apiLimiter))
			externalHandler.RegisterRoutes(r)
		})

		// SSE Endpoint (Wrapped with AuthMiddleware for security)
		r.With(api.AuthMiddleware).Get("/events", broker.ServeHTTP)
	})

	// CRDT & E2EE aliases for /api/ws/notes and /api/files
	r.Get("/api/ws/notes/{fileID}", fileHandler.ServeWs)
	r.Route("/api/files", fileHandler.RegisterRoutes)
	if !isProduction && strings.EqualFold(os.Getenv("DEV_MODE"), "true") {
		r.With(api.RateLimitMiddleware(authLimiter)).Post("/api/auth/dev-login", authHandler.DevLogin)
	}

	// Quicknotes routes
	r.Route("/api/v1/quicknotes", func(r chi.Router) {
		r.Use(api.RateLimitMiddleware(quicknoteLimiter))
		quicknoteHandler.RegisterRoutes(r)
	})
	r.Get("/api/ws/quicknotes/{slug}", quicknoteHandler.ServeWs)

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
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Server failed to start: %v", err)
	}
}
