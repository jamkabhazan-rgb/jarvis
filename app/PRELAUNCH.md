# Pre-launch checklist

Things to verify on a real machine before the first run is considered "green".
The CI container here can't build Tauri (no GTK system libs on Linux), so the
items below must be confirmed on macOS / Windows (or a Linux box with GTK).

## Build

- [ ] `cd app/src-tauri && cargo build` succeeds — confirms the bundled
      `rusqlite` (SQLite compiled from source) builds. Needs a C compiler
      (clang/MSVC), which every Tauri toolchain already has.
- [ ] `cargo clippy --all-targets` is clean (warnings are fine, no errors).

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
