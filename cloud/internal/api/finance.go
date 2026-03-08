package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/store"
)

type FinanceHandler struct {
	Store  *store.SQLiteStore
	Broker *Broker
}

func NewFinanceHandler(s *store.SQLiteStore, b *Broker) *FinanceHandler {
	return &FinanceHandler{Store: s, Broker: b}
}

func (h *FinanceHandler) RegisterRoutes(r chi.Router) {
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
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
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

	var linkedID *string
	if req.LinkedAccountID != "" {
		linkedID = &req.LinkedAccountID
	}

	// Insert into ext_finance_accounts
	query := `INSERT INTO ext_finance_accounts (id, user_id, name, type, linked_account_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := h.Store.DB.ExecContext(r.Context(), query, accountID, userID, req.Name, req.Type, linkedID, time.Now())

	if err != nil {
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
	userID := r.Header.Get("X-User-ID")
	accountID := chi.URLParam(r, "id")
	if userID == "" || accountID == "" {
		http.Error(w, "Unauthorized or Invalid Request", http.StatusUnauthorized)
		return
	}

	tx, err := h.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "Server Error", http.StatusInternalServerError)
		return
	}

	// For a simple prototype, we just delete the account. If entries exist, foreign keys might block
	// unless CASCADE is enabled, or we delete entries first.
	_, _ = tx.ExecContext(r.Context(), `DELETE FROM ext_finance_entries WHERE account_id = ?`, accountID)
	_, err = tx.ExecContext(r.Context(), `DELETE FROM ext_finance_accounts WHERE id = ? AND user_id = ?`, accountID, userID)

	if err != nil {
		tx.Rollback()
		http.Error(w, "Failed to delete account", http.StatusInternalServerError)
		return
	}

	tx.Commit()

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
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
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

	// Start a DB Transaction
	tx, err := h.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// 1. Insert Transaction Record
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO ext_finance_transactions (id, user_id, date, description, created_at) VALUES (?, ?, ?, ?, ?)`,
		transactionID, userID, txDate, req.Description, time.Now())

	if err != nil {
		tx.Rollback()
		http.Error(w, "Failed to create transaction record", http.StatusInternalServerError)
		return
	}

	// 2. Insert Debit Entry (Positive amount by convention for our simple ledger, or we could strict-sign it)
	// For strict double entry debit = positive, credit = negative. Must sum to 0.
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO ext_finance_entries (id, transaction_id, account_id, amount) VALUES (?, ?, ?, ?)`,
		uuid.New().String(), transactionID, debitAccountID, req.Amount)

	if err != nil {
		tx.Rollback()
		http.Error(w, "Failed to create debit entry", http.StatusInternalServerError)
		return
	}

	// 3. Insert Credit Entry
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO ext_finance_entries (id, transaction_id, account_id, amount) VALUES (?, ?, ?, ?)`,
		uuid.New().String(), transactionID, creditAccountID, -req.Amount)

	if err != nil {
		tx.Rollback()
		http.Error(w, "Failed to create credit entry", http.StatusInternalServerError)
		return
	}

	// Commit
	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	// Trigger SSE update for the client
	h.Broker.Broadcast(userID, "finance_update")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": transactionID, "status": "success"})
}

type AccountResponse struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Type            string  `json:"type"`
	Balance         float64 `json:"balance"`
	LinkedAccountID *string `json:"linked_account_id,omitempty"`
}

func (h *FinanceHandler) GetAccounts(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	query := `
		SELECT a.id, a.name, a.type, COALESCE(SUM(e.amount), 0) as balance, a.linked_account_id
		FROM ext_finance_accounts a
		LEFT JOIN ext_finance_entries e ON a.id = e.account_id
		WHERE a.user_id = ?
		GROUP BY a.id, a.name, a.type, a.linked_account_id
		ORDER BY a.name ASC
	`
	rows, err := h.Store.DB.QueryContext(r.Context(), query, userID)
	if err != nil {
		http.Error(w, "Failed to query accounts", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var accounts []AccountResponse
	for rows.Next() {
		var a AccountResponse
		if err := rows.Scan(&a.ID, &a.Name, &a.Type, &a.Balance, &a.LinkedAccountID); err != nil {
			continue
		}
		accounts = append(accounts, a)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(accounts)
}

type TransactionResponse struct {
	ID          string    `json:"id"`
	Date        time.Time `json:"date"`
	Description string    `json:"description"`
	Amount      float64   `json:"amount"` // Derived from asset account
}

func (h *FinanceHandler) GetTransactions(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Dynamically compute amounts based on entries touching asset accounts
	query := `
		SELECT t.id, t.date, t.description, COALESCE(SUM(e.amount), 0)
		FROM ext_finance_transactions t
		LEFT JOIN ext_finance_entries e ON t.id = e.transaction_id
		LEFT JOIN ext_finance_accounts a ON e.account_id = a.id AND a.type = 'asset'
		WHERE t.user_id = ? AND a.id IS NOT NULL
		GROUP BY t.id, t.date, t.description
		ORDER BY t.date DESC
		LIMIT 100
	`
	rows, err := h.Store.DB.QueryContext(r.Context(), query, userID)
	if err != nil {
		http.Error(w, "Failed to query transactions", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var transactions []TransactionResponse
	for rows.Next() {
		var t TransactionResponse
		if err := rows.Scan(&t.ID, &t.Date, &t.Description, &t.Amount); err != nil {
			continue
		}
		transactions = append(transactions, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transactions)
}
