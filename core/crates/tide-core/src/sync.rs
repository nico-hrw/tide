use std::path::PathBuf;
use anyhow::{Context, Result};
use base64::prelude::*;
use rsa::RsaPrivateKey;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::crypto::{decrypt_aes_gcm, unwrap_dek};
use crate::db::{Database, LocalNote, LocalTodo};

pub const DEFAULT_BASE_URL: &str = "https://hrw.rocks/api/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub token: String,
    pub user_id: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub encrypted_vault: Option<String>,
    #[serde(default)]
    pub pepper: Option<String>,
}

/// Returns the path to `~/.tide/session.json`.
pub fn session_file_path() -> Result<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .context("Could not determine home directory (neither USERPROFILE nor HOME set)")?;
    Ok(PathBuf::from(home).join(".tide").join("session.json"))
}

/// Saves the current session to `~/.tide/session.json`.
pub fn save_session(session: &SessionInfo) -> Result<()> {
    let path = session_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create directory {:?}", parent))?;
    }
    let data = serde_json::to_string_pretty(session)
        .context("Failed to serialize session info")?;
    std::fs::write(&path, data)
        .with_context(|| format!("Failed to write session to {:?}", path))?;
    Ok(())
}

/// Loads a stored session from `~/.tide/session.json`, if present.
pub fn load_session() -> Result<Option<SessionInfo>> {
    let path = session_file_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read session file {:?}", path))?;
    let session: SessionInfo = serde_json::from_str(&data)
        .with_context(|| format!("Failed to parse session file {:?}", path))?;
    Ok(Some(session))
}

pub struct TideClient {
    pub base_url: String,
    pub http: reqwest::Client,
    pub token: Option<String>,
    pub user_id: Option<String>,
}

impl Default for TideClient {
    fn default() -> Self {
        Self::new(None)
    }
}

impl TideClient {
    pub fn new(base_url: Option<String>) -> Self {
        let base = base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
        Self {
            base_url: base.trim_end_matches('/').to_string(),
            http: reqwest::Client::new(),
            token: None,
            user_id: None,
        }
    }

    pub fn with_auth(mut self, token: impl Into<String>, user_id: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self.user_id = Some(user_id.into());
        self
    }

    /// Requests an OTP code to be sent to the given email address.
    pub async fn request_otp(&self, email: &str) -> Result<()> {
        let url = format!("{}/auth/request-otp", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&serde_json::json!({
                "email": email
            }))
            .send()
            .await
            .with_context(|| format!("Failed to send request-otp to {url}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Request OTP failed with status {status}: {body}");
        }

        Ok(())
    }

    /// Verifies the OTP code, sets `token` and `user_id`, and returns `(user_id, encrypted_vault_json, pepper)`.
    pub async fn verify_otp(
        &mut self,
        email: &str,
        otp: &str,
    ) -> Result<(String, String, Option<String>)> {
        let url = format!("{}/auth/verify-otp", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&serde_json::json!({
                "email": email,
                "otp": otp
            }))
            .send()
            .await
            .with_context(|| format!("Failed to send verify-otp request to {url}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Verify OTP failed with status {status}: {body}");
        }

        let body: Value = resp
            .json()
            .await
            .context("Failed to parse verify-otp response as JSON")?;

        let token = body
            .get("token")
            .and_then(|v| v.as_str())
            .context("Verify OTP response missing 'token'")?
            .to_string();

        let user_id = body
            .get("user_id")
            .and_then(|v| v.as_str())
            .or_else(|| {
                body.get("user")
                    .and_then(|u| u.get("id"))
                    .and_then(|v| v.as_str())
            })
            .context("Verify OTP response missing user_id or user.id")?
            .to_string();

        let encrypted_vault_val = body
            .get("encrypted_vault")
            .or_else(|| {
                body.get("user")
                    .and_then(|u| u.get("encrypted_vault"))
            })
            .context("Verify OTP response missing 'encrypted_vault'")?;

        let encrypted_vault_json = match encrypted_vault_val {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };

        let pepper = body
            .get("pepper")
            .and_then(|v| v.as_str())
            .or_else(|| {
                body.get("user")
                    .and_then(|u| u.get("pepper"))
                    .and_then(|v| v.as_str())
            })
            .map(|s| s.to_string());

        self.token = Some(token);
        self.user_id = Some(user_id.clone());

        Ok((user_id, encrypted_vault_json, pepper))
    }

    /// Synchronizes notes and todos from the Tide cloud backend to the local database.
    pub async fn sync_notes_and_todos(
        &self,
        private_key: &RsaPrivateKey,
        db: &Database,
    ) -> Result<(usize, usize)> {
        let token = self
            .token
            .as_ref()
            .context("TideClient is unauthenticated: token is missing")?;
        let user_id = self
            .user_id
            .as_ref()
            .context("TideClient is unauthenticated: user_id is missing")?;

        // 1. Sync notes / files
        let files_url = format!("{}/files?recursive=true", self.base_url);
        let files_resp = self
            .http
            .get(&files_url)
            .bearer_auth(token)
            .send()
            .await
            .with_context(|| format!("Failed to fetch files from {files_url}"))?;

        if !files_resp.status().is_success() {
            let status = files_resp.status();
            let body = files_resp.text().await.unwrap_or_default();
            anyhow::bail!("Files fetch failed with status {status}: {body}");
        }

        let files_json: Value = files_resp
            .json()
            .await
            .context("Failed to parse files response JSON")?;

        let files_array = if let Some(arr) = files_json.as_array() {
            arr.clone()
        } else if let Some(arr) = files_json.get("files").and_then(|v| v.as_array()) {
            arr.clone()
        } else if let Some(arr) = files_json.get("items").and_then(|v| v.as_array()) {
            arr.clone()
        } else {
            Vec::new()
        };

        let mut synced_notes_count = 0;
        let now_millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        for item in &files_array {
            let item_type = item
                .get("type")
                .or_else(|| item.get("item_type"))
                .and_then(|v| v.as_str())
                .unwrap_or("file");

            if item_type != "file" && item_type != "note" {
                continue;
            }

            let id = match item.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };

            // Access keys look up for current user
            let wrapped_key_opt = item
                .get("access_keys")
                .and_then(|ak| ak.get(user_id))
                .and_then(|u| u.get("wrapped_key"))
                .and_then(|k| k.as_str())
                .or_else(|| {
                    // Fallback to item.encrypted_dek.wrapped_key
                    item.get("encrypted_dek")
                        .and_then(|d| d.get("wrapped_key"))
                        .and_then(|k| k.as_str())
                });

            let wrapped_key_str = match wrapped_key_opt {
                Some(k) if !k.trim().is_empty() => k.trim(),
                _ => continue,
            };

            // Decode wrapped key and unwrap DEK
            let wrapped_bytes = match BASE64_STANDARD.decode(wrapped_key_str) {
                Ok(b) => b,
                Err(e) => {
                    tracing::warn!("Failed to decode base64 wrapped_key for item {id}: {e}");
                    continue;
                }
            };

            let dek = match unwrap_dek(&wrapped_bytes, private_key) {
                Ok(k) => k,
                Err(e) => {
                    tracing::warn!("Failed to unwrap DEK for item {id}: {e}");
                    continue;
                }
            };

            // Fetch or extract content
            let raw_content_str = item
                .get("content")
                .or_else(|| item.get("content_ciphertext"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let (ciphertext, iv) = if !raw_content_str.is_empty() {
                // Try parsing as JSON { "data": "...", "iv": "..." }
                if let Ok(payload) = serde_json::from_str::<Value>(raw_content_str) {
                    let data_b64 = payload.get("data").and_then(|v| v.as_str());
                    let iv_b64 = payload.get("iv").and_then(|v| v.as_str());

                    if let (Some(d_b64), Some(i_b64)) = (data_b64, iv_b64) {
                        let data = BASE64_STANDARD.decode(d_b64).unwrap_or_default();
                        let iv_vec = BASE64_STANDARD.decode(i_b64).unwrap_or_default();
                        if iv_vec.len() == 12 {
                            let mut iv_arr = [0u8; 12];
                            iv_arr.copy_from_slice(&iv_vec);
                            (data, iv_arr)
                        } else {
                            (Vec::new(), [0u8; 12])
                        }
                    } else {
                        // Attempt raw base64 or download
                        (Vec::new(), [0u8; 12])
                    }
                } else {
                    // Try base64 decoding string directly
                    let bytes = BASE64_STANDARD.decode(raw_content_str).unwrap_or_default();
                    if bytes.len() >= 12 {
                        let mut iv_arr = [0u8; 12];
                        iv_arr.copy_from_slice(&bytes[..12]);
                        (bytes[12..].to_vec(), iv_arr)
                    } else {
                        (Vec::new(), [0u8; 12])
                    }
                }
            } else {
                // Download file content via GET {base_url}/files/{id}/download
                let dl_url = format!("{}/files/{id}/download", self.base_url);
                let dl_resp = self
                    .http
                    .get(&dl_url)
                    .bearer_auth(token)
                    .send()
                    .await;

                match dl_resp {
                    Ok(resp) if resp.status().is_success() => {
                        let bytes = resp.bytes().await.unwrap_or_default().to_vec();
                        // Check if bytes are JSON envelope
                        if let Ok(payload) = serde_json::from_slice::<Value>(&bytes) {
                            let d_b64 = payload.get("data").and_then(|v| v.as_str());
                            let i_b64 = payload.get("iv").and_then(|v| v.as_str());
                            if let (Some(d), Some(i)) = (d_b64, i_b64) {
                                let data = BASE64_STANDARD.decode(d).unwrap_or_default();
                                let iv_vec = BASE64_STANDARD.decode(i).unwrap_or_default();
                                if iv_vec.len() == 12 {
                                    let mut iv_arr = [0u8; 12];
                                    iv_arr.copy_from_slice(&iv_vec);
                                    (data, iv_arr)
                                } else {
                                    (Vec::new(), [0u8; 12])
                                }
                            } else {
                                (Vec::new(), [0u8; 12])
                            }
                        } else if bytes.len() >= 12 {
                            let mut iv_arr = [0u8; 12];
                            iv_arr.copy_from_slice(&bytes[..12]);
                            (bytes[12..].to_vec(), iv_arr)
                        } else {
                            (Vec::new(), [0u8; 12])
                        }
                    }
                    _ => (Vec::new(), [0u8; 12]),
                }
            };

            let markdown_content = if !ciphertext.is_empty() {
                match decrypt_aes_gcm(&ciphertext, &dek, &iv) {
                    Ok(decrypted) => String::from_utf8(decrypted).unwrap_or_default(),
                    Err(e) => {
                        tracing::warn!("Failed to decrypt AES-GCM content for item {id}: {e}");
                        String::new()
                    }
                }
            } else {
                String::new()
            };

            // Extract title from public_meta, metadata, or secured_meta
            let mut title = item
                .get("public_meta")
                .and_then(|m| m.get("title"))
                .and_then(|t| t.as_str())
                .or_else(|| item.get("metadata").and_then(|m| m.get("title")).and_then(|t| t.as_str()))
                .or_else(|| item.get("name").and_then(|n| n.as_str()))
                .or_else(|| item.get("title").and_then(|t| t.as_str()))
                .unwrap_or("Untitled")
                .to_string();

            // If secured_meta is present as JSON object, check for title there
            if let Some(secured) = item.get("secured_meta") {
                if let Some(sec_title) = secured.get("title").and_then(|t| t.as_str()) {
                    title = sec_title.to_string();
                }
            }

            let folder_id = item
                .get("folder_id")
                .or_else(|| item.get("parent_id"))
                .and_then(|f| f.as_str())
                .map(|s| s.to_string());

            let tags = item
                .get("tags")
                .and_then(|t| {
                    if t.is_string() {
                        t.as_str().map(|s| s.to_string())
                    } else if t.is_array() {
                        Some(t.to_string())
                    } else {
                        None
                    }
                });

            let updated_at = item
                .get("updated_at")
                .and_then(|u| {
                    if let Some(i) = u.as_i64() {
                        Some(i)
                    } else if let Some(s) = u.as_str() {
                        // Could be RFC3339 timestamp or millis string
                        s.parse::<i64>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(now_millis);

            let local_note = LocalNote {
                id,
                title,
                folder_id,
                content_markdown: markdown_content,
                is_encrypted: true,
                tags,
                updated_at,
                synced_at: Some(now_millis),
                dirty: false,
            };

            db.upsert_note(&local_note)
                .with_context(|| format!("Failed to upsert note {} into local db", local_note.id))?;
            synced_notes_count += 1;
        }

        // 2. Sync todos
        let todos_url = format!("{}/todos", self.base_url);
        let todos_resp = self
            .http
            .get(&todos_url)
            .bearer_auth(token)
            .send()
            .await
            .with_context(|| format!("Failed to fetch todos from {todos_url}"))?;

        let mut synced_todos_count = 0;
        if todos_resp.status().is_success() {
            let todos_json: Value = todos_resp
                .json()
                .await
                .context("Failed to parse todos response JSON")?;

            let todos_array = if let Some(arr) = todos_json.as_array() {
                arr.clone()
            } else if let Some(arr) = todos_json.get("todos").and_then(|v| v.as_array()) {
                arr.clone()
            } else if let Some(arr) = todos_json.get("items").and_then(|v| v.as_array()) {
                arr.clone()
            } else {
                Vec::new()
            };

            for item in &todos_array {
                let id = match item.get("id").and_then(|v| v.as_str()) {
                    Some(id) => id.to_string(),
                    None => continue,
                };

                let title = item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Todo")
                    .to_string();

                let description = item
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let status = item
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("pending")
                    .to_string();

                let priority = item
                    .get("priority")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let due_date = item.get("due_date").and_then(|v| v.as_i64());
                let scheduled_date = item.get("scheduled_date").and_then(|v| v.as_i64());

                let tags = item.get("tags").map(|t| {
                    if t.is_string() {
                        t.as_str().unwrap().to_string()
                    } else {
                        t.to_string()
                    }
                });

                let is_completed = item
                    .get("is_completed")
                    .and_then(|v| v.as_bool())
                    .unwrap_or_else(|| status == "completed" || status == "done");

                let updated_at = item
                    .get("updated_at")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(now_millis);

                let local_todo = LocalTodo {
                    id,
                    title,
                    description,
                    status,
                    priority,
                    due_date,
                    scheduled_date,
                    tags,
                    is_completed,
                    updated_at,
                    dirty: false,
                };

                db.upsert_todo(&local_todo)
                    .with_context(|| format!("Failed to upsert todo {} into local db", local_todo.id))?;
                synced_todos_count += 1;
            }
        }

        Ok((synced_notes_count, synced_todos_count))
    }
}
