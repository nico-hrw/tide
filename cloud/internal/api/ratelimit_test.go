package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestIPRateLimiter_BurstAndRejection(t *testing.T) {
	limiter := NewIPRateLimiter(0.1, 3)
	defer limiter.Stop()

	ip := "192.168.1.50"

	// First 3 requests should succeed (burst capacity)
	for i := 0; i < 3; i++ {
		if !limiter.Allow(ip) {
			t.Fatalf("expected request %d to be allowed under burst limit", i+1)
		}
	}

	// 4th request must be rejected
	if limiter.Allow(ip) {
		t.Fatalf("expected 4th request to be rejected after burst exhausted")
	}

	// Another IP should still have its full burst available
	otherIP := "192.168.1.51"
	for i := 0; i < 3; i++ {
		if !limiter.Allow(otherIP) {
			t.Fatalf("expected request %d for other IP to be allowed", i+1)
		}
	}
	if limiter.Allow(otherIP) {
		t.Fatalf("expected request 4 for other IP to be rejected")
	}
}

func TestIPRateLimiter_Refill(t *testing.T) {
	// Rate: 10 tokens per second (1 token every 100ms), burst: 1
	limiter := NewIPRateLimiter(10.0, 1)
	defer limiter.Stop()

	ip := "10.0.0.1"

	if !limiter.Allow(ip) {
		t.Fatal("expected first request to be allowed")
	}
	if limiter.Allow(ip) {
		t.Fatal("expected immediate second request to be rejected")
	}

	// Wait 120ms to allow 1 token to refill
	time.Sleep(120 * time.Millisecond)

	if !limiter.Allow(ip) {
		t.Fatal("expected request to be allowed after token refill")
	}
}

func TestRateLimitMiddleware_HTTP429Response(t *testing.T) {
	limiter := NewIPRateLimiter(0.1, 1)
	defer limiter.Stop()

	handler := RateLimitMiddleware(limiter)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	}))

	// Request 1: Allowed
	req1 := httptest.NewRequest(http.MethodPost, "/auth/register", nil)
	req1.RemoteAddr = "203.0.113.10:4321"
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200, got %d", rec1.Code)
	}

	// Request 2: Exceeds rate limit -> HTTP 429
	req2 := httptest.NewRequest(http.MethodPost, "/auth/register", nil)
	req2.RemoteAddr = "203.0.113.10:4321"
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected HTTP 429, got %d", rec2.Code)
	}

	if retryAfter := rec2.Header().Get("Retry-After"); retryAfter != "10" {
		t.Errorf("expected Retry-After header to be '10', got %q", retryAfter)
	}

	if contentType := rec2.Header().Get("Content-Type"); contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", contentType)
	}

	var respBody map[string]string
	if err := json.NewDecoder(rec2.Body).Decode(&respBody); err != nil {
		t.Fatalf("failed to parse JSON response body: %v", err)
	}

	if respBody["error"] != "too_many_requests" {
		t.Errorf("expected error field to be 'too_many_requests', got %q", respBody["error"])
	}

	expectedMsg := "Too many requests. Please wait before trying again."
	if respBody["message"] != expectedMsg {
		t.Errorf("expected message field to be %q, got %q", expectedMsg, respBody["message"])
	}
}

func TestRateLimitMiddleware_IPExtractionVariants(t *testing.T) {
	limiter := NewIPRateLimiter(0.1, 2)
	defer limiter.Stop()

	handler := RateLimitMiddleware(limiter)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Address without port (e.g. injected by reverse proxy)
	req := httptest.NewRequest(http.MethodPost, "/auth/test", nil)
	req.RemoteAddr = "198.51.100.1"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200, got %d", rec.Code)
	}

	// IPv6 with port
	reqIPv6 := httptest.NewRequest(http.MethodPost, "/auth/test", nil)
	reqIPv6.RemoteAddr = "[2001:db8::1]:8080"
	recIPv6 := httptest.NewRecorder()
	handler.ServeHTTP(recIPv6, reqIPv6)
	if recIPv6.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 for IPv6, got %d", recIPv6.Code)
	}
}

func TestIPRateLimiter_Cleanup(t *testing.T) {
	limiter := NewIPRateLimiter(0.1, 2)
	defer limiter.Stop()

	limiter.Allow("1.1.1.1")
	limiter.Allow("2.2.2.2")

	limiter.mu.Lock()
	// Manually age 1.1.1.1 past 15 minutes
	limiter.ips["1.1.1.1"].lastSeen = time.Now().Add(-15 * time.Minute)
	limiter.mu.Unlock()

	limiter.CleanupOlderThan(10 * time.Minute)

	limiter.mu.Lock()
	_, hasOld := limiter.ips["1.1.1.1"]
	_, hasNew := limiter.ips["2.2.2.2"]
	limiter.mu.Unlock()

	if hasOld {
		t.Errorf("expected inactive IP 1.1.1.1 to be cleaned up")
	}
	if !hasNew {
		t.Errorf("expected active IP 2.2.2.2 to remain")
	}
}

func TestIPRateLimiter_Concurrency(t *testing.T) {
	limiter := NewIPRateLimiter(10.0, 50)
	defer limiter.Stop()

	var wg sync.WaitGroup
	ips := []string{"10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"}

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			ip := ips[idx%len(ips)]
			for j := 0; j < 10; j++ {
				limiter.Allow(ip)
			}
		}(i)
	}

	wg.Wait()
}
