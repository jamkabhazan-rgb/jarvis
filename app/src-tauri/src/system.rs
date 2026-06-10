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
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

// Default mirrors the Settings toggle's default (on); the frontend re-syncs
// the persisted value on startup either way.
static ENABLED: AtomicBool = AtomicBool::new(true);

const TIMEOUT: Duration = Duration::from_secs(30);
const MAX_OUTPUT: usize = 8000; // chars of stdout/stderr fed back to the UI
// How long to wait for the output-drain threads after the child exits; a
// lingering grandchild holding the pipes must not wedge the core.
const DRAIN_GRACE: Duration = Duration::from_secs(2);

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

    // Drain stdout/stderr on background threads while we poll: a child that
    // fills the OS pipe buffer (~64 KB) would otherwise block on write,
    // never exit, and read here as a spurious timeout.
    let stdout_rx = drain(child.stdout.take());
    let stderr_rx = drain(child.stderr.take());

    // Poll with a hard timeout so a hung command can't wedge the core.
    let start = Instant::now();
    let mut timed_out = false;
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(s) => break s,
            None if start.elapsed() > TIMEOUT => {
                let _ = child.kill();
                timed_out = true;
                // kill() needs a wait() to actually reap the process
                break child.wait().map_err(|e| e.to_string())?;
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    };

    // The shell has exited, but a grandchild it spawned (a backgrounded
    // process, or `sleep` surviving the kill) can still hold the pipe write
    // ends open — so collect output with a bounded wait instead of blocking
    // to EOF. The drain threads are detached; an abandoned one just dies
    // whenever the pipe finally closes.
    let stdout = collect(stdout_rx);
    let stderr = collect(stderr_rx);
    Ok(json!({
        "code": status.code(),
        "stdout": clip(&String::from_utf8_lossy(&stdout)),
        "stderr": clip(&String::from_utf8_lossy(&stderr)),
        "timed_out": timed_out
    }))
}

/// Read a child pipe on a detached thread so the child never blocks on a
/// full pipe buffer while the main thread polls for exit. Output is streamed
/// over a channel in chunks, so whatever was written before an exit/kill is
/// recoverable even if a grandchild keeps the pipe open afterwards.
fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> std::sync::mpsc::Receiver<Vec<u8>> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        if let Some(mut p) = pipe {
            let mut chunk = [0u8; 8192];
            loop {
                match p.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    // send fails only after the caller stopped collecting,
                    // which can't happen before the child has exited — safe
                    // to stop reading then.
                    Ok(n) => {
                        if tx.send(chunk[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        }
    });
    rx
}

/// Gather drained chunks: until EOF (sender disconnect), the grace deadline,
/// or the in-memory cap — whichever comes first. The cap guards against a
/// command dumping hundreds of MB; `clip()` only shows the head anyway.
fn collect(rx: std::sync::mpsc::Receiver<Vec<u8>>) -> Vec<u8> {
    const CAP: usize = 1_000_000;
    let mut buf = Vec::new();
    let deadline = Instant::now() + DRAIN_GRACE;
    while buf.len() < CAP {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        match rx.recv_timeout(left) {
            Ok(c) => buf.extend_from_slice(&c),
            Err(_) => break, // EOF (disconnected) or grace expired
        }
    }
    buf
}

fn clip(s: &str) -> String {
    if s.chars().count() <= MAX_OUTPUT {
        s.to_string()
    } else {
        let cut: String = s.chars().take(MAX_OUTPUT).collect();
        format!("{}\n… [truncated]", cut)
    }
}
