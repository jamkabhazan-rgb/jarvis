# J.A.R.V.I.S. — production app (`app/`)

Tauri 2 build of the assistant. Web frontend inside a native shell, with a
**Rust core that owns the OpenAI key** and makes every OpenAI call. The
WebView never holds the key and never calls `api.openai.com` directly.

> Source of truth: `../JARVIS — Architecture & Build Spec.html`.
> Acceptance target: the prototype in the repo root (match it 1:1).

## Layout (spec §04)

```
app/
├─ package.json            # tauri scripts
├─ src/                    # web frontend (ported from the prototype)
│  ├─ index.html
│  ├─ styles.css panels.css finance.css agents.css
│  ├─ audio.js boot.js orb.js app.js panels.js finance.js agents.js
│  └─ bridge.js            # invoke()/listen() wrappers to the core
└─ src-tauri/              # Rust core
   ├─ Cargo.toml  build.rs  tauri.conf.json
   ├─ capabilities/default.json
   └─ src/
      ├─ main.rs  lib.rs
      ├─ orchestrator.rs   # dialog loop + tool router (streams via events)
      ├─ openai/           # OWNS THE KEY: mod.rs chat.rs stt.rs tts.rs embed.rs
      └─ tools/            # one file per skill (fn-calling): mod.rs tasks.rs …
```

## Run

**Targets: macOS + Windows.** (Linux is out of scope for now.)

```bash
# prerequisites: Rust, Node, Tauri CLI
#   macOS:   Xcode command-line tools
#   Windows: Microsoft C++ Build Tools + WebView2 (preinstalled on Win 11)
cd app
npm install
npm run dev          # tauri dev (desktop)
npm run build        # macOS: .app/.dmg   ·   Windows: .msi/.exe (NSIS)
```

The frontend is plain HTML/CSS/JS served statically (no bundler). Because
`withGlobalTauri` is on, `bridge.js` reaches the core via `window.__TAURI__`.
Opened in a plain browser it falls back to "core unavailable" so the UI
(and the GitHub Pages preview) still runs.

### Key handling

Set the OpenAI key via **Settings → OpenAI** (stored in the OS keychain) — or,
for dev, export `OPENAI_API_KEY` before `npm run dev`. The key lives only in
the Rust core; a grep of `src/` must never find it or an `api.openai.com` call.
Once a key is set, the chat tab streams real `gpt-4o-mini` replies through the
core (`chat_send` → `chat_token`/`chat_done` events).

**Full key/account checklist:** see [`docs/API-KEYS.md`](docs/API-KEYS.md).
Short version: an OpenAI key is the only thing required to run; search/Google/
connector keys and signing certs are only needed for those specific features.

The key is stored in the native keychain — macOS Keychain and Windows
Credential Manager — so no extra system packages are needed on either target.

### Microphone

Voice is hands-free: press the mic once to start listening; local VAD ends each
turn after ~1.3s of silence, transcribes, replies, speaks, and resumes. Press
the mic again to stop. macOS asks for mic permission on first use
(`NSMicrophoneUsageDescription` is set in `src-tauri/Info.plist`); Windows
prompts via WebView2.

### Usage & cost

The core emits a `usage` event (real `prompt`/`completion` token counts from
each OpenAI response, incl. streaming via `stream_options.include_usage`). The
frontend tallies it per calendar month in `Settings → Usage & cost`: estimated
spend (priced from an editable per-model table), input/output tokens, request
count, all-time totals, a **monthly budget** with a progress bar and an
over-budget warning toast, and a reset button.

### Computer control (opt-in, spec §17)

Enabled by default — it's a headline feature — but never autonomous.
**Settings → Computer control** is the master toggle; it syncs straight into
the Rust core and doubles as the kill-switch. The model can only
*propose* a shell command (`computer_run`) — it renders as a confirmation card
in chat showing the exact command, and nothing executes until the user clicks
RUN (`system_execute`, 30s hard timeout, output shown in the card). Every
run/denial lands in the audit log in Settings (tagged with the agent name when
an agent issued it). **Agents** can use it too — grant the *Computer / shell*
capability in the agent builder; their proposed commands render the same
approval card in the agent run window, still gated by the global toggle.

A **Setup guide** section in Settings walks new users through everything:
OpenAI key, mic permission, persona, computer control, updates.

### Releases & updates

Push a version tag (`git tag v0.2.0 && git push origin v0.2.0`) and
`.github/workflows/release.yml` builds macOS (arm64 + x64) and Windows
installers into a draft GitHub Release. In-app auto-update is wired up via
`tauri-plugin-updater` — full step-by-step in
[`docs/UPDATES.md`](docs/UPDATES.md).

### Icons

`tauri build` needs icons in `src-tauri/icons/` — they are committed
(generated orb logo: `.png`, `.ico`, `.icns`). To replace the logo, drop a
square PNG and run `npm run tauri icon path/to/logo.png` to regenerate the set.

## Sprint roadmap (spec §15 — ship in this order)

| # | Sprint | Deliverable | Status |
|---|--------|-------------|--------|
| 1 | **Shell + loader + design system** | Tauri shell, cinematic loader, WebAudio SFX, failsafe, the dark-glass UI + nav/panels. The signature — built first. | **scaffolded** |
| 2 | **Chat + LLM (text)** | Orchestrator, OpenAI chat-completions with `tools`, token streaming to the chat UI, tool-call deltas. | **working** — real streaming chat-completions in the core, key in OS keychain, chat UI wired via events, **conversation memory** (rolling history per chat + per agent), **conversation archive** (every chat saved in full — browse/search/reopen/delete/export, new-chat button), retries with backoff on 429/5xx |
| 3 | **Voice** | Mic capture + local VAD (1.2–1.5s turn-taking), STT, TTS per sentence, barge-in, orb states driven by live TTS amplitude. | **working** — hands-free loop: mic → energy VAD (~1.3s end-of-turn) → STT → chat(+tools) → **per-sentence TTS** (speaks sentence 1 while the rest streams), orb driven by live mic/voice amplitude, barge-in |
| 4 | **Skills framework + first tools** | Tool router + events; tasks/boards, goals, reminders against SQLite. ≥8 tools registered, panels re-render live. | **working** — 14 tools: task_add/move/list, board_add, goal_set, habit_log, note_add, vault_search, finance_add_expense, finance_summary, research_query, computer_run, memory_save, memory_forget. Mutating tools emit events → panels update live; read tools answer from a per-turn state snapshot. **Durable store now SQLite-in-core**: a key→JSON `kv` table in the app data dir backs all persisted state (tasks, memories, conversations, settings…); the WebView hydrates a synchronous cache at boot and write-throughs every change, with one-time migration from localStorage and graceful localStorage fallback in the browser preview |
| 5 | **Knowledge vault** | Markdown vault (Obsidian-compatible, YAML frontmatter, `[[wikilinks]]`) + embeddings semantic search. | **in progress** — notes CRUD, full-text search, tag filter, `[[wikilinks]]` + backlink counts; **long-term memory** (durable facts saved via `memory_save`, injected into every conversation's system prompt, managed in Settings) (SQLite-in-core); markdown-file sync + embeddings next |
| 6 | **Panels** | Research, mail (connect-gate + drafts-only), finance (CoinKeeper logic), tracker, connectors. | **in progress** — finance/tracker/connectors persisted; research queue interactive + persisted; mail gate persists. Real web-search/Gmail wiring later |
| 7 | **Agents** | Sub-agent builder + scoped run-chat through the orchestrator. | **working** — run-chat routes through the core on the `agent_*` channel with the agent's prompt + tools restricted to its capabilities; tool calls apply to panels live; per-agent conversation memory; agents with the *Computer / shell* capability can propose shell commands (build/deploy) via the same approval-card + audit-log flow. (Browser preview keeps the scripted demo.) |
| 8 | **Computer control (opt-in) + packaging** | Permission-gated system module (off by default, audit log, kill-switch) + **macOS + Windows** builds + auto-update. | **working** — computer control shipped: on by default, Settings toggle = kill-switch (synced into the core), `computer_run` tool proposes ONE command, a confirmation card in chat executes it only on the user's RUN click (30s timeout), audit log in Settings. Packaging: icons + bundle config, release CI on version tags + update guide (`docs/UPDATES.md`) |

### Sprint 1 — what's in this scaffold

- Frontend ported into `src/` and wired with `bridge.js`.
- Tauri 2 project (`tauri.conf.json`, `Cargo.toml`, `main.rs`, `lib.rs`).
- `chat_send` command + orchestrator that **streams a reply via events**
  (`chat_token` → `chat_done`) — the exact shape Sprint 2's OpenAI pipeline
  will use, so the frontend ↔ core loop is already proven.
- `openai/` and `tools/` modules laid out with the key boundary in place.

Definition of Done for the whole build lives in spec §16.
