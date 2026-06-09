//! Chat + tools — POST /v1/chat/completions (stream: true).
//!
//! Streams assistant tokens to the UI via the `chat_token` event, the same
//! shape the simulated scaffold used. Tool-call deltas are surfaced in a
//! later pass; this gets the real text loop working end-to-end.

use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";

/// One non-streaming completion. Returns `choices[0].message` (which may
/// contain `tool_calls`). Used for the tool-decision round. `tools`, when
/// present, is the (possibly filtered) tool-definition array.
pub async fn complete(messages: Value, tools: Option<Value>) -> Result<Value, String> {
    let key = super::resolve_key()
        .ok_or("No OpenAI API key set. Add it in Settings (or set OPENAI_API_KEY).")?;

    let mut body = json!({
        "model": super::MODEL_CHAT,
        "messages": messages,
        "temperature": 0.5
    });
    if let Some(t) = tools {
        body["tools"] = t;
        body["tool_choice"] = json!("auto");
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(ENDPOINT)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI {}: {}", status, detail));
    }

    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(v["choices"][0]["message"].clone())
}

/// `messages` is a JSON array of {role, content} objects. Streamed tokens are
/// emitted on `token_event` (e.g. "chat_token" or "agent_token").
pub async fn stream_chat(app: &AppHandle, messages: Value, token_event: &str) -> Result<(), String> {
    let key = super::resolve_key()
        .ok_or("No OpenAI API key set. Add it in Settings (or set OPENAI_API_KEY).")?;

    let body = json!({
        "model": super::MODEL_CHAT,
        "messages": messages,
        "stream": true,
        "temperature": 0.6
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(ENDPOINT)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI {}: {}", status, detail));
    }

    // Parse the SSE stream: lines of `data: {json}` separated by newlines.
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf.drain(..=pos);

            let Some(data) = line.strip_prefix("data: ") else { continue };
            if data == "[DONE]" {
                return Ok(());
            }
            if let Ok(v) = serde_json::from_str::<Value>(data) {
                if let Some(tok) = v["choices"][0]["delta"]["content"].as_str() {
                    if !tok.is_empty() {
                        let _ = app.emit(token_event, tok);
                    }
                }
            }
        }
    }
    Ok(())
}
