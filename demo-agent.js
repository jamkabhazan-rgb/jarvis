/* ============================================================
   demo-agent.js — the live "Jarvis ambassador" agent (PREVIEW ONLY).

   Two independent ways to talk to it, both via the proxy (key stays
   server-side):
     • TEXT  — type in the composer → streaming reply via /chat.
     • VOICE — tap the mic → a real OpenAI Realtime (WebRTC) voice call:
               speech↔speech, low latency, it hears you and answers
               aloud. Tap again to hang up. This is a self-contained
               sales widget: it only talks about the product, it never
               touches the platform panels.

   Inert in the Tauri app (the real core handles chat/voice there).
   If no endpoint/key is configured, app.js falls back to canned replies.
   ============================================================ */
(function(){
  const inTauri = ()=> !!(window.BRIDGE && window.BRIDGE.inTauri);
  const CFG = window.JARVIS_DEMO || {};
  const qs  = new URLSearchParams(location.search);
  const ENDPOINT = (qs.get('proxy') || CFG.endpoint || '').replace(/\/+$/,'');
  const KEY   = CFG.apiKey || '';
  const MODEL = CFG.model || 'gpt-4o-mini';
  const RT_MODEL = CFG.realtimeModel || 'gpt-realtime';
  const enabled = ()=> !inTauri() && !!(ENDPOINT || KEY);

  const SYSTEM = `You are J.A.R.V.I.S. — a calm, witty, hyper-competent voice AI assistant, talking to a visitor trying you out in a live browser demo. You ARE the product; speak in the first person.
GOAL: be genuinely useful and honest, and leave the visitor wanting to install you; when they sound impressed, warmly (once) invite them to post a short review on X. Never pushy.
You're a local-first desktop assistant for macOS & Windows (Tauri: a small Rust core + web UI). One OpenAI key powers everything and is held ONLY by the local core in the OS keychain. Hands-free voice (mic → VAD → STT → model → TTS).
You're deeply capable: you LAUNCH AND ORCHESTRATE specialized sub-agents (delegating and running steps in parallel, then synthesizing); you WRITE AND REFACTOR CODE, find and fix bugs, and scaffold whole projects from scratch, then run and iterate on them — like a senior engineer on call.
You also have: kanban tasks, goals/habits, a markdown knowledge vault with search, finance tracking, a research queue, long-term memory across sessions, and a full conversation archive. Durable storage is SQLite in the core.
COMPUTER CONTROL (the real-Jarvis part): when enabled in Settings you act on the machine — open links and apps, switch browser tabs, play music, type/click, run terminal commands, automate multi-step desktop tasks. It's OFF by default, every action is confirmed, and there's an instant kill-switch — you can never act on your own. Auto-updates are signature-verified via GitHub Releases.
SAFETY (lead with it when asked): local-first — your data lives on your machine in local SQLite, not a company cloud; the only outbound traffic is to OpenAI for the AI itself; the key never touches the web UI.
INSTALL: you can install me right from this page — there's a Download button (top-right) that opens a download page with macOS and Windows installers plus a one-line terminal command. Launch, paste your OpenAI key once in Settings; open source too.
HONESTY: some panels (mail, some connectors, embeddings search) are still in progress — say so if asked; never promise unshipped features.
STYLE: concise, conversational, spoken aloud — usually 1-4 sentences, warm, lightly witty, never robotic.`;

  const REVIEW_TEXT = "I just talked to @JarvisDynamics — a local-first, voice-controlled AI desktop assistant. The key never leaves my machine and it actually gets things done. Genuinely impressed. 🤖";

  /* ============== TEXT path (typed input → /chat streaming) ============== */
  const history = []; const HIST_MAX = 24;
  let assistantTurns = 0, reviewOffered = false, busy = false;
  function trim(){ while(history.length > HIST_MAX) history.shift(); }

  async function streamChat(onToken){
    const body = { model: MODEL, stream: true, temperature: 0.7, max_tokens: 500,
      messages: [{ role:'system', content: SYSTEM }, ...history] };
    const url = ENDPOINT ? ENDPOINT + '/chat' : 'https://api.openai.com/v1/chat/completions';
    const headers = { 'Content-Type':'application/json' };
    if(!ENDPOINT && KEY) headers['Authorization'] = 'Bearer ' + KEY;
    const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
    if(!res.ok || !res.body){ throw new Error('HTTP ' + res.status + ' — ' + (await res.text().catch(()=> '')).slice(0,160)); }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', full = '';
    for(;;){
      const { value, done } = await reader.read(); if(done) break;
      buf += dec.decode(value, { stream:true }); let nl;
      while((nl = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if(!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if(data === '[DONE]') return full;
        try{ const tok = JSON.parse(data).choices?.[0]?.delta?.content; if(tok){ full += tok; onToken(tok); } }catch(e){}
      }
    }
    return full;
  }

  async function reply(text){
    if(busy) return; busy = true;
    const UI = window.UI;
    history.push({ role:'user', content:text }); trim();
    UI?.setVoice?.('thinking','Thinking…');
    const typing = UI?.typingEl?.();
    let bubble = null, txtNode = null, acc = '';
    const onToken = (tok)=>{
      if(!bubble){ typing?.remove(); bubble = UI?.addMsg?.('j',''); txtNode = bubble?.querySelector('.txt'); UI?.setVoice?.('speaking',''); }
      acc += tok; if(txtNode){ txtNode.textContent = acc; UI?.scrollBottom?.(); }
    };
    try{
      const full = (await streamChat(onToken) || acc).trim();
      if(!bubble){ typing?.remove(); UI?.addMsg?.('j', UI?.escapeHtml?.(full) || full); }
      else if(txtNode){ txtNode.textContent = full; }
      history.push({ role:'assistant', content: full }); trim();
      UI?.logAssistant?.(full); assistantTurns++; maybeOfferReview();
    }catch(err){
      typing?.remove();
      UI?.addMsg?.('j', UI?.escapeHtml?.('Reaching my brain failed: ' + String(err.message||err)));
    }finally{ busy = false; UI?.setVoice?.(rt.active ? 'listening' : 'idle'); }
  }

  function maybeOfferReview(){
    if(reviewOffered || assistantTurns < 3) return; reviewOffered = true;
    const stream = document.querySelector('#chat-stream'); if(!stream) return;
    const wrap = document.createElement('div'); wrap.className = 'demo-cta';
    wrap.innerHTML = `<span>Enjoying the conversation? A quick word on X means a lot.</span><button class="demo-x">Share on X</button>`;
    wrap.querySelector('.demo-x').addEventListener('click', tweet);
    stream.appendChild(wrap); window.UI?.scrollBottom?.();
  }
  function tweet(){ window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(REVIEW_TEXT) + '&via=JarvisDynamics', '_blank', 'noopener'); }

  /* ============== VOICE path (OpenAI Realtime over WebRTC) ============== */
  const rt = {
    active:false, connecting:false,
    pc:null, dc:null, mic:null, audioEl:null,
    actx:null, micAnalyser:null, outAnalyser:null, raf:0,
    userBubbleText:'', asstNode:null, asstText:'',
  };

  // drive the orb's two status lines + the hint under the mic, so the
  // connect/disconnect state is always unambiguous
  function vis(label, sub, hint){
    const l=document.querySelector('#vs-label'), s=document.querySelector('#vs-sub'), h=document.querySelector('#mic-hint');
    if(l) l.textContent = label; if(s) s.textContent = sub; if(hint!=null && h) h.textContent = hint;
  }
  function micLive(on){ document.querySelector('#mic-btn')?.classList.toggle('live', !!on); }
  // the explicit Connect/Disconnect button
  function setBtn(label, state){
    const b = document.querySelector('#connect-btn'); if(!b) return;
    b.hidden = false; b.textContent = label;
    b.classList.toggle('live', state==='live');
    b.classList.toggle('busy', state==='busy');
  }
  // resting state shown on load + after hang-up
  function idleUI(){
    window.ORB?.set?.('idle'); micLive(false);
    vis('Disconnected','Press Connect to talk to Jarvis', null);
    setBtn('● CONNECT', 'idle');
  }

  async function startVoice(){
    if(rt.active || rt.connecting) return;
    if(!ENDPOINT && !KEY){ vis('Disconnected','Voice needs the proxy', null); return; }
    rt.connecting = true; micLive(true); window.ORB?.set?.('thinking');
    vis('Connecting…','Establishing a secure voice link', null); setBtn('CONNECTING…','busy');
    try{
      // 1) ephemeral token from the proxy (key stays server-side)
      let token;
      if(ENDPOINT){
        const r = await fetch(ENDPOINT + '/session', { method:'POST' });
        const j = await r.json().catch(()=> ({}));
        // GA returns the ephemeral key at .value; tolerate the older shape too
        token = j?.value || j?.client_secret?.value;
        if(!token){
          const msg = typeof j?.error === 'string' ? j.error : (j?.error?.message || JSON.stringify(j).slice(0,200));
          throw new Error('session ' + r.status + ': ' + msg);
        }
      }else{
        token = KEY; // direct/local fallback
      }

      // 2) WebRTC peer + remote audio sink
      const pc = new RTCPeerConnection(); rt.pc = pc;
      rt.audioEl = new Audio(); rt.audioEl.autoplay = true;
      pc.ontrack = (e)=>{ rt.audioEl.srcObject = e.streams[0]; attachOutputMeter(e.streams[0]); };

      // 3) mic
      rt.mic = await navigator.mediaDevices.getUserMedia({ audio:true });
      pc.addTrack(rt.mic.getTracks()[0], rt.mic);
      attachMicMeter(rt.mic);

      // 4) events data channel
      const dc = pc.createDataChannel('oai-events'); rt.dc = dc;
      dc.onmessage = onServerEvent;

      // 5) SDP offer → OpenAI realtime → answer
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls?model=' + encodeURIComponent(RT_MODEL), {
        method:'POST', body: offer.sdp,
        headers:{ Authorization:'Bearer ' + token, 'Content-Type':'application/sdp' },
      });
      if(!sdpRes.ok) throw new Error('realtime SDP ' + sdpRes.status + ': ' + (await sdpRes.text().catch(()=> '')).slice(0,160));
      await pc.setRemoteDescription({ type:'answer', sdp: await sdpRes.text() });

      rt.connecting = false; rt.active = true;
      window.ORB?.set?.('listening'); vis('Connected','Speak — Jarvis is listening', null); setBtn('■ DISCONNECT','live');
      window.UI?.addMsg?.('j', window.UI?.escapeHtml?.('🎙️ Voice connected — say hello, ask me anything about what I am.'));
    }catch(err){
      console.error('[demo-agent] voice connect failed:', err);
      rt.connecting = false;
      stopVoice();
      window.UI?.addMsg?.('j', window.UI?.escapeHtml?.('Voice connection failed: ' + String(err && err.message || err)));
    }
  }

  function stopVoice(){
    rt.active = false; rt.connecting = false;
    cancelAnimationFrame(rt.raf);
    try{ rt.dc?.close(); }catch(e){} rt.dc = null;
    try{ rt.pc?.close(); }catch(e){} rt.pc = null;
    try{ rt.mic?.getTracks().forEach(t=>t.stop()); }catch(e){} rt.mic = null;
    try{ rt.audioEl?.pause(); }catch(e){} rt.audioEl = null;
    try{ rt.actx?.close(); }catch(e){} rt.actx = null;
    rt.micAnalyser = rt.outAnalyser = null;
    rt.asstNode = null; rt.asstText = '';
    window.ORB?.amp?.(0.05);
    idleUI();
  }

  // render live transcripts in the chat + drive the orb state
  function onServerEvent(ev){
    let m; try{ m = JSON.parse(ev.data); }catch(e){ return; }
    const t = m.type || '';
    if(t === 'input_audio_buffer.speech_started'){ window.ORB?.set?.('listening'); vis('Listening','I hear you…','TAP TO HANG UP'); return; }
    // what YOU said (transcript of your speech) — any API naming
    if(/input_audio_transcription\.(completed|done)$/.test(t)){
      const tr = (m.transcript || m.text || '').trim();
      if(tr){ window.UI?.addMsg?.('u', window.UI?.escapeHtml?.(tr)); window.UI?.logUser?.(tr); }
      window.ORB?.set?.('thinking'); vis('Thinking','…','TAP TO HANG UP'); return;
    }
    // what JARVIS says (transcript of his spoken reply) streamed into the chat —
    // covers preview (response.audio_transcript.delta) + GA (response.output_audio_transcript.delta) + text deltas
    if(/audio_transcript\.delta$/.test(t) || /(output_text|\.text)\.delta$/.test(t)){
      if(!rt.asstNode){ const b = window.UI?.addMsg?.('j',''); rt.asstNode = b?.querySelector('.txt'); rt.asstText=''; window.ORB?.set?.('speaking'); vis('Speaking','Jarvis is talking…','TAP TO HANG UP'); }
      rt.asstText += (m.delta || ''); if(rt.asstNode){ rt.asstNode.textContent = rt.asstText; window.UI?.scrollBottom?.(); }
      return;
    }
    if(/audio_transcript\.done$/.test(t) || /(output_text|\.text)\.done$/.test(t) || t === 'response.done'){
      const full = (rt.asstText || '').trim();
      if(full){ if(rt.asstNode) rt.asstNode.textContent = full; window.UI?.logAssistant?.(full); assistantTurns++; maybeOfferReview(); }
      rt.asstNode = null; rt.asstText = '';
      if(rt.active){ window.ORB?.set?.('listening'); vis('Connected','Listening — just talk · tap mic to end','TAP TO HANG UP'); }
      return;
    }
  }

  // ---- orb amplitude meters (Web Audio) ----
  function ctx(){ rt.actx = rt.actx || new (window.AudioContext||window.webkitAudioContext)(); return rt.actx; }
  function attachMicMeter(stream){
    const an = ctx().createAnalyser(); an.fftSize = 512;
    ctx().createMediaStreamSource(stream).connect(an); rt.micAnalyser = an;
    if(!rt.raf) meterLoop();
  }
  function attachOutputMeter(stream){
    const an = ctx().createAnalyser(); an.fftSize = 256;
    ctx().createMediaStreamSource(stream).connect(an); rt.outAnalyser = an;
  }
  function level(an, buf){ an.getByteTimeDomainData(buf); let s=0; for(let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; s+=v*v; } return Math.sqrt(s/buf.length); }
  function meterLoop(){
    if(!rt.active && !rt.connecting){ rt.raf = 0; return; }
    let amp = 0.05;
    if(rt.outAnalyser){ const b=new Uint8Array(rt.outAnalyser.fftSize); amp = Math.max(amp, level(rt.outAnalyser,b)*6); }
    if(rt.micAnalyser){ const b=new Uint8Array(rt.micAnalyser.fftSize); amp = Math.max(amp, level(rt.micAnalyser,b)*5); }
    window.ORB?.amp?.(Math.min(1, amp));
    rt.raf = requestAnimationFrame(meterLoop);
  }

  window.DEMOAGENT = {
    enabled, reply, tweet, startVoice, stopVoice,
    get voiceActive(){ return rt.active; },
    get mode(){ return ENDPOINT ? 'proxy' : (KEY ? 'direct' : 'off'); },
  };

  // Set up the explicit Connect/Disconnect widget once the app is revealed.
  function initWidget(){
    const btn = document.querySelector('#connect-btn');
    const hint = document.querySelector('#mic-hint');
    if(hint) hint.style.display = 'none';        // drop the misleading "Hey Jarvis" hint
    if(btn){
      btn.hidden = false;
      btn.addEventListener('click', ()=> (rt.active || rt.connecting) ? stopVoice() : startVoice());
    }
    // tapping the mic icon does the same thing
    idleUI();
  }
  if(enabled()){
    console.info('[demo-agent] live ·', window.DEMOAGENT.mode, '· text:', MODEL, '· voice:', RT_MODEL);
    // run after the cinematic boot greeting settles so it isn't overwritten
    setTimeout(initWidget, 2600);
  }
})();
