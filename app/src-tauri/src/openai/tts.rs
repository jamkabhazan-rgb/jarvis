//! Speech — POST /v1/audio/speech. Returns mp3 bytes for the given text.
//! (Per-sentence synthesis + barge-in are layered on the frontend.)

use serde_json::json;

const ENDPOINT: &str = "https://api.openai.com/v1/audio/speech";

pub async fn speak(text: &str, voice: &str) -> Result<Vec<u8>, String> {
    let key = super::resolve_key()
        .ok_or("No OpenAI API key set. Add it in Settings (or set OPENAI_API_KEY).")?;

    let body = json!({
        "model": super::MODEL_TTS,
        "input": text,
        "voice": voice,
        "response_format": "mp3"
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

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}
