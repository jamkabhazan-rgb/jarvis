/* ============================================================
   Jarvis demo proxy — Cloudflare Worker.

   Holds the OpenAI key as a server-side secret (NEVER shipped to the
   browser) and exposes just enough surface for the public preview
   agent: streaming /chat and /tts. Protects the key/budget with an
   origin allowlist, hard caps on tokens and message size, and a
   best-effort per-IP rate limit.

   Deploy: see README.md (≈2 minutes).
   ============================================================ */

// Trusted system prompt — injected server-side so a client can't override it.
const SYSTEM = `You are J.A.R.V.I.S. — a calm, witty, hyper-competent voice AI assistant, talking to a visitor trying you out in a live browser demo. You ARE the product; speak in the first person.

GOAL: be genuinely useful and honest, and leave the visitor wanting to install you. When they sound impressed, warmly (once) invite them to post a short review on X. Never pushy.

WHAT YOU ARE (accurate, speak with confidence about these):
- Local-first desktop assistant for macOS & Windows, built with Tauri (a small Rust core + web UI). Cinematic Iron-Man-style interface.
- One OpenAI key powers chat, voice and tools; it's held ONLY by the local core in the OS keychain — never in the web layer, never sent anywhere but OpenAI.
- Hands-free voice: mic → on-device voice-activity detection → speech-to-text → model → text-to-speech. Sub-second feel, barge-in supported.
- AGENT ORCHESTRATION: I don't just answer — I launch and coordinate a team of specialized sub-agents, delegating parts of a job, running them in parallel, and synthesizing the result. I plan multi-step work and drive it to completion.
- CODING: I write and refactor real code, hunt down and fix bugs, and scaffold entire projects from scratch — then run, test and iterate until they work. Think of me as a senior engineer on call.
- Productivity skills: kanban tasks/boards, goals & habits, a markdown knowledge vault with search, finance/budget tracking, a research queue, and long-term memory across sessions.
- Every conversation is saved locally — browse, search, reopen, export. Durable storage is SQLite in the core (survives restarts/updates/reinstalls).
- COMPUTER CONTROL (the real-Jarvis part): with control enabled in Settings, I act on your machine — open links and apps, switch browser tabs, play music, type and click, run terminal commands, and automate multi-step desktop tasks for you. It's OFF by default; every action needs your explicit confirmation and there's an instant kill-switch. The model can never act on its own.
- Auto-updates via GitHub Releases, cryptographically signature-verified.

SAFETY (lead with this when asked): local-first — your data/tasks/notes/memories live on your machine in local SQLite, not a company cloud. Only outbound traffic is to OpenAI for the AI itself. Computer control and the agent/coding powers that touch your system are opt-in, per-action confirmed, and kill-switched. The key never touches the web UI.

INSTALL: you can install me right from this page — there's a Download button (top-right) that opens a download page with macOS and Windows installers plus a one-line terminal command. Launch, paste your OpenAI key once in Settings (stored in your keychain), done. Open source too.

HONESTY: some panels (mail, certain connectors, embeddings search) are still in progress — say so if asked. Real working assistant, not vaporware; never promise unshipped features. If unsure, say so.

STYLE: concise and conversational (this may be spoken aloud) — usually 2-5 sentences, warm, lightly witty, never robotic. No long bullet lists in speech.`;

const CHAT_MODEL_ALLOW = new Set(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"]);
const MAX_TOKENS = 500;
const MAX_MESSAGES = 24;
const MAX_MSG_CHARS = 4000;
const TTS_MAX_CHARS = 1000;

// best-effort per-IP limiter (per-isolate memory; upgrade to KV for strict limits)
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip) {
  const now = Date.now();
  const e = HITS.get(ip);
  if (!e || now - e.start > WINDOW_MS) { HITS.set(ip, { start: now, n: 1 }); return false; }
  e.n++;
  return e.n > MAX_PER_WINDOW;
}

function corsHeaders(origin, allowed) {
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (!allowed.includes("*") && !allowed.includes(origin)) {
      return json({ error: "origin not allowed" }, 403, cors);
    }

    // installer downloads (GET) — stream the latest release asset back with a
    // clean filename (Jarvis.dmg / Jarvis.exe). No key needed.
    if (url.pathname.startsWith("/dl/")) return await download(url, cors);

    if (!env.OPENAI_API_KEY) return json({ error: "proxy missing OPENAI_API_KEY secret" }, 500, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    if (rateLimited(ip)) return json({ error: "rate limit — slow down a moment" }, 429, cors);

    if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);

    try {
      if (url.pathname === "/chat") return await chat(request, env, cors);
      if (url.pathname === "/tts") return await tts(request, env, cors);
      if (url.pathname === "/session") return await session(env, cors);
      return json({ error: "not found" }, 404, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500, cors);
    }
  },
};

// stream the latest release installer back with a clean filename (Jarvis.dmg / Jarvis.exe)
async function download(url, cors) {
  const platform = url.pathname.split("/").pop();
  const gh = { "User-Agent": "jarvis-proxy", "Accept": "application/vnd.github+json" };
  const rel = await (await fetch("https://api.github.com/repos/jamkabhazan-rgb/jarvis/releases/latest", { headers: gh })).json();
  const assets = rel.assets || [];
  const pick = (re) => assets.find((a) => re.test(a.name));
  let asset, base;
  if (platform === "mac") { asset = pick(/(aarch64|arm64|universal).*\.dmg$/i) || pick(/\.dmg$/i); base = "Jarvis"; }
  else if (platform === "mac-intel") { asset = pick(/(x64|x86_64|intel).*\.dmg$/i); base = "Jarvis-Intel"; }
  else if (platform === "win") { asset = pick(/(setup)?\.exe$/i) || pick(/\.msi$/i); base = "Jarvis"; }
  if (!asset) return json({ error: "no installer for " + platform }, 404, cors);
  const ext = asset.name.slice(asset.name.lastIndexOf("."));
  const upstream = await fetch(asset.browser_download_url, { headers: { "User-Agent": "jarvis-proxy" } });
  if (!upstream.ok) return json({ error: "asset fetch " + upstream.status }, 502, cors);
  return new Response(upstream.body, {
    status: 200,
    headers: { ...cors, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${base}${ext}"`, "Cache-Control": "no-store" },
  });
}

async function chat(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const model = CHAT_MODEL_ALLOW.has(body.model) ? body.model : "gpt-4o-mini";

  // take only user/assistant turns from the client; the system prompt is ours
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const turns = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }));

  const payload = {
    model,
    stream: true,
    temperature: 0.7,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "system", content: SYSTEM }, ...turns],
  };

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return json({ error: `openai ${upstream.status}`, detail: detail.slice(0, 300) }, 502, cors);
  }

  // pass the SSE stream straight through
  return new Response(upstream.body, {
    headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

const REALTIME_MODEL = "gpt-realtime";

// Mint a short-lived ephemeral Realtime token (GA API). The browser uses this
// (never the real key) to open a WebRTC voice connection straight to OpenAI.
// The sales persona is baked in here as `instructions`, server-side.
async function session(env, cors) {
  const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: SYSTEM,
        audio: {
          input: { transcription: { model: "whisper-1" } },
          output: { voice: "ash" }, // deep, confident male voice
        },
      },
    }),
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function tts(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const input = String(body.input || "").slice(0, TTS_MAX_CHARS);
  if (!input.trim()) return json({ error: "empty input" }, 400, cors);
  const voice = typeof body.voice === "string" ? body.voice : "alloy";

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "tts-1", voice, input }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return json({ error: `tts ${upstream.status}`, detail: detail.slice(0, 300) }, 502, cors);
  }
  return new Response(upstream.body, {
    headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
