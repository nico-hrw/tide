package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type guardTestEnv struct {
	s      *store.SQLiteStore
	bs     store.BlobStore
	r      chi.Router
	secret string
	broker *Broker
}

// setupGuardTest builds a file router; guard nil keeps the production limits.
func setupGuardTest(t *testing.T, guard *fileUpdateGuard) *guardTestEnv {
	t.Helper()
	secret := "super-secret-test-jwt-key-with-sufficient-length-32bytes"
	t.Setenv("JWT_SECRET", secret)
	s, _ := setupTestStore(t)
	bs := store.NewLocalBlobStore(t.TempDir())
	broker := NewBroker()
	h := NewFileHandler(s, bs, broker)
	if guard != nil {
		h.updateGuard = guard
	}
	r := chi.NewRouter()
	h.RegisterRoutes(r)
	return &guardTestEnv{s: s, bs: bs, r: r, secret: secret, broker: broker}
}

func (e *guardTestEnv) do(t *testing.T, method, path, userID, body string) *httptest.ResponseRecorder {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Authorization", "Bearer "+signTestJWT(t, e.secret, userID))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.r.ServeHTTP(rec, req)
	return rec
}

func (e *guardTestEnv) createFile(t *testing.T, ownerID, metadata string, securedMeta []byte) string {
	t.Helper()
	id := uuid.New().String()
	if err := e.s.CreateFile(context.Background(), &db.File{
		ID: id, OwnerID: ownerID, Type: db.FileTypeEvent, Visibility: "private", Version: 1,
		Metadata: json.RawMessage(metadata), SecuredMeta: securedMeta,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("CreateFile failed: %v", err)
	}
	return id
}

func (e *guardTestEnv) stored(t *testing.T, id string) *db.File {
	t.Helper()
	f, err := e.s.GetFile(context.Background(), id)
	if err != nil {
		t.Fatalf("GetFile failed: %v", err)
	}
	return f
}

// subscribe registers an SSE client for userID; the returned func counts file_updated events for
// fileID that arrive within the wait window.
func (e *guardTestEnv) subscribe(t *testing.T, userID string) func(fileID string) int {
	t.Helper()
	ch := make(chan string, 256)
	e.broker.newClients <- clientReq{msgChan: ch, userID: userID}
	return func(fileID string) int {
		n := 0
		deadline := time.After(300 * time.Millisecond)
		for {
			select {
			case msg := <-ch:
				var ev map[string]string
				if json.Unmarshal([]byte(msg), &ev) == nil && ev["type"] == "file_updated" && ev["file_id"] == fileID {
					n++
				}
			case <-deadline:
				return n
			}
		}
	}
}

func decodeFile(t *testing.T, rec *httptest.ResponseRecorder) db.File {
	t.Helper()
	var f db.File
	if err := json.Unmarshal(rec.Body.Bytes(), &f); err != nil {
		t.Fatalf("response is not a file: %v (%s)", err, rec.Body.String())
	}
	return f
}

func TestUpdateFile_IdenticalPutIsNoOp(t *testing.T) {
	e := setupGuardTest(t, nil)
	owner := createSecurityTestUser(t, e.s, "noop-owner")
	id := e.createFile(t, owner, `{"title":"Standup","start":"2026-11-26T09:00:00Z","tags":["a","b"]}`, nil)
	updates := e.subscribe(t, owner)
	before := e.stored(t, id)

	// Same content, keys reordered, empty values added, parent "none", same visibility.
	body := `{"version":1,"visibility":"private","parent_id":"__none__","public_meta":null,
		"metadata":{"tags":["a","b"],"start":"2026-11-26T09:00:00Z","title":"Standup","color":null,"done":false,"note":"","extra":{}}}`
	rec := e.do(t, http.MethodPut, "/"+id, owner, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("X-Tide-Noop") != "1" {
		t.Fatalf("expected X-Tide-Noop header")
	}
	if got := decodeFile(t, rec); got.Version != 1 || got.ID != id {
		t.Fatalf("expected current file with version 1, got id=%s version=%d", got.ID, got.Version)
	}
	after := e.stored(t, id)
	if after.Version != 1 || string(after.Metadata) != string(before.Metadata) || !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Fatalf("no-op must not write: version %d, metadata %s", after.Version, after.Metadata)
	}
	if n := updates(id); n != 0 {
		t.Fatalf("no-op must not broadcast, got %d file_updated", n)
	}
}

func TestUpdateFile_RealChangeUnchanged(t *testing.T) {
	e := setupGuardTest(t, nil)
	owner := createSecurityTestUser(t, e.s, "real-owner")
	id := e.createFile(t, owner, `{"title":"A"}`, nil)
	updates := e.subscribe(t, owner)

	rec := e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"metadata":{"title":"B"}}`)
	if rec.Code != http.StatusOK || rec.Header().Get("X-Tide-Noop") != "" {
		t.Fatalf("expected a real 200 write, got %d noop=%q: %s", rec.Code, rec.Header().Get("X-Tide-Noop"), rec.Body.String())
	}
	if got := decodeFile(t, rec); got.Version != 2 {
		t.Fatalf("expected version 2, got %d", got.Version)
	}
	if f := e.stored(t, id); f.Version != 2 || !strings.Contains(string(f.Metadata), `"B"`) {
		t.Fatalf("expected stored version 2 with new metadata, got %d %s", f.Version, f.Metadata)
	}
	if n := updates(id); n != 1 {
		t.Fatalf("expected one file_updated broadcast, got %d", n)
	}

	// A "false" that becomes "true" is a real change.
	rec = e.do(t, http.MethodPut, "/"+id, owner, `{"version":2,"metadata":{"title":"B","done":true}}`)
	if rec.Code != http.StatusOK || decodeFile(t, rec).Version != 3 {
		t.Fatalf("expected version 3 for done=true, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateFile_StaleVersionSameContentIsNoOp(t *testing.T) {
	e := setupGuardTest(t, nil)
	owner := createSecurityTestUser(t, e.s, "stale-same")
	id := e.createFile(t, owner, `{"title":"A"}`, nil)
	updates := e.subscribe(t, owner)
	if rec := e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"metadata":{"title":"B"}}`); rec.Code != http.StatusOK {
		t.Fatalf("setup write failed: %d", rec.Code)
	}
	if n := updates(id); n != 1 {
		t.Fatalf("setup write: expected one broadcast, got %d", n)
	}

	// Other client still at version 1 sends what the server already holds.
	rec := e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"metadata":{"title":"B"}}`)
	if rec.Code != http.StatusOK || rec.Header().Get("X-Tide-Noop") != "1" {
		t.Fatalf("expected no-op 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := decodeFile(t, rec); got.Version != 2 {
		t.Fatalf("expected current version 2 in response, got %d", got.Version)
	}
	if f := e.stored(t, id); f.Version != 2 {
		t.Fatalf("stored version changed to %d", f.Version)
	}
	if n := updates(id); n != 0 {
		t.Fatalf("expected no broadcast, got %d", n)
	}
}

func TestUpdateFile_StaleVersionOtherContentConflicts(t *testing.T) {
	e := setupGuardTest(t, nil)
	owner := createSecurityTestUser(t, e.s, "stale-diff")
	id := e.createFile(t, owner, `{"title":"A"}`, nil)
	if rec := e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"metadata":{"title":"B"}}`); rec.Code != http.StatusOK {
		t.Fatalf("setup write failed: %d", rec.Code)
	}

	rec := e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"metadata":{"title":"C"}}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
	var body map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["error"] != "conflict" || body["current_version"] != float64(2) {
		t.Fatalf("unexpected conflict body: %s", rec.Body.String())
	}
	if f := e.stored(t, id); f.Version != 2 || !strings.Contains(string(f.Metadata), `"B"`) {
		t.Fatalf("foreign change must survive, got version %d metadata %s", f.Version, f.Metadata)
	}
}

func TestUpdateFile_NewCiphertextIsNeverNoOp(t *testing.T) {
	e := setupGuardTest(t, nil)
	owner := createSecurityTestUser(t, e.s, "cipher-owner")
	id := e.createFile(t, owner, `{"title":"A"}`, nil)
	updates := e.subscribe(t, owner)

	for i, v := range []int{1, 2} {
		body := `{"version":` + strconv.Itoa(v) + `,"metadata":{"title":"A"},"content_ciphertext":"ct-` + strconv.Itoa(i) + `"}`
		rec := e.do(t, http.MethodPut, "/"+id, owner, body)
		if rec.Code != http.StatusOK || rec.Header().Get("X-Tide-Noop") != "" {
			t.Fatalf("write %d: expected real 200, got %d: %s", i, rec.Code, rec.Body.String())
		}
		if got := decodeFile(t, rec); got.Version != v+1 {
			t.Fatalf("write %d: expected version %d, got %d", i, v+1, got.Version)
		}
	}
	rc, err := e.bs.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("blob missing: %v", err)
	}
	data, _ := io.ReadAll(rc)
	rc.Close()
	if string(data) != "ct-1" {
		t.Fatalf("expected latest blob, got %q", data)
	}
	if n := updates(id); n != 2 {
		t.Fatalf("expected 2 broadcasts, got %d", n)
	}
}

func TestUpdateFile_SecuredMetaNoOpOnlyForIdenticalOwnerBytes(t *testing.T) {
	e := setupGuardTest(t, nil)
	owner := createSecurityTestUser(t, e.s, "sm-owner")
	collab := createSecurityTestUser(t, e.s, "sm-collab")
	id := e.createFile(t, owner, `{}`, []byte("sealed-title"))
	ctx := context.Background()
	if err := e.s.ShareFileWithPermission(ctx, id, collab, []byte("collab-meta"), "edit", false); err != nil {
		t.Fatalf("share failed: %v", err)
	}
	if err := e.s.AcceptShare(ctx, id, collab); err != nil {
		t.Fatalf("accept failed: %v", err)
	}
	same := base64.StdEncoding.EncodeToString([]byte("sealed-title"))

	rec := e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"secured_meta":"`+same+`"}`)
	if rec.Code != http.StatusOK || rec.Header().Get("X-Tide-Noop") != "1" {
		t.Fatalf("identical owner secured_meta should be a no-op, got %d noop=%q", rec.Code, rec.Header().Get("X-Tide-Noop"))
	}
	// A collaborator's secured_meta goes to their share row: always a real write.
	rec = e.do(t, http.MethodPut, "/"+id, collab, `{"version":1,"secured_meta":"`+same+`"}`)
	if rec.Code != http.StatusOK || rec.Header().Get("X-Tide-Noop") != "" || decodeFile(t, rec).Version != 2 {
		t.Fatalf("collaborator secured_meta must be written, got %d: %s", rec.Code, rec.Body.String())
	}
	// Freshly encrypted (different) bytes from the owner are a change.
	other := base64.StdEncoding.EncodeToString([]byte("sealed-title-2"))
	rec = e.do(t, http.MethodPut, "/"+id, owner, `{"version":2,"secured_meta":"`+other+`"}`)
	if rec.Code != http.StatusOK || decodeFile(t, rec).Version != 3 {
		t.Fatalf("new owner secured_meta must be written, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateFile_RateLimitPerUserAndFile(t *testing.T) {
	guard := newFileUpdateGuard(0.6, 3) // one token per 100 s: no refill during the test
	defer guard.limiter.Stop()
	e := setupGuardTest(t, guard)
	owner := createSecurityTestUser(t, e.s, "rl-owner")
	collab := createSecurityTestUser(t, e.s, "rl-collab")
	stranger := createSecurityTestUser(t, e.s, "rl-stranger")
	id := e.createFile(t, owner, `{"title":"A"}`, nil)
	id2 := e.createFile(t, owner, `{"title":"A"}`, nil)
	ctx := context.Background()
	if err := e.s.ShareFileWithPermission(ctx, id, collab, []byte("m"), "edit", false); err != nil {
		t.Fatalf("share failed: %v", err)
	}
	if err := e.s.AcceptShare(ctx, id, collab); err != nil {
		t.Fatalf("accept failed: %v", err)
	}

	// Foreign access is answered before the limiter and never uses tokens.
	for i := 0; i < 5; i++ {
		if rec := e.do(t, http.MethodPut, "/"+id, stranger, `{"metadata":{"title":"X"}}`); rec.Code != http.StatusForbidden {
			t.Fatalf("stranger attempt %d: expected 403, got %d", i, rec.Code)
		}
		if rec := e.do(t, http.MethodPut, "/"+uuid.New().String(), owner, `{"metadata":{}}`); rec.Code != http.StatusNotFound {
			t.Fatalf("unknown file attempt %d: expected 404, got %d", i, rec.Code)
		}
	}

	for i := 0; i < 3; i++ {
		if rec := e.do(t, http.MethodPut, "/"+id, owner, `{"metadata":{"title":"A"}}`); rec.Code != http.StatusOK {
			t.Fatalf("request %d within burst: expected 200, got %d", i, rec.Code)
		}
	}
	rec := e.do(t, http.MethodPut, "/"+id, owner, `{"metadata":{"title":"B"}}`)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after burst, got %d", rec.Code)
	}
	if ra, err := strconv.Atoi(rec.Header().Get("Retry-After")); err != nil || ra < 1 {
		t.Fatalf("expected Retry-After >= 1, got %q", rec.Header().Get("Retry-After"))
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body["error"] != "too_many_requests" {
		t.Fatalf("expected JSON error body, got %s", rec.Body.String())
	}
	if f := e.stored(t, id); strings.Contains(string(f.Metadata), `"B"`) {
		t.Fatalf("a refused write must not be stored")
	}
	if rec := e.do(t, http.MethodPatch, "/"+id, owner, `{"metadata":{"title":"B"}}`); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("PATCH shares the handler and the bucket, got %d", rec.Code)
	}

	// Separate buckets: same user other file, other user same file.
	if rec := e.do(t, http.MethodPut, "/"+id2, owner, `{"metadata":{"title":"B"}}`); rec.Code != http.StatusOK {
		t.Fatalf("other file must not be limited, got %d", rec.Code)
	}
	if rec := e.do(t, http.MethodPut, "/"+id, collab, `{"metadata":{"title":"B"}}`); rec.Code != http.StatusOK {
		t.Fatalf("other user must not be limited, got %d", rec.Code)
	}

	// Reading, creating and other endpoints stay untouched.
	if rec := e.do(t, http.MethodGet, "/"+id, owner, ""); rec.Code != http.StatusOK {
		t.Fatalf("GET must not be limited, got %d", rec.Code)
	}
	if rec := e.do(t, http.MethodGet, "/", owner, ""); rec.Code != http.StatusOK {
		t.Fatalf("list must not be limited, got %d", rec.Code)
	}
	if rec := e.do(t, http.MethodPost, "/", owner, `{"type":"event","metadata":{}}`); rec.Code != http.StatusCreated {
		t.Fatalf("create must not be limited, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := e.do(t, http.MethodPut, "/"+id+"/backups/week", owner, `{"data":"x"}`); rec.Code == http.StatusTooManyRequests {
		t.Fatalf("backup endpoint must not use the file update limiter")
	}
}

// Simulated clock: the production limits never refuse the client's legitimate write patterns,
// and brake a ping-pong loop.
func TestFileUpdateGuard_ProductionLimits(t *testing.T) {
	newGuard := func() *fileUpdateGuard {
		g := newFileUpdateGuard(fileUpdateRatePerMinute, fileUpdateBurst)
		t.Cleanup(g.limiter.Stop)
		return g
	}
	start := time.Unix(1_700_000_000, 0)

	t.Run("eventWriteGuard pattern from three tabs", func(t *testing.T) {
		g := newGuard()
		// Each tab: burst of 3, then one write per 2 s, capped at 20/min (eventWriteGuard.ts). 3 tabs = 60/min.
		now := start
		for i := 0; i < 3*3; i++ {
			if ok, _ := g.allowAt("u", "f", now); !ok {
				t.Fatalf("burst write %d refused", i)
			}
		}
		for i := 0; i < 30*60; i++ { // 30 minutes, 60/min
			now = now.Add(time.Second)
			if ok, _ := g.allowAt("u", "f", now); !ok {
				t.Fatalf("legitimate write refused after %v", now.Sub(start))
			}
		}
	})

	t.Run("search index rebuild debounce plus bursts", func(t *testing.T) {
		g := newGuard()
		now := start
		// Two tabs rewriting the index every 2 s debounce (60/min) for 20 minutes, with a burst of
		// 20 extra writes (e.g. a bulk operation) every 5 minutes.
		for sec := 0; sec < 20*60; sec++ {
			now = start.Add(time.Duration(sec) * time.Second)
			n := 1
			if sec%300 == 150 {
				n += 20
			}
			for k := 0; k < n; k++ {
				if ok, _ := g.allowAt("u", "index", now); !ok {
					t.Fatalf("index write refused at %ds", sec)
				}
			}
		}
	})

	t.Run("ping-pong loop is braked", func(t *testing.T) {
		g := newGuard()
		accepted, refused := 0, 0
		for i := 0; i < 270*5; i++ { // 270/min for 5 minutes
			now := start.Add(time.Duration(i) * time.Minute / 270)
			if ok, retry := g.allowAt("u", "f", now); ok {
				accepted++
			} else {
				refused++
				if retry <= 0 {
					t.Fatalf("refusal without retry-after")
				}
			}
		}
		if limit := fileUpdateBurst + fileUpdateRatePerMinute*5 + 1; accepted > limit {
			t.Fatalf("accepted %d writes, expected at most %d", accepted, limit)
		}
		if refused == 0 {
			t.Fatalf("loop was not braked")
		}
	})
}

func TestFileUpdateGuard_WarnsOncePerFileAndMinute(t *testing.T) {
	g := newFileUpdateGuard(60, 1)
	defer g.limiter.Stop()
	now := time.Unix(1_700_000_000, 0)
	if !g.shouldWarn("f", now) {
		t.Fatal("first refusal should warn")
	}
	if g.shouldWarn("f", now.Add(30*time.Second)) {
		t.Fatal("second warning within a minute")
	}
	if !g.shouldWarn("other", now.Add(30*time.Second)) {
		t.Fatal("another file should warn on its own")
	}
	if !g.shouldWarn("f", now.Add(61*time.Second)) {
		t.Fatal("should warn again after a minute")
	}
}

func TestNormalizedJSONEqual(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{`{"a":1,"b":"x"}`, `{"b":"x","a":1}`, true},
		{`{"a":1,"b":null,"c":"","d":false,"e":{},"f":[]}`, `{"a":1}`, true},
		{`null`, `{}`, true},
		{``, `{}`, true},
		{`{"o":{"x":null}}`, `{}`, true},
		{`{"a":true}`, `{}`, false},
		{`{"a":0}`, `{}`, false},
		{`{"a":1}`, `{"a":1.0}`, false},
		{`{"a":12345678901234567890}`, `{"a":12345678901234567891}`, false},
		{`{"l":["a","b"]}`, `{"l":["b","a"]}`, false},
		{`{"l":[null]}`, `{}`, false},
		{`{"a":"x"}`, `{"a":"y"}`, false},
		{`not json`, `not json`, true},
		{`not json`, `{}`, false},
		{`{"a":1} {"b":2}`, `{"a":1}`, false},
	}
	for _, c := range cases {
		if got := normalizedJSONEqual([]byte(c.a), []byte(c.b)); got != c.want {
			t.Errorf("normalizedJSONEqual(%s, %s) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

// A write that is rejected for a stale version must leave the stored blob untouched.
func TestUpdateFile_StaleVersionDoesNotOverwriteBlob(t *testing.T) {
	e := setupGuardTest(t, nil)
	owner := createSecurityTestUser(t, e.s, "stale-blob-owner")
	id := e.createFile(t, owner, `{"title":"A"}`, nil)

	rec := e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"metadata":{"title":"A"},"content_ciphertext":"first"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("first write: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = e.do(t, http.MethodPut, "/"+id, owner, `{"version":1,"metadata":{"title":"B"},"content_ciphertext":"stale-overwrite"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("stale write: expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
	rc, err := e.bs.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("blob missing: %v", err)
	}
	data, _ := io.ReadAll(rc)
	rc.Close()
	if string(data) != "first" {
		t.Fatalf("a rejected write must not change the blob, got %q", data)
	}
	if got := e.stored(t, id); got.Version != 2 {
		t.Fatalf("expected version 2 after one real write, got %d", got.Version)
	}
}
