// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 12: PLAYER COMPONENTS                                ║
// ║  PlayerView, DetailMiniPlayer, FloatingPlayer                ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ PLAYER VIEW ━━━━━━━━
function PlayerView({T,audioElRef,audioObjectUrl,activeEntry,activeEid,meta,audioFile,entries,profiles,activePid,setActivePid,loadEntry,setAudioObjectUrl,setAudioFile,playerVisible}){
  const playerSidebar=useDragResize({key:'tl_w_player_sidebar',defaultW:200,min:120,max:360,label:'Library'});
  const canvasRef=useRef();
  const containerRef=useRef();
  const rafRef=useRef();
  const decodedRef=useRef(null);
  const [playing,setPlaying]=useState(false);
  const [currentTime,setCurrentTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(1);
  const [decoding,setDecoding]=useState(false);

  const fmt=s=>{if(!s||!isFinite(s))return'0:00';const m=Math.floor(s/60),sc=Math.floor(s%60);return`${m}:${sc.toString().padStart(2,'0')}`;};

  // Mirror audio element state
  useEffect(()=>{
    const el=audioElRef?.current;if(!el)return;
    const onTime=()=>setCurrentTime(el.currentTime);
    const onMeta=()=>setDuration(el.duration||0);
    const onPlay=()=>setPlaying(true);
    const onPause=()=>setPlaying(false);
    const onEnd=()=>setPlaying(false);
    el.addEventListener('timeupdate',onTime);el.addEventListener('loadedmetadata',onMeta);
    el.addEventListener('durationchange',onMeta);el.addEventListener('play',onPlay);
    el.addEventListener('pause',onPause);el.addEventListener('ended',onEnd);
    // Sync initial state
    setCurrentTime(el.currentTime||0);setDuration(el.duration||0);setPlaying(!el.paused);
    return()=>{el.removeEventListener('timeupdate',onTime);el.removeEventListener('loadedmetadata',onMeta);el.removeEventListener('durationchange',onMeta);el.removeEventListener('play',onPlay);el.removeEventListener('pause',onPause);el.removeEventListener('ended',onEnd);};
  },[audioElRef]);

  // Decode waveform whenever track changes — cache peaks in IDB to skip re-decode on repeat loads
  useEffect(()=>{
    decodedRef.current=null;
    if(!audioObjectUrl)return;
    let cancelled=false;
    setDecoding(true);
    (async()=>{
      try{
        // Try cached peaks first — avoids full WebAudio decode for already-seen tracks
        if(activeEid){
          const cached=await IDB.get(`peaks_${activeEid}`).catch(()=>null);
          if(cached&&!cancelled){decodedRef.current=new Float32Array(cached);setDecoding(false);return;}
        }
        const ac=new(window.AudioContext||window.webkitAudioContext)();
        const res=await fetch(audioObjectUrl);
        const buf=await res.arrayBuffer();
        const decoded=await ac.decodeAudioData(buf);
        if(!cancelled){
          const peaks=new Float32Array(decoded.getChannelData(0)); // own copy, channel 0
          decodedRef.current=peaks;
          // Cache asynchronously — fire-and-forget, don't block render
          if(activeEid)IDB.set(`peaks_${activeEid}`,peaks.buffer).catch(()=>{});
        }
        await ac.close();
      }catch(e){console.warn('PlayerView decode:',e);}
      finally{if(!cancelled)setDecoding(false);}
    })();
    return()=>{cancelled=true;};
  },[audioObjectUrl,activeEid]);

  // Canvas waveform draw loop
  const drawWave=useCallback(()=>{
    rafRef.current=requestAnimationFrame(drawWave);
    const canvas=canvasRef.current;if(!canvas)return;
    const W=canvas.width,H=canvas.height;if(!W||!H)return;
    const c=canvas.getContext('2d');
    c.clearRect(0,0,W,H);
    const accent=T.accent;
    const decoded=decodedRef.current;

    if(!decoded||!duration){
      // Empty state — just draw center line
      c.strokeStyle=T.border;c.lineWidth=1;
      c.beginPath();c.moveTo(0,H/2);c.lineTo(W,H/2);c.stroke();
      return;
    }

    const totalSamples=decoded.length;
    const samplesPerPixel=Math.max(1,Math.floor(totalSamples/W));

    // Draw full waveform as filled envelope
    c.beginPath();c.moveTo(0,H/2);
    for(let px=0;px<W;px++){
      const si=Math.floor((px/W)*totalSamples);
      let mx=0;
      for(let s=si;s<Math.min(si+samplesPerPixel,totalSamples);s++) mx=Math.max(mx,Math.abs(decoded[s]));
      c.lineTo(px,H/2-mx*(H/2-2));
    }
    for(let px=W-1;px>=0;px--){
      const si=Math.floor((px/W)*totalSamples);
      let mx=0;
      for(let s=si;s<Math.min(si+samplesPerPixel,totalSamples);s++) mx=Math.max(mx,Math.abs(decoded[s]));
      c.lineTo(px,H/2+mx*(H/2-2));
    }
    c.closePath();
    c.fillStyle=T.bright+'44';
    c.fill();

    // Played portion — filled with accent
    if(currentTime>0&&duration>0){
      const playedPx=Math.floor((currentTime/duration)*W);
      c.beginPath();c.moveTo(0,H/2);
      for(let px=0;px<Math.min(playedPx,W);px++){
        const si=Math.floor((px/W)*totalSamples);
        let mx=0;
        for(let s=si;s<Math.min(si+samplesPerPixel,totalSamples);s++) mx=Math.max(mx,Math.abs(decoded[s]));
        c.lineTo(px,H/2-mx*(H/2-2));
      }
      for(let px=Math.min(playedPx,W)-1;px>=0;px--){
        const si=Math.floor((px/W)*totalSamples);
        let mx=0;
        for(let s=si;s<Math.min(si+samplesPerPixel,totalSamples);s++) mx=Math.max(mx,Math.abs(decoded[s]));
        c.lineTo(px,H/2+mx*(H/2-2));
      }
      c.closePath();
      const grad=c.createLinearGradient(0,0,playedPx,0);
      grad.addColorStop(0,accent+'99');grad.addColorStop(1,accent);
      c.fillStyle=grad;c.fill();

      // Playhead line
      c.strokeStyle=accent;c.lineWidth=2;
      c.beginPath();c.moveTo(playedPx,0);c.lineTo(playedPx,H);c.stroke();
    }
  },[T,currentTime,duration]);

  useEffect(()=>{
    rafRef.current=requestAnimationFrame(drawWave);
    return()=>{if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}};
  },[drawWave]);

  // Resize canvas
  useEffect(()=>{
    const resize=()=>{const cv=canvasRef.current,p=containerRef.current;if(!cv||!p)return;cv.width=p.clientWidth;cv.height=p.clientHeight;};
    resize();const ro=new ResizeObserver(resize);if(containerRef.current)ro.observe(containerRef.current);
    return()=>ro.disconnect();
  },[]);

  const togglePlay=()=>{const el=audioElRef?.current;if(!el||!audioObjectUrl)return;playing?el.pause():el.play();};
  const seek=pct=>{const el=audioElRef?.current;if(!el||!duration)return;el.currentTime=pct*duration;};
  const seekByCanvas=e=>{const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/r.width);};
  const changeVol=v=>{const el=audioElRef?.current;if(!el)return;el.volume=v;setVolume(v);};
  const skip=sec=>{const el=audioElRef?.current;if(!el)return;el.currentTime=Math.max(0,Math.min(duration,el.currentTime+sec));};

  const thumb=activeEntry?.albumArtThumb||(meta?.albumArt&&!meta.albumArt.startsWith('[stored]')?meta.albumArt:null);
  const title=activeEntry?.title||meta?.title||audioFile?.name||'No track loaded';
  const artist=activeEntry?.artist||meta?.artist||'';
  const classCode=activeEntry?.classCode||'';
  const hasTrack=!!audioObjectUrl;

  // Group entries by profile for nav
  const profileEntries=useMemo(()=>profiles.map(p=>({
    ...p,tracks:entries.filter(e=>e.profileId===p.id).sort((a,b)=>(b.updated||'').localeCompare(a.updated||''))
  })),[profiles,entries]);

  return(
    <div style={{minHeight:'100%',display:'flex',overflow:'visible',background:T.bg}}>

      {/* ── LEFT NAV ── */}
      <div style={{width:playerSidebar.width,flexShrink:0,borderRight:playerSidebar.collapsed?'none':`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',background:T.panel,position:'relative',transition:'width 0.15s'}}>
        <div {...playerSidebar.handle}/>
        {playerSidebar.tab}
        <div style={{padding:'12px 12px 8px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontSize:8,letterSpacing:'0.25em',textTransform:'uppercase',color:T.muted}}>Library</div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'6px'}}>
          {profileEntries.length===0&&(
            <div style={{padding:'20px 8px',fontSize:9,color:T.muted,textAlign:'center',lineHeight:1.8}}>No profiles yet.<br/>Create one in Archive.</div>
          )}
          {profileEntries.map(p=>(
            <div key={p.id} style={{marginBottom:4}}>
              <div onClick={()=>setActivePid(p.id)} style={{padding:'7px 8px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',borderRadius:T.r||0,background:activePid===p.id?T.card:'transparent'}}>
                <span style={{fontSize:10,fontWeight:700,color:activePid===p.id?T.accent:T.bright,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{p.name}</span>
                <span style={{fontSize:8,color:T.muted,flexShrink:0,marginLeft:4}}>{p.tracks.length}</span>
              </div>
              {activePid===p.id&&p.tracks.map(e=>(
                <div key={e.id} onClick={()=>loadEntry(e)} style={{padding:'5px 8px 5px 18px',cursor:'pointer',borderRadius:T.r||0,background:e.id===activeEid?T.bg:'transparent',marginBottom:1,display:'flex',alignItems:'center',gap:6}}>
                  {e.id===activeEid&&<div style={{width:4,height:4,borderRadius:'50%',background:T.accent,flexShrink:0}}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:9,color:e.id===activeEid?T.accent:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.title||'Untitled'}</div>
                    {e.artist&&<div style={{fontSize:8,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.artist}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {playerSidebar.expandStub}

      {/* ── MAIN AREA ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflowY:'auto',minWidth:0}}>

        {/* Art + Info */}
        <div style={{flex:1,display:'flex',gap:0,minHeight:0}}>
          {/* Album art */}
          <div style={{flexShrink:0,width:'min(40%,320px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:T.bg}}>
            {thumb?(
              <div style={{width:'100%',maxWidth:260,aspectRatio:'1',borderRadius:(T.r||0)*2,overflow:'hidden',border:`1px solid ${T.border}`,boxShadow:'0 8px 40px rgba(0,0,0,0.4)'}}>
                <img src={thumb} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} alt=""/>
              </div>
            ):(
              <div style={{width:'100%',maxWidth:260,aspectRatio:'1',borderRadius:(T.r||0)*2,border:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',background:T.panel}}>
                <div style={{fontSize:48,opacity:0.08}}>♫</div>
              </div>
            )}
          </div>

          {/* Track info */}
          <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',padding:'24px 32px',minWidth:0,overflow:'hidden'}}>
            {hasTrack?(
              <>
                <div style={{fontSize:8,letterSpacing:'0.25em',textTransform:'uppercase',color:T.muted,marginBottom:12}}>Now Playing</div>
                <div style={{fontSize:26,fontWeight:700,color:T.bright,lineHeight:1.2,marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{title}</div>
                {artist&&<div style={{fontSize:13,color:T.text,marginBottom:16,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{artist}</div>}
                {classCode&&(
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                    <span style={{fontFamily:'monospace',fontSize:16,color:T.accent,letterSpacing:'0.1em'}}>{classCode}</span>
                    <span style={{fontSize:9,color:T.muted}}>{activeEntry?.[Symbol.iterator]?'':(activeEntry?.classCode?`— ${activeEntry.metadata?.genre||''}`:'')}</span>
                  </div>
                )}
                <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                  {activeEntry?.metadata?.genre&&<div><div style={{fontSize:7,color:T.muted,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:2}}>Genre</div><div style={{fontSize:10,color:T.text}}>{activeEntry.metadata.genre}</div></div>}
                  {activeEntry?.metadata?.bpm&&<div><div style={{fontSize:7,color:T.muted,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:2}}>BPM</div><div style={{fontSize:10,color:T.text}}>{activeEntry.metadata.bpm}</div></div>}
                  {activeEntry?.metadata?.key&&<div><div style={{fontSize:7,color:T.muted,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:2}}>Key</div><div style={{fontSize:10,color:T.text}}>{activeEntry.metadata.key}</div></div>}
                  {activeEntry?.metadata?.year&&<div><div style={{fontSize:7,color:T.muted,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:2}}>Year</div><div style={{fontSize:10,color:T.text}}>{activeEntry.metadata.year}</div></div>}
                  {duration>0&&<div><div style={{fontSize:7,color:T.muted,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:2}}>Length</div><div style={{fontSize:10,color:T.text}}>{fmt(duration)}</div></div>}
                </div>
              </>
            ):(
              <div style={{textAlign:'center',opacity:0.3}}>
                <div style={{fontSize:32,marginBottom:12}}>◈</div>
                <div style={{fontSize:10,letterSpacing:'0.15em',textTransform:'uppercase',color:T.muted}}>Select a track to play</div>
              </div>
            )}
          </div>
        </div>

        {/* ── WAVEFORM + CONTROLS ── */}
        <div style={{flexShrink:0,borderTop:`1px solid ${T.border}`,background:T.panel,padding:`0 0 ${playerVisible?72:16}px`}}>

          {/* Waveform canvas — click to seek */}
          <div ref={containerRef} style={{height:64,cursor:hasTrack?'pointer':'default',position:'relative'}} onClick={hasTrack?seekByCanvas:undefined}>
            <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%'}}/>
            {decoding&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:8,color:T.muted,letterSpacing:'0.15em'}}>DECODING…</span></div>}
          </div>

          {/* Time row */}
          <div style={{display:'flex',justifyContent:'space-between',padding:'2px 16px 10px',fontSize:8,color:T.muted,fontVariantNumeric:'tabular-nums'}}>
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>

          {/* Controls row */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'0 16px 4px'}}>
            {/* Restart / Back */}
            <button onClick={()=>{const el=audioElRef?.current;if(el)el.currentTime=0;}} disabled={!hasTrack} title="Restart" style={{background:'none',border:`1px solid ${hasTrack?T.border:'transparent'}`,color:hasTrack?T.text:T.muted,cursor:hasTrack?'pointer':'default',fontSize:11,padding:'5px 8px',borderRadius:T.r||0,fontFamily:'inherit',lineHeight:1}}>⏮</button>
            {/* Back 10s */}
            <button onClick={()=>skip(-10)} disabled={!hasTrack} title="Back 10s" style={{background:'none',border:`1px solid ${hasTrack?T.border:'transparent'}`,color:hasTrack?T.text:T.muted,cursor:hasTrack?'pointer':'default',fontSize:11,padding:'5px 8px',borderRadius:T.r||0,fontFamily:'inherit',lineHeight:1}}>−10s</button>
            {/* Stop */}
            <button onClick={()=>{const el=audioElRef?.current;if(!el)return;el.pause();el.currentTime=0;}} disabled={!hasTrack} title="Stop" style={{background:'none',border:`1px solid ${hasTrack?T.border:'transparent'}`,color:hasTrack?T.text:T.muted,cursor:hasTrack?'pointer':'default',fontSize:14,padding:'5px 9px',borderRadius:T.r||0,fontFamily:'inherit',lineHeight:1}}>⏹</button>
            {/* Play */}
            <button onClick={()=>{const el=audioElRef?.current;if(el&&audioObjectUrl)el.play();}} disabled={!hasTrack||playing} title="Play" style={{width:44,height:44,borderRadius:'50%',border:`1px solid ${hasTrack&&!playing?T.accent:T.border}`,background:hasTrack&&!playing?T.accent:'transparent',color:hasTrack&&!playing?T.bg:T.muted,fontSize:14,cursor:hasTrack&&!playing?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0}}>▶</button>
            {/* Pause */}
            <button onClick={()=>{const el=audioElRef?.current;if(el)el.pause();}} disabled={!hasTrack||!playing} title="Pause" style={{width:44,height:44,borderRadius:'50%',border:`1px solid ${hasTrack&&playing?T.accent:T.border}`,background:hasTrack&&playing?T.accent:'transparent',color:hasTrack&&playing?T.bg:T.muted,fontSize:12,cursor:hasTrack&&playing?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0}}>⏸</button>
            {/* Forward 10s */}
            <button onClick={()=>skip(10)} disabled={!hasTrack} title="Forward 10s" style={{background:'none',border:`1px solid ${hasTrack?T.border:'transparent'}`,color:hasTrack?T.text:T.muted,cursor:hasTrack?'pointer':'default',fontSize:11,padding:'5px 8px',borderRadius:T.r||0,fontFamily:'inherit',lineHeight:1}}>+10s</button>
            {/* Volume */}
            <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:16}}>
              <span style={{fontSize:11,color:T.muted,cursor:'pointer'}} onClick={()=>changeVol(volume>0?0:1)}>{volume===0?'🔇':volume<0.5?'🔉':'🔊'}</span>
              <input type="range" min={0} max={1} step={0.02} value={volume} onChange={e=>changeVol(+e.target.value)} style={{width:72,accentColor:T.accent}}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ━━━━━━━━ DETAIL MINI PLAYER ━━━━━━━━
// v0.0.1: Removed private <audio> element. Now piggybacks on the shared
// audioElRef from App, eliminating the dual-audio conflict. Props:
//   audioElRef    — the single shared HTMLAudioElement ref from App
//   audioObjectUrl — the current blob URL loaded in the shared player
//   isCurrentEntry — true when this entry is the one in the shared player
//   onLoad        — called when user hits play but entry isn't loaded yet
function DetailMiniPlayer({T,entry,audioElRef,audioObjectUrl,isCurrentEntry,onLoad}){
  const [dp,setDp]=useState(false);
  const [dt,setDt]=useState(0);
  const [dd,setDd]=useState(0);
  // loaded = this entry is actually in the shared player right now
  const loaded=isCurrentEntry&&!!audioObjectUrl;
  const fmt=s=>{if(!s||!isFinite(s))return'0:00';const m=Math.floor(s/60),sc=Math.floor(s%60);return`${m}:${sc.toString().padStart(2,'0')}`;};

  // Mirror shared audio element events
  useEffect(()=>{
    const el=audioElRef?.current;if(!el)return;
    const onP=()=>setDp(true),onPs=()=>setDp(false),onE=()=>setDp(false);
    const onT=()=>setDt(el.currentTime);
    const onM=()=>setDd(el.duration||0);
    el.addEventListener('play',onP);el.addEventListener('pause',onPs);el.addEventListener('ended',onE);
    el.addEventListener('timeupdate',onT);el.addEventListener('loadedmetadata',onM);el.addEventListener('durationchange',onM);
    // Sync immediately in case audio is already playing
    setDp(!el.paused);setDt(el.currentTime||0);setDd(el.duration||0);
    return()=>{
      el.removeEventListener('play',onP);el.removeEventListener('pause',onPs);el.removeEventListener('ended',onE);
      el.removeEventListener('timeupdate',onT);el.removeEventListener('loadedmetadata',onM);el.removeEventListener('durationchange',onM);
    };
  },[audioElRef,isCurrentEntry]);

  // Reset display counters whenever this entry leaves the shared player
  useEffect(()=>{if(!loaded){setDp(false);setDt(0);setDd(0);}},[loaded]);

  const toggle=()=>{
    if(!loaded){onLoad?.();return;} // not loaded → ask parent to load it
    const el=audioElRef?.current;if(!el)return;
    dp?el.pause():el.play();
  };
  const seek=e=>{
    if(!loaded)return;
    const el=audioElRef?.current;if(!el||!dd)return;
    const r=e.currentTarget.getBoundingClientRect();
    el.currentTime=(e.clientX-r.left)/r.width*dd;
  };

  return(
    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0,padding:'7px 10px',display:'flex',flexDirection:'column',gap:6}}>
      {/* ── No private <audio> here — uses shared audioElRef from App ── */}
      {/* Controls row */}
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <button onClick={toggle}
          title={loaded?(dp?'Pause':'Play'):'Load track into player'}
          style={{flexShrink:0,width:26,height:26,borderRadius:'50%',
            border:`1px solid ${loaded?T.accent:T.border}`,
            background:loaded?T.accent:'transparent',
            color:loaded?T.bg:T.muted,
            fontSize:loaded?10:7,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontFamily:'inherit',lineHeight:1,padding:0,letterSpacing:'0.04em'}}>
          {loaded?(dp?'▮▮':'▶'):'↓'}
        </button>
        <span style={{fontSize:8,color:T.text,fontVariantNumeric:'tabular-nums',letterSpacing:'0.04em'}}>{fmt(dt)}</span>
        <div style={{flex:1}}/>
        <span style={{fontSize:8,color:T.muted,fontVariantNumeric:'tabular-nums',letterSpacing:'0.04em'}}>{fmt(dd)}</span>
      </div>
      {/* Seekable progress bar */}
      <div style={{width:'100%',height:18,display:'flex',alignItems:'center',cursor:loaded?'pointer':'default'}} onClick={seek}>
        <div style={{width:'100%',height:2,background:T.border,borderRadius:2,overflow:'hidden',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,
            width:`${dd&&loaded?dt/dd*100:0}%`,
            background:T.accent,borderRadius:2,transition:'width 0.1s linear'}}/>
        </div>
      </div>
      {!loaded&&(
        <div style={{fontSize:7,color:T.muted,textAlign:'center',letterSpacing:'0.08em',textTransform:'uppercase'}}>
          ↓ Load track to preview
        </div>
      )}
    </div>
  );
}
// ━━━━━━━━ FLOATING PLAYER ━━━━━━━━
function FloatingPlayer({T,audioObjectUrl,audioFile,activeEntry,meta,autoHide,audioElRef}){
  const audioEl=audioElRef;
  const [playing,setPlaying]=useState(false);
  const [currentTime,setCurrentTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(1);
  const [minimized,setMinimized]=useState(false);
  const [revealed,setRevealed]=useState(false);
  const hideTimer=useRef(null);

  // Sync src when URL changes
  useEffect(()=>{
    const el=audioEl.current;if(!el)return;
    if(audioObjectUrl){el.src=audioObjectUrl;el.load();setCurrentTime(0);setDuration(0);setPlaying(false);}
    else{el.src='';setPlaying(false);}
  },[audioObjectUrl]);

  // Wire audio events
  useEffect(()=>{
    const el=audioEl.current;if(!el)return;
    const onTime=()=>setCurrentTime(el.currentTime);
    const onMeta=()=>setDuration(el.duration||0);
    const onEnd=()=>setPlaying(false);
    const onPlay=()=>setPlaying(true);
    const onPause=()=>setPlaying(false);
    el.addEventListener('timeupdate',onTime);
    el.addEventListener('loadedmetadata',onMeta);
    el.addEventListener('durationchange',onMeta);
    el.addEventListener('ended',onEnd);
    el.addEventListener('play',onPlay);
    el.addEventListener('pause',onPause);
    return()=>{el.removeEventListener('timeupdate',onTime);el.removeEventListener('loadedmetadata',onMeta);el.removeEventListener('durationchange',onMeta);el.removeEventListener('ended',onEnd);el.removeEventListener('play',onPlay);el.removeEventListener('pause',onPause);};
  },[]);

  // Auto-hide hover handlers
  const handleMouseEnter=()=>{
    if(!autoHide)return;
    clearTimeout(hideTimer.current);
    setRevealed(true);
  };
  const handleMouseLeave=()=>{
    if(!autoHide)return;
    hideTimer.current=setTimeout(()=>setRevealed(false),600);
  };

  // When autoHide is turned off, reset revealed state
  useEffect(()=>{if(!autoHide)setRevealed(false);},[autoHide]);

  const togglePlay=()=>{const el=audioEl.current;if(!el||!audioObjectUrl)return;playing?el.pause():el.play();};
  const seek=v=>{const el=audioEl.current;if(!el||!duration)return;el.currentTime=v;setCurrentTime(v);};
  const changeVol=v=>{const el=audioEl.current;if(!el)return;el.volume=v;setVolume(v);};
  const fmt=s=>{if(!s||!isFinite(s))return'0:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return`${m}:${sec.toString().padStart(2,'0')}`;};

  const title=activeEntry?.title||meta?.title||audioFile?.name||'No track loaded';
  const artist=activeEntry?.artist||meta?.artist||'';
  const thumb=activeEntry?.albumArtThumb||(meta?.albumArt&&!meta.albumArt.startsWith('[stored]')?meta.albumArt:null);
  const hasTrack=!!audioObjectUrl;

  // Compute transform: autoHide takes precedence over manual minimized
  let translateY='translateY(0)';
  if(autoHide) translateY=revealed?'translateY(0)':'translateY(calc(100% - 4px))';
  else if(minimized) translateY='translateY(calc(100% - 6px))';

  // Pill slides up from bottom-center; collapses to a slim handle when minimized/auto-hidden
  let pillTranslateY='translateY(0)';
  if(autoHide) pillTranslateY=revealed?'translateY(0)':'translateY(calc(100% + 12px))';
  else if(minimized) pillTranslateY='translateY(calc(100% + 12px))';

  return(
    <div style={{position:'fixed',bottom:16,left:0,right:0,zIndex:500,display:'flex',justifyContent:'center',pointerEvents:'none'}}>
      {/* Hidden real audio element — lives outside pill so src persists through visibility changes */}
      <audio ref={audioEl} preload="metadata" style={{display:'none'}}/>

      {/* Minimized / auto-hide peek tab — always visible when pill is hidden */}
      {(minimized||(!revealed&&autoHide))&&(
        <div
          onMouseEnter={handleMouseEnter}
          onClick={()=>{if(!autoHide)setMinimized(false);}}
          style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',pointerEvents:'auto',cursor:'pointer',
            background:T.panel,border:`1px solid ${T.border}`,borderBottom:'none',
            borderRadius:T.r?`${T.r+3}px ${T.r+3}px 0 0`:'0',
            padding:'4px 18px 2px',display:'flex',alignItems:'center',gap:8}}>
          {playing&&<div style={{width:5,height:5,borderRadius:'50%',background:T.accent,animation:'tl-spin 1.2s linear infinite'}}/>}
          <div style={{fontSize:8,letterSpacing:'0.15em',textTransform:'uppercase',color:playing?T.accent:T.muted,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {playing?title:'▶ Player'}
          </div>
          {playing&&<div style={{width:5,height:5,borderRadius:'50%',background:T.accent,animation:'tl-spin 1.2s linear infinite'}}/>}
        </div>
      )}

      {/* ── COMPACT PILL ── */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          pointerEvents:'auto',
          width:'min(460px,calc(100vw - 32px))',
          background:T.panel,
          border:`1px solid ${T.border}`,
          borderRadius:T.r?T.r+20:0,
          boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
          transition:'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
          transform:pillTranslateY,
          opacity:(minimized||(autoHide&&!revealed))?0:1,
          overflow:'hidden',
        }}>

        {/* Top row: art + info + play + dismiss */}
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px 6px'}}>
          {/* Thumb */}
          <div style={{width:32,height:32,flexShrink:0,border:`1px solid ${T.border}`,borderRadius:T.r||0,overflow:'hidden',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {thumb?<img src={thumb} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>:<div style={{fontSize:12,opacity:0.2}}>♫</div>}
          </div>
          {/* Title + artist */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,fontWeight:700,color:hasTrack?T.bright:T.sub,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.3}}>{title}</div>
            {artist&&<div style={{fontSize:8,color:T.muted,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{artist}</div>}
          </div>
          {/* Play/Pause */}
          <button onClick={togglePlay} disabled={!hasTrack} style={{flexShrink:0,width:30,height:30,borderRadius:'50%',border:`1px solid ${hasTrack?T.accent:T.border}`,background:hasTrack?T.accent:'transparent',color:hasTrack?T.bg:T.muted,fontSize:11,cursor:hasTrack?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',lineHeight:1}}>
            {playing?'▮▮':'▶'}
          </button>
          {/* Collapse button */}
          <button onClick={()=>!autoHide&&setMinimized(true)} style={{flexShrink:0,background:'none',border:'none',color:T.muted,cursor:'pointer',fontSize:14,padding:'0 2px',lineHeight:1}} title="Minimise player">⌄</button>
        </div>

        {/* Progress row */}
        <div style={{display:'flex',alignItems:'center',gap:7,padding:'0 12px 8px'}}>
          <span style={{fontSize:7,color:T.muted,flexShrink:0,fontVariantNumeric:'tabular-nums',letterSpacing:'0.04em'}}>{fmt(currentTime)}</span>
          {/* Clickable progress bar */}
          <div style={{flex:1,height:20,display:'flex',alignItems:'center',cursor:hasTrack?'pointer':'default'}}
            onClick={e=>{if(!hasTrack||!duration)return;const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/r.width*duration);}}>
            <div style={{width:'100%',height:2,background:T.border,borderRadius:2,overflow:'hidden'}}>
              <div style={{width:`${duration?currentTime/duration*100:0}%`,height:'100%',background:T.accent,transition:'width 0.1s linear'}}/>
            </div>
          </div>
          <span style={{fontSize:7,color:T.muted,flexShrink:0,fontVariantNumeric:'tabular-nums',letterSpacing:'0.04em'}}>{fmt(duration)}</span>
          {/* Volume icon only (no slider — keeps pill tight) */}
          <span style={{fontSize:11,color:T.muted,cursor:'pointer',flexShrink:0,marginLeft:2}} onClick={()=>changeVol(volume>0?0:1)} title={volume===0?'Unmute':'Mute'}>
            {volume===0?'🔇':volume<0.5?'🔉':'🔊'}
          </span>
        </div>
      </div>
    </div>
  );
}

