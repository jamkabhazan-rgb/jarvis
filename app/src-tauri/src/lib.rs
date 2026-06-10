//! J.A.R.V.I.S. core library — shared by desktop and mobile entry points.
//!
//! The Rust core owns the OpenAI key and every OpenAI HTTP request; the
//! WebView only talks to it through `invoke()` and receives streamed
//! chunks via Tauri events. See the build spec §03/§13/§14.
#![allow(dead_code)] // scaffold: some items are filled in over later sprints

use base64::Engine;
use tauri::AppHandle;

mod openai;
mod orchestrator;
mod system;
mod tools;

/// Liveness check the frontend can use to confirm the core is reachable.
#[tauri::command]
fn ping() -> String {
    "pong".into()
}

/// Kick off a dialog turn. The reply is streamed back via the
/// `chat_token` / `chat_done` events (see bridge.js).
#[tauri::command]
async fn chat_send(
    app: AppHandle,
    text: String,
    mode: String,
    state: Option<serde_json::Value>,
    persona: Option<serde_json::Value>,
) -> Result<(), String> {
    orchestrator::handle_turn(
        app,
        text,
        mode,
        state.unwrap_or(serde_json::Value::Null),
        persona.unwrap_or(serde_json::Value::Null),
    )
    .await;
    Ok(())
}

/// Run a sub-agent turn. Streams on the `agent_*` event channel with tools
/// restricted to the agent's capabilities.
#[tauri::command]
async fn agent_send(
    app: AppHandle,
    text: String,
    caps: Vec<String>,
    state: Option<serde_json::Value>,
    persona: Option<serde_json::Value>,
) -> Result<(), String> {
    orchestrator::handle_agent_turn(
        app,
        text,
        state.unwrap_or(serde_json::Value::Null),
        persona.unwrap_or(serde_json::Value::Null),
        caps,
    )
    .await;
    Ok(())
}

/// Store the OpenAI key in the OS keychain (entered in Settings). Passing an
/// empty string clears it. The key is never returned to the WebView.
#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    openai::store_key(&key)
}

/// Whether a usable key is available (keychain or env) — without revealing it.
#[tauri::command]
fn has_api_key() -> bool {
    openai::resolve_key().is_some()
}

/// Transcribe a recorded utterance (base64 audio + its MIME type) -> text.
#[tauri::command]
async fn transcribe(audio_b64: String, mime: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_b64.as_bytes())
        .map_err(|e| e.to_string())?;
    openai::stt::transcribe(bytes, &mime).await
}

/// Synthesize speech for `text` -> base64 mp3 the frontend plays.
#[tauri::command]
async fn speak(text: String) -> Result<String, String> {
    let bytes = openai::tts::speak(&text, "alloy").await?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Computer control master switch (spec §17). Synced from the Settings
/// toggle; flipping it off is the kill-switch — execution stops at once.
#[tauri::command]
fn system_set_enabled(on: bool) {
    system::set_enabled(on);
}

#[tauri::command]
fn system_enabled() -> bool {
    system::enabled()
}

/// Execute a shell command the user just approved on a confirmation card.
/// Refuses unless computer control is enabled. The model itself can never
/// reach this — it only proposes commands via the `computer_run` tool.
#[tauri::command]
async fn system_execute(command: String) -> Result<serde_json::Value, String> {
    system::execute(command).await
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ping,
            chat_send,
            agent_send,
            set_api_key,
            has_api_key,
            transcribe,
            speak,
            system_set_enabled,
            system_enabled,
            system_execute
        ])
        .run(tauri::generate_context!())
        .expect("error while running J.A.R.V.I.S.");
}
