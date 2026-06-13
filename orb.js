/* ============================================================
   orb.js — neural hologram (Canvas 2D)
   A rotating sphere of "neurons" wired by synapses, with signal
   pulses racing along the links and nodes that fire. Audio-reactive
   and interactive (eases toward the pointer; nearby neurons excite).
   States: idle / listening / thinking / speaking.
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
  const R = 96;

  // ---- neurons distributed on a sphere ----
  const N = 320;
  const nodes = [];
  for(let i=0;i<N;i++){
    const t = Math.acos(2*((i+0.5)/N)-1);          // even-ish distribution
    const p = i * 2.399963;                          // golden-angle spiral
    nodes.push({
      t, p, baseR: R*(0.97+Math.random()*0.06),
      jitter: Math.random()*Math.PI*2, sp: 0.4+Math.random()*0.9,
      fire: 0,                                        // 0..1 excitation
      // cartesian (filled each frame)
      x:0,y:0,z:0, sx:0, sy:0, persp:1, depth:0,
    });
  }
  // unit positions for neighbor search
  function unit(n){ const st=Math.sin(n.t); return [st*Math.cos(n.p), Math.cos(n.t), st*Math.sin(n.p)]; }
  const U = nodes.map(unit);
  // ---- synapses: connect each neuron to its K nearest (dedup) ----
  const K = 3;
  const edgeSet = new Set(); const edges = [];
  for(let i=0;i<N;i++){
    const di=[];
    for(let j=0;j<N;j++){ if(i===j) continue;
      const dx=U[i][0]-U[j][0], dy=U[i][1]-U[j][1], dz=U[i][2]-U[j][2];
      di.push([dx*dx+dy*dy+dz*dz, j]);
    }
    di.sort((a,b)=>a[0]-b[0]);
    for(let k=0;k<K;k++){ const j=di[k][1]; const key=i<j?i+'-'+j:j+'-'+i;
      if(!edgeSet.has(key)){ edgeSet.add(key); edges.push({a:i,b:j}); } }
  }
  // adjacency for spawning pulses
  const adj = nodes.map(()=>[]);
  edges.forEach((e,ei)=>{ adj[e.a].push(ei); adj[e.b].push(ei); });

  // ---- traveling pulses ----
  const pulses = []; const PULSE_MAX = 90;
  function firePulsesFrom(i, strength){
    for(const ei of adj[i]){
      if(pulses.length>=PULSE_MAX) break;
      const e=edges[ei]; const to = e.a===i ? e.b : e.a;
      pulses.push({ from:i, to, pos:0, spd:0.6+Math.random()*0.7, life:strength });
    }
    nodes[i].fire = Math.min(1.4, nodes[i].fire + strength);
  }

  const COLORS = {
    idle:     { hue:192, glow:0.55, fireRate:0.012 },
    listening:{ hue:172, glow:0.95, fireRate:0.05 },
    thinking: { hue:268, glow:0.95, fireRate:0.12 },
    speaking: { hue:196, glow:1.0,  fireRate:0.07 },
  };

  const state = { mode:'idle', amp:0, t:0 };
  let ampS = 0, rotY = 0, rotX = 0;

  // ---- pointer interactivity ----
  const ptr = { x:cx, y:cy, inside:false, tx:0, ty:0 };
  canvas.addEventListener('pointermove', e=>{
    const r = canvas.getBoundingClientRect();
    ptr.x = (e.clientX-r.left) * (W/r.width);
    ptr.y = (e.clientY-r.top)  * (H/r.height);
    ptr.inside = true;
  });
  canvas.addEventListener('pointerleave', ()=> ptr.inside=false);

  function frame(){
    state.t += 0.016;
    const cfg = COLORS[state.mode] || COLORS.idle;

    let target = 0;
    if(state.mode==='listening') target = 0.20 + state.amp*0.6;
    else if(state.mode==='thinking') target = 0.34 + Math.abs(Math.sin(state.t*3.4))*0.2;
    else if(state.mode==='speaking') target = 0.26 + state.amp*0.95;
    else target = 0.10 + Math.sin(state.t*1.2)*0.05;
    ampS += (target - ampS)*0.1;

    // rotation eases toward pointer when hovering (parallax)
    if(ptr.inside){ ptr.tx = (ptr.y-cy)/H*0.9; ptr.ty = (ptr.x-cx)/W*1.4; }
    else { ptr.tx += (0-ptr.tx)*0.03; ptr.ty += (0-ptr.ty)*0.03; }
    rotY += 0.0035 + ampS*0.012;
    const rY = rotY + ptr.ty;
    rotX += ((Math.sin(state.t*0.4)*0.18 + ptr.tx) - rotX)*0.05;

    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation = 'lighter';   // additive → holographic glow

    const hue = cfg.hue;
    // central glow + core
    const breathe = 1 + Math.sin(state.t*1.6)*0.05 + ampS*0.3;
    const coreR = 22*breathe;
    let g = ctx.createRadialGradient(cx,cy,0,cx,cy,coreR*3.4);
    g.addColorStop(0, `hsla(${hue},100%,72%,${0.5*cfg.glow})`);
    g.addColorStop(0.45,`hsla(${hue},100%,55%,${0.16*cfg.glow})`);
    g.addColorStop(1, `hsla(${hue},100%,50%,0)`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,coreR*3.4,0,7); ctx.fill();

    // project all neurons
    const cosY=Math.cos(rY),sinY=Math.sin(rY),cosX=Math.cos(rotX),sinX=Math.sin(rotX), now=state.t;
    for(const n of nodes){
      const wob = Math.sin(now*n.sp + n.jitter)*(2+ampS*18);
      const r = n.baseR + wob;
      const st = Math.sin(n.t);
      let x = r*st*Math.cos(n.p + now*0.05), y = r*Math.cos(n.t), z = r*st*Math.sin(n.p + now*0.05);
      let x1 = x*cosY - z*sinY, z1 = x*sinY + z*cosY;
      let y1 = y*cosX - z1*sinX, z2 = y*sinX + z1*cosX;
      const persp = 240/(240+z2);
      n.sx = cx + x1*persp; n.sy = cy + y1*persp;
      n.persp = persp; n.depth = (z2+R)/(2*R);
      n.fire *= 0.92;
      // pointer excitation: front-facing neurons near the cursor light up
      if(ptr.inside && n.depth>0.5){
        const dx=n.sx-ptr.x, dy=n.sy-ptr.y; const d2=dx*dx+dy*dy;
        if(d2 < 900){ n.fire = Math.min(1.5, n.fire+0.10); if(Math.random()<0.04) firePulsesFrom(nodes.indexOf(n), 0.7); }
      }
    }

    // spontaneous firing (rate by state + amp)
    if(Math.random() < cfg.fireRate + ampS*0.12){
      firePulsesFrom((Math.random()*N)|0, 0.7+Math.random()*0.5);
    }

    // synapse links
    ctx.lineWidth = 0.7;
    for(const e of edges){
      const a=nodes[e.a], b=nodes[e.b];
      const depth=(a.depth+b.depth)*0.5;
      const al = (0.04 + depth*0.16) * (0.6+cfg.glow*0.5);
      ctx.strokeStyle = `hsla(${hue},90%,${50+depth*22}%,${al})`;
      ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.stroke();
    }

    // pulses traveling along synapses
    for(let i=pulses.length-1;i>=0;i--){
      const pu=pulses[i]; pu.pos += pu.spd*0.03*(1+ampS);
      if(pu.pos>=1){ firePulsesFrom(pu.to, pu.life*0.45); pulses.splice(i,1); continue; }
      const a=nodes[pu.from], b=nodes[pu.to];
      const x=a.sx+(b.sx-a.sx)*pu.pos, y=a.sy+(b.sy-a.sy)*pu.pos;
      const depth=(a.depth+b.depth)*0.5;
      const rr=1.6+depth*1.6;
      ctx.fillStyle=`hsla(${hue+20},100%,82%,${0.5+depth*0.4})`;
      ctx.beginPath(); ctx.arc(x,y,rr,0,7); ctx.fill();
    }

    // neurons
    for(const n of nodes){
      const size = (0.7+n.persp*1.5)*(0.8+ampS*1.1) + n.fire*2.2;
      const lum = 55 + n.depth*22 + n.fire*30;
      const a = (0.18 + n.depth*0.6) + n.fire*0.5;
      ctx.fillStyle=`hsla(${hue},100%,${Math.min(95,lum)}%,${Math.min(1,a)})`;
      ctx.beginPath(); ctx.arc(n.sx,n.sy,size,0,7); ctx.fill();
    }

    // bright core disc
    ctx.fillStyle=`hsla(${hue},100%,84%,0.95)`;
    ctx.beginPath(); ctx.arc(cx,cy,coreR*0.6,0,7); ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    // holographic scanlines + faint flicker
    const flick = 0.9 + Math.random()*0.1;
    ctx.globalAlpha = 0.05*flick;
    ctx.strokeStyle = `hsl(${hue},100%,70%)`; ctx.lineWidth=1;
    for(let y=(now*16)%4; y<H; y+=4){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.globalAlpha = 1;

    requestAnimationFrame(frame);
  }
  frame();

  window.ORB = {
    set(mode){ state.mode = mode; if(mode==='speaking'||mode==='thinking'){ for(let i=0;i<3;i++) firePulsesFrom((Math.random()*N)|0, 1); } },
    amp(v){ state.amp = Math.max(0, Math.min(1, v)); },
  };
})();
