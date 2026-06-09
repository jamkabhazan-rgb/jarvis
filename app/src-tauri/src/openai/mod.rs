//! OpenAI client — OWNS THE KEY.
//!
//! All four OpenAI surfaces (STT, chat+tools, TTS, embeddings) are called
//! from here and only here. The key is never bundled, logged, or sent to
//! the WebView. See build spec §13/§14.

pub mod chat;
pub mod embed;
pub mod stt;
pub mod tts;

/// Key resolution order (Rust core only):
///   1. OS keychain  ("jarvis/openai_api_key")  — primary, set via Settings
///   2. env OPENAI_API_KEY                        — dev fallback
///
/// NEVER: bundled in `src/`, logged, or returned to the WebView.
pub fn resolve_key() -> Option<String> {
    // Sprint 2: try the OS keychain first (keyring crate), then env.
    std::env::var("OPENAI_API_KEY").ok()
}

// Models pinned by the spec (§14) — cheapest that meet quality.
pub const MODEL_CHAT: &str = "gpt-4o-mini";
pub const MODEL_STT: &str = "gpt-4o-mini-transcribe";
pub const MODEL_TTS: &str = "gpt-4o-mini-tts";
pub const MODEL_EMBED: &str = "text-embedding-3-small";
