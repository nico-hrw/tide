# TIDE System & Encryption Flow (`cloud/`)

> Cryptographic protocols, zero-knowledge architecture, and realtime synchronization flows.

## 1. Zero-Knowledge Architecture

The Cloud server acts purely as an encrypted storage medium and synchronizer. It has **zero visibility** into file titles, file contents, tags, task contents, or private user messages.

```
┌────────────────────────────────────────────────────────┐
│  Browser / Client (Trusted)                            │
│  - Plaintext document / note / event                   │
│  - Generates AES-256-GCM Data Encryption Key (DEK)     │
│  - Encrypts content → Ciphertext Blob                  │
│  - Encrypts metadata (title, tags) → secured_meta      │
│  - Wraps DEK with User RSA-OAEP Public Key             │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS
                            ▼
┌────────────────────────────────────────────────────────┐
│  Go Cloud Server (Zero-Knowledge)                      │
│  - Stores: id, owner_id, parent_id, size, timestamps   │
│  - Stores: secured_meta (opaque binary)                │
│  - Stores: blob (AES-GCM ciphertext on disk)           │
│  - Stores: access_keys (wrapped DEKs per user)         │
└────────────────────────────────────────────────────────┘
```

## 2. Key Hierarchy & Cryptographic Primitives

| Purpose | Algorithm | Details |
|---------|-----------|---------|
| Content & Metadata | AES-GCM 256-bit | Random DEK generated per document |
| Key Wrapping | RSA-OAEP 4096-bit | Wraps DEKs for document owner and share recipients |
| Vault Protection | AES-GCM + Argon2id / PBKDF2 | Private key protected by user PIN/Passkey KEK |
| User Discovery | HMAC-SHA256 Blind Index | Lookup users by email/phone without storing raw PII |

## 3. Sharing Protocol

1. **Discovery**: User A searches User B via blind index and receives User B's public key.
2. **Key Wrapping**: User A decrypts the document DEK in their browser, wraps the DEK using User B's RSA public key (`access_keys[userB_id] = RSA_Encrypt(DEK)`).
3. **Store**: User A sends the wrapped key and permissions to `POST /api/v1/files/{id}/share`.
4. **Access**: User B fetches the document, unwraps `access_keys[userB_id]` using their private key, and decrypts the document seamlessly.

## 4. Realtime Synchronization
- **SSE (`/api/v1/events`)**: Lightweight long-lived stream delivering notification events (`file_updated`, `file_shared`, `message_received`) allowing clients to trigger selective store re-validation.
- **WebSocket (`/api/v1/files/{id}/ws`)**: Dedicated bi-directional connection for low-latency multi-client collaboration on canvas and editor documents.
