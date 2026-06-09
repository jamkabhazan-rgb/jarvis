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
  const SERVICES = [
    { name:'Google Calendar', mono:'31', color:'#4285F4', desc:'Events · scheduling', linked:true },
    { name:'Gmail',           mono:'M',  color:'#EA4335', desc:'Read · triage · drafts', linked:false },
    { name:'Google Drive',    mono:'▲',  color:'#1FA463', desc:'Docs · files', linked:true },
    { name:'Slack',           mono:'#',  color:'#611f69', desc:'Channels · DMs', linked:true },
    { name:'Notion',          mono:'N',  color:'#101013', desc:'Pages · databases', linked:true },
    { name:'GitHub',          mono:'GH', color:'#1f2328', desc:'Repos · issues · PRs', linked:true },
    { name:'Linear',          mono:'L',  color:'#5E6AD2', desc:'Issues · cycles', linked:false },
    { name:'Jira',            mono:'J',  color:'#1868DB', desc:'Tickets · sprints', linked:false },
    { name:'Asana',           mono:'A',  color:'#F06A6A', desc:'Tasks · projects', linked:false },
    { name:'Stripe',          mono:'S',  color:'#635BFF', desc:'Payments · invoices', linked:false },
    { name:'Zapier',          mono:'Z',  color:'#FF4F00', desc:'Automation · webhooks', linked:false },
    { name:'Dropbox',         mono:'D',  color:'#0061FE', desc:'Files · storage', linked:false },
  ];
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
      <div class="logo" style="background:${s.color}">${s.mono}</div>
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
    } else { el.textContent='Available only in the desktop app (not in browser preview)'; }
  }
  function openSettings(){ loadSettings(); updateKeyState(); modal.classList.add('open'); A.SFX.blip(); }
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

  // tool-call handler (core → panel): create a task
  window.JTOOLS = window.JTOOLS || {};
  window.JTOOLS.task_add = (a)=>{
    const col = ['backlog','today','progress','done'].includes(a.column) ? a.column : 'today';
    board().tasks.push({ id:++uid, col, text:a.title||'Untitled task', pri:'med', tag:'', due:'' });
    saveTasks(); renderBoards(); renderKanban();
  };
})();
