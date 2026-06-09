//! OpenAI client — OWNS THE KEY.
//!
//! All four OpenAI surfaces (STT, chat+tools, TTS, embeddings) are called
//! from here and only here. The key is never bundled, logged, or sent to
//! the WebView. See build spec §13/§14.

pub mod chat;
pub mod embed;
pub mod stt;
pub mod tts;

const KEYCHAIN_SERVICE: &str = "jarvis";
const KEYCHAIN_USER: &str = "openai_api_key";

/// Key resolution order (Rust core only):
///   1. OS keychain  ("jarvis/openai_api_key")  — primary, set via Settings
///   2. env OPENAI_API_KEY                        — dev fallback
///
/// NEVER: bundled in `src/`, logged, or returned to the WebView.
pub fn resolve_key() -> Option<String> {
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER) {
        if let Ok(pw) = entry.get_password() {
            if !pw.trim().is_empty() {
                return Some(pw);
            }
        }
    }
    std::env::var("OPENAI_API_KEY").ok().filter(|k| !k.trim().is_empty())
}

/// Persist the key to the OS keychain (called from Settings).
pub fn store_key(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())?;
    if key.trim().is_empty() {
        // empty input clears the stored key
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(key.trim()).map_err(|e| e.to_string())
}

// Models pinned by the spec (§14) — cheapest that meet quality.
pub const MODEL_CHAT: &str = "gpt-4o-mini";
pub const MODEL_STT: &str = "gpt-4o-mini-transcribe";
pub const MODEL_TTS: &str = "gpt-4o-mini-tts";
pub const MODEL_EMBED: &str = "text-embedding-3-small";
