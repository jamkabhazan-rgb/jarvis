# Pre-launch checklist

Things to verify on a real machine before the first run is considered "green".

## Build — ✅ verified in CI-like Linux env (GTK installed)

- [x] `cd app/src-tauri && cargo check` and full `cargo build` succeed —
      bundled `rusqlite` compiles, binary links.
- [x] `cargo clippy` is clean (zero warnings).
- [x] `cargo test --lib` passes (store roundtrip: init/upsert/delete/unicode).
- [x] Headless smoke run (Xvfb): app starts, creates
      `<app_data_dir>/jarvis.db` with WAL mode active, runs without crashing.

Still re-confirm on the actual target OS (macOS / Windows):

## Durable store (SQLite)

- [ ] First launch creates `<app_data_dir>/jarvis.db` (plus `-wal` / `-shm`).
      App data dir:
      - macOS: `~/Library/Application Support/com.jarvis.app/`
      - Windows: `%APPDATA%\com.jarvis.app\`
      - Linux: `~/.local/share/com.jarvis.app/`
- [ ] On the first launch with pre-existing data, the dev console logs
      `[store] migrated N keys from localStorage → SQLite`.
- [ ] Persistence smoke test: add a task / send a chat / save a memory,
      **fully quit and relaunch**, confirm everything is still there.
- [ ] Conversation archive (clock icon in the chat header) lists past chats,
      search works, reopening a chat restores it, delete + export work.

## Boot resilience

- [ ] App boots normally (loader → orb → UI). The store hydrates before the
      app modules load.
- [ ] Failsafe: if the core is unreachable the app still reaches the UI within
      a few seconds (5s hydrate timeout + 16s hard boot failsafe) rather than
      hanging on the loader.

## Secrets / API

- [ ] Enter the OpenAI key in Settings; `has_api_key` reports true after a
      relaunch (key lives in the OS keychain, never in the WebView/DB).
- [ ] A chat turn streams a reply; voice (mic → STT → reply → TTS) works.

## Browser preview (no core)

- [ ] Served from `app/src` in a plain browser, the app still runs and
      persists to `localStorage` (store backend falls back automatically).
