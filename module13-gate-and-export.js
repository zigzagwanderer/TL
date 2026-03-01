// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 13: GATE & BATCH EXPORT                              ║
// ║  LicenseGate, renderLabelToBlob                              ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ LICENSE GATE [SCAFFOLD — v0.0.1] ━━━━━━━━
// Self-contained gate — no App state dependencies, no shared refs.
// This isolation makes it straightforward to obfuscate this block separately
// in a future build step.
//
// HOW TO ACTIVATE:
//   1. Change bypass=true → bypass=false in the <LicenseGate> call in App's return.
//   2. Replace VALID_KEY with a real value (or a hash comparison / server call).
//   3. Obfuscate only this block when shipping.
//
const LG_KEY='tl_lic_ok'; // localStorage key for unlock persistence
function LicenseGate({T,children,bypass=true}){
  if(bypass)return children; // dev/open mode — flip to false to enforce

  const [key,setKey]=useState('');
  const [err,setErr]=useState('');
  const [ok,setOk]=useState(()=>{
    try{return localStorage.getItem(LG_KEY)==='1';}catch{return false;}
  });

  const validate=()=>{
    // ── REPLACE with real validation (HMAC, server ping, etc.) ──
    const VALID_KEY='TRACK-LAB-DEMO-0000'; // placeholder
    if(key.trim().toUpperCase()===VALID_KEY){
      try{localStorage.setItem(LG_KEY,'1');}catch{}
      setOk(true);
    }else{
      setErr('Invalid key. Please check and try again.');
    }
  };

  if(ok)return children;

  return(
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      background:T.bg,flexDirection:'column',gap:16,padding:24}}>
      <div style={{fontSize:9,letterSpacing:'0.4em',textTransform:'uppercase',color:T.muted,marginBottom:4}}>
        Track Lab — Licensed Software
      </div>
      <div style={{fontSize:28,fontWeight:700,color:T.accent,letterSpacing:'0.08em'}}>
        TRACK LAB
      </div>
      <div style={{fontSize:10,color:T.text,marginBottom:8}}>Enter your license key to continue.</div>
      <input
        value={key}
        onChange={e=>{setKey(e.target.value);setErr('');}}
        onKeyDown={e=>e.key==='Enter'&&validate()}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        autoFocus spellCheck={false}
        style={{
          background:T.panel,
          border:`1px solid ${err?'#f87171':T.border}`,
          color:T.bright,fontFamily:'monospace',fontSize:13,
          padding:'10px 18px',borderRadius:T.r||0,
          letterSpacing:'0.18em',textAlign:'center',width:300,outline:'none',
          transition:'border-color 0.2s',
        }}
      />
      {err&&<div style={{fontSize:8,color:'#f87171',letterSpacing:'0.06em'}}>{err}</div>}
      <button
        onClick={validate}
        style={{background:T.accent,border:'none',color:T.bg,fontFamily:'inherit',
          fontWeight:700,fontSize:9,letterSpacing:'0.2em',textTransform:'uppercase',
          padding:'11px 32px',cursor:'pointer',borderRadius:T.r||0,marginTop:4}}>
        UNLOCK
      </button>
      <div style={{fontSize:7,color:T.muted,marginTop:8,letterSpacing:'0.06em'}}>
        v{VERSION} · Key is stored locally after first unlock.
      </div>
    </div>
  );
}


