/* ============================================================
   boot.js — cinematic loader phase machine
   kernel flood -> glitch logo -> welcome -> keyboard -> reveal
   Failsafe: any error or 12s timeout -> force reveal.
   ============================================================ */
(function(){
  const A = window.JAUDIO;
  const boot = { finished:false };
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  let stopDrone = ()=>{};

  const USER_NAME = 'Sir';

  /* ---- phase 1: kernel flood ---- */
  const KERNEL_TOKENS = [
    'INIT','MOUNT','LINK','EXEC','ALLOC','SYNC','BIND','SPAWN','PATCH','VERIFY',
    'kernel','core.rs','voice.pipe','orb.gl','tool.router','vault.idx','stt.whisper',
    'tts.stream','vad.silero','llm.local','permissions','sqlite','events','crypto.kc'
  ];
  const hex = n => '0x'+Array.from({length:n},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
  function kernelLine(){
    const tk = KERNEL_TOKENS[Math.floor(Math.random()*KERNEL_TOKENS.length)];
    const status = Math.random()<0.12 ? '<span class="wr">WAIT</span>' : '<span class="ok">OK</span>';
    return `<span class="k-line"><span class="hx">${hex(8)}</span>  ${tk.padEnd(14,' ')} ${hex(4)}  ::  ${status}</span>`;
  }
  async function phaseKernel(){
    const el = $('#kernel');
    stopDrone = A.rumble({f0:34, vol:0.10});
    A.muteAt(7);  // all loader audio fades out by 7s
    const buffer = [];
    const t0 = performance.now();
    while(performance.now()-t0 < 1500 && !boot.finished){
      const add = 2 + Math.floor(Math.random()*3);
      for(let i=0;i<add;i++) buffer.push(kernelLine());
      while(buffer.length>46) buffer.shift();  // rolling buffer
      el.innerHTML = buffer.join('');
      if(Math.random()<0.5) A.SFX.type();
      await sleep(46);
    }
    el.style.transition='opacity .35s'; el.style.opacity='0';
    await sleep(280); el.style.display='none';
  }

  /* ---- phase 2: glitch logo ---- */
  async function phaseLogo(){
    const stage = $('#logo-stage'); stage.classList.add('on');
    const logo = $('#logo-glitch');
    A.SFX.impact();
    logo.classList.add('glitch');
    await sleep(820);
    logo.classList.remove('glitch');
    await sleep(280);
    stage.style.transition='opacity .4s'; stage.style.opacity='0';
    await sleep(340); stage.classList.remove('on'); stage.style.opacity='';
  }

  /* ---- phase 3: welcome ---- */
  async function phaseWelcome(){
    const stage = $('#welcome-stage'); stage.classList.add('on');
    const out = $('#welcome-type');
    A.SFX.chime();
    const str = `Welcome back, ${USER_NAME}.`;
    out.textContent='';
    for(const ch of str){
      out.textContent += ch;
      if(ch!==' ') A.SFX.key();
      await sleep(36);
    }
    await sleep(420);
    stage.style.transition='opacity .4s'; stage.style.opacity='0';
    await sleep(320); stage.classList.remove('on'); stage.style.opacity='';
  }

  /* ---- phase 4: full-screen orb formation (cinematic + ominous) ---- */
  async function phaseOrbForm(){
    const stage = $('#orb-stage'); stage.classList.add('on');
    const canvas = $('#boot-orb');
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    const W = innerWidth, H = innerHeight;
    canvas.width = W*dpr; canvas.height = H*dpr;
    const cx = W/2, cy = H/2;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const R = Math.min(W,H)*0.26;

    const N = 900, ps = [];
    for(let i=0;i<N;i++){
      const t=Math.acos(2*Math.random()-1), p=Math.random()*Math.PI*2;
      ps.push({ t,p, r:R*(0.95+Math.random()*0.08),
        sx:(Math.random()-0.5)*W*1.7, sy:(Math.random()-0.5)*H*1.7,
        sp:0.5+Math.random()*1.0, jit:Math.random()*Math.PI*2, delay:Math.random()*0.45 });
    }
    const rings=[];

    // ---- scary sound design (no melody, just dread) ----
    const stopRumble = A.rumble({f0:27, vol:0.17});
    A.riser({dur:2.8, vol:0.15});
    setTimeout(()=>A.SFX.shriek(), 850);
    setTimeout(()=>A.SFX.shriek(), 1750);
    const growlT = setInterval(()=>{ if(Math.random()<0.55) A.SFX.growl(); }, 620);

    const T = 2200, t0 = performance.now();
    let rot=0, climaxed=false, flash=0;
    await new Promise(res=>{
      function frame(){
        if(boot.finished){ res(); return; }
        const e = (performance.now()-t0)/T;
        rot += 0.012 + e*0.05;
        ctx.clearRect(0,0,W,H);
        const ease = 1-Math.pow(1-Math.min(1,e/0.85),3);

        if(e<0.88 && Math.random()<0.04+e*0.09) rings.push({r:R*0.5, a:0.5});
        if(e>=0.86 && !climaxed){ climaxed=true; flash=1; A.SFX.boom();
          const lab=$('#orb-stage-label'); lab.textContent='SYSTEM ONLINE'; lab.classList.add('show'); }

        const glow = 0.2+ease*0.9 + (climaxed?flash*1.4:0);
        const cg = ctx.createRadialGradient(cx,cy,0,cx,cy,R*2.4);
        cg.addColorStop(0,`hsla(192,100%,72%,${0.5*glow})`);
        cg.addColorStop(0.4,`hsla(200,100%,55%,${0.18*glow})`);
        cg.addColorStop(1,'hsla(200,100%,50%,0)');
        ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(cx,cy,R*2.4,0,7); ctx.fill();

        for(let i=rings.length-1;i>=0;i--){ const rg=rings[i]; rg.r+=7; rg.a*=0.96;
          if(rg.a<0.02){ rings.splice(i,1); continue; }
          ctx.beginPath(); ctx.arc(cx,cy,rg.r,0,7); ctx.strokeStyle=`hsla(190,100%,65%,${rg.a})`; ctx.lineWidth=1.5; ctx.stroke(); }

        const cosY=Math.cos(rot), sinY=Math.sin(rot), now=performance.now();
        for(const pt of ps){
          const le = Math.max(0,Math.min(1,(ease-pt.delay)/(1-pt.delay)));
          const r = pt.r + Math.sin(now/300*pt.sp+pt.jit)*5;
          const x=r*Math.sin(pt.t)*Math.cos(pt.p), y=r*Math.cos(pt.t), z=r*Math.sin(pt.t)*Math.sin(pt.p);
          const x1=x*cosY - z*sinY, z1=x*sinY + z*cosY;
          const persp=520/(520+z1);
          const sphX=cx+x1*persp, sphY=cy+y*persp;
          const stX=cx+pt.sx, stY=cy+pt.sy;
          const X=stX+(sphX-stX)*le, Y=stY+(sphY-stY)*le;
          const depth=(z1+R)/(2*R);
          const size=(0.6+persp*1.6)*(0.5+le*0.9);
          const a=(0.1+depth*0.7)*(0.25+le*0.75);
          ctx.beginPath(); ctx.arc(X,Y,size,0,7);
          ctx.fillStyle=`hsla(${190+depth*16},100%,${58+depth*22}%,${a})`; ctx.fill();
        }

        const coreR = R*0.34*(0.55+ease*0.55) + (climaxed?flash*R*0.35:0);
        ctx.beginPath(); ctx.arc(cx,cy,coreR,0,7);
        ctx.fillStyle=`hsla(195,100%,82%,${0.85*Math.min(1,ease*1.3)})`;
        ctx.shadowBlur=42; ctx.shadowColor='hsla(195,100%,60%,1)'; ctx.fill(); ctx.shadowBlur=0;

        if(flash>0){ ctx.fillStyle=`rgba(180,240,255,${flash*0.5})`; ctx.fillRect(0,0,W,H); flash*=0.88; }

        if(e>=1 && climaxed && flash<0.05){ res(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    clearInterval(growlT); stopRumble();
    await sleep(260);
    stage.style.transition='opacity .5s'; stage.style.opacity='0';
    await sleep(480); stage.classList.remove('on'); stage.style.opacity=''; $('#orb-stage-label').classList.remove('show');
  }

  /* ---- phase 5: reveal UI ---- */
  function showSection(id){
    const el=document.getElementById(id); if(!el) return;
    el.classList.add('revealed');
    el.style.opacity='1'; el.style.transform='none';
  }
  function revealApp(){
    const order=['topbar','orbcol','panelcol'];
    A.SFX.sweep();
    document.getElementById('app')?.classList.remove('booting');
    order.forEach((id,i)=>setTimeout(()=>{ showSection(id); A.SFX.blip(); }, i*180));
  }
  async function phaseReveal(){
    const overlay=$('#boot');
    revealApp();
    await sleep(700);
    overlay.classList.add('gone');
    stopDrone();
    await sleep(800);
    overlay.style.display='none';
    finish();
  }

  function finish(){
    if(boot.finished) return;
    boot.finished=true;
    A.setMaster(0.9);   // re-enable audio for the app after the 7s loader mute
    window.APP?.onReady?.();
  }
  function forceReveal(){
    if(boot.finished) return;
    boot.finished=true;
    try{ stopDrone(); }catch(e){}
    try{ A.setMaster(0.9); }catch(e){}
    const overlay=$('#boot'); if(overlay){ overlay.style.display='none'; }
    document.getElementById('app')?.classList.remove('booting');
    ['topbar','orbcol','panelcol'].forEach(showSection);
    window.APP?.onReady?.();
  }

  function fastPath(){  // reduced motion
    $('#boot').style.display='none';
    document.getElementById('app')?.classList.remove('booting');
    ['topbar','orbcol','panelcol'].forEach(showSection);
    boot.finished=true;
    window.APP?.onReady?.();
  }

  const phases=[phaseKernel,phaseLogo,phaseWelcome,phaseOrbForm,phaseReveal];
  async function runBoot(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return fastPath();
    try{ for(const p of phases){ if(boot.finished) return; await p(); } }
    catch(e){ console.warn('boot error',e); forceReveal(); }
  }
  setTimeout(()=>{ if(!boot.finished) forceReveal(); }, 16000); // HARD failsafe

  window.BOOT = { run:runBoot, replay(){ location.reload(); } };
})();
