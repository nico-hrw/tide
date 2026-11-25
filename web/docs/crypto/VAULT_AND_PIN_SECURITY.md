# Tide Account Vault, PIN & Recovery

> **Status:** describes the code as it is (2026-11). Earlier versions of this file described BIP-39
> phrases, passkey/PRF unlock, a progressive client lockout and an inactivity auto-lock. **None of
> that exists in the code**; see §7.
>
> **Code:** `web/src/lib/crypto.ts` (key pair, PBKDF2, vault wrap/unwrap), `web/src/lib/keyStorage.ts`
> (non-extractable key in IndexedDB), `web/src/lib/recovery/` (recovery secret, envelopes, key proof),
> `web/src/app/auth/page.tsx` + `web/src/components/Auth/` (sign-up, unlock, "PIN vergessen?"),
> `web/src/components/Settings/account/RecoverySection.tsx`, `cloud/internal/api/auth*.go`,
> `cloud/internal/store/sqlite_recovery.go`.

---

## 1. What the vault is

There is no symmetric master key. A user's identity is one **RSA-OAEP 4096 / SHA-256 key pair**
(`generateMasterKeys`). The public key is stored on the server as SPKI (base64). The private key
never leaves the client unencrypted; the server stores it in two client-encrypted wrappings:

| Column (`users`) | Content | Opened with |
| :--- | :--- | :--- |
| `encrypted_vault` | `{salt, iv, ciphertext}`: PKCS#8 private key, AES-256-GCM | KEK = PBKDF2-SHA-256(PIN, salt = account pepper, 600 000 it.) |
| `recovery_vault` (nullable) | `{v:1, envelopes:[…]}` (see §3) | the recovery secret |
| `encrypted_vault_prev` (nullable) | previous `encrypted_vault`, kept by `replace-vault` | old PIN |
| `recovery_vault_prev` (nullable) | previous `recovery_vault` | old recovery secret |
| `vault_replaced_at` (nullable, unix s) | time of the last `replace-vault` | |

The **pepper** (32 random bytes, made by the client at sign-up) is the PBKDF2 salt of the PIN
wrapping. The server stores it AES-GCM-encrypted with `SERVER_MASTER_KEY` and returns it in
`verify-otp`. `unlockVault` falls back to 100 000 iterations for legacy vaults.

The server never receives the vault PIN or the recovery secret. (`users.pin_hash` is a separate,
optional server-side Argon2id hash used by `/verify-pin` and the PIN-guarded email change; the web
client does not send a PIN at sign-up, so new accounts have none. The recovery paths never use it.)

## 2. Sign-in and unlock

1. `POST /auth/request-otp` → mail code (dev: `[DEV] OTP for …` in the server log).
2. `POST /auth/verify-otp` → JWT (`sub`, `iat`, `exp` 30 days; also as `tide_session` cookie),
   pepper, `encrypted_vault`, `public_key`, and `vault_replaced_at` if the vault was ever replaced.
   It **never** returns `recovery_vault`.
3. The client runs `unlockVault(pin, pepper, vault)` and keeps the private key as a
   **non-extractable** `CryptoKey` in IndexedDB (`storeMasterKey`).

A wrong PIN is an AES-GCM tag failure on the device. There is no server-side PIN check and no
server-side attempt counter for the vault PIN: whoever has the `encrypted_vault` and pepper (the
server operator, or anyone who completes the mail-code step) can try all 100 000 five-digit PINs
offline. The PIN protects against a stolen session or device, not against the operator.

## 3. Recovery key ("Wiederherstellungsschlüssel")

**Secret:** 160 bits from `crypto.getRandomValues`, written as 32 Crockford-Base32 characters in
groups of four (`XXXX-XXXX-…`). Input is normalised: case, spaces and dashes are ignored, `O`→`0`,
`I`/`L`→`1` (`recoverySecret.ts`).

**Envelope list** (`recoveryVault.ts`):

```json
{ "v": 1,
  "envelopes": [
    { "kind": "mail-secret", "salt": "…", "iv": "…", "ciphertext": "…",
      "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 200000 } } ] }
```

The private key (PKCS#8) is AES-256-GCM-encrypted with PBKDF2-SHA-256(secret, 16-byte random salt,
200 000 it.), using the existing `deriveKeyFromPassword`/`encryptPrivateKey`. Argon2 is not available
in WebCrypto; with 160 bits of entropy the iteration count is a margin, not the barrier (≈2^17.6
extra work). It deliberately differs from 600 000/100 000 so `decryptPrivateKey` never runs its
legacy fallback. `envelopes` is a list so another kind (planned: `passkey-prf`) can sit next to the
mail secret; rebuilding the mail envelope keeps unknown kinds. The server validates only
`v == 1`, 1–8 envelopes, `kind` (`[a-z0-9-]`, ≤ 32) and base64 `iv`/`ciphertext`; size ≤ 32 KiB.

**Handing it to the user:** shown once after sign-up (`RecoveryKeyStep`) or after setting it up in
the settings, with "An mich selbst mailen" (a `mailto:` draft to the own address that the user's mail
program sends; Tide sends nothing), "Kopieren" and "Herunterladen" (`.txt`). The secret lives only in
React state while shown; it is not written to localStorage, IndexedDB or logs. Continuing after
sign-up needs a confirmation checkbox; skipping shows "Ohne Schlüssel sind deine Daten bei
vergessenem PIN unwiederbringlich verloren." The step only appears when the server answers
`recovery_saved: true`.

## 4. Server endpoints and their guards

| Endpoint | Guard | Effect |
| :--- | :--- | :--- |
| `POST /auth/register` | IP rate limit | optional `recovery_vault` (validated before the user is created); answers `recovery_saved` |
| `GET /auth/recovery-vault` | session | own `{has_recovery, recovery_vault}`; `?status=1` returns only `has_recovery`; `Cache-Control: no-store` |
| `POST /auth/key-challenge` | session, IP rate limit | 32 random bytes RSA-OAEP-SHA-256-encrypted to the stored public key; server keeps only SHA-256 of them, bound to user, 2 min, one-time (in memory) |
| `PUT /auth/recovery-vault` | **fresh session + key proof**, IP rate limit | stores a new recovery vault, old one → `recovery_vault_prev` |
| `POST /auth/replace-vault` | **fresh session + key proof**, IP rate limit, **24 h cooldown** | old `encrypted_vault` → `encrypted_vault_prev`, new one stored, `vault_replaced_at` set (one UPDATE) |

- **Fresh session:** the JWT `iat` is at most 10 minutes old (1 min clock skew). Tokens without `iat`
  (issued before this change) are never fresh. In practice: sign in with a mail code, then act.
- **Key proof:** the request carries `challenge_id` + `challenge_response` (decrypted plaintext,
  base64). The server compares hashes in constant time and consumes the challenge on any answer. So
  changing either vault needs the **private key itself** (opened via the recovery secret or the PIN)
  **plus** a fresh mail-code sign-in. Neither a stolen session nor a mailbox alone is enough.
- **Cooldown:** a second `replace-vault` within 24 h is refused with 429, so the kept previous
  generation is never silently overwritten. `PUT recovery-vault` has no cooldown; it keeps exactly one
  previous recovery vault.
- **Notice:** after a successful replace or recovery set-up the server mails a notice without secrets
  ("Warst du das nicht, …") to the address from the session's `verify-otp` (kept in memory for
  15 min; the database only has the blind index). Without a known address the mail is skipped and
  logged. In dev without `RESEND_API_KEY` a `[DEV] Security notice for …` line is logged. As a
  fallback the unlock step shows "Dein Tresor-PIN wurde am … neu gesetzt" for 30 days
  (`vault_replaced_at` from `verify-otp`).

## 5. Flows

**Sign-up:** generate key pair, pepper, PIN vault (as before) → generate secret → `buildRecoveryVault`
from the still-extractable private key → `register` with `recovery_vault` → key step.

**"PIN vergessen?"** (unlock step, after the mail code): `GET recovery-vault` → enter secret + new PIN
twice → open the envelope (extractable key) → wrap with the new PIN and the existing pepper
(`wrapPrivateKeyWithPin`, same parameters as sign-up) → **verify locally with `unlockVault`** →
key challenge answered with the opened key → `replace-vault` → normal unlock. Wrong secret: AES-GCM
fails on the device, nothing is sent. Stale session: message plus "Neu mit Mail-Code anmelden".
Accounts without a recovery vault get an explanation that no recovery is possible and that only an
empty restart of the account would remain (that reset is **not built**).

**Existing accounts** (Settings → Konto → Wiederherstellungsschlüssel): status via `?status=1` →
mail code in the section (fresh session; a wrong code does not sign out, `apiFetch` option
`keepSessionOn401`) → PIN → `unlockVault(…, extractable=true)` → new secret → envelope (other kinds
kept) → key proof → `PUT recovery-vault` → secret shown once. A new secret replaces the old one.

The RSA key pair never changes, so all `access_keys`/DEKs and shares stay valid after a recovery.

## 6. Limits and residual risks

- **Without the secret there is no rescue.** Forgotten PIN + no (or lost) recovery key = the data
  cannot be decrypted, by anyone.
- **Secret + fresh session = full control.** Whoever has the recovery secret and can complete a mail
  code sign-in can set a new PIN. The secret is usually stored in the same mailbox that receives the
  codes, so a compromised mailbox that still contains the recovery mail is enough. The notice mail
  and the in-app hint make this visible; they do not prevent it.
- **Operator view:** the operator sees `encrypted_vault`, pepper and `recovery_vault`. The PIN wrapping
  is brute-forceable offline (5 digits); the recovery wrapping is not (160 bits). The recovery key
  adds no operator access, but it does not fix the weak-PIN property either.
- **Vandalism with key possession:** someone holding the private key can replace the vault (e.g. with
  an unknown PIN). The 24 h cooldown and `encrypted_vault_prev` allow a manual rollback by an
  operator; there is no rollback endpoint.
- **Notice delivery:** only to the address of the same session's `verify-otp`, in memory for 15 min,
  lost on server restart. Delivery failures are logged, not retried.
- **In-memory state:** key challenges and session addresses live in process memory; a restart
  drops them (users just request a new challenge). Several server instances would need shared state.
- The legacy `users` table recreation path in `sqlite.go` does not add the new columns; they are added
  by the regular `ALTER TABLE` list on the next start.

## 7. Not implemented (despite earlier documentation)

- Passkey / WebAuthn PRF unlock (only the envelope list is prepared for a `passkey-prf` kind).
- BIP-39 mnemonic phrases.
- Progressive client-side lockout for the vault PIN, inactivity auto-lock of the vault.
- Account reset ("Konto leer neu starten"): only explained in the UI text.
- An operator emergency key: deliberately not built.

`web/src/components/Security/PinPromptModal.tsx`, `SecuritySettingsModal.tsx` and
`web/src/lib/pinSecurity.ts` concern **item-level** PINs for single notes/folders, not the account
vault described here.
