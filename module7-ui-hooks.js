// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 7: UI HOOKS                                          ║
// ║  useDragResize                                               ║
// ╚══════════════════════════════════════════════════════════════╝
function useDragResize({key,defaultW,min=80,max=600,side='right',label=''}){
  const [width,setWidth]=useState(()=>loadLS(key,defaultW));
  const [collapsed,setCollapsed]=useState(()=>loadLS(key+'_col',false));
  const dragging=useRef(false);
  const startX=useRef(0);
  const startW=useRef(0);

  const toggle=useCallback(()=>{
    setCollapsed(c=>{
      const next=!c;
      saveLS(key+'_col',next);
      return next;
    });
  },[key]);

  const onMouseDown=useCallback(e=>{
    if(collapsed)return;
    e.preventDefault();
    dragging.current=true;
    startX.current=e.clientX;
    startW.current=width;
    const onMove=ev=>{
      if(!dragging.current)return;
      const delta=side==='right'?ev.clientX-startX.current:startX.current-ev.clientX;
      const newW=Math.max(min,Math.min(max,startW.current+delta));
      setWidth(newW);
    };
    const onUp=()=>{
      dragging.current=false;
      saveLS(key,Math.max(min,Math.min(max,startW.current+(side==='right'
        ?window._tlLastX-startX.current
        :startX.current-window._tlLastX))));
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
      document.body.style.cursor='';
      document.body.style.userSelect='';
    };
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
    window.addEventListener('mousemove',ev=>{window._tlLastX=ev.clientX;onMove(ev);});
    window.addEventListener('mouseup',onUp);
  },[collapsed,width,key,min,max,side]);

  // Drag handle (invisible hit zone on the border)
  const handleEdge=side==='right'?'right':'left';
  const handleStyle={position:'absolute',top:0,width:6,height:'100%',zIndex:50,background:'transparent'};
  handleStyle[handleEdge]=-3;
  const collapsedHandleStyle=Object.assign({},handleStyle,{display:'none'});
  const activeHandleStyle=collapsed?collapsedHandleStyle:Object.assign({},handleStyle,{cursor:'col-resize'});
  const handle={onMouseDown,style:activeHandleStyle};

  // Sleek collapse tab.
  // When EXPANDED: pill sits absolute on the outer border of the panel (inside panel div).
  // When COLLAPSED: panel is width:0 overflow:hidden, so pill must render as a
  //   standalone sibling in the flex row instead — a thin visible strip with the chevron.
  const chevronExp=side==='right'?'‹':'›';
  const chevronCol=side==='right'?'›':'‹';
  const chevron=collapsed?chevronCol:chevronExp;
  const pillEdgeKey=side==='right'?'right':'left';
  const pillStyle={
    position:'absolute',
    top:'50%',
    transform:'translateY(-50%)',
    width:16,
    height:40,
    borderRadius:8,
    background:'var(--app-panel)',
    border:'1px solid var(--app-border)',
    boxShadow:'0 2px 12px rgba(0,0,0,0.5)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    cursor:'pointer',
    zIndex:60,
    userSelect:'none',
    opacity:0.45,
    transition:'opacity 0.18s, box-shadow 0.18s, background 0.18s',
  };
  pillStyle[pillEdgeKey]=-9;

  // The pill rendered inside the panel (only visible when expanded)
  const tab=(
    <div
      onClick={toggle}
      title="Collapse panel"
      style={pillStyle}
      onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.boxShadow='0 2px 18px rgba(0,0,0,0.7)';e.currentTarget.style.background='var(--app-accent)';}}
      onMouseLeave={e=>{e.currentTarget.style.opacity=0.45;e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.5)';e.currentTarget.style.background='var(--app-panel)';}}
    >
      <span style={{fontSize:9,color:'var(--app-text)',lineHeight:1,fontWeight:700,pointerEvents:'none'}}>{chevron}</span>
    </div>
  );

  // Standalone re-expand stub rendered as a flex sibling when collapsed
  const stubBorderL=side==='left'?'1px solid var(--app-border)':'none';
  const stubBorderR=side==='right'?'1px solid var(--app-border)':'none';
  const expandStub=collapsed?(
    <div
      onClick={toggle}
      title="Expand panel"
      style={{width:14,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
        cursor:'pointer',background:'var(--app-panel)',borderLeft:stubBorderL,borderRight:stubBorderR,
        userSelect:'none',opacity:0.5,transition:'opacity 0.18s, background 0.18s'}}
      onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.background='var(--app-accent)';}}
      onMouseLeave={e=>{e.currentTarget.style.opacity=0.5;e.currentTarget.style.background='var(--app-panel)';}}
    >
      <span style={{fontSize:9,color:'var(--app-text)',lineHeight:1,fontWeight:700,pointerEvents:'none'}}>{chevron}</span>
    </div>
  ):null;

  const currentWidth=collapsed?0:width;

  return{width:currentWidth,collapsed,toggle,handle,tab,expandStub};
}

// ━━━━━━━━ SPLIT SHEET COMPONENT ━━━━━━━━
function SplitSheet({T,credits,onChange,trackTitle}){
  const total=credits.reduce((s,c)=>s+(parseFloat(c.split)||0),0);
  const totalOk=credits.length===0||Math.abs(total-100)<0.01;
  const colGrid={display:'grid',gridTemplateColumns:'140px 1fr 70px 90px 100px 24px',gap:4,alignItems:'center'};
  const colH={fontSize:8,letterSpacing:'0.15em',textTransform:'uppercase',color:T.muted};
  const inp=(ex)=>({...mkIS(T),padding:'4px 6px',fontSize:10,...ex});

  const addRow=()=>onChange([...credits,{id:mkUid(),role:'Songwriter',name:'',split:'',pro:'—',ipi:''}]);
  const delRow=id=>onChange(credits.filter(c=>c.id!==id));
  const updRow=(id,k,v)=>onChange(credits.map(c=>c.id===id?{...c,[k]:v}:c));

  const copyEmail=()=>{
    if(!credits.length)return;
    const pad=(s,n)=>String(s||'').padEnd(n);
    const div='─'.repeat(62);
    const lines=[
      `SPLIT SHEET${trackTitle?' — '+trackTitle:''}`,
      `Generated by Track Lab · ${new Date().toLocaleDateString()}`,
      div,
      pad('NAME',22)+pad('ROLE',22)+pad('SPLIT',8)+'PRO / IPI',
      div,
      ...credits.map(c=>{
        const proStr=[c.pro&&c.pro!=='—'?c.pro:'',c.ipi?'IPI:'+c.ipi:''].filter(Boolean).join(' · ');
        return pad(c.name||'—',22)+pad(c.role,22)+pad((parseFloat(c.split)||0)+'%',8)+proStr;
      }),
      div,
      'TOTAL: '+(Number.isInteger(total)?total:total.toFixed(2))+'%'+(totalOk?'  ✓ Balanced':credits.length?'  ⚠ Does not total 100%':''),
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(()=>alert('Split sheet copied to clipboard.')).catch(()=>alert('Copy failed — check browser permissions.'));
  };

  return(
    <div style={{maxWidth:740}}>
      <div style={{fontSize:14,fontWeight:700,color:T.bright,marginBottom:4,letterSpacing:'0.04em'}}>Split Sheet</div>
      <div style={{fontSize:10,color:T.muted,lineHeight:1.7,marginBottom:16,maxWidth:580}}>
        Log all contributors and their royalty splits for this track. Splits must total <strong style={{color:T.text}}>100%</strong> before export or filing.
        <br/><strong style={{color:T.text}}>PRO</strong> — performing rights organization. <strong style={{color:T.text}}>IPI/CAE</strong> — your 9-digit PRO member number.
      </div>

      {credits.length===0?(
        <div style={{padding:'28px 20px',textAlign:'center',background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0,marginBottom:14}}>
          <div style={{fontSize:10,color:'#f87171',marginBottom:8,letterSpacing:'0.06em'}}>⚠ NO CREDITS LOGGED</div>
          <div style={{fontSize:9,color:T.muted,lineHeight:1.65,marginBottom:14,maxWidth:360,margin:'0 auto 14px'}}>
            Royalty disputes are the #1 legal issue in indie music. Logging credits here creates a timestamped record inside your archive backup.
          </div>
          <button onClick={addRow} style={{...mkBtn(T,true),padding:'8px 20px',fontSize:9}}>+ Add First Contributor</button>
        </div>
      ):(
        <>
          <div style={{...colGrid,marginBottom:5,paddingBottom:7,borderBottom:`1px solid ${T.border}`}}>
            <span style={colH}>Role</span>
            <span style={colH}>Full Name</span>
            <span style={{...colH,textAlign:'right'}}>Split %</span>
            <span style={colH}>PRO</span>
            <span style={colH}>IPI / CAE</span>
            <span/>
          </div>
          {credits.map(c=>(
            <div key={c.id} style={{...colGrid,marginBottom:4}}>
              <select value={c.role} onChange={e=>updRow(c.id,'role',e.target.value)} style={inp()}>
                {CREDIT_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
              <input value={c.name} onChange={e=>updRow(c.id,'name',e.target.value)} placeholder="Full legal name" style={inp()}/>
              <input type="number" min={0} max={100} step={0.5} value={c.split} onChange={e=>updRow(c.id,'split',e.target.value)} placeholder="0" style={inp({textAlign:'right',borderColor:(parseFloat(c.split)>100||parseFloat(c.split)<0)?'#f85149':T.border})}/>
              <select value={c.pro} onChange={e=>updRow(c.id,'pro',e.target.value)} style={inp()}>
                {PRO_LIST.map(pr=><option key={pr} value={pr}>{pr}</option>)}
              </select>
              <input value={c.ipi} onChange={e=>updRow(c.id,'ipi',e.target.value.replace(/\D/g,'').slice(0,9))} placeholder="000000000" style={inp({letterSpacing:'0.1em'})}/>
              <button onClick={()=>delRow(c.id)} style={{background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:12,padding:0,lineHeight:1,textAlign:'center'}}>✕</button>
            </div>
          ))}
          {/* Total bar */}
          <div style={{marginTop:12,padding:'10px 12px',background:T.card,border:`1px solid ${totalOk?T.border:'#f85149'}`,borderRadius:T.r||0,display:'flex',alignItems:'center',gap:10}}>
            <div style={{flex:1,height:4,background:T.bg,borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${Math.min(total,100)}%`,background:totalOk?'#3fb950':total>100?'#f85149':'#d29922',borderRadius:2,transition:'width 0.2s'}}/>
            </div>
            <span style={{fontSize:10,fontWeight:700,color:totalOk?'#3fb950':total>100?'#f85149':'#d29922',minWidth:60,textAlign:'right'}}>
              {Number.isInteger(total)?total:total.toFixed(1)}% {totalOk?'✓':total>100?`(+${(total-100).toFixed(1)}% over)`:`(${(100-total).toFixed(1)}% left)`}
            </span>
          </div>
          <div style={{display:'flex',gap:6,marginTop:10}}>
            <button onClick={addRow} style={{...mkBtn(T,true),padding:'7px 14px',fontSize:9}}>+ Add Contributor</button>
            <button onClick={copyEmail} style={{...mkBtn(T),padding:'7px 14px',fontSize:9}}>📋 Copy as Text</button>
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateSpectralProfile — EQ Band Energy Analyzer v2
// Pure top-level async helper. No state, no hooks, no side-effects.
// Returns { bands: Array<{id,label,lo,hi,rawDb,normalized}> } or null.
//
// CRASH-PROOF DESIGN (v2):
//   - Reduced to 6 windows (from 12) — 50% fewer OfflineAudioContext instances
//   - getFloatFrequencyData instead of byte data — direct dBFS, no conversion
//   - Per-window try/catch — one bad context cannot kill the whole analysis
//   - Renders FFT_SIZE samples per window (not FFT_SIZE*2) — half the memory
//   - Float32Array mono downmix reused across all windows — single allocation
//   - Returns actual dBFS rawDb values so SpectralGraph can draw a real dB axis
//
// BAND DEFINITIONS (8 perceptual bands):
//   Sub 20-60 | Bass 60-200 | Low-Mid 200-500 | Mid 500-2k
//   Upper-Mid 2k-5k | Presence 5k-8k | Brilliance 8k-12k | Air 12k-20k
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateSpectralProfile(audioBuffer) {
  try {
    var sr          = audioBuffer.sampleRate;
    var numCh       = audioBuffer.numberOfChannels;
    var totalLen    = audioBuffer.length;
    var FFT_SIZE    = 8192;
    var NUM_WINDOWS = 6;          // reduced from 12 — fewer OAC instances
    var nyquist     = sr / 2;
    var binHz       = sr / FFT_SIZE;
    var halfFFT     = FFT_SIZE / 2;

    var BANDS = [
      { id:'sub',        label:'Sub',        lo:    20, hi:    60 },
      { id:'bass',       label:'Bass',       lo:    60, hi:   200 },
      { id:'lowmid',     label:'Low-Mid',    lo:   200, hi:   500 },
      { id:'mid',        label:'Mid',        lo:   500, hi:  2000 },
      { id:'uppermid',   label:'Upper-Mid',  lo:  2000, hi:  5000 },
      { id:'presence',   label:'Presence',   lo:  5000, hi:  8000 },
      { id:'brilliance', label:'Brilliance', lo:  8000, hi: 12000 },
      { id:'air',        label:'Air',        lo: 12000, hi: 20000 },
    ];

    // Clamp band hi to Nyquist
    for (var bi = 0; bi < BANDS.length; bi++) {
      BANDS[bi].hi = Math.min(BANDS[bi].hi, nyquist - binHz);
    }

    var freqToBin = function(hz) {
      return Math.max(0, Math.min(Math.round(hz / binHz), halfFFT - 1));
    };

    // ── Build mono Float32Array — single allocation reused across all windows
    var monoData = new Float32Array(totalLen);
    var chScale  = 1 / numCh;
    for (var ch = 0; ch < numCh; ch++) {
      var chData = audioBuffer.getChannelData(ch);
      for (var si = 0; si < totalLen; si++) {
        monoData[si] += chData[si] * chScale;
      }
    }

    // ── Multi-window FFT sweep with per-window error isolation ──────────────
    var skipSamples = Math.floor(totalLen * 0.05);
    var usableLen   = totalLen - 2 * skipSamples;
    var windowStep  = Math.floor(usableLen / (NUM_WINDOWS + 1));
    var binAccum    = new Float64Array(halfFFT);  // accumulate dBFS across windows
    var windowsRun  = 0;
    var floatBuf    = new Float32Array(halfFFT);  // reusable output array

    // ── Hann window coefficients — pre-computed once, reused across all windows
    //
    // WHY Hann windowing matters for high-frequency accuracy:
    //   A rectangular (no-window) FFT leaks energy from strong low-frequency bins
    //   into adjacent bins across the entire spectrum. At 8kHz-20kHz the leaked
    //   energy can swamp the genuine signal, making Air/Brilliance bands look
    //   artificially flat or noisy across analysis windows. The Hann window
    //   attenuates this leakage by ~31 dB, giving clean, stable readings in
    //   sparse high-frequency bands. This is why all professional analysers
    //   (iZotope RX, TDR Nova, Voxengo SPAN) apply windowing by default.
    var hannCoeffs = new Float32Array(FFT_SIZE);
    for (var hc = 0; hc < FFT_SIZE; hc++) {
      hannCoeffs[hc] = 0.5 * (1 - Math.cos((2 * Math.PI * hc) / (FFT_SIZE - 1)));
    }

    for (var wi = 0; wi < NUM_WINDOWS; wi++) {
      try {
        var offsetSamples = skipSamples + (wi + 1) * windowStep;

        // Render FFT_SIZE * 2 samples instead of exactly FFT_SIZE.
        //
        // WHY: An OfflineAudioContext of exactly FFT_SIZE samples may not give
        // the AnalyserNode enough audio throughput to fully populate its internal
        // FFT frame before rendering stops. The extra FFT_SIZE samples act as a
        // warm-up buffer so the snapshot taken after rendering reflects a
        // fully-settled FFT state. This is especially important for high-frequency
        // bins which need multiple cycles of content to accumulate energy correctly.
        var RENDER_LEN = FFT_SIZE * 2;
        var available  = totalLen - offsetSamples;
        if (available < RENDER_LEN) break; // not enough audio left for a clean window

        // One small OfflineAudioContext per window — discarded immediately after
        var offCtx  = new OfflineAudioContext(1, RENDER_LEN, sr);
        var winBuf  = offCtx.createBuffer(1, RENDER_LEN, sr);
        var winData = winBuf.getChannelData(0);

        // Write Hann-windowed samples into the first FFT_SIZE slot.
        // The second FFT_SIZE slot is filled with unwindowed audio so the
        // analyser node keeps receiving signal after the windowed frame plays
        // through — preventing a sudden silence from corrupting the FFT snapshot.
        for (var s = 0; s < FFT_SIZE; s++) {
          winData[s] = (monoData[offsetSamples + s] || 0) * hannCoeffs[s];
        }
        for (var s2 = FFT_SIZE; s2 < RENDER_LEN; s2++) {
          winData[s2] = monoData[offsetSamples + s2] || 0;
        }

        var bufSrc   = offCtx.createBufferSource();
        bufSrc.buffer = winBuf;
        var analyser = offCtx.createAnalyser();
        analyser.fftSize               = FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
        bufSrc.connect(analyser);
        analyser.connect(offCtx.destination);
        bufSrc.start(0);
        await offCtx.startRendering();

        // getFloatFrequencyData -> direct dBFS values (-Infinity to 0)
        // Clamp -120 floor to keep NaN / -Infinity out of accumulator
        analyser.getFloatFrequencyData(floatBuf);
        for (var b = 0; b < halfFFT; b++) {
          var v = floatBuf[b];
          binAccum[b] += (isFinite(v) ? v : -120);
        }
        windowsRun++;

        // Null refs so GC can reclaim the OfflineAudioContext immediately
        offCtx  = null;
        winBuf  = null;
        bufSrc  = null;
        analyser = null;

      } catch (winErr) {
        // One bad window is not fatal — skip it and continue
        console.warn('[spectralProfile] window ' + wi + ' failed:', winErr);
      }
    }

    if (windowsRun === 0) return null;

    // Average dBFS across successful windows
    var avgBins = new Float64Array(halfFFT);
    for (var b2 = 0; b2 < halfFFT; b2++) {
      avgBins[b2] = binAccum[b2] / windowsRun;
    }

    // ── Per-band mean dBFS ──────────────────────────────────────────────────
    var FLOOR_DB  = -90;   // treat anything quieter as silence
    var rawValues = new Float64Array(BANDS.length);
    for (var bnd = 0; bnd < BANDS.length; bnd++) {
      var loB = freqToBin(BANDS[bnd].lo);
      var hiB = freqToBin(BANDS[bnd].hi);
      if (hiB <= loB) { rawValues[bnd] = FLOOR_DB; continue; }
      var sum = 0;
      var cnt = hiB - loB + 1;
      for (var bb = loB; bb <= hiB; bb++) { sum += avgBins[bb]; }
      rawValues[bnd] = Math.max(FLOOR_DB, sum / cnt);
    }

    // ── Normalize onto ±18 dB display scale, anchored to loudest band ─────────
    //
    // WHY: getFloatFrequencyData returns absolute FFT bin energy, which for a
    // typical mastered track averages −20 to −50 dBFS per band. A raw ±18 window
    // centred on 0 dBFS would pin everything to the bottom. That's not how
    // professional analysers (TDR Nova, FabFilter Pro-Q) work.
    //
    // HOW (matching TDR Nova convention):
    //   1. Find the loudest band (rawDb peak).
    //   2. Anchor that peak to +3 dB on the display (normalized ≈ 58.3).
    //      This mirrors TDR Nova where the loudest spectral region sits just
    //      above the 0 line, leaving room to see the shape fall away below.
    //   3. Each other band is offset from the peak by its actual dB difference.
    //      A band 6 dB quieter than the peak sits at +3−6 = −3 dB on display.
    //   4. Clamp to the ±18 window edges (0–100 normalized).
    //
    // RESULT: 0 dB centre line is a perceptual reference, not an absolute dBFS
    // floor. The shape is directly comparable to what TDR Nova shows.
    // rawDb is still stored as real analyser dBFS for tooltip/readout use.

    var DISPLAY_PEAK_DB = 3;   // where the loudest band anchors on the ±18 scale
    var EQ_MIN  = -18;
    var EQ_MAX  = +18;
    var EQ_SPAN = EQ_MAX - EQ_MIN;  // 36 dB

    // Find loudest band
    var peakRawDb = FLOOR_DB;
    for (var pk = 0; pk < BANDS.length; pk++) {
      if (rawValues[pk] > peakRawDb) peakRawDb = rawValues[pk];
    }

    // Offset: shift raw values so peak lands at DISPLAY_PEAK_DB on the display
    var dbOffset = DISPLAY_PEAK_DB - peakRawDb;

    var normalized = new Float64Array(BANDS.length);
    for (var nj = 0; nj < BANDS.length; nj++) {
      var displayDb = rawValues[nj] + dbOffset;   // dB position on ±18 scale
      normalized[nj] = Math.max(0, Math.min(100,
        ((displayDb - EQ_MIN) / EQ_SPAN) * 100
      ));
    }

    // ── Build result ────────────────────────────────────────────────────────
    var resultBands = [];
    for (var ri = 0; ri < BANDS.length; ri++) {
      resultBands.push({
        id:         BANDS[ri].id,
        label:      BANDS[ri].label,
        lo:         BANDS[ri].lo,
        hi:         BANDS[ri].hi,
        rawDb:      Math.round(rawValues[ri] * 10) / 10,  // real dBFS
        normalized: normalized[ri],                         // 0-100 for curve Y
      });
    }

    return { bands: resultBands };

  } catch(e) {
    console.warn('[generateSpectralProfile] failed:', e);
    return null;
  }
}


// ╔══════════════════════════════════════════════════════════════╗
