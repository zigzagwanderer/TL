// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 3: DEFAULTS & CONFIG                                 ║
// ╚══════════════════════════════════════════════════════════════╝
const SIZE_PRESETS=[{name:'4×6 Standard',w:384,h:576},{name:'4×4 Square',w:384,h:384},{name:'6×4 Landscape',w:576,h:384},{name:'3×5 Small',w:288,h:480},{name:'3×3 Mini',w:288,h:288},{name:'5×7 Large',w:480,h:672}];
const mkUid=()=>Math.random().toString(36).slice(2,10);
const DEFAULT_META_ROW=[{id:'bpm',label:'BPM',value:'',show:true},{id:'key',label:'Key',value:'',show:true},{id:'genre',label:'Genre',value:'',show:true},{id:'dur',label:'Length',value:'',show:true},{id:'date',label:'Date',value:'',show:true}];
const DEFAULT_SETTINGS={
  scheme:'thermal',customColors:{bg:'#fff',fg:'#000',bannerBg:'#000',bannerFg:'#fff',metaBg:'#000',metaFg:'#fff',accent:'#000',sub:'#666',border:'#000',strip:'#f2f2f2',codeBg:'#f6f6f6',codeFg:'#000'},
  bgAlpha:1,fgAlpha:1,useGradient:false,gradColor2:'#ccc',gradDir:'to bottom',
  font:'share-tech',artistSize:15,artistBold:true,artistItalic:false,
  titleSize:24,titleBold:true,titleItalic:false,titleAlign:'left',
  metaSize:10,metaLabelSize:6,metaLabelColor:'',bodySize:11,bodyBold:false,bodyItalic:false,bodyAlign:'left',tagSize:9,
  labelW:384,labelH:576,outerBorder:3,
  borders:{bannerBottom:true,titleBottom:true,metaBottom:true,classBottom:true,descBottom:true,qrDivider:true,bottomBorder:true,footerTop:true,metaCellDividers:true},
  showBanner:true,showMeta:true,showClass:true,showDesc:true,showQR:true,showTags:true,showFooter:true,showImage:false,showCodes:true,codesInFooter:false,
  qrFloat:false,qrFloatX:8,qrFloatY:8,qrFloatSize:84,metaFields:DEFAULT_META_ROW,
  qrCaption:'SCAN',qrMode:'static',dynamicId:mkUid().toUpperCase().slice(0,8),
  imageData:null,imageOriginalData:null,imageW:180,imageH:120,imageX:8,imageY:0,ditherThreshold:128,ditherContrast:0,ditherBlend:true,
  textBlocks:[],exportScale:2,exportFormat:'png',
};
const DEFAULT_FIELDS={artist:'',catalog:'',trackNum:'01',title:'',description:'',tags:'',url:'',classCode:'',classDesc:'',isrc:'',upc:''};
const DEFAULT_METADATA={
  title:'',artist:'',albumArtist:'',album:'',year:'',trackNum:'',trackTotal:'',discNum:'',discTotal:'',
  genre:'',bpm:'',key:'',composer:'',lyricist:'',producer:'',publisher:'',copyright:'',label:'',catalog:'',
  isrc:'',upc:'',iswc:'',language:'',comment:'',mood:'',grouping:'',encoder:'',lyrics:'',notes:'',
  explicit:false,compilation:false,albumArt:null,albumArtSize:'3000',
  lufs:'',lra:'',samplePeak:'',crestFactor:'',dcOffset:'',
  stereoCorrelation:'',aiArtifact:'',spectralCeiling:'',aiProbability:'',
  spectralProfile:null,  // Array[10] of 0–100 normalized band energies, set by generateSpectralProfile()
};
// ━━━━━━━━ STUDIO — ART TEMPLATES ━━━━━━━━
const ALBUM_ART_SIZES=[{val:'500',label:'500×500 (web)'},{val:'1000',label:'1000×1000 (standard)'},{val:'1500',label:'1500×1500 (HD)'},{val:'3000',label:'3000×3000 (master)'}];
const ART_TEMPLATES={
  'lp-cover':        {name:'LP Cover',          w:1000,h:1000,shape:'rect',   note:'12" sleeve / digital release'},
  '7in-cover':       {name:'7" Single Cover',   w:1000,h:1000,shape:'rect',   note:'Single sleeve'},
  'cd-cover':        {name:'CD Cover',          w:1000,h:1000,shape:'rect',   note:'Jewel case / digipak front'},
  'cassette-front':  {name:'Cassette J-Card',   w:700, h:438, shape:'rect',   note:'J-card front panel'},
  'cassette-label':  {name:'Cassette Label',    w:1051,h:496, shape:'cassette',
    // Outer label: chamfered rect corners (clip mask)
    // Inner window cutout: centered rounded rect, ~47% wide x 34% tall
    slot:{x:0.265,y:0.33,w:0.47,h:0.34,r:0.06},
    note:'89×42mm @ 300dpi · A/B sides',sides:true},
  'vinyl-12':        {name:'12" Vinyl Label',   w:700, h:700, shape:'circle', holeR:0.038,note:'298mm · standard spindle',sides:true},
  'vinyl-7':         {name:'7" Vinyl Label',    w:580, h:580, shape:'circle', holeR:0.058,note:'175mm · standard spindle',sides:true},
  'vinyl-45':        {name:'45 RPM Label',      w:580, h:580, shape:'circle', holeR:0.215,note:'175mm · large center hole',sides:true},
  'cd-label':        {name:'CD Label',          w:600, h:600, shape:'circle', holeR:0.168,note:'116mm disc · 41mm hub'},
};
const mkLayerId=()=>'l'+Math.random().toString(36).slice(2,9);
const DEFAULT_ART_STATE={
  template:'lp-cover',showGuides:true,selectedId:'bg0',side:'A',
  layers:[{id:'bg0',type:'bg',name:'Background',color:'#111111',opacity:1,visible:true,locked:false}],
  layersB:[{id:'bg0b',type:'bg',name:'Background',color:'#111111',opacity:1,visible:true,locked:false}],
};

// ━━━━━━━━ ALBUM ART EDITOR COMPONENT ━━━━━━━━
function AlbumArtEditor({T,artState,setArtState,fields,meta}){
  const artLayersPanel=useDragResize({key:'tl_w_art_layers',defaultW:200,min:140,max:360,label:'Layers'});
  const artPropsPanel=useDragResize({key:'tl_w_art_props',defaultW:224,min:140,max:360,side:'left',label:'Props'});
  const canvasRef=useRef();
  const overlayRef=useRef({}); // refs to portal DOM nodes for zero-lag updates
  const wrapperRef=useRef(); // ref to canvas wrapper div for outside-click detection
  const textEditorRef=useRef();
  const lastClickRef=useRef({id:null,time:0}); // for double-click-to-edit detection
  const imgCache=useRef({});
  const fileRef=useRef();
  const pendingImg=useRef('add');
  // Interaction state — all in a single ref to avoid closure staleness
  // mode: 'idle'|'move'|'resize'
  // resize handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'
  const iact=useRef({mode:'idle',layerId:null,handle:null,
    startX:0,startY:0,origX:0,origY:0,origW:0,origH:0});
  const drawLayersRef=useRef(null);  // always-current ref so mousemove effect never re-registers
  const computeSnapRef=useRef(null);  // same for computeSnap
  const tplRef=useRef(null);          // same for tpl
  const bleedRef=useRef(200);         // same for BLEED
  const updateLayerRef=useRef(null); // same for updateLayer
  const scaleRef=useRef(1);          // same for scale
  const activeLayersRef=useRef([]);   // always-current activeLayers
  const activeSelectedIdRef=useRef(null); // always-current selected id
  const canvasRectRef=useRef(null);   // always-current canvas screen rect (no state lag)
  const [cursorStyle,setCursorStyle]=useState('default');
  const [canvasRect,setCanvasRect]=useState(null); // screen rect of canvas for fixed overlay
  const [editingId,setEditingId]=useState(null); // id of text layer being inline-edited
  const editingIdRef=useRef(null); // ref mirror — always current in callbacks

  const tpl=ART_TEMPLATES[artState.template]||ART_TEMPLATES['lp-cover'];
  const hasSides=!!tpl.sides;
  const side=hasSides?(artState.side||'A'):'A';
  const PREV_MAX=520;
  const scale=Math.min(1,PREV_MAX/Math.max(tpl.w,tpl.h));
  const BLEED=800; // canvas-px of ghost margin — fills stage on any screen

  const activeLayers=hasSides&&side==='B'?(artState.layersB||[]):(artState.layers||[]);
  // Keep stable refs current so the drag effect closure always has latest values
  scaleRef.current=scale;
  activeLayersRef.current=activeLayers;
  activeSelectedIdRef.current=activeSelectedId;
  tplRef.current=tpl;
  bleedRef.current=BLEED;
  const activeSelectedId=hasSides&&side==='B'?(artState.selectedIdB||null):artState.selectedId;

  const setLayers=fn=>setArtState(s=>{
    const key=hasSides&&side==='B'?'layersB':'layers';
    const cur=s[key]||[];
    return{...s,[key]:typeof fn==='function'?fn(cur):fn};
  });
  const setSelId=id=>setArtState(s=>{
    const key=hasSides&&side==='B'?'selectedIdB':'selectedId';
    return{...s,[key]:id||null};
  });
  const selLayer=activeLayers.find(l=>l.id===activeSelectedId)||null;
  // updateLayer: must be stable — used inside mouse event handlers via ref closure
  const updateLayer=useCallback((id,ch)=>setArtState(s=>{
    const key=hasSides&&side==='B'?'layersB':'layers';
    const cur=s[key]||[];
    return{...s,[key]:cur.map(l=>l.id===id?{...l,...ch}:l)};
  }),[hasSides,side]);
  updateLayerRef.current=updateLayer;
  const updateSel=ch=>selLayer&&updateLayer(selLayer.id,ch);

  const switchSide=newSide=>{
    if(!hasSides||newSide===side)return;
    setArtState(s=>{
      const ns={...s,side:newSide};
      if(newSide==='B'&&(!s.layersB||!s.layersB.length)){
        ns.layersB=[{id:'bg0b',type:'bg',name:'Background',color:'#111111',opacity:1,visible:true,locked:false}];
        ns.selectedIdB='bg0b';
      }
      return ns;
    });
  };

  const importImg=file=>{
    if(!file||!file.type.startsWith('image/'))return;
    const r=new FileReader();
    r.onload=ev=>{
      const src=ev.target.result;
      const img=new Image();
      const isAdd=pendingImg.current==='add';
      const replaceId=isAdd?null:pendingImg.current;
      img.onload=()=>{
        const id=isAdd?mkLayerId():replaceId;
        imgCache.current[id]=img;
        if(isAdd){
          const aspect=img.width/img.height;
          const fw=Math.round(Math.min(tpl.w,tpl.h*aspect));
          const fh=Math.round(fw/aspect);
          setLayers(ls=>[...ls,{id,type:'image',name:file.name.replace(/\.[^.]+$/,'').slice(0,24),src,x:0,y:0,w:fw,h:fh,opacity:1,visible:true,locked:false}]);
          setSelId(id);
        }else{
          updateLayer(replaceId,{src,w:Math.min(img.width,tpl.w),h:Math.min(img.height,tpl.h)});
        }
      };
      img.src=src;
    };
    r.readAsDataURL(file);
    if(fileRef.current)fileRef.current.value='';
  };

  const addLayer=type=>{
    const id=mkLayerId();
    const base={id,visible:true,locked:false,opacity:1};
    let l;
    if(type==='text') l={...base,type:'text',name:'Text',text:fields.title||meta.title||'TITLE',
      x:Math.round(tpl.w*0.08),y:Math.round(tpl.h*0.4),
      w:Math.round(tpl.w*0.84),h:Math.round(tpl.w*0.065*2.2),
      fontSize:Math.round(tpl.w*0.065),fontFamily:'"Share Tech Mono",monospace',
      color:'#ffffff',align:'left',bold:false,italic:false};
    else l={...base,type:'shape',name:'Shape',shapeType:'rect',
      x:Math.round(tpl.w*0.1),y:Math.round(tpl.h*0.1),
      w:Math.round(tpl.w*0.8),h:Math.round(tpl.h*0.8),fill:'transparent',stroke:'#ffffff',strokeW:2};
    setLayers(ls=>[...ls,l]);
    setSelId(id);
  };

  const moveLayerOrder=(id,dir)=>setLayers(ls=>{
    const i=ls.findIndex(l=>l.id===id);if(i<0)return ls;
    const n=[...ls],ni=dir==='up'?i+1:i-1;
    if(ni<0||ni>=n.length)return ls;
    [n[i],n[ni]]=[n[ni],n[i]];return n;
  });

  const deleteLayer=id=>{
    delete imgCache.current[id];
    setArtState(s=>{
      const key=hasSides&&side==='B'?'layersB':'layers';
      const selKey=hasSides&&side==='B'?'selectedIdB':'selectedId';
      const layers=(s[key]||[]).filter(l=>l.id!==id);
      const selId=s[selKey]===id?(layers[layers.length-1]?.id||null):s[selKey];
      return{...s,[key]:layers,[selKey]:selId};
    });
  };

  const exportArt=()=>{
    const c=canvasRef.current;if(!c)return;
    // Crop out the bleed margin — export only the template area
    const out=document.createElement('canvas');
    out.width=tpl.w;out.height=tpl.h;
    const octx=out.getContext('2d');
    octx.drawImage(c,BLEED,BLEED,tpl.w,tpl.h,0,0,tpl.w,tpl.h);
    const slug=((fields.title||meta.title||'artwork')+'-'+artState.template+(hasSides?'-side'+side:'')).replace(/\W+/g,'-').toLowerCase().slice(0,60);
    const a=document.createElement('a');a.href=out.toDataURL('image/png');a.download=slug+'.png';a.click();
  };

  // ── DRAW (pure canvas, no state reads during drag) ──────────────
  // drawLayers accepts an override map {id:{x,y,w,h}} for live drag preview
  const drawLayers=useCallback((overrides={},guides=[])=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const {w,h,shape,holeR,slot}=tpl;
    ctx.clearRect(0,0,w,h);

    // ── helper: draw a single layer's content (used for both ghost + normal pass)
    const drawLayerContent=(l,lx,ly,lw,lh,alpha,bl=0)=>{
      ctx.globalAlpha=alpha;
      if(l.type==='bg'){ctx.fillStyle=l.color||'#000';ctx.fillRect(0,0,w+bl*2,h+bl*2);return;}
      if(l.type==='image'){const img=imgCache.current[l.id];if(img)ctx.drawImage(img,lx+bl,ly+bl,lw,lh);return;}
      if(l.type==='text'){
        const dispText=l.caps?(l.text||'').toUpperCase():(l.text||'');
        ctx.fillStyle=l.color||'#fff';ctx.textAlign=l.align||'left';ctx.textBaseline='top';
        const weight=(l.bold?'bold ':'')+(l.italic?'italic ':'');
        const fs=l.fontSize||32;
        ctx.font=`${weight}${fs}px ${l.fontFamily||'monospace'}`;
        ctx.letterSpacing=(l.letterSpacing||0)+'px';
        const lnH=Math.round(fs*(l.lineHeight||1.3));
        const maxW2=lw;
        const alignX2=l.align==='center'?(lx+bl)+lw/2:l.align==='right'?(lx+bl)+lw:(lx+bl);
        const paras2=(dispText).split('\n');
        let cy2=ly+bl;
        const dLine=(txt,y2)=>{
          ctx.fillText(txt,alignX2,y2);
          if(l.underline){
            const tw2=ctx.measureText(txt).width;
            const ux2=l.align==='center'?alignX2-tw2/2:l.align==='right'?alignX2-tw2:alignX2;
            ctx.save();ctx.strokeStyle=l.color||'#fff';ctx.lineWidth=Math.max(1,fs*0.06);
            ctx.beginPath();ctx.moveTo(ux2,y2+fs*1.08);ctx.lineTo(ux2+tw2,y2+fs*1.08);ctx.stroke();
            ctx.restore();
          }
        };
        for(const para2 of paras2){
          const words2=para2.split(' ');let line3='';
          for(const word2 of words2){
            const test2=line3?line3+' '+word2:word2;
            if(ctx.measureText(test2).width>maxW2&&line3){dLine(line3,cy2);line3=word2;cy2+=lnH;}
            else line3=test2;
          }
          if(line3)dLine(line3,cy2);
          cy2+=lnH;
        }
        ctx.letterSpacing='0px';
        return;
      }
      if(l.type==='shape'){
        ctx.lineWidth=l.strokeW||2;
        if(l.shapeType==='ellipse'){
          ctx.beginPath();ctx.ellipse((lx+bl)+lw/2,(ly+bl)+lh/2,lw/2,lh/2,0,0,Math.PI*2);
          if(l.fill&&l.fill!=='transparent'){ctx.fillStyle=l.fill;ctx.fill();}
          if(l.stroke&&l.stroke!=='transparent'){ctx.strokeStyle=l.stroke;ctx.stroke();}
        } else {
          if(l.fill&&l.fill!=='transparent'){ctx.fillStyle=l.fill;ctx.fillRect(lx+bl,ly+bl,lw,lh);}
          if(l.stroke&&l.stroke!=='transparent'){ctx.strokeStyle=l.stroke;ctx.strokeRect(lx+bl,ly+bl,lw,lh);}
        }
      }
    };

    // ── PASS 0: fill entire canvas with slate stage color
    ctx.fillStyle='#3a3d42';
    ctx.fillRect(0,0,w+BLEED*2,h+BLEED*2);

    // ── PASS 1: ghost bleed — non-bg layers at 45% opacity, no clip, slate bg shows through
    ctx.save();
    for(const l of activeLayers){
      if(!l.visible||l.id===editingId||l.type==='bg')continue;
      const ov=overrides[l.id]||{};
      const lx=(ov.x!=null?ov.x:l.x)||0;
      const ly=(ov.y!=null?ov.y:l.y)||0;
      const lw=ov.w!=null?ov.w:(l.w||w);
      const lh=ov.h!=null?ov.h:(l.h||h);
      drawLayerContent(l,lx,ly,lw,lh,(l.opacity??1)*0.45,BLEED);
    }
    ctx.restore();

    // ── PASS 2: clip to template shape, draw all layers (bg first) inside
    ctx.save();
    if(shape==='circle'){
      ctx.beginPath();ctx.arc(w/2+BLEED,h/2+BLEED,w/2,0,Math.PI*2);ctx.clip();
    } else if(shape==='cassette'){
      const ch=Math.round(h*0.14);
      const bx0=BLEED,by0=BLEED;
      ctx.beginPath();
      ctx.moveTo(bx0+ch,by0);ctx.lineTo(bx0+w-ch,by0);
      ctx.lineTo(bx0+w,by0+ch);ctx.lineTo(bx0+w,by0+h-ch);
      ctx.lineTo(bx0+w-ch,by0+h);ctx.lineTo(bx0+ch,by0+h);
      ctx.lineTo(bx0,by0+h-ch);ctx.lineTo(bx0,by0+ch);
      ctx.closePath();ctx.clip();
    } else {
      // rect / lp-cover / cd / etc — clip to exact template bounds
      ctx.beginPath();ctx.rect(BLEED,BLEED,w,h);ctx.clip();
    }
    for(const l of activeLayers){
      if(!l.visible||l.id===editingId)continue;
      const ov=overrides[l.id]||{};
      const lx=(ov.x!=null?ov.x:l.x)||0;
      const ly=(ov.y!=null?ov.y:l.y)||0;
      const lw=ov.w!=null?ov.w:(l.w||w);
      const lh=ov.h!=null?ov.h:(l.h||h);
      drawLayerContent(l,lx,ly,lw,lh,l.opacity??1,BLEED);
      ctx.globalAlpha=1;
    }
    ctx.restore();

    // Hole punch
    if(holeR){
      ctx.save();ctx.globalCompositeOperation='destination-out';
      ctx.beginPath();ctx.arc(w/2+BLEED,h/2+BLEED,w*holeR,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    // Cassette window cutout — single centered rounded rect
    if(shape==='cassette'&&slot){
      ctx.save();ctx.globalCompositeOperation='destination-out';
      const sx=Math.round(w*slot.x)+BLEED, sy=Math.round(h*slot.y)+BLEED;
      const sw2=Math.round(w*slot.w), sh2=Math.round(h*slot.h);
      const sr=Math.round(Math.min(sw2,sh2)*slot.r);
      ctx.beginPath();ctx.roundRect(sx,sy,sw2,sh2,sr);ctx.fill();
      ctx.restore();
    }

    // Guides overlay (doesn't export)
    ctx.save();
    if(artState.showGuides){
      ctx.strokeStyle='rgba(70,170,255,0.35)';ctx.lineWidth=1;ctx.setLineDash([5,5]);
      if(shape==='rect'){const m=Math.round(w*0.05);ctx.strokeRect(m+BLEED,m+BLEED,w-m*2,h-m*2);}
      else if(shape==='circle'){ctx.beginPath();ctx.arc(w/2+BLEED,h/2+BLEED,w/2*0.85,0,Math.PI*2);ctx.stroke();}
      else if(shape==='cassette'&&slot){
        // Show safe zone: left of slot, right of slot, full height
        const slotX=Math.round(w*slot.x), slotR=Math.round(w*(slot.x+slot.w));
        ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(70,170,255,0.4)';
        ctx.strokeRect(10+BLEED,10+BLEED,slotX-20,h-20);
        ctx.strokeRect(slotR+10+BLEED,10+BLEED,w-slotR-20,h-20);
      }
      ctx.setLineDash([3,5]);ctx.strokeStyle='rgba(70,170,255,0.18)';
      ctx.beginPath();ctx.moveTo(w/2+BLEED-18,h/2+BLEED);ctx.lineTo(w/2+BLEED+18,h/2+BLEED);ctx.moveTo(w/2+BLEED,h/2+BLEED-18);ctx.lineTo(w/2+BLEED,h/2+BLEED+18);ctx.stroke();
    }
    ctx.restore();

    // ── Smart guide lines (drawn last, always on top, never exported)
    if(guides&&guides.length){
      ctx.save();
      ctx.setLineDash([]);
      guides.forEach(g=>{
        ctx.strokeStyle=g.type==='center'?'rgba(0,210,255,1)':'rgba(0,175,230,1)';
        ctx.lineWidth=1;
        ctx.beginPath();
        if(g.axis==='x'){ctx.moveTo(g.pos+BLEED,0);ctx.lineTo(g.pos+BLEED,h+BLEED*2);}
        else            {ctx.moveTo(0,g.pos+BLEED);ctx.lineTo(w+BLEED*2,g.pos+BLEED);}
        ctx.stroke();
      });
      ctx.restore();
    }
  },[activeLayers,artState.showGuides,tpl,editingId]);
  drawLayersRef.current=drawLayers;

  useEffect(()=>{
    activeLayers.forEach(l=>{
      if(l.type==='image'&&l.src&&!imgCache.current[l.id]){
        const img=new Image();img.onload=()=>{imgCache.current[l.id]=img;drawLayers();};img.src=l.src;
      }
    });
    drawLayers();
  },[activeLayers,drawLayers]);

  // ── LAYER BOUNDING BOX (in canvas coords) ───────────────────────
  const getLayerBBox=useCallback((l,overrides={})=>{
    if(!l||l.type==='bg')return null;
    const ov=overrides[l.id]||{};
    const x=(ov.x!=null?ov.x:l.x)||0;
    const y=(ov.y!=null?ov.y:l.y)||0;
    if(l.type==='image'||l.type==='shape'){
      return{x,y,w:ov.w!=null?ov.w:(l.w||100),h:ov.h!=null?ov.h:(l.h||100)};
    }
    if(l.type==='text'){
      // Text stores w/h just like image/shape so handles can resize it
      const fw=ov.w!=null?ov.w:(l.w||Math.round(tpl.w*0.84));
      const fh=ov.h!=null?ov.h:(l.h||Math.round((l.fontSize||32)*2.2));
      return{x,y,w:Math.max(20,fw),h:Math.max(10,fh)};
    }
    return null;
  },[tpl]);

  // ── HIT TEST ────────────────────────────────────────────────────
  const hitTest=useCallback((cx,cy,overrides={})=>{
    for(let i=activeLayers.length-1;i>=0;i--){
      const l=activeLayers[i];
      if(!l.visible||l.locked||l.type==='bg')continue;
      const bb=getLayerBBox(l,overrides);
      if(bb&&cx>=bb.x&&cx<=bb.x+bb.w&&cy>=bb.y&&cy<=bb.y+bb.h)return l;
    }
    return null;
  },[activeLayers,getLayerBBox]);

  // ── RESIZE HANDLE HIT TEST ─────────────────────────────────────
  const HANDLE_R=5; // screen px radius for hit detection
  const getHandles=useCallback((bb)=>{
    if(!bb)return[];
    const {x,y,w,h}=bb;
    const mx=x+w/2, my=y+h/2;
    return[
      {id:'nw',cx:x,cy:y},   {id:'n',cx:mx,cy:y},  {id:'ne',cx:x+w,cy:y},
      {id:'e',cx:x+w,cy:my},
      {id:'se',cx:x+w,cy:y+h},{id:'s',cx:mx,cy:y+h},{id:'sw',cx:x,cy:y+h},
      {id:'w',cx:x,cy:my},
    ];
  },[]);

  const HANDLE_CURSORS={nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',e:'ew-resize',se:'nwse-resize',s:'ns-resize',sw:'nesw-resize',w:'ew-resize'};

  const hitHandle=useCallback((cx,cy,overrides={},forLayer=null)=>{
    // Use forLayer if provided (avoids stale closure); fall back to selLayer
    const targetLayer=forLayer||(activeLayersRef.current.find(l=>l.id===activeSelectedIdRef.current))||selLayer;
    if(!targetLayer)return null;
    const bb=getLayerBBox(targetLayer,overrides);
    if(!bb)return null;
    const handles=getHandles(bb);
    for(const h of handles){
      const hxScreen=h.cx*scale, hyScreen=h.cy*scale;
      const cxScreen=cx*scale, cyScreen=cy*scale;
      if(Math.abs(cxScreen-hxScreen)<=HANDLE_R+2&&Math.abs(cyScreen-hyScreen)<=HANDLE_R+2)return h.id;
    }
    return null;
  },[selLayer,getLayerBBox,getHandles,scale]);


  // ── INLINE TEXT EDIT ────────────────────────────────────────────
  const commitTextEdit=useCallback(()=>{
    if(!editingId||!textEditorRef.current)return;
    const txt=textEditorRef.current.innerText||'';
    updateLayer(editingId,{text:txt});
    editingIdRef.current=null;setEditingId(null);
  },[editingId,updateLayer]);

  const enterEditMode=useCallback((layer)=>{
    if(!layer||layer.type!=='text')return;
    editingIdRef.current=layer.id;setEditingId(layer.id);
    // Focus the editor on next paint
    setTimeout(()=>{
      const el=textEditorRef.current;
      if(!el)return;
      el.focus();
      // Place cursor at end
      const range=document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel=window.getSelection();
      sel.removeAllRanges();sel.addRange(range);
    },20);
  },[]);
  // ── CANVAS MOUSE DOWN — Keynote-style ─────────────────────────
  const onCanvasMouseDown=useCallback(e=>{
    if(e.button!==0)return;
    e.preventDefault();
    const rect=canvasRef.current.getBoundingClientRect();
    // Subtract bleed offset: canvas is larger than template, origin is at BLEED,BLEED
    const cx=(e.clientX-rect.left)/scale - BLEED;
    const cy=(e.clientY-rect.top)/scale - BLEED;

    // If currently editing text, commit and stop
    if(editingIdRef.current){commitTextEdit();return;}

    // Check resize handle first — read fresh layer from ref, not stale selLayer closure
    const handle=hitHandle(cx,cy);
    if(handle&&activeSelectedIdRef.current){
      const freshSel=activeLayersRef.current.find(l=>l.id===activeSelectedIdRef.current);
      if(freshSel){
        const bb=getLayerBBox(freshSel)||{x:0,y:0,w:100,h:100};
        iact.current={mode:'resize',layerId:freshSel.id,handle,
          startX:e.clientX,startY:e.clientY,
          origX:bb.x,origY:bb.y,origW:bb.w,origH:bb.h};
        setCursorStyle(HANDLE_CURSORS[handle]||'nwse-resize');
        return;
      }
    }

    const hit=hitTest(cx,cy);
    if(hit){
      const now=Date.now();
      const lc=lastClickRef.current;
      // Second click within 400ms on same text layer → enter inline edit
      if(hit.type==='text'&&hit.id===lc.id&&(now-lc.time)<400){
        lastClickRef.current={id:null,time:0};
        enterEditMode(hit);
        return;
      }
      lastClickRef.current={id:hit.id,time:now};
      setSelId(hit.id);
      // Read FRESH layer data from ref (not stale closure hit object)
      const freshLayer=activeLayersRef.current.find(l=>l.id===hit.id)||hit;
      const freshBB=getLayerBBox(freshLayer)||{x:0,y:0,w:100,h:100};
      iact.current={mode:'move',layerId:hit.id,
        startX:e.clientX,startY:e.clientY,
        origX:freshBB.x,origY:freshBB.y,
        origW:freshBB.w,origH:freshBB.h};
      setCursorStyle('move');
      return;
    }

    // Blank canvas — clear selection
    lastClickRef.current={id:null,time:0};
    setSelId(null);
  },[scale,selLayer,commitTextEdit,enterEditMode,hitHandle,hitTest,getLayerBBox,setSelId]);

  // ── OVERLAY HANDLE MOUSE DOWN — fires from fixed portal ────────
  // Converts screen coords back to canvas coords for handle hit
  const onOverlayMouseDown=useCallback(e=>{
    if(e.button!==0)return;
    e.preventDefault();
    e.stopPropagation();
    if(!selLayer||!canvasRef.current)return;
    const rect=canvasRef.current.getBoundingClientRect();
    const cx=(e.clientX-rect.left)/scale - BLEED;
    const cy=(e.clientY-rect.top)/scale - BLEED;
    const freshSel2=activeLayersRef.current.find(l=>l.id===activeSelectedIdRef.current)||selLayer;
    const handle=hitHandle(cx,cy,{},freshSel2);
    if(handle&&freshSel2){
      const bb=getLayerBBox(freshSel2)||{x:0,y:0,w:100,h:100};
      iact.current={mode:'resize',layerId:freshSel2.id,handle,
        startX:e.clientX,startY:e.clientY,
        origX:bb.x,origY:bb.y,origW:bb.w,origH:bb.h};
      setCursorStyle(HANDLE_CURSORS[handle]||'nwse-resize');
    }
  },[selLayer,scale,hitHandle,getLayerBBox]);


  // ── SMART GUIDE SNAPPING ────────────────────────────────────────
  // Returns {snappedX, snappedY, guides:[]} for a layer bbox during move
  // Keynote behavior:
  //   SNAP_THRESHOLD: if within this many canvas-px, snap
  //   RELEASE_EXTRA:  user must drag this far past snap before it releases
  const SNAP_T=6;   // canvas px snap threshold
  const SNAP_R=14;  // canvas px to drag past snap before releasing

  const computeSnap=useCallback((layerId,rawX,rawY,origX,origY)=>{
    const layers=activeLayersRef.current;
    const sc=scaleRef.current;
    const {w,h}=tpl;
    // Get bbox of moving layer at raw (unsnapped) position
    const movingLayer=layers.find(l=>l.id===layerId);
    if(!movingLayer)return{snappedX:rawX,snappedY:rawY,guides:[]};
    const mw=movingLayer.w||w, mh=movingLayer.h||h;

    // Candidate snap lines: canvas center + edges, plus every other visible non-bg layer
    // Each entry: {axis, pos, type:'center'|'edge'}
    const snapLines=[];
    // Canvas axes
    snapLines.push({axis:'x',pos:0,      type:'edge'},  {axis:'x',pos:w,      type:'edge'});
    snapLines.push({axis:'x',pos:w/2,    type:'center'});
    snapLines.push({axis:'y',pos:0,      type:'edge'},  {axis:'y',pos:h,      type:'edge'});
    snapLines.push({axis:'y',pos:h/2,    type:'center'});

    for(const l of layers){
      if(l.id===layerId||!l.visible||l.type==='bg')continue;
      const lx=(l.x||0), ly=(l.y||0);
      const lw=l.w||w, lh=l.h||h;
      // Other layer: left, center-x, right
      snapLines.push({axis:'x',pos:lx,        type:'edge'});
      snapLines.push({axis:'x',pos:lx+lw/2,   type:'center'});
      snapLines.push({axis:'x',pos:lx+lw,     type:'edge'});
      // Other layer: top, center-y, bottom
      snapLines.push({axis:'y',pos:ly,        type:'edge'});
      snapLines.push({axis:'y',pos:ly+lh/2,   type:'center'});
      snapLines.push({axis:'y',pos:ly+lh,     type:'edge'});
    }

    // Points on the moving layer that can snap to snap lines
    // x-axis: left edge, center-x, right edge
    // y-axis: top edge, center-y, bottom edge
    const mx_left=rawX, mx_mid=rawX+mw/2, mx_right=rawX+mw;
    const my_top=rawY,  my_mid=rawY+mh/2, my_bot=rawY+mh;

    let snappedX=rawX, snappedY=rawY;
    const activeGuides=[];
    let bestDx=SNAP_T+1, bestDy=SNAP_T+1;

    for(const sl of snapLines){
      if(sl.axis==='x'){
        // Check each moving-layer x point against this snap line
        for(const [mp,offset] of [[mx_left,0],[mx_mid,-mw/2],[mx_right,-mw]]){
          const d=Math.abs(mp-sl.pos);
          if(d<bestDx){
            bestDx=d;
            snappedX=sl.pos+offset;
            // Clear previous x guides and add this one
            activeGuides.filter(g=>g.axis==='x').forEach((_,i,a)=>a.splice(i,1));
          }
          if(d<SNAP_T){
            const already=activeGuides.find(g=>g.axis==='x'&&Math.abs(g.pos-sl.pos)<1);
            if(!already)activeGuides.push({axis:'x',pos:sl.pos,type:sl.type});
          }
        }
      } else {
        for(const [mp,offset] of [[my_top,0],[my_mid,-mh/2],[my_bot,-mh]]){
          const d=Math.abs(mp-sl.pos);
          if(d<bestDy){
            bestDy=d;
            snappedY=sl.pos+offset;
            activeGuides.filter(g=>g.axis==='y').forEach((_,i,a)=>a.splice(i,1));
          }
          if(d<SNAP_T){
            const already=activeGuides.find(g=>g.axis==='y'&&Math.abs(g.pos-sl.pos)<1);
            if(!already)activeGuides.push({axis:'y',pos:sl.pos,type:sl.type});
          }
        }
      }
    }

    // If not within threshold, no snap
    if(bestDx>SNAP_T)snappedX=rawX;
    if(bestDy>SNAP_T)snappedY=rawY;

    return{snappedX,snappedY,guides:activeGuides};
  },[tpl]);
  computeSnapRef.current=computeSnap;

  // ── GLOBAL MOUSE MOVE / UP ──────────────────────────────────────
  // Uses refs (drawLayersRef, updateLayerRef, scaleRef) so this effect
  // registers ONCE and NEVER tears down mid-drag when other state changes.
  useEffect(()=>{
    let rafId=null;

    const onMove=e=>{
      const d=iact.current;
      if(d.mode==='idle')return;
      const sc=scaleRef.current;
      const dx=(e.clientX-d.startX)/sc;
      const dy=(e.clientY-d.startY)/sc;

      let overrides={};
      let guides=[];
      if(d.mode==='move'){
        const rawX=Math.round(d.origX+dx), rawY=Math.round(d.origY+dy);
        // Keynote magnetic snap: compute snap with release hysteresis
        if(!d.snapLock)d.snapLock={};
        const snap=computeSnapRef.current&&computeSnapRef.current(d.layerId,rawX,rawY,d.origX,d.origY);
        let finalX=rawX, finalY=rawY;
        if(snap){
          guides=snap.guides;
          // X axis snap with magnetic hold
          if(snap.snappedX!==rawX){
            d.snapLock.x=snap.snappedX;
            finalX=snap.snappedX;
          } else if(d.snapLock.x!=null){
            // Still locked? Only release if user dragged past SNAP_R beyond the snap point
            const layer=activeLayersRef.current.find(l=>l.id===d.layerId);
            const mw2=layer?(layer.w||(tplRef.current||{w:800}).w):100;
            const snapRawEdges=[d.snapLock.x, d.snapLock.x+mw2/2, d.snapLock.x+mw2];
            const minDist=Math.min(...snapRawEdges.map(e=>Math.abs(rawX-(e-(e-d.snapLock.x)))));
            if(Math.abs(rawX-d.snapLock.x)>SNAP_R&&Math.abs(rawX-(d.snapLock.x+(layer?layer.w||0:0)/2))>SNAP_R){
              d.snapLock.x=null;finalX=rawX;
            } else {finalX=d.snapLock.x;}
          }
          // Y axis snap with magnetic hold
          if(snap.snappedY!==rawY){
            d.snapLock.y=snap.snappedY;
            finalY=snap.snappedY;
          } else if(d.snapLock.y!=null){
            const layer2=activeLayersRef.current.find(l=>l.id===d.layerId);
            const mh2=layer2?(layer2.h||(tplRef.current||{h:800}).h):100;
            if(Math.abs(rawY-d.snapLock.y)>SNAP_R&&Math.abs(rawY-(d.snapLock.y+mh2/2))>SNAP_R){
              d.snapLock.y=null;finalY=rawY;
            } else {finalY=d.snapLock.y;}
          }
        }
        // Clamp to template bounds so layers can't escape onto the UI
        const tpl2=tplRef.current||{w:800,h:800};
        const movingL=activeLayersRef.current.find(l=>l.id===d.layerId);
        const lw2=movingL?(movingL.w||100):100;
        const lh2=movingL?(movingL.h||100):100;
        const clampedX=Math.round(Math.max(0,Math.min(tpl2.w-lw2,finalX)));
        const clampedY=Math.round(Math.max(0,Math.min(tpl2.h-lh2,finalY)));
        overrides[d.layerId]={x:clampedX,y:clampedY};
      } else if(d.mode==='resize'){
        const {origX:ox,origY:oy,origW:ow,origH:oh,handle}=d;
        let nx=ox,ny=oy,nw=ow,nh=oh;
        if(handle.includes('e'))nw=Math.max(10,ow+dx);
        if(handle.includes('s'))nh=Math.max(10,oh+dy);
        if(handle.includes('w')){nx=ox+dx;nw=Math.max(10,ow-dx);}
        if(handle.includes('n')){ny=oy+dy;nh=Math.max(10,oh-dy);}
        overrides[d.layerId]={x:Math.round(nx),y:Math.round(ny),w:Math.round(nw),h:Math.round(nh)};
      }

      if(rafId)cancelAnimationFrame(rafId);
      rafId=requestAnimationFrame(()=>{
        drawLayersRef.current&&drawLayersRef.current(overrides,guides);
        d.liveOverrides=overrides;
        // Direct DOM mutation for zero-lag overlay tracking
        const cv=canvasRef.current;
        if(cv&&overrides[d.layerId]){
          const cr=cv.getBoundingClientRect();
          const ov2=overrides[d.layerId];
          const sc2=scaleRef.current;
          const bl=bleedRef.current;
          const bx=ov2.x!=null?ov2.x:0;
          const by=ov2.y!=null?ov2.y:0;
          const bw=ov2.w!=null?ov2.w:d.origW;
          const bh=ov2.h!=null?ov2.h:d.origH;
          // cr.left is the left of the oversized canvas; add BLEED*scale to get template origin
          const ox=cr.left+(bx+bl)*sc2, oy2=cr.top+(by+bl)*sc2;
          const ow=bw*sc2, oh=bh*sc2;
          const o=overlayRef.current;
          if(o.outline){
            o.outline.style.left=ox+'px'; o.outline.style.top=oy2+'px';
            o.outline.style.width=ow+'px'; o.outline.style.height=oh+'px';
          }
          const HS=8;
          [[ox,oy2],[ox+ow/2,oy2],[ox+ow,oy2],
           [ox+ow,oy2+oh/2],
           [ox+ow,oy2+oh],[ox+ow/2,oy2+oh],[ox,oy2+oh],
           [ox,oy2+oh/2]
          ].forEach(([hx,hy],i)=>{
            const el=o['h'+i];
            if(el){el.style.left=(hx-HS/2)+'px';el.style.top=(hy-HS/2)+'px';}
          });
        }
        rafId=null;
      });
    };

    const onUp=e=>{
      const d=iact.current;
      if(d.mode==='idle')return;
      const screenDx=e.clientX-d.startX;
      const screenDy=e.clientY-d.startY;
      const wasDrag=Math.abs(screenDx)>3||Math.abs(screenDy)>3;

      if(wasDrag){
        const sc=scaleRef.current;
        const ov=d.liveOverrides;
        if(ov&&ov[d.layerId]){
          if(d.mode==='move'){
            // Only commit x,y — never clobber w,h
            updateLayerRef.current&&updateLayerRef.current(d.layerId,{x:ov[d.layerId].x,y:ov[d.layerId].y});
          } else {
            updateLayerRef.current&&updateLayerRef.current(d.layerId,ov[d.layerId]);
          }
        } else if(d.mode==='move'){
          updateLayerRef.current&&updateLayerRef.current(d.layerId,{
            x:Math.round(d.origX+screenDx/sc),
            y:Math.round(d.origY+screenDy/sc)
          });
        }
      }
      iact.current={mode:'idle',liveOverrides:null};
      setCursorStyle('default');
      if(rafId)cancelAnimationFrame(rafId);
      drawLayersRef.current&&drawLayersRef.current();
    };

    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
    return()=>{
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
      if(rafId)cancelAnimationFrame(rafId);
    };
  },[]);

  // ── KEEP canvasRect IN SYNC with scroll/resize ─────────────────
  useEffect(()=>{
    const update=()=>{
      if(canvasRef.current){const r=canvasRef.current.getBoundingClientRect();canvasRectRef.current=r;setCanvasRect(r);}
    };
    update();
    const ro=new ResizeObserver(update);
    if(canvasRef.current)ro.observe(canvasRef.current);
    window.addEventListener('scroll',update,true);
    window.addEventListener('resize',update);
    return()=>{ro.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);};
  },[]);

  // ── CLEAR SELECTION when clicking outside canvas wrapper ────────
  useEffect(()=>{
    const onOutsideClick=e=>{
      if(editingId)return; // let commitTextEdit handle it
      if(!canvasRef.current)return;
      // Check if the click target is inside the canvas wrapper or any portal overlay
      // Use wrapperRef so clicks on the canvas element itself (pointerEvents:none) are also caught
      if(wrapperRef.current&&wrapperRef.current.contains(e.target))return;
      if(e.target.closest&&e.target.closest('[data-tl-overlay]'))return;
      // Clicks within the editor panels should not clear selection
      if(e.target.closest&&e.target.closest('[data-tl-editor]'))return;
      setSelId(null);
      lastClickRef.current={id:null,time:0};
    };
    window.addEventListener('mousedown',onOutsideClick,true);
    return()=>window.removeEventListener('mousedown',onOutsideClick,true);
  },[editingId]);

  // ── CANVAS CURSOR on hover ──────────────────────────────────────
  const onCanvasMouseMove=useCallback(e=>{
    if(iact.current.mode!=='idle')return;
    const rect=canvasRef.current.getBoundingClientRect();
    const cx=(e.clientX-rect.left)/scale - BLEED;
    const cy=(e.clientY-rect.top)/scale - BLEED;
    const handle=hitHandle(cx,cy);
    if(handle){setCursorStyle(HANDLE_CURSORS[handle]||'nwse-resize');return;}
    const hit=hitTest(cx,cy);
    setCursorStyle(hit?'move':'default');
  },[scale,hitHandle,hitTest]);

  // ── FONT GROUPS ─────────────────────────────────────────────────
  const FONT_GROUPS=[
    {label:'── Mono / Technical',keys:['share-tech','b612','ibm-plex','space-mono','anonymous','courier','major-mono','vt323','press-start']},
    {label:'── Industrial / Condensed',keys:['barlow','roboto-condensed','oswald','bebas','anton','teko','saira','fjalla','pathway','six-caps','stint','staatliches','bungee','righteous']},
    {label:'── Sci-Fi / Futurist',keys:['orbitron','audiowide','aldrich','michroma','chakra','exo2','rajdhani','syncopate','jura','gruppo','black-ops','graduate']},
    {label:'── Editorial / Serif',keys:['playfair','cinzel','cormorant','libre-baskerville','im-fell','alfa-slab','archivo-black','passion-one']},
    {label:'── Vintage / Character',keys:['special-elite','rye']},
    {label:'── Handwritten',keys:['permanent-marker','caveat','kalam','patrick-hand']},
  ];

  const typeIcon={bg:'▬',image:'⬜',text:'T',shape:'◻'};
  const iconBtn=(label,onClick,color)=>(
    <button onClick={onClick} style={{
      background:'none',border:'none',cursor:'pointer',
      color:color||T.muted,fontSize:14,lineHeight:1,
      padding:'4px 5px',minWidth:24,minHeight:24,
      display:'flex',alignItems:'center',justifyContent:'center',
      borderRadius:T.r||2,
    }}>{label}</button>
  );

  // Selection outline + handles are drawn directly on canvas in drawLayers()

  return(
    <div data-tl-editor style={{display:'flex',minHeight:'calc(100vh - 88px)'}}>
      {/* ── LEFT: layers panel ── */}
      <div style={{width:artLayersPanel.width,flexShrink:0,background:T.panel,borderRight:artLayersPanel.collapsed?'none':`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',transition:'width 0.15s'}}>
        <div {...artLayersPanel.handle}/>
        {artLayersPanel.tab}
        <div style={{padding:'8px 10px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontSize:7,letterSpacing:'0.14em',textTransform:'uppercase',color:T.muted,marginBottom:4}}>Format</div>
          <select value={artState.template} onChange={e=>setArtState(s=>({...s,template:e.target.value,side:'A'}))} style={{...mkIS(T),fontSize:9}}>
            {Object.entries(ART_TEMPLATES).map(([k,t])=><option key={k} value={k}>{t.name}</option>)}
          </select>
          <div style={{fontSize:7,color:T.muted,marginTop:3,lineHeight:1.4}}>{tpl.note}</div>
          {hasSides&&(
            <div style={{display:'flex',gap:4,marginTop:7}}>
              {['A','B'].map(s=>(
                <button key={s} onClick={()=>switchSide(s)} style={{
                  flex:1,padding:'5px 0',fontSize:10,fontWeight:700,letterSpacing:'0.1em',
                  background:side===s?T.accent:T.bg,color:side===s?T.bg:T.muted,
                  border:`1px solid ${side===s?T.accent:T.border}`,cursor:'pointer',
                  borderRadius:T.r||0,fontFamily:'inherit',
                }}>Side {s}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{padding:'5px 8px',borderBottom:`1px solid ${T.border}`,flexShrink:0,display:'flex',gap:4}}>
          <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>importImg(e.target.files[0])}/>
          <button onClick={()=>{pendingImg.current='add';fileRef.current.click();}} style={{...mkBtn(T),flex:1,fontSize:8,padding:'5px 0'}}>+ Img</button>
          <button onClick={()=>addLayer('text')} style={{...mkBtn(T),flex:1,fontSize:8,padding:'5px 0'}}>+ Text</button>
          <button onClick={()=>addLayer('shape')} style={{...mkBtn(T),flex:1,fontSize:8,padding:'5px 0'}}>+ Shape</button>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {[...activeLayers].reverse().map(layer=>{
            const sel=layer.id===activeSelectedId;
            return(
              <div key={layer.id} onClick={()=>setSelId(layer.id)}
                style={{display:'flex',alignItems:'center',gap:2,padding:'3px 6px',
                  background:sel?T.card:'transparent',cursor:'pointer',
                  borderLeft:`2px solid ${sel?T.accent:'transparent'}`,minHeight:32}}>
                <span style={{fontSize:10,color:T.muted,flexShrink:0,width:14,textAlign:'center'}}>{typeIcon[layer.type]}</span>
                <span style={{fontSize:9,color:sel?T.bright:T.text,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{layer.name}</span>
                <div style={{display:'flex',alignItems:'center',flexShrink:0}}>
                  {iconBtn(layer.visible?'◉':'○',e=>{e.stopPropagation();updateLayer(layer.id,{visible:!layer.visible});},layer.visible?T.accent:T.border)}
                  {iconBtn('↑',e=>{e.stopPropagation();moveLayerOrder(layer.id,'up');})}
                  {iconBtn('↓',e=>{e.stopPropagation();moveLayerOrder(layer.id,'down');})}
                  {layer.type!=='bg'&&iconBtn('✕',e=>{e.stopPropagation();deleteLayer(layer.id);},'#f87171')}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{padding:'8px 10px',borderTop:`1px solid ${T.border}`,flexShrink:0}}>
          <Tog T={T} label="Show guides" value={artState.showGuides} onChange={v=>setArtState(s=>({...s,showGuides:v}))}/>
          <button onClick={exportArt} style={{...mkBtn(T,true),width:'100%',padding:'9px 0',fontSize:9,marginTop:7}}>
            ⬇ Export PNG{hasSides?` (Side ${side})`:''}
          </button>
        </div>
      </div>
      {artLayersPanel.expandStub}

      {/* ── CENTER: slate stage — fills remaining space ── */}
      <div style={{flex:1,overflow:'auto',position:'relative',
                   display:'flex',alignItems:'center',justifyContent:'center',
                   background:'#3a3d42'}}>
        {/* Side label floats top-center on stage */}
        {hasSides&&<div style={{position:'absolute',top:10,left:0,right:0,
          textAlign:'center',fontSize:8,color:'rgba(255,255,255,0.35)',
          letterSpacing:'0.2em',textTransform:'uppercase',fontFamily:'monospace',
          pointerEvents:'none',zIndex:2}}>
          SIDE {side} — {tpl.name}
        </div>}
        {/* Template wrapper — template-sized, black bg, shadow, bleed canvas overflows it */}
        <div ref={wrapperRef} style={{
            position:'relative',display:'inline-block',flexShrink:0,
            width:tpl.w*scale,height:tpl.h*scale,
            boxShadow:'0 8px 48px rgba(0,0,0,0.85)',
            borderRadius:tpl.shape==='circle'?'50%':'0',
            overflow:'visible'}}>
          <canvas ref={canvasRef} width={tpl.w+BLEED*2} height={tpl.h+BLEED*2}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseLeave={()=>iact.current.mode==='idle'&&setCursorStyle('default')}
            style={{display:'block',
              position:'absolute',
              left:-BLEED*scale,top:-BLEED*scale,
              width:(tpl.w+BLEED*2)*scale,height:(tpl.h+BLEED*2)*scale,
              cursor:cursorStyle,userSelect:'none',
              pointerEvents:'all'}}/>
        </div>
          {/* Inline text editor — portalled to body, sits exactly over canvas text */}
          {editingId&&canvasRect&&(()=>{
            const el=activeLayers.find(l=>l.id===editingId);
            if(!el)return null;
            const bb=getLayerBBox(el)||{x:0,y:0,w:200,h:60};
            const ex=canvasRect.left+(bb.x+BLEED)*scale;
            const ey=canvasRect.top+(bb.y+BLEED)*scale;
            const ew=bb.w*scale;
            const eh=bb.h*scale;
            const fs=(el.fontSize||32)*scale;
            const lh=fs*(el.lineHeight||1.3);
            const ff=el.fontFamily||'monospace';
            const fw=el.bold?'bold':'normal';
            const fst=el.italic?'italic':'normal';
            const col=el.color||'#fff';
            const ta=el.align||'left';
            return ReactDOM.createPortal(
              <div
                ref={textEditorRef}
                contentEditable suppressContentEditableWarning
                onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();commitTextEdit();}}}
                onBlur={commitTextEdit}
                onMouseDown={e=>e.stopPropagation()}
                onInput={e=>{
                  // Expand layer h to fit typed content, then refresh canvasRect
                  const el2=e.currentTarget;
                  const newH=Math.round(el2.scrollHeight/scaleRef.current);
                  updateLayerRef.current&&updateLayerRef.current(editingId,{h:newH});
                }}
                style={{
                  position:'fixed',left:ex,top:ey,width:ew,
                  minHeight:eh,height:'auto',overflow:'visible',
                  fontSize:fs,
                  lineHeight:lh+'px',
                  fontFamily:ff,fontWeight:fw,fontStyle:fst,color:col,textAlign:ta,
                  whiteSpace:'pre-wrap',wordBreak:'break-word',
                  padding:0,margin:0,zIndex:10001,
                  caretColor:col,cursor:'text',
                  letterSpacing:(el.letterSpacing||0)+'px',
                  textDecoration:el.underline?'underline':'none',
                  textTransform:el.caps?'uppercase':'none',
                  outline:`2px solid rgba(200,255,0,0.55)`,outlineOffset:'2px',
                  boxSizing:'border-box',background:'transparent',border:'none',
                }}
                dangerouslySetInnerHTML={{__html:(el.text||'').replace(/\n/g,'<br/>')}}
              />,
              document.body
            );
          })()}
          {/* Fixed-position selection overlay — portalled to body, no overflow clipping */}
          {selLayer&&selLayer.type!=='bg'&&canvasRect&&(()=>{
            // Use canvasRectRef for latest rect, activeLayersRef for latest layer data
            const freshSel=activeLayersRef.current.find(l=>l.id===selLayer.id)||selLayer;
            const bb=getLayerBBox(freshSel);
            if(!bb)return null;
            const cr=canvasRectRef.current||canvasRect;
            // Canvas is oversized by BLEED on each side; offset coords accordingly
            const ox=cr.left+(bb.x+BLEED)*scale;
            const oy=cr.top+(bb.y+BLEED)*scale;
            const ow=bb.w*scale;
            const oh=bb.h*scale;
            const HS=8; // handle size px
            const handles=[
              {id:'nw',x:ox,      y:oy,       cur:'nwse-resize'},
              {id:'n', x:ox+ow/2, y:oy,       cur:'ns-resize'},
              {id:'ne',x:ox+ow,   y:oy,       cur:'nesw-resize'},
              {id:'e', x:ox+ow,   y:oy+oh/2,  cur:'ew-resize'},
              {id:'se',x:ox+ow,   y:oy+oh,    cur:'nwse-resize'},
              {id:'s', x:ox+ow/2, y:oy+oh,    cur:'ns-resize'},
              {id:'sw',x:ox,      y:oy+oh,    cur:'nesw-resize'},
              {id:'w', x:ox,      y:oy+oh/2,  cur:'ew-resize'},
            ];
            return ReactDOM.createPortal(
              <div data-tl-overlay style={{position:'fixed',left:0,top:0,width:0,height:0,pointerEvents:'none',zIndex:9999}}>
                {/* Outline */}
                <div ref={el=>overlayRef.current.outline=el} style={{position:'fixed',left:ox,top:oy,width:ow,height:oh,
                  border:`1px dashed ${T.accent}`,boxSizing:'border-box',pointerEvents:'none'}}/>
                {/* Handles */}
                {handles.map(h=>(
                  <div key={h.id} ref={el=>overlayRef.current['h'+handles.indexOf(h)]=el}
                    onMouseDown={e=>{
                      e.preventDefault();e.stopPropagation();
                      // h.id is the handle — no need to hit-test, we're already on the handle
                      const selId=activeSelectedIdRef.current;
                      const freshS=activeLayersRef.current.find(l=>l.id===selId);
                      if(freshS){
                        const bb2=getLayerBBox(freshS)||{x:0,y:0,w:100,h:100};
                        iact.current={mode:'resize',layerId:freshS.id,handle:h.id,
                          startX:e.clientX,startY:e.clientY,
                          origX:bb2.x,origY:bb2.y,origW:bb2.w,origH:bb2.h};
                        setCursorStyle(h.cur);
                      }
                    }}
                    data-tl-overlay
                    style={{position:'fixed',
                      left:h.x-HS/2,top:h.y-HS/2,
                      width:HS,height:HS,
                      background:T.bg,border:`1.5px solid ${T.accent}`,
                      borderRadius:1,pointerEvents:'auto',
                      cursor:h.cur,zIndex:10000,
                      boxShadow:'0 1px 4px rgba(0,0,0,0.6)',
                    }}/>
                ))}
              </div>,
              document.body
            );
          })()}
        {artState.showGuides&&<div style={{
          position:'absolute',bottom:10,left:0,right:0,
          textAlign:'center',fontSize:7,color:'rgba(255,255,255,0.28)',
          letterSpacing:'0.08em',pointerEvents:'none',zIndex:2}}>
          {tpl.w}×{tpl.h}px · drag to move · handles to resize
        </div>}
      </div>

      {/* ── RIGHT: properties ── */}
      {artPropsPanel.expandStub}
      <div style={{width:artPropsPanel.width,flexShrink:0,background:T.panel,borderLeft:artPropsPanel.collapsed?'none':`1px solid ${T.border}`,overflow:'hidden',padding:artPropsPanel.collapsed?0:'10px 12px',position:'relative',transition:'width 0.15s'}}>
        <div {...artPropsPanel.handle}/>
        {artPropsPanel.tab}
        {!selLayer
          ?<div style={{fontSize:9,color:T.muted,textAlign:'center',marginTop:40,lineHeight:1.8}}>Select a layer</div>
          :(<>
            <div style={{fontSize:7,color:T.accent,letterSpacing:'0.14em',textTransform:'uppercase',marginBottom:8}}>{selLayer.type} layer</div>
            <F T={T} label="Name"><TInp T={T} value={selLayer.name} onChange={e=>updateSel({name:e.target.value})}/></F>
            <F T={T} label={`Opacity ${Math.round((selLayer.opacity??1)*100)}%`}>
              <input type="range" min={0} max={1} step={0.01} value={selLayer.opacity??1}
                onChange={e=>updateSel({opacity:+e.target.value})} style={{width:'100%'}}/>
            </F>

            {selLayer.type==='bg'&&(
              <F T={T} label="Color"><div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input type="color" value={selLayer.color||'#000000'} onChange={e=>updateSel({color:e.target.value})}/>
                <TInp T={T} value={selLayer.color||'#000000'} onChange={e=>updateSel({color:e.target.value})} style={{flex:1,fontSize:10}}/>
              </div></F>
            )}

            {selLayer.type==='image'&&(<>
              <Row2>
                <F T={T} label="X"><TInp T={T} type="number" value={selLayer.x||0} onChange={e=>updateSel({x:+e.target.value})}/></F>
                <F T={T} label="Y"><TInp T={T} type="number" value={selLayer.y||0} onChange={e=>updateSel({y:+e.target.value})}/></F>
              </Row2>
              <Row2>
                <F T={T} label="W"><TInp T={T} type="number" min={1} value={selLayer.w||tpl.w} onChange={e=>updateSel({w:+e.target.value})}/></F>
                <F T={T} label="H"><TInp T={T} type="number" min={1} value={selLayer.h||tpl.h} onChange={e=>updateSel({h:+e.target.value})}/></F>
              </Row2>
              <button onClick={()=>{pendingImg.current=selLayer.id;fileRef.current.click();}} style={{...mkBtn(T),width:'100%',fontSize:9,padding:'6px 0',marginTop:2}}>↺ Replace Image</button>
            </>)}

            {selLayer.type==='text'&&(()=>{
              const tl=selLayer;
              const fmtBtn=(label,active,onClick,title)=>(
                <button title={title} onClick={onClick} style={{
                  flex:1,padding:'5px 0',fontSize:11,fontWeight:700,
                  background:active?T.accent:T.bg,
                  color:active?T.bg:T.muted,
                  border:`1px solid ${active?T.accent:T.border}`,
                  cursor:'pointer',borderRadius:T.r||0,fontFamily:'inherit',lineHeight:1,
                }}>{label}</button>
              );
              return(<>
                {/* ── Double-click hint ── */}
                <div style={{fontSize:7,color:T.muted,marginBottom:8,letterSpacing:'0.06em',lineHeight:1.5,
                  padding:'5px 8px',background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.r||0}}>
                  Double-click layer on canvas to edit text inline
                </div>

                {/* ── Font family ── */}
                <F T={T} label="Font">
                  <select value={tl.fontFamily||'"Share Tech Mono",monospace'}
                    onChange={e=>updateSel({fontFamily:e.target.value})} style={{...mkIS(T),fontSize:9}}>
                    {FONT_GROUPS.map(g=>(
                      <optgroup key={g.label} label={g.label}>
                        {g.keys.filter(k=>FONTS[k]).map(k=>(
                          <option key={k} value={FONTS[k].css}>{FONTS[k].name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </F>

                {/* ── Size + Line height ── */}
                <Row2>
                  <F T={T} label="Size">
                    <div style={{display:'flex',alignItems:'center',gap:3}}>
                      <button onClick={()=>updateSel({fontSize:Math.max(6,(tl.fontSize||32)-1)})}
                        style={{...mkBtn(T),padding:'3px 7px',fontSize:12,lineHeight:1}}>−</button>
                      <TInp T={T} type="number" min={6} value={tl.fontSize||32}
                        onChange={e=>updateSel({fontSize:Math.max(6,+e.target.value)})}
                        style={{textAlign:'center',width:44,fontSize:11}}/>
                      <button onClick={()=>updateSel({fontSize:(tl.fontSize||32)+1})}
                        style={{...mkBtn(T),padding:'3px 7px',fontSize:12,lineHeight:1}}>+</button>
                    </div>
                  </F>
                  <F T={T} label="Leading">
                    <TInp T={T} type="number" min={0.5} max={4} step={0.05}
                      value={tl.lineHeight||1.3}
                      onChange={e=>updateSel({lineHeight:Math.max(0.5,+e.target.value)})}
                      style={{fontSize:11}}/>
                  </F>
                </Row2>

                {/* ── Bold / Italic / Underline / Caps ── */}
                <F T={T} label="Style">
                  <div style={{display:'flex',gap:4}}>
                    {fmtBtn('B',tl.bold,()=>updateSel({bold:!tl.bold}),'Bold')}
                    {fmtBtn('I',tl.italic,()=>updateSel({italic:!tl.italic}),'Italic')}
                    {fmtBtn('U',tl.underline,()=>updateSel({underline:!tl.underline}),'Underline')}
                    {fmtBtn('AA',tl.caps,()=>updateSel({caps:!tl.caps}),'Uppercase')}
                  </div>
                </F>

                {/* ── Alignment — L / C / R ── */}
                <F T={T} label="Align">
                  <div style={{display:'flex',gap:4}}>
                    {[
                      {a:'left',   lines:[[1,2,13,2],[1,5,9,5],[1,8,12,8],[1,11,7,11]]},
                      {a:'center', lines:[[1,2,13,2],[3,5,11,5],[2,8,12,8],[4,11,10,11]]},
                      {a:'right',  lines:[[1,2,13,2],[5,5,13,5],[2,8,13,8],[7,11,13,11]]},
                    ].map(({a,lines})=>{
                      const active=(tl.align||'left')===a;
                      return(
                        <button key={a} title={a.charAt(0).toUpperCase()+a.slice(1)}
                          onClick={()=>updateSel({align:a})}
                          style={{flex:1,padding:'6px 0',display:'flex',alignItems:'center',
                            justifyContent:'center',background:active?T.accent:T.bg,
                            color:active?T.bg:T.muted,
                            border:`1px solid ${active?T.accent:T.border}`,
                            cursor:'pointer',borderRadius:T.r||0}}>
                          <svg width="14" height="13" viewBox="0 0 14 13" fill="none"
                            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            {lines.map(([x1,y1,x2,y2],i)=>(
                              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>
                            ))}
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                </F>

                {/* ── Color + Letter spacing ── */}
                <Row2>
                  <F T={T} label="Color">
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <input type="color" value={tl.color||'#ffffff'} onChange={e=>updateSel({color:e.target.value})}/>
                      <TInp T={T} value={tl.color||'#ffffff'} onChange={e=>updateSel({color:e.target.value})} style={{flex:1,fontSize:9}}/>
                    </div>
                  </F>
                  <F T={T} label="Spacing">
                    <TInp T={T} type="number" min={-10} max={100} step={0.5}
                      value={tl.letterSpacing||0}
                      onChange={e=>updateSel({letterSpacing:+e.target.value})}
                      style={{fontSize:11}}/>
                  </F>
                </Row2>

                {/* ── Position + Size ── */}
                <Row2>
                  <F T={T} label="X"><TInp T={T} type="number" value={tl.x||0} onChange={e=>updateSel({x:+e.target.value})}/></F>
                  <F T={T} label="Y"><TInp T={T} type="number" value={tl.y||0} onChange={e=>updateSel({y:+e.target.value})}/></F>
                </Row2>
                <Row2>
                  <F T={T} label="W"><TInp T={T} type="number" min={20} value={tl.w||Math.round(tpl.w*0.84)} onChange={e=>updateSel({w:+e.target.value})}/></F>
                  <F T={T} label="H"><TInp T={T} type="number" min={10} value={tl.h||Math.round((tl.fontSize||32)*2.2)} onChange={e=>updateSel({h:+e.target.value})}/></F>
                </Row2>
              </>);
            })()}

            {selLayer.type==='shape'&&(<>
              <F T={T} label="Shape"><TSel T={T} value={selLayer.shapeType||'rect'} onChange={e=>updateSel({shapeType:e.target.value})}>
                <option value="rect">Rectangle</option><option value="ellipse">Ellipse / Circle</option>
              </TSel></F>
              <F T={T} label="Fill"><div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input type="color" value={selLayer.fill&&selLayer.fill!=='transparent'?selLayer.fill:'#000000'} onChange={e=>updateSel({fill:e.target.value})}/>
                <TInp T={T} value={selLayer.fill||'transparent'} onChange={e=>updateSel({fill:e.target.value})} style={{flex:1,fontSize:10}}/>
              </div></F>
              <F T={T} label="Stroke"><div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input type="color" value={selLayer.stroke&&selLayer.stroke!=='transparent'?selLayer.stroke:'#ffffff'} onChange={e=>updateSel({stroke:e.target.value})}/>
                <TInp T={T} value={selLayer.stroke||'transparent'} onChange={e=>updateSel({stroke:e.target.value})} style={{flex:1,fontSize:10}}/>
              </div></F>
              <F T={T} label="Stroke W"><TInp T={T} type="number" min={0} value={selLayer.strokeW||2} onChange={e=>updateSel({strokeW:+e.target.value})}/></F>
              <Row2>
                <F T={T} label="X"><TInp T={T} type="number" value={selLayer.x||0} onChange={e=>updateSel({x:+e.target.value})}/></F>
                <F T={T} label="Y"><TInp T={T} type="number" value={selLayer.y||0} onChange={e=>updateSel({y:+e.target.value})}/></F>
              </Row2>
              <Row2>
                <F T={T} label="W"><TInp T={T} type="number" min={1} value={selLayer.w||100} onChange={e=>updateSel({w:+e.target.value})}/></F>
                <F T={T} label="H"><TInp T={T} type="number" min={1} value={selLayer.h||100} onChange={e=>updateSel({h:+e.target.value})}/></F>
              </Row2>
            </>)}
          </>)
        }
      </div>
    </div>
  );
}


const STATUS_OPT={draft:{label:'Draft',color:'#888'},complete:{label:'Complete',color:'#58a6ff'},released:{label:'Released',color:'#3fb950'},archived:{label:'Archived',color:'#8b949e'}};
const CREDIT_ROLES=['Songwriter','Composer','Lyricist','Producer','Co-Producer','Featured Artist','Mixer','Mastering Engineer','Performer','Arranger','Publisher','Label','Other'];
const PRO_LIST=['—','ASCAP','BMI','SESAC','SOCAN','PRS','APRA AMCOS','GEMA','STIM','SACEM','Other'];

