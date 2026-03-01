// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 6: FILE SYSTEM (FSAPI)                               ║
// ║  FSAPI, useSavePath, saveEntryNow, saveAll                   ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE SYSTEM ACCESS API (FSAPI)
// Thin wrapper — every method can be swapped 1-for-1 with
// Electron's fs module in a future desktop build.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const FSAPI={
  supported:typeof window.showDirectoryPicker==='function',

  async pickFolder(){
    if(!this.supported)return null;
    try{
      return await window.showDirectoryPicker({mode:'readwrite',startIn:'documents',id:'tracklab-lib'});
    }catch(e){
      if(e.name==='AbortError')return null;
      console.error('[FSAPI] pickFolder:',e);return null;
    }
  },

  async verifyPermission(h){
    if(!h)return false;
    try{
      const s=await h.queryPermission({mode:'readwrite'});
      if(s==='granted')return true;
      return(await h.requestPermission({mode:'readwrite'}))==='granted';
    }catch{return false;}
  },

  // Get or create a nested subfolder: getDir(root, 'Profiles', 'My Artist', 'My Track')
  async getDir(root,...parts){
    let cur=root;
    for(const p of parts){
      if(!p)continue;
      cur=await cur.getDirectoryHandle(p,{create:true});
    }
    return cur;
  },

  async writeFile(dir,filename,data){
    // data: string | ArrayBuffer | Blob
    try{
      const fh=await dir.getFileHandle(filename,{create:true});
      const w=await fh.createWritable();
      await w.write(data);
      await w.close();
      return{ok:true};
    }catch(e){console.error('[FSAPI] writeFile:',e);return{ok:false,error:e.message};}
  },

  async readFile(dir,filename){
    try{
      const fh=await dir.getFileHandle(filename);
      const file=await fh.getFile();
      return file; // caller decides: .text(), .arrayBuffer(), etc.
    }catch{return null;}
  },

  async fileExists(dir,filename){
    try{await dir.getFileHandle(filename);return true;}catch{return false;}
  },

  // Delete a subfolder and all its contents recursively.
  // parent: the DirectoryHandle that contains the folder to delete.
  // dirName: string name of the folder to remove.
  async removeDir(parent,dirName){
    if(!parent||!dirName)return false;
    try{
      await parent.removeEntry(dirName,{recursive:true});
      return true;
    }catch(e){
      // NotFoundError is fine — folder was already gone
      if(e.name!=='NotFoundError')console.warn('[FSAPI] removeDir:',e);
      return false;
    }
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LIBRARY HELPERS
// Folder-safe name: strip chars that break filesystems
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const safeName=s=>(s||'untitled').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.+$/,'').trim().slice(0,80)||'untitled';

const README_TEXT=`TRACK LAB — USER LIBRARY
${'━'.repeat(50)}

Created: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
App Version: TrackLab 0.1.2

This folder is your TrackLab library. It is managed automatically
by the app but is fully readable and portable without it.

FOLDER STRUCTURE
${'─'.repeat(40)}
Each top-level folder is an Artist Profile or Project.
Inside each profile, every track has its own folder:

  [Profile Name]/
    _profile.json              — profile metadata
    [Track Title]/
      audio.[ext]              — your audio file
      artwork.jpg              — album art (if set)
      metadata.json            — all tags, codes & label data

ROOT FILES
${'─'.repeat(40)}
  tracklab-catalog.json        — full catalog (used for fast restore)
  README.txt                   — this file (safe to edit)

RESTORING YOUR LIBRARY
${'─'.repeat(40)}
Open TrackLab → Settings (⚙) → Save Location → Choose this folder.
The app reads tracklab-catalog.json and restores everything instantly.

If tracklab-catalog.json is missing, the app will walk each track
folder and rebuild the catalog from individual metadata.json files.

BACKING UP
${'─'.repeat(40)}
Copy this entire folder to Dropbox, Google Drive, or an external
drive. Everything TrackLab needs is contained here.

${'━'.repeat(50)}
Track Lab ${VERSION} · All data stored locally · No account required
`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useSavePath HOOK
// Manages the chosen library folder across sessions.
// The DirectoryHandle is persisted in IndexedDB (Chrome supports this).
// On every page load we re-verify permission — if still granted,
// we restore silently. If not, we show the reconnect banner.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const FS_HANDLE_KEY='tl_fs_dir_handle';

function useSavePath(){
  const [rootDir,setRootDir]=useState(null);
  const [folderName,setFolderName]=useState(()=>loadLS('tl_save_folder_name',''));
  const [permState,setPermState]=useState('idle'); // 'idle'|'checking'|'granted'|'needs-prompt'|'unsupported'
  const [diskSaving,setDiskSaving]=useState(false);
  const [diskLastSaved,setDiskLastSaved]=useState(null);
  const [diskSaveError,setDiskSaveError]=useState('');

  // On mount: try to restore persisted handle
  useEffect(()=>{
    if(!FSAPI.supported){setPermState('unsupported');return;}
    setPermState('checking');
    (async()=>{
      try{
        const stored=await IDB.get(FS_HANDLE_KEY,'assets');
        if(!stored){setPermState('idle');return;}
        // Check permission without prompting the user
        const perm=await stored.queryPermission({mode:'readwrite'});
        if(perm==='granted'){
          setRootDir(stored);
          setFolderName(stored.name||'');
          setPermState('granted');
        }else{
          // Handle exists but needs user gesture to re-grant — show banner
          setPermState('needs-prompt');
          setFolderName(stored.name||'');
        }
      }catch{setPermState('idle');}
    })();
  },[]);

  // One-click reconnect (called from the banner — requires user gesture)
  const reconnect=async()=>{
    if(!FSAPI.supported)return false;
    try{
      const stored=await IDB.get(FS_HANDLE_KEY,'assets');
      if(!stored){setPermState('idle');return false;}
      const ok=await FSAPI.verifyPermission(stored);
      if(ok){
        setRootDir(stored);
        setFolderName(stored.name||'');
        setPermState('granted');
        setDiskSaveError('');
        return true;
      }else{
        setPermState('needs-prompt');
        return false;
      }
    }catch{setPermState('needs-prompt');return false;}
  };

  // Full folder picker (first-time setup or change folder)
  const pickFolder=async()=>{
    const h=await FSAPI.pickFolder();
    if(!h)return false;
    try{await IDB.set(FS_HANDLE_KEY,h,'assets');}catch{}
    saveLS('tl_save_folder_name',h.name||'');
    setRootDir(h);
    setFolderName(h.name||'');
    setPermState('granted');
    setDiskSaveError('');
    // Write README on first use (never overwrite if already exists)
    try{
      const exists=await FSAPI.fileExists(h,'README.txt');
      if(!exists)await FSAPI.writeFile(h,'README.txt',README_TEXT);
    }catch{}
    return true;
  };

  const clearFolder=async()=>{
    try{await IDB.del(FS_HANDLE_KEY,'assets');}catch{}
    saveLS('tl_save_folder_name','');
    setRootDir(null);setFolderName('');
    setPermState('idle');setDiskSaveError('');setDiskLastSaved(null);
  };

  // ── saveCatalog: writes tracklab-catalog.json (fast, metadata only)
  // rootDirRef: always points to the live handle — passed to App so its
  // interval callbacks always use the current value, never a stale closure.
  const rootDirRef=useRef(null);
  useEffect(()=>{rootDirRef.current=rootDir;},[rootDir]);

  // All save helpers receive `dir` explicitly — no closure over rootDir state.
  const _saveCatalog=async(dir,profiles,entries)=>{
    if(!dir)return false;
    const payload={app:'tracklab',version:VERSION,savedAt:new Date().toISOString(),profiles,
      entries:entries.map(e=>({...e,albumArtThumb:undefined}))};
    const result=await FSAPI.writeFile(dir,'tracklab-catalog.json',JSON.stringify(payload,null,2));
    if(result.ok){setDiskLastSaved(new Date());setDiskSaveError('');}
    else setDiskSaveError(result.error||'Write failed');
    return result.ok;
  };

  // ── syncEntry: the single source-of-truth for writing one track to disk.
  // Handles: first-write, metadata updates, renames, numbered prefix, audio/art files.
  // sortIndex: 0-based position in the UI track list (used for folder name prefix).
  // Returns the new diskFolderName string so callers can stamp it back onto the entry.
  const _syncEntry=async(dir,profiles,entry,sortIndex,audioBuf,artBuf)=>{
    if(!dir)return null;
    try{
      const profile=profiles.find(p=>p.id===entry.profileId);
      // Profile folder: use stored diskFolderName if present, else derive it
      const profileFolderName=profile?.diskFolderName||safeName(profile?.name||'Unknown Profile');
      const profileDir=await FSAPI.getDir(dir,profileFolderName);
      if(profile)await FSAPI.writeFile(profileDir,'_profile.json',JSON.stringify({...profile,diskFolderName:profileFolderName},null,2));

      // Track folder: zero-padded index prefix keeps disk order matching UI order
      const idx=typeof sortIndex==='number'?sortIndex:0;
      const prefix=String(idx+1).padStart(2,'0');
      const newFolderName=`${prefix}_${safeName(entry.title||entry.id)}`;
      const oldFolderName=entry.diskFolderName;

      // Write to the new/current folder
      const trackDir=await FSAPI.getDir(profileDir,newFolderName);
      await FSAPI.writeFile(trackDir,'metadata.json',JSON.stringify(
        {...entry,diskFolderName:newFolderName,albumArtThumb:undefined},null,2));
      if(audioBuf){
        const ext=(entry.audioFilename||'audio.mp3').split('.').pop()||'mp3';
        await FSAPI.writeFile(trackDir,`audio.${ext}`,audioBuf);
      }
      if(artBuf)await FSAPI.writeFile(trackDir,'artwork.jpg',artBuf);

      // If the folder was renamed (title changed or sort position shifted), delete the old folder
      if(oldFolderName&&oldFolderName!==newFolderName){
        await FSAPI.removeDir(profileDir,oldFolderName);
      }

      return newFolderName;
    }catch(e){console.error('[syncEntry]',e);return null;}
  };

  // Public API — callers pass dir from rootDirRef.current so it's always live.
  // updateEntryDiskName: optional callback (id, diskFolderName) to stamp the name back onto app state.
  const saveAll=async(dir,profiles,entries,updateEntryDiskName)=>{
    if(!dir)return false;
    setDiskSaving(true);setDiskSaveError('');
    try{
      // Build a per-profile sort order map so each track gets the right index
      // Uses the same manual order that the UI uses (entryManualOrder is external —
      // so saveAll is called with the pre-sorted entries array by the caller)
      const profileIndexMap={}; // {pid: counter}
      await _saveCatalog(dir,profiles,entries);
      for(const entry of entries){
        const pid=entry.profileId;
        if(profileIndexMap[pid]===undefined)profileIndexMap[pid]=0;
        const sortIndex=profileIndexMap[pid]++;
        let audioBuf=null,artBuf=null;
        try{audioBuf=await IDB.get(`audio_${entry.id}`,'assets');}catch{}
        try{artBuf=await IDB.get(`art_${entry.id}`,'assets');}catch{}
        if(audioBuf||artBuf||entry.title){
          const newFolderName=await _syncEntry(dir,profiles,entry,sortIndex,audioBuf,artBuf);
          if(newFolderName&&newFolderName!==entry.diskFolderName&&updateEntryDiskName){
            updateEntryDiskName(entry.id,newFolderName);
          }
        }
      }
      setDiskLastSaved(new Date());
      return true;
    }catch(e){setDiskSaveError(e.message||'Save failed');return false;}
    finally{setDiskSaving(false);}
  };

  // Save one entry immediately — used after the manual Save button press.
  // sortIndex: the entry's current position in the profile's displayed track list.
  // Returns the new diskFolderName (or null) so the caller can stamp it back.
  const saveEntryNow=async(dir,profiles,entry,sortIndex)=>{
    if(!dir||!entry)return null;
    let audioBuf=null,artBuf=null;
    try{audioBuf=await IDB.get(`audio_${entry.id}`,'assets');}catch{}
    try{artBuf=await IDB.get(`art_${entry.id}`,'assets');}catch{}
    return await _syncEntry(dir,profiles,entry,sortIndex??0,audioBuf,artBuf);
  };

  return{rootDir,rootDirRef,folderName,permState,diskSaving,diskLastSaved,diskSaveError,
    pickFolder,clearFolder,reconnect,saveAll,saveEntryNow,_saveCatalog,_syncEntry};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useDragResize — draggable sidebar width
// key: localStorage key to persist width across sessions
// defaultW: fallback width in px
// min/max: clamp range
// side: 'right' (handle on right edge) | 'left' (handle on left edge)
// Returns { width, handle } — spread handle props onto the drag-handle div
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

