//! Dialog orchestrator: builds context, lets the LLM call tools, runs them,
//! and streams the final reply back to the UI via events.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const SYSTEM_PROMPT: &str = "You are J.A.R.V.I.S., a calm, dry-witted personal assistant. \
Be concise and proactive — prefer doing over asking. You can manage the user's tasks, notes, \
expenses and research via tools; call them when appropriate, then confirm in one short line. \
Keep everything local and private; never claim to have done something you cannot actually do.";

pub async fn handle_turn(app: AppHandle, text: String, _mode: String, state: Value) {
    if let Err(e) = run(&app, text, &state).await {
        let _ = app.emit("chat_token", format!("⚠ {}", e));
    }
    let _ = app.emit("chat_done", ());
}

async fn run(app: &AppHandle, text: String, state: &Value) -> Result<(), String> {
    let mut messages: Vec<Value> = vec![
        json!({ "role": "system", "content": SYSTEM_PROMPT }),
        json!({ "role": "user", "content": text }),
    ];

    // Round 1: let the model decide whether to call tools.
    let msg = crate::openai::chat::complete(Value::Array(messages.clone()), true).await?;

    if let Some(tool_calls) = msg["tool_calls"].as_array() {
        if !tool_calls.is_empty() {
            messages.push(msg.clone()); // assistant message with tool_calls

            for tc in tool_calls {
                let name = tc["function"]["name"].as_str().unwrap_or("").to_string();
                let args: Value = tc["function"]["arguments"]
                    .as_str()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_else(|| json!({}));

                // Mutating tools: tell the UI to apply the change.
                if crate::tools::is_mutating(&name) {
                    let _ = app.emit("tool_call", json!({ "name": name, "args": args }));
                }

                let result = crate::tools::execute(&name, &args, state);
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result
                }));
            }

            // Round 2: stream the spoken confirmation / answer.
            return crate::openai::chat::stream_chat(app, Value::Array(messages)).await;
        }
    }

    // No tools — emit the content we already have.
    if let Some(content) = msg["content"].as_str() {
        if !content.is_empty() {
            let _ = app.emit("chat_token", content);
        }
    }
    Ok(())
}
