/* ============================================================
   voice.js — hands-free voice loop (Tauri only):
   mic capture + energy VAD (auto end-of-turn) → STT → chat → TTS,
   with the orb driven by live mic/voice amplitude. Barge-in: a new
   mic press or utterance cuts any TTS in progress.
   Inert in a plain browser (needs the core for OpenAI calls).
   ============================================================ */
(function(){
  const inTauri = ()=> !!(window.BRIDGE && window.BRIDGE.inTauri);

  let actx=null, curSrc=null;
  let micStream=null, analyser=null, rec=null, chunks=[];
  let listening=false, paused=false, onUtter=null, rafId=0;
  let spoke=false, silenceStart=0, turnStart=0;

  // VAD tuning (spec §08: 1.2–1.5s end-of-turn window)
  const SPEAK_THRESH=0.045, SILENCE_MS=1300, MIN_TURN_MS=400, MAX_TURN_MS=15000;

  function ctx(){ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); return actx; }

  async function ensureStream(){
    if(micStream) return;
    micStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const src = ctx().createMediaStreamSource(micStream);
    analyser = ctx().createAnalyser(); analyser.fftSize = 512;
    src.connect(analyser);
  }
  function beginRec(){
    chunks=[]; rec = new MediaRecorder(micStream);
    rec.ondataavailable = e=>{ if(e.data && e.data.size) chunks.push(e.data); };
    rec.start();
    spoke=false; silenceStart=0; turnStart=performance.now();
  }
  function stopRec(){
    return new Promise(res=>{
      if(!rec){ res(null); return; }
      rec.onstop = ()=>{ const b = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); rec=null; res(b); };
      try{ rec.stop(); }catch(e){ rec=null; res(null); }
    });
  }
  function micLevel(){
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let s=0; for(let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; s+=v*v; }
    return Math.sqrt(s/buf.length);
  }
  function loop(){
    if(!listening) return;
    if(paused){ rafId=requestAnimationFrame(loop); return; }
    const l = micLevel();
    window.ORB?.amp(Math.min(1, l*5));
    const now = performance.now();
    if(l > SPEAK_THRESH){ spoke=true; silenceStart=0; }
    else if(spoke && now-turnStart > MIN_TURN_MS){
      if(!silenceStart) silenceStart = now;
      else if(now-silenceStart > SILENCE_MS){ finishTurn(); return; }
    }
    if(spoke && now-turnStart > MAX_TURN_MS){ finishTurn(); return; }
    rafId = requestAnimationFrame(loop);
  }
  function blobToB64(blob){
    return new Promise(r=>{ const f=new FileReader(); f.onloadend=()=>r(String(f.result).split(',')[1]||''); f.readAsDataURL(blob); });
  }
  async function finishTurn(){
    paused = true;                 // pause monitoring until the reply is done
    const blob = await stopRec();
    if(!blob || !blob.size){ resume(); return; }
    try{
      const b64 = await blobToB64(blob);
      const text = await BRIDGE.invoke('transcribe', { audioB64:b64, mime:blob.type });
      if(text && text.trim() && onUtter) onUtter(text.trim());
      else resume();               // nothing recognized → keep listening
    }catch(e){ resume(); }
  }

  async function startListening(cb){
    onUtter = cb;
    await ensureStream();
    if(ctx().state==='suspended') try{ await ctx().resume(); }catch(e){}
    listening=true; paused=false; beginRec();
    cancelAnimationFrame(rafId); rafId=requestAnimationFrame(loop);
  }
  function pause(){ paused=true; }
  function resume(){
    if(!listening){ return; }
    paused=false; beginRec();
    cancelAnimationFrame(rafId); rafId=requestAnimationFrame(loop);
  }
  function stopListening(){
    listening=false; paused=false;
    cancelAnimationFrame(rafId);
    try{ if(rec && rec.state!=='inactive') rec.stop(); }catch(e){}
    micStream?.getTracks().forEach(t=>t.stop());
    micStream=null; analyser=null; rec=null;
    window.ORB?.amp(0.05);
  }

  function stopPlayback(){ queue.length=0; idleWaiters.length=0; try{ curSrc?.stop(); }catch(e){} curSrc=null; playing=false; }

  // ---- TTS queue: speak sentence-by-sentence as they arrive ----
  let queue=[], playing=false, idleWaiters=[];

  function playOne(text){
    return new Promise(async resolve=>{
      if(!inTauri() || !text || !text.trim()){ resolve(); return; }
      let b64; try{ b64 = await BRIDGE.invoke('speak', { text }); }catch(e){ resolve(); return; }
      if(!b64){ resolve(); return; }
      const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
      if(ctx().state==='suspended') try{ await ctx().resume(); }catch(e){}
      let buf; try{ buf = await ctx().decodeAudioData(bytes.buffer); }catch(e){ resolve(); return; }
      const src = ctx().createBufferSource(); src.buffer = buf;
      const an = ctx().createAnalyser(); an.fftSize = 256;
      src.connect(an); an.connect(ctx().destination);
      const data = new Uint8Array(an.frequencyBinCount);
      curSrc = src; window.ORB?.set('speaking'); src.start();
      (function tick(){
        if(curSrc!==src) return;
        an.getByteFrequencyData(data);
        let s=0; for(let i=0;i<data.length;i++) s+=data[i];
        window.ORB?.amp(Math.min(1, (s/data.length)/110));
        requestAnimationFrame(tick);
      })();
      src.onended = ()=>{ if(curSrc===src) curSrc=null; resolve(); };
    });
  }
  function drain(){
    if(queue.length){ playing=true; const t=queue.shift(); playOne(t).then(drain); }
    else { playing=false; window.ORB?.amp(0.05); window.ORB?.set('idle'); idleWaiters.splice(0).forEach(r=>r()); }
  }
  function enqueueSpeak(text){
    if(!inTauri() || !text || !text.trim()) return;
    queue.push(text.trim());
    if(!playing) drain();
  }
  // resolves when the queue has fully drained (used to resume listening)
  function whenIdle(){
    return new Promise(res=>{ if(!playing && queue.length===0) res(); else idleWaiters.push(res); });
  }
  // one-shot convenience: speak text then resolve when done
  function speak(text){ enqueueSpeak(text); return whenIdle(); }

  window.VOICE = {
    inTauri, startListening, pause, resume, stopListening, stopPlayback,
    speak, enqueueSpeak, whenIdle,
    get listening(){ return listening; },
    get speaking(){ return playing; },
    get active(){ return listening || playing || !!curSrc; }
  };
})();
