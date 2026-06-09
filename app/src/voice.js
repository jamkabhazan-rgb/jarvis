/* ============================================================
   voice.js — mic capture (STT) + TTS playback with orb reactivity.
   Active only inside the Tauri app (needs the core for OpenAI calls).
   In a plain browser it's inert and the UI falls back to text/sim.
   ============================================================ */
(function(){
  const inTauri = ()=> !!(window.BRIDGE && window.BRIDGE.inTauri);

  let rec=null, chunks=[], micStream=null;
  let actx=null, curSrc=null;

  function blobToB64(blob){
    return new Promise(res=>{ const r=new FileReader(); r.onloadend=()=>res(String(r.result).split(',')[1]||''); r.readAsDataURL(blob); });
  }

  async function startRec(){
    micStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    chunks=[]; rec = new MediaRecorder(micStream);
    rec.ondataavailable = e=>{ if(e.data && e.data.size) chunks.push(e.data); };
    rec.start();
  }

  // stop recording -> transcribe via core -> return text
  function transcribe(){
    return new Promise((resolve,reject)=>{
      if(!rec){ resolve(''); return; }
      rec.onstop = async ()=>{
        try{
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          micStream?.getTracks().forEach(t=>t.stop());
          if(!blob.size){ resolve(''); return; }
          const b64 = await blobToB64(blob);
          const text = await BRIDGE.invoke('transcribe', { audioB64:b64, mime:blob.type });
          resolve(text||'');
        }catch(e){ reject(e); }
        finally{ rec=null; }
      };
      rec.stop();
    });
  }

  function stopPlayback(){ try{ curSrc?.stop(); }catch(e){} curSrc=null; }

  // synthesize + play, driving ORB amplitude from the live waveform
  async function speak(text){
    if(!inTauri() || !text || !text.trim()) return;
    let b64; try{ b64 = await BRIDGE.invoke('speak', { text }); }catch(e){ return; }
    if(!b64) return;
    const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended') try{ await actx.resume(); }catch(e){}
    let buf; try{ buf = await actx.decodeAudioData(bytes.buffer); }catch(e){ return; }

    stopPlayback();
    const src = actx.createBufferSource(); src.buffer = buf;
    const an = actx.createAnalyser(); an.fftSize = 256;
    src.connect(an); an.connect(actx.destination);
    const data = new Uint8Array(an.frequencyBinCount);
    curSrc = src;
    window.ORB?.set('speaking');
    src.start();
    (function tick(){
      if(curSrc!==src) return;
      an.getByteFrequencyData(data);
      let s=0; for(let i=0;i<data.length;i++) s+=data[i];
      window.ORB?.amp(Math.min(1, (s/data.length)/110));
      requestAnimationFrame(tick);
    })();
    src.onended = ()=>{ if(curSrc===src) curSrc=null; window.ORB?.amp(0.05); window.ORB?.set('idle'); };
  }

  window.VOICE = { inTauri, startRec, transcribe, speak, stopPlayback };
})();
