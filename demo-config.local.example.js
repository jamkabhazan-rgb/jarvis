/* ============================================================
   demo-config.local.example.js — template for PRIVATE local testing.

   Copy to `demo-config.local.js` (which is gitignored) and drop in a
   raw OpenAI key to talk to the agent directly from your browser
   WITHOUT a proxy. Never commit the filled-in file, and never use a
   raw client-side key on a public host — it WILL be scraped and your
   key revoked. For anything public, use the proxy `endpoint` instead.
   ============================================================ */
window.JARVIS_DEMO = {
  endpoint: "",                 // leave empty for direct mode
  apiKey: "sk-...",             // your OpenAI key — direct mode only, local only
  model: "gpt-4o-mini",
  voice: "alloy",
  tts: true,
};
