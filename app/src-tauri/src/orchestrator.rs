//! Dialog orchestrator: builds context, calls the LLM, routes tool calls,
//! and streams the reply back to the UI.
//!
//! Sprint 1 scaffold — emits a canned, streamed reply so the chat/voice
//! loop is wired end-to-end (frontend ↔ core via events). Sprint 2 swaps
//! the body for the real OpenAI streaming call in `openai::chat`.

use tauri::{AppHandle, Emitter};

pub fn handle_turn(app: AppHandle, text: String, _mode: String) {
    std::thread::spawn(move || {
        let reply = format!(
            "Core online. You said: \"{}\". Live OpenAI streaming arrives in Sprint 2.",
            text
        );

        // Stream token-by-token, the same shape the real pipeline will use.
        for chunk in reply.split_inclusive(' ') {
            let _ = app.emit("chat_token", chunk);
            std::thread::sleep(std::time::Duration::from_millis(26));
        }
        let _ = app.emit("chat_done", ());
    });
}
