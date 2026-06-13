/* ============================================================
   boot.js — cinematic loader
   neural-core build (with live progress) -> logo -> welcome ->
   core ignition -> reveal.  Serious sound design, no chirps.
   Failsafe: any error or 16s timeout -> force reveal.
   ============================================================ */
(function(){
  const A = window.JAUDIO;
  const boot = { finished:false };
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  let stopDrone = ()=>{}, stopRumble = ()=>{};

  const USER_NAME = 'Sir';

  /* ---- phase 1: neural core builds, with progress ---- */
  const STATUS = [
    'LINKING SYNAPSES','LOADING NEURAL MODEL','CALIBRATING VOICE PIPELINE',
    'MOUNTING MEMORY CORE','ROUTING TOOL NETWORK','SYNCHRONIZING AGENTS','NEURAL CORE ONLINE',
  ];
  const LOGS = ['spawn agent','link synapse','load model.layer','mount vault','bind voice.pipe',
    'route tool','calibrate vad','sync core','attach stt','warm tts','index memory','verify sig'];

  async function phaseNeural(){
    const stage=$('#net-stage'), canvas=$('#boot-net');
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const W=innerWidth, H=innerHeight;
    canvas.width=W*dpr; canvas.height=H*dpr;
    const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);

    // serious ambience
    stopRumble = A.rumble({f0:30, vol:0.13});
    stopDrone  = A.drone({f0:55, vol:0.05});

    // nodes scattered across a central band
    const M = Math.min(110, Math.floor(W*H/22000)+60);
    const ns=[];
    for(let i=0;i<M;i++){
      ns.push({ x:W*(0.12+Math.random()*0.76), y:H*(0.16+Math.random()*0.68),
        vx:(Math.random()-0.5)*0.25, vy:(Math.random()-0.5)*0.25,
        born:Math.random()*0.85, r:1.5+Math.random()*1.8, ph:Math.random()*7 });
    }
    // candidate links by proximity
    const D=Math.min(W,H)*0.17, links=[];
    for(let i=0;i<M;i++) for(let j=i+1;j<M;j++){
      const dx=ns[i].x-ns[j].x, dy=ns[i].y-ns[j].y;
      if(dx*dx+dy*dy < D*D) links.push({a:i,b:j});
    }
    const pulses=[];
    const hud=$('#boot-hud'), bar=$('#boot-bar-fill'), pct=$('#boot-pct'), st=$('#boot-status'), log=$('#boot-log');

    // pointer interactivity: excite the nearest nodes
    let mx=-1,my=-1;
    const onMove=e=>{ mx=e.clientX; my=e.clientY; };
    addEventListener('pointermove',onMove);

    let lastMile=-1, logBuf=[];
    const T=3600, t0=performance.now();
    await new Promise(res=>{
      function frame(){
        if(boot.finished){ res(); return; }
        const e=Math.min(1,(performance.now()-t0)/T);
        const prog=Math.floor(e*100);

        // milestones → serious thud + status advance
        const mile=Math.floor(e*7);
        if(mile!==lastMile){ lastMile=mile; if(mile<7){ A.SFX.thud({vol:0.18}); } st.textContent=STATUS[Math.min(6,mile)]; }
        bar.style.width=(e*100)+'%'; pct.textContent=prog+'%';

        ctx.clearRect(0,0,W,H);
        ctx.globalCompositeOperation='lighter';

        // drift + pointer attraction
        for(const n of ns){
          n.x+=n.vx; n.y+=n.vy;
          if(n.x<W*0.08||n.x>W*0.92) n.vx*=-1;
          if(n.y<H*0.10||n.y>H*0.90) n.vy*=-1;
          if(mx>=0){ const dx=mx-n.x,dy=my-n.y,d2=dx*dx+dy*dy; if(d2<26000){ n.x+=dx*0.002; n.y+=dy*0.002; n.fire=Math.min(1,(n.fire||0)+0.06); } }
          n.fire=(n.fire||0)*0.94;
        }
        // links (only when both endpoints "born")
        ctx.lineWidth=0.8;
        for(const l of links){ const a=ns[l.a],b=ns[l.b];
          if(e<a.born||e<b.born) continue;
          const al=0.06+0.12*Math.min(1,(e-Math.max(a.born,b.born))*4);
          ctx.strokeStyle=`hsla(192,100%,62%,${al})`;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
          if(Math.random()<0.002+e*0.004 && pulses.length<70) pulses.push({a:l.a,b:l.b,p:0,sp:0.5+Math.random()*0.8});
        }
        // pulses
        for(let i=pulses.length-1;i>=0;i--){ const pu=pulses[i]; pu.p+=pu.sp*0.02;
          if(pu.p>=1){ pulses.splice(i,1); continue; }
          const a=ns[pu.a],b=ns[pu.b], x=a.x+(b.x-a.x)*pu.p, y=a.y+(b.y-a.y)*pu.p;
          ctx.fillStyle='hsla(200,100%,82%,0.9)'; ctx.beginPath(); ctx.arc(x,y,2,0,7); ctx.fill();
        }
        // nodes
        for(const n of ns){ if(e<n.born) continue;
          const app=Math.min(1,(e-n.born)*6);
          const s=n.r*app + (n.fire||0)*2.5;
          const a=(0.5+0.5*Math.sin(performance.now()/500+n.ph))*app + (n.fire||0);
          ctx.fillStyle=`hsla(190,100%,${66+(n.fire||0)*30}%,${Math.min(1,a)})`;
          ctx.beginPath(); ctx.arc(n.x,n.y,s,0,7); ctx.fill();
        }
        ctx.globalCompositeOperation='source-over';

        // rolling log
        if(Math.random()<0.25){ logBuf.push(`<span>${LOGS[(Math.random()*LOGS.length)|0]} ::<b> ok</b></span>`); while(logBuf.length>5) logBuf.shift(); log.innerHTML=logBuf.join(''); A.SFX.nettick(); }

        if(e>=1){ res(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    removeEventListener('pointermove',onMove);
    st.textContent='NEURAL CORE ONLINE';
    await sleep(360);
    stage.style.transition='opacity .45s'; stage.style.opacity='0';
    await sleep(460); stage.style.display='none';
  }

  /* ---- phase 2: logo power-on ---- */
  async function phaseLogo(){
    const stage=$('#logo-stage'); stage.classList.add('on');
    const logo=$('#logo-glitch');
    A.SFX.impact();
    logo.classList.add('glitch');
    await sleep(760); logo.classList.remove('glitch');
    await sleep(280);
    stage.style.transition='opacity .4s'; stage.style.opacity='0';
    await sleep(340); stage.classList.remove('on'); stage.style.opacity='';
  }

  /* ---- phase 3: welcome ---- */
  async function phaseWelcome(){
    const stage=$('#welcome-stage'); stage.classList.add('on');
    const out=$('#welcome-type');
    A.SFX.confirm();
    const str=`Welcome back, ${USER_NAME}.`;
    out.textContent='';
    for(const ch of str){ out.textContent+=ch; if(ch!==' ') A.SFX.key(); await sleep(38); }
    await sleep(440);
    stage.style.transition='opacity .4s'; stage.style.opacity='0';
    await sleep(320); stage.classList.remove('on'); stage.style.opacity='';
  }

  /* ---- phase 4: neurons assemble into a ring, then ignite (SYSTEM ONLINE) ---- */
  async function phaseOrbForm(){
    const stage=$('#orb-stage'); stage.classList.add('on');
    const canvas=$('#boot-orb');
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const W=innerWidth,H=innerHeight; canvas.width=W*dpr; canvas.height=H*dpr;
    const cx=W/2,cy=H/2; const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const R=Math.min(W,H)*0.30;

    // same flat-neuron look as the opening — scattered, then folding onto a ring band
    const N=130, ns=[];
    for(let i=0;i<N;i++){
      const band=R*(0.74 + (i%3)*0.13);          // 3 concentric radii → a woven ring
      const ang=(i/N)*Math.PI*2 + (i%3)*0.18;
      ns.push({ ang, band,
        x:cx+(Math.random()-0.5)*W*1.5, y:cy+(Math.random()-0.5)*H*1.5,
        delay:Math.random()*0.4, ph:Math.random()*7, r:1.6+Math.random()*1.7, X:0,Y:0, le:0 });
    }
    // synapses: weave neighbours along the ring (index-adjacent + a short chord)
    const links=[];
    for(let i=0;i<N;i++){ links.push({a:i,b:(i+1)%N}); if(i%2===0) links.push({a:i,b:(i+3)%N}); }
    const pulses=[], rings=[];

    // serious build: deep rumble + confident riser + milestone thuds
    const stopR=A.rumble({f0:26, vol:0.16});
    A.riser({dur:2.6, vol:0.14});
    setTimeout(()=>A.SFX.thud({vol:0.24}), 700);
    setTimeout(()=>A.SFX.thud({vol:0.28}), 1500);

    const T=2600,t0=performance.now(); let spin=0,climaxed=false,flash=0;
    await new Promise(res=>{
      function frame(){
        if(boot.finished){ res(); return; }
        const e=(performance.now()-t0)/T; const ease=1-Math.pow(1-Math.min(1,e/0.85),3);
        spin += 0.003 + e*0.012;
        const now=performance.now();
        ctx.clearRect(0,0,W,H);
        ctx.globalCompositeOperation='lighter';

        // positions: lerp from scattered → ring target (which slowly rotates)
        for(const n of ns){
          const le=Math.max(0,Math.min(1,(ease-n.delay)/(1-n.delay)));
          const a=n.ang+spin;
          const tx=cx+Math.cos(a)*n.band, ty=cy+Math.sin(a)*n.band;
          n.X=n.x+(tx-n.x)*le + Math.sin(now/620+n.ph)*2.4*le;
          n.Y=n.y+(ty-n.y)*le + Math.cos(now/620+n.ph)*2.4*le;
          n.le=le;
        }

        // central glow
        const glow=0.18+ease*0.85+(climaxed?flash*1.4:0);
        const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.9);
        cg.addColorStop(0,`hsla(194,100%,72%,${0.42*glow})`);
        cg.addColorStop(0.5,`hsla(200,100%,55%,${0.12*glow})`);
        cg.addColorStop(1,'hsla(200,100%,50%,0)');
        ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(cx,cy,R*1.9,0,7); ctx.fill();

        // expanding rings (occasional + ignition)
        if(e<0.9 && Math.random()<0.03+e*0.05) rings.push({r:R*0.5,a:0.4});
        for(let i=rings.length-1;i>=0;i--){ const rg=rings[i]; rg.r+=6; rg.a*=0.96;
          if(rg.a<0.02){ rings.splice(i,1); continue; }
          ctx.beginPath(); ctx.arc(cx,cy,rg.r,0,7); ctx.strokeStyle=`hsla(190,100%,66%,${rg.a})`; ctx.lineWidth=1.4; ctx.stroke(); }

        // synapses light up as neurons lock into the circle
        ctx.lineWidth=0.8;
        for(const l of links){ const a=ns[l.a],b=ns[l.b]; const lf=Math.min(a.le,b.le); if(lf<0.4) continue;
          ctx.strokeStyle=`hsla(192,100%,62%,${(0.05+0.15*lf)})`;
          ctx.beginPath(); ctx.moveTo(a.X,a.Y); ctx.lineTo(b.X,b.Y); ctx.stroke();
          if(e>0.5 && pulses.length<48 && Math.random()<0.004) pulses.push({a:l.a,b:l.b,p:0,sp:0.6+Math.random()*0.7}); }
        for(let i=pulses.length-1;i>=0;i--){ const pu=pulses[i]; pu.p+=pu.sp*0.03; if(pu.p>=1){pulses.splice(i,1);continue;}
          const a=ns[pu.a],b=ns[pu.b], x=a.X+(b.X-a.X)*pu.p, y=a.Y+(b.Y-a.Y)*pu.p;
          ctx.fillStyle='hsla(200,100%,85%,0.9)'; ctx.beginPath(); ctx.arc(x,y,2,0,7); ctx.fill(); }

        // neurons (same look as the opening net)
        for(const n of ns){ const s=n.r*(0.5+n.le*0.95);
          const a=(0.4+0.6*Math.abs(Math.sin(now/500+n.ph)))*n.le;
          ctx.fillStyle=`hsla(190,100%,${68+n.le*8}%,${Math.min(1,a)})`;
          ctx.beginPath(); ctx.arc(n.X,n.Y,s,0,7); ctx.fill(); }

        // forming ring outline
        ctx.strokeStyle=`hsla(195,100%,66%,${ease*0.22})`; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.arc(cx,cy,R*0.82,0,7); ctx.stroke();

        // ignition → SYSTEM ONLINE
        if(e>=0.85 && !climaxed){ climaxed=true; flash=1; A.online(); rings.push({r:R*0.2,a:0.85});
          const lab=$('#orb-stage-label'); lab.textContent='SYSTEM ONLINE'; lab.classList.add('show'); }
        const coreR=R*0.26*(0.25+ease*0.75)+(climaxed?flash*R*0.5:0);
        ctx.beginPath(); ctx.arc(cx,cy,coreR,0,7);
        ctx.fillStyle=`hsla(196,100%,86%,${0.9*Math.min(1,ease*1.4)})`;
        ctx.shadowBlur=48; ctx.shadowColor='hsla(196,100%,62%,1)'; ctx.fill(); ctx.shadowBlur=0;

        ctx.globalCompositeOperation='source-over';
        if(flash>0){ ctx.fillStyle=`rgba(190,240,255,${flash*0.5})`; ctx.fillRect(0,0,W,H); flash*=0.9; }

        if(e>=1 && climaxed && flash<0.04){ res(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    stopR();
    await sleep(280);
    stage.style.transition='opacity .5s'; stage.style.opacity='0';
    await sleep(480); stage.classList.remove('on'); stage.style.opacity=''; $('#orb-stage-label').classList.remove('show');
  }

  /* ---- phase 5: reveal ---- */
  function showSection(id){ const el=document.getElementById(id); if(!el) return; el.classList.add('revealed'); el.style.opacity='1'; el.style.transform='none'; }
  function revealApp(){ A.SFX.sweep(); document.getElementById('app')?.classList.remove('booting');
    ['topbar','orbcol','panelcol'].forEach((id,i)=>setTimeout(()=>{ showSection(id); A.SFX.blip(); }, i*180)); }
  async function phaseReveal(){
    const overlay=$('#boot'); revealApp();
    await sleep(700); overlay.classList.add('gone'); stopDrone(); stopRumble();
    await sleep(800); overlay.style.display='none'; finish();
  }

  function finish(){ if(boot.finished) return; boot.finished=true; A.setMaster(0); window.APP?.onReady?.(); }
  function forceReveal(){ if(boot.finished) return; boot.finished=true;
    try{ stopDrone(); stopRumble(); }catch(e){} try{ A.setMaster(0); }catch(e){}
    const overlay=$('#boot'); if(overlay) overlay.style.display='none';
    document.getElementById('app')?.classList.remove('booting');
    ['topbar','orbcol','panelcol'].forEach(showSection); window.APP?.onReady?.(); }
  function fastPath(){ $('#boot').style.display='none'; document.getElementById('app')?.classList.remove('booting');
    ['topbar','orbcol','panelcol'].forEach(showSection); boot.finished=true; try{ A.setMaster(0); }catch(e){} window.APP?.onReady?.(); }

  const phases=[phaseNeural,phaseLogo,phaseWelcome,phaseOrbForm,phaseReveal];
  async function runBoot(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return fastPath();
    try{ for(const p of phases){ if(boot.finished) return; await p(); } }
    catch(e){ console.warn('boot error',e); forceReveal(); }
  }
  setTimeout(()=>{ if(!boot.finished) forceReveal(); }, 16000);

  window.BOOT = { run:runBoot, replay(){ location.reload(); } };
})();
