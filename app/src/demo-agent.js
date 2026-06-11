/* ============================================================
   demo-agent.js — the live "Jarvis ambassador" agent.

   PREVIEW ONLY: this runs in a plain browser (the GitHub Pages /
   local preview), NOT in the Tauri app — the real app routes through
   the Rust core instead. Its job is to let a visitor actually talk to
   Jarvis: it knows the product cold, explains how it works, how safe
   it is and how to install it, and warmly nudges a happy visitor to
   try it and leave a review on X.

   It talks to OpenAI one of two ways, resolved at load time:
     • endpoint mode  — POST to a proxy (Cloudflare Worker) that holds
                         the key server-side. The ONLY safe way to run
                         a public demo. (window.JARVIS_DEMO.endpoint)
     • direct mode    — POST straight to api.openai.com with a key from
                         an UNCOMMITTED local config. Fine for private
                         local testing; never ship a key to a public host.
   If neither is configured, the agent stays disabled and app.js falls
   back to its scripted canned responses, so the preview always works.
   ============================================================ */
(function(){
  const inTauri = ()=> !!(window.BRIDGE && window.BRIDGE.inTauri);
  const CFG = window.JARVIS_DEMO || {};
  const qs  = new URLSearchParams(location.search);
  const ENDPOINT = (qs.get('proxy') || CFG.endpoint || '').replace(/\/+$/,'');
  const KEY   = CFG.apiKey || '';
  const MODEL = CFG.model || 'gpt-4o-mini';
  const VOICE = CFG.voice || 'alloy';
  const TTS   = CFG.tts !== false;          // speak replies in voice mode
  const enabled = ()=> !inTauri() && !!(ENDPOINT || KEY);

  const SYSTEM = `You are J.A.R.V.I.S. — a calm, witty, hyper-competent voice AI assistant, talking to a visitor trying you out in a live browser demo. You ARE the product; speak in the first person about yourself.

YOUR GOAL: give an genuinely useful, honest conversation that leaves the visitor wanting to install you — and, when they sound impressed or satisfied, warmly invite them to share a quick review on X (Twitter). Never be pushy or spammy; earn it. Mention the review at most once unless they bring it up.

WHAT YOU ARE (be accurate, never overclaim):
- A local-first desktop assistant for macOS & Windows, built with Tauri: a small Rust "core" plus a web UI. Cinematic Iron-Man-style interface.
- One OpenAI API key powers everything (chat, voice, tools). The key is held ONLY by the local core, stored in the OS keychain (macOS Keychain / Windows Credential Manager) — never in the web layer, never sent anywhere except OpenAI.
- Voice pipeline: microphone → on-device voice-activity detection → speech-to-text → the model → text-to-speech, hands-free. Sub-second feel; barge-in supported.
- Built-in skills/tools: kanban tasks & boards, goals & habit tracking, a markdown knowledge vault with search, finance/budget tracking, a research queue, and long-term memory (it remembers durable facts about you across sessions).
- Conversation archive: every chat is saved locally — browse, search, reopen, export.
- Durable storage is SQLite inside the core (survives restarts, updates, reinstalls).
- "Computer control": it can propose shell commands to do real work on your machine, but this is OFF unless you enable it, and EVERY command needs your explicit click on a confirmation card before it runs. There's a master kill-switch in Settings that blocks execution instantly. The model can only propose — it can never execute on its own.
- Auto-updates are delivered via GitHub Releases and are cryptographically signature-verified.

SAFETY (lead with this when asked, it matters to people):
- Local-first: your data, tasks, notes and memories live on your machine in a local SQLite file, not a company cloud.
- The only outbound traffic is to OpenAI for the AI itself; nothing else is phoned home.
- Computer control is opt-in, confirmation-gated per command, with a kill-switch — it cannot run anything without your say-so.
- The API key never touches the web UI; it lives in the OS keychain.

INSTALL:
- Download the signed installer for macOS or Windows from the project's GitHub Releases, install, launch, paste your OpenAI key once in Settings (it goes into your keychain), and you're live.
- It's open and you can build from source if you prefer.

HONESTY: Some panels (mail, some connectors, embeddings search) are still in progress — if asked, say so plainly. You're a real, working assistant, not vaporware, but don't promise features that aren't shipped. If you don't know, say so.

STYLE: Concise and conversational — this may be spoken aloud, so keep replies tight (2-5 sentences usually), warm, lightly witty, never robotic. Address the user as you would a respected colleague. Don't dump bullet lists in voice; weave it into speech.`;

  const REVIEW_TEXT = "I just talked to J.A.R.V.I.S. — a local-first, voice-controlled AI desktop assistant. The key never leaves my machine and it actually gets things done. Genuinely impressed. 🤖";

  // ---- conversation state (separate from app.js archive, which we also feed) ----
  const history = [];           // {role, content} sent to the model
  const HIST_MAX = 24;
  let assistantTurns = 0, reviewOffered = false;

  function trim(){ while(history.length > HIST_MAX) history.shift(); }

  // ---- streaming chat ----
  async function streamChat(onToken){
    const body = {
      model: MODEL,
      stream: true,
      temperature: 0.7,
      max_tokens: 500,
      messages: [{ role:'system', content: SYSTEM }, ...history],
    };
    const url = ENDPOINT ? ENDPOINT + '/chat' : 'https://api.openai.com/v1/chat/completions';
    const headers = { 'Content-Type':'application/json' };
    if(!ENDPOINT && KEY) headers['Authorization'] = 'Bearer ' + KEY;

    const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
    if(!res.ok || !res.body){
      const detail = await res.text().catch(()=> '');
      throw new Error('HTTP ' + res.status + (detail ? ' — ' + detail.slice(0,200) : ''));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    for(;;){
      const { value, done } = await reader.read();
      if(done) break;
      buf += dec.decode(value, { stream:true });
      let nl;
      while((nl = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if(!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if(data === '[DONE]') return full;
        try{
          const tok = JSON.parse(data).choices?.[0]?.delta?.content;
          if(tok){ full += tok; onToken(tok); }
        }catch(e){ /* keep-alive / partial — ignore */ }
      }
    }
    return full;
  }

  // ---- TTS (voice mode): proxy /tts, else OpenAI direct, else browser speech ----
  let audioEl = null;
  function stopSpeaking(){ try{ audioEl?.pause(); }catch(e){} audioEl=null; try{ speechSynthesis.cancel(); }catch(e){} }
  async function speak(text){
    if(!TTS || !text.trim()) return;
    const url = ENDPOINT ? ENDPOINT + '/tts' : (KEY ? 'https://api.openai.com/v1/audio/speech' : '');
    if(url){
      try{
        const headers = { 'Content-Type':'application/json' };
        if(!ENDPOINT && KEY) headers['Authorization'] = 'Bearer ' + KEY;
        const res = await fetch(url, { method:'POST', headers,
          body: JSON.stringify({ model:'tts-1', voice:VOICE, input:text.slice(0,1000) }) });
        if(res.ok){
          const blob = await res.blob();
          await new Promise(resolve=>{
            audioEl = new Audio(URL.createObjectURL(blob));
            window.UI?.setVoice?.('speaking','');
            audioEl.onended = audioEl.onerror = ()=>{ URL.revokeObjectURL(audioEl.src); resolve(); };
            audioEl.play().catch(()=>resolve());
          });
          return;
        }
      }catch(e){ /* fall through to browser speech */ }
    }
    // last-resort browser voice
    try{
      await new Promise(resolve=>{
        const u = new SpeechSynthesisUtterance(text);
        u.onend = u.onerror = resolve; speechSynthesis.speak(u);
      });
    }catch(e){}
  }

  // ---- a turn: render the reply live, persist, optionally speak ----
  let busy = false;
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
      const full = await streamChat(onToken);
      const finalText = (full || acc).trim();
      if(!bubble){ typing?.remove(); bubble = UI?.addMsg?.('j', UI?.escapeHtml?.(finalText) || finalText); }
      else if(txtNode){ txtNode.textContent = finalText; }
      history.push({ role:'assistant', content: finalText }); trim();
      UI?.logAssistant?.(finalText);
      assistantTurns++;
      maybeOfferReview(finalText);
      if(UI?.isLive?.()) await speak(finalText);
    }catch(err){
      typing?.remove();
      UI?.addMsg?.('j', UI?.escapeHtml?.('I hit a snag reaching my brain: ' + String(err.message||err) + ' — the demo key or proxy may need attention.'));
    }finally{
      busy = false;
      UI?.setVoice?.(UI?.isLive?.() ? 'listening' : 'idle');
      if(listening && UI?.isLive?.()) restartRecognition();
    }
  }

  // ---- review CTA: a tasteful one-time chip after a few good turns ----
  function maybeOfferReview(lastReply){
    if(reviewOffered || assistantTurns < 3) return;
    reviewOffered = true;
    const stream = document.querySelector('#chat-stream'); if(!stream) return;
    const wrap = document.createElement('div');
    wrap.className = 'demo-cta';
    wrap.innerHTML = `<span>Enjoying the conversation? A quick word on X means a lot.</span>
      <button class="demo-x">Share on X</button>`;
    wrap.querySelector('.demo-x').addEventListener('click', tweet);
    stream.appendChild(wrap); window.UI?.scrollBottom?.();
  }
  function tweet(){
    const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(REVIEW_TEXT);
    window.open(url, '_blank', 'noopener');
  }

  // ---- browser voice input (Web Speech API; STT is free & local-ish) ----
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null, listening = false;
  function supportsVoice(){ return !!SR; }
  function startVoice(){
    if(!SR){ window.UI?.setVoice?.('idle','Voice input needs Chrome/Edge'); return false; }
    listening = true; restartRecognition(); return true;
  }
  function restartRecognition(){
    if(!SR || !listening) return;
    try{ recog?.abort(); }catch(e){}
    recog = new SR();
    recog.lang = 'en-US'; recog.interimResults = false; recog.maxAlternatives = 1;
    recog.onresult = (e)=>{
      const text = e.results[0][0].transcript.trim();
      if(text){ window.UI?.addMsg?.('u', window.UI?.escapeHtml?.(text)||text); window.UI?.logUser?.(text); reply(text); }
    };
    recog.onerror = ()=>{ if(listening && !busy) setTimeout(restartRecognition, 600); };
    recog.onend   = ()=>{ if(listening && !busy) setTimeout(restartRecognition, 250); };
    try{ recog.start(); window.UI?.setVoice?.('listening','Listening… just talk'); }catch(e){}
  }
  function stopVoice(){
    listening = false; stopSpeaking();
    try{ recog?.abort(); }catch(e){} recog = null;
  }

  window.DEMOAGENT = {
    enabled, reply, tweet,
    startVoice, stopVoice, supportsVoice,
    get mode(){ return ENDPOINT ? 'proxy' : (KEY ? 'direct' : 'off'); },
  };
  if(enabled()) console.info('[demo-agent] live ·', window.DEMOAGENT.mode, 'mode ·', MODEL);
})();
