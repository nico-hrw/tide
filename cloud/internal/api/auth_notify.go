package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// Security notices after vault changes. They never contain secrets or vault data.
// The server only knows the address from the verify-otp call of the same session (kept in memory for
// sessionEmailTTL); without it the notice is skipped and the app shows vault_replaced_at at the next
// sign-in instead (see VerifyOTP).

const (
	noticeVaultReplaced = "vault-replaced"
	noticeRecoverySetup = "recovery-set"
)

func securityNoticeText(kind string, at time.Time) (subject, body string) {
	when := at.Format("02.01.2006 15:04 MST")
	switch kind {
	case noticeVaultReplaced:
		return "Tide: Dein Tresor-PIN wurde neu gesetzt",
			fmt.Sprintf("Am %s wurde der Tresor deines Tide-Kontos mit einem Wiederherstellungsschlüssel geöffnet und mit einem neuen PIN gesichert.\n\nWarst du das nicht, melde dich sofort an, richte in den Einstellungen einen neuen Wiederherstellungsschlüssel ein und schreib uns. Die vorige Fassung des Tresors ist noch 24 Stunden lang vor weiteren Änderungen geschützt.", when)
	default:
		return "Tide: Dein Wiederherstellungsschlüssel wurde geändert",
			fmt.Sprintf("Am %s wurde für dein Tide-Konto ein neuer Wiederherstellungsschlüssel eingerichtet. Der vorige Schlüssel gilt ab jetzt nicht mehr.\n\nWarst du das nicht, melde dich sofort an, richte einen neuen Wiederherstellungsschlüssel ein und schreib uns.", when)
	}
}

// notifyVaultChange sends (or in dev logs) a notice to the session's address. Failures only log.
func (h *AuthHandler) notifyVaultChange(userID, kind string) {
	email := h.sessionEmailFor(userID)
	if email == "" {
		log.Printf("Security notice %s for user %s skipped: no address known for this session", kind, userID)
		return
	}
	subject, body := securityNoticeText(kind, time.Now())
	isProduction := strings.EqualFold(os.Getenv("ENV"), "production")
	if os.Getenv("RESEND_API_KEY") == "" {
		if isProduction {
			log.Printf("ERROR: security notice %s for user %s not sent: RESEND_API_KEY missing", kind, userID)
		} else {
			log.Printf("[DEV] Security notice for %s: %s", email, subject)
		}
		return
	}
	go func() {
		if err := sendNoticeEmail(email, subject, body); err != nil {
			log.Printf("ERROR sending security notice %s for user %s: %v", kind, userID, err)
		}
	}()
}

func sendNoticeEmail(email, subject, body string) error {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("RESEND_API_KEY not set")
	}
	htmlBody := `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.6">` +
		strings.ReplaceAll(html.EscapeString(body), "\n", "<br>") + `</div>`
	payload, _ := json.Marshal(map[string]interface{}{
		"from":    "Support <no-reply@go-tide.app>",
		"to":      []string{email},
		"subject": subject,
		"text":    body,
		"html":    htmlBody,
	})
	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewBuffer(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend API error (%d): %s", resp.StatusCode, string(b))
	}
	return nil
}
