/* ============================================================
   orb.js — generative particle orb (Canvas 2D)
   States: idle / listening / thinking / speaking
   Audio-reactive via a settable amplitude value.
   ============================================================ */
(function(){
  const canvas = document.getElementById('orb');
  if(!canvas) return;
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const W = 300, H = 300;
  canvas.width = W*dpr; canvas.height = H*dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  const cx = W/2, cy = H/2;

  const N = 460;
  const parts = [];
  for(let i=0;i<N;i++){
    // distribute on a sphere -> project; store base spherical coords
    const t = Math.acos(2*Math.random()-1);
    const p = Math.random()*Math.PI*2;
    parts.push({ t, p, r: 96 + Math.random()*8, jitter: Math.random()*Math.PI*2, sp: 0.4+Math.random()*0.8 });
  }

  const state = { mode:'idle', amp:0, hue:192, t:0 };
  // smooth amp
  let ampS = 0;

  const COLORS = {
    idle:     { base:192, spread:18, glow:0.5 },
    listening:{ base:172, spread:30, glow:0.9 },
    thinking: { base:265, spread:50, glow:0.8 },
    speaking: { base:192, spread:24, glow:1.0 },
  };

  let rotY = 0, rotX = 0;
  function frame(){
    state.t += 0.016;
    const cfg = COLORS[state.mode] || COLORS.idle;
    // amplitude target by mode
    let target = 0;
    if(state.mode==='listening') target = 0.18 + (state.amp*0.6);
    else if(state.mode==='thinking') target = 0.32 + Math.abs(Math.sin(state.t*4))*0.18;
    else if(state.mode==='speaking') target = 0.25 + (state.amp*0.9);
    else target = 0.08 + Math.sin(state.t*1.4)*0.04; // idle breathing
    ampS += (target - ampS)*0.12;

    rotY += 0.004 + ampS*0.01;
    rotX = Math.sin(state.t*0.5)*0.25;

    ctx.clearRect(0,0,W,H);

    // central glow
    const breathe = 1 + Math.sin(state.t*1.6)*0.04 + ampS*0.25;
    const coreR = 26*breathe;
    const g = ctx.createRadialGradient(cx,cy,0,cx,cy,coreR*3.2);
    const hue = cfg.base;
    g.addColorStop(0, `hsla(${hue},100%,72%,${0.55*cfg.glow})`);
    g.addColorStop(0.4, `hsla(${hue},100%,55%,${0.22*cfg.glow})`);
    g.addColorStop(1, `hsla(${hue},100%,50%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx,cy,coreR*3.2,0,Math.PI*2); ctx.fill();

    // core disc
    ctx.beginPath(); ctx.arc(cx,cy,coreR,0,Math.PI*2);
    ctx.fillStyle = `hsla(${hue},100%,80%,${0.9})`;
    ctx.shadowBlur = 30; ctx.shadowColor = `hsla(${hue},100%,60%,1)`;
    ctx.fill(); ctx.shadowBlur = 0;

    // particles
    const cosY=Math.cos(rotY),sinY=Math.sin(rotY),cosX=Math.cos(rotX),sinX=Math.sin(rotX);
    for(const pt of parts){
      const wob = Math.sin(state.t*pt.sp + pt.jitter) * (3 + ampS*22);
      const r = pt.r + wob;
      // spherical -> cartesian
      let x = r*Math.sin(pt.t)*Math.cos(pt.p + state.t*0.05);
      let y = r*Math.cos(pt.t);
      let z = r*Math.sin(pt.t)*Math.sin(pt.p + state.t*0.05);
      // rotate Y
      let x1 = x*cosY - z*sinY, z1 = x*sinY + z*cosY;
      // rotate X
      let y1 = y*cosX - z1*sinX, z2 = y*sinX + z1*cosX;
      const persp = 240/(240+z2);
      const sx = cx + x1*persp, sy = cy + y1*persp;
      const depth = (z2+110)/220; // 0..1
      const size = (0.6 + persp*1.4) * (0.8+ampS*1.2);
      const a = 0.15 + depth*0.7;
      const ph = hue + (pt.jitter%1-0.5)*cfg.spread;
      ctx.beginPath(); ctx.arc(sx,sy,size,0,Math.PI*2);
      ctx.fillStyle = `hsla(${ph},100%,${55+depth*25}%,${a})`;
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }
  frame();

  window.ORB = {
    set(mode){ state.mode = mode; },
    amp(v){ state.amp = Math.max(0, Math.min(1, v)); },
  };
})();
