/* ============================================================
   store.js — tiny localStorage-backed persistence (JSON).
   A stop-gap durable store while the Rust core / SQLite layer
   (spec §12) is built. Same call shape the bridge will later use,
   so swapping localStorage for core invoke() is a one-line change.
   ============================================================ */
(function(){
  const PREFIX = 'jarvis.';
  function load(key, fallback){
    try{
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    }catch(e){ return fallback; }
  }
  function save(key, val){
    try{ localStorage.setItem(PREFIX + key, JSON.stringify(val)); }catch(e){}
  }
  function clear(key){ try{ localStorage.removeItem(PREFIX + key); }catch(e){} }
  window.STORE = { load, save, clear };
})();
