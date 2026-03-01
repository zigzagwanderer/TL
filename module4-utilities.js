// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 4: UTILITIES                                         ║
// ║  todayStr, shortUrl, getCodeDesc, rgba, loadLS, saveLS       ║
// ║  getColors, getAppTheme, fmtBytes, fmtDate, IDB              ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ HELPERS ━━━━━━━━
const todayStr=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const shortUrl=u=>{try{const p=new URL(u);return p.hostname+(p.pathname!=='/'?p.pathname.slice(0,22):'');}catch{return u.slice(0,28);}};
const getCodeDesc=code=>{const d=code.replace('.','').toUpperCase().split('');if(d.length<4)return'';return[CLS.digit1.options[d[0]],CLS.digit2.options[d[1]],CLS.digit3.options[d[2]],CLS.digit4.options[d[3]]].filter(Boolean).join(' • ');};
const rgba=(hex,alpha=1)=>{if(!hex||hex==='transparent')return'transparent';const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${alpha})`;};
const loadLS=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}};
const saveLS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const getColors=s=>{const base=s.scheme==='custom'?s.customColors:(BASE_SCHEMES[s.scheme]||BASE_SCHEMES.blanc);return{...base,_bgAlpha:s.bgAlpha??1,_fgAlpha:s.fgAlpha??1};};
const REQUIRED_THEME_KEYS=['bg','panel','border','text','sub','accent','muted','card','bright'];
const getAppTheme=at=>{
  // Guard: if at is missing or malformed, return a safe default immediately
  if(!at||typeof at!=='object') return {...APP_THEMES.void,r:0};
  const base=at.themeKey==='custom'
    ?{bg:at.customBg||'#06060a',panel:at.customPanel||'#0b0b10',border:at.customBorder||'#141418',
      text:at.customText||'#888',sub:at.customSub||'#55556a',accent:at.customAccent||'#c8ff00',
      muted:at.customBorder||'#141418',card:at.customPanel||'#0b0b10',
      bright:at.customBright||at.customText||'#ccc'}
    :(APP_THEMES[at.themeKey]||APP_THEMES.void);
  // Guard: if base is somehow missing required keys, fall back to void
  if(REQUIRED_THEME_KEYS.some(k=>!base[k])) return {...APP_THEMES.void,r:at.borderRadius||0};
  const merged={...base,r:at.borderRadius||0};
  // Apply color overrides — no guards, user intent is absolute
  if(at.colorOverrides&&at.themeKey!=='custom'){
    if(at.customBg)     { merged.bg=at.customBg; merged.card=at.customBg; merged.panel=at.customBg; }
    if(at.customAccent) merged.accent=at.customAccent;
    if(at.customText)   merged.text=at.customText;
    if(at.customSub)    merged.sub=at.customSub;
    if(at.customBright) merged.bright=at.customBright;
  }
  return merged;
};
const isrcValid=v=>/^[A-Z]{2}-[A-Z0-9]{3}-\d{2}-\d{5}$/.test(v);
const upcValid=v=>/^\d{12,13}$/.test(v.replace(/[\s-]/g,''));
const fmtBytes=b=>b>1048576?`${(b/1048576).toFixed(1)} MB`:b>1024?`${(b/1024).toFixed(0)} KB`:`${b} B`;
// Formats stored YYYY-MM-DD → "14 Jan 2025" — handles missing/malformed gracefully
const fmtDate=str=>{
  if(!str)return'';
  try{
    const[y,m,d]=str.split('-');
    const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return`${+d} ${MON[+m-1]||'?'} ${y}`;
  }catch{return str;}
};

// ━━━━━━━━ INDEXEDDB ━━━━━━━━
const IDB={
  _db:null,
  // v2: adds dedicated 'assets' store; keeps 'blobs' for backwards compat
  open(){return new Promise((res,rej)=>{if(this._db)return res(this._db);const req=indexedDB.open('tracklab',2);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('blobs'))db.createObjectStore('blobs');if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets');};req.onsuccess=e=>{this._db=e.target.result;res(this._db);};req.onerror=()=>rej(req.error);});},
  async set(k,v,store='assets'){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});},
  async get(k,store='assets'){const db=await this.open();return new Promise((res,rej)=>{const req=db.transaction(store,'readonly').objectStore(store).get(k);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});},
  async del(k,store='assets'){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});},
};
// Named boot hook — call once on app mount to guarantee DB schema is ready
const initDB=()=>IDB.open();


