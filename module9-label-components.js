// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 9: LABEL COMPONENTS                                  ║
// ║  atkinsonDither, QRBlock, TrackLabel                         ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ DITHERING ━━━━━━━━
function atkinsonDither(imgEl,tw,th,threshold=128,contrast=0){
  const c=document.createElement('canvas');c.width=tw;c.height=th;
  const ctx=c.getContext('2d');ctx.filter=`contrast(${100+contrast}%)`;ctx.drawImage(imgEl,0,0,tw,th);
  const id=ctx.getImageData(0,0,tw,th),d=id.data,w=tw,h=th,g=new Float32Array(w*h);
  for(let i=0;i<w*h;i++){const p=i*4;g[i]=0.299*d[p]+0.587*d[p+1]+0.114*d[p+2];}
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,old=Math.max(0,Math.min(255,g[i])),nw=old<threshold?0:255;g[i]=nw;const err=(old-nw)/8;[[x+1,y],[x+2,y],[x-1,y+1],[x,y+1],[x+1,y+1],[x,y+2]].forEach(([nx,ny])=>{if(nx>=0&&nx<w&&ny>=0&&ny<h)g[ny*w+nx]+=err;});}}
  for(let i=0;i<w*h;i++){const p=i*4;const v=Math.round(g[i]);d[p]=d[p+1]=d[p+2]=v;d[p+3]=255;}
  ctx.putImageData(id,0,0);return c.toDataURL('image/png');
}

// ━━━━━━━━ QR BLOCK ━━━━━━━━
function QRBlock({url,colors,size}){
  const ref=useRef();
  useEffect(()=>{
    if(!ref.current)return;ref.current.innerHTML='';
    const t=url&&url.trim()?url.trim():'https://example.com';
    try{new QRCode(ref.current,{text:t,width:size,height:size,colorDark:colors.fg,colorLight:colors.bg,correctLevel:QRCode.CorrectLevel.M});}catch(e){}
  },[url,colors.fg,colors.bg,size]);
  return <div ref={ref} style={{width:size,height:size,display:'flex',alignItems:'center',justifyContent:'center'}}/>;
}
// ━━━━━━━━ TRACK LABEL COMPONENT ━━━━━━━━
const TrackLabel=React.forwardRef(function TrackLabel({fields,settings},ref){
  const sc=getColors(settings),ff=FONTS[settings.font]?.css||FONTS['share-tech'].css;
  const bw=settings.outerBorder||0,W=settings.labelW,H=settings.labelH,bd=settings.borders||{};
  const ibw=Math.max(1,Math.round(bw*0.6));
  const bl=()=>`${ibw}px solid ${rgba(sc.border)}`;
  const metaVals=settings.metaFields?.filter(f=>f.show)||[];
  const qrSize=Math.min(84,Math.round(W*0.2));
  const qrUrl=settings.qrMode==='dynamic'?`https://go.tracklab.io/${settings.dynamicId}`:(fields.url||'');
  let bg={background:rgba(sc.bg,sc._bgAlpha)};
  if(settings.useGradient)bg={background:`linear-gradient(${settings.gradDir||'to bottom'},${rgba(sc.bg,sc._bgAlpha)},${rgba(settings.gradColor2,sc._bgAlpha)})`};
  return(
    <div ref={ref} style={{width:W,height:H,display:'flex',flexDirection:'column',fontFamily:ff,position:'relative',overflow:'hidden',flexShrink:0,border:bw>0?`${bw}px solid ${rgba(sc.border)}`:'none',...bg}}>
      {settings.showBanner&&(
        <div style={{background:rgba(sc.bannerBg,sc._bgAlpha),color:rgba(sc.bannerFg,sc._fgAlpha),display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 10px',flexShrink:0,minHeight:36,borderBottom:bd.bannerBottom?bl():'none'}}>
          <div style={{fontSize:settings.artistSize||15,fontWeight:settings.artistBold?800:400,fontStyle:settings.artistItalic?'italic':'normal',letterSpacing:'0.05em',lineHeight:1,textTransform:'none'}}>{fields.artist||'ARTIST'}</div>
          <div style={{fontSize:9,letterSpacing:'0.15em',opacity:0.75,fontFamily:ff,textTransform:'none'}}>{fields.catalog}</div>
        </div>
      )}
      <div style={{padding:'7px 10px 5px',flexShrink:0,position:'relative',borderBottom:bd.titleBottom?bl():'none',...bg}}>
        <div style={{fontSize:7,letterSpacing:'0.25em',textTransform:'uppercase',color:rgba(sc.sub,sc._fgAlpha),marginBottom:2,fontFamily:ff}}>Track</div>
        <div style={{fontSize:settings.titleSize,fontWeight:settings.titleBold?800:400,fontStyle:settings.titleItalic?'italic':'normal',textAlign:settings.titleAlign||'left',lineHeight:1.0,letterSpacing:'0.02em',textTransform:'none',color:rgba(sc.fg,sc._fgAlpha),wordBreak:'break-word',paddingRight:42,fontFamily:ff}}>{fields.title||'UNTITLED'}</div>
        <div style={{position:'absolute',right:10,top:8,fontSize:Math.round(settings.titleSize*0.8),fontWeight:700,color:rgba(sc.accent,0.22),lineHeight:1,fontFamily:ff}}>{fields.trackNum}</div>
      </div>
      {settings.showMeta&&metaVals.length>0&&(
        <div style={{display:'flex',background:rgba(sc.metaBg,sc._bgAlpha),borderBottom:bd.metaBottom?bl():'none',flexShrink:0,minHeight:32}}>
          {metaVals.map((mf,i)=>(
            <div key={mf.id} style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',padding:'0 7px',borderRight:bd.metaCellDividers&&i<metaVals.length-1?`1px solid ${rgba(sc.metaFg,0.12)}`:'none'}}>
              <div style={{fontSize:settings.metaLabelSize||6,letterSpacing:'0.22em',textTransform:'uppercase',opacity:settings.metaLabelColor?1:0.45,color:settings.metaLabelColor?rgba(settings.metaLabelColor,sc._fgAlpha):rgba(sc.metaFg,sc._fgAlpha),marginBottom:1,fontFamily:ff}}>{mf.label}</div>
              <div style={{fontSize:settings.metaSize,fontWeight:700,color:rgba(sc.metaFg,sc._fgAlpha),lineHeight:1,fontFamily:ff}}>{mf.value||'—'}</div>
            </div>
          ))}
        </div>
      )}
      {settings.showClass&&fields.classCode&&(
        <div style={{background:rgba(sc.codeBg,sc._bgAlpha),padding:'5px 10px',borderBottom:bd.classBottom?bl():'none',flexShrink:0,display:'flex',alignItems:'baseline',gap:8}}>
          <div style={{fontSize:17,fontWeight:700,color:rgba(sc.codeFg,sc._fgAlpha),letterSpacing:'0.12em',flexShrink:0,fontFamily:ff}}>{fields.classCode}</div>
          <div style={{fontSize:8,color:rgba(sc.sub,sc._fgAlpha),letterSpacing:'0.04em',lineHeight:1.3,flex:1,overflow:'hidden',fontFamily:ff}}>{fields.classDesc||getCodeDesc(fields.classCode)}</div>
        </div>
      )}
      {settings.showDesc&&(
        <div style={{padding:'6px 10px',borderBottom:bd.descBottom?bl():'none',flexShrink:0,...bg}}>
          <div style={{fontSize:7,letterSpacing:'0.22em',textTransform:'uppercase',color:rgba(sc.sub,sc._fgAlpha),marginBottom:3,fontFamily:ff}}>Notes</div>
          <div style={{fontSize:settings.bodySize,fontWeight:settings.bodyBold?700:400,fontStyle:settings.bodyItalic?'italic':'normal',textAlign:settings.bodyAlign||'left',lineHeight:1.45,color:rgba(sc.fg,sc._fgAlpha),overflow:'hidden',maxHeight:Math.round(settings.bodySize*1.45*3),fontFamily:ff}}>{fields.description}</div>
        </div>
      )}
      {settings.showCodes&&(fields.isrc||fields.upc)&&(
        <div style={{padding:'4px 10px',borderBottom:bd.descBottom?bl():'none',flexShrink:0,...bg,display:'flex',gap:16,alignItems:'center'}}>
          {fields.isrc&&<div style={{display:'flex',gap:5,alignItems:'baseline'}}><span style={{fontSize:6,letterSpacing:'0.2em',textTransform:'uppercase',color:rgba(sc.sub,sc._fgAlpha*0.7),fontFamily:ff}}>ISRC</span><span style={{fontSize:8,fontWeight:700,color:rgba(sc.fg,sc._fgAlpha),letterSpacing:'0.12em',fontFamily:ff}}>{fields.isrc}</span></div>}
          {fields.upc&&<div style={{display:'flex',gap:5,alignItems:'baseline'}}><span style={{fontSize:6,letterSpacing:'0.2em',textTransform:'uppercase',color:rgba(sc.sub,sc._fgAlpha*0.7),fontFamily:ff}}>UPC</span><span style={{fontSize:8,fontWeight:700,color:rgba(sc.fg,sc._fgAlpha),letterSpacing:'0.12em',fontFamily:ff}}>{fields.upc}</span></div>}
        </div>
      )}
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0,borderBottom:bd.bottomBorder?bl():'none',...bg}}>
        {settings.showQR&&!settings.qrFloat&&(
          <div style={{width:Math.round(W*0.3),flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,borderRight:bd.qrDivider?bl():'none',padding:'6px 8px'}}>
            <QRBlock url={qrUrl} colors={sc} size={qrSize}/>
            <div style={{fontSize:7,letterSpacing:'0.12em',textTransform:'uppercase',color:rgba(sc.sub,sc._fgAlpha),textAlign:'center',fontFamily:ff}}>{settings.qrCaption||'SCAN'}</div>
          </div>
        )}
        <div style={{flex:1,padding:'8px 9px',display:'flex',flexDirection:'column',gap:5,overflow:'hidden'}}>
          {settings.showTags&&(
            <><div style={{fontSize:7,letterSpacing:'0.22em',textTransform:'uppercase',color:rgba(sc.sub,sc._fgAlpha),fontFamily:ff}}>Tags</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:3}}>{(fields.tags||'').split(',').map(t=>t.trim()).filter(Boolean).map((t,i)=>(
              <div key={i} style={{background:rgba(sc.strip,sc._bgAlpha),color:rgba(sc.accent,sc._fgAlpha),fontSize:settings.tagSize,fontWeight:700,letterSpacing:'0.06em',padding:'2px 5px',border:`1px solid ${rgba(sc.border)}`,textTransform:'uppercase',fontFamily:ff}}>{t}</div>
            ))}</div></>
          )}
          <div style={{marginTop:'auto',fontSize:8,color:rgba(sc.sub,sc._fgAlpha*0.7),wordBreak:'break-all',lineHeight:1.4,fontFamily:ff}}>{fields.url?shortUrl(fields.url):''}</div>
        </div>
      </div>
      {settings.showQR&&settings.qrFloat&&(
        <div style={{position:'absolute',left:settings.qrFloatX,top:settings.qrFloatY,display:'flex',flexDirection:'column',alignItems:'center',gap:3,zIndex:15,pointerEvents:'none'}}>
          <QRBlock url={qrUrl} colors={sc} size={settings.qrFloatSize||84}/>
          {settings.qrCaption&&<div style={{fontSize:7,letterSpacing:'0.12em',textTransform:'uppercase',color:rgba(sc.sub,sc._fgAlpha),textAlign:'center',fontFamily:ff}}>{settings.qrCaption}</div>}
        </div>
      )}
      {settings.showFooter&&(
        <div style={{height:22,background:rgba(sc.strip,sc._bgAlpha),display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 9px',flexShrink:0,borderTop:bd.footerTop?bl():'none'}}>
          <div style={{fontSize:7,letterSpacing:'0.08em',color:rgba(sc.sub,sc._fgAlpha),fontFamily:ff,textTransform:'none'}}>{[fields.artist,fields.catalog].filter(Boolean).join(' · ')}</div>
          <div style={{fontSize:7,letterSpacing:'0.08em',color:rgba(sc.sub,sc._fgAlpha),fontFamily:ff,display:'flex',gap:8}}>
            {settings.codesInFooter&&(fields.isrc||fields.upc)?(
              <>{fields.isrc&&<span><span style={{opacity:0.55,fontSize:6}}>ISRC </span>{fields.isrc}</span>}{fields.upc&&<span><span style={{opacity:0.55,fontSize:6}}>UPC </span>{fields.upc}</span>}</>
            ):(settings.metaFields?.filter(f=>f.show).slice(0,2)||[]).map(f=>f.value).filter(Boolean).join(' · ')}
          </div>
        </div>
      )}
      {settings.showImage&&settings.imageData&&(
        <div style={{position:'absolute',left:settings.imageX,top:settings.imageY,width:settings.imageW,height:settings.imageH,pointerEvents:'none',mixBlendMode:settings.ditherBlend?'multiply':'normal'}}>
          <img src={settings.imageData} style={{width:'100%',height:'100%',objectFit:'contain',display:'block',imageRendering:'pixelated'}} alt=""/>
        </div>
      )}
      {(settings.textBlocks||[]).map(tb=>(
        <div key={tb.id} style={{position:'absolute',left:tb.x,top:tb.y,zIndex:20,fontSize:tb.size||12,fontWeight:tb.bold?700:400,fontStyle:tb.italic?'italic':'normal',textAlign:tb.align||'left',color:rgba(tb.color||sc.fg,tb.opacity??1),fontFamily:FONTS[tb.font||settings.font]?.css||ff,letterSpacing:'0.05em',lineHeight:1.3,width:tb.w||'auto',whiteSpace:tb.wrap?'pre-wrap':'nowrap',textTransform:tb.caps?'uppercase':'none'}}>{tb.text}</div>
      ))}
    </div>
  );
});

