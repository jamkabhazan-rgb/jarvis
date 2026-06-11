/* ============================================================
   demo-config.js — configuration for the live preview agent.
   COMMITTED — must contain NO secrets.

   For a PUBLIC demo (anyone can chat), deploy the proxy in
   ../../demo-proxy/ and put its URL in `endpoint` below. The key
   lives server-side in the Worker, never here.

   For PRIVATE local testing with a raw key, create
   `demo-config.local.js` (gitignored) — it overrides this file. See
   demo-config.local.example.js for the shape.
   ============================================================ */
window.JARVIS_DEMO = {
  endpoint: "",            // e.g. "https://jarvis-demo.<you>.workers.dev"
  model: "gpt-4o-mini",
  voice: "alloy",
  tts: true,
};
