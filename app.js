/* ============================================================
   app.js — main interface: tabs, panels, chat, voice states
   ============================================================ */
(function(){
  const A = window.JAUDIO;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Inject button colours from JS (always loaded fresh via ?v=), so the
  // active VOICE/CHAT toggle, the header DOWNLOAD button and the in-page
  // Download buttons are the identical bright-cyan gradient even if a stale
  // stylesheet is cached.
  (function(){
    const s = document.createElement('style');
    s.textContent =
      '.mode-toggle button.active{background:linear-gradient(180deg,#7fe9ff,#00c4ff)!important;color:#001018!important;box-shadow:0 0 18px rgba(0,212,255,.5)!important}'+
      '.download-btn,.dl-btn{background:linear-gradient(180deg,#7fe9ff,#00c4ff)!important;color:#001018!important}';
    document.head.appendChild(s);
  })();

  /* ---------- voice state machine ---------- */
  const VS = {
    idle:      { label:'Standby',   sub:'Say “Hey Jarvis” or press the mic' },
    listening: { label:'Listening', sub:'Go ahead, I’m listening…' },
    thinking:  { label:'Thinking',  sub:'Routing through tools…' },
    speaking:  { label:'Speaking',  sub:'' },
  };
  let voiceMode='idle', live=false, waveTimer=null;

  function setVoice(mode, sub){
    voiceMode=mode;
    window.ORB?.set(mode);
    $('#vs-label').textContent = VS[mode].label;
    $('#vs-sub').textContent = sub ?? VS[mode].sub;
  }

  // fake amplitude feed to orb + wave bars
  const bars = $$('#wave .bar');
  function tickWave(){
    let amp = 0;
    if(voiceMode==='listening') amp = 0.2+Math.random()*0.5;
    else if(voiceMode==='speaking') amp = 0.3+Math.random()*0.6;
    else if(voiceMode==='thinking') amp = 0.15+Math.random()*0.2;
    else amp = 0.05+Math.random()*0.05;
    // in the Tauri voice loop the orb is driven by real mic/TTS amplitude
    if(!(window.VOICE && window.VOICE.active)) window.ORB?.amp(amp);
    bars.forEach((b,i)=>{
      const f = Math.sin(Date.now()/120 + i*0.7)*0.5+0.5;
      b.style.height = (6 + amp*f*26) + 'px';
      b.style.opacity = 0.4 + amp*f*0.6;
    });
  }
  waveTimer = setInterval(tickWave, 70);

  function toggleMic(){
    live = !live;
    const btn=$('#mic-btn');
    btn.classList.toggle('live', live);
    $$('.mode-toggle button').forEach(x=>x.classList.toggle('active', x.textContent.trim()==='VOICE'));

    // Hands-free voice loop in the Tauri app: VAD auto-ends each turn
    if(window.VOICE && window.VOICE.inTauri()){
      window.VOICE.stopPlayback();          // barge-in: cut any TTS in progress
      if(live){
        setVoice('listening','Listening… just talk');
        window.VOICE.startListening(onVoiceUtterance)
          .catch(()=>{ live=false; btn.classList.remove('live'); setVoice('idle','Mic unavailable'); });
      } else {
        window.VOICE.stopListening(); setVoice('idle');
      }
      return;
    }

    // browser preview with the live agent: real Web-Speech mic loop
    if(window.DEMOAGENT && window.DEMOAGENT.enabled()){
      if(live){ A.SFX.listen(); window.DEMOAGENT.startVoice(); }
      else { A.SFX.off(); window.DEMOAGENT.stopVoice(); setVoice('idle'); }
      return;
    }

    // browser fallback (no core): the original simulated behavior
    if(live){ A.SFX.listen(); setVoice('listening'); }
    else { A.SFX.off(); setVoice('idle'); }
  }

  /* ---------- chat ---------- */
  const stream = $('#chat-stream');
  function scrollBottom(){ stream.scrollTop = stream.scrollHeight; }

  function msgEl(who, html){
    const el=document.createElement('div');
    el.className='msg '+(who==='j'?'j':'u');
    el.innerHTML = `
      <div class="av">${who==='j'?'J':'YOU'}</div>
      <div class="body">
        <div class="who">${who==='j'?'JARVIS':'You'}</div>
        <div class="txt">${html}</div>
      </div>`;
    return el;
  }
  function addMsg(who, html){ const e=msgEl(who,html); stream.appendChild(e); scrollBottom(); return e; }

  function typingEl(){
    const el=document.createElement('div');
    el.className='msg j'; el.dataset.typing='1';
    el.innerHTML=`<div class="av">J</div><div class="body"><div class="who">JARVIS</div><div class="typing"><span></span><span></span><span></span></div></div>`;
    stream.appendChild(el); scrollBottom(); return el;
  }

  // scripted responses w/ tool-calls
  const RESPONSES = [
    { match:/task|todo|задач|remind|напомн/i,
      tool:{name:'task_add', body:'title: "Review Mark VII telemetry"\ndue: 2026-06-09  ::  created'},
      say:'Done — I’ve added that to your board and set a reminder for tomorrow morning.' },
    { match:/mail|email|почт|inbox/i,
      tool:{name:'mail_triage', body:'scanned 23 unread → 3 priority, 1 draft prepared'},
      say:'You have 3 messages that need a reply. I’ve drafted a response to Pepper — want me to read it back?' },
    { match:/research|find|search|ресёрч|look up|читать/i,
      tool:{name:'research_query', body:'web_search + summarize → 5 sources queued to reading list'},
      say:'I pulled five sources and summarized the key findings. The top result covers exactly what you asked about.' },
    { match:/finance|budget|spend|money|финанс|расход/i,
      tool:{name:'finance_summary', body:'period: June → net +$4,210 · burn 38%'},
      say:'You’re running 38% of this month’s budget with two weeks left. Cash flow is positive.' },
    { match:/weather|time|status|систем|status/i, tool:null,
      say:'All systems nominal. Voice pipeline is local, latency under 400 milliseconds, and nothing is leaving this device.' },
  ];
  const DEFAULT_SAY = 'Understood. I’m running everything locally — give me a task, a question, or just talk.';

  /* ---------- core-backed chat (Tauri): stream via events ---------- */
  let coreBubble=null, coreTyping=null, coreReply='', voiceTurn=false, ttsBuf='';
  // rolling conversation memory sent to the core each turn (capped)
  const convo=[]; const CONVO_MAX=20;
  function rememberUser(text){ convo.push({role:'user', content:text}); }
  function rememberAssistant(text){ if(text && text.trim()) convo.push({role:'assistant', content:text.trim()});
    while(convo.length>CONVO_MAX) convo.shift(); }

  /* ---------- conversation archive (full transcripts, persisted) ---------- */
  let sessionId=null;
  function chatlog(){ return STORE.load('chatlog', []) || []; }
  function saveChatlog(l){ STORE.save('chatlog', l); }
  function logUser(text){
    const l=chatlog(); let s=l.find(x=>x.id===sessionId);
    if(!s){ sessionId='c'+Date.now(); s={ id:sessionId, title:text.slice(0,52), started:Date.now(), updated:Date.now(), msgs:[] }; l.push(s); }
    s.msgs.push({role:'user', content:text}); s.updated=Date.now();
    saveChatlog(l);
  }
  function logAssistant(text){
    if(!text||!text.trim()) return;
    const l=chatlog(); const s=l.find(x=>x.id===sessionId); if(!s) return;
    s.msgs.push({role:'assistant', content:text.trim()}); s.updated=Date.now();
    saveChatlog(l);
  }
  function newConversation(){ sessionId=null; convo.length=0; stream.innerHTML=''; A.SFX.blip(); }
  function openSession(id){
    const s=chatlog().find(x=>x.id===id); if(!s) return;
    sessionId=id; stream.innerHTML=''; convo.length=0;
    s.msgs.forEach(m=>{ addMsg(m.role==='user'?'u':'j', escapeHtml(m.content)); convo.push({role:m.role, content:m.content}); });
    while(convo.length>CONVO_MAX) convo.shift();
    closeHistory();
    // make sure we're on the chat tab
    document.querySelector('.tab[data-tab="chat"]')?.click();
  }
  // push completed sentences to the TTS queue as tokens stream in
  function flushSentences(){
    const re=/[^.!?…\n]*[.!?…\n]+/g; let m, consumed=0;
    while((m=re.exec(ttsBuf))!==null){ const s=m[0].trim(); if(s) window.VOICE?.enqueueSpeak(s); consumed=re.lastIndex; }
    if(consumed) ttsBuf = ttsBuf.slice(consumed);
  }
  async function initCore(){
    if(!(window.BRIDGE && window.BRIDGE.inTauri)) return;
    await BRIDGE.listen('chat_token', tok=>{
      if(coreTyping){ coreTyping.remove(); coreTyping=null; }
      if(!coreBubble){ const e=addMsg('j',''); coreBubble=e.querySelector('.txt'); setVoice('speaking',''); }
      coreBubble.textContent += tok; coreReply += tok; scrollBottom();
      if(voiceTurn){ ttsBuf += tok; flushSentences(); }
    });
    await BRIDGE.listen('chat_done', ()=>{
      rememberAssistant(coreReply); logAssistant(coreReply);
      coreBubble=null; coreReply='';
      if(voiceTurn){
        voiceTurn=false;
        if(ttsBuf.trim()) window.VOICE?.enqueueSpeak(ttsBuf.trim());
        ttsBuf='';
        window.VOICE?.whenIdle().then(()=>{
          if(live && window.VOICE?.inTauri()){ setVoice('listening'); window.VOICE.resume(); }
          else setVoice('idle');
        });
      } else {
        setVoice(live?'listening':'idle');
      }
    });
    await BRIDGE.listen('chat_tool_call', tc=>{
      if(coreTyping){ coreTyping.remove(); coreTyping=null; }
      coreBubble=null; // next chat_token starts a fresh reply bubble
      if(tc.name==='computer_run'){ renderSysConfirm(tc.args||{}); return; } // approval card, not auto-applied
      renderToolCard(tc);
      try{ window.JTOOLS && window.JTOOLS[tc.name] && window.JTOOLS[tc.name](tc.args||{}); }catch(e){ console.warn('tool apply failed', e); }
    });
  }
  // computer_run proposal → confirmation card (spec §17). Nothing executes
  // until the user clicks RUN; the result and an audit-log entry follow.
  function renderSysConfirm(args){
    const cmd = String(args.command||'').trim();
    const why = String(args.why||'').trim();
    if(!cmd) return;
    const el = document.createElement('div'); el.className='msg j';
    el.innerHTML = `<div class="av">J</div><div class="body"><div class="who">JARVIS</div><div class="txt">
      <div class="tool-call sys-card"><div class="tc-head">⌘ computer · approval required</div><div class="tc-body">
        <div class="sc-cmd">${escapeHtml(cmd)}</div>
        ${why?`<div class="sc-why">${escapeHtml(why)}</div>`:''}
        <div class="sc-actions"><button class="btn primary sc-run">RUN</button><button class="btn ghost sc-deny">CANCEL</button></div>
      </div></div></div></div>`;
    stream.appendChild(el); scrollBottom();
    const body = el.querySelector('.tc-body');
    const runBtn = el.querySelector('.sc-run'), denyBtn = el.querySelector('.sc-deny');
    const finish = (cls, text)=>{
      el.querySelector('.sc-actions')?.remove();
      const s = document.createElement('div'); s.className='sc-status '+cls; s.textContent=text;
      body.appendChild(s); scrollBottom();
    };
    const logEntry = (entry)=>{
      try{
        const log = STORE.load('syslog', []) || [];
        log.push(entry); while(log.length>100) log.shift();
        STORE.save('syslog', log);
        window.JSYS?.renderSysLog();
      }catch(e){}
    };
    const now = ()=> new Date().toLocaleString();
    denyBtn.addEventListener('click', ()=>{
      finish('deny','✕ DENIED — not executed');
      logEntry({ ts:now(), cmd, status:'denied' });
      A.SFX.off();
    });
    runBtn.addEventListener('click', async ()=>{
      runBtn.disabled = denyBtn.disabled = true; runBtn.textContent = 'RUNNING…';
      try{
        const r = await BRIDGE.invoke('system_execute', { command: cmd });
        const out = [r.stdout, r.stderr].filter(s=>s && s.trim()).join('\n').trim();
        // insert command output above the action buttons before finish() clears them
        if(out){ const pre=document.createElement('div'); pre.className='sc-out'; pre.textContent=out; const anchor=body.querySelector('.sc-actions'); body.insertBefore(pre, anchor); }
        const ok = r.code===0 && !r.timed_out;
        finish(ok?'ok':'err', r.timed_out ? '⏱ TIMEOUT — killed after 30s' : (ok ? '✓ exit 0' : '⚠ exit '+r.code));
        logEntry({ ts:now(), cmd, code:r.code, timed_out:!!r.timed_out });
        A.SFX.chime();
      }catch(err){
        finish('err','⚠ '+String(err));
        logEntry({ ts:now(), cmd, status:'error' });
        A.SFX.off();
      }
    });
  }

  function renderToolCard(tc){
    const body = tc.args ? JSON.stringify(tc.args) : '';
    const html = `<div class="tool-call"><div class="tc-head">⚙ tool · ${escapeHtml(tc.name)}<span class="tc-ok">✓ ok</span></div><div class="tc-body">${escapeHtml(body)}</div></div>`;
    const el=document.createElement('div'); el.className='msg j';
    el.innerHTML=`<div class="av">J</div><div class="body"><div class="who">JARVIS</div><div class="txt">${html}</div></div>`;
    stream.appendChild(el); scrollBottom();
  }
  // compact snapshot of panel state so read-tools (task_list, vault_search,
  // finance_summary) can answer from real data
  function gatherState(){
    try{
      const t = STORE.load('tasks', null);
      const f = STORE.load('finance', null);
      const v = STORE.load('vault', null);
      return {
        tasks: t ? { activeBoard:t.activeBoard, boards:(t.boards||[]).map(b=>({ id:b.id, name:b.name,
          tasks:(b.tasks||[]).map(x=>({ text:x.text, col:x.col, pri:x.pri, due:x.due })) })) } : null,
        finance: f ? { accounts:(f.accounts||[]).map(a=>({ name:a.name, balance:a.balance })),
          cats:(f.cats||[]).map(c=>({ name:c.name, budget:c.budget, spent:c.spent })) } : null,
        vault: v ? (v.notes||[]).map(n=>({ title:n.title, tags:n.tags })) : null,
        // durable facts about the user — injected into the system prompt
        memories: (STORE.load('memories', []) || []).map(m=>m.text).filter(Boolean),
        // live value of the Settings toggle — gates the computer_run tool in the core
        system: { enabled: !!document.querySelector('.switch[data-toggle="system"]')?.classList.contains('on') }
      };
    }catch(e){ return null; }
  }
  window.JSTATE = gatherState;   // shared with agents.js

  // persona (system prompt + name) from Settings → core
  function gatherPersona(){
    try{
      const s = STORE.load('settings', {}) || {};
      return { prompt:(s.prompt||'').trim(), name:[s.first,s.last].filter(Boolean).join(' ').trim() };
    }catch(e){ return {}; }
  }

  function handleUserCore(text){
    addMsg('u', escapeHtml(text));
    setVoice('thinking','Routing through core…');
    const history = convo.slice();   // prior turns, before adding this one
    rememberUser(text); logUser(text);
    coreBubble=null; coreReply=''; ttsBuf=''; coreTyping=typingEl();
    BRIDGE.invoke('chat_send', { text, mode: live?'voice':'chat', state: gatherState(), persona: gatherPersona(), history }).catch(err=>{
      if(coreTyping){ coreTyping.remove(); coreTyping=null; }
      addMsg('j','Core error: '+escapeHtml(String(err)));
      setVoice(live?'listening':'idle');
    });
  }

  // a VAD-detected utterance: pause listening, run the turn, speak the reply
  function onVoiceUtterance(text){
    window.VOICE?.pause();
    voiceTurn=true;
    handleUserCore(text);
  }

  function handleUser(text){
    if(window.BRIDGE && window.BRIDGE.inTauri) return handleUserCore(text);
    addMsg('u', escapeHtml(text));
    logUser(text);
    // live preview agent (real OpenAI streaming) takes over when configured
    if(window.DEMOAGENT && window.DEMOAGENT.enabled()){ A.SFX.think(); return window.DEMOAGENT.reply(text); }
    setVoice('thinking','Parsing intent…');
    A.SFX.think();
    const t = typingEl();
    const r = RESPONSES.find(r=>r.match.test(text));
    const delay = 700 + Math.random()*500;
    setTimeout(()=>{
      t.remove();
      let html = '';
      if(r && r.tool){
        html += `<div class="tool-call"><div class="tc-head">⚙ tool · ${r.tool.name}<span class="tc-ok">✓ ok</span></div><div class="tc-body">${escapeHtml(r.tool.body)}</div></div>`;
      }
      const say = r ? r.say : DEFAULT_SAY;
      const e = addMsg('j', html);
      // speak: type out the text
      setVoice('speaking', '');
      A.SFX.speak();
      const txt = e.querySelector('.txt');
      const p = document.createElement('div'); p.style.marginTop = r&&r.tool?'10px':'0';
      txt.appendChild(p);
      let i=0;
      const iv=setInterval(()=>{
        p.textContent = say.slice(0,++i);
        scrollBottom();
        if(i>=say.length){ clearInterval(iv); setVoice(live?'listening':'idle'); logAssistant(say); }
      }, 18);
    }, delay);
  }

  function escapeHtml(s){ return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // UI surface the preview demo-agent renders through (see demo-agent.js)
  window.UI = { addMsg, typingEl, setVoice, scrollBottom, escapeHtml, logUser, logAssistant, isLive:()=>live };

  // composer
  const input = $('#composer-input');
  function send(){
    const v = input.value.trim(); if(!v) return;
    input.value=''; handleUser(v); A.SFX.blip();
  }
  $('#composer-send').addEventListener('click', send);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });

  /* ---------- tabs ---------- */
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      const id = tab.dataset.tab;
      $$('.tab').forEach(t=>t.classList.remove('active'));
      $('#download-btn')?.classList.remove('active');
      tab.classList.add('active');
      $$('.view').forEach(v=>v.hidden=true);
      const view = $('#view-'+id); if(view) view.hidden=false;
      const isChat = (id==='chat');
      $('#composer').style.display = isChat ? 'flex' : 'none';
      const cc=$('#chat-controls'); if(cc) cc.style.display = isChat ? 'flex' : 'none';
      if(isChat){ $$('.mode-toggle button').forEach(x=>x.classList.toggle('active', x.textContent.trim()==='CHAT')); setTimeout(()=>$('#composer-input')?.focus(),50); }
      $('#panel-title').textContent = tab.dataset.title;
      $('#panel-meta').textContent = tab.dataset.meta || '';
      A.SFX.tab();
    });
  });

  // task checkboxes
  $$('.card .check').forEach(c=>{
    c.addEventListener('click', ()=>{ c.closest('.card').classList.toggle('done'); A.SFX.blip(); });
  });

  /* ---------- mode toggle ---------- */
  $$('.mode-toggle button').forEach(b=>{
    b.addEventListener('click', ()=>{
      $$('.mode-toggle button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); A.SFX.tab();
      if(b.textContent.trim()==='CHAT'){ $('.tab[data-tab="chat"]')?.click(); }
    });
  });

  $('#mic-btn').addEventListener('click', toggleMic);

  /* ---------- conversation history overlay ---------- */
  function buildHistoryOverlay(){
    const m=document.createElement('div'); m.className='hist-modal'; m.id='hist-modal';
    m.innerHTML=`<div class="hist-dialog">
      <div class="hist-head">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <h2>Conversation history</h2>
        <input id="hist-search" placeholder="Search all conversations…" autocomplete="off">
        <button class="btn ghost" id="hist-export">EXPORT</button>
        <div class="x" id="hist-close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
      </div>
      <div class="hist-list" id="hist-list"></div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e=>{ if(e.target===m) closeHistory(); });
    $('#hist-close').addEventListener('click', closeHistory);
    $('#hist-search').addEventListener('input', e=> renderHistory(e.target.value));
    $('#hist-export').addEventListener('click', exportHistory);
  }
  function fmtWhen(ts){
    const d=new Date(ts), now=new Date();
    const sameDay=d.toDateString()===now.toDateString();
    return sameDay ? d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString();
  }
  function renderHistory(q){
    const list=$('#hist-list'); if(!list) return;
    q=(q||'').toLowerCase().trim();
    let sessions=chatlog().slice().sort((a,b)=>b.updated-a.updated);
    if(q) sessions=sessions.filter(s=> (s.title||'').toLowerCase().includes(q) || s.msgs.some(m=>(m.content||'').toLowerCase().includes(q)));
    if(!sessions.length){ list.innerHTML=`<div class="hist-empty">${chatlog().length?'No conversations match.':'No conversations yet — start chatting and they’ll appear here.'}</div>`; return; }
    list.innerHTML='';
    sessions.forEach(s=>{
      const last=s.msgs[s.msgs.length-1];
      const preview=last?(last.role==='assistant'?'':'You: ')+last.content:'';
      const el=document.createElement('div'); el.className='hist-row'+(s.id===sessionId?' active':'');
      el.innerHTML=`<div class="hr-main">
          <div class="hr-title">${escapeHtml(s.title||'Untitled')}</div>
          <div class="hr-prev">${escapeHtml(preview.slice(0,90))}</div>
        </div>
        <div class="hr-meta"><span class="hr-when">${fmtWhen(s.updated)}</span><span class="hr-count">${s.msgs.length} msg</span></div>
        <span class="hr-x" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></span>`;
      el.querySelector('.hr-main').addEventListener('click', ()=> openSession(s.id));
      el.querySelector('.hr-meta').addEventListener('click', ()=> openSession(s.id));
      el.querySelector('.hr-x').addEventListener('click', ev=>{
        ev.stopPropagation();
        saveChatlog(chatlog().filter(x=>x.id!==s.id));
        if(s.id===sessionId) sessionId=null;
        renderHistory($('#hist-search')?.value || ''); A.SFX.off();
      });
      list.appendChild(el);
    });
  }
  function openHistory(){ if(!$('#hist-modal')) buildHistoryOverlay(); renderHistory(''); const s=$('#hist-search'); if(s) s.value=''; $('#hist-modal').classList.add('open'); A.SFX.blip(); setTimeout(()=>s?.focus(),60); }
  function closeHistory(){ $('#hist-modal')?.classList.remove('open'); }
  function exportHistory(){
    try{
      const blob=new Blob([JSON.stringify(chatlog(), null, 2)], {type:'application/json'});
      const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url; a.download='jarvis-conversations.json'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 1000); A.SFX.chime();
    }catch(e){ console.warn('export failed', e); }
  }
  $('#chat-history')?.addEventListener('click', openHistory);
  $('#chat-new')?.addEventListener('click', newConversation);
  addEventListener('keydown', e=>{ if(e.key==='Escape' && $('#hist-modal')?.classList.contains('open')) closeHistory(); });

  /* ---------- download view (in-app page — topbar + orb stay) ---------- */
  let dlWired = false;
  function wireDownload(){
    if(dlWired) return; dlWired = true;
    const base = ((window.JARVIS_DEMO&&window.JARVIS_DEMO.endpoint)||'https://jarvis.jamkabhazan.workers.dev').replace(/\/+$/,'');
    const mac=$('#dlm-mac'), win=$('#dlm-win'), macIntel=$('#dlm-mac-intel'), status=$('#dlm-status');
    // installers stream through the proxy with a clean filename (Jarvis.dmg / Jarvis.exe)
    if(mac){ mac.href=base+'/dl/mac'; mac.removeAttribute('target'); }
    if(win){ win.href=base+'/dl/win'; win.removeAttribute('target'); }
    fetch('https://api.github.com/repos/jamkabhazan-rgb/jarvis/releases/latest',{headers:{Accept:'application/vnd.github+json'}})
      .then(r=> r.ok?r.json():Promise.reject())
      .then(rel=>{ const a=rel.assets||[];
        if(macIntel && a.some(x=>/(x64|x86_64|intel).*\.dmg$/i.test(x.name))){ macIntel.href=base+'/dl/mac-intel'; macIntel.hidden=false; }
        if(status) status.textContent='Latest: '+(rel.tag_name||'')+' — saves as Jarvis';
      }).catch(()=>{ if(status) status.textContent=''; });
    $('#dlm-copy')?.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText($('#dlm-cmd').textContent); const b=$('#dlm-copy'); b.textContent='COPIED'; setTimeout(()=>b.textContent='COPY',1500);}catch(e){} });
  }
  function showDownload(){
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#download-btn')?.classList.add('active');
    $$('.view').forEach(v=>v.hidden=true);
    const v=$('#view-download'); if(v) v.hidden=false;
    $('#composer').style.display='none';
    const cc=$('#chat-controls'); if(cc) cc.style.display='none';
    $('#panel-title').textContent='Download';
    $('#panel-meta').textContent='macOS · WINDOWS · TERMINAL';
    wireDownload(); A.SFX.tab();
  }
  $('#download-btn')?.addEventListener('click', e=>{ e.preventDefault(); showDownload(); });

  /* ---------- ready hook from boot ---------- */
  window.APP = {
    async onReady(){
      setVoice('idle');
      // In the installed app, check for an OpenAI key — without it nothing works.
      let needsKey = false;
      if(window.BRIDGE && window.BRIDGE.inTauri){
        try{ needsKey = !(await BRIDGE.invoke('has_api_key')); }catch(e){}
      }
      // jarvis greets after reveal
      setTimeout(()=>{
        const e = addMsg('j','');
        const say = needsKey
          ? 'Welcome. To bring me online I need your OpenAI API key. Open Settings — the gear at the top-right — and paste your key there. Everything I do runs on that one key, and it’s stored only in your device’s keychain: it never leaves your machine. Once it’s in, just talk to me.'
          : 'Systems online. Voice pipeline ready — speech, reasoning and synthesis all green. How can I help, Sir?';
        const txt=e.querySelector('.txt'); let i=0;
        setVoice('speaking',''); A.SFX.speak();
        const iv=setInterval(()=>{ txt.textContent=say.slice(0,++i); scrollBottom(); if(i>=say.length){
          clearInterval(iv); setVoice('idle');
          // nudge the user straight to the key field on first run
          if(needsKey) setTimeout(()=> $('#open-settings')?.click(), 400);
        } },16);
      }, 600);
    }
  };

  // connect to the Rust core (no-op in a plain browser)
  initCore();

  /* ---------- in-app auto-update (Tauri only) ---------- */
  async function checkUpdates(){
    if(!(window.BRIDGE && window.BRIDGE.inTauri)) return;
    try{
      const version = await BRIDGE.invoke('check_for_update');
      if(!version) return;
      const bar = document.createElement('div');
      bar.className = 'update-toast';
      bar.innerHTML = `<span class="ut-txt">Update available — <b>v${escapeHtml(String(version))}</b></span>
        <button class="btn primary ut-go">UPDATE &amp; RESTART</button>
        <button class="btn ghost ut-skip">LATER</button>`;
      document.body.appendChild(bar);
      requestAnimationFrame(()=>bar.classList.add('show'));
      bar.querySelector('.ut-skip').addEventListener('click', ()=>bar.remove());
      bar.querySelector('.ut-go').addEventListener('click', async ()=>{
        const go=bar.querySelector('.ut-go'); go.disabled=true; go.textContent='UPDATING…';
        try{ await BRIDGE.invoke('install_update'); }
        catch(e){ go.textContent='UPDATE FAILED'; console.warn('update failed', e); }
      });
    }catch(e){ console.warn('update check failed', e); }
  }
  setTimeout(checkUpdates, 5000); // after boot, don't block startup

  // start the boot sequence
  window.BOOT?.run();
})();
