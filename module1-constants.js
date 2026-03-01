// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 1: CONSTANTS & CLASSIFICATION                        ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ VERSION ━━━━━━━━
const VERSION='0.5.7';
// ━━━━━━━━ CLASSIFICATION ━━━━━━━━
const CLS={
  digit1:{name:'Primary Genre / Style',options:{
    '1':'Ambient / Atmospheric','2':'Techno / Industrial','3':'House / Dance','4':'Downtempo / Chillout',
    '5':'Experimental / Glitch','6':'Synthwave / Retro','7':'Drum & Bass / Breakbeat','8':'Trance / Progressive',
    '9':'Minimal / Micro','A':'Noise / Power Electronics','B':'Field Recording / Concrete','C':'Jazz / Fusion',
    'D':'Classical / Orchestral','E':'Folk / Acoustic','F':'Hip-Hop / Rap','G':'Reggae / Dub',
    'H':'Metal / Hardcore','I':'Pop','J':'Drone / Dark Ambient','K':'Post-Rock / Cinematic',
    'L':'EBM / Industrial Dance','M':'Krautrock / Motorik','N':'Musique Concrète','O':'Rave / Hardcore Techno',
    'P':'Psych / Kosmische','Q':'Neo-Classical / Modern','R':'Lo-Fi / Bedroom','S':'Rock',
    'T':'Punk / Post-Punk','U':'Soul / R&B / Funk','V':'Country / Americana','W':'Blues',
    'X':'World / Global','Y':'Electronic / Electronica','Z':'Unclassified / Other',
  }},
  digit2:{name:'Mood / Energy / Affect',options:{
    '0':'Dark / Melancholic','1':'Ethereal / Dreamy','2':'Energetic / Driving','3':'Calm / Meditative',
    '4':'Mysterious / Cinematic','5':'Uplifting / Euphoric','6':'Aggressive / Intense','7':'Nostalgic / Warm',
    '8':'Cold / Clinical','9':'Playful / Quirky','A':'Brooding / Tense','B':'Hypnotic / Trance-like',
    'C':'Melancholic / Bittersweet','D':'Chaotic / Dissonant','E':'Serene / Peaceful','F':'Unsettling / Uncanny',
    'G':'Triumphant / Anthemic','H':'Introspective / Private','I':'Romantic / Sensual','J':'Mechanical / Robotic',
    'K':'Spiritual / Transcendent','L':'Ironic / Detached','M':'Raw / Visceral','N':'Blissful / Elated',
    'O':'Desolate / Isolated','P':'Urgent / Pressurised','Q':'Tense / Anxious','R':'Joyful / Celebratory',
    'S':'Melancholic / Pensive','T':'Confrontational','U':'Defiant / Rebellious','V':'Tender / Vulnerable',
    'W':'Grotesque / Absurd','X':'Clinical / Detached','Y':'Ecstatic / Frenetic','Z':'Neutral / Affectless',
  }},
  digit3:{name:'Tempo / Rhythmic Feel',options:{
    '0':'0–60 BPM (Glacial)','1':'60–80 BPM (Slow)','2':'80–100 BPM (Moderate)','3':'100–120 BPM (Medium)',
    '4':'120–130 BPM (Uptempo)','5':'130–140 BPM (Fast)','6':'140–160 BPM (Very Fast)','7':'160–180 BPM (Rapid)',
    '8':'180+ BPM (Extreme)','9':'Variable / Rubato','A':'No Tempo / Free Time','B':'Half-time Feel',
    'C':'Double-time Feel','D':'Polyrhythmic / Complex','E':'Swing / Shuffle','F':'Broken / Irregular',
    'G':'Pulseless / Drone','H':'Stuttered / Chopped','I':'Waltz / 3-4','J':'Odd Meter (5,7,11)',
    'K':'4/4 Straight','L':'Syncopated','M':'Gallop / Triplet','N':'March / 2-beat',
    'O':'Samba / Baião','P':'Afrobeat / Afro-Cuban','Q':'Breakbeat / Hip-Hop','R':'Jungle / Ragga',
    'S':'Footwork / Juke','T':'IDM / Drill n Bass','U':'Trap / 808','V':'Garage / 2-step',
    'W':'Dubstep / Grime','X':'Industrial / EBM Pulse','Y':'Ambient Pulse / Slow Drift','Z':'No Rhythm / Noise',
  }},
  digit4:{name:'Texture / Density / Arrangement',options:{
    '0':'Sparse / Minimal','1':'Light / Airy','2':'Moderate','3':'Layered','4':'Dense / Full',
    '5':'Heavy / Thick','6':'Rhythmic Focus','7':'Melodic Focus','8':'Textural / Drone','9':'Complex / Chaotic',
    'A':'Single Element','B':'Call & Response','C':'Evolving / Morphing','D':'Repetitive / Locked',
    'E':'Granular / Fragmented','F':'Saturated / Distorted','G':'Acoustic / Natural','H':'Synthetic Only',
    'I':'Mixed / Hybrid','J':'Collage / Found Sound','K':'Micro-tonal','L':'Silent / Near-Silence',
    'M':'Noise / Wall','N':'Harmonic / Tonal','O':'Atonal / Dissonant','P':'Arpeggiated / Sequenced',
    'Q':'Pad-Heavy / Washed','R':'Sample-Based','S':'Vocal-Forward','T':'Bass-Heavy / Sub',
    'U':'Treble / High Frequency','V':'Mid-Range Focus','W':'Binaural / Spatial','X':'Stereo Field Play',
    'Y':'Mono / Centered','Z':'Unstructured / Free',
  }},
};
// ━━━━━━━━ useHistory — generic 50-step undo/redo stack ━━━━━━━━
// push(snapshot)  — record new state; trims redo branch above cursor.
// undo()          — step back, returns the previous snapshot.
// redo()          — step forward, returns the next snapshot.
const HISTORY_MAX=50;
function useHistory(initial){
  const [history,setHistory]=useState([initial]);
  const [cursor,setCursor]=useState(0);
  const cursorRef=useRef(0);
  const historyRef=useRef([initial]);
  useEffect(()=>{cursorRef.current=cursor;},[cursor]);
  useEffect(()=>{historyRef.current=history;},[history]);

  const push=useCallback((snapshot)=>{
    const cur=cursorRef.current;
    const hist=historyRef.current;
    const base=hist.slice(0,cur+1);
    const next=[...base,snapshot];
    const trimmed=next.length>HISTORY_MAX?next.slice(next.length-HISTORY_MAX):next;
    const newCursor=trimmed.length-1;
    historyRef.current=trimmed;
    cursorRef.current=newCursor;
    setHistory(trimmed);
    setCursor(newCursor);
  },[]);

  const undo=useCallback(()=>{
    const cur=cursorRef.current;
    const hist=historyRef.current;
    if(cur<=0)return null;
    const newCursor=cur-1;
    cursorRef.current=newCursor;
    setCursor(newCursor);
    return hist[newCursor];
  },[]);

  const redo=useCallback(()=>{
    const cur=cursorRef.current;
    const hist=historyRef.current;
    if(cur>=hist.length-1)return null;
    const newCursor=cur+1;
    cursorRef.current=newCursor;
    setCursor(newCursor);
    return hist[newCursor];
  },[]);

  // Reactive values for render
  const canUndo=cursor>0;
  const canRedo=cursor<history.length-1;
  const steps=cursor;

  return{push,undo,redo,canUndo,canRedo,steps};
}


