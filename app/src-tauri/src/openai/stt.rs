//! Transcription — POST /v1/audio/transcriptions.
//! Uploads a finalized utterance and returns the recognized text.

use reqwest::multipart;
use serde_json::Value;

const ENDPOINT: &str = "https://api.openai.com/v1/audio/transcriptions";

pub async fn transcribe(audio: Vec<u8>, mime: &str) -> Result<String, String> {
    let key = super::resolve_key()
        .ok_or("No OpenAI API key set. Add it in Settings (or set OPENAI_API_KEY).")?;

    let ext = if mime.contains("webm") { "webm" }
        else if mime.contains("ogg") { "ogg" }
        else if mime.contains("mp4") || mime.contains("m4a") { "mp4" }
        else if mime.contains("wav") { "wav" }
        else { "webm" };

    let part = multipart::Part::bytes(audio)
        .file_name(format!("audio.{ext}"))
        .mime_str(mime)
        .map_err(|e| e.to_string())?;
    let form = multipart::Form::new()
        .text("model", super::MODEL_STT)
        .part("file", part);

    let client = reqwest::Client::new();
    let resp = client
        .post(ENDPOINT)
        .bearer_auth(key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI {}: {}", status, detail));
    }

    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(v["text"].as_str().unwrap_or("").to_string())
}
