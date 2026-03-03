// ║  MODULE 14: APP — ROOT COMPONENT                             ║
// ║  Main state orchestrator and tab router                      ║
// ╚══════════════════════════════════════════════════════════════╝
function App(){
  // Theme
  // ── Validate stored appTheme on startup — repair it if it came from an older/different version
  const [appTheme,setAppThemeRaw]=useState(()=>{
    const stored=loadLS('tl_apptheme',DEFAULT_APP_THEME);
    // If stored themeKey doesn't exist in current APP_THEMES and isn't 'custom', reset to default key
    if(stored.themeKey && stored.themeKey!=='custom' && !APP_THEMES[stored.themeKey]){
      const repaired={...DEFAULT_APP_THEME,...stored,themeKey:'void'};
      saveLS('tl_apptheme',repaired);
      return repaired;
    }
    // Merge with defaults so any missing keys from old versions get filled in
    return{...DEFAULT_APP_THEME,...stored};
  });
  const setAppTheme=useCallback(upd=>setAppThemeRaw(a=>{const na=typeof upd==='function'?upd(a):{...a,...upd};saveLS('tl_apptheme',na);return na;}),[]);
  const [showTheme,setShowTheme]=useState(false);
  const T=getAppTheme(appTheme);

  // ── FILE SYSTEM (disk library)
  const {rootDir,rootDirRef,folderName,permState,diskSaving,diskLastSaved,diskSaveError,
    pickFolder,clearFolder,reconnect,saveAll,saveEntryNow,_saveCatalog,_syncEntry}=useSavePath();
  // Always-current ref so disk-save intervals never capture stale state
  const diskSaveAllRef=useRef();

  useEffect(()=>{
    document.body.style.filter=`brightness(${appTheme.brightness||100}%)`;
    document.body.style.background=T.bg;document.body.style.color=T.text;
    document.documentElement.style.background=T.bg;
    // Apply UI font — falls back to Share Tech Mono if not set
    const uiFont=appTheme.uiFontCss||'"Share Tech Mono",monospace';
    document.body.style.fontFamily=uiFont;
    const r=document.documentElement;
    [['--app-bg',T.bg],['--app-border',T.border],['--app-accent',T.accent],['--app-panel',T.panel],['--app-text',T.text]].forEach(([k,v])=>r.style.setProperty(k,v));
    // UI Scale — zoom scales the entire layout (all px values, panels, buttons, gaps)
    const root=document.getElementById('root');
    if(root)root.style.zoom=`${(appTheme.uiFontSize||100)/100}`;
  },[appTheme,T]);

  // ── GLOBAL DRAG GUARD — prevent browser from hijacking file drops and opening them in a new tab
  useEffect(()=>{
    const stop=e=>e.preventDefault();
    window.addEventListener('dragover',stop);
    window.addEventListener('drop',stop);
    return()=>{
      window.removeEventListener('dragover',stop);
      window.removeEventListener('drop',stop);
    };
  },[]);

  const [tab,setTab]=useState('archive');
  // ── SIDEBAR RESIZE
  const archiveSidebar=useDragResize({key:'tl_w_archive_sidebar',defaultW:220,min:140,max:400,label:'Profiles'});
  const archiveDetail=useDragResize({key:'tl_w_archive_detail',defaultW:240,min:160,max:420,side:'left',label:'Detail'});
  const metaSidebar=useDragResize({key:'tl_w_meta_sidebar',defaultW:155,min:100,max:320,label:'Sections'});
  const labelPanel=useDragResize({key:'tl_w_label_panel',defaultW:288,min:180,max:480,label:'Controls'});
  const batchPanel=useDragResize({key:'tl_w_batch_panel',defaultW:232,min:160,max:400,side:'left',label:'Batch'});
  const [savedFlash,setSavedFlash]=useState(false);
  const [autoSaving,setAutoSaving]=useState(false);
  const [zipping,setZipping]=useState(false);

  // ━━━━━━━━ UNDO / REDO ━━━━━━━━
  // metaHistory  — tracks the active editing state: meta, fields, settings, credits, artState
  //               Snapshot taken on: every field blur/change (debounced 800ms), before save, on tab switch away
  // catalogHistory — tracks structural catalog state: entries[], profiles[], order maps
  //               Snapshot taken on: before delete, before reorder, before bulk-status change
  //
  // Art pointer rule: albumArt data is stored in IndexedDB, NOT in the snapshot.
  // We keep the '[stored]' flag string so restore knows to leave it intact.
  // History stacks — seeded with null; populated on first snapshot after real state is ready.
  // Using null as the initial slot means undo() can never return an empty-state snapshot.
  // The stacks are seeded by a one-shot useEffect once all state is declared (see below).
  const metaHistory=useHistory(null);
  const catalogHistory=useHistory(null);
  // Debounce timer ref for meta snapshot (avoids a snapshot per keypress)
  const metaSnapTimer=useRef(null);
  // Flag to suppress pushing a snapshot during an undo/redo restore itself
  const suppressMetaSnap=useRef(false);
  const suppressCatalogSnap=useRef(false);

  // ── Snapshot helpers (called at mutation points)
  // scheduleMetaSnap: debounced 800ms — safe to call on every keystroke
  const scheduleMetaSnap=useCallback((m,f,s,c,a)=>{
    if(suppressMetaSnap.current)return;
    clearTimeout(metaSnapTimer.current);
    metaSnapTimer.current=setTimeout(()=>{
      metaHistory.push({
        meta:{...m,albumArt:m?.albumArt&&!m.albumArt.startsWith('[stored]')?'[stored]':m?.albumArt},
        fields:{...f},
        settings:{...s},
        credits:[...(c||[])],
        artState:a?JSON.parse(JSON.stringify(a)):null,
      });
    },800);
  },[metaHistory]);

  const pushMetaSnapNow=useCallback((m,f,s,c,a)=>{
    if(suppressMetaSnap.current)return;
    clearTimeout(metaSnapTimer.current);
    metaHistory.push({
      meta:{...m,albumArt:m?.albumArt&&!m.albumArt.startsWith('[stored]')?'[stored]':m?.albumArt},
      fields:{...f},
      settings:{...s},
      credits:[...(c||[])],
      artState:a?JSON.parse(JSON.stringify(a)):null,
    });
  },[metaHistory]);

  const pushCatalogSnap=useCallback((ents,profs,profOrd,entOrd)=>{
    if(suppressCatalogSnap.current)return;
    catalogHistory.push({
      entries:ents.map(e=>({...e,albumArtThumb:undefined})),
      profiles:[...profs],
      profileOrder:[...profOrd],
      entryManualOrder:{...entOrd},
    });
  },[catalogHistory]);

  // ── PROFILES
  const [profiles,setProfilesRaw]=useState(()=>loadLS('tl_profiles',[]));
  const setProfiles=ps=>{
    // Accepts either a new array or a functional updater (prev=>newArr)
    if(typeof ps==='function'){
      setProfilesRaw(prev=>{const next=ps(prev);saveLS('tl_profiles',next);return next;});
    }else{
      setProfilesRaw(ps);saveLS('tl_profiles',ps);
    }
  };
  const [activePid,setActivePidRaw]=useState(()=>loadLS('tl_active_profile',null));
  const setActivePid=id=>{setActivePidRaw(id);saveLS('tl_active_profile',id);};
  const [newProf,setNewProf]=useState({open:false,name:'',desc:''});
  const [editProf,setEditProf]=useState(null); // {id,name,desc} when editing
  const createProfile=()=>{
    if(!newProf.name.trim())return;
    const folderName=safeName(newProf.name.trim());
    const p={id:mkUid(),name:newProf.name.trim(),description:newProf.desc.trim(),created:todayStr(),diskFolderName:folderName};
    setProfiles([...profiles,p]);setActivePid(p.id);
    setNewProf({open:false,name:'',desc:''});
    // Adopt any orphaned entries (profileId not matching any existing profile)
    // This preserves tracks that were dropped before a profile existed
    setEntriesRaw(prev=>{
      const knownPids=new Set([...profiles.map(x=>x.id),p.id]);
      const hasOrphans=prev.some(e=>!knownPids.has(e.profileId));
      if(!hasOrphans)return prev;
      const next=prev.map(e=>knownPids.has(e.profileId)?e:{...e,profileId:p.id});
      saveLS('tl_entries',next);
      return next;
    });
  };
  const saveEditProfile=async()=>{
    if(!editProf||!editProf.name.trim())return;
    const oldProfile=profiles.find(p=>p.id===editProf.id);
    const updatedProfile={...oldProfile,name:editProf.name.trim(),description:editProf.desc.trim()};
    const dir=rootDirRef.current;
    // If a disk folder exists under the old name, rename it by writing new _profile.json
    // and letting the next saveAll re-sync the new folder name
    if(dir&&oldProfile){
      try{
        const oldFolderName=oldProfile.diskFolderName||safeName(oldProfile.name||'Unknown Profile');
        const newFolderName=safeName(updatedProfile.name||'Unknown Profile');
        if(oldFolderName!==newFolderName){
          // Create new folder, copy _profile.json, schedule a full sync to move track folders
          const newProfileDir=await FSAPI.getDir(dir,newFolderName);
          await FSAPI.writeFile(newProfileDir,'_profile.json',
            JSON.stringify({...updatedProfile,diskFolderName:newFolderName},null,2));
          // Stamp new diskFolderName — old folder will be abandoned (tracks re-saved under new name)
          updatedProfile.diskFolderName=newFolderName;
          // Clear diskFolderName on all entries in this profile so _syncEntry re-creates them
          setEntriesRaw(prev=>{
            const ns=prev.map(e=>e.profileId===editProf.id?{...e,diskFolderName:undefined}:e);
            saveLS('tl_entries',ns);return ns;
          });
          // Remove old profile folder after a brief delay so new one is ready
          setTimeout(async()=>{
            try{await FSAPI.removeDir(dir,oldFolderName);}catch{}
          },1500);
        }
      }catch(e){console.warn('[saveEditProfile] disk rename:',e);}
    }
    const updatedProfiles=profiles.map(p=>p.id===editProf.id?updatedProfile:p);
    setProfiles(updatedProfiles);
    setEditProf(null);
    // Trigger a full disk save to rebuild track folders under the new profile folder name
    if(dir)setTimeout(()=>diskSaveAllRef.current?.(),600);
  };
  // Fix stale closure: use functional updaters for entries so we always have fresh state
  const deleteProfile=async id=>{
    const profile=profiles.find(p=>p.id===id);
    // Snapshot catalog state BEFORE the delete so it can be undone
    pushCatalogSnap(entries,profiles,profileOrder,entryManualOrder);
    // 1. Remove all track blobs from IndexedDB
    entries.filter(e=>e.profileId===id).forEach(async e=>{
      try{await IDB.del(`audio_${e.id}`);await IDB.del(`art_${e.id}`);}catch{}
    });
    // 2. Remove the profile's entire folder from disk
    const dir=rootDirRef.current;
    if(dir&&profile){
      try{
        const profileFolderName=profile.diskFolderName||safeName(profile.name||'Unknown Profile');
        await FSAPI.removeDir(dir,profileFolderName);
      }catch(e){console.warn('[deleteProfile] disk cleanup:',e);}
    }
    // 3. Update app state
    const remainingEntries=entries.filter(e=>e.profileId!==id);
    const remainingProfiles=profiles.filter(p=>p.id!==id);
    setProfiles(remainingProfiles);
    setEntriesRaw(prev=>{const next=prev.filter(e=>e.profileId!==id);saveLS('tl_entries',next);return next;});
    setProfileOrder(prev=>prev.filter(pid=>pid!==id));
    if(activePid===id){
      setActivePid(null);
      // Stop playback if the playing track belonged to this profile
      const deletedEids=new Set(entries.filter(e=>e.profileId===id).map(e=>e.id));
      if(deletedEids.has(playingEid)){
        const el=audioElRef.current;
        if(el){el.pause();el.src='';}
        setPlayingEid(null);
        setPlaying(false);
        _setAudioUrl(null);
      }
      // Reset all metadata fields since the active entry is gone
      setActiveEid(null);
      setMetaRaw({...DEFAULT_METADATA});saveLS('tl_metadata',{...DEFAULT_METADATA});
      setFieldsRaw({...DEFAULT_FIELDS});saveLS('tl_fields',{...DEFAULT_FIELDS});
      setSettingsRaw({...DEFAULT_SETTINGS});saveLS('tl_settings',{...DEFAULT_SETTINGS});
      setCreditsRaw([]);saveLS('tl_credits',[]);
      setAudioFile(null);
    }
    // 4. Re-save catalog without this profile
    if(dir)try{await _saveCatalog(dir,remainingProfiles,remainingEntries);}catch{}
  };
  const activeProfile=profiles.find(p=>p.id===activePid)||null;

  // ── ENTRIES
  const [entries,setEntriesRaw]=useState(()=>loadLS('tl_entries',[]));
  const setEntries=es=>{
    if(typeof es==='function'){
      setEntriesRaw(prev=>{const next=es(prev);saveLS('tl_entries',next);return next;});
    }else{
      setEntriesRaw(es);saveLS('tl_entries',es);
    }
  };
  const [activeEid,setActiveEidRaw]=useState(()=>{const saved=loadLS('tl_active_eid',null);return saved;});
  const setActiveEid=id=>{setActiveEidRaw(id);saveLS('tl_active_eid',id);};
  const activeEidRef=useRef(activeEid);
  useEffect(()=>{activeEidRef.current=activeEid;},[activeEid]);
  const activeEntry=entries.find(e=>e.id===activeEid)||null;
  const profEntries=useMemo(()=>entries.filter(e=>e.profileId===activePid).sort((a,b)=>(b.updated||'').localeCompare(a.updated||'')),[entries,activePid]);

  // ── DRAG-TO-REORDER STATE
  // profileOrder: array of profile IDs in display order (persisted)
  // entryManualOrder: {[pid]: [eid, eid, ...]} per-profile manual track order (persisted)
  const [profileOrder,setProfileOrderRaw]=useState(()=>loadLS('tl_profile_order',[]));
  const setProfileOrder=o=>{
    if(typeof o==='function'){setProfileOrderRaw(prev=>{const n=o(prev);saveLS('tl_profile_order',n);return n;});}
    else{setProfileOrderRaw(o);saveLS('tl_profile_order',o);}
  };
  const [entryManualOrder,setEntryManualOrderRaw]=useState(()=>loadLS('tl_entry_order',{}));
  const setEntryManualOrder=o=>{setEntryManualOrderRaw(o);saveLS('tl_entry_order',o);};
  const profileDragRef=useRef(null);   // id of profile being dragged
  const profileDragOverRef=useRef(null);
  const [profileDragOverId,setProfileDragOverId]=useState(null);
  const entryDragRef=useRef(null);     // id of entry being dragged
  const entryDragOverRef=useRef(null);
  const [entryDragOverId,setEntryDragOverId]=useState(null);

  // orderedProfiles: profiles in user-defined drag order
  const orderedProfiles=useMemo(()=>{
    if(!profileOrder.length)return profiles;
    const map=Object.fromEntries(profiles.map(p=>[p.id,p]));
    const ordered=profileOrder.map(id=>map[id]).filter(Boolean);
    // Append any profiles not yet in the order array (newly created)
    const inOrder=new Set(profileOrder);
    profiles.forEach(p=>{if(!inOrder.has(p.id))ordered.push(p);});
    return ordered;
  },[profiles,profileOrder]);

  // Profile drag reorder — uses functional setProfileOrder to avoid stale closure
  const reorderProfiles=(dragId,overId)=>{
    if(dragId===overId)return;
    setProfileOrder(prev=>{
      const order=[...prev];
      const from=order.indexOf(dragId),to=order.indexOf(overId);
      if(from===-1||to===-1)return prev;
      order.splice(from,1);order.splice(to,0,dragId);
      return order;
    });
  };

  // Entry drag reorder — uses functional updaters to avoid stale closure
  const reorderEntries=(dragId,overId,pid)=>{
    if(dragId===overId||!pid)return;
    // Snapshot before reorder so it can be undone
    pushCatalogSnap(entries,profiles,profileOrder,entryManualOrder);
    setEntriesRaw(prev=>{
      // Build current order for this profile from raw entries
      const allProfIds=prev.filter(e=>e.profileId===pid).map(e=>e.id);
      setEntryManualOrder(curOrder=>{
        const existing=curOrder[pid]||[];
        // Merge: start with existing manual order, add any new entries at end
        const working=[...new Set([...existing,...allProfIds])].filter(id=>allProfIds.includes(id));
        const from=working.indexOf(dragId),to=working.indexOf(overId);
        if(from===-1||to===-1)return curOrder;
        working.splice(from,1);working.splice(to,0,dragId);
        return{...curOrder,[pid]:working};
      });
      return prev; // entries array unchanged — only order changes
    });
    setArchiveSort('manual');
    // Re-save catalog so disk order stays in sync — full folder rename on next timed save
    const dir=rootDirRef.current;
    if(dir)setTimeout(()=>diskSaveAllRef.current?.(),400);
  };
  const [archiveSearch,setArchiveSearch]=useState('');
  const [archiveDragOver,setArchiveDragOver]=useState(false);
  const [dropProfilePrompt,setDropProfilePrompt]=useState(false);
  const [dropProfileName,setDropProfileName]=useState('');
  const pendingDropFilesRef=useRef([]);
  const [selectMode,setSelectMode]=useState(false);
  const [selectedEids,setSelectedEids]=useState(new Set());
  const [bulkStatus,setBulkStatus]=useState('complete');
  const [archiveSort,setArchiveSort]=useState('updated');
  const [archiveStatusFilter,setArchiveStatusFilter]=useState('all');
  const filteredEntries=useMemo(()=>{
    const q=archiveSearch.trim().toLowerCase();
    let base=entries.filter(e=>e.profileId===activePid);
    if(archiveStatusFilter!=='all')base=base.filter(e=>(e.status||'draft')===archiveStatusFilter);
    if(q)base=base.filter(e=>(e.title||'').toLowerCase().includes(q)||(e.artist||'').toLowerCase().includes(q)||(e.classCode||'').toLowerCase().includes(q)||(e.status||'').toLowerCase().includes(q));
    return base.sort((a,b)=>{
      if(archiveSort==='manual'){
        const order=entryManualOrder[activePid]||[];
        const ai=order.indexOf(a.id),bi=order.indexOf(b.id);
        if(ai===-1&&bi===-1)return(b.updated||'').localeCompare(a.updated||'');
        if(ai===-1)return 1;if(bi===-1)return -1;
        return ai-bi;
      }
      if(archiveSort==='title')return(a.title||'').localeCompare(b.title||'');
      if(archiveSort==='created')return(b.created||'').localeCompare(a.created||'');
      if(archiveSort==='status')return(a.status||'draft').localeCompare(b.status||'draft');
      return(b.updated||'').localeCompare(a.updated||'');
    });
  },[entries,activePid,archiveSearch,archiveSort,archiveStatusFilter,entryManualOrder]);
  const toggleSelectMode=()=>{setSelectMode(m=>!m);setSelectedEids(new Set());};
  const toggleEid=id=>setSelectedEids(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const selectAll=()=>setSelectedEids(new Set(filteredEntries.map(e=>e.id)));
  const applyBulkStatus=()=>{
    if(!selectedEids.size)return;
    // Snapshot before bulk change
    pushCatalogSnap(entries,profiles,profileOrder,entryManualOrder);
    setEntriesRaw(es=>{const ns=es.map(e=>selectedEids.has(e.id)?{...e,status:bulkStatus,updated:todayStr()}:e);saveLS('tl_entries',ns);return ns;});
    setSelectedEids(new Set());
  };

  const duplicateEntry=e=>{
    const newId=mkUid();
    const dupe={...e,id:newId,title:(e.title||'Untitled')+' (copy)',created:todayStr(),updated:todayStr(),hasAudio:false,hasArt:false,audioFilename:'',audioType:'',albumArtThumb:null,metadata:{...e.metadata,albumArt:null}};
    setEntries([...entries,dupe]);
    setActiveEid(newId);
  };

  const createEntry=()=>{
    if(!activePid)return;
    const e={id:mkUid(),profileId:activePid,title:'',artist:'',created:todayStr(),updated:todayStr(),status:'draft',
      metadata:{...DEFAULT_METADATA},labelFields:{...DEFAULT_FIELDS},labelSettings:{...DEFAULT_SETTINGS},
      artState:{...DEFAULT_ART_STATE},studioSubTab:'label',
      classCode:'',hasAudio:false,hasArt:false,audioFilename:'',audioType:'',albumArtThumb:null};
    setEntries([...entries,e]);
    setActiveEid(e.id);
    // Reset all working state to defaults for the fresh entry
    setFieldsRaw({...DEFAULT_FIELDS});saveLS('tl_fields',{...DEFAULT_FIELDS});
    setSettingsRaw({...DEFAULT_SETTINGS});saveLS('tl_settings',{...DEFAULT_SETTINGS});
    setMetaRaw({...DEFAULT_METADATA});saveLS('tl_metadata',{...DEFAULT_METADATA});
    setCreditsRaw([]);saveLS('tl_credits',[]);
    setAudioFile(null);
    setAudioObjectUrl(null);
    setTab('metadata');
  };

  const updateEntry=(id,changes)=>{setEntriesRaw(es=>{const ns=es.map(e=>e.id===id?{...e,...changes,updated:todayStr()}:e);saveLS('tl_entries',ns);return ns;});};

  const deleteEntry=async id=>{
    const entry=entries.find(e=>e.id===id);
    // Snapshot catalog state BEFORE the delete so it can be undone
    pushCatalogSnap(entries,profiles,profileOrder,entryManualOrder);
    // 1. Remove blobs from IndexedDB
    try{await IDB.del(`audio_${id}`);await IDB.del(`art_${id}`);}catch{}
    // 2. Remove folder from disk library
    const dir=rootDirRef.current;
    if(dir&&entry?.diskFolderName){
      try{
        const profile=profiles.find(p=>p.id===entry.profileId);
        const profileFolderName=profile?.diskFolderName||safeName(profile?.name||'Unknown Profile');
        const profileDir=await FSAPI.getDir(dir,profileFolderName);
        await FSAPI.removeDir(profileDir,entry.diskFolderName);
      }catch(e){console.warn('[deleteEntry] disk cleanup:',e);}
    }
    // 3. Update app state and re-save catalog without this entry
    const remaining=entries.filter(e=>e.id!==id);
    setEntries(remaining);
    // If the deleted entry is currently playing, stop the audio immediately
    if(playingEid===id){
      const el=audioElRef.current;
      if(el){el.pause();el.src='';}
      setPlayingEid(null);
      setPlaying(false);
      _setAudioUrl(null);
    }
    // If the deleted entry is the active (selected) one, clear all metadata fields
    if(activeEid===id){
      setActiveEid(null);
      setMetaRaw({...DEFAULT_METADATA});saveLS('tl_metadata',{...DEFAULT_METADATA});
      setFieldsRaw({...DEFAULT_FIELDS});saveLS('tl_fields',{...DEFAULT_FIELDS});
      setSettingsRaw({...DEFAULT_SETTINGS});saveLS('tl_settings',{...DEFAULT_SETTINGS});
      setCreditsRaw([]);saveLS('tl_credits',[]);
      setAudioFile(null);
      // Only clear audio URL if not already cleared above (i.e. wasn't playing)
      if(playingEid!==id)_setAudioUrl(null);
    }
    // 4. Re-number remaining tracks on disk so folder prefixes stay sequential
    if(dir)setTimeout(()=>diskSaveAllRef.current?.(),300);
  };

  // ── FOLDER-AWARE DROP EXTRACTION
  // Returns {files, folderName|null} — reads recursively from dropped folders via FileSystem API
  const extractDropItems=async(dataTransfer)=>{
    const AUDIO_RE=/\.(mp3|wav|flac|aiff?|m4a|ogg|opus|wma)$/i;
    const isAudio=f=>f.type.startsWith('audio/')||AUDIO_RE.test(f.name);

    // Try FileSystem API (Chrome/Edge) for folder support
    const items=Array.from(dataTransfer.items||[]);
    const entries_=[...items].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
    const hasFolder=entries_.some(e=>e.isDirectory);

    if(hasFolder){
      const readDir=async(dirEntry)=>{
        return new Promise(res=>{
          const reader=dirEntry.createReader();
          const all=[];
          const readBatch=()=>{
            reader.readEntries(batch=>{
              if(!batch.length)return res(all);
              all.push(...batch);
              readBatch();
            },()=>res(all));
          };
          readBatch();
        });
      };
      const getFileFromEntry=entry=>new Promise(res=>entry.file(res,()=>res(null)));
      const collectFiles=async(entry)=>{
        if(entry.isFile){
          const f=await getFileFromEntry(entry);
          return f&&isAudio(f)?[f]:[];
        }
        if(entry.isDirectory){
          const children=await readDir(entry);
          const nested=await Promise.all(children.map(collectFiles));
          return nested.flat();
        }
        return[];
      };
      const allFiles=(await Promise.all(entries_.map(collectFiles))).flat();
      const dirEntries=entries_.filter(e=>e.isDirectory);
      const folderName=dirEntries.length===1?dirEntries[0].name:null;
      return{files:allFiles,folderName};
    }

    // Plain files — no folder involved
    const files=Array.from(dataTransfer.files).filter(isAudio);
    return{files,folderName:null};
  };

  // ── BATCH AUDIO IMPORT — shared by drop handler and no-profile drop flow
  const importAudioFiles=(files,pid)=>{
    if(!files.length||!pid)return;
    const newEntries=files.map(file=>{
      const eid=mkUid();
      const title=file.name.replace(/\.[^.]+$/,'');
      return{entry:{id:eid,profileId:pid,title,artist:'',created:todayStr(),updated:todayStr(),status:'draft',
        metadata:{...DEFAULT_METADATA,title},labelFields:{...DEFAULT_FIELDS},labelSettings:{...DEFAULT_SETTINGS},
        artState:{...DEFAULT_ART_STATE},studioSubTab:'label',
        classCode:'',hasAudio:false,hasArt:false,audioFilename:file.name,audioType:file.type,albumArtThumb:null,analyzing:true},file};
    });
    setEntries(prev=>[...prev,...newEntries.map(x=>x.entry)]);
    const last=newEntries[newEntries.length-1];
    setActiveEid(last.entry.id);
    setMetaRaw({...DEFAULT_METADATA,title:last.entry.title});saveLS('tl_metadata',{...DEFAULT_METADATA,title:last.entry.title});
    setCreditsRaw([]);saveLS('tl_credits',[]);
    newEntries.forEach(async({entry:ent,file})=>{
      try{
        const buf=await file.arrayBuffer();
        const key=`audio_${ent.id}`;
        await IDB.set(key,buf,'assets');
        const blob=new Blob([buf],{type:file.type});
        const objUrl=URL.createObjectURL(blob);
        setEntries(prev=>prev.map(e=>e.id===ent.id?{...e,hasAudio:true,analyzing:false}:e));
        if(activeEidRef.current===ent.id){_setAudioUrl(objUrl);setPlayingEid(ent.id);setAudioFile({name:file.name,type:file.type,key:`audio_${ent.id}`});}
        if(typeof jsmediatags!=='undefined'){
          jsmediatags.read(file,{
            onSuccess(tag){
              const t=tag.tags,ch={};
              if(t.title)ch.title=t.title;
              if(t.artist)ch.artist=t.artist;
              if(t.album)ch.album=t.album;
              if(t.year)ch.year=String(t.year);
              if(t.genre)ch.genre=t.genre;
              if(t.track)ch.trackNum=String(t.track).split('/')[0];
              if(t.comment?.text)ch.comment=t.comment.text;
              setEntries(prev=>prev.map(e=>e.id===ent.id?{...e,metadata:{...e.metadata,...ch},title:ch.title||e.title,artist:ch.artist||e.artist}:e));
              if(activeEidRef.current===ent.id&&Object.keys(ch).length)setMetaObj(ch);
              if(t.picture){
                const bytes=new Uint8Array(t.picture.data);
                const b64=btoa(bytes.reduce((a,b)=>a+String.fromCharCode(b),''));
                const artData=`data:${t.picture.format};base64,${b64}`;
                setEntries(prev=>prev.map(e=>e.id===ent.id?{...e,metadata:{...e.metadata,albumArt:'[stored]'},hasArt:true,albumArtThumb:artData}:e));
                if(activeEidRef.current===ent.id)setMetaObj({albumArt:artData});
              }
            },onError(){}
          });
        }
        try{
          // Queue analysis serially — running multiple OfflineAudioContexts simultaneously
          // bogs down the browser's audio engine and makes the UI janky.
          analysisQueueRef.current=analysisQueueRef.current.then(async()=>{
            const isActive=activeEidRef.current===ent.id;
            if(isActive)setLufsAnalyzing(true);
            try{
              const audioContext=new (window.AudioContext||window.webkitAudioContext)();
              const decoded=await audioContext.decodeAudioData(buf.slice(0));
              audioContext.close();
              const analysis=await performFullAudioAnalysis(decoded);
              if(analysis){
                setEntries(prev=>prev.map(e=>e.id===ent.id?{...e,metadata:{...e.metadata,...analysis}}:e));
                if(activeEidRef.current===ent.id)setMetaRaw(m=>{const nm={...m,...analysis};saveLS('tl_metadata',nm);return nm;});
              }
            }catch{}
            finally{if(isActive)setLufsAnalyzing(false);}
          });
          await analysisQueueRef.current;
        }catch{}
      }catch(err){
        console.warn('Batch import failed for',file.name,err);
        setEntries(prev=>prev.map(e=>e.id===ent.id?{...e,analyzing:false}:e));
      }
    });
  };

  const loadEntryRef=useRef(null);

  const loadEntry=async e=>{
    // Snapshot the current editing state before switching entries (so user can undo back)
    pushMetaSnapNow(metaRef.current,fieldsRef.current,settingsRef.current,creditsRef.current,artStateRef.current);
    // Suppress any snap triggers that fire during the bulk state restore below
    suppressMetaSnap.current=true;
    setFieldsRaw({...DEFAULT_FIELDS,...e.labelFields});saveLS('tl_fields',{...DEFAULT_FIELDS,...e.labelFields});
    setSettingsRaw({...DEFAULT_SETTINGS,...e.labelSettings});saveLS('tl_settings',{...DEFAULT_SETTINGS,...e.labelSettings});
    // Always land on art when loading an entry — explicit label/classify actions override this
    if(e.artState){setArtState({...DEFAULT_ART_STATE,...e.artState});saveLS('tl_art_state',{...DEFAULT_ART_STATE,...e.artState});}
    setStudioSubTab('art');saveLS('tl_studio_sub','art');
    // Restore full albumArt from IDB if the entry used the "[stored]" sentinel
    let restoredMeta={...DEFAULT_METADATA,...e.metadata};
    if(e.hasArt&&restoredMeta.albumArt&&restoredMeta.albumArt.startsWith('[stored]')){
      try{
        let buf=await IDB.get(`art_${e.id}`,'assets');
        if(!buf)buf=await IDB.get(`art_${e.id}`,'blobs');
        if(buf){
          const blob=new Blob([buf],{type:'image/jpeg'});
          const dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(blob);});
          restoredMeta={...restoredMeta,albumArt:dataUrl};
        }
      }catch{}
    }
    setMetaRaw(restoredMeta);saveLS('tl_metadata',restoredMeta);
    setCreditsRaw(e.credits||[]);saveLS('tl_credits',e.credits||[]);
    setActiveEid(e.id);
    setAudioFile(e.hasAudio?{name:e.audioFilename,type:e.audioType,key:`audio_${e.id}`}:null);
    // Re-enable meta snapshots now that the load is complete
    requestAnimationFrame(()=>{suppressMetaSnap.current=false;});
    // Load audio into the element so it's ready, but do NOT set playingEid —
    // that only happens when the user explicitly presses Play.
    if(e.id!==activeEid){
      if(e.hasAudio){
        try{
          let buf=await IDB.get(`audio_${e.id}`,'assets');
          if(!buf)buf=await IDB.get(`audio_${e.id}`,'blobs');
          if(buf){
            const blob=new Blob([buf],{type:e.audioType||'audio/mpeg'});
            _setAudioUrl(URL.createObjectURL(blob));
            // Don't touch playingEid here — let onPlayPause set it
          }else{
            _setAudioUrl(null);setPlayingEid(null);
          }
        }catch{_setAudioUrl(null);setPlayingEid(null);}
      }else{
        _setAudioUrl(null);setPlayingEid(null);
      }
    }
  };
  // Keep loadEntryRef current so the audio 'ended' handler can call it without stale closure
  loadEntryRef.current=loadEntry;

  // ━━━━━━━━ UNDO / REDO RESTORE HANDLERS ━━━━━━━━
  // Metadata undo: restores meta, fields, settings, credits, artState from snapshot
  const doMetaUndo=useCallback(()=>{
    const snap=metaHistory.undo();
    if(!snap||!snap.meta)return; // null = uninitialised slot, skip
    suppressMetaSnap.current=true;
    setMetaRaw(snap.meta);saveLS('tl_metadata',snap.meta);
    setFieldsRaw(snap.fields);saveLS('tl_fields',snap.fields);
    setSettingsRaw(snap.settings);saveLS('tl_settings',snap.settings);
    setCreditsRaw(snap.credits);saveLS('tl_credits',snap.credits);
    if(snap.artState)setArtState(snap.artState);
    requestAnimationFrame(()=>{suppressMetaSnap.current=false;});
  },[metaHistory]);

  const doMetaRedo=useCallback(()=>{
    const snap=metaHistory.redo();
    if(!snap||!snap.meta)return;
    suppressMetaSnap.current=true;
    setMetaRaw(snap.meta);saveLS('tl_metadata',snap.meta);
    setFieldsRaw(snap.fields);saveLS('tl_fields',snap.fields);
    setSettingsRaw(snap.settings);saveLS('tl_settings',snap.settings);
    setCreditsRaw(snap.credits);saveLS('tl_credits',snap.credits);
    if(snap.artState)setArtState(snap.artState);
    requestAnimationFrame(()=>{suppressMetaSnap.current=false;});
  },[metaHistory]);

  // Catalog undo: restores entries, profiles, order maps from snapshot
  // NOTE: this restores the catalog list state only — audio/art blobs in IndexedDB
  // are NOT restored (we can't undelete files from disk). The entry record reappears
  // in the list but hasAudio/hasArt flags reflect whether blobs still exist.
  const doCatalogUndo=useCallback(()=>{
    const snap=catalogHistory.undo();
    if(!snap||!snap.entries)return; // null = uninitialised slot, skip
    suppressCatalogSnap.current=true;
    setEntriesRaw(snap.entries);saveLS('tl_entries',snap.entries);
    setProfilesRaw(snap.profiles);saveLS('tl_profiles',snap.profiles);
    setProfileOrderRaw(snap.profileOrder);saveLS('tl_profile_order',snap.profileOrder);
    setEntryManualOrderRaw(snap.entryManualOrder);saveLS('tl_entry_order',snap.entryManualOrder);
    requestAnimationFrame(()=>{suppressCatalogSnap.current=false;});
  },[catalogHistory]);

  const doCatalogRedo=useCallback(()=>{
    const snap=catalogHistory.redo();
    if(!snap||!snap.entries)return;
    suppressCatalogSnap.current=true;
    setEntriesRaw(snap.entries);saveLS('tl_entries',snap.entries);
    setProfilesRaw(snap.profiles);saveLS('tl_profiles',snap.profiles);
    setProfileOrderRaw(snap.profileOrder);saveLS('tl_profile_order',snap.profileOrder);
    setEntryManualOrderRaw(snap.entryManualOrder);saveLS('tl_entry_order',snap.entryManualOrder);
    requestAnimationFrame(()=>{suppressCatalogSnap.current=false;});
  },[catalogHistory]);

  const saveToEntry=()=>{
    if(!activeEid){alert('No archive entry selected. Open an entry from the Archive tab first.');return;}
    try{
      const changes={
        title:fields.title||meta.title||'',
        artist:fields.artist||meta.artist||'',
        metadata:{...meta,albumArt:meta.albumArt&&!meta.albumArt.startsWith('[stored]')?'[stored]':meta.albumArt},
        labelFields:{...fields},
        labelSettings:{...settings},
        artState:{...artState},
        studioSubTab,
        classCode:fields.classCode||'',
        credits:[...credits],
      };
      updateEntry(activeEid,changes);
      // Sync to disk immediately — compute sort index from current profile order
      const dir=rootDirRef.current;
      if(dir){
        const updatedEntry={...activeEntry,...changes,updated:todayStr()};
        const profEntries=getSortedEntriesForDisk().filter(e=>e.profileId===updatedEntry.profileId);
        const sortIndex=profEntries.findIndex(e=>e.id===activeEid);
        saveEntryNow(dir,profiles,updatedEntry,sortIndex>=0?sortIndex:0).then(newFolderName=>{
          if(newFolderName)updateEntryDiskName(activeEid,newFolderName);
          _saveCatalog(dir,profiles,getSortedEntriesForDisk());
        });
      }
      setTimeout(()=>setSavedFlash(false),1500);
    }catch(err){console.error('Save failed:',err);alert('Save failed: '+err.message);}
  };

  // ── AUTO-SAVE
  // saveRef always holds the freshest closure so the interval doesn't stale-capture
  const saveRef=useRef();
  const analysisQueueRef=useRef(Promise.resolve()); // serial queue — one analysis at a time
  saveRef.current=()=>{
    if(!activeEid)return;
    try{
      updateEntry(activeEid,{
        title:fields.title||meta.title||'',
        artist:fields.artist||meta.artist||'',
        metadata:{...meta,albumArt:meta.albumArt&&!meta.albumArt.startsWith('[stored]')?'[stored]':meta.albumArt},
        labelFields:{...fields},
        labelSettings:{...settings},
        artState:{...artState},
        studioSubTab,
        classCode:fields.classCode||'',
        credits:[...credits],
      });
      setAutoSaving(true);
      setTimeout(()=>setAutoSaving(false),1200);
    }catch(err){console.warn('Auto-save failed:',err);}
  };
  useEffect(()=>{
    if(!appTheme.playerAutoSave||!activeEid)return;
    const ms=(appTheme.playerAutoSaveInterval||60)*1000;
    const id=setInterval(()=>saveRef.current?.(),ms);
    return()=>clearInterval(id);
  },[appTheme.playerAutoSave,appTheme.playerAutoSaveInterval,activeEid]);

  // ── DISK AUTO-SAVE: ref always carries live rootDir, profiles, entries — no stale closures
  // We pass filteredEntries-style sorted arrays so _syncEntry gets correct sort indices per profile.
  // getSortedEntriesForDisk: returns all entries sorted by profile in UI display order.
  const getSortedEntriesForDisk=useCallback(()=>{
    // For each profile, apply the same manual order the UI uses, then concatenate
    const result=[];
    profiles.forEach(p=>{
      const profEntries=entries.filter(e=>e.profileId===p.id);
      const order=entryManualOrder[p.id]||[];
      const sorted=[...profEntries].sort((a,b)=>{
        const ai=order.indexOf(a.id),bi=order.indexOf(b.id);
        if(ai===-1&&bi===-1)return(b.updated||'').localeCompare(a.updated||'');
        if(ai===-1)return 1;if(bi===-1)return -1;
        return ai-bi;
      });
      result.push(...sorted);
    });
    return result;
  },[profiles,entries,entryManualOrder]);

  // updateEntryDiskName: stamps the new diskFolderName back onto an entry after a sync
  const updateEntryDiskName=useCallback((id,diskFolderName)=>{
    setEntriesRaw(es=>{
      const ns=es.map(e=>e.id===id?{...e,diskFolderName}:e);
      saveLS('tl_entries',ns);return ns;
    });
  },[]);

  diskSaveAllRef.current=()=>saveAll(rootDirRef.current,profiles,getSortedEntriesForDisk(),updateEntryDiskName);
  useEffect(()=>{
    if(!rootDir)return;
    const ms=(appTheme.diskSaveInterval||120)*1000;
    const id=setInterval(()=>diskSaveAllRef.current?.(),ms);
    return()=>clearInterval(id);
  },[rootDir,appTheme.diskSaveInterval]);


  const [fields,setFieldsRaw]=useState(()=>loadLS('tl_fields',DEFAULT_FIELDS));
  const [settings,setSettingsRaw]=useState(()=>loadLS('tl_settings',DEFAULT_SETTINGS));
  // setS and setF are declared below after meta/credits (they need scheduleMetaSnap and refs)
  const setFields=nf=>{setFieldsRaw(nf);saveLS('tl_fields',nf);};
  // ── STUDIO state
  const [studioSubTab,setStudioSubTab]=useState(()=>loadLS('tl_studio_sub','label'));
  const [artState,setArtState]=useState(()=>loadLS('tl_art_state',DEFAULT_ART_STATE));
  const setArt=useCallback(upd=>setArtState(s=>{const ns=typeof upd==='function'?upd(s):{...s,...upd};saveLS('tl_art_state',ns);return ns;}),[]);
  const [panelTab,setPanelTab]=useState('content');
  const [showBatch,setShowBatch]=useState(false);
  const [metaSection,setMetaSection]=useState('core');
  const [metaPanelDragOver,setMetaPanelDragOver]=useState(false);
  // ── METADATA — key fix: useCallback prevents remount by keeping setter reference stable
  const [meta,setMetaRaw]=useState(()=>loadLS('tl_metadata',DEFAULT_METADATA));
  // History-aware setMeta: schedules a debounced snapshot after each change
  const setMeta=useCallback((k,v)=>setMetaRaw(m=>{
    const nm={...m,[k]:v};saveLS('tl_metadata',nm);
    // Schedule snapshot using latest fields/settings/credits via refs (avoids stale closures)
    scheduleMetaSnap(nm,fieldsRef.current,settingsRef.current,creditsRef.current,artStateRef.current);
    return nm;
  }),[scheduleMetaSnap]);
  const setMetaObj=useCallback(obj=>setMetaRaw(m=>{const nm={...m,...obj};saveLS('tl_metadata',nm);return nm;}),[]);
  const resetMeta=()=>{
    pushMetaSnapNow(meta,fields,settings,credits,artState);
    setMetaRaw(DEFAULT_METADATA);saveLS('tl_metadata',DEFAULT_METADATA);
  };
  const [credits,setCreditsRaw]=useState(()=>loadLS('tl_credits',[]));
  const setCredits=cs=>{
    scheduleMetaSnap(meta,fields,settings,cs,artState);
    setCreditsRaw(cs);saveLS('tl_credits',cs);
  };

  // Always-current refs so history snapshot callbacks can read latest values without stale closures
  const fieldsRef=useRef(fields);
  const settingsRef=useRef(settings);
  const creditsRef=useRef(credits);
  const metaRef=useRef(meta);
  const artStateRef=useRef(artState);
  useEffect(()=>{fieldsRef.current=fields;},[fields]);
  useEffect(()=>{settingsRef.current=settings;},[settings]);
  useEffect(()=>{creditsRef.current=credits;},[credits]);
  useEffect(()=>{metaRef.current=meta;},[meta]);
  useEffect(()=>{artStateRef.current=artState;},[artState]);

  // Override setF and setS to also schedule meta snapshots
  const setFWithHistory=(k,v)=>{
    setFieldsRaw(f=>{const nf={...f,[k]:v};saveLS('tl_fields',nf);
      scheduleMetaSnap(metaRef.current,nf,settingsRef.current,creditsRef.current,artStateRef.current);
      return nf;});
  };
  const setSWithHistory=useCallback(upd=>setSettingsRaw(s=>{
    const ns=typeof upd==='function'?upd(s):{...s,...upd};saveLS('tl_settings',ns);
    scheduleMetaSnap(metaRef.current,fieldsRef.current,ns,creditsRef.current,artStateRef.current);
    return ns;
  }),[scheduleMetaSnap]);

  // Expose as setF / setS so all existing call sites work unchanged
  const setF=setFWithHistory;
  const setS=setSWithHistory;

  // ── ONE-SHOT SEED: populate both history stacks with real app state on first mount.
  // This replaces the null placeholder so cursor=0 always holds a valid restore point.
  // suppressCatalogSnap/suppressMetaSnap guards prevent the push helpers from firing
  // during undo/redo restores, but they're false here so the push goes through cleanly.
  const historiesSeededRef=useRef(false);
  useEffect(()=>{
    if(historiesSeededRef.current)return;
    historiesSeededRef.current=true;
    // Seed catalog history with real current state
    catalogHistory.push({
      entries:entries.map(e=>({...e,albumArtThumb:undefined})),
      profiles:[...profiles],
      profileOrder:[...profileOrder],
      entryManualOrder:{...entryManualOrder},
    });
    // Seed meta history with real current state
    metaHistory.push({
      meta:{...meta,albumArt:meta?.albumArt&&!meta.albumArt.startsWith('[stored]')?'[stored]':meta?.albumArt},
      fields:{...fields},
      settings:{...settings},
      credits:[...(credits||[])],
      artState:artState?JSON.parse(JSON.stringify(artState)):null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);// intentionally [] — runs once after first render when all state is initialised (debounced 1.5s)
  const metaAutoSaveTimer=useRef();
  useEffect(()=>{
    if(!activeEid)return;
    clearTimeout(metaAutoSaveTimer.current);
    metaAutoSaveTimer.current=setTimeout(()=>{
      updateEntry(activeEid,{
        title:meta.title||'',
        artist:meta.artist||'',
        metadata:{...meta,albumArt:meta.albumArt&&!meta.albumArt.startsWith('[stored]')?'[stored]':meta.albumArt},
      });
    },1500);
    return()=>clearTimeout(metaAutoSaveTimer.current);
  },[meta,activeEid]);

  // ── AUDIO
  const [audioFile,setAudioFile]=useState(null);
  const [audioObjectUrl,setAudioObjectUrl]=useState(null);
  const [lufsAnalyzing,setLufsAnalyzing]=useState(false);
  const audioRef=useRef();
  const audioElRef=useRef();
  // Tracks the live object URL so we can revoke it before creating a new one (memory-leak guard)
  const _activeObjectUrl=useRef(null);
  // Analysis abort guard — incremented each time analysis starts.
  // Each async analysis captures its generation at start; if generation has
  // changed by the time it completes, the result is stale and discarded.
  // This prevents overlapping recalculate calls from racing each other.
  const _analysisGenRef=useRef(0);
  const _audioCtxRef=useRef(null);
  const [analyserNode,setAnalyserNode]=useState(null);

  // ── DB BOOT + UNMOUNT CLEANUP
  useEffect(()=>{
    initDB().catch(err=>console.warn('[TrackLab] IndexedDB init failed:',err));
    return()=>{if(_activeObjectUrl.current)URL.revokeObjectURL(_activeObjectUrl.current);};
  },[]);

  // ── LIVE EQ METER — wire AudioContext + AnalyserNode to the shared <audio> element
  // Ref assignment for DOM nodes happens during commit (before effects), so
  // audioElRef.current is populated by the time this [] effect fires.
  useEffect(()=>{
    const el=audioElRef.current;if(!el||_audioCtxRef.current)return;
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const analyser=ctx.createAnalyser();analyser.fftSize=256;
    const source=ctx.createMediaElementSource(el);
    source.connect(analyser);analyser.connect(ctx.destination);
    _audioCtxRef.current=ctx;setAnalyserNode(analyser);
    // Browsers suspend AudioContext until a user gesture — resume on first play
    const resume=()=>{if(ctx.state==='suspended')ctx.resume();};
    el.addEventListener('play',resume);
    return()=>el.removeEventListener('play',resume);
  },[]);

  // ── App-level playing state — mirrors the audioElRef element so any component can read it
  const [playing,setPlaying]=useState(false);
  const [playingEid,setPlayingEid]=useState(null); // which entry the audio element is actually playing
  // Always-current refs so the ended handler (in a [] effect) can read fresh state
  const playingEidRef=useRef(null);
  const entriesRef=useRef([]);
  const activePidRef=useRef(null);
  useEffect(()=>{playingEidRef.current=playingEid;},[playingEid]);
  useEffect(()=>{entriesRef.current=entries;},[entries]);
  useEffect(()=>{activePidRef.current=activePid;},[activePid]);

  useEffect(()=>{
    const el=audioElRef.current;if(!el)return;
    const onPlay=()=>setPlaying(true);
    const onPause=()=>setPlaying(false);
    const onEnd=async()=>{
      setPlaying(false);
      // Auto-advance: find the next entry in the current profile list
      const pid=activePidRef.current;
      const allEntries=entriesRef.current;
      const profList=allEntries
        .filter(e=>e.profileId===pid)
        .sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
      const curId=playingEidRef.current;
      const idx=profList.findIndex(e=>e.id===curId);
      if(idx===-1||idx>=profList.length-1)return; // no next track
      const next=profList[idx+1];
      // Load it and play
      await loadEntryRef.current(next);
      setPlayingEid(next.id);
      requestAnimationFrame(()=>requestAnimationFrame(()=>audioElRef.current?.play()));
    };
    el.addEventListener('play',onPlay);el.addEventListener('pause',onPause);el.addEventListener('ended',onEnd);
    return()=>{el.removeEventListener('play',onPlay);el.removeEventListener('pause',onPause);el.removeEventListener('ended',onEnd);};
  },[]); // audioElRef is stable — refs bypass stale closure

  // ── KEYBOARD SHORTCUTS: Space=play/pause, ←=−10s, →=+10s (ignored when typing)
  // Undo/redo (Ctrl+Z / Ctrl+Shift+Z) work globally but are context-aware:
  // archive tab → catalog history, all other tabs → meta history.
  useEffect(()=>{
    const onKey=e=>{
      // Undo / Redo — works even when not in an input
      const isUndo=(e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey;
      const isRedo=(e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey));
      if(isUndo||isRedo){
        // Let the browser handle native text-field undo inside inputs/textareas
        if(['INPUT','TEXTAREA'].includes(e.target.tagName))return;
        e.preventDefault();
        const isCatalogTab=tab==='archive';
        if(isUndo){isCatalogTab?doCatalogUndo():doMetaUndo();}
        else{isCatalogTab?doCatalogRedo():doMetaRedo();}
        return;
      }
      if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
      const el=audioElRef.current;if(!el||!audioObjectUrl)return;
      if(e.code==='Space'){e.preventDefault();playing?el.pause():el.play();}
      else if(e.code==='ArrowRight'){e.preventDefault();el.currentTime=Math.min(el.duration||0,el.currentTime+10);}
      else if(e.code==='ArrowLeft'){e.preventDefault();el.currentTime=Math.max(0,el.currentTime-10);}
    };
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[playing,audioObjectUrl,tab,doCatalogUndo,doCatalogRedo,doMetaUndo,doMetaRedo]);

  // ── Centralised URL setter: always revokes the previous blob URL before setting the next
  const _setAudioUrl=url=>{
    if(_activeObjectUrl.current)URL.revokeObjectURL(_activeObjectUrl.current);
    _activeObjectUrl.current=url;
    setAudioObjectUrl(url);
  };

  // ── Full Audio Analysis — single-pass, pure JS, ITU-R BS.1770-4 / EBU R128 ──
  // Returns: { lufs, lra, samplePeak, crestFactor, dcOffset }
  //
  // SINGLE PASS DESIGN:
  //   For each channel, one loop advances the K-weighting biquad chain on every
  //   sample (preserving filter phase) and simultaneously accumulates:
  //     • K-weighted MS per 3-second block       → LUFS + LRA
  //     • Raw sum-of-squares                     → RMS → Crest Factor
  //     • Running max |sample|                   → Sample Peak
  //     • Running sum of raw samples             → DC Offset
  //   LRA needs a second pass over the block array (O(seconds/3)) — trivially cheap.
  //
  // K-weighted accumulator strides every 4th sample (±0.3 dB). Raw stats are
  // full-rate for maximum accuracy on peak and DC.
  // ── Full Audio Analysis — ITU-R BS.1770-4 / EBU R128 ──────────────────────
  // Uses OfflineAudioContext to run K-weighting filters natively (audio engine,
  // not JS), then computes gating + stats on the resulting buffer.
  // This is 5–10x faster than the pure-JS biquad loop for typical track lengths.
  const performFullAudioAnalysis=async audioBuffer=>{
    try{
      const sr=audioBuffer.sampleRate;
      const numCh=audioBuffer.numberOfChannels;
      const len=audioBuffer.length;

      // Yield helper — lets browser paint/respond between heavy async stages.
      // Without this, sequential OfflineAudioContext renders + per-sample loops
      // on long tracks block the main thread long enough to crash the audio engine.
      const yieldFrame=()=>new Promise(r=>setTimeout(r,0));

      // ── Step 1: K-weighting OfflineAudioContext ───────────────────────────────
      // Cap to 60 seconds — LUFS is stable after 60s, and rendering a full 4-min
      // stereo track in one shot creates a massive object that stalls the engine.
      const MAX_LUFS_LEN=Math.min(len,sr*60);
      const offCtx=new OfflineAudioContext(numCh,MAX_LUFS_LEN,sr);
      const src=offCtx.createBufferSource();
      src.buffer=audioBuffer;
      const hs=offCtx.createBiquadFilter();
      hs.type='highshelf';hs.frequency.value=1500;hs.gain.value=4;
      const hp=offCtx.createBiquadFilter();
      hp.type='highpass';hp.frequency.value=38;hp.Q.value=0.5;
      src.connect(hs);hs.connect(hp);hp.connect(offCtx.destination);
      src.start(0);
      const kwBuf=await offCtx.startRendering();

      await yieldFrame(); // breathe after first heavy render

      // ── Step 2: gating, peak, RMS, DC ────────────────────────────────────────
      const kwLen=kwBuf.length;
      const BLOCK_SAMPLES=Math.round(3*sr);
      const numBlocks=Math.ceil(kwLen/BLOCK_SAMPLES);
      const blockKwSums=new Float64Array(numBlocks);
      let globalPeak=0,globalSumSq=0,globalDcSum=0;
      for(let c=0;c<numCh;c++){
        const kw=kwBuf.getChannelData(c);
        const raw=audioBuffer.getChannelData(c);
        for(let i=0;i<len;i++){
          const s=raw[i];
          const absS=s<0?-s:s;
          if(absS>globalPeak)globalPeak=absS;
          globalSumSq+=s*s;
          globalDcSum+=s;
          if(i<kwLen){const b=Math.floor(i/BLOCK_SAMPLES);blockKwSums[b]+=kw[i]*kw[i];}
        }
      }
      const samplesPerBlock=BLOCK_SAMPLES*numCh;
      for(let b=0;b<numBlocks;b++)blockKwSums[b]/=samplesPerBlock;
      const globalN=len*numCh;

      await yieldFrame(); // breathe after per-sample JS loop

      // ── Integrated LUFS — EBU R128 two-pass gating ───────────────────────────
      const ABS_GATE_LIN=Math.pow(10,(-70+0.691)/10);
      let p1Sum=0,p1Count=0;
      for(let b=0;b<numBlocks;b++){if(blockKwSums[b]>ABS_GATE_LIN){p1Sum+=blockKwSums[b];p1Count++;}}
      if(p1Count===0)return null;
      const p1Mean=p1Sum/p1Count;
      const REL_GATE_LIN=p1Mean*Math.pow(10,-10/10);
      let p2Sum=0,p2Count=0;
      for(let b=0;b<numBlocks;b++){if(blockKwSums[b]>ABS_GATE_LIN&&blockKwSums[b]>REL_GATE_LIN){p2Sum+=blockKwSums[b];p2Count++;}}
      if(p2Count===0)return null;
      const lufs=Math.round((-0.691+10*Math.log10(p2Sum/p2Count))*10)/10;

      // ── LRA ───────────────────────────────────────────────────────────────────
      const LRA_REL=p1Mean*Math.pow(10,-20/10);
      const blockLoudness=[];
      for(let b=0;b<numBlocks;b++){
        if(blockKwSums[b]>ABS_GATE_LIN&&blockKwSums[b]>LRA_REL)
          blockLoudness.push(-0.691+10*Math.log10(blockKwSums[b]));
      }
      let lra=0;
      if(blockLoudness.length>=2){
        blockLoudness.sort((a,b)=>a-b);
        const n=blockLoudness.length;
        lra=Math.round((blockLoudness[Math.floor(n*0.95)]-blockLoudness[Math.floor(n*0.10)])*10)/10;
      }

      // ── Peak, RMS, Crest, DC ──────────────────────────────────────────────────
      const samplePeakDb=globalPeak>0?Math.round(20*Math.log10(globalPeak)*10)/10:null;
      const rms=globalN>0?Math.sqrt(globalSumSq/globalN):0;
      const crestFactor=(rms>0&&globalPeak>0)?Math.round(20*Math.log10(globalPeak/rms)*10)/10:0;
      const dcMean=globalN>0?globalDcSum/globalN:0;
      const dcOffset=globalPeak>0?Math.round((Math.abs(dcMean)/globalPeak)*1000)/10:0;

      // ── Stereo Consistency — capped at 120 seconds of windows ─────────────────
      let stereoCorrelation='N/A (mono)';
      let aiProbabilityScore=0;
      if(numCh>=2){
        const chL=audioBuffer.getChannelData(0);
        const chR=audioBuffer.getChannelData(1);
        const STEREO_WIN=Math.round(sr);
        const numWins=Math.min(Math.floor(len/STEREO_WIN),120);
        const corrPerWindow=new Float32Array(numWins);
        for(let w=0;w<numWins;w++){
          const start=w*STEREO_WIN;
          let sumLR=0,sumLL=0,sumRR=0;
          for(let i=start;i<start+STEREO_WIN;i++){sumLR+=chL[i]*chR[i];sumLL+=chL[i]*chL[i];sumRR+=chR[i]*chR[i];}
          const denom=Math.sqrt(sumLL*sumRR);
          corrPerWindow[w]=denom>0?(sumLR/denom):1;
        }
        let corrSum=0;
        for(let w=0;w<numWins;w++)corrSum+=corrPerWindow[w];
        const corrMean=numWins>0?corrSum/numWins:1;
        let corrVarSum=0;
        for(let w=0;w<numWins;w++){const d=corrPerWindow[w]-corrMean;corrVarSum+=d*d;}
        const corrStdDev=Math.sqrt(numWins>1?corrVarSum/(numWins-1):0);
        const corrMeanR=Math.round(corrMean*100)/100;
        const corrStdDevR=Math.round(corrStdDev*1000)/1000;
        const isStatic=(corrStdDev<0.05&&corrMean>0.85);
        const isBlurred=(Math.abs(corrMean)<0.15&&corrStdDev<0.08);
        let stereoLabel;
        if(isStatic)stereoLabel='Static';
        else if(isBlurred)stereoLabel='Blurred';
        else if(corrMean>0.7)stereoLabel='Wide-Mono';
        else if(corrMean>0.3)stereoLabel='Natural';
        else if(corrMean>-0.1)stereoLabel='Wide';
        else stereoLabel='Out-of-Phase';
        stereoCorrelation=corrMeanR+' / \u03c3 '+corrStdDevR+' \u2014 '+stereoLabel;
        if(isStatic)aiProbabilityScore+=45;
        if(isBlurred)aiProbabilityScore+=35;
        if(isStatic&&corrMean>0.97)aiProbabilityScore+=15;
      }

      await yieldFrame(); // breathe before AI scan OAC

      // ── AI artifact scan ──────────────────────────────────────────────────────
      const aiScan=await detectAiArtifacts(audioBuffer);
      if(aiScan&&aiScan.aiArtifact&&aiScan.aiArtifact.startsWith('\u26a0'))aiProbabilityScore+=30;
      const aiProbabilityFinal=Math.min(99,aiProbabilityScore);
      let probLabel;
      if(aiProbabilityFinal===0)probLabel='\u2713 Low (0%)';
      else if(aiProbabilityFinal<25)probLabel='Low ('+aiProbabilityFinal+'%)';
      else if(aiProbabilityFinal<50)probLabel='\u25c6 Moderate ('+aiProbabilityFinal+'%)';
      else if(aiProbabilityFinal<75)probLabel='\u26a0 Elevated ('+aiProbabilityFinal+'%)';
      else probLabel='\u26d4 High ('+aiProbabilityFinal+'%)';

      await yieldFrame(); // breathe before 6x spectral OACs

      // ── Spectral profile ──────────────────────────────────────────────────────
      const spectralResult=await generateSpectralProfile(audioBuffer);

      return{
        lufs:String(lufs),lra:String(lra),
        samplePeak:samplePeakDb!==null?`${samplePeakDb} dBFS`:'-\u221e dBFS',
        crestFactor:`${crestFactor} dB`,dcOffset:`${dcOffset}%`,
        stereoCorrelation,
        aiArtifact:aiScan?aiScan.aiArtifact:'',
        spectralCeiling:aiScan?aiScan.spectralCeiling:'',
        aiProbability:probLabel,
        spectralProfile:spectralResult?spectralResult.bands:null,
      };
    }catch(e){console.warn('Audio analysis error:',e);return null;}
  };

  // ── AI Artifact Scan — Spectral Ceiling & Neural Compression Detection ──────
  // Uses an OfflineAudioContext + AnalyserNode to snapshot frequency-domain energy,
  // then detects a hard 40dB+ spectral drop above 8kHz (neural codec cliff).
  const detectAiArtifacts=async audioBuffer=>{
    try{
      const sr=audioBuffer.sampleRate;
      if(sr<34000) return{aiArtifact:'N/A (low SR)',spectralCeiling:'N/A'};

      const FFT_SIZE=16384;
      const fftHalf=FFT_SIZE/2;

      // Downmix to mono for speed — spectral shape is channel-agnostic
      const offCtx=new OfflineAudioContext(1,Math.min(audioBuffer.length,sr*10),sr);
      const src=offCtx.createBufferSource();

      if(audioBuffer.numberOfChannels>1){
        const mono=offCtx.createBuffer(1,audioBuffer.length,sr);
        const out=mono.getChannelData(0);
        const scale=1/audioBuffer.numberOfChannels;
        for(let c=0;c<audioBuffer.numberOfChannels;c++){
          const ch=audioBuffer.getChannelData(c);
          for(let i=0;i<audioBuffer.length;i++) out[i]+=ch[i]*scale;
        }
        src.buffer=mono;
      }else{
        src.buffer=audioBuffer;
      }

      const analyser=offCtx.createAnalyser();
      analyser.fftSize=FFT_SIZE;
      analyser.smoothingTimeConstant=0;
      src.connect(analyser);
      analyser.connect(offCtx.destination);
      src.start(0);
      await offCtx.startRendering();

      const freqData=new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);

      // Convert analyser Uint8 magnitude to dBFS (analyser default range -100 to 0 dBFS)
      const toDB=function(byte){return byte===0?-100:(byte/255)*100-100;};
      const binHz=sr/FFT_SIZE;
      const freqToBin=function(hz){return Math.min(Math.round(hz/binHz),fftHalf-1);};

      const bandEnergy=function(loHz,hiHz){
        const lo=freqToBin(loHz);
        const hi=freqToBin(hiHz);
        if(hi<=lo) return -100;
        let sum=0;
        for(let b=lo;b<=hi;b++) sum+=toDB(freqData[b]);
        return sum/(hi-lo+1);
      };

      // 1. Spectral Ceiling — average energy 16kHz → Nyquist
      const nyquist=sr/2;
      const ceilingDb=bandEnergy(16000,nyquist);
      const ceilingStr=ceilingDb.toFixed(1)+' dBFS';

      // 2. Neural Compression — scan for 40dB+ cliff from 8kHz upward in 500Hz bands
      const BAND_W=500;
      let artifactFreq=null;
      let prevEnergy=bandEnergy(8000,8000+BAND_W);
      for(let f=8000+BAND_W;f<nyquist-BAND_W;f+=BAND_W){
        const curEnergy=bandEnergy(f,f+BAND_W);
        if(prevEnergy-curEnergy>=40){artifactFreq=f;break;}
        prevEnergy=curEnergy;
      }

      let aiArtifact;
      if(artifactFreq!==null){
        aiArtifact='\u26a0 Neural Compression @ '+(artifactFreq/1000).toFixed(1)+'kHz';
      }else if(ceilingDb<-80){
        aiArtifact='\u26a0 Spectral Ceiling Detected (>16kHz absent)';
      }else{
        aiArtifact='\u2713 No Artifact Detected';
      }

      return{aiArtifact,spectralCeiling:ceilingStr};
    }catch(e){
      console.warn('AI artifact scan failed:',e);
      return{aiArtifact:'Scan Error',spectralCeiling:'\u2013'};
    }
  };

  const loadAudioFile=async file=>{
    // ── Full reset: clear ALL metadata fields so no ghost data from previous track ──
    // Analysis fields + all tag fields. Only persists after jsmediatags fills what it finds.
    setMetaRaw(m=>{
      const nm={...DEFAULT_METADATA,lufs:'',lra:'',samplePeak:'',crestFactor:'',dcOffset:'',
        stereoCorrelation:'',aiArtifact:'',spectralCeiling:'',aiProbability:'',
        // preserve artwork and notes only if we already have an active entry loaded
        albumArt:'',notes:''};
      saveLS('tl_metadata',nm);
      return nm;
    });
    const buf=await file.arrayBuffer();
    const key=activeEid?`audio_${activeEid}`:'audio_scratch';
    await IDB.set(key,buf,'assets'); // write to canonical 'assets' store
    const af={name:file.name,type:file.type,size:file.size,key};
    setAudioFile(af);
    if(activeEid)updateEntry(activeEid,{hasAudio:true,audioFilename:file.name,audioType:file.type});
    // Revoke previous URL before creating the new one — prevents memory leaks
    const blob=new Blob([buf],{type:file.type});
    _setAudioUrl(URL.createObjectURL(blob));
    setPlayingEid(activeEid||null);
    // ── Write audio to disk library immediately (non-blocking)
    if(activeEid&&rootDir){
      const currentEntry=entries.find(e=>e.id===activeEid);
      if(currentEntry){
        const profEntries=getSortedEntriesForDisk().filter(e=>e.profileId===currentEntry.profileId);
        const sortIndex=profEntries.findIndex(e=>e.id===activeEid);
        saveEntryNow(rootDirRef.current,profiles,{...currentEntry,hasAudio:true,audioFilename:file.name,audioType:file.type},sortIndex>=0?sortIndex:0)
          .then(newFolderName=>{if(newFolderName)updateEntryDiskName(activeEid,newFolderName);})
          .catch(()=>{});
      }
    }
    // ── Full audio analysis (non-blocking via setTimeout yield inside function) ──
    _analysisGenRef.current += 1;
    var thisGen = _analysisGenRef.current;
    setLufsAnalyzing(true);
    try{
      const audioContext=new (window.AudioContext||window.webkitAudioContext)();
      const arrayBuffer=await file.arrayBuffer(); // fresh read — decodeAudioData detaches it
      const decoded=await audioContext.decodeAudioData(arrayBuffer);
      audioContext.close();
      const analysis=await performFullAudioAnalysis(decoded);
      // Discard result if a newer analysis has started since this one began
      if(analysis && _analysisGenRef.current === thisGen){
        const date=new Date().toISOString().slice(0,10);
        const stamp=`[ANALYSIS] ${file.name} · ${date} | LUFS: ${analysis.lufs} · LRA: ${analysis.lra} LU · Peak: ${analysis.samplePeak} · Crest: ${analysis.crestFactor} · DC: ${analysis.dcOffset}`;
        setMetaRaw(m=>{
          const existing=m.notes||'';
          // Replace previous stamp for this file rather than stack duplicates
          const filtered=existing.split('\n').filter(l=>!l.includes(`] ${file.name} \u00b7`)).join('\n');
          const newNotes=stamp+(filtered?'\n'+filtered:'');
          const nm={...m,...analysis,notes:newNotes};
          saveLS('tl_metadata',nm);
          return nm;
        });
      }
    }catch(e){console.warn('Audio analysis failed:',e);}
    finally{if(_analysisGenRef.current===thisGen)setLufsAnalyzing(false);}
    // Read tags if jsmediatags is available
    if(typeof jsmediatags!=='undefined'){
      jsmediatags.read(file,{
        onSuccess(tag){
          const t=tag.tags,ch={};
          if(t.title&&!meta.title)ch.title=t.title;
          if(t.artist&&!meta.artist)ch.artist=t.artist;
          if(t.album&&!meta.album)ch.album=t.album;
          if(t.year&&!meta.year)ch.year=String(t.year);
          if(t.genre&&!meta.genre)ch.genre=t.genre;
          if(t.track)ch.trackNum=String(t.track).split('/')[0];
          if(t.comment?.text&&!meta.comment)ch.comment=t.comment.text;
          if(Object.keys(ch).length)setMetaObj(ch);
          if(t.picture){
            const bytes=new Uint8Array(t.picture.data);
            const b64=btoa(bytes.reduce((a,b)=>a+String.fromCharCode(b),''));
            setMetaObj({albumArt:`data:${t.picture.format};base64,${b64}`});
          }
        },onError(){}
      });
    }
  };

  const recalculateAnalysis=async()=>{
    if(!audioFile?.key||lufsAnalyzing)return;
    _analysisGenRef.current += 1;
    var thisGen = _analysisGenRef.current;
    setLufsAnalyzing(true);
    setMetaRaw(m=>{const nm={...m,lufs:'',lra:'',samplePeak:'',crestFactor:'',dcOffset:'',stereoCorrelation:'',aiArtifact:'',spectralCeiling:'',aiProbability:''};saveLS('tl_metadata',nm);return nm;});
    try{
      const buf=await IDB.get(audioFile.key,'assets');
      if(!buf)throw new Error('Audio not in IDB');
      const audioContext=new (window.AudioContext||window.webkitAudioContext)();
      const decoded=await audioContext.decodeAudioData(buf.slice(0));
      audioContext.close();
      const analysis=await performFullAudioAnalysis(decoded);
      if(analysis && _analysisGenRef.current === thisGen){
        const date=new Date().toISOString().slice(0,10);
        const name=audioFile.name;
        const stamp=`[ANALYSIS] ${name} · ${date} | LUFS: ${analysis.lufs} · LRA: ${analysis.lra} LU · Peak: ${analysis.samplePeak} · Crest: ${analysis.crestFactor} · DC: ${analysis.dcOffset}`;
        setMetaRaw(m=>{
          const filtered=(m.notes||'').split('\n').filter(l=>!l.includes(`] ${name} \u00b7`)).join('\n');
          const nm={...m,...analysis,notes:stamp+(filtered?'\n'+filtered:'')};
          saveLS('tl_metadata',nm);return nm;
        });
      }
    }catch(e){console.warn('Recalculate failed:',e);}
    finally{if(_analysisGenRef.current===thisGen)setLufsAnalyzing(false);}
  };

  const exportTaggedAudio=async()=>{
    const key=activeEid?`audio_${activeEid}`:'audio_scratch';
    const buf=await IDB.get(key);
    if(!buf){alert('No audio file loaded. Upload an audio file in Tags → Audio File first.');return;}
    if(typeof ID3Writer==='undefined'){alert('ID3 writer not loaded. Please check your internet connection.');return;}
    try{
      const writer=new ID3Writer(buf);
      if(meta.title)writer.setFrame('TIT2',meta.title);
      if(meta.artist)writer.setFrame('TPE1',[meta.artist]);
      if(meta.albumArtist)writer.setFrame('TPE2',meta.albumArtist);
      if(meta.album)writer.setFrame('TALB',meta.album);
      if(meta.year)writer.setFrame('TYER',meta.year);
      if(meta.genre)writer.setFrame('TCON',[meta.genre]);
      if(meta.trackNum)writer.setFrame('TRCK',meta.trackTotal?`${meta.trackNum}/${meta.trackTotal}`:meta.trackNum);
      if(meta.discNum)writer.setFrame('TPOS',meta.discTotal?`${meta.discNum}/${meta.discTotal}`:meta.discNum);
      if(meta.bpm)writer.setFrame('TBPM',+meta.bpm||0);
      if(meta.isrc)writer.setFrame('TSRC',meta.isrc.replace(/-/g,''));
      if(meta.composer)writer.setFrame('TCOM',[meta.composer]);
      if(meta.publisher)writer.setFrame('TPUB',meta.publisher);
      if(meta.copyright)writer.setFrame('TCOP',meta.copyright);
      if(meta.language)writer.setFrame('TLAN',meta.language);
      if(meta.comment)writer.setFrame('COMM',{description:'',text:meta.comment});
      if(meta.upc)writer.setFrame('TXXX',{description:'UPC',value:meta.upc});
      if(meta.iswc)writer.setFrame('TXXX',{description:'ISWC',value:meta.iswc});
      if(meta.mood)writer.setFrame('TXXX',{description:'MOOD',value:meta.mood});
      if(meta.producer)writer.setFrame('TXXX',{description:'PRODUCER',value:meta.producer});
      if(meta.albumArt&&!meta.albumArt.startsWith('[stored]')){
        const res=await fetch(meta.albumArt);const artBuf=await res.arrayBuffer();
        writer.setFrame('APIC',{type:3,data:artBuf,description:'Cover',useUnicodeEncoding:false});
      }
      writer.addTag();
      const blob=writer.getBlob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      const base=audioFile?.name||`${meta.title||'track'}.mp3`;
      const dot=base.lastIndexOf('.');
      a.download=dot>0?`${base.slice(0,dot)}-tagged${base.slice(dot)}`:`${base}-tagged.mp3`;
      a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    }catch(err){console.error(err);alert('Tag embedding failed. MP3 (ID3v2) only. For FLAC/WAV/AIFF use a dedicated tagger (Metaflac, bwfmetaedit, etc).');}
  };

  // ── ALBUM ART
  const artRef=useRef();
  const loadAlbumArt=file=>{
    if(!file||!file.type.startsWith('image/'))return;
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image();img.onload=()=>{
        const sz=+meta.albumArtSize||3000;
        const c=document.createElement('canvas');c.width=sz;c.height=sz;
        const ctx=c.getContext('2d');
        const side=Math.min(img.width,img.height);
        const ox=(img.width-side)/2,oy=(img.height-side)/2;
        ctx.drawImage(img,ox,oy,side,side,0,0,sz,sz);
        const data=c.toDataURL('image/jpeg',0.92);
        setMetaObj({albumArt:data});
        if(activeEid){c.toBlob(async blob=>{const buf=await blob.arrayBuffer();await IDB.set(`art_${activeEid}`,buf);const thumb=c.toDataURL('image/jpeg',0.3);updateEntry(activeEid,{hasArt:true,albumArtThumb:thumb});});}
      };img.src=e.target.result;
    };r.readAsDataURL(file);
  };

  // ━━━━━━━━ LABEL TAB — ID3 AUTO-FILL ━━━━━━━━
  // Reads ID3 tags from any audio file and fills label fields + BPM meta row.
  // Non-destructive: only overwrites fields that are currently blank.
  const labelTagFileRef=useRef();
  // null | 'reading' | {found:{title,artist,bpm}, filled:{title,artist,bpm}} | {err:string}
  const [labelTagStatus,setLabelTagStatus]=useState(null);

  const readLabelTags=file=>{
    if(!file||typeof jsmediatags==='undefined'){setLabelTagStatus({err:'jsmediatags not available'});return;}
    setLabelTagStatus('reading');
    jsmediatags.read(file,{
      onSuccess(tag){
        const t=tag.tags;
        // Collect what the file actually has
        const found={
          title:t.title||'',
          artist:t.artist||'',
          // BPM may live in various frames; TBPM is standard
          bpm:t.TBPM?.data||t.bpm||''
        };
        // Track what we actually wrote (skip if field already has content)
        const filled={title:false,artist:false,bpm:false};
        if(found.title&&!fields.title){setF('title',found.title);filled.title=true;}
        if(found.artist&&!fields.artist){setF('artist',found.artist);filled.artist=true;}
        if(found.bpm){
          // Find the BPM meta row field (label match, case-insensitive) and fill if blank
          setS(s=>{
            const mf=(s.metaFields||[]).map(f=>{
              if(f.label.toUpperCase()==='BPM'&&!f.value){filled.bpm=true;return{...f,value:String(found.bpm)};}
              return f;
            });
            return{...s,metaFields:mf};
          });
          // Mark filled after the setS closes — check synchronously via current state
          if(!settings.metaFields?.find(f=>f.label.toUpperCase()==='BPM'&&f.value))filled.bpm=true;
        }
        setLabelTagStatus({found,filled});
      },
      onError(err){setLabelTagStatus({err:err.type||'Could not read tags — file may have no ID3 data'});}
    });
  };

  // ── CLASSIFY
  const [sel,setSel]=useState({digit1:'',digit2:'',digit3:'',digit4:''});
  const [genCode,setGenCode]=useState('');
  const [savedCodes,setSavedCodesRaw]=useState(()=>loadLS('tl_codes',[]));
  const setSavedCodes=cs=>{setSavedCodesRaw(cs);saveLS('tl_codes',cs);};
  const [copied,setCopied]=useState(false);
  const [showGuide,setShowGuide]=useState(false);
  const [decInput,setDecInput]=useState('');
  const [decResult,setDecResult]=useState(null);

  const buildCode=(ov={})=>{const v={...sel,...ov};const pick=(opts,key)=>{const ks=Object.keys(opts);return v[key]||(ks[Math.floor(Math.random()*ks.length)]);};return`${pick(CLS.digit1.options,'digit1')}${pick(CLS.digit2.options,'digit2')}${pick(CLS.digit3.options,'digit3')}.${pick(CLS.digit4.options,'digit4')}`;};
  const generateCode=()=>setGenCode(buildCode());
  const randomGenerate=()=>{setSel({digit1:'',digit2:'',digit3:'',digit4:''});setGenCode(buildCode({digit1:'',digit2:'',digit3:'',digit4:''}));};
  const decodeCode=()=>{
    const clean=decInput.trim().replace(/\s/g,'').toUpperCase();
    const m=clean.match(/^([0-9A-Z])([0-9A-Z])([0-9A-Z])\.([0-9A-Z])$/);
    if(!m){setDecResult({valid:false,error:'Expected: XXX.X (e.g. 142.7 or S3K.F)'});return;}
    const[,d1,d2,d3,d4]=m;
    setDecResult({valid:true,code:clean,full:getCodeDesc(clean),bd:[
      {p:'1',v:d1,cat:CLS.digit1.name,m:CLS.digit1.options[d1]||'Unknown'},
      {p:'2',v:d2,cat:CLS.digit2.name,m:CLS.digit2.options[d2]||'Unknown'},
      {p:'3',v:d3,cat:CLS.digit3.name,m:CLS.digit3.options[d3]||'Unknown'},
      {p:'4',v:d4,cat:CLS.digit4.name,m:CLS.digit4.options[d4]||'Unknown'},
    ]});
  };
  const saveCode=()=>{if(genCode&&!savedCodes.find(c=>c.code===genCode))setSavedCodes([...savedCodes,{code:genCode,desc:getCodeDesc(genCode),saved:todayStr()}]);};
  const sendToLabel=code=>{setF('classCode',code);setF('classDesc',getCodeDesc(code));setS({showClass:true});setTab('studio');setStudioSubTab('label');saveLS('tl_studio_sub','label');};
  const exportGuide=()=>{let g='TRACK LAB — CLASSIFICATION GUIDE\n'+'='.repeat(50)+'\n\n';Object.entries(CLS).forEach(([k,d])=>{g+=`Position ${k.replace('digit','')}: ${d.name}\n`+'─'.repeat(40)+'\n';Object.entries(d.options).forEach(([n,dd])=>g+=`  ${n.padEnd(3)} — ${dd}\n`);g+='\n';});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([g],{type:'text/plain'}));a.download='tracklab-classification-guide.txt';a.click();};

  // ── PRESETS
  const [presets,setPresetsRaw]=useState(()=>loadLS('tl_presets',[]));
  const setPresets=ps=>{setPresetsRaw(ps);saveLS('tl_presets',ps);};
  const [lastPid,setLastPid]=useState(()=>loadLS('tl_last_preset',null));

  // ── LABEL EXPORT
  const [exporting,setExporting]=useState(false);
  const [exportMsg,setExportMsg]=useState('');
  const exportLabel=async()=>{
    setExporting(true);setExportMsg('Rendering…');
    const wrap=document.createElement('div');wrap.style.cssText=`position:fixed;left:-99999px;top:0;width:${settings.labelW}px;overflow:visible;pointer-events:none;z-index:-1;`;
    document.body.appendChild(wrap);const el=document.createElement('div');wrap.appendChild(el);
    await new Promise(res=>ReactDOM.render(React.createElement(TrackLabel,{fields,settings}),el,res));
    await new Promise(r=>setTimeout(r,120));
    try{
      const sc=getColors(settings);
      const canvas=await html2canvas(el.firstChild||el,{scale:settings.exportScale,width:settings.labelW,height:settings.labelH,useCORS:true,allowTaint:true,backgroundColor:sc.bg||'#fff',logging:false});
      const fmt=settings.exportFormat,mime=fmt==='jpeg'?'image/jpeg':'image/png',ext=fmt==='jpeg'?'jpg':'png';
      const url=canvas.toDataURL(mime,fmt==='jpeg'?0.95:undefined);
      const slug=(fields.title||'track').replace(/\s+/g,'-').toLowerCase();
      const a=document.createElement('a');a.href=url;a.download=`label-${slug}.${ext}`;a.click();
      setExportMsg(`✓ ${canvas.width}×${canvas.height}px`);setTimeout(()=>setExportMsg(''),5000);
    }catch{setExportMsg('Export failed');}
    finally{ReactDOM.unmountComponentAtNode(el);document.body.removeChild(wrap);setExporting(false);}
  };

  // ── ARCHIVE EXPORTS
  const exportImportRef=useRef();
  const exportCSV=()=>{
    const pm=Object.fromEntries(profiles.map(p=>[p.id,p.name]));
    const cols=['ID','Profile','Title','Artist','Album','Year','Genre','BPM','Key','ISRC','UPC','Class Code','Status','Has Audio','Has Art','Credits','Created','Updated'];
    const rows=entries.map(e=>{
      const credStr=(e.credits||[]).map(c=>`${c.name||'—'} (${c.role}) ${parseFloat(c.split)||0}%`).join(' | ');
      return[e.id,pm[e.profileId]||'',e.title||'',e.artist||'',e.metadata?.album||'',e.metadata?.year||'',e.metadata?.genre||'',e.metadata?.bpm||'',e.metadata?.key||'',e.metadata?.isrc||'',e.metadata?.upc||'',e.classCode||'',e.status||'draft',e.hasAudio?'Yes':'No',e.hasArt?'Yes':'No',credStr,e.created||'',e.updated||''];
    });
    const csv=[cols,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`tracklab-${todayStr()}.csv`;a.click();
  };
  const exportJSON=()=>{
    const payload={app:'tracklab',version:VERSION,exportedAt:new Date().toISOString(),profiles,entries:entries.map(e=>({...e,albumArtThumb:undefined}))};
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download=`tracklab-backup-${todayStr()}.json`;a.click();
  };
  const importJSON=async file=>{
    try{
      const d=JSON.parse(await file.text());
      if(d.profiles)setProfiles([...profiles,...d.profiles.filter(p=>!profiles.find(x=>x.id===p.id))]);
      if(d.entries)setEntries([...entries,...d.entries.filter(e=>!entries.find(x=>x.id===e.id))]);
      alert(`✓ Imported ${d.profiles?.length||0} profiles, ${d.entries?.length||0} entries`);
    }catch{alert('Invalid backup file. Expecting Track Lab JSON format.');}
  };
  const exportZIP=async()=>{
    if(typeof JSZip==='undefined'){alert('JSZip not loaded');return;}
    setZipping(true);
    try{
      const zip=new JSZip();const pm=Object.fromEntries(profiles.map(p=>[p.id,p.name]));
      zip.file('_manifest.json',JSON.stringify({app:'tracklab',version:VERSION,exportedAt:new Date().toISOString(),profiles,totalEntries:entries.length},null,2));
      for(const e of entries){
        const folderName=`${pm[e.profileId]||'unknown'}/${(e.artist||'artist').replace(/[^a-z0-9]/gi,'_')}__${(e.title||e.id).replace(/[^a-z0-9]/gi,'_')}`;
        const f=zip.folder(folderName);
        f.file('metadata.json',JSON.stringify({...e,albumArtThumb:undefined},null,2));
        // Use STORE (no compression) for audio/art — they're already compressed formats
        if(e.hasAudio){try{const buf=await IDB.get(`audio_${e.id}`);if(buf)f.file(e.audioFilename||'audio.mp3',buf,{compression:'STORE'});}catch{}}
        if(e.hasArt){try{const buf=await IDB.get(`art_${e.id}`);if(buf)f.file('artwork.jpg',buf,{compression:'STORE'});}catch{}}
      }
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`tracklab-archive-${todayStr()}.zip`;a.click();
    }catch(err){console.error(err);alert('ZIP export failed: '+err.message);}
    finally{setZipping(false);}
  };

  // ── CSV IMPORT
  const csvImportRef=useRef();
  const importCSV=async file=>{
    if(!activePid){alert('Select a profile first before importing CSV entries.');return;}
    try{
      const text=await file.text();
      const lines=text.split(/\r?\n/).filter(Boolean);
      if(lines.length<2){alert('CSV must have a header row and at least one data row.');return;}
      // Simple CSV parser — handles quoted fields
      const parseRow=row=>{const out=[];let cur='',inQ=false;for(let i=0;i<row.length;i++){const ch=row[i];if(ch==='"'){if(inQ&&row[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(ch===','&&!inQ){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;};
      const headers=parseRow(lines[0]).map(h=>h.replace(/^"|"$/g,'').toLowerCase().replace(/\s+/g,''));
      const col=key=>headers.indexOf(key);
      const get=(row,key)=>{const i=col(key);return i>=0?(row[i]||'').replace(/^"|"$/g,''):'';};
      const newEntries=[];
      for(let i=1;i<lines.length;i++){
        const row=parseRow(lines[i]);
        if(!row.some(Boolean))continue;
        const title=get(row,'title')||`Imported ${i}`;
        const artist=get(row,'artist');
        const status=STATUS_OPT[get(row,'status')]?get(row,'status'):'draft';
        const classCode=get(row,'classcode')||get(row,'code')||'';
        const bpm=get(row,'bpm');const key=get(row,'key');const genre=get(row,'genre');
        const year=get(row,'year');const isrc=get(row,'isrc');const upc=get(row,'upc');
        const e={
          id:mkUid(),profileId:activePid,title,artist,created:todayStr(),updated:todayStr(),status,
          classCode,hasAudio:false,hasArt:false,audioFilename:'',audioType:'',albumArtThumb:null,
          metadata:{...DEFAULT_METADATA,title,artist,bpm,key,genre,year,isrc,upc},
          labelFields:{...DEFAULT_FIELDS,title,artist,classCode,isrc,upc},
          labelSettings:{...DEFAULT_SETTINGS},
        };
        newEntries.push(e);
      }
      if(!newEntries.length){alert('No valid rows found in CSV.');return;}
      setEntries([...entries,...newEntries]);
      alert(`✓ Imported ${newEntries.length} entr${newEntries.length===1?'y':'ies'} into "${profiles.find(p=>p.id===activePid)?.name||'selected profile'}"`);
    }catch(err){console.error(err);alert('CSV import failed: '+err.message);}
    finally{if(csvImportRef.current)csvImportRef.current.value='';}
  };

  // ── ARCHIVE LABEL EXPORT (renders off-screen)
  const [archiveLabelExport,setArchiveLabelExport]=useState(null); // {fields, settings, title}
  const archiveLabelRef=useRef();
  const [archiveLabelExporting,setArchiveLabelExporting]=useState(false);
  useEffect(()=>{
    if(!archiveLabelExport||!archiveLabelRef.current)return;
    const run=async()=>{
      setArchiveLabelExporting(true);
      await new Promise(r=>setTimeout(r,150));
      try{
        const el=archiveLabelRef.current.firstChild;
        if(!el)return;
        const sc=getColors(archiveLabelExport.settings);
        const canvas=await html2canvas(el,{scale:archiveLabelExport.settings.exportScale||2,width:archiveLabelExport.settings.labelW,height:archiveLabelExport.settings.labelH,useCORS:true,allowTaint:true,backgroundColor:sc.bg||'#fff',logging:false});
        const fmt=archiveLabelExport.settings.exportFormat||'png';
        const mime=fmt==='jpeg'?'image/jpeg':'image/png',ext=fmt==='jpeg'?'jpg':'png';
        const url=canvas.toDataURL(mime,fmt==='jpeg'?0.95:undefined);
        const slug=(archiveLabelExport.title||'track').replace(/\s+/g,'-').toLowerCase();
        const a=document.createElement('a');a.href=url;a.download=`label-${slug}.${ext}`;a.click();
      }catch(err){console.error('Archive label export:',err);alert('Label export failed.');}
      finally{setArchiveLabelExporting(false);setArchiveLabelExport(null);}
    };
    run();
  },[archiveLabelExport]);

  // ━━━━━━━━ BATCH LABEL EXPORT ━━━━━━━━
  const [batchIds,setBatchIds]=useState(new Set());
  const [batchScale,setBatchScale]=useState(2);
  const [batchRunning,setBatchRunning]=useState(false);
  // null while idle; {done,total,currentTitle} while running
  const [batchProgress,setBatchProgress]=useState(null);
  // [{id, title, ok, msg?}] — one row per processed entry
  const [batchLog,setBatchLog]=useState([]);
  const [batchPidFilter,setBatchPidFilter]=useState('all');

  // Entries visible in the batch checklist, filtered by profile
  const batchVisibleEntries=useMemo(()=>
    (batchPidFilter==='all'?entries:entries.filter(e=>e.profileId===batchPidFilter))
      .slice().sort((a,b)=>(b.updated||'').localeCompare(a.updated||''))
  ,[entries,batchPidFilter]);

  const toggleBatchId=id=>setBatchIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const batchSelectAll=()=>setBatchIds(new Set(batchVisibleEntries.map(e=>e.id)));
  const batchSelectNone=()=>setBatchIds(new Set());

  const batchExport=async()=>{
    if(!batchIds.size)return;
    if(typeof JSZip==='undefined'){alert('JSZip not loaded');return;}
    setBatchRunning(true);
    setBatchLog([]);
    const ids=[...batchIds];
    setBatchProgress({done:0,total:ids.length,currentTitle:'…'});
    const zip=new JSZip();
    const folder=zip.folder('labels');
    for(let i=0;i<ids.length;i++){
      const entry=entries.find(e=>e.id===ids[i]);
      if(!entry)continue;
      const title=entry.title||'untitled';
      setBatchProgress({done:i,total:ids.length,currentTitle:title});
      // Merge saved label data with defaults — ensures every field exists
      const ef={...DEFAULT_FIELDS,...(entry.labelFields||{}),
        title:entry.labelFields?.title||entry.title||'',
        artist:entry.labelFields?.artist||entry.artist||''};
      const es={...DEFAULT_SETTINGS,...(entry.labelSettings||{})};
      const idx=String(i+1).padStart(3,'0');
      const slug=`${idx}_${(entry.artist||'artist').replace(/[^a-z0-9]/gi,'_').slice(0,24)}_${title.replace(/[^a-z0-9]/gi,'_').slice(0,36)}`;
      try{
        const blob=await renderLabelToBlob(ef,es,batchScale);
        folder.file(`${slug}.png`,blob,{compression:'STORE'});
        setBatchLog(l=>[...l,{id:entry.id,title,ok:true}]);
      }catch(err){
        setBatchLog(l=>[...l,{id:entry.id,title,ok:false,msg:err.message||'Unknown error'}]);
      }
      await new Promise(r=>setTimeout(r,16)); // yield — keeps UI responsive between renders
    }
    setBatchProgress(p=>({...p,done:ids.length,currentTitle:''}));
    try{
      const zipBlob=await zip.generateAsync({type:'blob'});
      const a=document.createElement('a');a.href=URL.createObjectURL(zipBlob);
      a.download=`tracklab-labels-${todayStr()}.zip`;a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),8000);
    }catch(err){alert('ZIP generation failed: '+err.message);}
    setBatchRunning(false);
  };

  // ── SEND META TO LABEL
  const sendMetaToLabel=()=>{
    const nf={...fields,artist:meta.artist||fields.artist,title:meta.title||fields.title,catalog:meta.catalog||fields.catalog,isrc:meta.isrc||fields.isrc,upc:meta.upc||fields.upc};
    setFields(nf);
    setS(s=>{const mf=(s.metaFields||[]).map(m=>{const l=m.label.toUpperCase();if(l==='BPM'&&meta.bpm)return{...m,value:meta.bpm};if(l==='KEY'&&meta.key)return{...m,value:meta.key};if(l==='GENRE'&&meta.genre)return{...m,value:meta.genre};if((l==='YEAR'||l==='DATE')&&meta.year)return{...m,value:meta.year};return m;});return{...s,metaFields:mf};});
    setTab('studio');setStudioSubTab('label');saveLS('tl_studio_sub','label');
  };

  const mS={fontSize:9,color:T.muted,lineHeight:1.6};
  const h2S={fontSize:12,fontWeight:700,color:T.bright,marginBottom:14,letterSpacing:'0.06em',textTransform:'uppercase'};
  const prevScale=Math.min(1,420/settings.labelW);

  // ━━━━━━━━ IMAGE DRAG / RESIZE ━━━━━━━━
  // Local state only used during a resize drag — lets us move the overlay border
  // live without triggering an expensive Atkinson re-dither on every pixel.
  const [dragImgSize,setDragImgSize]=useState(null); // null | {w,h}

  // MOVE — drag the image overlay to reposition imageX / imageY.
  // Updates settings live; cheap because it doesn't affect dither output.
  const onImgDragStart=useCallback(e=>{
    if(e.button!==0)return;
    e.preventDefault();
    e.stopPropagation();
    const sx=e.clientX,sy=e.clientY;
    const ix=settings.imageX,iy=settings.imageY;
    const sc=prevScale;
    const onMove=ev=>{
      setS(s=>({...s,
        imageX:Math.round(ix+(ev.clientX-sx)/sc),
        imageY:Math.round(iy+(ev.clientY-sy)/sc),
      }));
    };
    const onUp=()=>{
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
    };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
  },[settings.imageX,settings.imageY,prevScale,setS]);

  // RESIZE — drag the bottom-right handle to change imageW / imageH.
  // Uses local dragImgSize for a live border preview; commits to setS on mouseup
  // so the expensive re-dither only fires once at the end of the gesture.
  const onImgResizeStart=useCallback(e=>{
    if(e.button!==0)return;
    e.preventDefault();
    e.stopPropagation();
    const sx=e.clientX,sy=e.clientY;
    const sw=settings.imageW,sh=settings.imageH;
    const sc=prevScale;
    const onMove=ev=>{
      const nw=Math.max(40,Math.round(sw+(ev.clientX-sx)/sc));
      const nh=Math.max(40,Math.round(sh+(ev.clientY-sy)/sc));
      setDragImgSize({w:nw,h:nh});
    };
    const onUp=ev=>{
      const nw=Math.max(40,Math.round(sw+(ev.clientX-sx)/sc));
      const nh=Math.max(40,Math.round(sh+(ev.clientY-sy)/sc));
      setS(s=>({...s,imageW:nw,imageH:nh}));
      setDragImgSize(null);
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
    };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
  },[settings.imageW,settings.imageH,prevScale,setS]);

  // ━━━━━━━━ TAB BAR ━━━━━━━━
  const tabBar=(
    <div style={{height:44,display:'flex',alignItems:'center',justifyContent:'space-between',background:T.panel,borderBottom:`1px solid ${T.border}`,padding:'0 14px',flexShrink:0,position:'relative',zIndex:100}}>
      <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
        <div style={{display:'flex',alignItems:'baseline',gap:6,flexShrink:0}}>
          <div style={{fontSize:9,letterSpacing:'0.3em',textTransform:'uppercase',color:T.bright}}>Track Lab</div>
          <div style={{fontSize:7,letterSpacing:'0.15em',color:T.sub,fontFamily:'monospace'}}>{VERSION}</div>
        </div>
        {activeProfile&&<span style={{fontSize:8,color:T.accent,border:`1px solid ${T.accent}44`,padding:'2px 7px',borderRadius:T.r||0,flexShrink:0}}>{activeProfile.name}</span>}
        {activeEntry&&<span style={{fontSize:8,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>· {activeEntry.title||'Untitled'}</span>}
      </div>
      <div style={{display:'flex',gap:1,flexShrink:0}}>
        {[['info','Info'],['archive','Archive'],['metadata','Data'],['classify','Classify'],['studio','Studio'],['catalog',`Codes (${savedCodes.length})`],['viz','Player']].map(([id,lbl])=>(
          <button key={id} onClick={()=>{setTab(id);if(id==='studio'){setStudioSubTab('art');saveLS('tl_studio_sub','art');}}} style={{padding:'6px 11px',background:tab===id?T.accent:'transparent',color:tab===id?T.bg:T.sub,border:'none',fontFamily:'inherit',fontSize:8,letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer',fontWeight:tab===id?700:400,borderRadius:T.r||0}}>
            {lbl}
          </button>
        ))}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
        {/* ── Undo / Redo — context-aware: archive tab uses catalog history, others use meta history */}
        {(()=>{
          const isCatalog=tab==='archive';
          const canU=isCatalog?catalogHistory.canUndo:metaHistory.canUndo;
          const canR=isCatalog?catalogHistory.canRedo:metaHistory.canRedo;
          const steps=isCatalog?catalogHistory.steps:metaHistory.steps;
          const doU=isCatalog?doCatalogUndo:doMetaUndo;
          const doR=isCatalog?doCatalogRedo:doMetaRedo;
          const label=isCatalog?'catalog':'edits';
          return(
            <>
              <button
                onClick={doU} disabled={!canU}
                title={canU?`Undo ${steps} ${label} (Ctrl+Z)`:'Nothing to undo'}
                style={{background:'none',border:`1px solid ${canU?T.border:'transparent'}`,color:canU?T.text:T.muted,
                  fontFamily:'inherit',fontSize:11,padding:'2px 7px',cursor:canU?'pointer':'default',
                  borderRadius:T.r||0,lineHeight:1,opacity:canU?1:0.35,transition:'opacity 0.15s'}}>
                ↩
              </button>
              <button
                onClick={doR} disabled={!canR}
                title={canR?`Redo (Ctrl+Shift+Z)`:'Nothing to redo'}
                style={{background:'none',border:`1px solid ${canR?T.border:'transparent'}`,color:canR?T.text:T.muted,
                  fontFamily:'inherit',fontSize:11,padding:'2px 7px',cursor:canR?'pointer':'default',
                  borderRadius:T.r||0,lineHeight:1,opacity:canR?1:0.35,transition:'opacity 0.15s'}}>
                ↪
              </button>
            </>
          );
        })()}
        {autoSaving&&<span className="tl-spin" style={{fontSize:10,color:T.muted,lineHeight:1}}>↻</span>}
        {diskSaving&&<span className="tl-spin" style={{fontSize:10,color:T.accent,lineHeight:1}} title="Saving to disk…">↻</span>}
        {!diskSaving&&diskLastSaved&&folderName&&<span style={{fontSize:7,color:'#3fb950',lineHeight:1,cursor:'default'}} title={`Saved to disk at ${diskLastSaved.toLocaleTimeString()}`}>●</span>}
        {diskSaveError&&<span style={{fontSize:7,color:'#f87171',lineHeight:1,cursor:'pointer'}} title={diskSaveError} onClick={()=>setShowTheme(true)}>⚠</span>}
        {activeEid&&<button onClick={saveToEntry} style={{...mkBtn(T,true),padding:'4px 10px',fontSize:8,...(savedFlash?{background:'#3fb950'}:{}),transition:'background 0.2s'}}>{savedFlash?'✓ Saved':'⬆ Save'}</button>}
        <button onClick={()=>setShowTheme(!showTheme)} style={{background:showTheme?T.accent:T.bg,border:`1px solid ${T.border}`,color:showTheme?T.bg:T.muted,fontSize:13,padding:'3px 7px',cursor:'pointer',borderRadius:T.r||0}}>⚙</button>
      </div>
      {showTheme&&<>
        <div style={{position:'fixed',inset:0,zIndex:999}} onClick={()=>setShowTheme(false)}/>
        <ThemePopover appTheme={appTheme} setAppTheme={setAppTheme} T={T} onClose={()=>setShowTheme(false)} fsProps={{
          supported:permState!=='unsupported',
          folderName,diskSaving,diskLastSaved,diskSaveError,
          pickFolder:async()=>{const ok=await pickFolder();if(ok)setTimeout(()=>diskSaveAllRef.current?.(),300);},
          clearFolder,
          saveNow:()=>diskSaveAllRef.current?.(),
        }}/>
      </>}
    </div>
  );

  // ━━━━━━━━ INFO TAB ━━━━━━━━
  const infoTab=(
    <div style={{maxWidth:720,margin:'0 auto',padding:'32px 20px'}}>
      <div style={{...mkCard(T),padding:'32px 28px',marginBottom:20,textAlign:'center'}}>
        <div style={{fontSize:11,letterSpacing:'0.4em',textTransform:'uppercase',color:T.text,marginBottom:8}}>Welcome to</div>
        <div style={{fontSize:38,fontWeight:700,color:T.accent,letterSpacing:'0.08em',lineHeight:1,marginBottom:6}}>TRACK LAB</div>
        <div style={{fontSize:11,letterSpacing:'0.2em',textTransform:'uppercase',color:T.text,marginBottom:18}}>Music Archive & Label Design System</div>
        <div style={{fontSize:12,color:T.text,lineHeight:1.85,maxWidth:520,margin:'0 auto'}}>A personal archival system for your music. Catalog every track with industry-standard metadata, design physical and digital labels, generate classification codes, embed ID3 tags into your audio files, and maintain an organized archive across unlimited artist profiles.</div>
      </div>
      <div style={{...mkCard(T),marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:700,color:T.accent,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:14}}>Workflow</div>
        {[
          ['1 — Create Profile','Go to Archive → New Profile. Create one profile per artist or project. Each profile holds unlimited track entries.'],
          ['2 — New Track Entry','Inside a profile, click "+ New Track Entry". This opens the Tags panel for that entry. Give it a title, artist, and any metadata.'],
          ['3 — Upload Audio','In Tags → Audio File, drop your audio file. Existing ID3 tags are read automatically. Export a properly-tagged MP3 with all your data embedded.'],
          ['4 — Album Art','In Tags → Album Art, upload your artwork. It is center-cropped and saved at your chosen output resolution (up to 3000×3000).'],
          ['5 — Classify','In the Classify tab, generate a 4-character classification code describing the track\'s genre, mood, tempo, and texture. Save it to the entry.'],
          ['6 — Design Label','In the Label tab, design a physical or digital label. Content flows from the Data tab. Export as PNG or JPG at any resolution.'],
          ['7 — Export & Backup','Use Archive → Export ZIP to create a portable archive of all audio, artwork, and metadata. Import JSON to restore on another device.'],
        ].map(([title,body])=>(
          <div key={title} style={{display:'flex',gap:14,padding:'10px 12px',background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0,marginBottom:6}}>
            <div style={{fontSize:9,fontWeight:700,color:T.accent,minWidth:110,paddingTop:2,flexShrink:0}}>{title}</div>
            <div style={{fontSize:11,color:T.text,lineHeight:1.75}}>{body}</div>
          </div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
        <div style={mkCard(T)}>
          <div style={{fontSize:9,fontWeight:700,color:T.accent,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:8}}>Classification Format</div>
          <div style={{fontFamily:'monospace',fontSize:20,color:T.bright,letterSpacing:'0.2em',marginBottom:8,textAlign:'center'}}>XXX.X</div>
          {[['Pos 1','Genre / Style'],['Pos 2','Mood / Energy'],['Pos 3','Tempo / Feel'],['Pos 4','Texture']].map(([p,d])=>(
            <div key={p} style={{display:'flex',gap:8,marginBottom:4}}><span style={{fontSize:9,color:T.accent,minWidth:36,flexShrink:0}}>{p}</span><span style={{fontSize:9,color:T.muted}}>{d} · 0–9, A–Z</span></div>
          ))}
        </div>
        <div style={mkCard(T)}>
          <div style={{fontSize:9,fontWeight:700,color:T.accent,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:8}}>Cloud Backup</div>
          <div style={{fontSize:10,color:T.text,lineHeight:1.8}}>All data stored locally (IndexedDB + localStorage). To back up: <strong style={{color:T.bright}}>Archive → Export ZIP</strong> — creates a portable archive with audio, art, and metadata organized by profile and track. Upload to Google Drive, Dropbox, or iCloud. To restore: use <strong style={{color:T.bright}}>Import JSON</strong>.</div>
        </div>
      </div>
      <div style={{textAlign:'center',padding:'20px 0 0',color:T.sub,fontSize:8,letterSpacing:'0.2em',textTransform:'uppercase'}}>Track Lab {VERSION} · All data stored locally · No account required</div>
    </div>
  );

  // ━━━━━━━━ ARCHIVE TAB ━━━━━━━━
  const archiveTab=(
    <div style={{display:'flex',minHeight:'calc(100vh - 44px)',overflow:'visible',position:'relative'}}>
      {/* PROFILES SIDEBAR */}
      <div style={{width:archiveSidebar.width,flexShrink:0,background:T.panel,borderRight:archiveSidebar.collapsed?'none':`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',transition:'width 0.15s'}}>
        <div {...archiveSidebar.handle}/>
        {archiveSidebar.tab}
        <div style={{padding:'12px 12px 10px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontSize:8,letterSpacing:'0.2em',textTransform:'uppercase',color:T.muted,marginBottom:8}}>Artist Profiles</div>
          {newProf.open?(
            <div>
              <input value={newProf.name} onChange={e=>setNewProf(p=>({...p,name:e.target.value}))} placeholder="Artist or project name" style={{...mkIS(T),marginBottom:5,fontSize:11}} onKeyDown={e=>e.key==='Enter'&&createProfile()}/>
              <input value={newProf.desc} onChange={e=>setNewProf(p=>({...p,desc:e.target.value}))} placeholder="Description (optional)" style={{...mkIS(T),marginBottom:6,fontSize:11}}/>
              <div style={{display:'flex',gap:5}}>
                <button onClick={createProfile} style={{...mkBtn(T,true),flex:1,padding:'5px 0',fontSize:9}}>Create</button>
                <button onClick={()=>setNewProf({open:false,name:'',desc:''})} style={{...mkBtn(T),padding:'5px 8px',fontSize:9}}>✕</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setNewProf(p=>({...p,open:true}))} style={{...mkBtn(T,true),width:'100%',padding:'6px 0',fontSize:9}}>+ New Profile</button>
          )}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'6px'}}>
          {orderedProfiles.length===0&&<div style={{fontSize:9,color:T.muted,textAlign:'center',padding:'20px 10px',lineHeight:1.9,border:`1px dashed ${T.border}`,borderRadius:T.r||0,margin:'4px 0'}}>No projects yet.<br/>Create one below,<br/>or drop audio files<br/>into the track window.</div>}
          {orderedProfiles.map(p=>(
            <div key={p.id}
              draggable={!editProf}
              onDragStart={e=>{
                e.dataTransfer.effectAllowed='move';
                e.dataTransfer.setData('application/x-tl-profile-reorder',p.id);
                profileDragRef.current=p.id;
              }}
              onDragOver={e=>{
                e.preventDefault();
                e.dataTransfer.dropEffect='move';
                if(profileDragRef.current&&profileDragRef.current!==p.id)setProfileDragOverId(p.id);
              }}
              onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setProfileDragOverId(null);}}
              onDrop={e=>{
                e.preventDefault();
                if(!e.dataTransfer.types.includes('application/x-tl-profile-reorder'))return;
                if(profileDragRef.current&&profileDragRef.current!==p.id)reorderProfiles(profileDragRef.current,p.id);
                profileDragRef.current=null;
                setProfileDragOverId(null);
              }}
              onDragEnd={()=>{profileDragRef.current=null;setProfileDragOverId(null);}}
              style={{outline:profileDragOverId===p.id?`2px solid ${T.accent}`:'2px solid transparent',borderRadius:T.r||0,transition:'outline 0.1s'}}
            >
              {editProf?.id===p.id?(
                <div style={{padding:'8px',marginBottom:4,background:T.card,border:`1px solid ${T.accent}`,borderRadius:T.r||0}}>
                  <input value={editProf.name} onChange={e=>setEditProf(ep=>({...ep,name:e.target.value}))} style={{...mkIS(T),marginBottom:4,fontSize:11}} onKeyDown={e=>e.key==='Enter'&&saveEditProfile()}/>
                  <input value={editProf.desc} onChange={e=>setEditProf(ep=>({...ep,desc:e.target.value}))} placeholder="Description" style={{...mkIS(T),marginBottom:6,fontSize:11}}/>
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={saveEditProfile} style={{...mkBtn(T,true),flex:1,padding:'4px 0',fontSize:9}}>Save</button>
                    <button onClick={()=>setEditProf(null)} style={{...mkBtn(T),padding:'4px 8px',fontSize:9}}>✕</button>
                  </div>
                </div>
              ):(
                <div onClick={()=>setActivePid(p.id)} style={{padding:'9px 10px',marginBottom:4,background:activePid===p.id?T.card:T.bg,border:`1px solid ${activePid===p.id?T.accent:T.border}`,borderRadius:T.r||0,cursor:'grab',position:'relative',userSelect:'none'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0,flex:1}}>
                      <span style={{fontSize:9,color:T.muted,flexShrink:0,lineHeight:1,cursor:'grab',opacity:0.5}}>⠿</span>
                      <div style={{fontSize:11,fontWeight:700,color:activePid===p.id?T.accent:T.bright,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,minWidth:0}}>{p.name}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0,marginLeft:4}}>
                      <span style={{fontSize:8,color:T.muted}}>{entries.filter(e=>e.profileId===p.id).length}</span>
                      <button onClick={ev=>{ev.stopPropagation();setEditProf({id:p.id,name:p.name,desc:p.description||''}); setActivePid(p.id);}} style={{background:'none',border:'none',color:T.muted,cursor:'pointer',fontSize:10,padding:'0 2px',lineHeight:1}}>✎</button>
                      <button onClick={ev=>{ev.stopPropagation();if(window.confirm(`Delete profile "${p.name}" and ALL its tracks?`)){deleteProfile(p.id);}}} style={{background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:10,padding:'0 2px',lineHeight:1}} title="Delete profile">✕</button>
                    </div>
                  </div>
                  {p.description&&<div style={{fontSize:9,color:T.muted,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.description}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{padding:'8px',paddingBottom:8,borderTop:`1px solid ${T.border}`,flexShrink:0,display:'flex',flexDirection:'column',gap:4}}>
          <div style={{fontSize:7,letterSpacing:'0.15em',textTransform:'uppercase',color:T.muted,marginBottom:2}}>Export & Backup</div>
          <button onClick={exportCSV} style={{...mkBtn(T),width:'100%',padding:'5px 0',fontSize:8}}>📊 Export CSV</button>
          <button onClick={exportJSON} style={{...mkBtn(T),width:'100%',padding:'5px 0',fontSize:8}}>💾 Backup JSON</button>
          <button onClick={exportZIP} disabled={zipping} style={{...mkBtn(T),width:'100%',padding:'5px 0',fontSize:8,opacity:zipping?0.6:1}}>{zipping?'⏳ Building ZIP…':'📦 Export ZIP (audio+art)'}</button>
          <button onClick={()=>exportImportRef.current.click()} style={{...mkBtn(T),width:'100%',padding:'5px 0',fontSize:8}}>⬆ Import JSON</button>
          <button onClick={()=>csvImportRef.current.click()} style={{...mkBtn(T),width:'100%',padding:'5px 0',fontSize:8}}>📋 Import CSV</button>
          <input ref={exportImportRef} type="file" accept=".json" style={{display:'none'}} onChange={e=>e.target.files[0]&&importJSON(e.target.files[0])}/>
          <input ref={csvImportRef} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={e=>e.target.files[0]&&importCSV(e.target.files[0])}/>
        </div>
      </div>
      {archiveSidebar.expandStub}

      {/* ENTRY LIST */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflowY:'auto',minWidth:0}}>
        {activePid?(
          <>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${T.border}`,flexShrink:0,background:T.panel,gap:8,display:'flex',flexDirection:'column'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:T.bright}}>{activeProfile?.name}</div>
                <div style={{fontSize:9,color:T.muted}}>{profEntries.length} {profEntries.length===1?'track':'tracks'}{archiveSearch&&` · ${filteredEntries.length} shown`}</div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={createEntry} style={{...mkBtn(T,true),padding:'7px 14px',fontSize:9}}>+ New Track</button>
                <button onClick={toggleSelectMode} style={{...mkBtn(T,selectMode),padding:'7px 10px',fontSize:8}}>{selectMode?'✕ Cancel':'☑ Select'}</button>
                <button onClick={()=>{if(window.confirm(`Delete profile "${activeProfile?.name}" and ALL its entries?`)){deleteProfile(activePid);}}} style={{...mkBtn(T),padding:'7px 10px',fontSize:8,color:'#f87171'}}>Delete Profile</button>
              </div>
              </div>
              {/* Search bar */}
              <div style={{position:'relative'}}>
                <input value={archiveSearch} onChange={e=>setArchiveSearch(e.target.value)} placeholder="Search title, artist, code, status…" style={{...mkIS(T),paddingRight:28,fontSize:11}}/>
                {archiveSearch&&<button onClick={()=>setArchiveSearch('')} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:T.muted,cursor:'pointer',fontSize:12,padding:0,lineHeight:1}}>✕</button>}
              </div>
              {/* Sort + Status filter row */}
              <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:7,color:T.muted,letterSpacing:'0.15em',textTransform:'uppercase',flexShrink:0}}>Sort</span>
                {[['updated','Recent'],['created','Created'],['title','A–Z'],['status','Status'],['manual','Manual']].map(([v,lbl])=>(
                  <button key={v} onClick={()=>setArchiveSort(v)} style={{...mkBtn(T,archiveSort===v),padding:'2px 8px',fontSize:8}}>{lbl}</button>
                ))}
                <span style={{fontSize:7,color:T.border,marginLeft:4,flexShrink:0}}>|</span>
                <span style={{fontSize:7,color:T.muted,letterSpacing:'0.15em',textTransform:'uppercase',flexShrink:0}}>Filter</span>
                <button onClick={()=>setArchiveStatusFilter('all')} style={{...mkBtn(T,archiveStatusFilter==='all'),padding:'2px 8px',fontSize:8}}>All</button>
                {Object.entries(STATUS_OPT).map(([k,v])=>(
                  <button key={k} onClick={()=>setArchiveStatusFilter(archiveStatusFilter===k?'all':k)} style={{...mkBtn(T,archiveStatusFilter===k),padding:'2px 8px',fontSize:8,color:archiveStatusFilter===k?T.bg:v.color,borderColor:v.color+'66'}}>{v.label}</button>
                ))}
              </div>
              {/* Bulk select controls */}
              {selectMode&&(
                <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 0',borderTop:`1px solid ${T.border}`}}>
                  <button onClick={selectAll} style={{...mkBtn(T),padding:'4px 8px',fontSize:8}}>All</button>
                  <button onClick={()=>setSelectedEids(new Set())} style={{...mkBtn(T),padding:'4px 8px',fontSize:8}}>None</button>
                  <span style={{fontSize:9,color:T.muted,flex:1}}>{selectedEids.size} selected</span>
                  <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} style={{...mkIS(T),flex:'0 0 auto',width:'auto',fontSize:9,padding:'3px 6px'}}>
                    {Object.entries(STATUS_OPT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button onClick={applyBulkStatus} disabled={!selectedEids.size} style={{...mkBtn(T,true),padding:'4px 10px',fontSize:9,opacity:selectedEids.size?1:0.4}}>Apply</button>
                  <button onClick={()=>{if(!selectedEids.size||!window.confirm(`Delete ${selectedEids.size} track${selectedEids.size>1?'s':''}? This cannot be undone.`))return;[...selectedEids].forEach(id=>deleteEntry(id));setSelectedEids(new Set());setSelectMode(false);}} disabled={!selectedEids.size} style={{...mkBtn(T),padding:'4px 10px',fontSize:9,color:'#f87171',borderColor:'#f87171',opacity:selectedEids.size?1:0.4}}>Delete</button>
                </div>
              )}
            </div>
            <div
              style={{flex:1,overflowY:'auto',padding:'14px 16px',position:'relative',
                transition:'background 0.15s',
                background:archiveDragOver?`${T.accent}18`:'transparent',
                outline:archiveDragOver?`2px dashed ${T.accent}`:'2px dashed transparent',
                outlineOffset:-2,
              }}
              onDragOver={e=>{e.preventDefault();if(!e.dataTransfer.types.includes('application/x-tl-reorder'))setArchiveDragOver(true);}}
              onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setArchiveDragOver(false);}}
              onDrop={async e=>{
              e.preventDefault();setArchiveDragOver(false);
              // Ignore internal card reorder drags — they have a custom type marker
              if(e.dataTransfer.types.includes('application/x-tl-reorder'))return;
              const {files,folderName}=await extractDropItems(e.dataTransfer);
              if(!files.length)return;
              if(activePid){
                importAudioFiles(files,activePid);
              }else{
                pendingDropFilesRef.current=files;
                setDropProfileName(folderName||'');
                setDropProfilePrompt(true);
              }
            }}
            >
              {profEntries.length===0?(
                <div style={{height:'100%',minHeight:260,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:0,padding:32,textAlign:'center',position:'relative'}}>
                  {/* Big drop target visual */}
                  <div style={{position:'absolute',inset:16,border:`2px dashed ${archiveDragOver?T.accent:T.border}44`,borderRadius:(T.r||0)*2,pointerEvents:'none',transition:'border-color 0.15s'}}/>
                  <div style={{fontSize:48,opacity:archiveDragOver?0.6:0.12,marginBottom:16,transition:'opacity 0.15s'}}>🎵</div>
                  <div style={{fontSize:13,fontWeight:700,color:archiveDragOver?T.accent:T.bright,marginBottom:8,letterSpacing:'0.04em',transition:'color 0.15s'}}>{archiveDragOver?'Drop to import':'No tracks yet'}</div>
                  <div style={{fontSize:10,color:T.muted,lineHeight:1.7,marginBottom:24,maxWidth:260}}>Drag & drop audio files anywhere in this area to import them instantly, or start with a blank entry.</div>
                  <button onClick={createEntry} style={{...mkBtn(T,true),padding:'9px 20px',fontSize:10}}>+ New Blank Track</button>
                </div>
              ):filteredEntries.length===0?(
                <div style={{...mkCard(T),textAlign:'center',padding:32}}>
                  <div style={{fontSize:9,color:T.muted}}>No tracks match "{archiveSearch}"</div>
                </div>
              ):(
                filteredEntries.map(e=>(
                  <div key={e.id}
                    draggable={!selectMode}
                    onDragStart={ev=>{
                      ev.dataTransfer.effectAllowed='move';
                      ev.dataTransfer.setData('application/x-tl-reorder',e.id);
                      entryDragRef.current=e.id;
                    }}
                    onDragOver={ev=>{
                      ev.preventDefault();
                      ev.dataTransfer.dropEffect='move';
                      if(entryDragRef.current&&entryDragRef.current!==e.id)setEntryDragOverId(e.id);
                    }}
                    onDragLeave={ev=>{if(!ev.currentTarget.contains(ev.relatedTarget))setEntryDragOverId(null);}}
                    onDrop={ev=>{
                      ev.preventDefault();
                      // Only handle card reorder drops — ignore file drops
                      if(!ev.dataTransfer.types.includes('application/x-tl-reorder'))return;
                      if(entryDragRef.current&&entryDragRef.current!==e.id){
                        reorderEntries(entryDragRef.current,e.id,activePid);
                      }
                      entryDragRef.current=null;
                      setEntryDragOverId(null);
                    }}
                    onDragEnd={()=>{entryDragRef.current=null;setEntryDragOverId(null);}}
                    style={{outline:entryDragOverId===e.id?`2px solid ${T.accent}`:'2px solid transparent',borderRadius:(T.r||0)*1.5,transition:'outline 0.1s'}}
                  >
                  <EntryCard T={T} entry={e} isActive={e.id===activeEid&&!selectMode}
                    isPlaying={e.id===playingEid&&playing}
                    selectable={selectMode} selected={selectedEids.has(e.id)} onToggle={toggleEid}
                    onOpen={id=>{const ent=entries.find(x=>x.id===id);if(ent){const wasPlaying=playing&&playingEid!==null;loadEntry(ent).then(()=>{if(wasPlaying&&ent.hasAudio){setPlayingEid(ent.id);requestAnimationFrame(()=>requestAnimationFrame(()=>audioElRef.current?.play()));}});}}}
                    onDelete={deleteEntry}
                    onPlayPause={async ent=>{
                      const el=audioElRef.current;
                      if(ent.id===playingEid){
                        if(!el)return;
                        playing?el.pause():el.play();
                      }else if(ent.id===activeEid){
                        setPlayingEid(ent.id);
                        el?.play();
                      }else{
                        await loadEntry(ent);
                        setPlayingEid(ent.id);
                        requestAnimationFrame(()=>requestAnimationFrame(()=>{audioElRef.current?.play();}));
                      }
                    }}
                    onTabJump={async(ent,targetTab)=>{
                      if(ent.id!==activeEid)await loadEntry(ent);
                      setTab(targetTab);
                    }}
                  />
                  </div>
                ))
              )}
            </div>
          </>
        ):(
          <div
            style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:14,padding:40,
              background:archiveDragOver?`${T.accent}10`:'transparent',
              outline:archiveDragOver?`2px dashed ${T.accent}`:'2px dashed transparent',
              outlineOffset:-2,transition:'background 0.15s',position:'relative'}}
            onDragOver={e=>{e.preventDefault();if(!e.dataTransfer.types.includes('application/x-tl-reorder')&&!e.dataTransfer.types.includes('application/x-tl-profile-reorder'))setArchiveDragOver(true);}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setArchiveDragOver(false);}}
            onDrop={async e=>{
              e.preventDefault();setArchiveDragOver(false);
              if(e.dataTransfer.types.includes('application/x-tl-reorder')||e.dataTransfer.types.includes('application/x-tl-profile-reorder'))return;
              const {files,folderName}=await extractDropItems(e.dataTransfer);
              if(!files.length)return;
              pendingDropFilesRef.current=files;
              setDropProfileName(folderName||'');
              setDropProfilePrompt(true);
            }}
          >
            {archiveDragOver?(
              <>
                <div style={{fontSize:40,opacity:0.5}}>🎵</div>
                <div style={{fontSize:13,fontWeight:700,color:T.accent,letterSpacing:'0.04em'}}>Drop to create a new project</div>
                <div style={{fontSize:10,color:T.muted}}>You'll name it in one step.</div>
              </>
            ):(
              <>
                <div style={{fontSize:36,opacity:0.1}}>◈</div>
                <div style={{...mS,textAlign:'center'}}>Select a project<br/>to view its tracks.</div>
                <div style={{fontSize:9,color:T.muted,textAlign:'center',lineHeight:1.7,maxWidth:200}}>Or drop audio files here to create a new project automatically.</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ENTRY DETAIL */}
      {activeEntry&&(<>
        {archiveDetail.expandStub}
        <div style={{width:archiveDetail.width,flexShrink:0,background:T.panel,borderLeft:archiveDetail.collapsed?'none':`1px solid ${T.border}`,overflow:'hidden',padding:archiveDetail.collapsed?0:14,display:'flex',flexDirection:'column',gap:10,position:'relative',transition:'width 0.15s'}}>
          <div {...archiveDetail.handle}/>
          {archiveDetail.tab}
          <div style={{fontSize:8,letterSpacing:'0.2em',textTransform:'uppercase',color:T.muted}}>Entry Detail</div>
          {activeEntry.albumArtThumb&&<div style={{width:'100%',aspectRatio:'1',overflow:'hidden',borderRadius:T.r||0,border:`1px solid ${T.border}`}}><img src={activeEntry.albumArtThumb} style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>}
          <div><div style={{fontSize:13,fontWeight:700,color:T.bright,marginBottom:2}}>{activeEntry.title||'Untitled'}</div><div style={{fontSize:10,color:T.muted}}>{activeEntry.artist}</div></div>
          {activeEntry.hasAudio&&(
            <div>
              <div style={{fontSize:8,color:T.muted,marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{activeEntry.audioFilename}</div>
              <DetailMiniPlayer
                T={T}
                entry={activeEntry}
                audioElRef={audioElRef}
                audioObjectUrl={audioObjectUrl}
                isCurrentEntry={activeEntry.id===activeEid}
                onLoad={()=>loadEntry(activeEntry)}
              />
            </div>
          )}
          <div>
            <label style={mkLBL(T)}>Status</label>
            <select value={activeEntry.status||'draft'} onChange={e=>updateEntry(activeEntry.id,{status:e.target.value})} style={{...mkIS(T)}}>
              {Object.entries(STATUS_OPT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {activeEntry.classCode&&<div><div style={{fontFamily:'monospace',fontSize:18,color:T.accent,marginBottom:3}}>{activeEntry.classCode}</div><div style={{fontSize:9,color:T.muted,lineHeight:1.5}}>{getCodeDesc(activeEntry.classCode)}</div></div>}
          <div style={{fontSize:7,color:T.muted}}>Created {fmtDate(activeEntry.created)} · Updated {fmtDate(activeEntry.updated)}</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            <button onClick={()=>{loadEntry(activeEntry);setTab('metadata');}} style={{...mkBtn(T),width:'100%',padding:'7px 0',fontSize:9}}>✏ Edit Data</button>
            <button onClick={()=>{loadEntry(activeEntry);setTab('studio');setStudioSubTab('label');saveLS('tl_studio_sub','label');}} style={{...mkBtn(T),width:'100%',padding:'7px 0',fontSize:9}}>🏷 Edit Label</button>
            <button onClick={()=>{loadEntry(activeEntry);setTab('classify');}} style={{...mkBtn(T),width:'100%',padding:'7px 0',fontSize:9}}>◈ Classify</button>
            <button onClick={()=>duplicateEntry(activeEntry)} style={{...mkBtn(T),width:'100%',padding:'7px 0',fontSize:9}}>⧉ Duplicate</button>
            {activeEntry.labelSettings&&(
              <button onClick={()=>setArchiveLabelExport({fields:activeEntry.labelFields||DEFAULT_FIELDS,settings:activeEntry.labelSettings||DEFAULT_SETTINGS,title:activeEntry.title||'track'})} disabled={archiveLabelExporting} style={{...mkBtn(T,true),width:'100%',padding:'7px 0',fontSize:9,opacity:archiveLabelExporting?0.6:1}}>
                {archiveLabelExporting?'⏳ Exporting…':'⬇ Export Label'}
              </button>
            )}
          </div>
        </div>
      </>)}

      {/* ── CREATE PROJECT PROMPT — shown when files dropped with no profile ── */}
      {dropProfilePrompt&&(
        <div style={{position:'absolute',inset:0,zIndex:200,background:`${T.bg}ee`,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget){setDropProfilePrompt(false);pendingDropFilesRef.current=[];}}}>
          <div style={{background:T.panel,border:`1px solid ${T.accent}`,borderRadius:(T.r||0)*2,padding:32,width:320,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{fontSize:14,fontWeight:700,color:T.bright,letterSpacing:'0.04em'}}>Name your project</div>
            <div style={{fontSize:10,color:T.muted,lineHeight:1.65}}>
              {pendingDropFilesRef.current.length} audio file{pendingDropFilesRef.current.length!==1?'s':''} ready to import. Give this project a name — you can change it any time.
            </div>
            <input
              autoFocus
              value={dropProfileName}
              onChange={e=>setDropProfileName(e.target.value)}
              onKeyDown={e=>{
                if(e.key==='Enter'&&dropProfileName.trim()){
                  const p={id:mkUid(),name:dropProfileName.trim(),description:'',created:todayStr()};
                  setProfiles(prev=>[...prev,p]);
                  setActivePid(p.id);
                  setDropProfilePrompt(false);
                  importAudioFiles(pendingDropFilesRef.current,p.id);
                  pendingDropFilesRef.current=[];
                }
                if(e.key==='Escape'){setDropProfilePrompt(false);pendingDropFilesRef.current=[];}
              }}
              placeholder="e.g. My First EP, Session Demos, Beat Tape Vol.1…"
              style={{...mkIS(T),fontSize:12,padding:'10px 12px'}}
            />
            <div style={{display:'flex',gap:8}}>
              <button
                onClick={()=>{
                  if(!dropProfileName.trim())return;
                  const p={id:mkUid(),name:dropProfileName.trim(),description:'',created:todayStr()};
                  setProfiles(prev=>[...prev,p]);
                  setActivePid(p.id);
                  setDropProfilePrompt(false);
                  importAudioFiles(pendingDropFilesRef.current,p.id);
                  pendingDropFilesRef.current=[];
                }}
                disabled={!dropProfileName.trim()}
                style={{...mkBtn(T,true),flex:1,padding:'9px 0',fontSize:10,opacity:dropProfileName.trim()?1:0.4}}
              >Create &amp; Import</button>
              <button onClick={()=>{setDropProfilePrompt(false);pendingDropFilesRef.current=[];}} style={{...mkBtn(T),padding:'9px 14px',fontSize:10}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  // ━━━━━━━━ METADATA / TAGS TAB ━━━━━━━━
  const metadataTab=(
    <div style={{display:'flex',minHeight:'calc(100vh - 44px)',overflow:'visible'}}>
      <div style={{width:metaSidebar.width,flexShrink:0,background:T.panel,borderRight:metaSidebar.collapsed?'none':`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',transition:'width 0.15s'}}>
        <div {...metaSidebar.handle}/>
        {metaSidebar.tab}
        <div style={{padding:'12px 12px 8px',borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:8,letterSpacing:'0.2em',textTransform:'uppercase',color:T.muted}}>Tag Sections</div>
        </div>
        <div style={{flex:1,padding:6,overflowY:'auto'}}>
          {[['core','Core Info'],['publish','Publishing'],['codes','ISRC / UPC'],['audio','Audio File'],['art','Album Art'],['extra','Extra Tags'],['analysis','Analysis'],['lyrics','Lyrics / Notes'],['splits','Split Sheet'],['summary','Summary']].map(([id,lbl])=>(
            <div key={id} onClick={()=>setMetaSection(id)} style={{padding:'8px 10px',marginBottom:3,background:metaSection===id?T.card:T.bg,border:`1px solid ${metaSection===id?T.accent:T.border}`,borderRadius:T.r||0,cursor:'pointer',fontSize:10,color:metaSection===id?T.accent:T.text,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              {lbl}
              {id==='splits'&&credits.length>0&&<span style={{fontSize:8,color:T.muted,background:T.card,padding:'1px 5px',borderRadius:8}}>{credits.length}</span>}
            </div>
          ))}
        </div>
        <div style={{padding:8,paddingBottom:8,borderTop:`1px solid ${T.border}`,display:'flex',flexDirection:'column',gap:4}}>
          <button onClick={sendMetaToLabel} style={{...mkBtn(T,true),width:'100%',padding:'7px 0',fontSize:8}}>→ Send to Label</button>
          <button onClick={exportTaggedAudio} style={{...mkBtn(T),width:'100%',padding:'7px 0',fontSize:8}}>⬇ Export Tagged MP3</button>
          {activeEid&&<button onClick={saveToEntry} style={{...mkBtn(T,true),width:'100%',padding:'7px 0',fontSize:8,...(savedFlash?{background:'#3fb950'}:{}),transition:'background 0.2s'}}>{savedFlash?'✓ Saved':'⬆ Save to Archive'}</button>}
          <button onClick={resetMeta} style={{...mkBtn(T),width:'100%',padding:'5px 0',fontSize:7,color:T.muted}}>↺ Reset Fields</button>
        </div>
      </div>
      {metaSidebar.expandStub}
      <div
        style={{flex:1,overflowY:'auto',overflowX:'auto',padding:'22px 28px',transition:'background 0.15s',
          background:metaPanelDragOver?`${T.accent}12`:'transparent',
          outline:metaPanelDragOver?`2px dashed ${T.accent}`:'2px dashed transparent',
          outlineOffset:-2}}
        onDragOver={e=>{e.preventDefault();setMetaPanelDragOver(true);}}
        onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setMetaPanelDragOver(false);}}
        onDrop={e=>{
          e.preventDefault();setMetaPanelDragOver(false);
          const f=e.dataTransfer.files[0];
          if(f)loadAudioFile(f);
        }}
      >
        {metaSection==='core'&&(
          <div style={{maxWidth:540}}>
            <div style={h2S}>Core Track Info</div>
            <MF T={T} label="Title"><TInp T={T} value={meta.title} onChange={e=>setMeta('title',e.target.value)} placeholder="Track title (as it will appear in stores)"/></MF>
            <MF T={T} label="Artist"><TInp T={T} value={meta.artist} onChange={e=>setMeta('artist',e.target.value)} placeholder="Primary artist / performer"/></MF>
            <MF T={T} label="Album Artist"><TInp T={T} value={meta.albumArtist} onChange={e=>setMeta('albumArtist',e.target.value)} placeholder="For VA compilations"/></MF>
            <MF T={T} label="Album / Release Title"><TInp T={T} value={meta.album} onChange={e=>setMeta('album',e.target.value)}/></MF>
            <Row2><MF T={T} label="Year"><TInp T={T} value={meta.year} onChange={e=>setMeta('year',e.target.value)} placeholder="YYYY"/></MF><MF T={T} label="Genre"><TInp T={T} value={meta.genre} onChange={e=>setMeta('genre',e.target.value)}/></MF></Row2>
            <Row2><MF T={T} label="Track #"><TInp T={T} value={meta.trackNum} onChange={e=>setMeta('trackNum',e.target.value)} placeholder="e.g. 3"/></MF><MF T={T} label="of Total"><TInp T={T} value={meta.trackTotal} onChange={e=>setMeta('trackTotal',e.target.value)} placeholder="e.g. 12"/></MF></Row2>
            <Row2><MF T={T} label="Disc #"><TInp T={T} value={meta.discNum} onChange={e=>setMeta('discNum',e.target.value)}/></MF><MF T={T} label="of Total"><TInp T={T} value={meta.discTotal} onChange={e=>setMeta('discTotal',e.target.value)}/></MF></Row2>
            <Row2><MF T={T} label="BPM"><TInp T={T} value={meta.bpm} onChange={e=>setMeta('bpm',e.target.value)}/></MF><MF T={T} label="Key"><TInp T={T} value={meta.key} onChange={e=>setMeta('key',e.target.value)} placeholder="e.g. F# minor"/></MF></Row2>
            <div style={{display:'flex',gap:24,marginTop:6}}><Tog T={T} label="Explicit" value={meta.explicit} onChange={v=>setMeta('explicit',v)}/><Tog T={T} label="Compilation" value={meta.compilation} onChange={v=>setMeta('compilation',v)}/></div>
          </div>
        )}
        {metaSection==='publish'&&(
          <div style={{maxWidth:540}}>
            <div style={h2S}>Publishing & Rights</div>
            <MF T={T} label="Composer"><TInp T={T} value={meta.composer} onChange={e=>setMeta('composer',e.target.value)} placeholder="Last, First format recommended"/></MF>
            <MF T={T} label="Lyricist"><TInp T={T} value={meta.lyricist} onChange={e=>setMeta('lyricist',e.target.value)}/></MF>
            <MF T={T} label="Producer"><TInp T={T} value={meta.producer} onChange={e=>setMeta('producer',e.target.value)}/></MF>
            <MF T={T} label="Publisher"><TInp T={T} value={meta.publisher} onChange={e=>setMeta('publisher',e.target.value)}/></MF>
            <MF T={T} label="Record Label"><TInp T={T} value={meta.label} onChange={e=>setMeta('label',e.target.value)}/></MF>
            <MF T={T} label="Catalog Number"><TInp T={T} value={meta.catalog} onChange={e=>setMeta('catalog',e.target.value)} placeholder="e.g. AVS-001"/></MF>
            <MF T={T} label="Copyright"><TInp T={T} value={meta.copyright} onChange={e=>setMeta('copyright',e.target.value)} placeholder="℗ 2025 Label Name"/></MF>
          </div>
        )}
        {metaSection==='codes'&&(
          <div style={{display:'flex',gap:20,alignItems:'flex-start',maxWidth:900,flexWrap:'wrap'}}>
            {/* Left — form fields */}
            <div style={{flex:'0 1 400px',minWidth:0,maxWidth:'100%'}}>
            <div style={h2S}>Registration Codes</div>
            <div style={{fontSize:10,color:T.muted,marginBottom:18,padding:12,background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0,lineHeight:1.7}}>
              These codes are embedded into exported MP3 files and can be sent to the label design. <strong style={{color:T.text}}>ISRC</strong> identifies a specific recording. <strong style={{color:T.text}}>UPC/EAN</strong> identifies the release as a product. <strong style={{color:T.text}}>ISWC</strong> identifies the composition.
            </div>
            <MF T={T} label="ISRC — International Standard Recording Code" hint="Format: CC-XXX-YY-NNNNN · e.g. GB-A3Z-23-00001 · Required for streaming, SoundExchange, PPL">
              <div style={{position:'relative',overflow:'hidden'}}>
                <TInp T={T} value={meta.isrc} onChange={e=>setMeta('isrc',e.target.value.toUpperCase())} placeholder="GB-A3Z-23-00001" style={{borderColor:meta.isrc?(isrcValid(meta.isrc)?'#3fb950':'#f85149'):T.border,paddingRight:76}}/>
                <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:8,color:meta.isrc?(isrcValid(meta.isrc)?'#3fb950':'#f85149'):T.muted,whiteSpace:'nowrap'}}>{meta.isrc?(isrcValid(meta.isrc)?'✓ VALID':'✗ FORMAT'):'XX-XXX-YY-NNNNN'}</span>
              </div>
            </MF>
            <MF T={T} label="UPC / EAN — Universal Product Code" hint="12-digit UPC-A or 13-digit EAN-13 · Obtain via GS1 or your distributor">
              <div style={{position:'relative',overflow:'hidden'}}>
                <TInp T={T} value={meta.upc} onChange={e=>setMeta('upc',e.target.value)} placeholder="012345678905" style={{borderColor:meta.upc?(upcValid(meta.upc)?'#3fb950':'#f85149'):T.border,paddingRight:76}}/>
                <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:8,color:meta.upc?(upcValid(meta.upc)?'#3fb950':'#f85149'):T.muted,whiteSpace:'nowrap'}}>{meta.upc?(upcValid(meta.upc)?'✓ VALID':'✗ 12–13 digits'):'12 or 13 digits'}</span>
              </div>
            </MF>
            <MF T={T} label="ISWC — Int'l Standard Musical Work Code" hint="Identifies the composition (not the recording) · Format: T-XXXXXXXXX-C · Assigned by your PRO (ASCAP, BMI, PRS, SOCAN)">
              <TInp T={T} value={meta.iswc} onChange={e=>setMeta('iswc',e.target.value.toUpperCase())} placeholder="T-345246800-1"/>
            </MF>
            <button onClick={()=>{setF('isrc',meta.isrc);setF('upc',meta.upc);setTab('studio');setStudioSubTab('label');saveLS('tl_studio_sub','label');}} style={{...mkBtn(T,true),width:'100%',padding:'10px 0',marginTop:8}}>→ Send ISRC + UPC to Label</button>
            </div>
            {/* Right — reference guide */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:8,letterSpacing:'0.2em',textTransform:'uppercase',color:T.muted,marginBottom:12}}>How to get your codes</div>

              {/* ISRC card */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0,padding:14,marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:T.bright,marginBottom:8,letterSpacing:'0.06em'}}>ISRC — Two paths</div>
                <div style={{fontSize:9,color:T.accent,fontWeight:700,marginBottom:3,letterSpacing:'0.1em',textTransform:'uppercase'}}>Option 1 — Register yourself</div>
                <div style={{fontSize:9,color:T.text,lineHeight:1.7,marginBottom:6}}>
                  Apply through <a href="https://usisrc.org" target="_blank" rel="noopener" style={{color:T.accent}}>USISRC.org</a> (US) or your country's ISRC agency. You get your own registrant code and can issue unlimited ISRCs forever. One-time fee (~$95 in the US).
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
                  <div style={{fontSize:8,color:'#3fb950',lineHeight:1.6}}><strong>✓ Pros</strong><br/>Full ownership of your codes<br/>Issue as many as you need<br/>No per-code cost after setup<br/>Professional credibility</div>
                  <div style={{fontSize:8,color:'#f85149',lineHeight:1.6}}><strong>✗ Cons</strong><br/>Upfront fee<br/>Application takes a few days<br/>You manage the registry</div>
                </div>
                <div style={{fontSize:9,color:T.accent,fontWeight:700,marginBottom:3,letterSpacing:'0.1em',textTransform:'uppercase'}}>Option 2 — Via distributor</div>
                <div style={{fontSize:9,color:T.text,lineHeight:1.7,marginBottom:4}}>
                  Most distributors (DistroKid, TuneCore, CD Baby, etc.) assign ISRCs automatically when you upload a release. Free, instant, no paperwork.
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  <div style={{fontSize:8,color:'#3fb950',lineHeight:1.6}}><strong>✓ Pros</strong><br/>Free and automatic<br/>No setup required<br/>Handled for you</div>
                  <div style={{fontSize:8,color:'#f85149',lineHeight:1.6}}><strong>✗ Cons</strong><br/>Codes belong to distributor<br/>May be lost if you switch<br/>Less control overall</div>
                </div>
              </div>

              {/* UPC card */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0,padding:14}}>
                <div style={{fontSize:10,fontWeight:700,color:T.bright,marginBottom:8,letterSpacing:'0.06em'}}>UPC — Two paths</div>
                <div style={{fontSize:9,color:T.accent,fontWeight:700,marginBottom:3,letterSpacing:'0.1em',textTransform:'uppercase'}}>Option 1 — Register yourself</div>
                <div style={{fontSize:9,color:T.text,lineHeight:1.7,marginBottom:6}}>
                  Purchase a barcode prefix from <a href="https://www.gs1.org/services/get-barcodes" target="_blank" rel="noopener" style={{color:T.accent}}>GS1.org</a>. GS1 is the official authority; codes are globally unique and tied to your company. Annual fee based on how many products you need.
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
                  <div style={{fontSize:8,color:'#3fb950',lineHeight:1.6}}><strong>✓ Pros</strong><br/>Officially recognized globally<br/>Your brand attached to codes<br/>Accepted everywhere</div>
                  <div style={{fontSize:8,color:'#f85149',lineHeight:1.6}}><strong>✗ Cons</strong><br/>Annual subscription fee<br/>Overkill for small releases</div>
                </div>
                <div style={{fontSize:9,color:T.accent,fontWeight:700,marginBottom:3,letterSpacing:'0.1em',textTransform:'uppercase'}}>Option 2 — Via distributor</div>
                <div style={{fontSize:9,color:T.text,lineHeight:1.7,marginBottom:4}}>
                  Distributors assign a UPC to each release automatically. Same trade-offs as ISRC — easy and free, but you don't own the code.
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  <div style={{fontSize:8,color:'#3fb950',lineHeight:1.6}}><strong>✓ Pros</strong><br/>Free, instant, no effort<br/>Works for most use cases</div>
                  <div style={{fontSize:8,color:'#f85149',lineHeight:1.6}}><strong>✗ Cons</strong><br/>Tied to that distributor<br/>Not portable</div>
                </div>
              </div>
            </div>
          </div>
        )}
        {metaSection==='audio'&&(
          <div style={{maxWidth:540}}>
            <div style={h2S}>Audio File</div>
            <div style={{fontSize:10,color:T.muted,marginBottom:16,padding:12,background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0,lineHeight:1.7}}>
              Upload your audio file. Existing ID3 tags will be read and will auto-fill fields above. The file is stored locally in IndexedDB. Use <strong style={{color:T.text}}>"Export Tagged MP3"</strong> to embed all your metadata — title, artist, BPM, ISRC, UPC, artwork, and more — into the file.
            </div>
            <input ref={audioRef} type="file" accept="audio/*,.mp3,.wav,.flac,.aiff,.aif,.m4a,.ogg" style={{display:'none'}} onChange={e=>e.target.files[0]&&loadAudioFile(e.target.files[0])}/>
            <div onClick={()=>audioRef.current.click()}
              style={{border:`2px dashed ${T.border}`,padding:32,textAlign:'center',cursor:'pointer',marginBottom:16,borderRadius:T.r||0,background:T.bg}}>
              <div style={{fontSize:32,opacity:0.15,marginBottom:8}}>🎵</div>
              <div style={{fontSize:12,color:T.text,marginBottom:4}}>{audioFile?audioFile.name:'Click or drag to upload audio'}</div>
              <div style={{fontSize:9,color:T.muted}}>{audioFile?`${audioFile.type} · ${fmtBytes(audioFile.size)}`:'MP3, WAV, FLAC, AIFF, M4A, OGG'}</div>
            </div>
            {audioFile&&(
              <div>
                {lufsAnalyzing&&(
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:10,padding:'10px 12px',background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
                    <span style={{display:'inline-block',animation:'tl-spin 0.7s linear infinite',fontSize:11}}>⟳</span>
                    <span style={{fontSize:9,color:T.muted,letterSpacing:'0.1em',textTransform:'uppercase'}}>Analyzing audio…</span>
                    <span style={{fontSize:8,color:T.muted,opacity:0.6}}>BS.1770-4 · EBU R128</span>
                  </div>
                )}
                {!lufsAnalyzing&&meta.lufs&&(
                  <div style={{marginBottom:10,padding:'10px 12px',background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
                    <div style={{fontSize:8,letterSpacing:'0.15em',textTransform:'uppercase',color:T.muted,marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${T.border}`}}>Audio Analysis</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px 12px'}}>
                      {[
                        ['LUFS',`${meta.lufs} LUFS`,parseFloat(meta.lufs)>=-14?'#3fb950':parseFloat(meta.lufs)>=-18?'#d29922':'#f85149'],
                        ['LRA',`${meta.lra} LU`,T.text],
                        ['PEAK',meta.samplePeak,parseFloat(meta.samplePeak)>=-1?'#f85149':parseFloat(meta.samplePeak)>=-6?'#d29922':'#3fb950'],
                        ['CREST',meta.crestFactor,T.text],
                        ['DC OFFSET',meta.dcOffset,parseFloat(meta.dcOffset)>0.5?'#d29922':T.text],
                      ].map(([label,val,col])=>(
                        <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                          <span style={{fontSize:8,color:T.muted,letterSpacing:'0.08em'}}>{label}</span>
                          <span style={{fontSize:10,fontWeight:700,color:col,fontFamily:'monospace'}}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'8px 12px',background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
                  {/* Play/Pause — drives the shared audioElRef directly */}
                  <button
                    onClick={()=>{const el=audioElRef.current;if(!el||!audioObjectUrl)return;playing?el.pause():el.play();}}
                    disabled={!audioObjectUrl}
                    style={{width:34,height:34,borderRadius:'50%',border:`1px solid ${audioObjectUrl?T.accent:T.border}`,
                      background:audioObjectUrl?T.accent:'transparent',color:audioObjectUrl?T.bg:T.muted,
                      fontSize:12,cursor:audioObjectUrl?'pointer':'default',display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,fontFamily:'inherit',lineHeight:1}}>
                    {playing?'⏸':'▶'}
                  </button>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:600}}>
                      {meta.title||audioFile.name}
                    </div>
                    <div style={{fontSize:8,color:T.muted,marginTop:2}}>{audioFile.type} · {fmtBytes(audioFile.size)}</div>
                  </div>
                </div>
                <button onClick={exportTaggedAudio} style={{...mkBtn(T,true),width:'100%',padding:'10px 0',marginBottom:6}}>⬇ Export Tagged MP3</button>
                <div style={{fontSize:9,color:T.muted,textAlign:'center',lineHeight:1.6}}>Embeds: Title · Artist · Album · Year · Genre · BPM · ISRC · UPC · ISWC · Composer · Publisher · Copyright · Album Art · Comment · Mood · Producer</div>
              </div>
            )}
          </div>
        )}
        {metaSection==='art'&&(
          <div style={{maxWidth:460}}>
            <div style={h2S}>Album Art</div>
            <MF T={T} label="Output Size">
              <TSel T={T} value={meta.albumArtSize} onChange={e=>{setMeta('albumArtSize',e.target.value);}}>
                {ALBUM_ART_SIZES.map(s=><option key={s.val} value={s.val}>{s.label}</option>)}
              </TSel>
            </MF>
            <input ref={artRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadAlbumArt(e.target.files[0])}/>
            {meta.albumArt&&!meta.albumArt.startsWith('[stored]')?(
              <div>
                <div style={{width:'100%',aspectRatio:'1',marginBottom:10,position:'relative',overflow:'hidden',border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
                  <img src={meta.albumArt} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} alt="Album art"/>
                  <div style={{position:'absolute',top:8,right:8,background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:9,padding:'3px 7px',borderRadius:T.r||0}}>{meta.albumArtSize}×{meta.albumArtSize}</div>
                </div>
                <div style={{display:'flex',gap:6,marginBottom:10}}>
                  <button onClick={()=>artRef.current.click()} style={{...mkBtn(T),flex:1,fontSize:9}}>↺ Replace</button>
                  <button onClick={()=>{const a=document.createElement('a');a.href=meta.albumArt;a.download=`${(meta.title||'artwork').replace(/\s+/g,'-')}-${meta.albumArtSize}px.jpg`;a.click();}} style={{...mkBtn(T,true),flex:1,fontSize:9}}>⬇ Export JPG</button>
                  <button onClick={()=>setMeta('albumArt',null)} style={{...mkBtn(T),fontSize:9,padding:'8px 10px',color:'#f87171'}}>✕</button>
                </div>
                <div style={{fontSize:9,color:T.muted,padding:10,background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0,lineHeight:1.8}}>
                  <div><strong style={{color:T.text}}>Streaming (Apple, Spotify, Tidal)</strong> — 3000×3000 px minimum</div>
                  <div><strong style={{color:T.text}}>Bandcamp</strong> — 1400×1400 px minimum</div>
                  <div><strong style={{color:T.text}}>Physical CD</strong> — 300 DPI at print size (~1200×1200 for 4×4")</div>
                </div>
              </div>
            ):(
              <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();loadAlbumArt(e.dataTransfer.files[0]);}} onClick={()=>artRef.current.click()}
                style={{width:'100%',aspectRatio:'1',border:`2px dashed ${T.border}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',gap:10,background:T.bg,borderRadius:T.r||0}}>
                <div style={{fontSize:40,opacity:0.15}}>🖼</div>
                <div style={{fontSize:11,color:T.muted,textAlign:'center',lineHeight:1.6}}>Click or drag to upload<br/>Auto-cropped to square at {meta.albumArtSize}×{meta.albumArtSize}px</div>
                <div style={{fontSize:8,color:T.muted}}>JPG · PNG · WEBP · TIFF</div>
              </div>
            )}
          </div>
        )}
        {metaSection==='analysis'&&(
          <div style={{width:'100%',minWidth:0}}>
            <AnalysisPanel T={T} meta={meta} audioFile={audioFile} lufsAnalyzing={lufsAnalyzing} recalculate={recalculateAnalysis} analyserNode={analyserNode}/>
          </div>
        )}
        {metaSection==='extra'&&(
          <div style={{maxWidth:540}}>
            <div style={h2S}>Extra Tags</div>
            {/* ── Audio Analysis block (read-only, auto-populated on file upload) ── */}
            <div style={{marginBottom:16,padding:'10px 12px',background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
              <div style={{fontSize:8,letterSpacing:'0.15em',textTransform:'uppercase',color:T.muted,marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Audio Analysis — ITU-R BS.1770-4 / EBU R128</span>
                {lufsAnalyzing&&<span style={{display:'inline-block',animation:'tl-spin 0.7s linear infinite'}}>⟳</span>}
              </div>
              {[
                {key:'lufs',label:'Integrated Loudness',hint:'K-weighted integrated loudness (LUFS). Streaming targets: Spotify −14, Apple −16, YouTube −14.',
                  color:v=>parseFloat(v)>=-14?'#3fb950':parseFloat(v)>=-18?'#d29922':'#f85149',
                  badge:v=>parseFloat(v)>=-14?'▲ streaming-loud':parseFloat(v)>=-18?'◆ broadcast range':'▼ quiet master'},
                {key:'lra',label:'Loudness Range (LRA)',hint:'Difference between loud and quiet sections in Loudness Units. Higher = more dynamic. Typical music: 6–15 LU.',
                  color:()=>T.text,badge:()=>null},
                {key:'samplePeak',label:'Sample Peak',hint:'Highest absolute sample value in dBFS. Above −1 dBFS risks inter-sample clipping after encode.',
                  color:v=>parseFloat(v)>=-1?'#f85149':parseFloat(v)>=-6?'#d29922':'#3fb950',
                  badge:v=>parseFloat(v)>=-1?'▲ clipping risk':parseFloat(v)>=-6?'◆ hot':'▼ safe headroom'},
                {key:'crestFactor',label:'Crest Factor',hint:'Peak-to-RMS ratio in dB. Low values (< 8 dB) indicate heavy limiting/compression.',
                  color:()=>T.text,badge:()=>null},
                {key:'dcOffset',label:'DC Offset',hint:'Mean signal displacement as % of peak. Values above 0.5% may cause clicks at edit points and reduce headroom.',
                  color:v=>parseFloat(v)>0.5?'#d29922':T.text,
                  badge:v=>parseFloat(v)>0.5?'⚠ remove before mastering':null},
              ].map(({key,label,hint,color,badge})=>(
                <MF key={key} T={T} label={label} hint={hint}>
                  <div style={{position:'relative',overflow:'hidden'}}>
                    <TInp T={T} value={lufsAnalyzing?'Analyzing…':(meta[key]||'')} readOnly
                      placeholder="Upload an audio file to analyze…"
                      style={{cursor:'default',
                        color:lufsAnalyzing?T.muted:(meta[key]?color(meta[key]):undefined),
                        fontWeight:(!lufsAnalyzing&&meta[key])?700:'normal',
                        fontStyle:lufsAnalyzing?'italic':undefined,
                        paddingRight:badge&&meta[key]&&!lufsAnalyzing?120:undefined}}/>
                    {!lufsAnalyzing&&meta[key]&&badge(meta[key])&&
                      <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:7,color:T.muted,pointerEvents:'none',whiteSpace:'nowrap'}}>
                        {badge(meta[key])}
                      </span>}
                  </div>
                </MF>
              ))}
            </div>
            <MF T={T} label="Mood"><TInp T={T} value={meta.mood} onChange={e=>setMeta('mood',e.target.value)} placeholder="e.g. Dark, Hypnotic, Euphoric"/></MF>
            <MF T={T} label="Language"><TInp T={T} value={meta.language} onChange={e=>setMeta('language',e.target.value)} placeholder="e.g. English / eng"/></MF>
            <MF T={T} label="Grouping / Work"><TInp T={T} value={meta.grouping} onChange={e=>setMeta('grouping',e.target.value)} placeholder="Movement or work grouping"/></MF>
            <MF T={T} label="Encoder / Tool"><TInp T={T} value={meta.encoder} onChange={e=>setMeta('encoder',e.target.value)} placeholder="e.g. Ableton Live 12"/></MF>
            <MF T={T} label="Comment"><TTxt T={T} value={meta.comment} onChange={e=>setMeta('comment',e.target.value)} style={{minHeight:80}}/></MF>
          </div>
        )}
        {metaSection==='lyrics'&&(
          <div style={{maxWidth:600}}>
            <div style={h2S}>Lyrics / Notes</div>
            <MF T={T} label="Lyrics" hint="Full lyrics for this track. Not embedded in MP3 exports via the ID3 writer — use a dedicated tag editor (Mp3tag, Kid3) to embed USLT lyrics.">
              <div style={{position:'relative'}}>
                <TTxt T={T} value={meta.lyrics} onChange={e=>setMeta('lyrics',e.target.value)} style={{minHeight:260,fontFamily:'"Courier Prime",monospace',fontSize:12,lineHeight:1.8}}/>
                <div style={{position:'absolute',bottom:6,right:8,fontSize:7,color:T.muted,pointerEvents:'none'}}>
                  {meta.lyrics?(meta.lyrics.trim().split(/\n/).length)+' lines · '+(meta.lyrics.trim().split(/\s+/).filter(Boolean).length)+' words':'empty'}
                </div>
              </div>
            </MF>
            <MF T={T} label="Production Notes" hint="Private notes: session details, plugin chains, stem locations, mix references, etc. Never exported.">
              <TTxt T={T} value={meta.notes} onChange={e=>setMeta('notes',e.target.value)} style={{minHeight:120,fontSize:11,lineHeight:1.7}}/>
            </MF>
          </div>
        )}
        {metaSection==='splits'&&(
          <SplitSheet T={T} credits={credits} onChange={setCredits} trackTitle={meta.title||fields.title||''}/>
        )}
        {metaSection==='summary'&&(
          <div style={{maxWidth:560}}>
            <div style={h2S}>Tag Summary</div>
            <div style={{fontFamily:'monospace',fontSize:10,lineHeight:2.2,background:T.card,padding:16,border:`1px solid ${T.border}`,borderRadius:T.r||0,marginBottom:14}}>
              {[['TITLE',meta.title],['ARTIST',meta.artist],['ALBUM ARTIST',meta.albumArtist],['ALBUM',meta.album],['YEAR',meta.year],['TRACK',[meta.trackNum,meta.trackTotal].filter(Boolean).join('/')],['DISC',[meta.discNum,meta.discTotal].filter(Boolean).join('/')],['GENRE',meta.genre],['BPM',meta.bpm],['KEY',meta.key],['LUFS',meta.lufs||null],['LRA',meta.lra?`${meta.lra} LU`:null],['PEAK',meta.samplePeak||null],['CREST',meta.crestFactor||null],['DC OFFSET',meta.dcOffset||null],['ISRC',meta.isrc],['UPC',meta.upc],['ISWC',meta.iswc],['COMPOSER',meta.composer],['LYRICIST',meta.lyricist],['PRODUCER',meta.producer],['PUBLISHER',meta.publisher],['LABEL',meta.label],['CATALOG',meta.catalog],['COPYRIGHT',meta.copyright],['LANGUAGE',meta.language],['MOOD',meta.mood],['COMMENT',meta.comment]].filter(([,v])=>v).map(([k,v])=>{
                const analysisCols={
                  'LUFS':parseFloat(v)>=-14?'#3fb950':parseFloat(v)>=-18?'#d29922':'#f85149',
                  'PEAK':parseFloat(v)>=-1?'#f85149':parseFloat(v)>=-6?'#d29922':'#3fb950',
                  'DC OFFSET':parseFloat(v)>0.5?'#d29922':undefined,
                };
                const col=analysisCols[k]||T.bright;
                return(
                <div key={k} style={{display:'flex',gap:12,borderBottom:`1px solid ${T.border}44`,paddingBottom:1}}>
                  <span style={{color:T.muted,minWidth:120,flexShrink:0}}>{k}</span>
                  <span style={{color:col,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:analysisCols[k]?700:'normal'}}>{v}</span>
                </div>
              );})}
              {meta.explicit&&<div style={{display:'flex',gap:12}}><span style={{color:T.muted,minWidth:120}}>EXPLICIT</span><span style={{color:T.bright}}>Yes</span></div>}
              {meta.albumArt&&<div style={{display:'flex',gap:12}}><span style={{color:T.muted,minWidth:120}}>ARTWORK</span><span style={{color:'#3fb950'}}>✓ {meta.albumArtSize}×{meta.albumArtSize}px embedded</span></div>}
              {audioFile&&<div style={{display:'flex',gap:12}}><span style={{color:T.muted,minWidth:120}}>AUDIO FILE</span><span style={{color:'#3fb950'}}>✓ {audioFile.name}</span></div>}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={sendMetaToLabel} style={{...mkBtn(T,true),flex:1,padding:'9px 0',fontSize:9}}>→ Send All to Label</button>
              <button onClick={exportTaggedAudio} style={{...mkBtn(T),flex:1,padding:'9px 0',fontSize:9}}>⬇ Export Tagged MP3</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  // ━━━━━━━━ CLASSIFY TAB ━━━━━━━━
  const classifyTab=(
    <div style={{maxWidth:820,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{padding:'14px 18px',marginBottom:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:T.r||0,display:'flex',gap:14,alignItems:'flex-start'}}>
        <div style={{fontSize:22,flexShrink:0,opacity:0.5,lineHeight:1}}>◈</div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:T.bright,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:6}}>Personal Classification System</div>
          <div style={{fontSize:10,color:T.text,lineHeight:1.75,maxWidth:640}}>
            This is a <strong style={{color:T.bright}}>Track Lab–exclusive</strong> system for your own personal organization — it is not an industry standard, not recognized by streaming platforms, and carries no formal meaning outside of this app. Think of it as a private tagging shorthand: a four-character code that lets you quickly sort, search, and group your tracks by genre, mood, tempo, and texture in a way that makes sense to you.
          </div>
          <div style={{fontSize:9,color:T.muted,marginTop:8,lineHeight:1.65}}>
            Pick descriptors for each position, or hit <strong style={{color:T.muted}}>🎲 Random</strong> to generate one. Save codes to the Catalog to reuse them across tracks. Attach a code to the active archive entry with <strong style={{color:T.muted}}>⬆ Save to Entry</strong>. Use <strong style={{color:T.muted}}>📥 Export Guide</strong> to download the full reference sheet.
          </div>
        </div>
      </div>
      <div style={{...mkCard(T)}}>
        <div style={h2S}>Build Classification Code</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          {Object.entries(CLS).map(([key,data])=>(
            <div key={key}>
              <label style={mkLBL(T)}>{data.name}</label>
              <TSel T={T} value={sel[key]} onChange={e=>setSel({...sel,[key]:e.target.value})}>
                <option value="">— Random —</option>
                {Object.entries(data.options).map(([n,d])=><option key={n} value={n}>{n} — {d}</option>)}
              </TSel>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={generateCode} style={{...mkBtn(T,true),flex:1,padding:'10px 0'}}>Generate Code</button>
          <button onClick={randomGenerate} style={{...mkBtn(T),padding:'10px 14px'}}>🎲 Random</button>
          <button onClick={exportGuide} style={{...mkBtn(T),padding:'10px 12px',fontSize:9}}>📥 Export Guide</button>
        </div>
      </div>
      {genCode&&(
        <div style={{...mkCard(T),textAlign:'center'}}>
          <div style={{fontSize:52,fontFamily:'monospace',fontWeight:700,color:T.accent,marginBottom:6,letterSpacing:'0.1em'}}>{genCode}</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:16,lineHeight:1.5}}>{getCodeDesc(genCode)}</div>
          <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}>
            <button onClick={()=>{navigator.clipboard.writeText(genCode);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={mkBtn(T)}>{copied?'✓ Copied':'📋 Copy'}</button>
            <button onClick={saveCode} style={mkBtn(T)}>💾 Save to Catalog</button>
            <button onClick={()=>sendToLabel(genCode)} style={mkBtn(T,true)}>🏷 Make Label →</button>
            {activeEid&&<button onClick={()=>{updateEntry(activeEid,{classCode:genCode});setF('classCode',genCode);setF('classDesc',getCodeDesc(genCode));}} style={mkBtn(T)}>⬆ Save to Entry</button>}
          </div>
        </div>
      )}
      <div style={{...mkCard(T)}}>
        <div style={h2S}>Decode a Code</div>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <TInp T={T} value={decInput} onChange={e=>setDecInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&decodeCode()} placeholder="e.g. 142.7 or S3K.F" style={{flex:1,fontSize:16,fontFamily:'monospace',letterSpacing:'0.15em'}}/>
          <button onClick={decodeCode} style={{...mkBtn(T,true),padding:'8px 18px'}}>Decode</button>
        </div>
        {decResult&&(
          <div style={{padding:14,background:decResult.valid?rgba(T.accent,0.06):rgba('#f85149',0.08),border:`1px solid ${decResult.valid?rgba(T.accent,0.3):'#5a1e1e'}`,borderRadius:T.r||0}}>
            {decResult.valid?(
              <div>
                <div style={{fontSize:36,fontFamily:'monospace',fontWeight:700,color:T.accent,textAlign:'center',marginBottom:6,letterSpacing:'0.1em'}}>{decResult.code}</div>
                <div style={{fontSize:10,color:T.muted,textAlign:'center',marginBottom:14,paddingBottom:12,borderBottom:`1px solid ${T.border}`}}>{decResult.full}</div>
                <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:14}}>
                  {decResult.bd.map(item=>(
                    <div key={item.p} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 10px',background:T.bg,borderRadius:T.r||0,border:`1px solid ${T.border}`}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:T.accent,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontWeight:700,flexShrink:0,fontSize:13}}>{item.v}</div>
                      <div><div style={{fontSize:8,color:T.muted,letterSpacing:'0.1em',marginBottom:2}}>{item.cat}</div><div style={{fontSize:12,color:T.bright}}>{item.m}</div></div>
                    </div>
                  ))}
                </div>
                <button onClick={()=>sendToLabel(decResult.code)} style={{...mkBtn(T,true),width:'100%',padding:'10px 0'}}>🏷 Send to Label →</button>
              </div>
            ):(
              <div style={{color:'#f85149',textAlign:'center',fontSize:12}}>{decResult.error}</div>
            )}
          </div>
        )}
      </div>
      <div style={mkCard(T)}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}} onClick={()=>setShowGuide(!showGuide)}>
          <span style={{fontSize:10,color:T.text}}>Classification Reference Guide</span>
          <span style={{color:T.accent,fontSize:10}}>{showGuide?'▴ Hide':'▾ Show'}</span>
        </div>
        {showGuide&&(
          <div style={{marginTop:14,display:'flex',flexDirection:'column',gap:10}}>
            {Object.entries(CLS).map(([k,d])=>(
              <div key={k} style={{background:T.bg,padding:12,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
                <div style={{fontSize:10,fontWeight:700,color:T.accent,marginBottom:8}}>Position {k.replace('digit','')}: {d.name}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:3}}>
                  {Object.entries(d.options).map(([n,dd])=>(
                    <div key={n} style={{fontSize:9,color:T.text,display:'flex',gap:6}}>
                      <span style={{fontFamily:'monospace',fontWeight:700,color:T.accent,minWidth:14}}>{n}</span>
                      <span style={{color:T.muted}}>{dd}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ━━━━━━━━ LABEL TAB ━━━━━━━━
  // Derived batch values — must precede labelTab JSX since they're referenced inline
  const batchDone=batchProgress?.done??0;
  const batchTotal=batchProgress?.total??0;
  const batchPct=batchTotal>0?Math.round(batchDone/batchTotal*100):0;
  const batchOk=batchLog.filter(r=>r.ok).length;
  const batchFail=batchLog.filter(r=>!r.ok).length;
  const labelTab=(
    <div style={{display:'flex',minHeight:'calc(100vh - 88px)'}}>
      {/* PANEL */}
      <div style={{width:labelPanel.width,flexShrink:0,background:T.panel,borderRight:labelPanel.collapsed?'none':`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',transition:'width 0.15s'}}>
        <div {...labelPanel.handle}/>
        {labelPanel.tab}
        <div style={{display:'flex',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          {[['content','Content'],['style','Style'],['presets','Presets']].map(([id,lbl])=>(
            <button key={id} onClick={()=>setPanelTab(id)} style={{flex:1,padding:'9px 0',background:'transparent',color:panelTab===id?T.accent:T.muted,border:'none',borderBottom:panelTab===id?`2px solid ${T.accent}`:'2px solid transparent',fontFamily:'inherit',fontSize:8,letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer'}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'8px 12px'}}>
          {panelTab==='content'&&(
            <>
              {/* ── ID3 AUTO-FILL ─────────────────────────────────────── */}
              <div style={{marginBottom:8,padding:'8px 10px',background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
                <div style={{fontSize:7,letterSpacing:'0.18em',textTransform:'uppercase',color:T.muted,marginBottom:6}}>Auto-fill from Audio File</div>
                <input ref={labelTagFileRef} type="file" accept="audio/*,.mp3,.wav,.flac,.aiff,.aif,.m4a,.ogg" style={{display:'none'}}
                  onChange={e=>{const f=e.target.files[0];if(f)readLabelTags(f);e.target.value='';}}/>
                {/* Drop zone */}
                <div
                  onClick={()=>labelTagFileRef.current.click()}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)readLabelTags(f);}}
                  style={{
                    border:`1px dashed ${labelTagStatus==='reading'?T.accent:T.border}`,
                    padding:'8px 10px',textAlign:'center',cursor:'pointer',
                    borderRadius:T.r||0,background:T.panel,transition:'border-color 0.15s',
                  }}
                >
                  {labelTagStatus==='reading'
                    ?<span style={{fontSize:9,color:T.accent,letterSpacing:'0.1em'}}><span className="tl-spin" style={{marginRight:5}}>↻</span>Reading tags…</span>
                    :<span style={{fontSize:9,color:T.muted}}>Drop audio · or click to pick file</span>
                  }
                </div>
                {/* Result strip */}
                {labelTagStatus&&labelTagStatus!=='reading'&&(
                  <div style={{marginTop:6,fontSize:8,lineHeight:1.7}}>
                    {labelTagStatus.err
                      ?<span style={{color:'#f87171'}}>✗ {labelTagStatus.err}</span>
                      :(()=>{
                          const {found,filled}=labelTagStatus;
                          const rows=[
                            ['Title',   found.title,  filled.title],
                            ['Artist',  found.artist, filled.artist],
                            ['BPM',     found.bpm,    filled.bpm],
                          ].filter(([,v])=>v);
                          if(!rows.length)return<span style={{color:T.muted}}>No title / artist / BPM tags found in this file.</span>;
                          return rows.map(([label,val,wasFilled])=>(
                            <div key={label} style={{display:'flex',gap:6,alignItems:'center'}}>
                              <span style={{color:T.muted,minWidth:36}}>{label}</span>
                              <span style={{color:wasFilled?T.accent:T.muted,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{val||'—'}</span>
                              <span style={{fontSize:7,color:wasFilled?'#3fb950':T.muted,flexShrink:0,letterSpacing:'0.06em'}}>{wasFilled?'FILLED':'SKIPPED'}</span>
                            </div>
                          ));
                        })()
                    }
                  </div>
                )}
              </div>
              {/* ────────────────────────────────────────────────────────── */}
              <Accordion T={T} title="Identity" defaultOpen>
                <F T={T} label="Artist / Project"><TInp T={T} value={fields.artist} onChange={e=>setF('artist',e.target.value)}/></F>
                <Row2>
                  <F T={T} label="Catalog #"><TInp T={T} value={fields.catalog} onChange={e=>setF('catalog',e.target.value)}/></F>
                  <F T={T} label="Track #"><TInp T={T} value={fields.trackNum} onChange={e=>setF('trackNum',e.target.value)}/></F>
                </Row2>
              </Accordion>
              <Accordion T={T} title="Track Title" defaultOpen>
                <TInp T={T} value={fields.title} onChange={e=>setF('title',e.target.value)}/>
              </Accordion>
              <Accordion T={T} title="Meta Row Fields">
                <MetaFieldsPanel T={T} settings={settings} setS={setS}/>
              </Accordion>
              <Accordion T={T} title="Classification Code">
                <Row2>
                  <F T={T} label="Code (XXX.X)"><TInp T={T} value={fields.classCode} onChange={e=>{setF('classCode',e.target.value.toUpperCase());setF('classDesc',getCodeDesc(e.target.value.toUpperCase()));}}/></F>
                  <F T={T} label=" "><button onClick={()=>setTab('classify')} style={{...mkBtn(T),width:'100%',marginTop:11,fontSize:9}}>← Classify</button></F>
                </Row2>
                {fields.classCode&&<div style={{fontSize:9,color:T.muted,marginBottom:6,lineHeight:1.4}}>{getCodeDesc(fields.classCode)||'Enter a valid code'}</div>}
                <Tog T={T} label="Show code on label" value={settings.showClass} onChange={v=>setS({showClass:v})}/>
              </Accordion>
              <Accordion T={T} title="ISRC / UPC">
                <Row2>
                  <F T={T} label="ISRC"><TInp T={T} value={fields.isrc} onChange={e=>setF('isrc',e.target.value)}/></F>
                  <F T={T} label="UPC / EAN"><TInp T={T} value={fields.upc} onChange={e=>setF('upc',e.target.value)}/></F>
                </Row2>
                <Tog T={T} label="Show codes on label" value={settings.showCodes} onChange={v=>setS({showCodes:v})}/>
                <Tog T={T} label="Codes in footer strip" value={settings.codesInFooter} onChange={v=>setS({codesInFooter:v})}/>
              </Accordion>
              <Accordion T={T} title="Notes / Description">
                <TTxt T={T} value={fields.description} onChange={e=>setF('description',e.target.value)} style={{minHeight:72}}/>
                <Tog T={T} label="Show notes" value={settings.showDesc} onChange={v=>setS({showDesc:v})}/>
              </Accordion>
              <Accordion T={T} title="Tags">
                <div style={{fontSize:9,color:T.muted,marginBottom:4}}>Comma-separated</div>
                <TInp T={T} value={fields.tags} onChange={e=>setF('tags',e.target.value)} placeholder="dark, industrial, hypnotic"/>
                <Tog T={T} label="Show tags" value={settings.showTags} onChange={v=>setS({showTags:v})}/>
              </Accordion>
              <Accordion T={T} title="QR Code / URL">
                <F T={T} label="URL"><TInp T={T} value={fields.url} onChange={e=>setF('url',e.target.value)} placeholder="https://soundcloud.com/…"/></F>
                <F T={T} label="QR Caption"><TInp T={T} value={settings.qrCaption} onChange={e=>setS({qrCaption:e.target.value})}/></F>
                <Tog T={T} label="Show QR code" value={settings.showQR} onChange={v=>setS({showQR:v})}/>
                <Tog T={T} label="Float QR (free position)" value={settings.qrFloat} onChange={v=>setS({qrFloat:v})}/>
                {settings.qrFloat&&<Row2><F T={T} label="X px"><TInp T={T} type="number" value={settings.qrFloatX} onChange={e=>setS({qrFloatX:+e.target.value})}/></F><F T={T} label="Y px"><TInp T={T} type="number" value={settings.qrFloatY} onChange={e=>setS({qrFloatY:+e.target.value})}/></F></Row2>}
              </Accordion>
              <Accordion T={T} title="Dithered Image">
                <DitherPanel T={T} settings={settings} setS={setS}/>
              </Accordion>
              <Accordion T={T} title="Free Text Blocks">
                <TextBlocksPanel T={T} settings={settings} setS={setS}/>
              </Accordion>
              <div style={{marginTop:10}}>
                <button onClick={sendMetaToLabel} style={{...mkBtn(T,true),width:'100%',padding:'8px 0',fontSize:9}}>← Pull from Tags</button>
              </div>
            </>
          )}
          {panelTab==='style'&&(
            <>
              <Accordion T={T} title="Size & Dimensions" defaultOpen>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                  {SIZE_PRESETS.map(p=><button key={p.name} onClick={()=>setS({labelW:p.w,labelH:p.h})} style={{...mkBtn(T,(settings.labelW===p.w&&settings.labelH===p.h)),padding:'4px 7px',fontSize:8}}>{p.name}</button>)}
                </div>
                <Row2>
                  <F T={T} label="W px"><TInp T={T} type="number" min={100} max={1200} value={settings.labelW} onChange={e=>setS({labelW:+e.target.value})}/></F>
                  <F T={T} label="H px"><TInp T={T} type="number" min={100} max={1200} value={settings.labelH} onChange={e=>setS({labelH:+e.target.value})}/></F>
                </Row2>
                <F T={T} label={`Outer border: ${settings.outerBorder}px`}><input type="range" min={0} max={10} value={settings.outerBorder} onChange={e=>setS({outerBorder:+e.target.value})} style={{width:'100%'}}/></F>
              </Accordion>
              <Accordion T={T} title="Color Scheme" defaultOpen>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                  {Object.entries(BASE_SCHEMES).map(([key,sc])=>(
                    <button key={key} onClick={()=>setS({scheme:key})} style={{...mkBtn(T,settings.scheme===key),padding:'4px 8px',fontSize:8}}>{sc.n}</button>
                  ))}
                </div>
                <Tog T={T} label="Background gradient" value={settings.useGradient} onChange={v=>setS({useGradient:v})}/>
                {settings.scheme==='custom'&&(
                  <div style={{marginTop:8}}>
                    {[['bg','Background'],['fg','Foreground'],['bannerBg','Banner BG'],['bannerFg','Banner FG'],['metaBg','Meta Bar BG'],['metaFg','Meta Bar FG'],['accent','Accent'],['sub','Subtext'],['border','Borders'],['strip','Footer Strip'],['codeBg','Code BG'],['codeFg','Code Text']].map(([k,lbl])=>(
                      <ColorRow key={k} T={T} label={lbl} hex={settings.customColors[k]} onHex={hex=>setS(s=>({...s,scheme:'custom',customColors:{...s.customColors,[k]:hex}}))}/>
                    ))}
                    <ColorRow T={T} label="Gradient Color 2" hex={settings.gradColor2} onHex={hex=>setS({gradColor2:hex})}/>
                  </div>
                )}
              </Accordion>
              <Accordion T={T} title="Font">
                <F T={T} label="Font Family"><TSel T={T} value={settings.font} onChange={e=>setS({font:e.target.value})}>{Object.entries(FONTS).map(([k,f])=><option key={k} value={k}>{f.name}</option>)}</TSel></F>
              </Accordion>
              <Accordion T={T} title="Typography">
                <div style={{fontSize:9,color:T.accent,marginBottom:6,letterSpacing:'0.1em'}}>ARTIST</div>
                <Row2><F T={T} label="Size"><TInp T={T} type="number" min={8} max={40} value={settings.artistSize} onChange={e=>setS({artistSize:+e.target.value})}/></F><div style={{display:'flex',gap:6,alignItems:'flex-end',paddingBottom:7}}><Tog T={T} label="Bold" value={settings.artistBold} onChange={v=>setS({artistBold:v})}/><Tog T={T} label="Italic" value={settings.artistItalic} onChange={v=>setS({artistItalic:v})}/></div></Row2>
                <div style={{fontSize:9,color:T.accent,marginBottom:6,letterSpacing:'0.1em'}}>TITLE</div>
                <Row2><F T={T} label="Size"><TInp T={T} type="number" min={10} max={72} value={settings.titleSize} onChange={e=>setS({titleSize:+e.target.value})}/></F><div style={{display:'flex',gap:6,alignItems:'flex-end',paddingBottom:7}}><Tog T={T} label="Bold" value={settings.titleBold} onChange={v=>setS({titleBold:v})}/><Tog T={T} label="Italic" value={settings.titleItalic} onChange={v=>setS({titleItalic:v})}/></div></Row2>
                <F T={T} label="Title Align"><TSel T={T} value={settings.titleAlign} onChange={e=>setS({titleAlign:e.target.value})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></TSel></F>
                <div style={{fontSize:9,color:T.accent,marginBottom:6,letterSpacing:'0.1em'}}>BODY TEXT</div>
                <Row2><F T={T} label="Size"><TInp T={T} type="number" min={6} max={20} value={settings.bodySize} onChange={e=>setS({bodySize:+e.target.value})}/></F><F T={T} label="Meta Size"><TInp T={T} type="number" min={6} max={20} value={settings.metaSize} onChange={e=>setS({metaSize:+e.target.value})}/></F></Row2>
              </Accordion>
              <Accordion T={T} title="Sections & Borders">
                {[['showBanner','Artist Banner'],['showMeta','Meta Row'],['showClass','Classification'],['showDesc','Notes'],['showTags','Tags'],['showCodes','ISRC/UPC Bar'],['showQR','QR Code'],['showFooter','Footer Strip']].map(([k,lbl])=>(
                  <Tog key={k} T={T} label={lbl} value={settings[k]} onChange={v=>setS({[k]:v})}/>
                ))}
                <div style={{borderTop:`1px solid ${T.border}`,marginTop:8,paddingTop:8}}>
                  <div style={{fontSize:8,color:T.muted,marginBottom:6,letterSpacing:'0.12em',textTransform:'uppercase'}}>Section Dividers</div>
                  {Object.keys(settings.borders||{}).map(k=>(
                    <Tog key={k} T={T} label={k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())} value={settings.borders[k]} onChange={v=>setS(s=>({...s,borders:{...s.borders,[k]:v}}))}/>
                  ))}
                </div>
              </Accordion>
            </>
          )}
          {panelTab==='presets'&&(
            <PresetPanel T={T} settings={settings} presets={presets} lastId={lastPid}
              onSave={name=>{const p={id:mkUid(),name,settings:{...settings}};setPresets([...presets,p]);}}
              onLoad={p=>{setS(()=>({...DEFAULT_SETTINGS,...p.settings}));setLastPid(p.id);saveLS('tl_last_preset',p.id);}}
              onDelete={id=>setPresets(presets.filter(p=>p.id!==id))}/>
          )}
        </div>
        <div style={{padding:'8px 12px',paddingBottom:12,borderTop:`1px solid ${T.border}`,flexShrink:0,display:'flex',flexDirection:'column',gap:5}}>
          <div style={{display:'flex',gap:6}}>
            <TSel T={T} value={settings.exportFormat} onChange={e=>setS({exportFormat:e.target.value})} style={{flex:1}}>
              <option value="png">PNG</option><option value="jpeg">JPG</option>
            </TSel>
            <TSel T={T} value={settings.exportScale} onChange={e=>setS({exportScale:+e.target.value})} style={{width:70}}>
              <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option><option value={4}>4×</option>
            </TSel>
          </div>
          <button onClick={exportLabel} disabled={exporting} style={{...mkBtn(T,true),width:'100%',padding:'10px 0'}}>
            {exporting?'Rendering…':'⬇ Export Label'}
          </button>
          {exportMsg&&<div style={{fontSize:9,color:T.muted,textAlign:'center'}}>{exportMsg}</div>}
          <button onClick={()=>setShowBatch(b=>!b)} style={{...mkBtn(T,true),width:'100%',padding:'10px 0'}}>
            {showBatch?'✕ Close Batch':'⊞ Batch Export…'}
          </button>
        </div>
      </div>
      {labelPanel.expandStub}
      {/* PREVIEW / BATCH PANEL */}
      {showBatch?(
        /* ── INLINE BATCH PANEL ── */
        <div style={{flex:1,display:'flex',overflowY:'auto'}}>
          {/* Controls column */}
          {batchPanel.expandStub}
          <div style={{width:batchPanel.width,flexShrink:0,borderLeft:batchPanel.collapsed?'none':`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',background:T.panel,position:'relative',transition:'width 0.15s'}}>
            <div {...batchPanel.handle}/>
            {batchPanel.tab}
            <div style={{padding:'10px 12px 8px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
              <div style={{fontSize:10,fontWeight:700,color:T.bright,letterSpacing:'0.06em',marginBottom:1}}>Batch Label Export</div>
              <div style={{fontSize:7,color:T.muted,lineHeight:1.5}}>Select tracks · configure · export ZIP of PNG labels</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
              {/* Profile filter */}
              <div style={{marginBottom:9}}>
                <label style={mkLBL(T)}>Profile</label>
                <select value={batchPidFilter} onChange={e=>{setBatchPidFilter(e.target.value);batchSelectNone();}} style={{...mkIS(T),fontSize:10}}>
                  <option value="all">All Profiles ({entries.length})</option>
                  {profiles.map(p=>(
                    <option key={p.id} value={p.id}>{p.name} ({entries.filter(e=>e.profileId===p.id).length})</option>
                  ))}
                </select>
              </div>
              {/* Scale */}
              <div style={{marginBottom:9}}>
                <label style={mkLBL(T)}>Export Scale</label>
                <div style={{display:'flex',gap:3}}>
                  {[[1,'1×'],[2,'2×'],[3,'3×'],[4,'4×']].map(([v,lbl])=>(
                    <button key={v} onClick={()=>setBatchScale(v)} style={{...mkBtn(T,batchScale===v),flex:1,padding:'4px 0',fontSize:9}}>{lbl}</button>
                  ))}
                </div>
                <div style={{fontSize:7,color:T.muted,marginTop:3}}>384×576 → {384*batchScale}×{576*batchScale}px</div>
              </div>
              {/* Stats strip */}
              <div style={{display:'flex',gap:0,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0,marginBottom:9,overflow:'hidden'}}>
                {[['Selected',batchIds.size,batchIds.size>0?T.accent:T.muted],['Visible',batchVisibleEntries.length,T.bright],['Total',entries.length,T.bright]].map(([lbl,val,col],i)=>(
                  <div key={lbl} style={{flex:1,padding:'6px 8px',borderLeft:i>0?`1px solid ${T.border}`:'none',textAlign:'center'}}>
                    <div style={{fontSize:12,fontWeight:700,color:col,lineHeight:1}}>{val}</div>
                    <div style={{fontSize:6,color:T.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginTop:2}}>{lbl}</div>
                  </div>
                ))}
              </div>
              {/* Progress */}
              {batchProgress&&(
                <div style={{marginBottom:9}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontSize:7,color:T.text}}>{batchRunning?'Rendering…':'Complete'}</span>
                    <span style={{fontSize:7,color:T.accent,fontVariantNumeric:'tabular-nums'}}>{batchDone}/{batchTotal} · {batchPct}%</span>
                  </div>
                  <div style={{height:3,background:T.muted,borderRadius:2,overflow:'hidden',marginBottom:5}}>
                    <div style={{height:'100%',width:`${batchPct}%`,background:T.accent,borderRadius:2,transition:'width 0.2s ease'}}/>
                  </div>
                  {batchRunning&&batchProgress.currentTitle&&(
                    <div style={{fontSize:7,color:T.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      <span className="tl-spin" style={{marginRight:3}}>↻</span>{batchProgress.currentTitle}
                    </div>
                  )}
                  {!batchRunning&&batchLog.length>0&&(
                    <div style={{fontSize:7,display:'flex',gap:10,marginTop:2}}>
                      <span style={{color:'#3fb950'}}>✓ {batchOk} ok</span>
                      {batchFail>0&&<span style={{color:'#f87171'}}>✗ {batchFail} failed</span>}
                    </div>
                  )}
                </div>
              )}
              {/* Log */}
              {batchLog.length>0&&(
                <div>
                  <div style={{fontSize:7,letterSpacing:'0.15em',textTransform:'uppercase',color:T.muted,marginBottom:4}}>Render Log</div>
                  <div style={{maxHeight:160,overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
                    {batchLog.map((row,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:5,padding:'2px 5px',background:row.ok?T.bg:'#f871711a',border:`1px solid ${row.ok?T.border:'#f8717133'}`,borderRadius:T.r||0,fontSize:7}}>
                        <span style={{color:row.ok?'#3fb950':'#f87171',flexShrink:0}}>{row.ok?'✓':'✗'}</span>
                        <span style={{color:T.text,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.title}</span>
                        {!row.ok&&row.msg&&<span style={{color:'#f87171',flexShrink:0,maxWidth:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={row.msg}>{row.msg}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Export footer */}
            <div style={{padding:'8px 12px 10px',borderTop:`1px solid ${T.border}`,flexShrink:0,display:'flex',flexDirection:'column',gap:5}}>
              <button onClick={batchExport} disabled={batchRunning||batchIds.size===0}
                style={{...mkBtn(T,true),width:'100%',padding:'9px 0',fontSize:9,opacity:(batchRunning||batchIds.size===0)?0.45:1,transition:'opacity 0.15s'}}>
                {batchRunning
                  ?<><span className="tl-spin" style={{marginRight:5}}>↻</span>Rendering {batchDone}/{batchTotal}…</>
                  :`⬇ Export ${batchIds.size||'…'} Label${batchIds.size!==1?'s':''}`}
              </button>
              <div style={{fontSize:7,color:T.muted,textAlign:'center'}}>PNG · {batchScale}× · labels/ folder</div>
            </div>
          </div>
          {/* Checklist column */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflowY:'auto'}}>
            <div style={{padding:'8px 14px',borderBottom:`1px solid ${T.border}`,flexShrink:0,background:T.panel,display:'flex',alignItems:'center',gap:6}}>
              <button onClick={batchSelectAll} disabled={batchRunning} style={{...mkBtn(T),padding:'3px 9px',fontSize:8,opacity:batchRunning?0.4:1}}>All</button>
              <button onClick={batchSelectNone} disabled={batchRunning||batchIds.size===0} style={{...mkBtn(T),padding:'3px 9px',fontSize:8,opacity:(batchRunning||batchIds.size===0)?0.4:1}}>None</button>
              <div style={{flex:1}}/>
              <span style={{fontSize:7,color:T.muted}}>{batchVisibleEntries.length} tracks</span>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 12px'}}>
              {entries.length===0?(
                <div style={{...mkCard(T),textAlign:'center',padding:40}}>
                  <div style={{fontSize:24,opacity:0.12,marginBottom:8}}>◈</div>
                  <div style={{fontSize:8,color:T.muted,lineHeight:1.8}}>No archive entries yet.</div>
                </div>
              ):batchVisibleEntries.map(e=>{
                const sel=batchIds.has(e.id);
                const st=STATUS_OPT[e.status||'draft'];
                const hasLabel=!!(e.labelFields||e.labelSettings);
                return(
                  <div key={e.id} onClick={()=>!batchRunning&&toggleBatchId(e.id)}
                    style={{display:'flex',alignItems:'center',gap:8,padding:'7px 9px',marginBottom:3,
                      background:sel?T.panel:T.card,border:`1px solid ${sel?T.accent:T.border}`,
                      borderRadius:(T.r||0)*1.5,cursor:batchRunning?'default':'pointer',
                      opacity:batchRunning?0.6:1,transition:'border-color 0.1s,background 0.1s'}}>
                    <div style={{flexShrink:0,width:14,height:14,border:`1px solid ${sel?T.accent:T.border}`,borderRadius:2,
                      background:sel?T.accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center',
                      color:sel?T.bg:T.muted,fontSize:9,lineHeight:1}}>{sel?'✓':''}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:5,marginBottom:1}}>
                        <span style={{fontSize:10,fontWeight:700,color:T.bright,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.title||'Untitled'}</span>
                        {(e.created||e.updated)&&<span style={{fontSize:6,color:T.muted,flexShrink:0}}>{fmtDate(e.created||e.updated)}</span>}
                      </div>
                      <div style={{display:'flex',gap:5,alignItems:'center'}}>
                        <span style={{fontSize:8,color:T.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:90}}>{e.artist||'—'}</span>
                        {e.classCode&&<span style={{fontFamily:'monospace',fontSize:7,color:T.accent}}>{e.classCode}</span>}
                        <span style={{fontSize:6,color:st.color,border:`1px solid ${st.color}44`,padding:'1px 3px',borderRadius:T.r||0,flexShrink:0}}>{st.label}</span>
                        <span style={{fontSize:6,color:hasLabel?'#3fb950':T.muted,flexShrink:0}}>{hasLabel?'🏷':'·'}</span>
                      </div>
                    </div>
                    {batchPidFilter==='all'&&(
                      <span style={{fontSize:6,color:T.muted,border:`1px solid ${T.border}`,padding:'1px 4px',borderRadius:T.r||0,flexShrink:0,maxWidth:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {profiles.find(p=>p.id===e.profileId)?.name||'?'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ):(
        /* ── LABEL PREVIEW ── */
        <div style={{flex:1,overflowY:'auto',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:24,background:`${T.bg}cc`}}>
          {/* scale wrapper — position:relative so the interactive overlay can be absolutely placed */}
          <div style={{position:'relative',transform:`scale(${prevScale})`,transformOrigin:'top center',flexShrink:0}}>
            <TrackLabel fields={fields} settings={settings}/>
            {/* Interactive image overlay — only rendered when image is active */}
            {settings.showImage&&settings.imageData&&(
              <div
                onMouseDown={onImgDragStart}
                style={{
                  position:'absolute',
                  left:settings.imageX,
                  top:settings.imageY,
                  // During resize drag: show the live preview size, else the committed size
                  width:dragImgSize?dragImgSize.w:settings.imageW,
                  height:dragImgSize?dragImgSize.h:settings.imageH,
                  zIndex:30,
                  cursor:'move',
                  boxSizing:'border-box',
                  border:`1px dashed ${T.accent}99`,
                  outline:`1px dashed ${T.bg}55`,
                  userSelect:'none',
                }}>
                {/* Corner label showing live px values */}
                <div style={{
                  position:'absolute',top:2,left:3,
                  fontSize:7,lineHeight:1,color:T.accent,
                  fontFamily:'monospace',opacity:0.85,
                  pointerEvents:'none',letterSpacing:'0.04em',
                  textShadow:`0 0 4px ${T.bg}`,
                }}>
                  {dragImgSize
                    ?`${dragImgSize.w}×${dragImgSize.h}`
                    :`${settings.imageX},${settings.imageY}`
                  }
                </div>
                {/* Bottom-right resize handle */}
                <div
                  onMouseDown={onImgResizeStart}
                  style={{
                    position:'absolute',right:-5,bottom:-5,
                    width:11,height:11,
                    background:T.accent,
                    border:`1px solid ${T.bg}`,
                    cursor:'nwse-resize',
                    zIndex:31,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ━━━━━━━━ STUDIO TAB ━━━━━━━━
  const STUDIO_SUBS=[['art','Album Art'],['label','Label Maker'],['flyer','Flyer Maker']];
  const studioTab=(
    <div style={{display:'flex',flexDirection:'column',minHeight:'calc(100vh - 44px)'}}>
      {/* Studio sub-nav */}
      <div style={{display:'flex',alignItems:'center',gap:0,background:T.panel,borderBottom:`1px solid ${T.border}`,flexShrink:0,paddingLeft:12}}>
        {STUDIO_SUBS.map(([id,lbl])=>(
          <button key={id} onClick={()=>{setStudioSubTab(id);saveLS('tl_studio_sub',id);}}
            style={{padding:'7px 16px',background:'transparent',color:studioSubTab===id?T.accent:T.muted,
              border:'none',borderBottom:studioSubTab===id?`2px solid ${T.accent}`:'2px solid transparent',
              fontFamily:'inherit',fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer',
              fontWeight:studioSubTab===id?700:400}}>
            {lbl}
          </button>
        ))}
        <div style={{flex:1}}/>
        {activeEntry&&<span style={{fontSize:7,color:T.muted,padding:'0 12px',letterSpacing:'0.08em'}}>
          {activeEntry.title||'Untitled'} · {activeEntry.artist||'—'}
        </span>}
      </div>
      {/* Sub-tab content */}
      <div style={{flex:1,display:'flex',flexDirection:'column'}}>
        {studioSubTab==='art'&&(
          <AlbumArtEditor T={T} artState={artState} setArtState={setArt} fields={fields} meta={meta}/>
        )}
        {studioSubTab==='label'&&labelTab}
        {studioSubTab==='flyer'&&(
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,opacity:0.4}}>
            <div style={{fontSize:40}}>✦</div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:'0.2em',textTransform:'uppercase'}}>Flyer Maker</div>
            <div style={{fontSize:8,color:T.muted}}>Coming soon</div>
          </div>
        )}
      </div>
    </div>
  );

  // ━━━━━━━━ CODES CATALOG TAB ━━━━━━━━
  const catalogTab=(
    <div style={{maxWidth:680,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={h2S}>Saved Codes</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>{const txt=savedCodes.map(c=>`${c.code}  ${c.desc||getCodeDesc(c.code)}`).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));a.download='saved-codes.txt';a.click();}} style={{...mkBtn(T),padding:'6px 12px',fontSize:9}}>📥 Export TXT</button>
          {savedCodes.length>0&&<button onClick={()=>{if(window.confirm('Clear all saved codes?'))setSavedCodes([]);}} style={{...mkBtn(T),padding:'6px 12px',fontSize:9,color:'#f87171'}}>Clear All</button>}
        </div>
      </div>
      {savedCodes.length===0?(
        <div style={{...mkCard(T),textAlign:'center',padding:40}}>
          <div style={{fontSize:32,opacity:0.15,marginBottom:12}}>◈</div>
          <div style={{...mS}}>No codes saved yet. Generate codes in the Classify tab and save them here.</div>
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {savedCodes.map((c,i)=>(
            <div key={i} style={{...mkCard(T),marginBottom:0,display:'flex',flexDirection:'column',gap:6}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
                <div style={{fontFamily:'monospace',fontSize:22,fontWeight:700,color:T.accent,letterSpacing:'0.1em'}}>{c.code}</div>
                <button onClick={()=>setSavedCodes(savedCodes.filter((_,j)=>j!==i))} style={{...btnMini,color:'#f87171',fontSize:13}}>✕</button>
              </div>
              <div style={{fontSize:9,color:T.muted,lineHeight:1.5,flex:1}}>{c.desc||getCodeDesc(c.code)}</div>
              {c.saved&&<div style={{fontSize:7,color:T.muted,letterSpacing:'0.06em'}}>{c.saved}</div>}
              <div style={{display:'flex',gap:5}}>
                <button onClick={()=>{navigator.clipboard.writeText(c.code);}} style={{...mkBtn(T),flex:1,padding:'5px 0',fontSize:8}}>📋 Copy</button>
                <button onClick={()=>sendToLabel(c.code)} style={{...mkBtn(T,true),flex:1,padding:'5px 0',fontSize:8}}>🏷 Label</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  // ━━━━━━━━ RENDER ━━━━━━━━
  return(
    <LicenseGate T={T} bypass={true}>{/* ← set bypass=false to enforce in production */}
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',background:T.bg,color:T.text}}>
      {/* ── LIBRARY RECONNECT BANNER — appears on reopen when permission needs one click ── */}
      {permState==='needs-prompt'&&(
        <div style={{background:T.accent,color:T.bg,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 16px',flexShrink:0,gap:12}}>
          <span style={{fontSize:9,letterSpacing:'0.08em'}}>📁 <strong>{folderName}</strong> — click to reconnect your library</span>
          <div style={{display:'flex',gap:6}}>
            <button onClick={reconnect} style={{background:T.bg,color:T.accent,border:'none',fontFamily:'inherit',fontSize:9,fontWeight:700,letterSpacing:'0.1em',padding:'4px 14px',cursor:'pointer',borderRadius:T.r||0}}>RECONNECT</button>
            <button onClick={clearFolder} style={{background:'transparent',color:T.bg,border:`1px solid ${T.bg}66`,fontFamily:'inherit',fontSize:9,padding:'4px 10px',cursor:'pointer',borderRadius:T.r||0,opacity:0.7}}>✕</button>
          </div>
        </div>
      )}
      {tabBar}
      <div style={{flex:1,minHeight:0,overflow:'auto',background:T.bg,paddingBottom:0}}>
        {tab==='info'&&infoTab}
        {tab==='archive'&&archiveTab}
        {tab==='metadata'&&metadataTab}
        {tab==='classify'&&classifyTab}
        {tab==='studio'&&studioTab}
        {tab==='catalog'&&catalogTab}
        <div style={{display:tab==='viz'?'flex':'none',minHeight:'calc(100vh - 44px)',flexDirection:'column'}}>
          <PlayerView T={T} audioElRef={audioElRef} audioObjectUrl={audioObjectUrl} activeEntry={activeEntry} activeEid={activeEid} meta={meta} audioFile={audioFile} entries={entries} profiles={profiles} activePid={activePid} setActivePid={setActivePid} loadEntry={loadEntry} setAudioObjectUrl={setAudioObjectUrl} setAudioFile={setAudioFile} playerVisible={!!audioObjectUrl&&!appTheme.playerAutoHide}/>
        </div>
        <FloatingPlayer T={T} audioObjectUrl={audioObjectUrl} audioFile={audioFile} activeEntry={activeEntry} meta={meta} autoHide={!!appTheme.playerAutoHide} audioElRef={audioElRef}
          onPrev={async()=>{
            const pid=activePidRef.current;
            const profList=entriesRef.current.filter(e=>e.profileId===pid).sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
            const idx=profList.findIndex(e=>e.id===playingEidRef.current);
            if(idx<=0)return;
            const prev=profList[idx-1];
            await loadEntryRef.current(prev);
            setPlayingEid(prev.id);
            requestAnimationFrame(()=>requestAnimationFrame(()=>audioElRef.current?.play()));
          }}
          onNext={async()=>{
            const pid=activePidRef.current;
            const profList=entriesRef.current.filter(e=>e.profileId===pid).sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
            const idx=profList.findIndex(e=>e.id===playingEidRef.current);
            if(idx===-1||idx>=profList.length-1)return;
            const next=profList[idx+1];
            await loadEntryRef.current(next);
            setPlayingEid(next.id);
            requestAnimationFrame(()=>requestAnimationFrame(()=>audioElRef.current?.play()));
          }}
        />
      </div>
      {/* Hidden off-screen div for archive label export */}
      {archiveLabelExport&&(
        <div ref={archiveLabelRef} style={{position:'fixed',left:-9999,top:0,zIndex:-1,pointerEvents:'none',width:archiveLabelExport.settings.labelW}}>
          <TrackLabel fields={archiveLabelExport.fields} settings={archiveLabelExport.settings}/>
        </div>
      )}
    </div>
    </LicenseGate>
  );
}

ReactDOM.render(<App/>,document.getElementById('root'));
