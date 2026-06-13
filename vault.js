/* ============================================================
   vault.js — knowledge vault: notes, search, tag filter, editor.
   Local-first store (localStorage via STORE) with [[wikilinks]] and
   backlink counts. Stands in for the markdown vault + embeddings of
   spec §12; semantic search arrives once embeddings are wired.
   ============================================================ */
(function(){
  const A = window.JAUDIO || { SFX:new Proxy({},{get:()=>()=>{}}) };
  const $  = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const H = 3600e3, D = 86400e3;

  const NOTE_ICO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v5h5M14 3l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>';

  const DEFAULT_NOTES = [
    { id:'n1', title:'Arc reactor — design log', tags:['engineering','physics'],
      body:'Palladium core degrades under sustained load. Exploring vibranium-free synthesis path; see linked thermal model and the [[Casing dielectrics]] note for the leakage term.', updated: Date.now()-2*H },
    { id:'n2', title:'Assistant architecture', tags:['engineering','ideas'],
      body:'Local-first pipeline: STT → LLM(tools) → TTS. Turn-taking window 1.2–1.5s, barge-in on speech. Each skill is a function-calling module — links to [[Tool router]].', updated: Date.now()-1*D },
    { id:'n3', title:'SI board — Q3 priorities', tags:['meetings'],
      body:'Clean-energy licensing, defense divestment timeline, and the Expo keynote. Pepper to circulate the deck Monday; action items mirrored to the [[Tasks]] board.', updated: Date.now()-3*D },
    { id:'n4', title:'Reading — on-device LLMs', tags:['research','ideas'],
      body:'Notes pulled from 8 sources by the research skill. Quantized models within 4% of full precision; sanitize at the tokenizer. Synced from [[Research queue]].', updated: Date.now()-4*D },
    { id:'n5', title:'Morning routine', tags:['personal'],
      body:'Daily review with Jarvis at 07:30 — habits, calendar, top three. Linked to the tracker; mood + energy logged each evening.', updated: Date.now()-5*D },
    { id:'n6', title:'Materials — Ti-Au alloy', tags:['engineering','research'],
      body:'Fatigue life ~2× pure titanium at 79:21 ratio, +12% mass. Candidate for wearable structures. See [[Arc reactor — design log]].', updated: Date.now()-7*D },
  ];

  const vp = STORE.load('vault', null);
  let NOTES = (vp && vp.notes) || DEFAULT_NOTES;
  let nid   = (vp && vp.nid)   || 100;
  let activeTag = 'all';
  let query = '';
  function save(){ STORE.save('vault', { notes:NOTES, nid }); }

  /* ---------- helpers ---------- */
  const linksIn = body => (body.match(/\[\[([^\]]+)\]\]/g) || []).length;
  const totalLinks = () => NOTES.reduce((s,n)=>s+linksIn(n.body),0);
  function backlinks(note){
    const t = ('[['+note.title).toLowerCase();
    return NOTES.filter(n => n.id!==note.id && n.body.toLowerCase().includes(t)).length;
  }
  function rel(ts){
    const s=(Date.now()-ts)/1000;
    if(s<3600) return Math.max(1,Math.round(s/60))+'m AGO';
    if(s<86400) return Math.round(s/3600)+'h AGO';
    const d=Math.round(s/86400);
    return d<7 ? d+'d AGO' : Math.round(d/7)+'w AGO';
  }
  const wikilinks = text => esc(text).replace(/\[\[([^\]]+)\]\]/g, (_,m)=>`<span class="wl">${m}</span>`);
  function allTags(){ const set=new Set(); NOTES.forEach(n=>n.tags.forEach(t=>set.add(t))); return Array.from(set).sort(); }
  function matches(n){
    if(activeTag!=='all' && !n.tags.includes(activeTag)) return false;
    if(query){ const q=query.toLowerCase(); return n.title.toLowerCase().includes(q)||n.body.toLowerCase().includes(q)||n.tags.some(t=>t.toLowerCase().includes(q)); }
    return true;
  }

  /* ---------- render ---------- */
  function renderTags(){
    const row=$('#vault-tags'); if(!row) return;
    const tags=['all',...allTags()];
    row.innerHTML = tags.map(t=>`<span class="vtag${activeTag===t?' on':''}" data-tag="${esc(t)}">#${esc(t)}</span>`).join('');
    row.querySelectorAll('.vtag').forEach(el=> el.addEventListener('click', ()=>{ activeTag=el.dataset.tag; A.SFX.tab(); renderTags(); renderGrid(); }));
  }
  function renderGrid(){
    const grid=$('#vault-grid'); if(!grid) return;
    const items = NOTES.filter(matches).sort((a,b)=>b.updated-a.updated);
    grid.innerHTML='';
    items.forEach(n=>{
      const el=document.createElement('div'); el.className='note';
      const ex = n.body.length>180 ? n.body.slice(0,180)+'…' : n.body;
      el.innerHTML = `
        <div class="n-title">${NOTE_ICO}${esc(n.title)}</div>
        <div class="n-ex">${wikilinks(ex)}</div>
        <div class="n-tags">${n.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div>
        <div class="n-foot"><span class="n-links">⌘ ${backlinks(n)} backlinks</span><span>EDITED ${rel(n.updated)}</span></div>`;
      el.addEventListener('click', ()=> openEditor(n));
      grid.appendChild(el);
    });
    const empty=$('#vault-empty'); if(empty) empty.hidden = items.length>0;
    $('#vault-count').textContent = NOTES.length;
    $('#vault-links').textContent = totalLinks();
    const tab=$('.tab[data-tab="vault"]');
    if(tab){ tab.dataset.meta=`VAULT · ${NOTES.length} NOTES`; if($('#panel-title')?.textContent==='Knowledge') $('#panel-meta').textContent=tab.dataset.meta; }
  }

  /* ---------- editor ---------- */
  let editor=null, editingId=null;
  function ensureEditor(){
    if(editor) return editor;
    editor=document.createElement('div'); editor.className='vault-editor'; editor.hidden=true;
    editor.innerHTML=`
      <input id="ve-title" class="ve-title" placeholder="Note title">
      <textarea id="ve-body" class="ve-body" placeholder="Write… use [[Note title]] to link to another note"></textarea>
      <input id="ve-tags" class="ve-tags" placeholder="tags, comma separated">
      <div class="ve-foot">
        <button class="fin-btn" id="ve-del" style="color:var(--danger)">DELETE</button>
        <button class="fin-btn" id="ve-cancel" style="margin-left:auto;color:var(--text-dim)">CANCEL</button>
        <button class="fin-btn inc" id="ve-save">SAVE NOTE</button>
      </div>`;
    $('#view-vault').insertBefore(editor, $('#vault-grid'));
    editor.querySelector('#ve-cancel').addEventListener('click', closeEditor);
    editor.querySelector('#ve-save').addEventListener('click', saveEditor);
    editor.querySelector('#ve-del').addEventListener('click', delEditor);
    return editor;
  }
  function openEditor(note){
    ensureEditor();
    editingId = note ? note.id : null;
    editor.querySelector('#ve-title').value = note ? note.title : '';
    editor.querySelector('#ve-body').value  = note ? note.body  : '';
    editor.querySelector('#ve-tags').value  = note ? note.tags.join(', ') : '';
    editor.querySelector('#ve-del').style.display = note ? '' : 'none';
    editor.hidden=false; $('#vault-grid').style.display='none';
    const empty=$('#vault-empty'); if(empty) empty.hidden=true;
    A.SFX.blip(); setTimeout(()=>editor.querySelector('#ve-title').focus(),40);
  }
  function closeEditor(){ if(editor) editor.hidden=true; $('#vault-grid').style.display=''; renderGrid(); A.SFX.tab(); }
  function saveEditor(){
    const title=editor.querySelector('#ve-title').value.trim();
    if(!title){ editor.querySelector('#ve-title').focus(); A.SFX.off(); return; }
    const body=editor.querySelector('#ve-body').value.trim();
    const tags=editor.querySelector('#ve-tags').value.split(',').map(t=>t.trim().replace(/^#/,'')).filter(Boolean);
    if(editingId){ const n=NOTES.find(x=>x.id===editingId); if(n){ n.title=title; n.body=body; n.tags=tags; n.updated=Date.now(); } }
    else { NOTES.push({ id:'n'+(++nid), title, body, tags, updated:Date.now() }); }
    save(); A.SFX.chime(); editor.hidden=true; $('#vault-grid').style.display='';
    renderTags(); renderGrid();
  }
  function delEditor(){
    if(editingId){ NOTES=NOTES.filter(n=>n.id!==editingId); save(); A.SFX.off(); }
    editor.hidden=true; $('#vault-grid').style.display='';
    renderTags(); renderGrid();
  }

  /* ---------- init ---------- */
  function init(){
    if(!$('#vault-grid')) return;
    $('#vault-search')?.addEventListener('input', e=>{ query=e.target.value.trim(); renderGrid(); });
    $('#vault-new')?.addEventListener('click', ()=> openEditor(null));
    renderTags(); renderGrid();
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  // tool-call handler (core → panel): create a note
  window.JTOOLS = window.JTOOLS || {};
  window.JTOOLS.note_add = (a)=>{
    const tags = Array.isArray(a.tags) ? a.tags
      : (a.tags ? String(a.tags).split(',').map(t=>t.trim()).filter(Boolean) : []);
    NOTES.push({ id:'n'+(++nid), title:a.title||'Untitled', body:a.body||'', tags, updated:Date.now() });
    save(); renderTags(); renderGrid();
  };
})();
