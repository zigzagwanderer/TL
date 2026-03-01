// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 11: ARCHIVE COMPONENTS                               ║
// ║  EntryCard, SplitSheet                                       ║
// ╚══════════════════════════════════════════════════════════════╝
function EntryCard({T,entry,onOpen,onDelete,isActive,isPlaying,selectable,selected,onToggle,onPlayPause,onTabJump}){
  const st=STATUS_OPT[entry.status||'draft'];
  const handleClick=()=>selectable?onToggle?.(entry.id):onOpen(entry.id);

  const aBtnS={
    background:'none',border:`1px solid ${T.border}`,color:T.muted,
    fontFamily:'inherit',fontSize:8,letterSpacing:'0.1em',textTransform:'uppercase',
    cursor:'pointer',padding:'2px 6px',borderRadius:T.r||0,lineHeight:1.5,flexShrink:0,
  };

  return(
    <div
      onClick={handleClick}
      style={{
        background:isActive?T.panel:T.card,
        border:`1px solid ${selected?T.accent:isActive?T.accent:T.border}`,
        borderRadius:(T.r||0)*1.5,
        padding:'7px 10px',
        marginBottom:4,
        cursor:'pointer',
        display:'flex',
        alignItems:'center',
        gap:8,
      }}
    >
      {/* Checkbox (select mode) */}
      {selectable&&(
        <div style={{flexShrink:0,width:16,height:16,border:`1px solid ${selected?T.accent:T.border}`,borderRadius:2,background:selected?T.accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center',color:selected?T.bg:T.muted,fontSize:10,lineHeight:1}}>
          {selected?'✓':''}
        </div>
      )}

      {/* ── Play button — bare triangle, no background ── */}
      {!selectable&&(
        <button
          onClick={e=>{e.stopPropagation();onPlayPause&&onPlayPause(entry);}}
          title={isPlaying?'Pause':'Play'}
          style={{
            flexShrink:0,width:18,height:18,
            background:'none',border:'none',
            color:isActive?T.accent:T.muted,
            fontSize:isPlaying?9:11,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            lineHeight:1,padding:0,
          }}
        >{isPlaying?'⏸':'▶'}</button>
      )}

      {/* ── Title / date / artist / badges ── */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:1}}>
          <span style={{fontSize:12,fontWeight:700,color:T.bright,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.title||'Untitled'}</span>
          {(entry.created||entry.updated)&&<span style={{fontSize:7,color:T.muted,flexShrink:0,letterSpacing:'0.03em'}}>{fmtDate(entry.created||entry.updated)}</span>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:9,color:T.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:110}}>{entry.artist||<span style={{opacity:0.4}}>No artist</span>}</span>
          {entry.classCode&&<span style={{fontFamily:'monospace',fontSize:9,color:T.accent,letterSpacing:'0.08em'}}>{entry.classCode}</span>}
          <span style={{fontSize:7,color:st.color,border:`1px solid ${st.color}44`,padding:'1px 4px',borderRadius:T.r||0,flexShrink:0}}>{st.label}</span>
          {entry.hasAudio&&<span style={{fontSize:8,color:T.muted}}>🎵</span>}
          {entry.hasArt&&<span style={{fontSize:8,color:T.muted}}>🖼</span>}
          {entry.analyzing&&<span style={{fontSize:7,color:T.accent,letterSpacing:'0.06em'}}><span className="tl-spin" style={{display:'inline-block'}}>⟳</span> reading…</span>}
        </div>
      </div>

      {/* ── Right action buttons ── */}
      {!selectable&&(
        <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onTabJump&&onTabJump(entry,'metadata')}  title="Edit Data"  style={aBtnS}>Data</button>
          <button onClick={()=>onTabJump&&onTabJump(entry,'classify')}  title="Classify"   style={aBtnS}>Class</button>
          <button onClick={()=>onTabJump&&onTabJump(entry,'label')}     title="Edit Label" style={aBtnS}>Label</button>
          <button onClick={e=>{e.stopPropagation();if(window.confirm(`Delete "${entry.title||'this entry'}"?`))onDelete(entry.id);}} title="Delete" style={{...btnMini,color:'#f87171',fontSize:13,marginLeft:2}}>✕</button>
        </div>
      )}
    </div>
  );
}

