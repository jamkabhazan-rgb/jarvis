/* ============================================================
   audio.js — cinematic, "serious system" SFX synthesized live.
   Deep sub hits, filtered swells, reactor hum — no chirpy beeps.
   ============================================================ */
let ac;
const ctx = () => (ac ??= new (window.AudioContext || window.webkitAudioContext)());
let master, reverb, wetGain;

function ensureBus(){
  const c = ctx();
  if(master) return;
  master = c.createGain(); master.gain.value = 0.9;
  // long, dark plate reverb (decaying noise) for a big-room feel
  reverb = c.createConvolver();
  const len = c.sampleRate * 2.6, buf = c.createBuffer(2, len, c.sampleRate);
  for(let ch=0; ch<2; ch++){
    const d = buf.getChannelData(ch);
    for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.0);
  }
  reverb.buffer = buf;
  wetGain = c.createGain(); wetGain.gain.value = 0.3;
  master.connect(c.destination);
  master.connect(reverb).connect(wetGain).connect(c.destination);
}

// tone with frequency sweep + smooth envelope
function tone({f0=220,f1=f0,dur=0.3,type='sine',vol=0.2,attack=0.014}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),g=c.createGain();
    o.type=type;
    o.frequency.setValueAtTime(f0,c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),c.currentTime+dur);
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+attack);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    o.connect(g).connect(master); o.start(); o.stop(c.currentTime+dur+0.05);
  }catch(e){}
}

// filtered noise burst (swells, air, impacts)
function noise({dur=0.3,type='lowpass',freq=600,q=0.7,vol=0.15,attack=0.04}={}){
  try{
    const c=ctx(); ensureBus();
    const n=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();
    const buf=c.createBuffer(1,Math.max(1,Math.floor(c.sampleRate*dur)),c.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    n.buffer=buf; f.type=type; f.frequency.value=freq; f.Q.value=q;
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+attack);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    n.connect(f).connect(g).connect(master); n.start(); n.stop(c.currentTime+dur+0.05);
  }catch(e){}
}

// gritty digital timbre (used sparingly)
function digi({f0=160,dur=0.18,vol=0.1}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
    o.type='sawtooth'; o.frequency.value=f0;
    f.type='lowpass'; f.frequency.value=f0*4; f.Q.value=4;
    g.gain.setValueAtTime(vol,c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    o.connect(f).connect(g).connect(master); o.start(); o.stop(c.currentTime+dur+0.05);
  }catch(e){}
}
function glitch(n=5){
  for(let i=0;i<n;i++) setTimeout(()=>digi({f0:60+Math.random()*240,dur:0.05+Math.random()*0.06,vol:0.07}), i*Math.random()*80);
}

// sustained low pad / power hum (returns stop fn)
function drone({f0=55,vol=0.06}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),o2=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
    o.type='sine'; o.frequency.value=f0; o2.type='triangle'; o2.frequency.value=f0*2.005;
    f.type='lowpass'; f.frequency.value=420;
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+1.4);
    o.connect(f); o2.connect(f); f.connect(g).connect(master); o.start(); o2.start();
    return ()=>{ try{ g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(Math.max(0.0002,g.gain.value),c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.8); o.stop(c.currentTime+0.9); o2.stop(c.currentTime+0.9);}catch(e){} };
  }catch(e){ return ()=>{}; }
}

// deep reactor rumble w/ slow tremolo (returns stop fn)
function rumble({f0=28,vol=0.16,dur=0}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),o2=c.createOscillator(),lfo=c.createOscillator(),lg=c.createGain(),g=c.createGain(),f=c.createBiquadFilter();
    o.type='sawtooth'; o.frequency.value=f0; o2.type='sine'; o2.frequency.value=f0*0.5;
    f.type='lowpass'; f.frequency.value=120;
    lfo.type='sine'; lfo.frequency.value=0.7; lg.gain.value=vol*0.35; lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+1.1);
    o.connect(f); o2.connect(f); f.connect(g).connect(master);
    lfo.start(); o.start(); o2.start();
    const stop=()=>{ try{ g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(Math.max(0.0002,g.gain.value),c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.8); o.stop(c.currentTime+0.9); o2.stop(c.currentTime+0.9); lfo.stop(c.currentTime+0.9);}catch(e){} };
    if(dur) setTimeout(stop, dur*1000);
    return stop;
  }catch(e){ return ()=>{}; }
}

// slow rising power swell (charging up)
function riser({dur=3,vol=0.13}={}){
  try{
    const c=ctx(); ensureBus();
    const n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
    const len=Math.max(1,Math.floor(c.sampleRate*dur)), buf=c.createBuffer(1,len,c.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    n.buffer=buf; f.type='lowpass'; f.Q.value=2;
    f.frequency.setValueAtTime(160,c.currentTime);
    f.frequency.exponentialRampToValueAtTime(2600,c.currentTime+dur);
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+dur*0.92);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    // low harmonized rising tone (no dissonance — confident, not scary)
    const o=c.createOscillator(),o2=c.createOscillator(),og=c.createGain();
    o.type='sawtooth'; o2.type='sine';
    o.frequency.setValueAtTime(55,c.currentTime); o.frequency.exponentialRampToValueAtTime(220,c.currentTime+dur);
    o2.frequency.setValueAtTime(110,c.currentTime); o2.frequency.exponentialRampToValueAtTime(440,c.currentTime+dur);
    og.gain.setValueAtTime(0.0001,c.currentTime); og.gain.exponentialRampToValueAtTime(vol*0.5,c.currentTime+dur*0.92); og.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    n.connect(f).connect(g).connect(master); o.connect(og); o2.connect(og); og.connect(master);
    n.start(); o.start(); o2.start();
    n.stop(c.currentTime+dur+0.05); o.stop(c.currentTime+dur+0.05); o2.stop(c.currentTime+dur+0.05);
  }catch(e){}
}

// serious low impact ("thunk" — used at boot milestones / logo)
function thud({vol=0.3}={}){
  tone({f0:130,f1:42,dur:0.5,type:'sine',vol});
  tone({f0:64,f1:30,dur:0.6,type:'sawtooth',vol:vol*0.4});
  noise({dur:0.22,type:'lowpass',freq:300,vol:vol*0.5,attack:0.005});
}

// huge "core online" — sub drop + reverb tail + low power chord
function online({vol=0.5}={}){
  tone({f0:150,f1:26,dur:1.7,type:'sine',vol});
  tone({f0:74,f1:18,dur:2.0,type:'sawtooth',vol:vol*0.45});
  noise({dur:1.2,type:'lowpass',freq:420,vol:0.26,attack:0.004});
  [55,82.41,110].forEach((f)=> setTimeout(()=>tone({f0:f,f1:f,dur:1.5,type:'sine',vol:0.075}), 70)); // A power chord, low
  glitch(6);
}
const boom = online; // alias

// legacy horror cues kept available but unused by the (now serious) boot
function growl(){ for(let i=0;i<3;i++) setTimeout(()=>tone({f0:54+i*6,f1:34,dur:0.42,type:'sawtooth',vol:0.1}), i*55); }
function shriek(){ tone({f0:900,f1:2600,dur:0.4,type:'sawtooth',vol:0.04}); }

// composite cues — all low / serious
const SFX = {
  // boot
  thud:    ()=> thud(),
  online:  ()=> online(),
  confirm: ()=>{ tone({f0:174.6,f1:174.6,dur:0.5,type:'sine',vol:0.1}); setTimeout(()=>tone({f0:261.6,f1:261.6,dur:0.8,type:'sine',vol:0.085}),150); },
  nettick: ()=>{ noise({dur:0.05,type:'lowpass',freq:520,vol:0.035,attack:0.003}); },
  impact:  ()=>{ tone({f0:300,f1:30,dur:0.7,type:'sawtooth',vol:0.34}); noise({dur:0.6,type:'lowpass',freq:420,vol:0.2}); glitch(5); },
  sweep:   ()=> tone({f0:60,f1:340,dur:1.0,type:'sawtooth',vol:0.07}),
  // app (subtle, low)
  key:     ()=> noise({dur:0.02,type:'lowpass',freq:900,vol:0.03,attack:0.002}),
  type:    ()=> noise({dur:0.016,type:'lowpass',freq:700,vol:0.025,attack:0.002}),
  blip:    ()=> tone({f0:240,f1:150,dur:0.12,type:'sine',vol:0.07}),
  tab:     ()=>{ tone({f0:170,f1:130,dur:0.07,type:'sine',vol:0.05}); },
  listen:  ()=>{ tone({f0:90,f1:150,dur:0.4,type:'sine',vol:0.08}); noise({dur:0.35,type:'bandpass',freq:600,q:1.2,vol:0.04,attack:0.12}); },
  think:   ()=> tone({f0:70,f1:70,dur:0.2,type:'sine',vol:0.06}),
  speak:   ()=> tone({f0:150,f1:200,dur:0.22,type:'triangle',vol:0.07}),
  off:     ()=> tone({f0:200,f1:64,dur:0.34,type:'sine',vol:0.08}),
  chime:   ()=>{ tone({f0:174.6,f1:174.6,dur:0.5,type:'sine',vol:0.1}); setTimeout(()=>tone({f0:261.6,f1:261.6,dur:0.8,type:'sine',vol:0.085}),150); },
  growl:   ()=> growl(),
  shriek:  ()=> shriek(),
  boom:    ()=> online(),
};

['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{ try{ctx().resume();}catch(e){} },{once:true}));

function muteAt(sec){ try{ const c=ctx(); ensureBus(); const t=c.currentTime+sec; master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(master.gain.value, Math.max(c.currentTime, t-0.4)); master.gain.linearRampToValueAtTime(0.0001, t); }catch(e){} }
function setMaster(v){ try{ const c=ctx(); ensureBus(); master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(v, c.currentTime); }catch(e){} }

window.JAUDIO = { tone, noise, digi, glitch, drone, rumble, riser, thud, online, boom, muteAt, setMaster, SFX, ctx };
