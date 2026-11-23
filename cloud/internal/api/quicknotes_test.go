package api

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/nicoh/tide/internal/store"
)

func setupTestQuicknoteHandler(t *testing.T) (*QuicknoteHandler, *store.SQLiteStore, *Hub) {
	t.Helper()
	tempDir := t.TempDir()
	s, err := store.NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("Failed to initialize test SQLite store: %v", err)
	}
	t.Cleanup(func() {
		_ = s.Close()
	})

	hub := &Hub{
		rooms:     make(map[string]map[*Client]bool),
		lastPulse: make(map[string]time.Time),
	}
	blobStore := store.NewLocalBlobStore(t.TempDir())
	h := NewQuicknoteHandler(s, blobStore, hub)
	return h, s, hub
}

func TestQuicknote_GetAndSave(t *testing.T) {
	h, _, _ := setupTestQuicknoteHandler(t)
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	// 1. GetQuicknote creates note if not exists
	req := httptest.NewRequest(http.MethodGet, "/test-slug", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var resp QuicknoteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Slug != "test-slug" {
		t.Errorf("expected slug 'test-slug', got %s", resp.Slug)
	}

	// 2. SaveQuicknote updates title & content
	saveBody := `{"title": "Updated Title", "content": "Updated Content"}`
	saveReq := httptest.NewRequest(http.MethodPut, "/test-slug", strings.NewReader(saveBody))
	saveReq.Header.Set("Content-Type", "application/json")
	saveW := httptest.NewRecorder()
	r.ServeHTTP(saveW, saveReq)

	if saveW.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", saveW.Code, saveW.Body.String())
	}

	// 3. Verify changes persisted
	req2 := httptest.NewRequest(http.MethodGet, "/test-slug", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	var resp2 QuicknoteResponse
	if err := json.Unmarshal(w2.Body.Bytes(), &resp2); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp2.Title != "Updated Title" || resp2.Content != "Updated Content" {
		t.Errorf("expected updated title/content, got %+v", resp2)
	}
}

func TestQuicknote_CRDTStateAndCompact(t *testing.T) {
	h, s, _ := setupTestQuicknoteHandler(t)
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	// Initialize note
	_, err := s.GetOrCreateQuicknote(context.Background(), "crdt-slug", "CRDT Note")
	if err != nil {
		t.Fatalf("GetOrCreateQuicknote failed: %v", err)
	}

	// 1. Get empty CRDT state
	req := httptest.NewRequest(http.MethodGet, "/crdt-slug/crdt-state", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var stateResp QuicknoteCRDTStateResponse
	if err := json.Unmarshal(w.Body.Bytes(), &stateResp); err != nil {
		t.Fatalf("failed to decode crdt state: %v", err)
	}
	if stateResp.Snapshot != nil {
		t.Errorf("expected nil snapshot on new note, got %+v", stateResp.Snapshot)
	}
	if len(stateResp.WAL) != 0 {
		t.Errorf("expected empty WAL, got %d entries", len(stateResp.WAL))
	}

	// 2. Append WAL entries directly
	iv := []byte("123456789012") // 12 bytes
	cipher := []byte("ciphertext123456")
	seq1, err := s.AppendQuicknoteWAL(context.Background(), "crdt-slug", 1, iv, cipher)
	if err != nil || seq1 <= 0 {
		t.Fatalf("AppendQuicknoteWAL failed: %v", err)
	}

	// 3. Get CRDT state again
	req2 := httptest.NewRequest(http.MethodGet, "/crdt-slug/crdt-state", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	var stateResp2 QuicknoteCRDTStateResponse
	if err := json.Unmarshal(w2.Body.Bytes(), &stateResp2); err != nil {
		t.Fatalf("failed to decode crdt state: %v", err)
	}
	if len(stateResp2.WAL) != 1 {
		t.Fatalf("expected 1 WAL entry, got %d", len(stateResp2.WAL))
	}
	if stateResp2.WAL[0].SeqID != seq1 {
		t.Errorf("expected seqID %d, got %d", seq1, stateResp2.WAL[0].SeqID)
	}

	// 4. Compact snapshot
	compactPayload := map[string]any{
		"iv":           base64.StdEncoding.EncodeToString(iv),
		"ciphertext":   base64.StdEncoding.EncodeToString(cipher),
		"up_to_seq_id": seq1,
	}
	payloadBytes, _ := json.Marshal(compactPayload)
	compactReq := httptest.NewRequest(http.MethodPost, "/crdt-slug/compact", strings.NewReader(string(payloadBytes)))
	compactReq.Header.Set("Content-Type", "application/json")
	compactW := httptest.NewRecorder()
	r.ServeHTTP(compactW, compactReq)

	if compactW.Code != http.StatusOK {
		t.Fatalf("compact failed with code %d: %s", compactW.Code, compactW.Body.String())
	}

	// 5. Check state after compact: snapshot should now exist and WAL should be empty
	req3 := httptest.NewRequest(http.MethodGet, "/crdt-slug/crdt-state", nil)
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)

	var stateResp3 QuicknoteCRDTStateResponse
	if err := json.Unmarshal(w3.Body.Bytes(), &stateResp3); err != nil {
		t.Fatalf("failed to decode crdt state: %v", err)
	}
	if stateResp3.Snapshot == nil {
		t.Fatalf("expected non-nil snapshot after compact")
	}
	if stateResp3.Snapshot.SeqID != seq1 {
		t.Errorf("expected snapshot seq_id %d, got %d", seq1, stateResp3.Snapshot.SeqID)
	}
	if len(stateResp3.WAL) != 0 {
		t.Errorf("expected pruned WAL (0 entries), got %d", len(stateResp3.WAL))
	}
}

func TestQuicknote_WebSocketSync(t *testing.T) {
	h, s, hub := setupTestQuicknoteHandler(t)
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	server := httptest.NewServer(r)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/test-sync"

	// Connect Client 1
	c1, _, err := websocket.DefaultDialer.Dial(wsURL+"?yClientId=1001", nil)
	if err != nil {
		t.Fatalf("Client 1 failed to connect: %v", err)
	}
	defer c1.Close()

	// Connect Client 2
	c2, _, err := websocket.DefaultDialer.Dial(wsURL+"?yClientId=1002", nil)
	if err != nil {
		t.Fatalf("Client 2 failed to connect: %v", err)
	}
	defer c2.Close()

	// Verify both clients are registered in hub
	time.Sleep(50 * time.Millisecond)
	hub.mu.RLock()
	room := hub.rooms["quicknote:test-sync"]
	roomSize := len(room)
	hub.mu.RUnlock()
	if roomSize != 2 {
		t.Fatalf("expected 2 clients in room, got %d", roomSize)
	}

	// Craft a FrameTypeCRDTUpdate frame:
	// MsgType(1) + KeyEpoch(4) + IV(12) + GCMTag/Ciphertext(16) = 33 bytes
	frame := make([]byte, MinEncryptedFrameLen)
	frame[0] = FrameTypeCRDTUpdate
	binary.BigEndian.PutUint32(frame[1:5], 1)
	copy(frame[5:17], []byte("123456789012"))
	copy(frame[17:33], []byte("1234567890123456"))

	// Client 1 sends CRDT update
	if err := c1.WriteMessage(websocket.BinaryMessage, frame); err != nil {
		t.Fatalf("Client 1 failed to send frame: %v", err)
	}

	// Client 2 should receive the broadcasted frame
	_ = c2.SetReadDeadline(time.Now().Add(2 * time.Second))
	msgType, received, err := c2.ReadMessage()
	if err != nil {
		t.Fatalf("Client 2 failed to receive message: %v", err)
	}
	if msgType != websocket.BinaryMessage {
		t.Errorf("expected BinaryMessage, got %d", msgType)
	}
	if len(received) != len(frame) || received[0] != FrameTypeCRDTUpdate {
		t.Errorf("received payload does not match sent frame")
	}

	// Verify WAL entry was appended in SQLite
	time.Sleep(50 * time.Millisecond)
	_, wal, err := s.GetQuicknoteCRDTState(context.Background(), "test-sync")
	if err != nil {
		t.Fatalf("GetQuicknoteCRDTState failed: %v", err)
	}
	if len(wal) != 1 {
		t.Fatalf("expected 1 WAL entry in DB, got %d", len(wal))
	}
}

func signQuicknoteTestJWT(t *testing.T, secret, userID string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign test JWT: %v", err)
	}
	return signed
}

func TestSecurity_QuicknotesOptInApprovalLifecycle(t *testing.T) {
	const jwtSecret = "phase2-security-regression-test-secret-32b"
	t.Setenv("JWT_SECRET", jwtSecret)

	h, _, _ := setupTestQuicknoteHandler(t)
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	slug := "sec-approval-note"
	ownerID := "owner-user-1"
	userBID := "user-b-2"
	ownerJWT := signQuicknoteTestJWT(t, jwtSecret, ownerID)
	userBJWT := signQuicknoteTestJWT(t, jwtSecret, userBID)

	doReq := func(method, path, body, token string) *httptest.ResponseRecorder {
		var bodyReader *strings.Reader
		if body != "" {
			bodyReader = strings.NewReader(body)
		} else {
			bodyReader = strings.NewReader("")
		}
		req := httptest.NewRequest(method, path, bodyReader)
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// 1. Default new quicknote (access_mode == "open") is readable & writable without auth.
	w := doReq(http.MethodGet, "/"+slug, "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for open GET, got %d: %s", w.Code, w.Body.String())
	}
	var openResp QuicknoteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &openResp); err != nil {
		t.Fatalf("failed to decode open GET response: %v", err)
	}
	if openResp.AccessMode != "open" {
		t.Fatalf("expected access_mode 'open', got %q", openResp.AccessMode)
	}

	w = doReq(http.MethodPut, "/"+slug, `{"title":"Open Title","content":"Open Content"}`, "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for open PUT without auth, got %d: %s", w.Code, w.Body.String())
	}

	// 2. Logged-in Owner enables approval_required.
	w = doReq(http.MethodPut, "/"+slug+"/access", `{"access_mode":"approval_required"}`, ownerJWT)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for owner PUT /access, got %d: %s", w.Code, w.Body.String())
	}
	var accessResp QuicknoteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &accessResp); err != nil {
		t.Fatalf("failed to decode PUT /access response: %v", err)
	}
	if !accessResp.IsOwner || accessResp.AccessMode != "approval_required" {
		t.Fatalf("expected is_owner=true and access_mode=approval_required, got %+v", accessResp)
	}

	// 3. Unauthenticated guest GET receives 403 with error=access_approval_required, access_status=auth_required.
	w = doReq(http.MethodGet, "/"+slug, "", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for guest GET, got %d: %s", w.Code, w.Body.String())
	}
	var deniedGuest map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &deniedGuest); err != nil {
		t.Fatalf("failed to decode guest 403 JSON: %v", err)
	}
	if deniedGuest["error"] != "access_approval_required" || deniedGuest["access_status"] != "auth_required" {
		t.Fatalf("unexpected guest 403 payload: %+v", deniedGuest)
	}

	// 4. Logged-in User B GET receives 403 with access_status=none.
	w = doReq(http.MethodGet, "/"+slug, "", userBJWT)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for User B GET, got %d: %s", w.Code, w.Body.String())
	}
	var deniedUserB map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &deniedUserB); err != nil {
		t.Fatalf("failed to decode User B 403 JSON: %v", err)
	}
	if deniedUserB["access_status"] != "none" {
		t.Fatalf("expected access_status 'none', got %+v", deniedUserB)
	}

	// 5. User B requests access -> 200 OK; GET now returns 403 with access_status=pending.
	w = doReq(http.MethodPost, "/"+slug+"/access-requests", "", userBJWT)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for User B access request, got %d: %s", w.Code, w.Body.String())
	}
	w = doReq(http.MethodGet, "/"+slug, "", userBJWT)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden while pending, got %d: %s", w.Code, w.Body.String())
	}
	var pendingResp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &pendingResp); err != nil {
		t.Fatalf("failed to decode pending 403 JSON: %v", err)
	}
	if pendingResp["access_status"] != "pending" {
		t.Fatalf("expected access_status 'pending', got %+v", pendingResp)
	}

	// 6. Owner lists access requests (sees User B) and approves User B.
	w = doReq(http.MethodGet, "/"+slug+"/access-requests", "", ownerJWT)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK listing access requests, got %d: %s", w.Code, w.Body.String())
	}
	var reqs []store.QuicknoteAccessRequest
	if err := json.Unmarshal(w.Body.Bytes(), &reqs); err != nil {
		t.Fatalf("failed to decode access requests list: %v", err)
	}
	if len(reqs) != 1 || reqs[0].UserID != userBID {
		t.Fatalf("expected 1 access request for %s, got %+v", userBID, reqs)
	}

	w = doReq(http.MethodPost, "/"+slug+"/access-requests/"+userBID+"/approve", "", ownerJWT)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK approving User B, got %d: %s", w.Code, w.Body.String())
	}

	// 7. User B GET now returns 200 OK with access_status=approved.
	w = doReq(http.MethodGet, "/"+slug, "", userBJWT)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for approved User B, got %d: %s", w.Code, w.Body.String())
	}
	var approvedResp QuicknoteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &approvedResp); err != nil {
		t.Fatalf("failed to decode approved GET response: %v", err)
	}
	if approvedResp.AccessStatus != "approved" {
		t.Fatalf("expected access_status 'approved', got %q", approvedResp.AccessStatus)
	}

	// 8. Owner denies User B -> User B receives 403 Forbidden with access_status=denied.
	w = doReq(http.MethodPost, "/"+slug+"/access-requests/"+userBID+"/deny", "", ownerJWT)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK denying User B, got %d: %s", w.Code, w.Body.String())
	}
	w = doReq(http.MethodGet, "/"+slug, "", userBJWT)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for denied User B, got %d: %s", w.Code, w.Body.String())
	}
	var deniedAfter map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &deniedAfter); err != nil {
		t.Fatalf("failed to decode denied 403 JSON: %v", err)
	}
	if deniedAfter["access_status"] != "denied" {
		t.Fatalf("expected access_status 'denied', got %+v", deniedAfter)
	}

	// 9. Owner switches back to open -> unauthenticated guest can access GET /{slug} again.
	w = doReq(http.MethodPut, "/"+slug+"/access", `{"access_mode":"open"}`, ownerJWT)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK reopening quicknote, got %d: %s", w.Code, w.Body.String())
	}
	w = doReq(http.MethodGet, "/"+slug, "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for guest GET after reopening, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSecurity_WSTicketSingleUse(t *testing.T) {
	ticket, err := IssueWSTicket("user-1")
	if err != nil {
		t.Fatalf("IssueWSTicket failed: %v", err)
	}
	if ticket == "" {
		t.Fatal("expected non-empty ticket")
	}

	uid, ok := ConsumeWSTicket(ticket)
	if !ok || uid != "user-1" {
		t.Fatalf("first ConsumeWSTicket = (%q, %v), want (%q, true)", uid, ok, "user-1")
	}

	uid2, ok2 := ConsumeWSTicket(ticket)
	if ok2 || uid2 != "" {
		t.Fatalf("second ConsumeWSTicket = (%q, %v), want (\"\", false)", uid2, ok2)
	}
}

func TestSecurity_CSRFMiddleware(t *testing.T) {
	r := chi.NewRouter()
	r.Use(CSRFMiddleware(func(origin string) bool {
		return origin == "https://go-tide.app"
	}))
	r.Post("/api/v1/notes", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// 1. Cookie-authenticated POST without X-Requested-With -> 403 Forbidden.
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/notes", nil)
	req1.AddCookie(&http.Cookie{Name: "tide_session", Value: "session-jwt"})
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for cookie POST without X-Requested-With, got %d", w1.Code)
	}

	// 2. Cookie-authenticated POST with Sec-Fetch-Site: cross-site -> 403 Forbidden.
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/notes", nil)
	req2.AddCookie(&http.Cookie{Name: "tide_session", Value: "session-jwt"})
	req2.Header.Set("Sec-Fetch-Site", "cross-site")
	req2.Header.Set("X-Requested-With", "Tide")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for cookie POST with Sec-Fetch-Site: cross-site, got %d", w2.Code)
	}

	// 3. Cookie-authenticated POST with X-Requested-With: Tide and trusted Origin -> 200 OK.
	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/notes", nil)
	req3.AddCookie(&http.Cookie{Name: "tide_session", Value: "session-jwt"})
	req3.Header.Set("X-Requested-With", "Tide")
	req3.Header.Set("Origin", "https://go-tide.app")
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for valid cookie POST, got %d: %s", w3.Code, w3.Body.String())
	}

	// 4. Authorization: Bearer ... POST without X-Requested-With -> 200 OK.
	req4 := httptest.NewRequest(http.MethodPost, "/api/v1/notes", nil)
	req4.Header.Set("Authorization", "Bearer api-token-123")
	w4 := httptest.NewRecorder()
	r.ServeHTTP(w4, req4)
	if w4.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for Bearer POST without X-Requested-With, got %d: %s", w4.Code, w4.Body.String())
	}
}
