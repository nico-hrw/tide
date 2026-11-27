package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

func TestSecurityPhase1_H02_StoreCTEOwnershipIsolation(t *testing.T) {
	s, _, aliceID, bobID := setupPhase0StoreAndUser(t)
	ctx := context.Background()
	now := time.Now().UTC()

	aliceFolderID := "h02-alice-folder-" + uuid.NewString()
	aliceChildID := "h02-alice-child-" + uuid.NewString()
	bobChildID := "h02-bob-child-" + uuid.NewString()

	for _, f := range []*db.File{
		{ID: aliceFolderID, OwnerID: aliceID, Type: db.FileTypeFolder, Visibility: "private", Metadata: []byte(`{"title":"Shared Folder"}`), Version: 1, CreatedAt: now, UpdatedAt: now},
		{ID: aliceChildID, OwnerID: aliceID, ParentID: &aliceFolderID, Type: db.FileTypeNote, Visibility: "private", Metadata: []byte(`{"title":"Alice Child"}`), Version: 1, CreatedAt: now, UpdatedAt: now},
		{ID: bobChildID, OwnerID: bobID, ParentID: &aliceFolderID, Type: db.FileTypeNote, Visibility: "private", Metadata: []byte(`{"title":"Bob Child"}`), Version: 1, CreatedAt: now, UpdatedAt: now},
	} {
		if err := s.CreateFile(ctx, f); err != nil {
			t.Fatalf("CreateFile(%s) failed: %v", f.ID, err)
		}
	}

	// 1. UpdateFile and UpdateFileWithOCC must never reassign owner_id
	updated, err := s.GetFile(ctx, aliceChildID)
	if err != nil {
		t.Fatalf("GetFile failed: %v", err)
	}
	updated.OwnerID = bobID
	if err := s.UpdateFile(ctx, updated); err != nil {
		t.Fatalf("UpdateFile failed: %v", err)
	}
	checkOwner, _ := s.GetFile(ctx, aliceChildID)
	if checkOwner.OwnerID != aliceID {
		t.Fatalf("UpdateFile allowed owner_id reassignment to %q", checkOwner.OwnerID)
	}

	updated.OwnerID = bobID
	if err := s.UpdateFileWithOCC(ctx, updated, checkOwner.Version); err != nil {
		t.Fatalf("UpdateFileWithOCC failed: %v", err)
	}
	checkOwner2, _ := s.GetFile(ctx, aliceChildID)
	if checkOwner2.OwnerID != aliceID {
		t.Fatalf("UpdateFileWithOCC allowed owner_id reassignment to %q", checkOwner2.OwnerID)
	}

	// 2. SetVisibility validates enum and SetVisibilityRecursive stays within owner_id
	if err := s.SetVisibility(ctx, aliceFolderID, "invalid_vis"); err == nil {
		t.Fatalf("expected error for invalid visibility")
	}
	if err := s.SetVisibilityRecursive(ctx, aliceFolderID, "public"); err != nil {
		t.Fatalf("SetVisibilityRecursive failed: %v", err)
	}
	bobChildAfterVis, _ := s.GetFile(ctx, bobChildID)
	if bobChildAfterVis.Visibility != "private" {
		t.Fatalf("SetVisibilityRecursive leaked across owners: Bob child visibility became %q", bobChildAfterVis.Visibility)
	}

	// 3. SoftDeleteFile & DeleteFile on Alice's folder must not touch Bob's child inside that folder
	if err := s.SoftDeleteFile(ctx, aliceFolderID); err != nil {
		t.Fatalf("SoftDeleteFile failed: %v", err)
	}
	bobChildAfterSoft, _ := s.GetFile(ctx, bobChildID)
	if strings.Contains(string(bobChildAfterSoft.Metadata), "deleted_at") {
		t.Fatalf("SoftDeleteFile modified Bob's child metadata: %s", bobChildAfterSoft.Metadata)
	}

	if err := s.DeleteFile(ctx, aliceFolderID); err != nil {
		t.Fatalf("DeleteFile failed: %v", err)
	}
	if _, err := s.GetFile(ctx, aliceChildID); err != store.ErrNotFound {
		t.Fatalf("expected Alice's child to be deleted, got err=%v", err)
	}
	if _, err := s.GetFile(ctx, bobChildID); err != nil {
		t.Fatalf("DeleteFile deleted Bob's child in shared folder: err=%v", err)
	}
}

func TestSecurityPhase1_H07_OTPCooldownAndAtomicVerifyLockout(t *testing.T) {
	s, _, aliceID, _ := setupPhase0StoreAndUser(t)
	email := "alice-h07@example.test"
	if err := s.UpdateUserEmail(context.Background(), aliceID, hashString(email)); err != nil {
		t.Fatalf("UpdateUserEmail failed: %v", err)
	}

	t.Setenv("ENV", "development")
	h := NewAuthHandler(s, []byte("01234567890123456789012345678901"))
	r := chi.NewRouter()
	r.Post("/request-otp", h.RequestOTP)
	r.Post("/verify-otp", h.VerifyOTP)

	// 1. First RequestOTP succeeds; immediate second RequestOTP hits 30s per-user cooldown (429)
	reqBody, _ := json.Marshal(map[string]string{"email": email})
	rec1 := httptest.NewRecorder()
	r.ServeHTTP(rec1, httptest.NewRequest(http.MethodPost, "/request-otp", bytes.NewReader(reqBody)))
	if rec1.Code != http.StatusOK {
		t.Fatalf("first RequestOTP expected 200, got %d: %s", rec1.Code, rec1.Body.String())
	}

	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, httptest.NewRequest(http.MethodPost, "/request-otp", bytes.NewReader(reqBody)))
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("rapid second RequestOTP expected 429 cooldown, got %d: %s", rec2.Code, rec2.Body.String())
	}

	// 2. Concurrent wrong VerifyOTP attempts must be serialized under h.mu and evict OTP atomically at 5 failures
	var wg sync.WaitGroup
	codes := make(chan int, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			vb, _ := json.Marshal(map[string]string{"email": email, "otp": "000000"})
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/verify-otp", bytes.NewReader(vb)))
			codes <- rec.Code
		}()
	}
	wg.Wait()
	close(codes)

	unauthCount, lockedCount := 0, 0
	for c := range codes {
		switch c {
		case http.StatusUnauthorized:
			unauthCount++
		case http.StatusTooManyRequests:
			lockedCount++
		default:
			t.Fatalf("unexpected status code from VerifyOTP: %d", c)
		}
	}
	if unauthCount != maxOTPAttemptsPerCode || lockedCount != 5 {
		t.Fatalf("expected exactly %d 401s and 5 429s under concurrency, got 401=%d 429=%d", maxOTPAttemptsPerCode, unauthCount, lockedCount)
	}

	h.mu.Lock()
	_, stillCached := h.otpCache[aliceID]
	h.mu.Unlock()
	if stillCached {
		t.Fatalf("expected otpCache entry for %s to be evicted upon lockout", aliceID)
	}

	// 3. Subsequent RequestOTP while locked out must also return 429
	recLocked := httptest.NewRecorder()
	r.ServeHTTP(recLocked, httptest.NewRequest(http.MethodPost, "/request-otp", bytes.NewReader(reqBody)))
	if recLocked.Code != http.StatusTooManyRequests {
		t.Fatalf("RequestOTP during lockout expected 429, got %d", recLocked.Code)
	}
}

func TestSecurityPhase1_H08_ProfilesAuthAndSearchPublicData(t *testing.T) {
	s, _, aliceID, bobID := setupPhase0StoreAndUser(t)
	ctx := context.Background()
	now := time.Now().UTC()

	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")

	// Bob has a private profile (profile_status = 0, is_verified = 0) and an email blind index
	bobEmail := "bob-secret-h08@example.test"
	if err := s.UpdateUserEmail(ctx, bobID, hashString(bobEmail)); err != nil {
		t.Fatalf("UpdateUserEmail failed: %v", err)
	}
	if err := s.UpsertProfile(ctx, &db.Profile{UserID: bobID, Title: "HiddenBob", ProfileStatus: 0}); err != nil {
		t.Fatalf("UpsertProfile failed: %v", err)
	}

	// Alice has a trashed public note and an active public note
	trashedPub := &db.File{
		ID: uuid.NewString(), OwnerID: aliceID, Type: db.FileTypeNote, Visibility: "public",
		Metadata: []byte(`{"title":"TrashedPublicMatch","is_public":true,"deleted_at":"2026-11-27T00:00:00Z"}`),
		Version:  2, CreatedAt: now, UpdatedAt: now,
	}
	activePub := &db.File{
		ID: uuid.NewString(), OwnerID: aliceID, Type: db.FileTypeNote, Visibility: "public",
		Metadata: []byte(`{"title":"ActivePublicMatch","is_public":true}`),
		Version:  2, CreatedAt: now, UpdatedAt: now,
	}
	for _, f := range []*db.File{trashedPub, activePub} {
		if err := s.CreateFile(ctx, f); err != nil {
			t.Fatalf("CreateFile(%s) failed: %v", f.ID, err)
		}
	}

	// 1. SearchPublicData must not return Bob's private profile by username or email, nor Alice's trashed note
	resPrivate, err := s.SearchPublicData(ctx, "HiddenBob", aliceID)
	if err != nil {
		t.Fatalf("SearchPublicData(HiddenBob) failed: %v", err)
	}
	if len(resPrivate) != 0 {
		t.Fatalf("expected private profile to be hidden from SearchPublicData, got %+v", resPrivate)
	}
	resEmail, err := s.SearchPublicData(ctx, bobEmail, aliceID)
	if err != nil {
		t.Fatalf("SearchPublicData(email) failed: %v", err)
	}
	if len(resEmail) != 0 {
		t.Fatalf("expected email blind index search to return 0 results, got %+v", resEmail)
	}
	resNotes, err := s.SearchPublicData(ctx, "PublicMatch", bobID)
	if err != nil {
		t.Fatalf("SearchPublicData(notes) failed: %v", err)
	}
	if len(resNotes) != 1 || resNotes[0].ID != activePub.ID {
		t.Fatalf("expected only active public note, got %+v", resNotes)
	}

	// 2. GET /profiles/{userID} requires auth (401) and returns 404 (not 500) for missing user
	ph := &ProfileHandler{Store: s}
	r := chi.NewRouter()
	r.Route("/profiles", ph.RegisterRoutes)

	unauthRec := httptest.NewRecorder()
	r.ServeHTTP(unauthRec, httptest.NewRequest(http.MethodGet, "/profiles/"+bobID, nil))
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 unauthenticated GET /profiles/{id}, got %d", unauthRec.Code)
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": aliceID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signedTok, _ := tok.SignedString([]byte(os.Getenv("JWT_SECRET")))

	missingReq := httptest.NewRequest(http.MethodGet, "/profiles/nonexistent-id", nil)
	missingReq.Header.Set("Authorization", "Bearer "+signedTok)
	missingRec := httptest.NewRecorder()
	r.ServeHTTP(missingRec, missingReq)
	if missingRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown profile, got %d: %s", missingRec.Code, missingRec.Body.String())
	}
}

func TestSecurityPhase1_H10_And_H05_EventGroupValidationAndNoQueryTokens(t *testing.T) {
	s, blobStore, aliceID, bobID := setupPhase0StoreAndUser(t)
	ctx := context.Background()
	now := time.Now().UTC()

	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")

	aliceGroupID := uuid.NewString()
	aliceNoteID := uuid.NewString()
	bobGroupID := uuid.NewString()
	for _, f := range []*db.File{
		{ID: aliceGroupID, OwnerID: aliceID, Type: db.FileTypeFolder, Metadata: []byte(`{"title":"Work","isGroup":true}`), Version: 2, CreatedAt: now, UpdatedAt: now},
		{ID: aliceNoteID, OwnerID: aliceID, Type: db.FileTypeNote, Metadata: []byte(`{"title":"PlainNote"}`), Version: 2, CreatedAt: now, UpdatedAt: now},
		{ID: bobGroupID, OwnerID: bobID, Type: db.FileTypeFolder, Metadata: []byte(`{"title":"BobGroup","isGroup":true}`), Version: 2, CreatedAt: now, UpdatedAt: now},
	} {
		if err := s.CreateFile(ctx, f); err != nil {
			t.Fatalf("CreateFile(%s) failed: %v", f.ID, err)
		}
	}

	extTok := insertPhase0Token(t, s, aliceID, "*")
	extRouter := chi.NewRouter()
	NewExternalHandler(s, blobStore).RegisterRoutes(extRouter)

	// 1. H-10: Reject event with a non-folder or foreign second group_id
	for _, badGroups := range [][]string{
		{aliceNoteID},
		{aliceGroupID, bobGroupID},
	} {
		body, _ := json.Marshal(map[string]interface{}{
			"title":     "Meeting",
			"start":     now.Add(time.Hour).Format(time.RFC3339),
			"group_ids": badGroups,
		})
		req := httptest.NewRequest(http.MethodPost, "/events", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+extTok)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		extRouter.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for invalid group_ids %v, got %d: %s", badGroups, rec.Code, rec.Body.String())
		}
	}

	// 2. H-05: APITokenAuth rejects ?api_token= query parameter
	patQueryRec := httptest.NewRecorder()
	extRouter.ServeHTTP(patQueryRec, httptest.NewRequest(http.MethodGet, "/notes?api_token="+extTok, nil))
	if patQueryRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when passing PAT in ?api_token=, got %d", patQueryRec.Code)
	}

	// 3. H-05: AuthMiddleware rejects ?token= query parameter, accepts cookie & Authorization header
	jwtTok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": aliceID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signedJWT, _ := jwtTok.SignedString([]byte(os.Getenv("JWT_SECRET")))

	protected := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	recQuery := httptest.NewRecorder()
	protected.ServeHTTP(recQuery, httptest.NewRequest(http.MethodGet, "/events?token="+signedJWT, nil))
	if recQuery.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when passing JWT in ?token=, got %d", recQuery.Code)
	}

	reqCookie := httptest.NewRequest(http.MethodGet, "/events", nil)
	reqCookie.AddCookie(&http.Cookie{Name: "tide_session", Value: signedJWT})
	recCookie := httptest.NewRecorder()
	protected.ServeHTTP(recCookie, reqCookie)
	if recCookie.Code != http.StatusOK {
		t.Fatalf("expected 200 with tide_session cookie, got %d", recCookie.Code)
	}
}
