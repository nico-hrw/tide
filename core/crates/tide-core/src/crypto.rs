use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use anyhow::{Context, Result};
use base64::prelude::*;
use rsa::pkcs8::DecodePrivateKey;
use rsa::{Oaep, RsaPrivateKey};
use serde::Deserialize;
use sha2::Sha256;

pub const DEFAULT_PBKDF2_ITERATIONS: u32 = 600_000;

#[derive(Debug, Deserialize)]
struct EncryptedVaultJson {
    salt: String,
    iv: String,
    ciphertext: String,
    #[serde(default)]
    iterations: Option<u32>,
}

/// Derives a 256-bit Key Encryption Key (KEK) using PBKDF2 with HMAC-SHA256.
/// Default iterations matching Tide's cryptoV2 is 600,000.
pub fn derive_kek(pin: &str, salt: &[u8], iterations: u32) -> anyhow::Result<[u8; 32]> {
    let mut kek = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(pin.as_bytes(), salt, iterations, &mut kek);
    Ok(kek)
}

/// Decrypts AES-256-GCM ciphertext where the 16-byte authentication tag is appended to the ciphertext.
pub fn decrypt_aes_gcm(
    ciphertext_with_tag: &[u8],
    key: &[u8; 32],
    iv: &[u8; 12],
) -> anyhow::Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(iv);
    cipher
        .decrypt(nonce, ciphertext_with_tag)
        .map_err(|e| anyhow::anyhow!("AES-256-GCM decryption failed: {e}"))
}

/// Encrypts plaintext using AES-256-GCM and appends the 16-byte authentication tag.
pub fn encrypt_aes_gcm(
    plaintext: &[u8],
    key: &[u8; 32],
    iv: &[u8; 12],
) -> anyhow::Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(iv);
    cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| anyhow::anyhow!("AES-256-GCM encryption failed: {e}"))
}

/// Parses an encrypted vault JSON string containing `{ "salt": "...", "iv": "...", "ciphertext": "..." }`,
/// derives the KEK using PBKDF2 (600,000 iterations default, falling back to 100,000 legacy iterations),
/// using an optional pepper (base64) or the vault's salt, decrypts the AES-256-GCM ciphertext,
/// and recovers the user's RSA private key from PKCS#8 DER (or PEM fallback).
pub fn unlock_vault(
    pin: &str,
    pepper_base64: Option<&str>,
    encrypted_vault_json: &str,
) -> Result<RsaPrivateKey> {
    let payload: EncryptedVaultJson = serde_json::from_str(encrypted_vault_json)
        .context("Failed to parse encrypted_vault JSON")?;

    let salt = if let Some(pepper) = pepper_base64 {
        if !pepper.trim().is_empty() {
            BASE64_STANDARD
                .decode(pepper.trim())
                .context("Failed to decode pepper base64")?
        } else {
            BASE64_STANDARD
                .decode(payload.salt.trim())
                .context("Failed to decode salt base64")?
        }
    } else {
        BASE64_STANDARD
            .decode(payload.salt.trim())
            .context("Failed to decode salt base64")?
    };

    let iv_vec = BASE64_STANDARD
        .decode(payload.iv.trim())
        .context("Failed to decode iv base64")?;
    if iv_vec.len() != 12 {
        anyhow::bail!("Invalid IV length: expected 12 bytes, got {}", iv_vec.len());
    }
    let mut iv = [0u8; 12];
    iv.copy_from_slice(&iv_vec);

    let ciphertext = BASE64_STANDARD
        .decode(payload.ciphertext.trim())
        .context("Failed to decode ciphertext base64")?;

    // Try 600,000 iterations first, then fallback to 100,000 legacy iterations
    let decrypted = match derive_kek(pin, &salt, 600_000) {
        Ok(kek) => match decrypt_aes_gcm(&ciphertext, &kek, &iv) {
            Ok(bytes) => bytes,
            Err(_) => {
                let kek_legacy = derive_kek(pin, &salt, 100_000)?;
                decrypt_aes_gcm(&ciphertext, &kek_legacy, &iv)?
            }
        },
        Err(_) => {
            let kek_legacy = derive_kek(pin, &salt, 100_000)?;
            decrypt_aes_gcm(&ciphertext, &kek_legacy, &iv)?
        }
    };

    if let Ok(key) = RsaPrivateKey::from_pkcs8_der(&decrypted) {
        return Ok(key);
    }

    if let Ok(key_pem) = std::str::from_utf8(&decrypted) {
        if let Ok(key) = RsaPrivateKey::from_pkcs8_pem(key_pem) {
            return Ok(key);
        }
    }

    anyhow::bail!("Failed to parse decrypted private key as PKCS#8 DER or PEM")
}

/// Decrypts a wrapped 256-bit Document Encryption Key (DEK) using RSA-OAEP with SHA-256.
pub fn unwrap_dek(
    wrapped_dek_bytes: &[u8],
    private_key: &RsaPrivateKey,
) -> anyhow::Result<[u8; 32]> {
    let padding = rsa::Oaep::new::<sha2::Sha256>();
    let decrypted = private_key
        .decrypt(padding, wrapped_dek_bytes)
        .map_err(|e| anyhow::anyhow!("Failed to unwrap DEK with RSA-OAEP: {e}"))?;

    let dek: [u8; 32] = decrypted
        .try_into()
        .map_err(|v: Vec<u8>| {
            anyhow::anyhow!("Invalid unwrapped DEK length: expected 32 bytes, got {}", v.len())
        })?;

    Ok(dek)
}

/// Decrypts ciphertext using RSA-OAEP with SHA-256 padding.
pub fn decrypt_rsa_oaep(ciphertext: &[u8], private_key: &RsaPrivateKey) -> Result<Vec<u8>> {
    let padding = Oaep::new::<Sha256>();
    private_key
        .decrypt(padding, ciphertext)
        .map_err(|e| anyhow::anyhow!("RSA-OAEP decryption failed: {}", e))
}

/// Decrypts note content using AES-256-GCM and converts it to a UTF-8 Markdown string.
pub fn decrypt_note_content(
    ciphertext: &[u8],
    iv: &[u8; 12],
    dek: &[u8; 32],
) -> anyhow::Result<String> {
    let decrypted_bytes = decrypt_aes_gcm(ciphertext, dek, iv)?;
    let markdown = String::from_utf8(decrypted_bytes)
        .map_err(|e| anyhow::anyhow!("Decrypted note content is not valid UTF-8: {e}"))?;
    Ok(markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_kek() {
        let pin = "123456";
        let salt = b"tide_test_salt_1234";
        let kek = derive_kek(pin, salt, 1000).expect("derive KEK");
        assert_eq!(kek.len(), 32);

        // Verification of deterministic output
        let kek_repeat = derive_kek(pin, salt, 1000).expect("derive KEK repeat");
        assert_eq!(kek, kek_repeat);
    }

    #[test]
    fn test_aes_gcm_encrypt_decrypt_roundtrip() {
        let key = [0x42u8; 32];
        let iv = [0x07u8; 12];
        let plaintext = b"# Tide Note\n\nThis is a zero-knowledge encrypted note.";

        let ciphertext = encrypt_aes_gcm(plaintext, &key, &iv).expect("AES-GCM encryption");
        assert_ne!(&ciphertext[..], plaintext);
        assert_eq!(ciphertext.len(), plaintext.len() + 16); // 16-byte auth tag appended

        let decrypted = decrypt_aes_gcm(&ciphertext, &key, &iv).expect("AES-GCM decryption");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_aes_gcm_corrupted_tag_fails() {
        let key = [0x11u8; 32];
        let iv = [0x22u8; 12];
        let plaintext = b"Confidential content";

        let mut ciphertext = encrypt_aes_gcm(plaintext, &key, &iv).expect("AES-GCM encryption");
        let last = ciphertext.len() - 1;
        ciphertext[last] ^= 0xFF; // Tamper with tag

        assert!(decrypt_aes_gcm(&ciphertext, &key, &iv).is_err());
    }

    #[test]
    fn test_decrypt_note_content() {
        let dek = [0x55u8; 32];
        let iv = [0x33u8; 12];
        let note_markdown = "# Markdown Title\n\n- Task 1\n- Task 2\n";

        let ciphertext = encrypt_aes_gcm(note_markdown.as_bytes(), &dek, &iv).expect("encrypt");
        let decrypted = decrypt_note_content(&ciphertext, &iv, &dek).expect("decrypt note content");
        assert_eq!(decrypted, note_markdown);
    }

    #[test]
    fn test_unlock_vault_invalid_payloads() {
        // Missing fields
        assert!(unlock_vault("123456", None, "{\"invalid\": \"json\"}").is_err());
        // Invalid base64
        assert!(unlock_vault("123456", None, "{\"salt\": \"???\", \"iv\": \"abc\", \"ciphertext\": \"def\"}").is_err());
        // Invalid IV length
        let salt = BASE64_STANDARD.encode([1u8; 16]);
        let bad_iv = BASE64_STANDARD.encode([1u8; 8]); // 8 bytes instead of 12
        let ct = BASE64_STANDARD.encode([1u8; 32]);
        let json = format!(r#"{{"salt":"{salt}","iv":"{bad_iv}","ciphertext":"{ct}"}}"#);
        assert!(unlock_vault("123456", None, &json).is_err());
    }
}
