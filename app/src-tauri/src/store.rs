//! Durable key→JSON store backed by SQLite (spec §12 / Sprint 4).
//!
//! The WebView keeps the same `STORE.load/save/clear` call shape it always
//! had; under Tauri those calls are now write-through to this SQLite file in
//! the app data dir, so conversations, memories, tasks and settings survive
//! WebView storage resets, app updates and reinstalls — and the file is a
//! single place we can later encrypt at rest.
//!
//! A generic kv table keeps the surface tiny: the frontend owns the schema of
//! each value (it stores JSON), the core owns durability.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Open (creating if needed) the SQLite store at `path` and ensure the schema
/// exists. Called once from the Tauri `setup` hook. Safe to call only once;
/// a second call is reported as an error and ignored.
pub fn init(path: PathBuf) -> Result<(), String> {
    let conn = Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
    // WAL keeps reads/writes from blocking each other and survives an abrupt
    // process exit far better than the default rollback journal; busy_timeout
    // makes the occasional concurrent access wait rather than fail.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 4000;",
    )
    .map_err(|e| format!("pragmas: {e}"))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv (
            key     TEXT PRIMARY KEY,
            value   TEXT NOT NULL,
            updated INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("create table: {e}"))?;
    DB.set(Mutex::new(conn))
        .map_err(|_| "store already initialized".to_string())?;
    Ok(())
}

fn conn() -> Result<std::sync::MutexGuard<'static, Connection>, String> {
    DB.get()
        .ok_or_else(|| "store not initialized".to_string())?
        .lock()
        .map_err(|_| "store lock poisoned".to_string())
}

/// Read the whole store as a JSON object `{ key: value, ... }`. The frontend
/// hydrates its in-memory cache from this once at boot.
pub fn get_all() -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let guard = conn()?;
    let mut stmt = guard
        .prepare("SELECT key, value FROM kv")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        let val = serde_json::from_str(&v).unwrap_or(serde_json::Value::Null);
        map.insert(k, val);
    }
    Ok(map)
}

/// Upsert a single key.
pub fn set(key: &str, value: &serde_json::Value) -> Result<(), String> {
    let s = serde_json::to_string(value).map_err(|e| e.to_string())?;
    let guard = conn()?;
    guard
        .execute(
            "INSERT INTO kv (key, value, updated) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated = ?3",
            params![key, s, now_ms()],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a single key (no error if it was absent).
pub fn del(key: &str) -> Result<(), String> {
    let guard = conn()?;
    guard
        .execute("DELETE FROM kv WHERE key = ?1", params![key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // One test fn on purpose: the store is a process-wide singleton
    // (OnceLock), so a single sequential scenario exercises everything.
    #[test]
    fn roundtrip() {
        let path = std::env::temp_dir().join(format!("jarvis-store-test-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        init(path.clone()).unwrap();
        assert!(init(path.clone()).is_err()); // second init refused

        assert!(get_all().unwrap().is_empty());
        set("a", &json!({ "x": 1 })).unwrap();
        set("a", &json!([1, 2, 3])).unwrap(); // upsert replaces
        set("b", &json!("hi")).unwrap();
        set("unicode", &json!("привет — ёжик 🦔")).unwrap();
        del("missing").unwrap(); // absent key is not an error

        let all = get_all().unwrap();
        assert_eq!(all["a"], json!([1, 2, 3]));
        assert_eq!(all["b"], json!("hi"));
        assert_eq!(all["unicode"], json!("привет — ёжик 🦔"));

        del("b").unwrap();
        assert!(!get_all().unwrap().contains_key("b"));

        let _ = std::fs::remove_file(&path);
    }
}
