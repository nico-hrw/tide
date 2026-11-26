package api

import (
	"bytes"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"reflect"
	"strconv"
	"sync"
	"time"

	"github.com/nicoh/tide/internal/db"
)

// Write brake for PUT/PATCH /files/{id}, counted per user and file.
//
// Highest legitimate write rates per file (web client, see cloud/docs/auth/04-rate-limiting-and-protection.md §4.2):
// calendar entries at most 20/min per tab (eventWriteGuard), the search index at most one write per
// 2 s debounce per tab, note metadata only after 15 s (3 s for overlays) of idle time. Write loops
// between stale tabs reached 100-270/min, so 90/min with a burst of 30 brakes them and leaves room
// for several tabs of the same user.
const (
	fileUpdateRatePerMinute = 90
	fileUpdateBurst         = 30
	fileUpdateWarnInterval  = time.Minute
	fileUpdateWarnMaxKeys   = 1000
)

// fileUpdateGuard limits PUTs per user+file and logs at most one warning per file and minute.
type fileUpdateGuard struct {
	limiter       *IPRateLimiter
	ratePerMinute float64
	mu            sync.Mutex
	lastWarn      map[string]time.Time
}

func newFileUpdateGuard(ratePerMinute float64, burst int) *fileUpdateGuard {
	return &fileUpdateGuard{
		limiter:       NewIPRateLimiter(ratePerMinute/60.0, burst),
		ratePerMinute: ratePerMinute,
		lastWarn:      make(map[string]time.Time),
	}
}

// allow reports whether userID may update fileID now; if not, also how long until the next slot.
func (g *fileUpdateGuard) allow(userID, fileID string) (bool, time.Duration) {
	return g.allowAt(userID, fileID, time.Now())
}

func (g *fileUpdateGuard) allowAt(userID, fileID string, now time.Time) (bool, time.Duration) {
	if g == nil || g.limiter == nil {
		return true, 0
	}
	ok, retryAfter := g.limiter.allowAt(userID+"|"+fileID, now)
	if !ok && g.shouldWarn(fileID, now) {
		log.Printf("UpdateFile: rate limit hit for file %s by user %s (more than %g updates/min); answering 429", fileID, userID, g.ratePerMinute)
	}
	return ok, retryAfter
}

// shouldWarn is true at most once per file and fileUpdateWarnInterval.
func (g *fileUpdateGuard) shouldWarn(fileID string, now time.Time) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if last, ok := g.lastWarn[fileID]; ok && now.Sub(last) < fileUpdateWarnInterval {
		return false
	}
	if len(g.lastWarn) >= fileUpdateWarnMaxKeys {
		for k, t := range g.lastWarn {
			if now.Sub(t) >= fileUpdateWarnInterval {
				delete(g.lastWarn, k)
			}
		}
	}
	g.lastWarn[fileID] = now
	return true
}

func writeFileUpdateRateLimited(w http.ResponseWriter, retryAfter time.Duration) {
	secs := int(math.Ceil(retryAfter.Seconds()))
	if secs < 1 {
		secs = 1
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Retry-After", strconv.Itoa(secs))
	w.WriteHeader(http.StatusTooManyRequests)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":       "too_many_requests",
		"message":     "Too many updates for this file. Please wait before trying again.",
		"retry_after": secs,
	})
}

// isNoOpFileUpdate reports whether applying req to the stored file would change nothing that
// UpdateFile persists. New encrypted content (content_ciphertext) is never a no-op; a collaborator's
// secured_meta (stored in their share row) is conservatively treated as a change. Fields the handler
// ignores for this requester (access_keys of a non-owner) do not count.
func isNoOpFileUpdate(file *db.File, req *UpdateFileRequest, requesterID string) bool {
	if req.ContentCiphertext != nil {
		return false
	}
	if req.ParentID != nil {
		var want string
		if *req.ParentID != "__none__" {
			want = *req.ParentID
		}
		var have string
		if file.ParentID != nil {
			have = *file.ParentID
		}
		if want != have {
			return false
		}
	}
	if req.Visibility != nil && *req.Visibility != file.Visibility {
		return false
	}
	if req.SecuredMeta != nil {
		if file.OwnerID != requesterID {
			return false
		}
		if !bytes.Equal(decodeBase64OrRaw(*req.SecuredMeta), file.SecuredMeta) {
			return false
		}
	}
	if req.PublicMeta != nil && !normalizedJSONEqual(req.PublicMeta, file.PublicMeta) {
		return false
	}
	if req.Metadata != nil && !normalizedJSONEqual(req.Metadata, file.Metadata) {
		return false
	}
	if req.AccessKeys != nil && file.OwnerID == requesterID && !normalizedJSONEqual(req.AccessKeys, file.AccessKeys) {
		return false
	}
	return true
}

// normalizedJSONEqual compares two JSON documents ignoring key order and treating null, "", false,
// {} and [] the same as a missing key. Array order and number spelling are kept (1 and 1.0 differ),
// so the comparison errs on the side of "changed". Unparseable input is only equal byte for byte.
func normalizedJSONEqual(a, b []byte) bool {
	if bytes.Equal(a, b) {
		return true
	}
	na, okA := parseNormalizedJSON(a)
	nb, okB := parseNormalizedJSON(b)
	if !okA || !okB {
		return false
	}
	return reflect.DeepEqual(na, nb)
}

func parseNormalizedJSON(raw []byte) (interface{}, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, true
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	dec.UseNumber()
	var v interface{}
	if err := dec.Decode(&v); err != nil {
		return nil, false
	}
	if dec.More() {
		return nil, false
	}
	return normalizeJSONValue(v), true
}

// normalizeJSONValue maps "empty" values (null, "", false, empty object/array) to nil and drops
// object keys whose value is empty. Array elements keep their position.
func normalizeJSONValue(v interface{}) interface{} {
	switch t := v.(type) {
	case nil:
		return nil
	case bool:
		if !t {
			return nil
		}
		return true
	case string:
		if t == "" {
			return nil
		}
		return t
	case map[string]interface{}:
		out := make(map[string]interface{}, len(t))
		for k, val := range t {
			if n := normalizeJSONValue(val); n != nil {
				out[k] = n
			}
		}
		if len(out) == 0 {
			return nil
		}
		return out
	case []interface{}:
		if len(t) == 0 {
			return nil
		}
		out := make([]interface{}, len(t))
		for i, val := range t {
			out[i] = normalizeJSONValue(val)
		}
		return out
	default:
		return t
	}
}
