/* ============================================================
   bridge.js — thin wrapper around the Tauri core (invoke + events)
   The frontend NEVER calls OpenAI directly; it talks to the Rust
   core via invoke() and receives streamed chunks via events.
   Falls back gracefully to a "no core" mode in a plain browser
   (e.g. the GitHub Pages preview), so the UI still runs.
   ============================================================ */
(function(){
  const T = window.__TAURI__;            // present when withGlobalTauri = true
  const inTauri = !!(T && T.core);

  async function invoke(cmd, args){
    if(!inTauri) throw new Error('core unavailable (running outside Tauri)');
    return T.core.invoke(cmd, args);
  }

  // listen(event, cb) -> returns an unlisten function (no-op in browser)
  function listen(event, cb){
    if(!inTauri) return Promise.resolve(()=>{});
    return T.event.listen(event, e => cb(e.payload));
  }

  window.BRIDGE = { inTauri, invoke, listen };
  console.info('[bridge] core', inTauri ? 'connected' : 'unavailable (browser preview)');
})();
