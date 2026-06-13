/* ============================================================
   finance.js — CoinKeeper-style budget logic
   accounts · category envelopes · expense/income · safe-to-spend
   ============================================================ */
(function(){
  const A = window.JAUDIO || { SFX:new Proxy({},{get:()=>()=>{}}) };
  const $ = s => document.querySelector(s);
  const DAYS_LEFT = 14;

  const DEFAULT_ACCOUNTS = [
    { id:'card', name:'Main Card', balance:8450, color:'#00d4ff' },
    { id:'cash', name:'Cash',      balance:1200, color:'#41e0a3' },
    { id:'save', name:'Savings',   balance:21000, color:'#ffb347' },
  ];
  const DEFAULT_CATS = [
    { id:'workshop',  name:'Workshop',  budget:3000, spent:1840, color:'#00d4ff', glyph:'W' },
    { id:'food',      name:'Food',      budget:800,  spent:512,  color:'#ff8a5b', glyph:'F' },
    { id:'home',      name:'Home',      budget:1200, spent:640,  color:'#ffb347', glyph:'H' },
    { id:'transport', name:'Transport', budget:300,  spent:96,   color:'#41e0a3', glyph:'T' },
    { id:'leisure',   name:'Leisure',   budget:500,  spent:470,  color:'#c98bff', glyph:'L' },
    { id:'health',    name:'Health',    budget:400,  spent:120,  color:'#ff5b8a', glyph:'+' },
  ];
  const DEFAULT_TXNS = [
    { id:1, kind:'expense', cat:'workshop', acct:'card', amount:1840, label:'Tungsten lot', date:'Jun 06' },
    { id:2, kind:'income',  cat:null,       acct:'card', amount:6050, label:'Licensing royalty — clean energy patent', date:'Jun 04' },
    { id:3, kind:'expense', cat:'food',     acct:'cash', amount:64,   label:'Lunch — Stark Tower café', date:'Jun 03' },
    { id:4, kind:'expense', cat:'leisure',  acct:'card', amount:120,  label:'Concert tickets', date:'Jun 02' },
  ];
  const fp = STORE.load('finance', null);
  let ACCOUNTS = (fp && fp.accounts) || DEFAULT_ACCOUNTS;
  let CATS     = (fp && fp.cats)     || DEFAULT_CATS;
  let TXNS     = (fp && fp.txns)     || DEFAULT_TXNS;
  let tid      = (fp && fp.tid)      || 50;
  function saveFinance(){ STORE.save('finance', { accounts:ACCOUNTS, cats:CATS, txns:TXNS, tid }); }

  const fmt = n => (n<0?'-':'') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const acct = id => ACCOUNTS.find(a=>a.id===id);
  const cat  = id => CATS.find(c=>c.id===id);

  /* ---------- render ---------- */
  function renderHead(){
    $('#fin-total').textContent = fmt(ACCOUNTS.reduce((s,a)=>s+a.balance,0));
    const box = $('#fin-accounts'); box.innerHTML='';
    ACCOUNTS.forEach(a=>{
      const el=document.createElement('div'); el.className='acct';
      el.innerHTML=`<div class="a-name"><span class="a-dot" style="background:${a.color}"></span>${esc(a.name)}</div><div class="a-bal">${fmt(a.balance)}</div>`;
      box.appendChild(el);
    });
    const tab=$('.tab[data-tab="finance"]');
    if(tab){ tab.dataset.meta = 'BALANCE '+fmt(ACCOUNTS.reduce((s,a)=>s+a.balance,0)); if($('#panel-title')?.textContent==='Finance') $('#panel-meta').textContent=tab.dataset.meta; }
  }
  function renderSummary(){
    const budget = CATS.reduce((s,c)=>s+c.budget,0);
    const spent  = CATS.reduce((s,c)=>s+c.spent,0);
    const left   = budget - spent;
    const safe   = Math.max(0, left/DAYS_LEFT);
    const pct    = budget > 0 ? Math.min(100, spent/budget*100) : 0;
    const box = $('#fin-summary'); box.innerHTML='';
    box.innerHTML = `
      <div class="safe">
        <div class="s-lbl">Safe to spend today</div>
        <div class="s-val">${fmt(safe)}</div>
        <div class="s-sub">${fmt(left)} left · ${DAYS_LEFT} days remaining</div>
      </div>
      <div class="mbudget">
        <div class="mb-top"><span>Monthly budget</span><b>${fmt(spent)} / ${fmt(budget)}</b></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${pct>90?'linear-gradient(90deg,#ff4466,#ff8a5b)':'linear-gradient(90deg,var(--accent2),var(--accent))'}"></div></div>
        <div class="mb-legend"><span>${Math.round(pct)}% used</span><span class="${left<0?'over':''}">${left<0?'over by '+fmt(-left):fmt(left)+' remaining'}</span></div>
      </div>`;
  }
  function renderCats(){
    const grid=$('#cat-grid'); grid.innerHTML='';
    CATS.forEach(c=>{
      const pct = c.budget? c.spent/c.budget*100 : 0;
      const over = c.spent>c.budget;
      const left = c.budget-c.spent;
      const el=document.createElement('div');
      el.className='cat'+(over?' over':''); el.style.setProperty('--c',c.color);
      el.innerHTML=`
        <div class="cring" style="--p:${Math.min(100,pct)}"><span class="cp">${Math.round(pct)}%</span></div>
        <div class="cname">${esc(c.name)}</div>
        <div class="cmeta">${fmt(c.spent)} / ${fmt(c.budget)}</div>
        <div class="cleft ${over?'bad':'ok'}">${over?fmt(-left)+' over':fmt(left)+' left'}</div>`;
      el.addEventListener('click', ()=> openEntry('expense', c.id));
      grid.appendChild(el);
    });
  }
  function renderTxns(flashId){
    const list=$('#txn-list'); list.innerHTML='';
    TXNS.slice().reverse().forEach(t=>{
      const c = t.cat?cat(t.cat):null;
      const color = c?c.color:'#41e0a3';
      const glyph = c?c.glyph:'↓';
      const el=document.createElement('div'); el.className='txn'+(t.id===flashId?' flash':'');
      el.innerHTML=`
        <div class="t-ico" style="background:${color}">${esc(glyph)}</div>
        <div class="t-main"><div class="t-label">${esc(t.label||(c?c.name:'Income'))}</div><div class="t-sub">${esc(acct(t.acct)?.name||'')} · ${esc(t.date)}</div></div>
        <div class="t-amt ${t.kind==='expense'?'neg':'pos'}">${t.kind==='expense'?'−':'+'}${fmt(t.amount)}</div>`;
      list.appendChild(el);
    });
  }
  function renderAll(flashId){ renderHead(); renderSummary(); renderCats(); renderTxns(flashId); }

  /* ---------- mutations ---------- */
  function todayLabel(){ return new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  function addExpense(catId, acctId, amount, label){
    const c=cat(catId), a=acct(acctId); if(!c||!a) return;
    c.spent+=amount; a.balance-=amount;
    const id=++tid; TXNS.push({id, kind:'expense', cat:catId, acct:acctId, amount, label:label||c.name, date:todayLabel()});
    saveFinance(); A.SFX.blip(); renderAll(id);
  }
  function addIncome(acctId, amount, label){
    const a=acct(acctId); if(!a) return;
    a.balance+=amount;
    const id=++tid; TXNS.push({id, kind:'income', cat:null, acct:acctId, amount, label:label||'Income', date:todayLabel()});
    saveFinance(); A.SFX.listen(); renderAll(id);
  }

  /* ---------- quick entry ---------- */
  let entry = { mode:'expense', cat:CATS[0].id, acct:'card' };
  function openEntry(mode, catId){
    entry.mode = mode||'expense';
    if(catId) entry.cat = catId;
    const box=$('#fin-entry'); box.hidden=false;
    box.innerHTML = entryHTML();
    bindEntry();
    A.SFX.tab();
    setTimeout(()=>box.querySelector('.fe-amt input')?.focus(),40);
  }
  function closeEntry(){ const b=$('#fin-entry'); b.hidden=true; b.innerHTML=''; }
  function entryHTML(){
    const catChips = CATS.map(c=>`<div class="fe-chip${entry.cat===c.id?' on':''}" data-cat="${c.id}"><span class="fc-dot" style="background:${c.color}"></span>${esc(c.name)}</div>`).join('');
    const acctChips = ACCOUNTS.map(a=>`<div class="fe-chip${entry.acct===a.id?' on':''}" data-acct="${a.id}"><span class="fc-dot" style="background:${a.color}"></span>${esc(a.name)}</div>`).join('');
    return `
      <div class="fe-top">
        <div class="fe-seg">
          <button data-m="expense" class="${entry.mode==='expense'?'on':''}">EXPENSE</button>
          <button data-m="income" class="${entry.mode==='income'?'on':''}">INCOME</button>
        </div>
        <div class="fe-amt"><span class="cur">$</span><input type="number" min="0" step="1" placeholder="0" inputmode="decimal"></div>
      </div>
      <div class="fe-label"><input type="text" placeholder="${entry.mode==='expense'?'What for? (optional)':'Source (optional)'}"></div>
      ${entry.mode==='expense'?`<div class="fe-block"><div class="fe-hint">Category</div><div class="fe-chips" id="fe-cats">${catChips}</div></div>`:''}
      <div class="fe-block"><div class="fe-hint">${entry.mode==='expense'?'Paid from':'Into'} account</div><div class="fe-chips" id="fe-accts">${acctChips}</div></div>
      <div class="fe-foot">
        <span class="fe-err" id="fe-err">Enter an amount</span>
        <button class="fin-btn" id="fe-cancel" style="margin-left:auto;color:var(--text-dim)">CANCEL</button>
        <button class="fin-btn ${entry.mode==='expense'?'exp':'inc'}" id="fe-add">ADD ${entry.mode==='expense'?'EXPENSE':'INCOME'}</button>
      </div>`;
  }
  function bindEntry(){
    const box=$('#fin-entry');
    box.querySelectorAll('.fe-seg button').forEach(b=> b.addEventListener('click', ()=>{ openEntry(b.dataset.m, entry.cat); }) );
    box.querySelectorAll('#fe-cats .fe-chip').forEach(ch=> ch.addEventListener('click', ()=>{ entry.cat=ch.dataset.cat; box.querySelectorAll('#fe-cats .fe-chip').forEach(x=>x.classList.toggle('on',x===ch)); A.SFX.tab(); }) );
    box.querySelectorAll('#fe-accts .fe-chip').forEach(ch=> ch.addEventListener('click', ()=>{ entry.acct=ch.dataset.acct; box.querySelectorAll('#fe-accts .fe-chip').forEach(x=>x.classList.toggle('on',x===ch)); A.SFX.tab(); }) );
    $('#fe-cancel').addEventListener('click', closeEntry);
    const commit=()=>{
      const amt = parseFloat(box.querySelector('.fe-amt input').value);
      const label = box.querySelector('.fe-label input').value.trim();
      if(!amt||amt<=0){ const e=$('#fe-err'); e.classList.add('show'); A.SFX.off(); return; }
      if(entry.mode==='expense') addExpense(entry.cat, entry.acct, amt, label);
      else addIncome(entry.acct, amt, label);
      closeEntry();
    };
    $('#fe-add').addEventListener('click', commit);
    box.querySelector('.fe-amt input').addEventListener('keydown', e=>{ if(e.key==='Enter') commit(); });
  }

  function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // tool-call handler (core → panel): record an expense
  window.JTOOLS = window.JTOOLS || {};
  window.JTOOLS.finance_add_expense = (a)=>{
    const q = String(a.category||'').toLowerCase();
    const c = CATS.find(x=>x.id===q) || CATS.find(x=>x.name.toLowerCase()===q) || CATS[0];
    addExpense(c.id, 'card', Number(a.amount)||0, a.label||'');
  };

  // wire top buttons (exist in DOM)
  document.addEventListener('DOMContentLoaded', init);
  if(document.readyState!=='loading') init();
  function init(){
    if($('#fin-init-done')) return;
    const exp=$('#fin-add-exp'), inc=$('#fin-add-inc');
    if(!exp) return;
    const flag=document.createElement('span'); flag.id='fin-init-done'; flag.hidden=true; document.body.appendChild(flag);
    exp.addEventListener('click', ()=>openEntry('expense'));
    inc.addEventListener('click', ()=>openEntry('income'));
    renderAll();
  }
})();
