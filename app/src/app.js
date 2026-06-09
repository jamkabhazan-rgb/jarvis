/* ============================================================
   app.js — main interface: tabs, panels, chat, voice states
   ============================================================ */
(function(){
  const A = window.JAUDIO;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

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
    const conn = $('#chip-voice .led');
    if(conn) conn.className = 'led' + (mode==='idle'?' warn':'');
  }

  // fake amplitude feed to orb + wave bars
  const bars = $$('#wave .bar');
  function tickWave(){
    let amp = 0;
    if(voiceMode==='listening') amp = 0.2+Math.random()*0.5;
    else if(voiceMode==='speaking') amp = 0.3+Math.random()*0.6;
    else if(voiceMode==='thinking') amp = 0.15+Math.random()*0.2;
    else amp = 0.05+Math.random()*0.05;
    window.ORB?.amp(amp);
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
    if(live){
      A.SFX.listen(); setVoice('listening');
      // pressing the mic puts the assistant in VOICE mode
      $$('.mode-toggle button').forEach(x=>x.classList.toggle('active', x.textContent.trim()==='VOICE'));
    }
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
  let coreBubble=null, coreTyping=null;
  async function initCore(){
    if(!(window.BRIDGE && window.BRIDGE.inTauri)) return;
    await BRIDGE.listen('chat_token', tok=>{
      if(coreTyping){ coreTyping.remove(); coreTyping=null; }
      if(!coreBubble){ const e=addMsg('j',''); coreBubble=e.querySelector('.txt'); setVoice('speaking',''); }
      coreBubble.textContent += tok; scrollBottom();
    });
    await BRIDGE.listen('chat_done', ()=>{ coreBubble=null; setVoice(live?'listening':'idle'); });
  }
  function handleUserCore(text){
    addMsg('u', escapeHtml(text));
    setVoice('thinking','Routing through core…');
    coreBubble=null; coreTyping=typingEl();
    BRIDGE.invoke('chat_send', { text, mode: live?'voice':'chat' }).catch(err=>{
      if(coreTyping){ coreTyping.remove(); coreTyping=null; }
      addMsg('j','Core error: '+escapeHtml(String(err)));
      setVoice(live?'listening':'idle');
    });
  }

  function handleUser(text){
    if(window.BRIDGE && window.BRIDGE.inTauri) return handleUserCore(text);
    addMsg('u', escapeHtml(text));
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
        if(i>=say.length){ clearInterval(iv); setVoice(live?'listening':'idle'); }
      }, 18);
    }, delay);
  }

  function escapeHtml(s){ return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

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
      tab.classList.add('active');
      $$('.view').forEach(v=>v.hidden=true);
      const view = $('#view-'+id); if(view) view.hidden=false;
      const isChat = (id==='chat');
      $('#composer').style.display = isChat ? 'flex' : 'none';
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

  /* ---------- ready hook from boot ---------- */
  window.APP = {
    onReady(){
      setVoice('idle');
      // jarvis greets after reveal
      setTimeout(()=>{
        const e = addMsg('j','');
        const say = 'Systems online. Voice pipeline initialized locally — Whisper, Llama and Piper all green. How can I help, Sir?';
        const txt=e.querySelector('.txt'); let i=0;
        setVoice('speaking',''); A.SFX.speak();
        const iv=setInterval(()=>{ txt.textContent=say.slice(0,++i); scrollBottom(); if(i>=say.length){clearInterval(iv); setVoice('idle');} },16);
      }, 600);
    }
  };

  // connect to the Rust core (no-op in a plain browser)
  initCore();

  // start the boot sequence
  window.BOOT?.run();
})();
