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
mod store;
mod system;
mod tools;

/// Liveness check the frontend can use to confirm the core is reachable.
#[tauri::command]
fn ping() -> String {
    "pong".into()
}

/// Durable store (SQLite, spec §12). The WebView hydrates its cache from
/// `store_get_all` at boot, then write-throughs every change via
/// `store_set` / `store_del`. Values are opaque JSON owned by the frontend.
#[tauri::command]
fn store_get_all() -> Result<serde_json::Value, String> {
    store::get_all().map(serde_json::Value::Object)
}

#[tauri::command]
fn store_set(key: String, value: serde_json::Value) -> Result<(), String> {
    store::set(&key, &value)
}

#[tauri::command]
fn store_del(key: String) -> Result<(), String> {
    store::del(&key)
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
    history: Option<serde_json::Value>,
) -> Result<(), String> {
    orchestrator::handle_turn(
        app,
        text,
        mode,
        state.unwrap_or(serde_json::Value::Null),
        persona.unwrap_or(serde_json::Value::Null),
        history.unwrap_or(serde_json::Value::Null),
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
    history: Option<serde_json::Value>,
) -> Result<(), String> {
    orchestrator::handle_agent_turn(
        app,
        text,
        state.unwrap_or(serde_json::Value::Null),
        persona.unwrap_or(serde_json::Value::Null),
        caps,
        history.unwrap_or(serde_json::Value::Null),
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

/// Check GitHub Releases for a newer version. Returns the new version string
/// (e.g. "0.3.0") or null if already up to date.
#[tauri::command]
async fn check_for_update(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => Ok(Some(update.version)),
        None => Ok(None),
    }
}

/// Download + install the pending update (signature-verified against the
/// embedded public key), then relaunch. Called after the user accepts.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update
            .download_and_install(|_chunk, _total| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

pub fn run() {
    use tauri::Manager;
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Open the durable SQLite store under the app data dir. A failure
            // here is non-fatal: the frontend falls back to its in-memory cache.
            match app.path().app_data_dir() {
                Ok(dir) => {
                    let _ = std::fs::create_dir_all(&dir);
                    if let Err(e) = store::init(dir.join("jarvis.db")) {
                        eprintln!("[store] init failed: {e}");
                    }
                }
                Err(e) => eprintln!("[store] no app data dir: {e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            store_get_all,
            store_set,
            store_del,
            chat_send,
            agent_send,
            set_api_key,
            has_api_key,
            transcribe,
            speak,
            system_set_enabled,
            system_enabled,
            system_execute,
            check_for_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running J.A.R.V.I.S.");
}
