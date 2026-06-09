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

The key is stored in the native keychain — macOS Keychain and Windows
Credential Manager — so no extra system packages are needed on either target.

### Icons

`tauri build` needs icons in `src-tauri/icons/`. Generate them once with
`npm run tauri icon path/to/logo.png`. `tauri dev` runs without them.

## Sprint roadmap (spec §15 — ship in this order)

| # | Sprint | Deliverable | Status |
|---|--------|-------------|--------|
| 1 | **Shell + loader + design system** | Tauri shell, cinematic loader, WebAudio SFX, failsafe, the dark-glass UI + nav/panels. The signature — built first. | **scaffolded** |
| 2 | **Chat + LLM (text)** | Orchestrator, OpenAI chat-completions with `tools`, token streaming to the chat UI, tool-call deltas. | **in progress** — real streaming chat-completions in the core, key in OS keychain, chat UI wired via events. Tool-call deltas next |
| 3 | **Voice** | Mic capture + local VAD (1.2–1.5s turn-taking), STT, TTS per sentence, barge-in, orb states driven by live TTS amplitude. | **in progress** — mic capture → STT → chat → TTS playback with orb-amplitude reactivity; press-mic barge-in. Local VAD/auto end-of-turn + per-sentence TTS next |
| 4 | **Skills framework + first tools** | Tool router + events; tasks/boards, goals, reminders against SQLite. ≥8 tools registered, panels re-render live. | **in progress** — function-calling live: core advertises tools, runs `tool_call`, emits events; panels apply them (task_add, note_add, finance_add_expense, research_query). Local persistence via `store.js`; SQLite-in-core + more tools next |
| 5 | **Knowledge vault** | Markdown vault (Obsidian-compatible, YAML frontmatter, `[[wikilinks]]`) + embeddings semantic search. | **in progress** — notes CRUD, full-text search, tag filter, `[[wikilinks]]` + backlink counts (localStorage); markdown-file sync + embeddings next |
| 6 | **Panels** | Research, mail (connect-gate + drafts-only), finance (CoinKeeper logic), tracker, connectors. | **in progress** — finance/tracker/connectors persisted; research queue interactive + persisted; mail gate persists. Real web-search/Gmail wiring later |
| 7 | **Agents** | Sub-agent builder + scoped run-chat through the orchestrator. | planned |
| 8 | **Computer control (opt-in) + packaging** | Permission-gated system module (off by default, audit log, kill-switch) + **macOS + Windows** builds + auto-update. | planned |

### Sprint 1 — what's in this scaffold

- Frontend ported into `src/` and wired with `bridge.js`.
- Tauri 2 project (`tauri.conf.json`, `Cargo.toml`, `main.rs`, `lib.rs`).
- `chat_send` command + orchestrator that **streams a reply via events**
  (`chat_token` → `chat_done`) — the exact shape Sprint 2's OpenAI pipeline
  will use, so the frontend ↔ core loop is already proven.
- `openai/` and `tools/` modules laid out with the key boundary in place.

Definition of Done for the whole build lives in spec §16.
