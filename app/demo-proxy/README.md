# Jarvis demo proxy

A tiny Cloudflare Worker that lets the public preview agent talk to OpenAI
**without ever exposing your API key**. The key lives as a Worker secret;
the browser only ever talks to the Worker. The Worker also injects the
trusted system prompt, caps tokens/message size, restricts calling origins,
and rate-limits per IP so a shared demo can't run away with your budget.

## Deploy (≈2 minutes)

```bash
npm install -g wrangler        # if you don't have it
cd app/demo-proxy

wrangler login                 # opens the browser once
wrangler secret put OPENAI_API_KEY   # paste your key — stored encrypted, never in git
wrangler deploy
```

`wrangler deploy` prints a URL like `https://jarvis-demo.<you>.workers.dev`.

## Point the preview at it

Edit `app/src/demo-config.js` (the committed, secret-free config):

```js
window.JARVIS_DEMO = { endpoint: "https://jarvis-demo.<you>.workers.dev", model: "gpt-4o-mini", voice: "alloy", tts: true };
```

Commit that and the public preview now runs the live agent for everyone —
with the key safely server-side.

## Lock it down

`wrangler.toml` → `ALLOWED_ORIGINS`: set this to exactly your GitHub Pages
origin (e.g. `https://jamkabhazan-rgb.github.io`) plus localhost for testing.
Requests from other origins are rejected. Tune the caps at the top of
`worker.js` (`MAX_TOKENS`, `MAX_PER_WINDOW`) to taste. For strict,
cross-region rate limiting, back `HITS` with a KV namespace.

## Endpoints

- `POST /chat` — `{ messages: [{role,content}...], model? }` → SSE stream of
  OpenAI chat chunks. System prompt is added server-side; client system
  messages are ignored.
- `POST /tts` — `{ input, voice? }` → `audio/mpeg`.
