//! Dialog orchestrator: builds context, calls the LLM, and streams the
//! reply back to the UI via events. Tool routing layers on in Sprint 4.

use serde_json::json;
use tauri::{AppHandle, Emitter};

const SYSTEM_PROMPT: &str = "You are J.A.R.V.I.S., a calm, dry-witted personal assistant. \
Be concise and proactive — prefer doing over asking. Keep everything local and private; \
never claim to have done something you cannot actually do. When unsure, say so briefly.";

pub async fn handle_turn(app: AppHandle, text: String, _mode: String) {
    let messages = json!([
        { "role": "system", "content": SYSTEM_PROMPT },
        { "role": "user",   "content": text }
    ]);

    match crate::openai::chat::stream_chat(&app, messages).await {
        Ok(()) => {}
        Err(e) => {
            // Surface errors in chat — never swallow them (spec §01/§09).
            let _ = app.emit("chat_token", format!("⚠ {}", e));
        }
    }
    let _ = app.emit("chat_done", ());
}
