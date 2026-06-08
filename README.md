# J.A.R.V.I.S. — build package for Claude Code

A local-first, J.A.R.V.I.S.-style voice AI assistant. This package contains a **working
HTML/CSS/JS prototype** of the full product and a **precise build specification**. Your job
is to turn it into a production **Tauri 2** app whose entire AI surface runs on **one OpenAI
API key**.

---

## Start here (read in this order)

1. **`JARVIS — Architecture & Build Spec.html`** — the single source of truth. Open in a
   browser (or print to PDF). It defines the architecture, the OpenAI-key voice pipeline,
   every module, the data model, security model, build/sprint order, and the acceptance
   checklist (Definition of Done). **Build exactly to this brief.**
2. **`JARVIS.html`** — the reference prototype. Open it and use it. Its visual output and
   interactions are the **acceptance target** — match them 1:1.
3. The prototype source files below show how each screen/behavior is implemented today.

## What to do

- Implement in the **sprint order** of §15 of the spec. Ship the **loader + shell** first.
- Move all OpenAI calls (STT, chat+tools, TTS, embeddings) and the **API key** into the
  **Rust core**. The WebView must never hold the key or call `api.openai.com` directly
  (see §08, §13, §14, and the Definition of Done in §16).
- Keep the frontend module split; wire it to the core via `invoke()` + event streams.
- Honor every **MUST** in the spec. When ambiguous: local-first, cheapest OpenAI model that
  meets quality, smallest reviewable change.

## Prototype file map (`/` = this folder)

| File | Role |
|---|---|
| `JARVIS.html` | App shell: boot overlay, topbar nav, orb column, all panel views, settings page |
| `styles.css` | Design system tokens + core layout (loader, shell, chat, cards) |
| `panels.css` | Kanban, research, knowledge, connectors, goals, settings, top nav |
| `finance.css` | CoinKeeper-style finance dashboard |
| `agents.css` | Agent list, builder modal, run-chat modal |
| `audio.js` | WebAudio SFX synth (no audio files): tone/noise/digi/glitch/rumble/riser/boom + reverb |
| `boot.js` | Cinematic loader phase machine (kernel → logo → welcome → orb-formation → reveal), 7s audio cap, failsafe |
| `orb.js` | Generative particle orb, 4 states, audio-reactive hooks |
| `app.js` | Shell logic: nav, mode toggle, chat stream + simulated tool-calls, voice state machine |
| `panels.js` | Tasks (kanban + boards + DnD), connectors, knowledge filters, full settings page |
| `finance.js` | Accounts, category budgets, safe-to-spend, expense/income entry |
| `agents.js` | Create/edit agents (role, prompt, capabilities, knowledge bases, sources) + run-chat |

> The prototype's AI is simulated (scripted responses). Replace the simulation with the
> real OpenAI pipeline per the spec; keep the UI and interactions identical.

## Stack (see spec §02)

Tauri 2 (Rust core + system WebView) · HTML/CSS/JS frontend · SQLite + markdown vault ·
WebAudio · **OpenAI API only** (`gpt-4o-mini`, `gpt-4o-mini-transcribe`/`whisper-1`,
`gpt-4o-mini-tts`/`tts-1`, `text-embedding-3-small`).

## Run the prototype

Just open `JARVIS.html` in a modern browser — no build step. Click once to unlock audio
(the loader plays ~7s of synthesized sound, then reveals the interface).

---

Definition of Done lives in **§16** of the spec. The build is accepted when every box is true.
Out of scope: OpenAI Realtime API, arbitrary shell/root in the base build, any non-OpenAI
paid AI provider, auto-send/payments without confirmation.
