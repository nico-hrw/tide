package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/store"
)

type FinanceHandler struct {
	Store  store.Store
	Broker *Broker
}

func NewFinanceHandler(s store.Store, b *Broker) *FinanceHandler {
	return &FinanceHandler{Store: s, Broker: b}
}

func (h *FinanceHandler) RegisterRoutes(r chi.Router) {
	r.Use(AuthMiddleware)
	r.Get("/accounts", h.GetAccounts)
	r.Post("/accounts", h.CreateAccount)
	r.Delete("/accounts/{id}", h.DeleteAccount)
	r.Get("/transactions", h.GetTransactions)
	r.Post("/transactions", h.CreateTransaction)
}

type CreateAccountRequest struct {
	Name            string `json:"name"`
	Type            string `json:"type"` // e.g. "budget", "asset", "equity"
	LinkedAccountID string `json:"linked_account_id"`
}

func (h *FinanceHandler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.Type == "" {
		http.Error(w, "Name and Type are required", http.StatusBadRequest)
		return
	}

	accountID := uuid.New().String()

	if err := h.Store.CreateFinanceAccount(r.Context(), accountID, userID, req.Name, req.Type, req.LinkedAccountID, time.Now()); err != nil {
		http.Error(w, "Failed to create account", http.StatusInternalServerError)
		return
	}

	// Trigger SSE update for the client
	h.Broker.Broadcast(userID, "finance_update")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": accountID, "status": "success"})
}

func (h *FinanceHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	accountID := chi.URLParam(r, "id")
	if !ok || userID == "" || accountID == "" {
		http.Error(w, "Unauthorized or Invalid Request", http.StatusUnauthorized)
		return
	}

	if err := h.Store.DeleteFinanceAccountAtomic(r.Context(), accountID, userID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Account not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete account", http.StatusInternalServerError)
		return
	}

	h.Broker.Broadcast(userID, "finance_update")
	w.WriteHeader(http.StatusOK)
}

type CreateTransactionRequest struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	Date        string  `json:"date"`
	Type        string  `json:"type"` // "income" or "expense"
	AccountId   string  `json:"account_id"`
}

func (h *FinanceHandler) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		http.Error(w, "Amount must be positive", http.StatusBadRequest)
		return
	}

	transactionID := uuid.New().String()
	txDate, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		txDate = time.Now()
	}

	// Double Entry Logic: We need two entries for every transaction.
	// We'll mock the account resolution here for the prototype until we implement a full Chart of Accounts.

	debitAccountID := uuid.New().String()  // E.g. Checking
	creditAccountID := uuid.New().String() // E.g. Salary Expense

	if req.Type == "income" {
		// Debit Asset, Credit Income
		debitAccountID = req.AccountId
		if debitAccountID == "" {
			debitAccountID = "asset-checking-mock"
		}
		creditAccountID = "income-salary-mock"
	} else if req.Type == "expense" {
		// Debit Expense, Credit Asset
		debitAccountID = "expense-category-mock"
		creditAccountID = req.AccountId
		if creditAccountID == "" {
			creditAccountID = "asset-checking-mock"
		}
	}

	if err := h.Store.CreateFinanceTransactionAtomic(r.Context(), transactionID, userID, txDate, req.Description, debitAccountID, creditAccountID, req.Amount); err != nil {
		http.Error(w, "Failed to create transaction", http.StatusInternalServerError)
		return
	}

	// Trigger SSE update for the client
	h.Broker.Broadcast(userID, "finance_update")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": transactionID, "status": "success"})
}

func (h *FinanceHandler) GetAccounts(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	accounts, err := h.Store.GetFinanceAccounts(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to query accounts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(accounts)
}

func (h *FinanceHandler) GetTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	transactions, err := h.Store.GetFinanceTransactions(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to query transactions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transactions)
}
