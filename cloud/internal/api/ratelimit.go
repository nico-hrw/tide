package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ipEntry struct {
	tokens   float64
	lastSeen time.Time
}

// IPRateLimiter provides thread-safe IP-based token bucket rate limiting.
type IPRateLimiter struct {
	mu       sync.Mutex
	ips      map[string]*ipEntry
	rate     float64 // tokens added per second
	burst    int     // maximum burst size
	stopCh   chan struct{}
	stopOnce sync.Once
}

// NewIPRateLimiter initializes and returns a new IPRateLimiter with background cleanup.
func NewIPRateLimiter(rate float64, burst int) *IPRateLimiter {
	if burst <= 0 {
		burst = 1
	}
	limiter := &IPRateLimiter{
		ips:    make(map[string]*ipEntry),
		rate:   rate,
		burst:  burst,
		stopCh: make(chan struct{}),
	}
	go limiter.cleanupLoop()
	return limiter
}

// Stop cleanly stops the background cleanup goroutine.
func (l *IPRateLimiter) Stop() {
	l.stopOnce.Do(func() {
		close(l.stopCh)
	})
}

// Allow reports whether a request from the given IP is permitted under the token bucket limits.
func (l *IPRateLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	entry, exists := l.ips[ip]
	if !exists {
		entry = &ipEntry{
			tokens:   float64(l.burst),
			lastSeen: now,
		}
		l.ips[ip] = entry
	} else {
		elapsed := now.Sub(entry.lastSeen).Seconds()
		if elapsed > 0 {
			entry.tokens += elapsed * l.rate
			if entry.tokens > float64(l.burst) {
				entry.tokens = float64(l.burst)
			}
		}
		entry.lastSeen = now
	}

	if entry.tokens >= 1.0 {
		entry.tokens -= 1.0
		return true
	}

	return false
}

// CleanupOlderThan purges entries inactive for longer than maxAge.
func (l *IPRateLimiter) CleanupOlderThan(maxAge time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	for ip, entry := range l.ips {
		if now.Sub(entry.lastSeen) > maxAge {
			delete(l.ips, ip)
		}
	}
}

// cleanupLoop periodically purges inactive IPs older than 10 minutes.
func (l *IPRateLimiter) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			l.CleanupOlderThan(10 * time.Minute)
		case <-l.stopCh:
			return
		}
	}
}

// RateLimitMiddleware returns an HTTP middleware enforcing rate limits per client IP.
func RateLimitMiddleware(limiter *IPRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				ip = r.RemoteAddr
			}
			ip = strings.Trim(strings.TrimSpace(ip), "[]")
			if ip == "" {
				ip = "unknown"
			}

			if !limiter.Allow(ip) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "10")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "too_many_requests",
					"message": "Too many requests. Please wait before trying again.",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
