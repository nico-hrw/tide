package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	maxEntries = 10000
	maxIdleAge = 15 * time.Minute
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
		if len(l.ips) >= maxEntries {
			l.evictLocked(now)
		}
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

// evictLocked purges entries idle longer than maxIdleAge and, if the map is
// still at or above maxEntries, evicts the oldest entry. Caller must hold l.mu.
func (l *IPRateLimiter) evictLocked(now time.Time) {
	var oldestIP string
	var oldestTime time.Time

	for ip, entry := range l.ips {
		if now.Sub(entry.lastSeen) > maxIdleAge {
			delete(l.ips, ip)
			continue
		}
		if oldestIP == "" || entry.lastSeen.Before(oldestTime) {
			oldestIP = ip
			oldestTime = entry.lastSeen
		}
	}

	if len(l.ips) >= maxEntries && oldestIP != "" {
		delete(l.ips, oldestIP)
	}
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

// LockoutEntry tracks failed login/sensitive operation attempts for an account key (user.ID).
type LockoutEntry struct {
	FailCount   int
	LockedUntil time.Time
	LastAttempt time.Time
}

// FailedAttemptTracker tracks consecutive failed attempts and locks out keys (keyed by user.ID, not IP) exceeding maxAttempts.
type FailedAttemptTracker struct {
	mu          sync.Mutex
	entries     map[string]*LockoutEntry
	maxAttempts int
	lockoutDur  time.Duration
}

// NewFailedAttemptTracker creates a FailedAttemptTracker with background cleanup.
func NewFailedAttemptTracker(maxAttempts int, lockoutDur time.Duration) *FailedAttemptTracker {
	tracker := &FailedAttemptTracker{
		entries:     make(map[string]*LockoutEntry),
		maxAttempts: maxAttempts,
		lockoutDur:  lockoutDur,
	}
	// Background cleanup loop for expired entries
	go tracker.cleanupLoop()
	return tracker
}

func (t *FailedAttemptTracker) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		t.mu.Lock()
		now := time.Now()
		for k, v := range t.entries {
			if now.After(v.LockedUntil) && now.Sub(v.LastAttempt) > 30*time.Minute {
				delete(t.entries, k)
			}
		}
		t.mu.Unlock()
	}
}

// IsLocked checks if the key (user.ID) is currently locked out. Returns true and the remaining lockout duration.
func (t *FailedAttemptTracker) IsLocked(key string) (bool, time.Duration) {
	if key == "" {
		return false, 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	entry, exists := t.entries[key]
	if !exists {
		return false, 0
	}
	if time.Now().Before(entry.LockedUntil) {
		return true, time.Until(entry.LockedUntil)
	}
	return false, 0
}

// RecordFailure increments failed attempts for the key (user.ID). If threshold reached, sets LockedUntil. Returns if now locked and remaining attempts before lock.
func (t *FailedAttemptTracker) RecordFailure(key string) (locked bool, remaining int) {
	if key == "" {
		return false, t.maxAttempts
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	entry, exists := t.entries[key]
	if !exists || now.After(entry.LockedUntil) && entry.FailCount >= t.maxAttempts {
		entry = &LockoutEntry{LastAttempt: now}
		t.entries[key] = entry
	}
	entry.LastAttempt = now
	entry.FailCount++
	if entry.FailCount >= t.maxAttempts {
		entry.LockedUntil = now.Add(t.lockoutDur)
		return true, 0
	}
	return false, t.maxAttempts - entry.FailCount
}

// RecordSuccess resets failed count for the key (user.ID).
func (t *FailedAttemptTracker) RecordSuccess(key string) {
	if key == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.entries, key)
}

