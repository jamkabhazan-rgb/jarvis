//! Computer control (spec §17) — permission-gated shell execution.
//!
//! Enabled by default (a headline feature), but never autonomous: the
//! Settings toggle is the kill-switch, and the model can only *propose* a command (the
//! `computer_run` tool); execution happens through the separate
//! `system_execute` command the frontend invokes after the user clicks
//! "Run" on the confirmation card. The enabled flag lives in the core, so
//! flipping the Settings toggle off (the kill-switch) blocks execution
//! immediately even if a confirmation card is still on screen.

use serde_json::{json, Value};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

// Default mirrors the Settings toggle's default (on); the frontend re-syncs
// the persisted value on startup either way.
static ENABLED: AtomicBool = AtomicBool::new(true);

const TIMEOUT: Duration = Duration::from_secs(30);
const MAX_OUTPUT: usize = 8000; // chars of stdout/stderr fed back to the UI

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::SeqCst);
}

pub fn enabled() -> bool {
    ENABLED.load(Ordering::SeqCst)
}

/// Run a user-approved command through the platform shell. Returns
/// `{ code, stdout, stderr, timed_out }`.
pub async fn execute(command: String) -> Result<Value, String> {
    if !enabled() {
        return Err("Computer control is disabled in Settings.".into());
    }
    let cmd = command.trim().to_string();
    if cmd.is_empty() {
        return Err("Empty command.".into());
    }

    tauri::async_runtime::spawn_blocking(move || run_blocking(&cmd))
        .await
        .map_err(|e| e.to_string())?
}

fn run_blocking(cmd: &str) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .args(["/C", cmd])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .args(["-c", cmd])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    // Poll with a hard timeout so a hung command can't wedge the core.
    let start = Instant::now();
    let mut timed_out = false;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(_) => break,
            None if start.elapsed() > TIMEOUT => {
                let _ = child.kill();
                timed_out = true;
                break;
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    }

    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(json!({
        "code": out.status.code(),
        "stdout": clip(&String::from_utf8_lossy(&out.stdout)),
        "stderr": clip(&String::from_utf8_lossy(&out.stderr)),
        "timed_out": timed_out
    }))
}

fn clip(s: &str) -> String {
    if s.chars().count() <= MAX_OUTPUT {
        s.to_string()
    } else {
        let cut: String = s.chars().take(MAX_OUTPUT).collect();
        format!("{}\n… [truncated]", cut)
    }
}
