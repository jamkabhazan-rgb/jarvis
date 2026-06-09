//! J.A.R.V.I.S. core library — shared by desktop and mobile entry points.
//!
//! The Rust core owns the OpenAI key and every OpenAI HTTP request; the
//! WebView only talks to it through `invoke()` and receives streamed
//! chunks via Tauri events. See the build spec §03/§13/§14.
#![allow(dead_code)] // scaffold: some items are filled in over later sprints

use tauri::AppHandle;

mod openai;
mod orchestrator;
mod tools;

/// Liveness check the frontend can use to confirm the core is reachable.
#[tauri::command]
fn ping() -> String {
    "pong".into()
}

/// Kick off a dialog turn. The reply is streamed back via the
/// `chat_token` / `chat_done` events (see bridge.js).
#[tauri::command]
async fn chat_send(app: AppHandle, text: String, mode: String) -> Result<(), String> {
    orchestrator::handle_turn(app, text, mode).await;
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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ping,
            chat_send,
            set_api_key,
            has_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running J.A.R.V.I.S.");
}
