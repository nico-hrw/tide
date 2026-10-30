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
	h := NewQuicknoteHandler(s, hub)
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
