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
    // silence everything from here on — no sound after the welcome line
    try{ stopDrone(); stopRumble(); }catch(e){} A.muteAt(0.6);
    await sleep(440);
    stage.style.transition='opacity .4s'; stage.style.opacity='0';
    await sleep(320); stage.classList.remove('on'); stage.style.opacity='';
  }

  /* ---- phase 4: neurons assemble into a mesh sphere, then ignite (SYSTEM ONLINE) ---- */
  async function phaseOrbForm(){
    const stage=$('#orb-stage'); stage.classList.add('on');
    const canvas=$('#boot-orb');
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const W=innerWidth,H=innerHeight; canvas.width=W*dpr; canvas.height=H*dpr;
    const cx=W/2,cy=H/2; const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const R=Math.min(W,H)*0.26;

    // dense sphere of neurons (golden spiral → even) that fly in from scatter
    const N=240, ps=[];
    for(let i=0;i<N;i++){ const t=Math.acos(2*((i+0.5)/N)-1), p=i*2.399963;
      ps.push({ t,p, r:R*(0.97+Math.random()*0.05), sx:(Math.random()-0.5)*W*1.7, sy:(Math.random()-0.5)*H*1.7,
        sp:0.4+Math.random()*0.9, jit:Math.random()*7, delay:Math.random()*0.4, X:0,Y:0,depth:0,le:0 });
    }
    // nearest-3 neighbour mesh → triangulated web on the sphere
    const U=ps.map(p=>{ const st=Math.sin(p.t); return [st*Math.cos(p.p),Math.cos(p.t),st*Math.sin(p.p)]; });
    const seen=new Set(), links=[];
    for(let i=0;i<N;i++){ const d=[];
      for(let j=0;j<N;j++){ if(i===j) continue; const dx=U[i][0]-U[j][0],dy=U[i][1]-U[j][1],dz=U[i][2]-U[j][2]; d.push([dx*dx+dy*dy+dz*dz,j]); }
      d.sort((a,b)=>a[0]-b[0]);
      for(let k=0;k<3;k++){ const j=d[k][1]; const key=i<j?i+'-'+j:j+'-'+i; if(!seen.has(key)){seen.add(key);links.push({a:i,b:j});} }
    }
    const pulses=[];
    const guides=[R*1.18, R*1.5];   // faint concentric guide rings
    // (silent phase — all audio stops after the welcome line)

    const T=2700,t0=performance.now(); let rot=0,climaxed=false,flash=0;
    await new Promise(res=>{
      function frame(){
        if(boot.finished){ res(); return; }
        const e=(performance.now()-t0)/T; rot+=0.005+e*0.018;
        const ease=1-Math.pow(1-Math.min(1,e/0.86),3); const now=performance.now();
        ctx.clearRect(0,0,W,H);

        // holographic scanlines
        ctx.globalAlpha=0.05*ease; ctx.strokeStyle='#1a3c4e'; ctx.lineWidth=1;
        for(let y=(now*0.01)%4; y<H; y+=4){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        ctx.globalAlpha=1;

        ctx.globalCompositeOperation='lighter';

        // guide rings
        for(const gr of guides){ ctx.strokeStyle=`hsla(200,90%,60%,${0.07*ease})`; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(cx,cy,gr*(0.6+ease*0.4),0,7); ctx.stroke(); }

        // central glow (modest)
        const glow=0.15+ease*0.65+(climaxed?flash*1.2:0);
        const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.4);
        cg.addColorStop(0,`hsla(194,100%,72%,${0.32*glow})`);
        cg.addColorStop(0.5,`hsla(200,100%,55%,${0.1*glow})`);
        cg.addColorStop(1,'hsla(200,100%,50%,0)');
        ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(cx,cy,R*1.4,0,7); ctx.fill();

        // project (rotateY + slight tilt) and fly in
        const cosY=Math.cos(rot),sinY=Math.sin(rot), cosX=Math.cos(0.34),sinX=Math.sin(0.34);
        for(const pt of ps){
          const le=Math.max(0,Math.min(1,(ease-pt.delay)/(1-pt.delay)));
          const r=pt.r+Math.sin(now/400*pt.sp+pt.jit)*3;
          const x=r*Math.sin(pt.t)*Math.cos(pt.p), y=r*Math.cos(pt.t), z=r*Math.sin(pt.t)*Math.sin(pt.p);
          const x1=x*cosY-z*sinY, z1=x*sinY+z*cosY;
          const y1=y*cosX-z1*sinX, z2=y*sinX+z1*cosX;
          const persp=320/(320+z2);
          const sphX=cx+x1*persp, sphY=cy+y1*persp;
          pt.X=(cx+pt.sx)+(sphX-(cx+pt.sx))*le; pt.Y=(cy+pt.sy)+(sphY-(cy+pt.sy))*le;
          pt.depth=(z2+R)/(2*R); pt.le=le;
        }

        // mesh lights up as the web forms
        const meshA=Math.max(0,(ease-0.2)/0.8);
        if(meshA>0){ ctx.lineWidth=0.6;
          for(const l of links){ const a=ps[l.a],b=ps[l.b]; const lf=Math.min(a.le,b.le); if(lf<0.4) continue;
            const dep=(a.depth+b.depth)*0.5;
            ctx.strokeStyle=`hsla(198,100%,${50+dep*24}%,${meshA*(0.05+dep*0.15)*lf})`;
            ctx.beginPath(); ctx.moveTo(a.X,a.Y); ctx.lineTo(b.X,b.Y); ctx.stroke(); }
          if(e>0.5 && pulses.length<40 && Math.random()<0.4){ const l=links[(Math.random()*links.length)|0]; pulses.push({a:l.a,b:l.b,p:0,sp:0.6+Math.random()*0.7}); }
        }
        for(let i=pulses.length-1;i>=0;i--){ const pu=pulses[i]; pu.p+=pu.sp*0.03; if(pu.p>=1){pulses.splice(i,1);continue;}
          const a=ps[pu.a],b=ps[pu.b], x=a.X+(b.X-a.X)*pu.p, y=a.Y+(b.Y-a.Y)*pu.p;
          ctx.fillStyle='hsla(200,100%,88%,0.9)'; ctx.beginPath(); ctx.arc(x,y,1.6,0,7); ctx.fill(); }

        // neurons (depth-shaded)
        for(const pt of ps){ const s=(0.9+pt.depth*1.5)*(0.4+pt.le*0.9);
          const a=(0.18+pt.depth*0.7)*(0.3+0.7*pt.le);
          ctx.fillStyle=`hsla(195,100%,${64+pt.depth*22}%,${Math.min(1,a)})`;
          ctx.beginPath(); ctx.arc(pt.X,pt.Y,s,0,7); ctx.fill(); }

        // ignition → SYSTEM ONLINE (small bright core, flares on)
        if(e>=0.86 && !climaxed){ climaxed=true; flash=1;
          const lab=$('#orb-stage-label'); lab.textContent='SYSTEM ONLINE'; lab.classList.add('show'); }
        const coreR=R*0.09*(0.4+ease*0.6)+(climaxed?flash*R*0.55:0);
        ctx.beginPath(); ctx.arc(cx,cy,coreR,0,7);
        ctx.fillStyle=`hsla(196,100%,88%,${0.9*Math.min(1,ease*1.4)})`;
        ctx.shadowBlur=30+(climaxed?flash*40:0); ctx.shadowColor='hsla(196,100%,64%,1)'; ctx.fill(); ctx.shadowBlur=0;

        ctx.globalCompositeOperation='source-over';
        if(flash>0){ ctx.fillStyle=`rgba(190,240,255,${flash*0.5})`; ctx.fillRect(0,0,W,H); flash*=0.9; }

        if(e>=1 && climaxed && flash<0.04){ res(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    await sleep(280);
    stage.style.transition='opacity .5s'; stage.style.opacity='0';
    await sleep(480); stage.classList.remove('on'); stage.style.opacity=''; $('#orb-stage-label').classList.remove('show');
  }

  /* ---- phase 5: reveal ---- */
  function showSection(id){ const el=document.getElementById(id); if(!el) return; el.classList.add('revealed'); el.style.opacity='1'; el.style.transform='none'; }
  function revealApp(){ document.getElementById('app')?.classList.remove('booting');
    ['topbar','orbcol','panelcol'].forEach((id,i)=>setTimeout(()=>{ showSection(id); }, i*180)); }
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
