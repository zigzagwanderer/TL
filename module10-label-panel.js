// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 10: LABEL PANEL COMPONENTS                           ║
// ║  MetaFieldsPanel, TextBlocksPanel, DitherPanel               ║
// ║  PresetPanel, ThemePopover, AlbumArtEditor                   ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ PANEL COMPONENTS (outside App) ━━━━━━━━
function MetaFieldsPanel({T,settings,setS}){
  const mfs=settings.metaFields||[];
  const upd=(idx,k,v)=>setS(s=>({...s,metaFields:mfs.map((f,i)=>i===idx?{...f,[k]:v}:f)}));
  const add=()=>setS(s=>({...s,metaFields:[...mfs,{id:mkUid(),label:'FIELD',value:'',show:true}]}));
  const del=idx=>setS(s=>({...s,metaFields:mfs.filter((_,i)=>i!==idx)}));
  const mv=(idx,dir)=>{const a=[...mfs];const to=idx+dir;if(to<0||to>=a.length)return;[a[idx],a[to]]=[a[to],a[idx]];setS(s=>({...s,metaFields:a}));};
  return(
    <div>
      <Tog T={T} label="Show meta row" value={settings.showMeta} onChange={v=>setS(s=>({...s,showMeta:v}))}/>
      {mfs.map((f,i)=>(
        <div key={f.id||i} style={{display:'flex',alignItems:'center',gap:4,marginBottom:5,padding:'4px 6px',background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
          <Tog T={T} label="" value={f.show} onChange={v=>upd(i,'show',v)}/>
          <TInp T={T} value={f.label} onChange={e=>upd(i,'label',e.target.value)} style={{width:52,fontSize:10,padding:'3px 5px',flex:'0 0 52px'}}/>
          <TInp T={T} value={f.value} onChange={e=>upd(i,'value',e.target.value)} style={{flex:1,fontSize:10,padding:'3px 5px'}}/>
          <button onClick={()=>mv(i,-1)} style={btnMini}>↑</button><button onClick={()=>mv(i,1)} style={btnMini}>↓</button>
          <button onClick={()=>del(i)} style={{...btnMini,color:'#f87171'}}>✕</button>
        </div>
      ))}
      <button onClick={add} style={{...mkBtn(T),width:'100%',marginTop:4,fontSize:9}}>+ Add Field</button>
    </div>
  );
}

function TextBlocksPanel({T,settings,setS}){
  const blocks=settings.textBlocks||[];
  const add=()=>setS(s=>({...s,textBlocks:[...blocks,{id:mkUid(),text:'TYPE HERE',x:12,y:200,size:14,bold:false,italic:false,align:'left',color:'#000000',opacity:1,font:settings.font,wrap:false,caps:false,w:200}]}));
  const upd=(id,k,v)=>setS(s=>({...s,textBlocks:blocks.map(b=>b.id===id?{...b,[k]:v}:b)}));
  const del=id=>setS(s=>({...s,textBlocks:blocks.filter(b=>b.id!==id)}));
  return(
    <div>
      <button onClick={add} style={{...mkBtn(T),width:'100%',marginBottom:8,fontSize:9}}>+ Add Text Block</button>
      {blocks.map((b,i)=>(
        <div key={b.id} style={{border:`1px solid ${T.border}`,marginBottom:8,padding:8,borderRadius:T.r||0}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:9,color:T.muted}}>BLOCK {i+1}</span>
            <button onClick={()=>del(b.id)} style={{...btnMini,color:'#f87171'}}>✕</button>
          </div>
          <F T={T} label="Text"><TTxt T={T} value={b.text} onChange={e=>upd(b.id,'text',e.target.value)} style={{minHeight:40}}/></F>
          <Row2><F T={T} label="X px"><TInp T={T} type="number" value={b.x} onChange={e=>upd(b.id,'x',+e.target.value)}/></F><F T={T} label="Y px"><TInp T={T} type="number" value={b.y} onChange={e=>upd(b.id,'y',+e.target.value)}/></F></Row2>
          <Row2><F T={T} label="Font Size"><TInp T={T} type="number" min={8} max={72} value={b.size} onChange={e=>upd(b.id,'size',+e.target.value)}/></F><F T={T} label="Width"><TInp T={T} type="number" min={20} value={b.w||200} onChange={e=>upd(b.id,'w',+e.target.value)}/></F></Row2>
          <F T={T} label="Font"><TSel T={T} value={b.font||settings.font} onChange={e=>upd(b.id,'font',e.target.value)}>{Object.entries(FONTS).map(([k,f])=><option key={k} value={k}>{f.name}</option>)}</TSel></F>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:4}}>
            <div style={{display:'flex',alignItems:'center',gap:4}}><label style={{...mkLBL(T),marginBottom:0}}>Color</label><input type="color" value={b.color||'#000000'} onChange={e=>upd(b.id,'color',e.target.value)} style={{width:24,height:18,border:`1px solid ${T.border}`,padding:0,cursor:'pointer',borderRadius:2}}/></div>
            <F T={T} label="Align"><TSel T={T} value={b.align||'left'} onChange={e=>upd(b.id,'align',e.target.value)} style={{padding:'3px 5px'}}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></TSel></F>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Tog T={T} label="Bold" value={b.bold} onChange={v=>upd(b.id,'bold',v)}/><Tog T={T} label="Italic" value={b.italic} onChange={v=>upd(b.id,'italic',v)}/><Tog T={T} label="Caps" value={b.caps} onChange={v=>upd(b.id,'caps',v)}/><Tog T={T} label="Wrap" value={b.wrap} onChange={v=>upd(b.id,'wrap',v)}/></div>
        </div>
      ))}
    </div>
  );
}

function DitherPanel({T,settings,setS}){
  const fileRef=useRef();
  const redither=useCallback(()=>{
    if(!settings.imageOriginalData)return;
    const img=new Image();img.onload=()=>{const d=atkinsonDither(img,settings.imageW,settings.imageH,settings.ditherThreshold,settings.ditherContrast);setS(s=>({...s,imageData:d}));};img.src=settings.imageOriginalData;
  },[settings.imageOriginalData,settings.imageW,settings.imageH,settings.ditherThreshold,settings.ditherContrast]);
  const load=file=>{
    if(!file||!file.type.startsWith('image/'))return;
    const r=new FileReader();r.onload=e=>{setS(s=>({...s,imageOriginalData:e.target.result,showImage:true}));const img=new Image();img.onload=()=>{const w=settings.imageW,h=Math.round(w/(img.width/img.height));setS(s=>({...s,imageH:h}));setS(s=>({...s,imageData:atkinsonDither(img,w,h,settings.ditherThreshold,settings.ditherContrast)}));};img.src=e.target.result;};r.readAsDataURL(file);
  };
  return(
    <div>
      <Tog T={T} label="Show image on label" value={settings.showImage} onChange={v=>setS(s=>({...s,showImage:v}))}/>
      <Tog T={T} label="Blend highlights to background" value={settings.ditherBlend} onChange={v=>setS(s=>({...s,ditherBlend:v}))}/>
      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>load(e.target.files[0])}/>
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <button onClick={()=>fileRef.current.click()} style={{...mkBtn(T),flex:1,fontSize:9}}>{settings.imageOriginalData?'↺ Replace':'+ Import Image'}</button>
        {settings.imageOriginalData&&<button onClick={redither} style={{...mkBtn(T),fontSize:9}}>Re-dither</button>}
      </div>
      {settings.imageOriginalData&&(
        <><F T={T} label={`Threshold: ${settings.ditherThreshold}`}><input type="range" min={50} max={220} value={settings.ditherThreshold} onChange={e=>setS(s=>({...s,ditherThreshold:+e.target.value}))} onMouseUp={redither} style={{width:'100%'}}/></F>
        <F T={T} label={`Contrast: ${settings.ditherContrast}`}><input type="range" min={-50} max={150} value={settings.ditherContrast} onChange={e=>setS(s=>({...s,ditherContrast:+e.target.value}))} onMouseUp={redither} style={{width:'100%'}}/></F>
        <Row2><F T={T} label="W px"><TInp T={T} type="number" min={40} value={settings.imageW} onChange={e=>setS(s=>({...s,imageW:+e.target.value}))}/></F><F T={T} label="H px"><TInp T={T} type="number" min={40} value={settings.imageH} onChange={e=>setS(s=>({...s,imageH:+e.target.value}))}/></F></Row2>
        <div style={{fontSize:8,color:T.muted,lineHeight:1.55,marginTop:2,padding:'5px 7px',background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
          <span style={{color:T.accent,marginRight:4}}>↖</span>Drag image on preview to position · drag <span style={{color:T.accent}}>■</span> corner to resize
        </div></>
      )}
    </div>
  );
}

function PresetPanel({T,settings,presets,lastId,onLoad,onSave,onDelete}){
  const [name,setName]=useState('');
  return(
    <div>
      <div style={{display:'flex',gap:6,marginBottom:10}}>
        <TInp T={T} placeholder="Preset name…" value={name} onChange={e=>setName(e.target.value)} style={{flex:1}}/>
        <button onClick={()=>{if(name.trim()){onSave(name.trim());setName('');}}} style={mkBtn(T,true)}>Save</button>
      </div>
      {presets.length===0&&<div style={{fontSize:10,color:T.muted,textAlign:'center',padding:'12px 0'}}>No presets yet</div>}
      {presets.map(p=>(
        <div key={p.id} style={{display:'flex',alignItems:'center',gap:5,marginBottom:5,padding:'6px 8px',background:T.bg,border:`1px solid ${p.id===lastId?T.accent:T.border}`,borderRadius:T.r||0}}>
          <span style={{flex:1,fontSize:10,color:p.id===lastId?T.accent:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span>
          <button onClick={()=>onLoad(p)} style={{...btnMini,color:T.text,fontSize:10}}>LOAD</button>
          <button onClick={()=>onDelete(p.id)} style={{...btnMini,color:'#f87171'}}>✕</button>
        </div>
      ))}
    </div>
  );
}

function ThemePopover({appTheme,setAppTheme,T,onClose,fsProps}){
  const at=appTheme,setA=(k,v)=>setAppTheme(a=>({...a,[k]:v}));
  const [savedThemes,setST]=useState(()=>loadLS('tl_saved_themes',[]));
  const [saveName,setSaveName]=useState('');
  const [resetHover,setResetHover]=useState(false);
  const saveST=n=>{if(!n.trim())return;const t={id:mkUid(),name:n.trim(),theme:{...at}};const ns=[...savedThemes,t];setST(ns);saveLS('tl_saved_themes',ns);setSaveName('');};
  const delST=id=>{const ns=savedThemes.filter(t=>t.id!==id);setST(ns);saveLS('tl_saved_themes',ns);};
  const doReset=()=>{
    if(window.confirm('Reset all appearance settings to defaults? Your saved themes will not be affected.')){
      setAppTheme(()=>({...DEFAULT_APP_THEME,themeKey:at.themeKey}));
    }
  };
  return(
    <div style={{position:'fixed',top:44,right:0,width:Math.max(300,Math.round((at.uiFontSize||100)*3)),maxHeight:'calc(100vh - 44px)',overflowY:'auto',background:T.panel,border:`1px solid ${T.border}`,borderRadius:`0 0 0 ${(T.r||0)*1.5}px`,zIndex:1000,padding:16,boxShadow:'0 8px 32px rgba(0,0,0,0.6)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <span style={{fontSize:9,letterSpacing:'0.2em',textTransform:'uppercase',color:T.muted}}>App Appearance</span>
        <button onClick={onClose} style={{background:'none',border:'none',color:T.muted,fontSize:14,cursor:'pointer'}}>✕</button>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <label style={{...mkLBL(T),marginBottom:0}}>Theme Preset</label>
          <button
            onClick={doReset}
            onMouseEnter={()=>setResetHover(true)}
            onMouseLeave={()=>setResetHover(false)}
            style={{fontSize:8,cursor:'pointer',letterSpacing:'0.1em',textTransform:'uppercase',
              padding:'2px 7px',borderRadius:T.r||0,border:'1px solid #f87171',
              background:resetHover?'#f87171':'transparent',
              color:resetHover?'#ffffff':'#f87171',
              transition:'background 0.12s, color 0.12s'}}>
            Reset
          </button>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
          {Object.entries(APP_THEMES).map(([k,th])=>(
            <button key={k} onClick={()=>setA('themeKey',k)} style={{...mkBtn(T,at.themeKey===k),padding:'4px 9px',fontSize:9}}>{th.name}</button>
          ))}
          <button
            onClick={()=>{
              if(at.themeKey==='custom')return;
              // Seed all custom fields from the current live theme so it's readable immediately
              setAppTheme(a=>({...a,
                themeKey:'custom',
                customBg:T.bg,
                customPanel:T.panel,
                customBorder:T.border,
                customText:T.text,
                customBright:T.bright,
                customAccent:T.accent,
              }));
            }}
            style={{...mkBtn(T,at.themeKey==='custom'),padding:'4px 9px',fontSize:9}}
          >Custom</button>
        </div>
      </div>
      <div style={{marginBottom:12}}>
        <label style={mkLBL(T)}>Brightness — {at.brightness||100}%</label>
        <input type="range" min={40} max={150} value={at.brightness||100} onChange={e=>setA('brightness',+e.target.value)} style={{width:'100%'}}/>
      </div>
      <div style={{marginBottom:12}}>
        <label style={mkLBL(T)}>Corner Radius — {at.borderRadius||0}px</label>
        <input type="range" min={0} max={16} value={at.borderRadius||0} onChange={e=>setA('borderRadius',+e.target.value)} style={{width:'100%'}}/>
        <div style={{display:'flex',gap:4,marginTop:6}}>
          {[['Sharp',0],['Slight',3],['Soft',6],['Round',10],['Pill',16]].map(([lbl,val])=>(
            <button key={lbl} onClick={()=>setA('borderRadius',val)} style={{...mkBtn(T,(at.borderRadius||0)===val),padding:'3px 5px',fontSize:8,flex:1}}>{lbl}</button>
          ))}
        </div>
      </div>
      {at.themeKey==='custom'&&(
        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
          <label style={mkLBL(T)}>Custom Colors</label>
          {[['customBg','Background',T.bg],['customPanel','Panel',T.panel],['customBorder','Borders',T.border],['customText','Body Text',T.text],['customSub','UI Text',T.sub],['customBright','Heading Text',T.bright],['customAccent','Accent',T.accent]].map(([k,lbl,fallback])=>(
            <div key={k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <input type="color" value={at[k]||fallback} onChange={e=>setA(k,e.target.value)} style={{width:24,height:18,border:`1px solid ${T.border}`,padding:0,cursor:'pointer',borderRadius:2}}/>
              <span style={{fontSize:9,color:T.text,flex:1}}>{lbl}</span>
              <span style={{fontSize:9,color:T.muted,fontFamily:'monospace'}}>{at[k]||fallback}</span>
            </div>
          ))}
        </div>
      )}
      {at.themeKey!=='custom'&&(
        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <label style={{...mkLBL(T),marginBottom:0}}>Color Overrides</label>
            <button
              onClick={()=>{
                if(!at.colorOverrides){
                  // Seed pickers from the CURRENT live theme so user starts from real values
                  setAppTheme(a=>({...a,
                    colorOverrides:true,
                    customBg:T.bg,
                    customAccent:T.accent,
                    customText:T.text,
                    customSub:T.sub,
                    customBright:T.bright,
                  }));
                }else{
                  setA('colorOverrides',false);
                }
              }}
              style={{...mkBtn(T,!!at.colorOverrides),padding:'3px 10px',fontSize:9}}
            >{at.colorOverrides?'On':'Off'}</button>
          </div>
          {at.colorOverrides?(
            <>
              <div style={{fontSize:8,color:T.muted,marginBottom:8,lineHeight:1.6}}>Overriding preset colors. Changes apply instantly.</div>
              {[['customBg','Background',T.bg],['customAccent','Accent',T.accent],['customText','Body Text',T.text],['customSub','UI Text (labels, titles, lists)',T.sub],['customBright','Heading Text',T.bright]].map(([k,lbl,fallback])=>(
                <div key={k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <input type="color" value={at[k]||fallback} onChange={e=>setA(k,e.target.value)} style={{width:24,height:18,border:`1px solid ${T.border}`,padding:0,cursor:'pointer',borderRadius:2}}/>
                  <span style={{fontSize:9,color:T.text,flex:1}}>{lbl}</span>
                  <span style={{fontSize:9,color:T.muted,fontFamily:'monospace'}}>{at[k]||fallback}</span>
                </div>
              ))}
            </>
          ):(
            <div style={{fontSize:8,color:T.muted,lineHeight:1.6}}>Enable to override background, accent, body text, and UI text colors on top of any preset.</div>
          )}
        </div>
      )}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
        <label style={mkLBL(T)}>Player</label>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <span style={{fontSize:9,color:T.text}}>Auto-hide player</span>
          <button onClick={()=>setA('playerAutoHide',!at.playerAutoHide)} style={{...mkBtn(T,!!at.playerAutoHide),padding:'3px 10px',fontSize:9}}>{at.playerAutoHide?'On':'Off'}</button>
        </div>
        {at.playerAutoHide&&<div style={{fontSize:8,color:T.muted,marginBottom:8,lineHeight:1.6}}>Player slides off-screen. Hover the bottom edge to reveal it. Accent dots on the pull tab indicate playback.</div>}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <span style={{fontSize:9,color:T.text}}>Auto-save entry</span>
          <button onClick={()=>setA('playerAutoSave',!at.playerAutoSave)} style={{...mkBtn(T,!!at.playerAutoSave),padding:'3px 10px',fontSize:9}}>{at.playerAutoSave?'On':'Off'}</button>
        </div>
        {at.playerAutoSave&&(
          <div>
            <label style={mkLBL(T)}>Save interval</label>
            <div style={{display:'flex',gap:4}}>
              {[[30,'30s'],[60,'1m'],[120,'2m'],[300,'5m']].map(([s,lbl])=>(
                <button key={s} onClick={()=>setA('playerAutoSaveInterval',s)} style={{...mkBtn(T,(at.playerAutoSaveInterval||60)===s),padding:'3px 0',fontSize:9,flex:1}}>{lbl}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* ── SAVE LOCATION ── */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
        <label style={mkLBL(T)}>Save Location</label>
        {!fsProps.supported?(
          <div style={{fontSize:8,color:T.muted,lineHeight:1.7,padding:'4px 0'}}>
            Auto-save to disk requires Chrome or Edge. Your browser doesn't support this. Use Archive → Export ZIP to save manually.
          </div>
        ):fsProps.folderName?(
          <>
            <div style={{display:'flex',alignItems:'center',gap:7,padding:'6px 9px',background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0,marginBottom:6}}>
              <span style={{fontSize:12}}>📁</span>
              <span style={{fontSize:9,color:T.bright,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fsProps.folderName}</span>
              {fsProps.diskSaving&&<span className="tl-spin" style={{fontSize:9,color:T.muted}}>↻</span>}
              {!fsProps.diskSaving&&fsProps.diskLastSaved&&<span style={{fontSize:8,color:'#3fb950'}}>✓</span>}
            </div>
            {fsProps.diskLastSaved&&<div style={{fontSize:7,color:T.muted,marginBottom:4}}>Last saved: {fsProps.diskLastSaved.toLocaleTimeString()}</div>}
            {fsProps.diskSaveError&&<div style={{fontSize:7,color:'#f87171',marginBottom:6,lineHeight:1.5}}>{fsProps.diskSaveError}</div>}
            <div style={{display:'flex',gap:5,marginBottom:8}}>
              <button onClick={fsProps.saveNow} disabled={fsProps.diskSaving} style={{...mkBtn(T,true),flex:1,padding:'5px 0',fontSize:9,opacity:fsProps.diskSaving?0.5:1}}>⬇ Save Now</button>
              <button onClick={fsProps.pickFolder} style={{...mkBtn(T),padding:'5px 10px',fontSize:9}}>Change…</button>
              <button onClick={fsProps.clearFolder} style={{...mkBtn(T),padding:'5px 10px',fontSize:9,color:'#f87171'}}>✕</button>
            </div>
            <label style={mkLBL(T)}>Auto-save interval</label>
            <div style={{display:'flex',gap:4}}>
              {[[60,'1m'],[120,'2m'],[300,'5m'],[600,'10m']].map(([s,lbl])=>(
                <button key={s} onClick={()=>setAppTheme(a=>({...a,diskSaveInterval:s}))} style={{...mkBtn(T,(appTheme.diskSaveInterval||120)===s),padding:'3px 0',fontSize:9,flex:1}}>{lbl}</button>
              ))}
            </div>
          </>
        ):(
          <>
            <div style={{fontSize:8,color:T.muted,lineHeight:1.7,marginBottom:8}}>
              Choose a folder on your computer. TrackLab will save your full library there — audio, artwork, and metadata — organized by profile and track. The catalog auto-saves every few minutes.
            </div>
            <button onClick={fsProps.pickFolder} style={{...mkBtn(T,true),width:'100%',padding:'8px 0',fontSize:9}}>📁 Choose Library Folder…</button>
          </>
        )}
      </div>
      {/* ── FONT SIZE ── */}
      {/* Scale mapping: internal value 115 = display "100%" (the comfortable default).
          All preset labels and the live readout are remapped: display% = round(internal * 100/115) */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
        <label style={mkLBL(T)}>UI Scale — {Math.round((at.uiFontSize||115)*100/115)}%</label>
        <input type="range" min={75} max={200} step={5} value={at.uiFontSize||115} onChange={e=>setA('uiFontSize',+e.target.value)} style={{width:'100%',marginBottom:6}}/>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {[[86,'75%'],[100,'87%'],[115,'100%'],[132,'115%'],[150,'130%'],[172,'150%'],[200,'174%']].map(([v,lbl])=>(
            <button key={v} onClick={()=>setA('uiFontSize',v)} style={{...mkBtn(T,(at.uiFontSize||115)===v),padding:'4px 0',fontSize:9,flex:1,minWidth:32}}>{lbl}</button>
          ))}
        </div>
        {(at.uiFontSize||115)>=172&&<div style={{fontSize:9,color:T.muted,marginTop:6,lineHeight:1.6}}>Large mode — some panels may need scrolling.</div>}
      </div>
      {/* ── UI FONT ── */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
        <label style={mkLBL(T)}>UI Font</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {[
            ['share-tech','"Share Tech Mono"','Share Tech Mono'],
            ['ibm-plex','"IBM Plex Mono"','IBM Plex Mono'],
            ['space-mono','"Space Mono"','Space Mono'],
            ['barlow','"Barlow Condensed"','Barlow'],
            ['orbitron','Orbitron','Orbitron'],
            ['system','system-ui,sans-serif','System UI'],
          ].map(([k,css,lbl])=>{
            const active=(at.uiFontKey||'share-tech')===k;
            return(
              <button key={k} onClick={()=>setAppTheme(a=>({...a,uiFontKey:k,uiFontCss:css}))}
                style={{...mkBtn(T,active),padding:'4px 8px',fontSize:8,fontFamily:css}}>
                {lbl}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12}}>
        <label style={mkLBL(T)}>Saved Themes</label>
        <div style={{display:'flex',gap:6,marginBottom:8}}>
          <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="Name this theme…" style={{...mkIS(T),flex:1,fontSize:11}}/>
          <button onClick={()=>saveST(saveName)} style={{...mkBtn(T,true),padding:'5px 10px',fontSize:9}}>Save</button>
        </div>
        {savedThemes.length===0&&<div style={{fontSize:9,color:T.muted,textAlign:'center',padding:'6px 0'}}>No saved themes</div>}
        {savedThemes.map(t=>(
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,padding:'5px 8px',background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
            <span style={{flex:1,fontSize:10,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
            <button onClick={()=>setAppTheme(()=>({...t.theme}))} style={{...mkBtn(T),padding:'3px 8px',fontSize:9}}>Load</button>
            <button onClick={()=>delST(t.id)} style={{background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:12}}>✕</button>
          </div>
        ))}
      </div>
      {/* ── TROUBLESHOOT ── */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:4}}>
        <label style={mkLBL(T)}>Troubleshoot</label>
        <div style={{fontSize:8,color:T.muted,lineHeight:1.7,marginBottom:8}}>
          If themes are not applying correctly, clear the stored settings and reload. Your saved themes above will not be affected.
        </div>
        {/* Live colour swatch — if these match the UI, theme is working */}
        <div style={{display:'flex',gap:4,marginBottom:8}}>
          {[['bg',T.bg],['panel',T.panel],['accent',T.accent],['text',T.text],['border',T.border]].map(([k,v])=>(
            <div key={k} title={`${k}: ${v}`} style={{flex:1,height:14,background:v,border:'1px solid rgba(128,128,128,0.3)',borderRadius:2}}/>
          ))}
        </div>
        <button
          onClick={()=>{
            if(window.confirm('Clear stored appearance settings and reload? Your saved themes will be preserved.')){
              localStorage.removeItem('tl_apptheme');
              window.location.reload();
            }
          }}
          style={{...mkBtn(T),width:'100%',padding:'6px 0',fontSize:9,color:'#f87171',borderColor:'#f87171'}}
        >⟳ Clear Appearance Cache &amp; Reload</button>
      </div>
    </div>
  );
}

// EntryCard — archive list row

