/* ============================================================
   audio.js — sci-fi SFX synthesized on the fly (no files)
   ============================================================ */
let ac;
const ctx = () => (ac ??= new (window.AudioContext || window.webkitAudioContext)());
let master, reverb;

function ensureBus(){
  const c = ctx();
  if(master) return;
  master = c.createGain(); master.gain.value = 0.9;
  // generated impulse reverb (decaying noise)
  reverb = c.createConvolver();
  const len = c.sampleRate * 1.4, buf = c.createBuffer(2, len, c.sampleRate);
  for(let ch=0; ch<2; ch++){
    const d = buf.getChannelData(ch);
    for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.4);
  }
  reverb.buffer = buf;
  const wet = c.createGain(); wet.gain.value = 0.22;
  master.connect(c.destination);
  master.connect(reverb).connect(wet).connect(c.destination);
}

// tone with frequency sweep + ADSR-ish envelope
function tone({f0=440,f1=f0,dur=0.2,type='sine',vol=0.2}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),g=c.createGain();
    o.type=type;
    o.frequency.setValueAtTime(f0,c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),c.currentTime+dur);
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    o.connect(g).connect(master); o.start(); o.stop(c.currentTime+dur+0.02);
  }catch(e){}
}

// noise burst through a filter (typing ticks, sweeps, breaths)
function noise({dur=0.05,type='lowpass',freq=1200,vol=0.15}={}){
  try{
    const c=ctx(); ensureBus();
    const n=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();
    const buf=c.createBuffer(1,Math.max(1,c.sampleRate*dur),c.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    n.buffer=buf; f.type=type; f.frequency.value=freq;
    g.gain.setValueAtTime(vol,c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    n.connect(f).connect(g).connect(master); n.start(); n.stop(c.currentTime+dur+0.02);
  }catch(e){}
}

// digital bitcrushed timbre
function digi({f0=320,dur=0.18,vol=0.14}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter(),sh=c.createWaveShaper();
    const curve=new Float32Array(256); const step=4;
    for(let i=0;i<256;i++){const x=i/255*2-1; curve[i]=Math.round(x*step)/step;}
    sh.curve=curve;
    o.type='square'; o.frequency.value=f0;
    f.type='bandpass'; f.frequency.value=f0*2.2; f.Q.value=2;
    g.gain.setValueAtTime(vol,c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    o.connect(sh).connect(f).connect(g).connect(master); o.start(); o.stop(c.currentTime+dur+0.02);
  }catch(e){}
}

// glitch: random digital knocks
function glitch(n=7){
  for(let i=0;i<n;i++) setTimeout(()=>digi({f0:120+Math.random()*900,dur:0.04+Math.random()*0.05,vol:0.1}), i*Math.random()*70);
}

// low continuous drone (returns a stop fn)
function drone({f0=55,vol=0.05}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),o2=c.createOscillator(),g=c.createGain();
    o.type='sawtooth'; o.frequency.value=f0; o2.type='sine'; o2.frequency.value=f0*2.01;
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+1.2);
    o.connect(g); o2.connect(g); g.connect(master); o.start(); o2.start();
    return ()=>{ try{ g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.6); o.stop(c.currentTime+0.7); o2.stop(c.currentTime+0.7);}catch(e){} };
  }catch(e){ return ()=>{}; }
}

// ---- ominous / "scary" sound layer ----
// deep menacing rumble (returns stop fn)
function rumble({f0=30,vol=0.15,dur=0}={}){
  try{
    const c=ctx(); ensureBus();
    const o=c.createOscillator(),o2=c.createOscillator(),lfo=c.createOscillator(),lg=c.createGain(),g=c.createGain(),f=c.createBiquadFilter();
    o.type='sawtooth'; o.frequency.value=f0; o2.type='sawtooth'; o2.frequency.value=f0*1.013;
    f.type='lowpass'; f.frequency.value=150;
    lfo.type='sine'; lfo.frequency.value=5.2; lg.gain.value=vol*0.55; lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+0.9);
    o.connect(f); o2.connect(f); f.connect(g).connect(master);
    lfo.start(); o.start(); o2.start();
    const stop=()=>{ try{ g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(Math.max(0.0002,g.gain.value),c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.7); o.stop(c.currentTime+0.8); o2.stop(c.currentTime+0.8); lfo.stop(c.currentTime+0.8);}catch(e){} };
    if(dur) setTimeout(stop, dur*1000);
    return stop;
  }catch(e){ return ()=>{}; }
}
// rising dissonant tension sweep
function riser({dur=3,vol=0.13}={}){
  try{
    const c=ctx(); ensureBus();
    const n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
    const len=Math.max(1,Math.floor(c.sampleRate*dur)), buf=c.createBuffer(1,len,c.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    n.buffer=buf; f.type='bandpass'; f.Q.value=7;
    f.frequency.setValueAtTime(200,c.currentTime);
    f.frequency.exponentialRampToValueAtTime(5200,c.currentTime+dur);
    g.gain.setValueAtTime(0.0001,c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol,c.currentTime+dur*0.9);
    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    const o=c.createOscillator(),o2=c.createOscillator(),og=c.createGain();
    o.type='sawtooth'; o2.type='sawtooth';
    o.frequency.setValueAtTime(78,c.currentTime); o.frequency.exponentialRampToValueAtTime(880,c.currentTime+dur);
    o2.frequency.setValueAtTime(83,c.currentTime); o2.frequency.exponentialRampToValueAtTime(960,c.currentTime+dur); // detuned = dissonant
    og.gain.setValueAtTime(0.0001,c.currentTime); og.gain.exponentialRampToValueAtTime(vol*0.45,c.currentTime+dur*0.9); og.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
    n.connect(f).connect(g).connect(master); o.connect(og); o2.connect(og); og.connect(master);
    n.start(); o.start(); o2.start();
    n.stop(c.currentTime+dur+0.05); o.stop(c.currentTime+dur+0.05); o2.stop(c.currentTime+dur+0.05);
  }catch(e){}
}
// huge sub impact
function boom({vol=0.42}={}){
  tone({f0:150,f1:22,dur:1.1,type:'sine',vol});
  tone({f0:92,f1:16,dur:1.35,type:'sawtooth',vol:vol*0.5});
  noise({dur:0.9,type:'lowpass',freq:320,vol:0.24});
  glitch(13);
}
// low detuned growl burst
function growl(){
  for(let i=0;i<3;i++) setTimeout(()=>tone({f0:58+i*7,f1:38,dur:0.42,type:'sawtooth',vol:0.12}), i*55);
  noise({dur:0.5,type:'lowpass',freq:220,vol:0.1});
}
// metallic high shriek
function shriek(){
  tone({f0:1700,f1:5400,dur:0.5,type:'sawtooth',vol:0.05});
  noise({dur:0.4,type:'highpass',freq:4200,vol:0.06});
}

// composite cues
const SFX = {
  type:   ()=> noise({dur:0.018,type:'highpass',freq:2600,vol:0.05}),
  key:    ()=> tone({f0:1400+Math.random()*600,f1:900,dur:0.03,type:'square',vol:0.04}),
  impact: ()=>{ tone({f0:420,f1:34,dur:0.6,type:'sawtooth',vol:0.32}); noise({dur:0.5,type:'lowpass',freq:500,vol:0.2}); glitch(11); },
  chime:  ()=>{ tone({f0:880,f1:1320,dur:0.5,type:'sine',vol:0.14}); setTimeout(()=>tone({f0:1320,f1:1760,dur:0.6,type:'sine',vol:0.1}),90); },
  sweep:  ()=> tone({f0:120,f1:1600,dur:0.9,type:'sawtooth',vol:0.08}),
  blip:   ()=> tone({f0:1200,f1:1800,dur:0.08,type:'sine',vol:0.1}),
  listen: ()=>{ tone({f0:660,f1:990,dur:0.18,type:'sine',vol:0.12}); SFX.blip(); },
  think:  ()=> digi({f0:300,dur:0.12,vol:0.08}),
  speak:  ()=> tone({f0:520,f1:760,dur:0.2,type:'triangle',vol:0.1}),
  off:    ()=> tone({f0:520,f1:180,dur:0.22,type:'sine',vol:0.1}),
  tab:    ()=> tone({f0:900,f1:1100,dur:0.05,type:'square',vol:0.05}),
  growl:  ()=> growl(),
  shriek: ()=> shriek(),
  boom:   ()=> boom(),
};

// unlock on first gesture
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{ try{ctx().resume();}catch(e){} },{once:true}));

// ramp the whole bus to silence `sec` seconds from now (audio clock)
function muteAt(sec){ try{ const c=ctx(); ensureBus(); const t=c.currentTime+sec; master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(master.gain.value, Math.max(c.currentTime, t-0.35)); master.gain.linearRampToValueAtTime(0.0001, t); }catch(e){} }
// hard set master level (used to re-enable app SFX after the boot mute)
function setMaster(v){ try{ const c=ctx(); ensureBus(); master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(v, c.currentTime); }catch(e){} }

window.JAUDIO = { tone, noise, digi, glitch, drone, rumble, riser, boom, muteAt, setMaster, SFX, ctx };
