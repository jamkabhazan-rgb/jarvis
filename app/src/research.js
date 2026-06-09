/* ============================================================
   research.js — reading queue. A research query queues a source,
   "summarizes" it, then marks it ready. Persisted locally.
   The canned summary is replaced by the real research_query tool
   (web search + summarize) once the OpenAI pipeline lands (§09/§10).
   ============================================================ */
(function(){
  const A = window.JAUDIO || { SFX:new Proxy({},{get:()=>()=>{}}) };
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const DEFAULT_QUEUE = [
    { id:'r1', title:'Adversarial robustness in on-device language models',
      sum:'Quantized local models stay within 4% of full-precision accuracy under common prompt-injection attacks; the largest gains come from input sanitization at the tokenizer, not from model size.',
      sources:8, read:'6 MIN READ', tags:'AI · SECURITY', status:'ready' },
    { id:'r2', title:'Titanium-gold alloy fatigue thresholds under cyclic load',
      sum:'Fatigue life roughly doubles versus pure titanium at the cost of ~12% added mass; the alloy’s sweet spot for wearable structures sits near a 79:21 ratio.',
      sources:3, read:'4 MIN READ', tags:'MATERIALS', status:'ready' },
    { id:'r3', title:'Edge inference latency: streaming vs. batched decoding',
      sum:'Sentence-level streaming cuts perceived response time by 60% even when total tokens are identical — confirming the spec’s “stream everything” latency strategy.',
      sources:6, read:'5 MIN READ', tags:'SYSTEMS', status:'ready' },
  ];
  const rp = STORE.load('research', null);
  let QUEUE = (rp && rp.queue) || DEFAULT_QUEUE;
  let rid = (rp && rp.rid) || 100;
  function save(){ STORE.save('research', { queue:QUEUE, rid }); }

  function cardHTML(r){
    const status = r.status==='ready'
      ? '<span class="r-status"><span class="dot"></span>SUMMARY READY</span>'
      : '<span class="r-status queued"><span class="dot"></span>SUMMARIZING…</span>';
    return `
      <div class="rthumb"></div>
      <div class="r-body">
        <div class="r-title">${esc(r.title)}</div>
        <p class="r-sum">${esc(r.sum)}</p>
        <div class="r-meta"><span>${r.sources} SOURCES</span><span>${esc(r.read)}</span><span>${esc(r.tags)}</span>${status}</div>
      </div>`;
  }
  function render(){
    const list=$('#rq-list'); if(!list) return;
    list.innerHTML='';
    QUEUE.forEach(r=>{
      const el=document.createElement('div'); el.className='rcard'; el.innerHTML=cardHTML(r);
      list.appendChild(el);
    });
    const tab=$('.tab[data-tab="research"]');
    if(tab){ tab.dataset.meta=`${QUEUE.length} SOURCES QUEUED`; if($('#panel-title')?.textContent==='Research') $('#panel-meta').textContent=tab.dataset.meta; }
  }

  function runQuery(q){
    q=q.trim(); if(!q) return;
    const id='r'+(++rid);
    QUEUE.unshift({ id, title:q, sum:'Searching the web, reading sources and summarizing…',
      sources:1+Math.floor(Math.random()*7), read:(2+Math.floor(Math.random()*6))+' MIN READ',
      tags:'QUEUED', status:'queued' });
    save(); render(); A.SFX.listen();
    setTimeout(()=>{
      const r=QUEUE.find(x=>x.id===id); if(!r) return;
      r.sum = `Pulled ${r.sources} sources on “${q}”. Key finding: the most-cited result directly addresses the question; cross-checks agree within the usual error bars. Open the brief for the full synthesis.`;
      r.tags = 'RESEARCH'; r.status='ready';
      save(); render(); A.SFX.chime();
    }, 1600);
  }

  function init(){
    if(!$('#rq-list')) return;
    const inp=$('#rsrch-input'), go=$('#rsrch-go');
    go?.addEventListener('click', ()=>{ runQuery(inp.value); inp.value=''; });
    inp?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ runQuery(inp.value); inp.value=''; } });
    render();
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  // tool-call handler (core → panel): queue a research task
  window.JTOOLS = window.JTOOLS || {};
  window.JTOOLS.research_query = (a)=>{ runQuery(a.query||''); };
})();
