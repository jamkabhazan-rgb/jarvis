# API keys & accounts — what you need at start

## ✅ Required now (the only must-have)

**OpenAI API key** — powers the entire AI surface:

| Use | Model |
|---|---|
| Chat + tools | `gpt-4o-mini` |
| Speech-to-text | `gpt-4o-mini-transcribe` |
| Text-to-speech | `gpt-4o-mini-tts` |
| Embeddings (vault search, later) | `text-embedding-3-small` |

- Get it at platform.openai.com → **billing must be enabled** (paid).
- Set it in the app: **Settings → OpenAI** (stored in the OS keychain), or for dev
  `export OPENAI_API_KEY=sk-...` before `npm run dev`.
- This single key is enough for **chat + voice + all 11 tools + agents**. Nothing else is required to run.

## 🔌 Needed only when you turn on specific integrations

These features currently use built-in/simulated behavior; wiring them to the real
services needs your own credentials:

- **Web research (real search)** — one search API key: **Tavily**, **Brave Search**,
  or **SerpAPI**. Without it, Research uses generated summaries.
- **Mail + Calendar** — a **Google Cloud** project with an OAuth 2.0 client
  (Client ID + Secret), Gmail + Calendar APIs enabled, and a redirect URI.
  Drafts only — never auto-send.
- **Other connectors** — each is its own OAuth app: Slack, Notion, GitHub, Linear,
  Jira, Asana, Stripe, Dropbox, Zapier.

All tokens live in the OS keychain — never in the bundle.

## 📦 Needed for signed, distributable installers

- **macOS**: Apple Developer account ($99/yr) → Developer ID Application certificate
  + notarization (notarytool / app-specific password). Without it macOS Gatekeeper
  warns on launch.
- **Windows**: a code-signing certificate (OV/EV) to avoid SmartScreen warnings.
- **Auto-update**: a release host (e.g. GitHub Releases) + a Tauri updater signing
  keypair (generated locally; the public key goes in `tauri.conf.json`).

## 💸 Cost note

The pipeline deliberately uses the cheapest OpenAI models. A voice turn = STT + chat
+ TTS. There are no other paid services unless you enable the optional integrations
above. No telemetry.
