//! Chat + tools — POST /v1/chat/completions (stream: true).
//!
//! Streams assistant tokens to the UI via the `chat_token` event, the same
//! shape the simulated scaffold used. Transient failures (429 / 5xx / network)
//! are retried with exponential backoff before any tokens are emitted.

use futures_util::StreamExt;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const MAX_TRIES: u32 = 4; // 1 try + 3 retries (≈ 0.5s, 1s, 2s backoff)

/// POST the body, retrying on 429 / 5xx / network errors with exponential
/// backoff. Returns the successful response, or an error after the last try.
async fn post_with_retry(body: &Value) -> Result<reqwest::Response, String> {
    let key = super::resolve_key()
        .ok_or("No OpenAI API key set. Add it in Settings (or set OPENAI_API_KEY).")?;
    let client = reqwest::Client::new();
    let mut last_err = String::new();

    for attempt in 0..MAX_TRIES {
        if attempt > 0 {
            // 0.5s, 1s, 2s …
            let backoff = Duration::from_millis(500u64 << (attempt - 1));
            tokio::time::sleep(backoff).await;
        }
        match client.post(ENDPOINT).bearer_auth(&key).json(body).send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    return Ok(resp);
                }
                let retryable = status.as_u16() == 429 || status.is_server_error();
                let detail = resp.text().await.unwrap_or_default();
                last_err = format!("OpenAI {}: {}", status, detail);
                if !retryable {
                    return Err(last_err); // 4xx (bad key, bad request) — don't retry
                }
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
    }
    Err(format!("OpenAI request failed after {MAX_TRIES} attempts: {last_err}"))
}

/// Emit token usage to the UI so the Settings → Usage panel can tally cost.
fn emit_usage(app: &AppHandle, usage: &Value) {
    let prompt = usage["prompt_tokens"].as_u64().unwrap_or(0);
    let completion = usage["completion_tokens"].as_u64().unwrap_or(0);
    if prompt == 0 && completion == 0 {
        return;
    }
    let _ = app.emit(
        "usage",
        json!({ "model": super::MODEL_CHAT, "prompt": prompt, "completion": completion }),
    );
}

/// One non-streaming completion. Returns `choices[0].message` (which may
/// contain `tool_calls`). Used for the tool-decision round. `tools`, when
/// present, is the (possibly filtered) tool-definition array.
pub async fn complete(app: &AppHandle, messages: Value, tools: Option<Value>) -> Result<Value, String> {
    let mut body = json!({
        "model": super::MODEL_CHAT,
        "messages": messages,
        "temperature": 0.5
    });
    if let Some(t) = tools {
        body["tools"] = t;
        body["tool_choice"] = json!("auto");
    }

    let resp = post_with_retry(&body).await?;
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    emit_usage(app, &v["usage"]);
    Ok(v["choices"][0]["message"].clone())
}

/// `messages` is a JSON array of {role, content} objects. Streamed tokens are
/// emitted on `token_event` (e.g. "chat_token" or "agent_token").
pub async fn stream_chat(app: &AppHandle, messages: Value, token_event: &str) -> Result<(), String> {
    let body = json!({
        "model": super::MODEL_CHAT,
        "messages": messages,
        "stream": true,
        "stream_options": { "include_usage": true },
        "temperature": 0.6
    });

    let resp = post_with_retry(&body).await?;

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
                // the final chunk (with include_usage) carries token totals
                if v["usage"].is_object() {
                    emit_usage(app, &v["usage"]);
                }
            }
        }
    }
    Ok(())
}
