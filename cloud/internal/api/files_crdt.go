package api

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

// --- CRDT Endpoints ---

type CompactRequest struct {
	UpToSeqID        int64  `json:"upToSeqId"`
	KeyEpoch         uint32 `json:"keyEpoch"`
	IVBase64         string `json:"ivBase64"`
	CiphertextBase64 string `json:"ciphertextBase64"`
}

func (h *FileHandler) GetCRDTState(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	if fileID == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	state, err := h.Store.GetCRDTState(r.Context(), fileID, userID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found or access denied", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to get CRDT state: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

func (h *FileHandler) CompactYjsWAL(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	if fileID == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	file, err := h.Store.GetAccessibleFile(r.Context(), fileID, userID)
	if err != nil {
		http.Error(w, "File not found or access denied", http.StatusNotFound)
		return
	}

	if len(file.Metadata) > 0 {
		var metaCheck struct {
			DeletedAt string `json:"deleted_at"`
		}
		if err := json.Unmarshal(file.Metadata, &metaCheck); err == nil && metaCheck.DeletedAt != "" {
			http.Error(w, "File not found or access denied", http.StatusNotFound)
			return
		}
	}

	if !store.CanWrite(file.Permission) {
		http.Error(w, "Forbidden: write permission required", http.StatusForbidden)
		return
	}

	var req CompactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	iv, err := base64.StdEncoding.DecodeString(req.IVBase64)
	if err != nil {
		http.Error(w, "Invalid ivBase64 encoding", http.StatusBadRequest)
		return
	}

	ciphertext, err := base64.StdEncoding.DecodeString(req.CiphertextBase64)
	if err != nil {
		http.Error(w, "Invalid ciphertextBase64 encoding", http.StatusBadRequest)
		return
	}

	if err := h.Store.CompactYjsWAL(r.Context(), fileID, req.UpToSeqID, req.KeyEpoch, iv, ciphertext); err != nil {
		http.Error(w, "Failed to compact Yjs WAL: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
