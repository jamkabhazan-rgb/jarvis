/* ============================================================
   agents.js — sub-agent builder + run-chat
   ============================================================ */
(function(){
  const A = window.JAUDIO || { SFX:new Proxy({},{get:()=>()=>{}}) };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const COLORS = ['#00d4ff','#41e0a3','#ffb347','#ff5b8a','#c98bff','#ff8a5b'];
  const CAPS = [
    {id:'web',name:'Web search'},{id:'mail',name:'Email'},{id:'tasks',name:'Tasks'},
    {id:'calendar',name:'Calendar'},{id:'finance',name:'Finance'},{id:'vault',name:'Knowledge vault'},
    {id:'notes',name:'Notes'},{id:'reminders',name:'Reminders'},{id:'code',name:'Code / repos'},
    {id:'system',name:'Computer / shell'},{id:'mindmap',name:'Mind-maps'},
  ];
  const KB_OPTS = ['Engineering','AI / on-device LLMs','Materials','Meetings','Research','Personal'];
  const capName = id => (CAPS.find(c=>c.id===id)||{}).name || id;

  const DEFAULT_AGENTS = [
    { id:'a1', name:'Research Analyst', color:'#00d4ff', glyph:'R',
      role:'Search the web, read sources and synthesize briefs',
      prompt:'You are a meticulous research analyst. Gather multiple sources, cross-check claims, and return a tight summary with citations. Flag uncertainty. Never pad.',
      caps:['web','vault','notes'],
      kbs:['AI / on-device LLMs','Materials'],
      sources:['github.com/openai/whisper','arxiv.org/list/cs.AI/recent'] },
    { id:'a2', name:'Inbox Triage', color:'#41e0a3', glyph:'I',
      role:'Triage email, draft replies, schedule follow-ups',
      prompt:'You triage the inbox by priority, summarize threads in one line, and prepare drafts in the user’s voice. Never auto-send — always leave a draft for approval.',
      caps:['mail','calendar','tasks','reminders'],
      kbs:['Meetings'], sources:[] },
    { id:'a3', name:'Code Engineer', color:'#c98bff', glyph:'C',
      role:'Read repos, run builds & deploys, plan changes',
      prompt:'You read code and issues, propose a plan before editing, and keep changes small and reviewable. You can run shell commands (build, test, git, deploy) one at a time — each needs the user’s approval. Explain trade-offs briefly.',
      caps:['code','web','vault','system'],
      kbs:['Engineering'], sources:['github.com/starkindustries/jarvis'] },
  ];
  const ap = STORE.load('agents', null);
  let AGENTS = (ap && ap.agents) || DEFAULT_AGENTS;
  let uid = (ap && ap.uid) || 10;
  function saveAgents(){ STORE.save('agents', { agents:AGENTS, uid }); }

  /* ---------- render grid ---------- */
  function iconHTML(a, big){
    const sz = big?30:26;
    return `<div class="${big?'ag-prev':'ac-ico'}" style="background:${a.color}">
      <svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,.32)" stroke-width="1.6"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/></svg>
      <span class="ac-glyph">${esc(a.glyph||a.name[0]||'A')}</span></div>`;
  }
  function renderGrid(){
    const grid = $('#ag-grid'); if(!grid) return;
    grid.innerHTML='';
    AGENTS.forEach(a=>{
      const el=document.createElement('div'); el.className='ag-card';
      el.innerHTML=`
        <div class="ac-top">
          ${iconHTML(a)}
          <div class="ac-meta"><div class="ac-name">${esc(a.name)}</div><div class="ac-role">${esc(a.role)}</div></div>
          <div class="ac-edit" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </div>
        </div>
        <div class="ac-desc">${esc(a.prompt)}</div>
        <div class="ac-stats">
          <span class="ac-stat"><b>${a.caps.length}</b> tools</span>
          <span class="ac-stat"><b>${a.kbs.length}</b> knowledge bases</span>
          <span class="ac-stat"><b>${a.sources.length}</b> sources</span>
        </div>
        <button class="ac-run">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Run agent
        </button>`;
      el.querySelector('.ac-edit').addEventListener('click', ()=>openBuilder(a));
      el.querySelector('.ac-run').addEventListener('click', ()=>openRun(a));
      grid.appendChild(el);
    });
    const tab=$('.tab[data-tab="agents"]'); if(tab){ tab.dataset.meta=`${AGENTS.length} AGENTS · LOCAL`; if($('#panel-title')?.textContent==='Agents') $('#panel-meta').textContent=tab.dataset.meta; }
  }

  /* ---------- builder ---------- */
  let draft = null, editingId = null;
  function blank(){ return { name:'', color:COLORS[0], glyph:'', role:'', prompt:'', caps:[], connectors:[], kbs:[], sources:[] }; }

  function openBuilder(agent){
    editingId = agent ? agent.id : null;
    draft = agent ? JSON.parse(JSON.stringify(agent)) : blank();
    if(!Array.isArray(draft.connectors)) draft.connectors = [];
    $('#ag-builder .ag-db').innerHTML = builderHTML();
    $('#ag-title').textContent = agent ? 'Edit agent' : 'New agent';
    bindBuilder();
    $('#ag-builder').classList.add('open');
    A.SFX.blip();
  }
  function closeBuilder(){ $('#ag-builder').classList.remove('open'); A.SFX.tab(); }

  function connChips(){
    const list = window.JCONNECTORS || [];
    return list.map(s=>`<div class="conn-chip${draft.connectors.includes(s.name)?' on':''}" data-conn="${esc(s.name)}" title="${esc(s.name)}"><i class="cc-ico" style="background:${esc(s.color)}"><img src="assets/brands/${esc(s.icon)}.svg" alt="" onerror="this.style.display='none'"></i><span>${esc(s.name)}</span></div>`).join('');
  }
  function builderHTML(){
    const caps = CAPS.map(c=>`<div class="cap${draft.caps.includes(c.id)?' on':''}" data-cap="${c.id}"><span class="cap-box"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M5 12l5 5L20 6"/></svg></span>${esc(c.name)}</div>`).join('');
    const sw = COLORS.map(c=>`<div class="ag-sw${draft.color===c?' on':''}" data-color="${c}" style="background:${c}"></div>`).join('');
    const kbOpts = KB_OPTS.filter(k=>!draft.kbs.includes(k)).map(k=>`<div class="kb-opt" data-kb="${esc(k)}">+ ${esc(k)}</div>`).join('');
    return `
      <div class="ag-sec">
        <span class="lab">Identity <span class="req">*</span></span>
        <div class="ag-identity">
          <div class="ag-prev" id="ag-prev" style="background:${draft.color}">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,.32)" stroke-width="1.6"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/></svg>
            <span class="ac-glyph" id="ag-prev-glyph">${esc(draft.glyph||(draft.name[0]||'A'))}</span>
          </div>
          <div style="flex:1">
            <input class="ag-input" id="ag-name" placeholder="Agent name (e.g. Research Analyst)" value="${esc(draft.name)}" style="margin-bottom:9px">
            <div class="ag-swatches" id="ag-swatches">${sw}</div>
          </div>
        </div>
      </div>

      <div class="ag-sec">
        <span class="lab">Primary role <span class="req">*</span></span>
        <div class="sub">The agent’s main job — its default directive when you give it a task.</div>
        <input class="ag-input" id="ag-role" placeholder="e.g. Search the web, read sources and synthesize briefs" value="${esc(draft.role)}">
      </div>

      <div class="ag-sec">
        <span class="lab">Connectors</span>
        <div class="sub">Pick the accounts this agent may act through (from your Connectors).</div>
        <div class="conn-grid" id="ag-conns">${connChips()}</div>
      </div>

      <div class="ag-sec">
        <span class="lab">System prompt</span>
        <textarea class="ag-textarea" id="ag-prompt" placeholder="How this agent should think and behave…">${esc(draft.prompt)}</textarea>
      </div>

      <div class="ag-sec">
        <span class="lab">Capabilities</span>
        <div class="sub">The tools and skills this agent is allowed to use.</div>
        <div class="cap-grid" id="ag-caps">${caps}</div>
      </div>

      <div class="ag-sec">
        <span class="lab">Knowledge bases</span>
        <div class="sub">Vault collections and links the agent reads from.</div>
        <div class="kb-pick" id="ag-kbpick">${kbOpts}</div>
        <div class="link-list" id="ag-kbs"></div>
        <div class="link-add"><input id="ag-kb-input" placeholder="Add a vault path or KB link…"><button id="ag-kb-add">ADD</button></div>
      </div>

      <div class="ag-sec">
        <span class="lab">Sources to study</span>
        <div class="sub">Repos, GitHubs and pages the agent should review as reference.</div>
        <div class="link-list" id="ag-sources"></div>
        <div class="link-add"><input id="ag-src-input" placeholder="github.com/org/repo or https://…"><button id="ag-src-add">ADD</button></div>
      </div>`;
  }

  function renderLinks(){
    const kb=$('#ag-kbs'), src=$('#ag-sources');
    kb.innerHTML = draft.kbs.map((l,i)=>linkRow(l,'kb',i,'book')).join('') || '';
    src.innerHTML = draft.sources.map((l,i)=>linkRow(l,'src',i,'git')).join('') || '';
    kb.querySelectorAll('.li-x').forEach(x=> x.addEventListener('click',()=>{ draft.kbs.splice(+x.dataset.i,1); renderLinks(); refreshKbPick(); A.SFX.tab(); }));
    src.querySelectorAll('.li-x').forEach(x=> x.addEventListener('click',()=>{ draft.sources.splice(+x.dataset.i,1); renderLinks(); A.SFX.tab(); }));
  }
  function linkRow(text, kind, i, ico){
    const icon = ico==='git'
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.2 2 5.2 2.3 5.2 2.3a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 3.8 8.7c0 4.7 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M9 3v18"/></svg>';
    return `<div class="link-item"><span class="li-ico">${icon}</span><span class="li-text">${esc(text)}</span><span class="li-x" data-i="${i}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></span></div>`;
  }
  function refreshKbPick(){
    const pick=$('#ag-kbpick'); if(!pick) return;
    pick.innerHTML = KB_OPTS.filter(k=>!draft.kbs.includes(k)).map(k=>`<div class="kb-opt" data-kb="${esc(k)}">+ ${esc(k)}</div>`).join('');
    pick.querySelectorAll('.kb-opt').forEach(o=> o.addEventListener('click',()=>{ draft.kbs.push(o.dataset.kb); renderLinks(); refreshKbPick(); A.SFX.blip(); }));
  }

  function bindBuilder(){
    const root=$('#ag-builder');
    root.querySelector('#ag-name').addEventListener('input', e=>{ draft.name=e.target.value; $('#ag-prev-glyph').textContent = draft.glyph || (draft.name[0]||'A').toUpperCase(); });
    root.querySelector('#ag-role').addEventListener('input', e=> draft.role=e.target.value);
    root.querySelector('#ag-prompt').addEventListener('input', e=> draft.prompt=e.target.value);
    root.querySelectorAll('#ag-swatches .ag-sw').forEach(s=> s.addEventListener('click',()=>{
      draft.color=s.dataset.color; root.querySelectorAll('.ag-sw').forEach(x=>x.classList.toggle('on',x===s)); $('#ag-prev').style.background=draft.color; A.SFX.tab();
    }));
    root.querySelectorAll('#ag-caps .cap').forEach(c=> c.addEventListener('click',()=>{
      const id=c.dataset.cap; const i=draft.caps.indexOf(id);
      if(i>=0) draft.caps.splice(i,1); else draft.caps.push(id);
      c.classList.toggle('on'); A.SFX.tab();
    }));
    root.querySelectorAll('#ag-conns .conn-chip').forEach(c=> c.addEventListener('click',()=>{
      const id=c.dataset.conn; const i=draft.connectors.indexOf(id);
      if(i>=0) draft.connectors.splice(i,1); else draft.connectors.push(id);
      c.classList.toggle('on'); A.SFX.tab();
    }));
    const addLink=(inputSel, arr)=>{
      const inp=root.querySelector(inputSel); const v=inp.value.trim();
      if(v){ draft[arr].push(v); inp.value=''; renderLinks(); if(arr==='kbs') refreshKbPick(); A.SFX.blip(); }
    };
    root.querySelector('#ag-kb-add').addEventListener('click', ()=>addLink('#ag-kb-input','kbs'));
    root.querySelector('#ag-kb-input').addEventListener('keydown', e=>{ if(e.key==='Enter') addLink('#ag-kb-input','kbs'); });
    root.querySelector('#ag-src-add').addEventListener('click', ()=>addLink('#ag-src-input','sources'));
    root.querySelector('#ag-src-input').addEventListener('keydown', e=>{ if(e.key==='Enter') addLink('#ag-src-input','sources'); });
    renderLinks(); refreshKbPick();
  }

  function saveAgent(){
    if(!draft.name.trim()){ const n=$('#ag-name'); n.style.borderColor='var(--danger)'; n.focus(); A.SFX.off(); return; }
    draft.glyph = (draft.glyph || draft.name.trim()[0]).toUpperCase();
    if(editingId){ const idx=AGENTS.findIndex(a=>a.id===editingId); if(idx>=0) AGENTS[idx]=draft; }
    else { draft.id='a'+(++uid); AGENTS.push(draft); }
    saveAgents(); A.SFX.chime(); renderGrid(); closeBuilder();
  }

  /* ---------- run chat ---------- */
  let runAgent = null;
  function openRun(a){
    runAgent=a;
    const head=$('#run-head-fill');
    head.innerHTML = `
      <div class="rh-ico" style="background:${a.color}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,.32)" stroke-width="1.6"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/></svg><span class="ac-glyph">${esc(a.glyph)}</span></div>
      <div class="rh-meta"><div class="rh-name">${esc(a.name)}</div><div class="rh-role"><span class="led"></span>${esc(a.role)}</div></div>
      <div class="x" id="run-close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></div>`;
    head.querySelector('#run-close').addEventListener('click', closeRun);
    $('#run-stream').innerHTML='';
    // chips: derived from caps/role
    const chips = chipSuggestions(a);
    const cr=$('#run-chips'); cr.innerHTML = chips.map(c=>`<span class="run-chip">${esc(c)}</span>`).join('');
    cr.querySelectorAll('.run-chip').forEach(ch=> ch.addEventListener('click',()=>{ $('#run-input').value=ch.textContent; sendRun(); }));
    $('#run-modal').classList.add('open');
    A.SFX.listen();
    runMsg('a', `${a.name} online. ${a.role}. ${a.kbs.length?`I’ve loaded ${a.kbs.length} knowledge base${a.kbs.length>1?'s':''}`:'Ready'}${a.sources.length?` and ${a.sources.length} source${a.sources.length>1?'s':''}`:''}. What’s the task, Sir?`, true);
    setTimeout(()=>$('#run-input')?.focus(), 80);
  }
  function closeRun(){ $('#run-modal').classList.remove('open'); A.SFX.tab(); }
  function chipSuggestions(a){
    const out=[];
    if(a.caps.includes('web')) out.push('Find the latest on …');
    if(a.caps.includes('mail')) out.push('Triage my inbox');
    if(a.caps.includes('system')) out.push('Build and deploy the site');
    if(a.caps.includes('code')) out.push('Review the repo and plan a change');
    if(a.caps.includes('vault')) out.push('Summarize what we know about …');
    if(a.caps.includes('finance')) out.push('Break down this month’s spend');
    return out.slice(0,3).length?out.slice(0,3):['Give me a status'];
  }
  function runMsg(who, text, instant){
    const stream=$('#run-stream');
    const el=document.createElement('div'); el.className='msg '+(who==='a'?'j':'u');
    el.innerHTML=`<div class="av" style="${who==='a'&&runAgent?`background:${runAgent.color};color:#06080c;box-shadow:0 0 12px ${runAgent.color}66`:''}">${who==='a'?esc(runAgent.glyph):'YOU'}</div><div class="body"><div class="who">${who==='a'?esc(runAgent.name):'You'}</div><div class="txt"></div></div>`;
    stream.appendChild(el); const txt=el.querySelector('.txt');
    if(instant){ txt.textContent=text; }
    else { let i=0; const iv=setInterval(()=>{ txt.textContent=text.slice(0,++i); stream.scrollTop=stream.scrollHeight; if(i>=text.length) clearInterval(iv); },14); }
    stream.scrollTop=stream.scrollHeight;
    return el;
  }
  /* ---------- core-backed agent run (Tauri): stream on agent_* channel ---------- */
  let agentBubble=null, agentTyping=null, agentReply='';
  function agentTok(tok){
    if(agentTyping){ agentTyping.remove(); agentTyping=null; }
    if(!agentBubble){ const el=runMsg('a','',true); agentBubble=el.querySelector('.txt'); }
    agentBubble.textContent += tok; agentReply += tok;
    const s=$('#run-stream'); if(s) s.scrollTop=s.scrollHeight;
  }
  function agentTool(tc){
    if(agentTyping){ agentTyping.remove(); agentTyping=null; }
    agentBubble=null;
    if(tc.name==='computer_run'){ renderAgentSysConfirm(tc.args||{}); return; } // approval card, not auto-applied
    const color=runAgent?runAgent.color:'#00d4ff', glyph=runAgent?runAgent.glyph:'A', name=runAgent?runAgent.name:'Agent';
    const el=document.createElement('div'); el.className='msg j';
    el.innerHTML=`<div class="av" style="background:${color};color:#06080c">${esc(glyph)}</div><div class="body"><div class="who">${esc(name)}</div><div class="txt"><div class="tool-call"><div class="tc-head">⚙ tool · ${esc(tc.name)}<span class="tc-ok">✓ ok</span></div><div class="tc-body">${esc(JSON.stringify(tc.args||{}))}</div></div></div></div>`;
    $('#run-stream').appendChild(el); $('#run-stream').scrollTop=$('#run-stream').scrollHeight;
    try{ window.JTOOLS && window.JTOOLS[tc.name] && window.JTOOLS[tc.name](tc.args||{}); }catch(e){}
  }

  // shell command proposed by an agent → approval card in the run view (§17).
  // Same safety as the main chat: nothing runs until the user clicks RUN; the
  // result and an audit-log entry follow. Gated by the global toggle in core.
  function renderAgentSysConfirm(args){
    const cmd=String(args.command||'').trim(); const why=String(args.why||'').trim();
    if(!cmd) return;
    const color=runAgent?runAgent.color:'#00d4ff', glyph=runAgent?runAgent.glyph:'A', name=runAgent?runAgent.name:'Agent';
    const stream=$('#run-stream');
    const el=document.createElement('div'); el.className='msg j';
    el.innerHTML=`<div class="av" style="background:${color};color:#06080c">${esc(glyph)}</div><div class="body"><div class="who">${esc(name)}</div><div class="txt">
      <div class="tool-call sys-card"><div class="tc-head">⌘ computer · approval required</div><div class="tc-body">
        <div class="sc-cmd">${esc(cmd)}</div>
        ${why?`<div class="sc-why">${esc(why)}</div>`:''}
        <div class="sc-actions"><button class="btn primary sc-run">RUN</button><button class="btn ghost sc-deny">CANCEL</button></div>
      </div></div></div></div>`;
    stream.appendChild(el); stream.scrollTop=stream.scrollHeight;
    const body=el.querySelector('.tc-body'), runBtn=el.querySelector('.sc-run'), denyBtn=el.querySelector('.sc-deny');
    const finish=(cls,text)=>{ el.querySelector('.sc-actions')?.remove(); const s=document.createElement('div'); s.className='sc-status '+cls; s.textContent=text; body.appendChild(s); stream.scrollTop=stream.scrollHeight; };
    const logEntry=(entry)=>{ try{ const log=STORE.load('syslog',[])||[]; log.push(entry); while(log.length>100) log.shift(); STORE.save('syslog',log); window.JSYS?.renderSysLog(); }catch(e){} };
    const now=()=> new Date().toLocaleString();
    denyBtn.addEventListener('click', ()=>{ finish('deny','✕ DENIED — not executed'); logEntry({ts:now(),cmd,via:name,status:'denied'}); A.SFX.off(); });
    runBtn.addEventListener('click', async ()=>{
      runBtn.disabled=denyBtn.disabled=true; runBtn.textContent='RUNNING…';
      try{
        const r=await BRIDGE.invoke('system_execute', { command:cmd });
        const out=[r.stdout,r.stderr].filter(s=>s&&s.trim()).join('\n').trim();
        if(out){ const pre=document.createElement('div'); pre.className='sc-out'; pre.textContent=out; body.insertBefore(pre, el.querySelector('.sc-actions')); }
        const ok=r.code===0 && !r.timed_out;
        finish(ok?'ok':'err', r.timed_out?'⏱ TIMEOUT — killed after 30s':(ok?'✓ exit 0':'⚠ exit '+r.code));
        logEntry({ts:now(),cmd,via:name,code:r.code,timed_out:!!r.timed_out});
        A.SFX.chime();
      }catch(err){ finish('err','⚠ '+String(err)); logEntry({ts:now(),cmd,via:name,status:'error'}); A.SFX.off(); }
    });
  }
  // per-agent-run conversation memory (resets when a different agent is opened)
  let agentConvo=[]; const AGENT_CONVO_MAX=16; let agentConvoFor=null;
  async function initAgentCore(){
    if(!(window.BRIDGE && window.BRIDGE.inTauri)) return;
    await BRIDGE.listen('agent_token', agentTok);
    await BRIDGE.listen('agent_tool_call', agentTool);
    await BRIDGE.listen('agent_done', ()=>{
      if(agentReply && agentReply.trim()){ agentConvo.push({role:'assistant', content:agentReply.trim()});
        while(agentConvo.length>AGENT_CONVO_MAX) agentConvo.shift(); }
      agentBubble=null;
    });
  }

  function sendRun(){
    const inp=$('#run-input'); const v=inp.value.trim(); if(!v||!runAgent) return;
    inp.value=''; runMsg('u', v); A.SFX.blip();
    const a=runAgent;

    // route through the core when running in the Tauri app
    if(window.BRIDGE && window.BRIDGE.inTauri){
      agentBubble=null; agentReply='';
      if(agentConvoFor!==a.id){ agentConvo=[]; agentConvoFor=a.id; }  // fresh memory per agent
      const history=agentConvo.slice();
      agentConvo.push({role:'user', content:v});
      agentTyping=document.createElement('div'); agentTyping.className='msg j';
      agentTyping.innerHTML=`<div class="av" style="background:${a.color};color:#06080c">${esc(a.glyph)}</div><div class="body"><div class="who">${esc(a.name)}</div><div class="typing"><span></span><span></span><span></span></div></div>`;
      $('#run-stream').appendChild(agentTyping); $('#run-stream').scrollTop=$('#run-stream').scrollHeight;
      BRIDGE.invoke('agent_send', { text:v, caps:a.caps||[], state:(window.JSTATE?window.JSTATE():null), persona:{ prompt:a.prompt||'', name:'' }, history })
        .catch(err=>{ if(agentTyping){agentTyping.remove();agentTyping=null;} runMsg('a','Core error: '+String(err), true); });
      return;
    }

    // typing indicator
    const t=document.createElement('div'); t.className='msg j';
    t.innerHTML=`<div class="av" style="background:${a.color};color:#06080c">${esc(a.glyph)}</div><div class="body"><div class="who">${esc(a.name)}</div><div class="typing"><span></span><span></span><span></span></div></div>`;
    $('#run-stream').appendChild(t); $('#run-stream').scrollTop=$('#run-stream').scrollHeight;
    A.SFX.think();
    setTimeout(()=>{
      t.remove();
      const steps=[];
      if(a.caps.includes('web')||a.sources.length) steps.push('searching '+(a.sources[0]||'the web'));
      if(a.kbs.length) steps.push('reading '+a.kbs[0]);
      if(a.caps.includes('tasks')) steps.push('logging follow-ups');
      const plan = steps.length?`Working on it — ${steps.join(', ')}. `:'On it. ';
      runMsg('a', `${plan}Here’s my approach: I’ll break “${v}” into steps, pull from my ${a.kbs.length} knowledge base${a.kbs.length===1?'':'s'}, and report back with a concise summary and next actions.`);
    }, 750+Math.random()*500);
  }

  /* ---------- inject overlays ---------- */
  function injectOverlays(){
    const b=document.createElement('div'); b.className='ag-modal'; b.id='ag-builder';
    b.innerHTML=`<div class="ag-dialog">
      <div class="ag-dh"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><circle cx="12" cy="12" r="3"/></svg><h2 id="ag-title">New agent</h2><div class="x" id="ag-close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></div></div>
      <div class="ag-db"></div>
      <div class="ag-df"><button class="btn ghost" id="ag-cancel" style="margin-left:auto">CANCEL</button><button class="btn primary" id="ag-save">SAVE AGENT</button></div>
    </div>`;
    document.body.appendChild(b);
    const r=document.createElement('div'); r.className='run-modal'; r.id='run-modal';
    r.innerHTML=`<div class="run-dialog">
      <div class="run-head" id="run-head-fill"></div>
      <div class="run-stream" id="run-stream"></div>
      <div class="run-chips" id="run-chips"></div>
      <div class="run-composer"><span class="prompt">›</span><input id="run-input" placeholder="Give the agent a task…" autocomplete="off"><button class="send" id="run-send">SEND</button></div>
    </div>`;
    document.body.appendChild(r);

    $('#ag-close').addEventListener('click', closeBuilder);
    $('#ag-cancel').addEventListener('click', closeBuilder);
    $('#ag-save').addEventListener('click', saveAgent);
    b.addEventListener('click', e=>{ if(e.target===b) closeBuilder(); });
    r.addEventListener('click', e=>{ if(e.target===r) closeRun(); });
    $('#run-send').addEventListener('click', sendRun);
    $('#run-input').addEventListener('keydown', e=>{ if(e.key==='Enter') sendRun(); });
    addEventListener('keydown', e=>{ if(e.key==='Escape'){ if($('#run-modal').classList.contains('open')) closeRun(); else if($('#ag-builder').classList.contains('open')) closeBuilder(); } });
    $('#ag-new')?.addEventListener('click', ()=>openBuilder(null));
  }

  injectOverlays();
  renderGrid();
  initAgentCore();
})();
