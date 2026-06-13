/* ============================================================
   panels.js — kanban, connectors, knowledge filters, settings
   ============================================================ */
(function(){
  const A = window.JAUDIO || { SFX:new Proxy({},{get:()=>()=>{}}) };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ===================== KANBAN ===================== */
  const COLUMNS = [
    { id:'backlog',  title:'Backlog',     color:'#8899aa' },
    { id:'today',    title:'Today',       color:'#00d4ff' },
    { id:'progress', title:'In progress', color:'#ffb347' },
    { id:'done',     title:'Done',        color:'#41e0a3' },
  ];
  const PRI = { high:'#ff4466', med:'#ffb347', low:'#4a5568' };
  const DEFAULT_BOARDS = [
    { id:'main', name:'Main Dashboard', tasks:[
      { id:1, col:'today',    text:'Review Mark VII telemetry',        pri:'high', tag:'workshop', due:'18:00' },
      { id:2, col:'today',    text:'Call Pepper re: SI board',         pri:'med',  tag:'call',     due:'15:30' },
      { id:3, col:'backlog',  text:'Draft keynote — Stark Expo',        pri:'med',  tag:'writing',  due:'Fri' },
      { id:4, col:'backlog',  text:'Spec out Mark VIII actuators',      pri:'low',  tag:'design',   due:'' },
      { id:5, col:'backlog',  text:'Audit cloud LLM fallback keys',     pri:'low',  tag:'security', due:'' },
      { id:6, col:'progress', text:'Recalibrate repulsor output curve', pri:'high', tag:'workshop', due:'' },
      { id:7, col:'progress', text:'Wire barge-in for TTS interrupt',   pri:'med',  tag:'voice',    due:'' },
      { id:8, col:'done',     text:'Migrate knowledge vault to local index', pri:'low', tag:'data',  due:'' },
      { id:9, col:'done',     text:'Ship cinematic boot sequence',      pri:'med',  tag:'ui',       due:'' },
    ]},
    { id:'lab', name:'R&D Lab', tasks:[
      { id:11, col:'backlog', text:'Prototype nano-particle casing',    pri:'med',  tag:'materials', due:'' },
      { id:12, col:'today',   text:'Run repulsor stress test',          pri:'high', tag:'test',      due:'' },
    ]},
  ];
  const persistedTasks = STORE.load('tasks', null);
  let BOARDS = (persistedTasks && persistedTasks.boards) || DEFAULT_BOARDS;
  let activeBoard = (persistedTasks && persistedTasks.activeBoard) || 'main';
  let uid = (persistedTasks && persistedTasks.uid) || 100;
  let bid = (persistedTasks && persistedTasks.bid) || 10;
  let dragId = null;
  const board = () => BOARDS.find(b=>b.id===activeBoard) || BOARDS[0];
  function saveTasks(){ STORE.save('tasks', { boards:BOARDS, activeBoard, uid, bid }); }

  function renderBoards(){
    const bar = $('#board-bar'); if(!bar) return;
    bar.innerHTML = '';
    BOARDS.forEach(b=>{
      const pill = document.createElement('div');
      pill.className = 'board-pill' + (b.id===activeBoard?' active':'');
      pill.innerHTML = `<span class="bp-name">${esc(b.name)}</span><span class="bp-count">${b.tasks.length}</span>`;
      pill.addEventListener('click', ()=>{ activeBoard=b.id; saveTasks(); A.SFX.tab(); renderBoards(); renderKanban(); });
      bar.appendChild(pill);
    });
    const add = document.createElement('div');
    add.className='board-add'; add.id='board-add'; add.textContent='+ new board';
    add.addEventListener('click', startAddBoard);
    bar.appendChild(add);
  }

  function startAddBoard(){
    const bar = $('#board-bar'); const add = $('#board-add');
    if(bar.querySelector('.board-input')) return;
    const inp = document.createElement('input');
    inp.className='board-input'; inp.placeholder='Board name…'; inp.maxLength=28;
    add.before(inp); inp.focus(); A.SFX.blip();
    let done=false;
    const commit = ()=>{
      if(done) return; done=true;
      const v = inp.value.trim();
      if(v){ const id='b'+(++bid); BOARDS.push({id, name:v, tasks:[]}); activeBoard=id; saveTasks(); A.SFX.listen(); renderBoards(); renderKanban(); }
      else { inp.remove(); }
    };
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); } if(e.key==='Escape') inp.remove(); });
    inp.addEventListener('blur', commit);
  }

  function cardEl(t){
    const el = document.createElement('div');
    el.className = 'kcard'; el.draggable = true; el.dataset.id = t.id;
    el.innerHTML = `
      <div class="kt">${esc(t.text)}</div>
      <div class="kmeta">
        <span class="kpri" style="background:${PRI[t.pri]||PRI.low}"></span>
        ${t.tag?`<span class="ktag">${esc(t.tag)}</span>`:''}
        ${t.due?`<span class="kdue">${esc(t.due)}</span>`:''}
      </div>`;
    el.addEventListener('dragstart', e=>{ dragId=t.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; A.SFX.blip(); });
    el.addEventListener('dragend', ()=>{ dragId=null; el.classList.remove('dragging'); });
    return el;
  }

  function renderKanban(){
    const root = $('#kanban'); if(!root) return;
    root.innerHTML = '';
    COLUMNS.forEach(c=>{
      const col = document.createElement('div'); col.className='kcol'; col.dataset.col=c.id;
      const items = board().tasks.filter(t=>t.col===c.id);
      col.innerHTML = `
        <div class="kcol-head">
          <span class="kc-dot" style="background:${c.color}"></span>
          <span class="kc-title">${c.title}</span>
          <span class="kc-count">${items.length}</span>
        </div>
        <div class="kcol-body"></div>
        <div class="kc-add">+ add task</div>`;
      const body = col.querySelector('.kcol-body');
      items.forEach(t=> body.appendChild(cardEl(t)) );

      // drag targets
      col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('dragover'); });
      col.addEventListener('dragleave', e=>{ if(!col.contains(e.relatedTarget)) col.classList.remove('dragover'); });
      col.addEventListener('drop', e=>{
        e.preventDefault(); col.classList.remove('dragover');
        if(dragId==null) return;
        const t = board().tasks.find(x=>x.id===dragId);
        if(t && t.col!==c.id){ t.col=c.id; saveTasks(); A.SFX.tab(); renderKanban(); }
      });

      // add task
      col.querySelector('.kc-add').addEventListener('click', ()=> startAdd(col, c.id));
      root.appendChild(col);
    });
  }

  function startAdd(col, colId){
    if(col.querySelector('.kc-input')) return;
    const add = col.querySelector('.kc-add');
    const ta = document.createElement('textarea');
    ta.className='kc-input'; ta.rows=2; ta.placeholder='Task title… (Enter to add)';
    add.before(ta); ta.focus(); A.SFX.blip();
    let done=false;
    const commit = ()=>{
      if(done) return; done=true;
      const v = ta.value.trim();
      if(v){ board().tasks.push({id:++uid, col:colId, text:v, pri:'med', tag:'', due:''}); saveTasks(); A.SFX.listen(); renderKanban(); }
      else { ta.remove(); }
    };
    ta.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); commit(); } if(e.key==='Escape') ta.remove(); });
    ta.addEventListener('blur', commit);
  }

  /* ===================== CONNECTORS ===================== */
  // Real brand glyphs (Simple Icons, CC0) live in assets/brands/*.svg —
  // white fill on an official-brand-color tile. Logos remain trademarks of
  // their owners and identify the third-party services only.
  const SERVICES = [
    { name:'Claude Code',       icon:'claudecode',       color:'#D97757', desc:'Agents · code · automation', linked:false },
    { name:'Google Calendar',   icon:'googlecalendar',   color:'#4285F4', desc:'Events · scheduling', linked:false },
    { name:'Google Drive',      icon:'googledrive',      color:'#1FA463', desc:'Docs · files', linked:false },
    { name:'Slack',             icon:'slack',            color:'#4A154B', desc:'Channels · DMs', linked:false },
    { name:'Notion',            icon:'notion',           color:'#101013', desc:'Pages · databases', linked:false },
    { name:'GitHub',            icon:'github',           color:'#1f2328', desc:'Repos · issues · PRs', linked:false },
    { name:'Gmail',             icon:'gmail',            color:'#EA4335', desc:'Read · triage · drafts', linked:false },
    { name:'Microsoft Outlook', icon:'microsoftoutlook', color:'#0078D4', desc:'Mail · calendar', linked:false },
    { name:'Microsoft Teams',   icon:'microsoftteams',   color:'#6264A7', desc:'Chats · meetings', linked:false },
    { name:'Linear',            icon:'linear',           color:'#5E6AD2', desc:'Issues · cycles', linked:false },
    { name:'Jira',              icon:'jira',             color:'#0052CC', desc:'Tickets · sprints', linked:false },
    { name:'Trello',            icon:'trello',           color:'#0079BF', desc:'Boards · cards', linked:false },
    { name:'Asana',             icon:'asana',            color:'#F06A6A', desc:'Tasks · projects', linked:false },
    { name:'Todoist',           icon:'todoist',          color:'#E44332', desc:'Tasks · reminders', linked:false },
    { name:'Figma',             icon:'figma',            color:'#F24E1E', desc:'Files · comments', linked:false },
    { name:'Canva',             icon:'canva',            color:'#00C4CC', desc:'Designs · exports', linked:false },
    { name:'Dropbox',           icon:'dropbox',          color:'#0061FE', desc:'Files · storage', linked:false },
    { name:'Zoom',              icon:'zoom',             color:'#2D8CFF', desc:'Meetings · recordings', linked:false },
    { name:'Telegram',          icon:'telegram',         color:'#26A5E4', desc:'Messages · bots', linked:false },
    { name:'WhatsApp',          icon:'whatsapp',         color:'#25D366', desc:'Messages · groups', linked:false },
    { name:'Discord',           icon:'discord',          color:'#5865F2', desc:'Servers · channels', linked:false },
    { name:'Stripe',            icon:'stripe',           color:'#635BFF', desc:'Payments · invoices', linked:false },
    { name:'PayPal',            icon:'paypal',           color:'#003087', desc:'Balance · transfers', linked:false },
    { name:'Zapier',            icon:'zapier',           color:'#FF4F00', desc:'Automation · webhooks', linked:false },
    { name:'HubSpot',           icon:'hubspot',          color:'#FF7A59', desc:'CRM · contacts', linked:false },
    { name:'Salesforce',        icon:'salesforce',       color:'#00A1E0', desc:'CRM · pipelines', linked:false },
    { name:'LinkedIn',          icon:'linkedin',         color:'#0A66C2', desc:'Posts · messages', linked:false },
    { name:'Spotify',           icon:'spotify',          color:'#1DB954', desc:'Playback · playlists', linked:false },
    { name:'YouTube',           icon:'youtube',          color:'#FF0000', desc:'Videos · analytics', linked:false },
    { name:'X',                 icon:'x',                color:'#000000', desc:'Posts · DMs · trends', linked:false },
    { name:'Instagram',         icon:'instagram',        color:'#E4405F', desc:'Posts · DMs · stories', linked:false },
    { name:'Threads',           icon:'threads',          color:'#000000', desc:'Posts · replies', linked:false },
    { name:'Reddit',            icon:'reddit',           color:'#FF4500', desc:'Posts · subreddits', linked:false },
    { name:'TikTok',            icon:'tiktok',           color:'#010101', desc:'Videos · DMs', linked:false },
    { name:'Facebook',          icon:'facebook',         color:'#1877F2', desc:'Pages · posts', linked:false },
    { name:'Snapchat',          icon:'snapchat',         color:'#FFFC00', desc:'Snaps · stories', linked:false },
    { name:'Pinterest',         icon:'pinterest',        color:'#BD081C', desc:'Pins · boards', linked:false },
    { name:'Twitch',            icon:'twitch',           color:'#9146FF', desc:'Streams · chat', linked:false },
    { name:'Mastodon',          icon:'mastodon',         color:'#6364FF', desc:'Posts · timelines', linked:false },
    { name:'Bluesky',           icon:'bluesky',          color:'#0285FF', desc:'Posts · feeds', linked:false },
  ];
  // expose the connector catalogue so the agent builder can offer them
  window.JCONNECTORS = SERVICES;
  // restore saved linked-state, then expose a saver
  (function(){
    const saved = STORE.load('connectors', null);
    if(saved) SERVICES.forEach(s=>{ if(s.name in saved) s.linked = saved[s.name]; });
  })();
  function saveConnectors(){
    const m = {}; SERVICES.forEach(s=> m[s.name]=s.linked); STORE.save('connectors', m);
  }

  function connEl(s){
    const el = document.createElement('div');
    el.className = 'conn' + (s.linked?' on':'');
    el.innerHTML = `
      <div class="logo" style="background:${s.color}"><img class="brand" src="assets/brands/${s.icon}.svg" alt="${esc(s.name)}" onerror="this.replaceWith(this.alt[0]||'?')"></div>
      <div class="c-info">
        <div class="c-name">${esc(s.name)}</div>
        <div class="c-state ${s.linked?'linked':''}">${s.linked?'● ':''}${esc(s.desc)}</div>
      </div>
      <div class="c-btn">${s.linked?'MANAGE':'CONNECT'}</div>`;
    el.querySelector('.c-btn').addEventListener('click', ()=>{
      s.linked = !s.linked; saveConnectors(); A.SFX[s.linked?'listen':'off'](); renderConnectors();
    });
    return el;
  }
  function renderConnectors(){
    const L = $('#conn-linked'), Av = $('#conn-available');
    if(!L||!Av) return;
    L.innerHTML=''; Av.innerHTML='';
    SERVICES.forEach(s=> (s.linked?L:Av).appendChild(connEl(s)) );
    const tab = $('.tab[data-tab="connectors"]');
    const n = SERVICES.filter(s=>s.linked).length;
    if(tab) tab.dataset.meta = `${n} LINKED · ${SERVICES.length-n} AVAILABLE`;
    if($('#panel-title')?.textContent==='Connectors') $('#panel-meta').textContent = tab.dataset.meta;
  }

  /* ===================== MAIL · connect gate ===================== */
  function setMailConnected(on){
    const gate = $('#mail-gate'), inbox = $('#mail-inbox');
    if(!gate||!inbox) return;
    gate.hidden = on; inbox.hidden = !on;
    const gmail = SERVICES.find(s=>s.name==='Gmail'); if(gmail) gmail.linked = on;
    const cal = SERVICES.find(s=>s.name==='Google Calendar'); if(cal) cal.linked = on;
    saveConnectors(); renderConnectors();
  }
  $('#mail-connect')?.addEventListener('click', ()=>{
    const btn = $('#mail-connect');
    btn.classList.add('linking'); btn.childNodes[btn.childNodes.length-1].textContent = ' Connecting…';
    A.SFX.listen();
    setTimeout(()=>{ setMailConnected(true); A.SFX.chime(); }, 900);
  });

  /* ===================== KNOWLEDGE tag filter ===================== */
  $$('.tagrow .vtag').forEach(t=>{
    t.addEventListener('click', ()=>{ $$('.tagrow .vtag').forEach(x=>x.classList.remove('on')); t.classList.add('on'); A.SFX.tab(); });
  });

  /* ===================== GOALS ===================== */
  function fillGoals(){
    $$('#view-goals .goal').forEach(g=>{
      const f = g.querySelector('.bar-fill'); if(!f) return;
      f.style.width = '0%';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ f.style.width = (g.dataset.pct||0)+'%'; }));
    });
  }
  $('.tab[data-tab="goals"]')?.addEventListener('click', ()=> setTimeout(fillGoals, 60));

  /* ===================== TRACKER · habits ===================== */
  function initTracker(){
    const cards = $$('#view-tracker .card');
    if(!cards.length) return;
    const saved = STORE.load('tracker', {}) || {};
    const syncTag = (card, done)=>{
      const tag = card.querySelector('.tag');
      if(tag){ tag.textContent = done?'DONE':'PENDING'; tag.classList.toggle('go', done); }
    };
    cards.forEach(card=>{
      const title = (card.querySelector('.c-title')?.textContent || '').trim();
      if(title in saved){ card.classList.toggle('done', !!saved[title]); syncTag(card, !!saved[title]); }
      card.querySelector('.check')?.addEventListener('click', ()=>{
        // app.js already toggled `.done`; read the result, sync tag, persist
        const done = card.classList.contains('done');
        syncTag(card, done);
        const map = STORE.load('tracker', {}) || {};
        map[title] = done; STORE.save('tracker', map);
      });
    });
  }

  /* ===================== SETTINGS · full page ===================== */
  const modal = $('#settings');
  function initials(){
    const f=($('#set-first')?.value||'').trim(), l=($('#set-last')?.value||'').trim();
    return ((f[0]||'')+(l[0]||'')).toUpperCase() || 'J';
  }
  function refreshProfile(){
    const f=($('#set-first')?.value||'').trim(), l=($('#set-last')?.value||'').trim();
    $('#pf-name').textContent = (f+' '+l).trim() || 'Jarvis user';
    $('#pf-mail').textContent = ($('#set-email')?.value||'').trim() || '—';
    $('#sp-avatar').textContent = initials();
  }
  function loadSettings(){
    try{
      const s = JSON.parse(localStorage.getItem('jarvis.settings')||'{}');
      if(s.first) $('#set-first').value = s.first;
      if(s.last)  $('#set-last').value  = s.last;
      if(s.email) $('#set-email').value = s.email;
      if(s.wake)  $('#set-wake').value  = s.wake;
      if(s.prompt)$('#set-prompt').value= s.prompt;
      if(s.toggles) Object.entries(s.toggles).forEach(([k,v])=>{ const sw=$(`.switch[data-toggle="${k}"]`); if(sw) sw.classList.toggle('on', !!v); });
    }catch(e){}
    refreshProfile();
  }
  async function updateKeyState(){
    const el=$('#api-key-state'); if(!el) return;
    if(window.BRIDGE && window.BRIDGE.inTauri){
      try{ const has=await BRIDGE.invoke('has_api_key'); el.textContent = has?'A key is set ✓':'No key set yet'; }
      catch(e){ el.textContent='core unavailable'; }
    } else {
      el.innerHTML='<b>DESKTOP APP ONLY</b> — key entry is disabled in this browser preview';
      const inp=$('#set-api-key');
      if(inp){ inp.disabled=true; inp.placeholder='Available in the desktop app only'; }
    }
  }
  /* ===================== LONG-TERM MEMORY ===================== */
  function loadMem(){ return STORE.load('memories', []) || []; }
  function saveMem(arr){ STORE.save('memories', arr); }
  let muid = (STORE.load('memuid', null)) || 1;
  function renderMem(){
    const root=$('#mem-list'); if(!root) return;
    const mem=loadMem();
    if(!mem.length){ root.innerHTML='<div class="mem-empty">No memories yet — tell Jarvis something worth remembering.</div>'; return; }
    root.innerHTML='';
    mem.forEach(m=>{
      const el=document.createElement('div'); el.className='mem-item';
      el.innerHTML=`<span class="mi-dot"></span><span class="mi-text">${esc(m.text)}</span><span class="mi-x" title="Forget"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></span>`;
      el.querySelector('.mi-x').addEventListener('click', ()=>{ saveMem(loadMem().filter(x=>x.id!==m.id)); renderMem(); A.SFX.tab(); });
      root.appendChild(el);
    });
  }
  function addMem(text){
    const t=String(text||'').trim(); if(!t) return;
    const mem=loadMem(); mem.push({ id:muid++, text:t, ts:Date.now() });
    saveMem(mem); STORE.save('memuid', muid); renderMem();
  }
  $('#mem-add')?.addEventListener('click', ()=>{ const i=$('#mem-input'); addMem(i.value); i.value=''; A.SFX.blip(); });
  $('#mem-input')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ addMem(e.target.value); e.target.value=''; A.SFX.blip(); } });
  $('#mem-clear')?.addEventListener('click', ()=>{ saveMem([]); renderMem(); A.SFX.off(); });

  // tool handlers (core → memory store)
  window.JTOOLS = window.JTOOLS || {};
  window.JTOOLS.memory_save = (a)=> addMem(a.fact);
  window.JTOOLS.memory_forget = (a)=>{
    const q=String(a.query||'').toLowerCase(); if(!q) return;
    saveMem(loadMem().filter(m=>!m.text.toLowerCase().includes(q))); renderMem();
  };

  function openSettings(){ loadSettings(); updateKeyState(); syncSysControl(); renderSysLog(); renderUsage(); renderMem(); modal.classList.add('open'); A.SFX.blip(); }
  function closeSettings(){ modal.classList.remove('open'); A.SFX.tab(); }
  function flashSaved(){ const s=$('#set-saved'); s.classList.add('show'); setTimeout(()=>s.classList.remove('show'), 2000); }
  function saveSettings(){
    const toggles={}; $$('.switch[data-toggle]').forEach(sw=> toggles[sw.dataset.toggle]=sw.classList.contains('on'));
    const data = {
      first:$('#set-first').value.trim(), last:$('#set-last').value.trim(),
      email:$('#set-email').value.trim(), wake:$('#set-wake').value.trim(),
      prompt:$('#set-prompt').value.trim(), toggles
    };
    try{ localStorage.setItem('jarvis.settings', JSON.stringify(data)); }catch(e){}
    // API key goes only to the core/keychain — never to localStorage
    const keyInput=$('#set-api-key');
    if(window.BRIDGE && window.BRIDGE.inTauri && keyInput && keyInput.value.trim()!==''){
      BRIDGE.invoke('set_api_key', { key:keyInput.value.trim() })
        .then(()=>{ keyInput.value=''; updateKeyState(); }).catch(()=>{});
    }
    refreshProfile(); A.SFX.chime(); flashSaved();
  }
  // live profile + avatar
  ['set-first','set-last','set-email'].forEach(id=> $('#'+id)?.addEventListener('input', refreshProfile));
  // toggles
  $$('.switch[data-toggle]').forEach(sw=> sw.addEventListener('click', ()=>{ sw.classList.toggle('on'); A.SFX.tab(); }) );
  // password strength + change
  function pwScore(p){ let s=0; if(p.length>=8)s++; if(/[A-Z]/.test(p))s++; if(/[0-9]/.test(p))s++; if(/[^A-Za-z0-9]/.test(p))s++; return s; }
  $('#set-pass-new')?.addEventListener('input', e=>{
    const s=pwScore(e.target.value), f=$('#pm-fill');
    f.style.width=(s/4*100)+'%';
    f.style.background = s<=1?'var(--danger)':s<=2?'var(--gold)':'var(--ok)';
  });
  $('#set-pass-update')?.addEventListener('click', ()=>{
    const cur=$('#set-pass-cur').value, np=$('#set-pass-new').value, cf=$('#set-pass-confirm').value;
    const msg=$('#pass-msg'); msg.className='field-msg';
    if(!cur){ msg.textContent='Enter your current password'; msg.classList.add('err'); A.SFX.off(); return; }
    if(np.length<8){ msg.textContent='New password must be at least 8 characters'; msg.classList.add('err'); A.SFX.off(); return; }
    if(np!==cf){ msg.textContent='Passwords don’t match'; msg.classList.add('err'); A.SFX.off(); return; }
    msg.textContent='✓ Password updated'; msg.classList.add('ok'); A.SFX.chime();
    $('#set-pass-cur').value=$('#set-pass-new').value=$('#set-pass-confirm').value=''; $('#pm-fill').style.width='0%';
  });
  /* ===================== COMPUTER CONTROL (spec §17) ===================== */
  // The Settings toggle is the master switch AND the kill-switch: it syncs to
  // the core immediately on click (no SAVE needed to turn it off).
  async function syncSysControl(){
    const sw = $('#sys-switch'), st = $('#sys-state');
    const on = !!sw?.classList.contains('on');
    if(window.BRIDGE && window.BRIDGE.inTauri){
      try{
        await BRIDGE.invoke('system_set_enabled', { on });
        if(st) st.textContent = on
          ? 'ENABLED — Jarvis can propose commands; each one still needs your RUN click'
          : 'Disabled — the model cannot even see the command tool';
      }catch(e){ if(st) st.textContent = 'core unavailable'; }
    } else if(st){ st.textContent = 'Available only in the desktop app (not in browser preview)'; }
  }
  function renderSysLog(){
    const root = $('#sys-log'); if(!root) return;
    const log = STORE.load('syslog', []) || [];
    if(!log.length){ root.innerHTML = '<div class="sys-log-empty">Nothing executed yet.</div>'; return; }
    root.innerHTML = '';
    log.slice().reverse().forEach(e=>{
      const row = document.createElement('div'); row.className = 'sys-log-row';
      const cls = e.status==='denied' ? 'deny' : (e.status==='error' || e.timed_out || e.code!==0 ? 'err' : '');
      const label = e.status==='denied' ? 'DENIED' : e.status==='error' ? 'ERROR' : e.timed_out ? 'TIMEOUT' : 'exit '+e.code;
      const via = e.via ? `<span class="sl-via">${esc(e.via)}</span>` : '';
      row.innerHTML = `<span class="sl-ts">${esc(e.ts||'')}</span>${via}<span class="sl-cmd">${esc(e.cmd||'')}</span><span class="sl-code ${cls}">${esc(label)}</span>`;
      root.appendChild(row);
    });
  }
  window.JSYS = { renderSysLog };
  $('#sys-log-clear')?.addEventListener('click', ()=>{ STORE.save('syslog', []); renderSysLog(); A.SFX.tab(); });
  // the generic switch handler (above) toggles the class first; then we sync
  $('#sys-switch')?.addEventListener('click', ()=> setTimeout(syncSysControl, 0));

  /* ===================== USAGE & COST ===================== */
  // USD per 1M tokens — edit here if OpenAI pricing changes (gpt-4o-mini).
  const PRICING = {
    'gpt-4o-mini':            { in:0.15, out:0.60 },
    'gpt-4o-mini-transcribe': { in:1.25, out:5.00 },
    'gpt-4o-mini-tts':        { in:0.60, out:0 },
    '_default':               { in:0.15, out:0.60 },
  };
  const monthKey = ()=> new Date().toISOString().slice(0,7); // YYYY-MM
  function loadUsage(){ return STORE.load('usage', null) || { months:{}, budget:0, since:Date.now() }; }
  function priceOf(model){ return PRICING[model] || PRICING._default; }
  function costOf(bucket){
    let c=0; for(const [model,e] of Object.entries(bucket||{})){ const p=priceOf(model); c += (e.in||0)/1e6*p.in + (e.out||0)/1e6*p.out; } return c;
  }
  function sumBucket(bucket){ let i=0,o=0,r=0; for(const e of Object.values(bucket||{})){ i+=e.in||0; o+=e.out||0; r+=e.req||0; } return {i,o,r}; }
  function fmtTok(n){ return n>=1e6 ? (n/1e6).toFixed(2)+'M' : n>=1e3 ? (n/1e3).toFixed(1)+'k' : String(n); }
  function fmtUsd(v){ return '$'+(v<0.01&&v>0 ? v.toFixed(4) : v.toFixed(2)); }

  // accumulate a usage event coming from the core
  function recordUsage(u){
    if(!u) return;
    const data = loadUsage();
    const mk = monthKey();
    const m = data.months[mk] || (data.months[mk] = {});
    const model = u.model || 'gpt-4o-mini';
    const e = m[model] || (m[model] = { in:0, out:0, req:0 });
    e.in += u.prompt||0; e.out += u.completion||0; e.req += 1;
    STORE.save('usage', data);
    if(modal?.classList.contains('open')) renderUsage();
    checkBudget(data);
  }
  window.JUSAGE = { recordUsage };

  let budgetWarned = false;
  function checkBudget(data){
    data = data || loadUsage();
    if(!data.budget || data.budget<=0) return;
    const spent = costOf(data.months[monthKey()]);
    if(spent >= data.budget && !budgetWarned){
      budgetWarned = true;
      const t=document.createElement('div'); t.className='update-toast show';
      t.innerHTML=`<span class="ut-txt">Monthly budget reached — <b>${fmtUsd(spent)}</b> / ${fmtUsd(data.budget)}</span><button class="btn ghost ut-skip">DISMISS</button>`;
      document.body.appendChild(t);
      t.querySelector('.ut-skip').addEventListener('click', ()=>t.remove());
      setTimeout(()=>t.remove(), 12000);
    }
    if(spent < data.budget) budgetWarned = false; // re-arm next month / after reset
  }

  function renderUsage(){
    const data = loadUsage();
    const month = data.months[monthKey()] || {};
    const m = sumBucket(month), cost = costOf(month);
    const elCost=$('#u-cost'); if(!elCost) return;
    elCost.textContent = fmtUsd(cost);
    $('#u-in').textContent  = fmtTok(m.i);
    $('#u-out').textContent = fmtTok(m.o);
    $('#u-req').textContent = String(m.r);
    // budget bar
    const bInput=$('#set-budget'); if(bInput && document.activeElement!==bInput) bInput.value = data.budget? String(data.budget):'';
    const fill=$('#bb-fill'), state=$('#u-budget-state');
    if(data.budget>0){
      const pct = Math.min(100, cost/data.budget*100);
      fill.style.width = pct+'%';
      fill.className = 'bb-fill' + (pct>=100?' over':pct>=80?' warn':'');
      state.className = 'hint' + (pct>=100?' over':pct>=80?' warn':'');
      state.textContent = `${fmtUsd(cost)} of ${fmtUsd(data.budget)} this month (${pct.toFixed(0)}%).`;
    } else {
      fill.style.width='0%'; fill.className='bb-fill';
      state.className='hint'; state.textContent='No budget set — usage is tracked but not capped.';
    }
    // all-time
    let ai=0,ao=0,ar=0,ac=0;
    for(const b of Object.values(data.months)){ const s=sumBucket(b); ai+=s.i;ao+=s.o;ar+=s.r;ac+=costOf(b); }
    const since = new Date(data.since||Date.now()).toLocaleDateString();
    $('#u-alltime').textContent = ar ? `${fmtUsd(ac)} · ${fmtTok(ai)} in / ${fmtTok(ao)} out · ${ar} requests since ${since}.` : 'No usage yet.';
  }

  $('#set-budget')?.addEventListener('change', e=>{
    const data=loadUsage(); data.budget = Math.max(0, Number(e.target.value)||0); STORE.save('usage', data);
    budgetWarned=false; renderUsage(); A.SFX.tab();
  });
  $('#u-reset')?.addEventListener('click', ()=>{
    const data=loadUsage(); const keepBudget=data.budget;
    STORE.save('usage', { months:{}, budget:keepBudget, since:Date.now() });
    budgetWarned=false; renderUsage(); A.SFX.off();
  });
  // listen for usage events from the core (Tauri only)
  if(window.BRIDGE && window.BRIDGE.inTauri){
    BRIDGE.listen('usage', u=> recordUsage(u)).catch(()=>{});
  }

  $('#open-settings')?.addEventListener('click', openSettings);
  $('#settings-close')?.addEventListener('click', closeSettings);
  $('#settings-save')?.addEventListener('click', saveSettings);
  addEventListener('keydown', e=>{ if(e.key==='Escape'&&modal.classList.contains('open')) closeSettings(); });

  function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // init
  renderBoards();
  renderKanban();
  renderConnectors();
  initTracker();
  // restore mail "connected" view if Gmail was linked
  if(SERVICES.find(s=>s.name==='Gmail')?.linked) setMailConnected(true);
  loadSettings();
  syncSysControl();   // push the persisted computer-control state to the core on startup
  renderSysLog();

  // apply any goal overrides set previously via the goal_set tool
  (function(){
    const m = STORE.load('goals', null); if(!m) return;
    $$('#view-goals .goal').forEach(g=>{
      const t=(g.querySelector('.g-title')?.textContent||'').trim();
      if(t in m){ g.dataset.pct=m[t]; const lbl=g.querySelector('.g-pct'); if(lbl) lbl.textContent=m[t]+'%'; }
    });
  })();

  // tool-call handlers (core → panel)
  window.JTOOLS = window.JTOOLS || {};
  const COLS = ['backlog','today','progress','done'];

  window.JTOOLS.task_add = (a)=>{
    const col = COLS.includes(a.column) ? a.column : 'today';
    board().tasks.push({ id:++uid, col, text:a.title||'Untitled task', pri:'med', tag:'', due:'' });
    saveTasks(); renderBoards(); renderKanban();
  };
  window.JTOOLS.task_move = (a)=>{
    const col = COLS.includes(a.column) ? a.column : 'today';
    const q = String(a.title||'').toLowerCase();
    let found=null;
    for(const b of BOARDS){ const t=b.tasks.find(x=>x.text.toLowerCase().includes(q)); if(t){ found=t; break; } }
    if(found){ found.col=col; saveTasks(); renderBoards(); renderKanban(); }
  };
  window.JTOOLS.board_add = (a)=>{
    const id='b'+(++bid); BOARDS.push({ id, name:a.name||'New board', tasks:[] });
    activeBoard=id; saveTasks(); renderBoards(); renderKanban();
  };
  window.JTOOLS.goal_set = (a)=>{
    const q=String(a.title||'').toLowerCase();
    const pct=Math.max(0,Math.min(100,Math.round(Number(a.percent)||0)));
    const g=$$('#view-goals .goal').find(el=>(el.querySelector('.g-title')?.textContent||'').toLowerCase().includes(q));
    if(g){
      g.dataset.pct=pct;
      const lbl=g.querySelector('.g-pct'); if(lbl) lbl.textContent=pct+'%';
      const f=g.querySelector('.bar-fill'); if(f) f.style.width=pct+'%';
      const title=(g.querySelector('.g-title')?.textContent||'').trim();
      const m=STORE.load('goals',{})||{}; m[title]=pct; STORE.save('goals',m);
    }
  };
  window.JTOOLS.habit_log = (a)=>{
    const q=String(a.habit||'').toLowerCase(); const done=a.done!==false;
    const card=$$('#view-tracker .card').find(c=>(c.querySelector('.c-title')?.textContent||'').toLowerCase().includes(q));
    if(card){
      card.classList.toggle('done',done);
      const tag=card.querySelector('.tag'); if(tag){ tag.textContent=done?'DONE':'PENDING'; tag.classList.toggle('go',done); }
      const title=(card.querySelector('.c-title')?.textContent||'').trim();
      const m=STORE.load('tracker',{})||{}; m[title]=done; STORE.save('tracker',m);
    }
  };
})();
