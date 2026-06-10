/* ============================================================
   store.js — durable persistence with a synchronous API.

   Under Tauri the backing store is SQLite in the Rust core (durable
   across WebView resets, updates and reinstalls). In a plain browser
   (e.g. the GitHub Pages preview) it falls back to localStorage.

   The public API stays synchronous (load/save/clear) so every call
   site is unchanged. We achieve that with an in-memory cache that is
   hydrated from the core once at boot (await STORE.hydrate()), after
   which reads are instant and writes are mirrored to the core in the
   background (write-through, fire-and-forget).
   ============================================================ */
(function(){
  const PREFIX = 'jarvis.';
  const B = window.BRIDGE;
  const useCore = !!(B && B.inTauri);
  const cache = Object.create(null);   // key -> already-parsed value
  let hydrated = false;

  // --- localStorage helpers (browser fallback + one-time migration source) ---
  function lsLoad(key, fb){
    try{ const v = localStorage.getItem(PREFIX + key); return v == null ? fb : JSON.parse(v); }
    catch(e){ return fb; }
  }
  function lsSave(key, val){ try{ localStorage.setItem(PREFIX + key, JSON.stringify(val)); }catch(e){} }
  function lsClear(key){ try{ localStorage.removeItem(PREFIX + key); }catch(e){} }

  function clone(v){
    // hand back a private copy so callers can't mutate the cache in place
    if(v == null || typeof v !== 'object') return v;
    try{ return JSON.parse(JSON.stringify(v)); }catch(e){ return v; }
  }

  function load(key, fallback){
    if(useCore) return (key in cache) ? clone(cache[key]) : fallback;
    return lsLoad(key, fallback);
  }
  function save(key, val){
    if(useCore){
      cache[key] = clone(val);
      B.invoke('store_set', { key, value: val }).catch(e=>console.warn('[store] set', key, e));
      return;
    }
    lsSave(key, val);
  }
  function clear(key){
    if(useCore){
      delete cache[key];
      B.invoke('store_del', { key }).catch(e=>console.warn('[store] del', key, e));
      return;
    }
    lsClear(key);
  }

  // Pull the whole store into the cache before the app reads anything.
  // First run under the core also migrates any pre-existing localStorage data.
  async function hydrate(){
    if(hydrated) return;
    if(!useCore){ hydrated = true; return; }
    try{
      // Never let a wedged core black-hole boot: race the load against a
      // timeout so the app always proceeds (worst case from an empty cache).
      const timeout = new Promise((_, rej)=> setTimeout(()=> rej(new Error('store hydrate timeout')), 5000));
      const all = await Promise.race([ B.invoke('store_get_all'), timeout ]) || {};
      Object.assign(cache, all);
      if(Object.keys(all).length === 0){
        let migrated = 0;
        for(let i = 0; i < localStorage.length; i++){
          const k = localStorage.key(i);
          if(!k || !k.startsWith(PREFIX)) continue;
          const bare = k.slice(PREFIX.length);
          try{
            const v = JSON.parse(localStorage.getItem(k));
            cache[bare] = v;
            B.invoke('store_set', { key: bare, value: v }).catch(()=>{});
            migrated++;
          }catch(e){}
        }
        if(migrated) console.info('[store] migrated', migrated, 'keys from localStorage → SQLite');
      }
    }catch(e){
      console.warn('[store] hydrate failed — starting from an empty cache', e);
    }
    hydrated = true;
  }

  window.STORE = { load, save, clear, hydrate, hydrated: ()=>hydrated, backend: useCore ? 'sqlite' : 'localStorage' };
})();
