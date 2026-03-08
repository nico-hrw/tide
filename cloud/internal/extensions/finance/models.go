package finance

import "time"

type AccountType string

const (
	Asset   AccountType = "asset"
	Expense AccountType = "expense"
	Income  AccountType = "income"
	Equity  AccountType = "equity"
)

type Account struct {
	ID        string      `json:"id" db:"id"`
	UserID    string      `json:"user_id" db:"user_id"`
	Name      string      `json:"name" db:"name"`
	Type      AccountType `json:"type" db:"type"`
	CreatedAt time.Time   `json:"created_at" db:"created_at"`
}

type Transaction struct {
	ID          string    `json:"id" db:"id"`
	UserID      string    `json:"user_id" db:"user_id"`
	Date        time.Time `json:"date" db:"date"`
	Description string    `json:"description" db:"description"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type Entry struct {
	ID            string  `json:"id" db:"id"`
	TransactionID string  `json:"transaction_id" db:"transaction_id"`
	AccountID     string  `json:"account_id" db:"account_id"`
	Amount        float64 `json:"amount" db:"amount"`
}
