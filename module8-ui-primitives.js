// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 8: UI PRIMITIVES                                     ║
// ║  mkIS, mkLBL, mkCard, mkBtn, TInp, TSel, TTxt               ║
// ║  Row2, F, MF, Accordion, Tog, ColorRow                      ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ UI PRIMITIVES — ALL DEFINED OUTSIDE APP TO PREVENT REMOUNT BUG ━━━━━━━━
const mkIS=T=>({width:'100%',background:T.bg,border:`1px solid ${T.border}`,color:T.bright,fontFamily:'inherit',fontSize:12,padding:'5px 8px',outline:'none',marginBottom:0,borderRadius:T.r||0,lineHeight:'1.4',verticalAlign:'middle'});
const mkLBL=T=>({display:'block',fontSize:8,letterSpacing:'0.18em',textTransform:'uppercase',color:T.muted,marginBottom:3,fontFamily:'inherit'});
const mkCard=T=>({background:T.card,border:`1px solid ${T.border}`,padding:16,marginBottom:12,borderRadius:(T.r||0)*1.5});
const mkBtn=(T,primary=false)=>({padding:'8px 16px',background:primary?T.accent:T.panel,color:primary?T.bg:T.text,border:`1px solid ${primary?T.accent:T.border}`,fontFamily:'inherit',fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer',fontWeight:primary?700:400,borderRadius:T.r||0});
const btnMini={background:'none',border:'none',color:'#555',fontSize:11,cursor:'pointer',padding:'0 3px',flexShrink:0};

function TInp({T,style,...p}){return<input {...p} style={{...mkIS(T),...style}}/>;}
function TSel({T,style,children,...p}){return<select {...p} style={{...mkIS(T),...style}}>{children}</select>;}
function TTxt({T,style,...p}){return<textarea {...p} style={{...mkIS(T),resize:'vertical',minHeight:56,lineHeight:1.45,...style}}/>;}
function Row2({children}){return<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>{children}</div>;}
function F({T,label,children,mt=0}){return<div style={{marginBottom:7,marginTop:mt}}>{label&&<label style={mkLBL(T)}>{label}</label>}{children}</div>;}

// MF: metadata field wrapper — receives T as prop, never defined inside App
function MF({T,label,hint,children}){
  return(
    <div style={{marginBottom:10}}>
      {label&&<label style={mkLBL(T)}>{label}</label>}
      {children}
      {hint&&<div style={{fontSize:8,color:T.muted,marginTop:3,lineHeight:1.5,letterSpacing:'0.03em'}}>{hint}</div>}
    </div>
  );
}

function Accordion({T,title,children,defaultOpen=false}){
  const [open,setOpen]=useState(defaultOpen);
  return(
    <div style={{borderBottom:`1px solid ${T.border}`}}>
      <div onClick={()=>setOpen(o=>!o)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',cursor:'pointer',userSelect:'none'}}>
        <span style={{fontSize:9,letterSpacing:'0.2em',textTransform:'uppercase',color:T.muted}}>{title}</span>
        <span style={{fontSize:10,color:T.muted,transform:open?'rotate(180deg)':'none',transition:'transform 0.15s'}}>▾</span>
      </div>
      {open&&<div style={{paddingBottom:12}}>{children}</div>}
    </div>
  );
}

function Tog({T,label,value,onChange}){
  return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,cursor:'pointer'}} onClick={()=>onChange(!value)}>
      <span style={{fontSize:10,color:value?T.text:T.muted,letterSpacing:'0.06em'}}>{label}</span>
      <div style={{width:28,height:14,background:value?T.accent:T.bg,borderRadius:7,position:'relative',flexShrink:0,border:`1px solid ${T.border}`,transition:'background 0.12s'}}>
        <div style={{position:'absolute',top:2,left:value?14:2,width:8,height:8,borderRadius:'50%',background:value?T.bg:T.muted,transition:'left 0.12s'}}/>
      </div>
    </div>
  );
}

function ColorRow({T,label,hex,alpha,onHex,onAlpha,showAlpha=false}){
  const eye=async cb=>{if('EyeDropper' in window){try{const r=await(new EyeDropper()).open();cb(r.sRGBHex);}catch{}}else alert('EyeDropper: Chrome only');};
  return(
    <div style={{marginBottom:8}}>
      {label&&<label style={mkLBL(T)}>{label}</label>}
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <input type="color" value={hex||'#000000'} onChange={e=>onHex(e.target.value)} style={{width:26,height:20,padding:0,border:`1px solid ${T.border}`,borderRadius:2,cursor:'pointer',flexShrink:0}}/>
        <TInp T={T} value={hex||'#000000'} onChange={e=>onHex(e.target.value)} style={{flex:1,fontSize:11,padding:'3px 6px'}}/>
        {'EyeDropper' in window&&<button onClick={()=>eye(onHex)} style={{background:T.bg,border:`1px solid ${T.border}`,color:T.muted,fontSize:11,padding:'2px 6px',cursor:'pointer',flexShrink:0}}>✦</button>}
        {showAlpha&&<><input type="range" min={0} max={1} step={0.01} value={alpha??1} onChange={e=>onAlpha(+e.target.value)} style={{width:48}}/><span style={{fontSize:9,color:T.muted,width:26,textAlign:'right'}}>{Math.round((alpha??1)*100)}%</span></>}
      </div>
    </div>
  );
}


