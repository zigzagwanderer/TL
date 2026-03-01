// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 5: AUDIO ANALYSIS                                    ║
// ║  renderLabelToBlob, SpectralGraph, LoudnessGraph             ║
// ║  AnalysisPanel, MetricBadge, WarnRow, OriginEstimateBadge    ║
// ╚══════════════════════════════════════════════════════════════╝
// ━━━━━━━━ BATCH EXPORT HELPER ━━━━━━━━
// Renders one TrackLabel to a PNG Blob using html2canvas.
// Fully self-contained — mounts a hidden DOM node, captures it, then cleans up.
// Returns a Blob on success, throws on failure. Never touches React state.
const renderLabelToBlob=async(fields,labelSettings,scale=2)=>{
  const wrap=document.createElement('div');
  wrap.style.cssText=`position:fixed;left:-99999px;top:0;width:${labelSettings.labelW}px;overflow:visible;pointer-events:none;z-index:-1;`;
  document.body.appendChild(wrap);
  const el=document.createElement('div');
  wrap.appendChild(el);
  try{
    await new Promise(res=>ReactDOM.render(React.createElement(TrackLabel,{fields,settings:labelSettings}),el,res));
    await new Promise(r=>setTimeout(r,80)); // fonts + QR code must settle
    const sc=getColors(labelSettings);
    const canvas=await html2canvas(el.firstChild||el,{
      scale,width:labelSettings.labelW,height:labelSettings.labelH,
      useCORS:true,allowTaint:true,backgroundColor:sc.bg||'#fff',logging:false,
    });
    return await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('toBlob returned null')),'image/png'));
  }finally{
    ReactDOM.unmountComponentAtNode(el);
    document.body.removeChild(wrap);
  }
};

// ━━━━━━━━ APP COMPONENT ━━━━━━━━
// ━━━━━━━━ ANALYSIS PANEL ━━━━━━━━
// ── AI / Digital Artifact Score helpers ──────────────────────────────────────
// Extracts raw numeric % from the stored aiProbability string.
// e.g. "⚠ Elevated (55%)" → 55    "✓ Low (0%)" → 0    "" → null
function parseAiProbability(val){
  if(!val) return null;
  var m=val.match(/\((\d+)%\)/);
  return m?parseInt(m[1],10):null;
}
// Returns the Origin Estimate tier object for a given numeric score.
// Deliberately avoids "AI" as a verdict — frames as signal quality indicator.
function getOriginTier(score){
  if(score===null) return null;
  if(score<20) return{label:'Human / Analogue',sublabel:'No significant digital artifacts detected',color:'#3fb950',borderColor:'rgba(63,185,80,0.35)',bg:'rgba(63,185,80,0.07)',icon:'\u2713'};
  if(score<50) return{label:'Inconclusive',sublabel:'Minor artifacts present \u2014 may be lossy encoding',color:'#7ca8c8',borderColor:'rgba(124,168,200,0.35)',bg:'rgba(124,168,200,0.07)',icon:'\u25c6'};
  if(score<70) return{label:'Digital Artifacts Present',sublabel:'Consistent with lossy codecs, heavy processing or AI tools',color:'#d29922',borderColor:'rgba(210,153,34,0.35)',bg:'rgba(210,153,34,0.07)',icon:'\u25c6'};
  return{label:'High Artifact Score',sublabel:'Multiple artifact signals detected \u2014 see breakdown below',color:'#f97316',borderColor:'rgba(249,115,22,0.35)',bg:'rgba(249,115,22,0.08)',icon:'\u26a0'};
}
// ── Origin Estimate Badge — score bar, tier label, sub-metric breakdown, disclaimer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BAND_TIPS — Mastering Masterclass content keyed by band id
// Defined at module scope — never re-created on render.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var BAND_TIPS = {
  sub: {
    icon: '\u25bc',
    title: 'High-Pass Filtering',
    range: '20\u201360 Hz',
    body: 'Most speakers and headphones cannot reproduce sub frequencies cleanly, so energy here wastes headroom without being heard. Apply a high-pass filter between 20\u201340 Hz on every non-bass instrument to reclaim headroom and tighten the low end.',
    watch: 'Excessive sub energy causes pumping on streaming limiters and translates as flabbiness on small speakers. Check mono compatibility \u2014 sub information is summed to mono in clubs.',
    tool: 'High-pass filter @ 20\u201340 Hz, 12\u201324 dB/oct. On bass instruments, use a gentler slope (6 dB/oct) starting at 30\u201340 Hz to preserve fundamental weight without rumble.'
  },
  bass: {
    icon: '\u25bc',
    title: 'Low-End Control',
    range: '60\u2013200 Hz',
    body: 'The kick drum body, bass guitar fundamentals, and low-pitched vocals all live here. Too much energy creates a boomy, muddy mix; too little sounds thin and weak. Aim for a clear relationship between kick and bass \u2014 one should sit slightly under the other.',
    watch: 'The 80\u2013120 Hz range is where most mixes accumulate clutter. Cut competing instruments here so the kick and bass are not both peaking together. Always check your mix in mono.',
    tool: 'Gentle high-shelf cut on pads and guitars below 120 Hz. Tight notch cut on bass guitar at the exact frequency of kick body. Sidechain compression (kick ducking bass) for clean low-end.'
  },
  lowmid: {
    icon: '\u25b2',
    title: 'Mud Zone \u2014 De-clutter',
    range: '200\u2013500 Hz',
    body: 'This is the most common problem area in dense mixes. Instruments like acoustic guitars, pianos, and vocals all have overtones here, and they stack up fast. Most professional engineers find that cuts in this region are more useful than boosts.',
    watch: '250\u2013350 Hz is the classic "cardboard box" frequency. If your mix sounds boxy, dull, or like it was recorded in a small room, this is the first place to investigate with a narrow notch sweep.',
    tool: 'Narrow parametric cut (Q 2\u20134) swept slowly through 200\u2013400 Hz to find and remove boxiness. Apply broad gentle cuts (-1 to -3 dB) on non-critical instruments to reduce masking.'
  },
  mid: {
    icon: '\u25cf',
    title: 'Vocal Presence & Clarity',
    range: '500 Hz\u20132 kHz',
    body: 'The midrange is the most critical zone for intelligibility. Vocals, snare crack, and the core of most melodic instruments sit here. A well-balanced midrange makes a mix translate on any speaker, including phone speakers and laptop audio.',
    watch: 'Over-cutting the mids to make a mix sound "hi-fi" is one of the most common mastering mistakes. Scooped mids translate poorly on small speakers and sound thin on car stereos.',
    tool: 'Broad mid boost (+1 to +2 dB) centered around 1 kHz brings forward and adds "glue." Narrow cuts at specific resonances rather than broad scoops. Ensure vocals sit above guitars at 800 Hz\u20131.2 kHz.'
  },
  uppermid: {
    icon: '\u26a0',
    title: 'Harshness & Attack',
    range: '2\u20135 kHz',
    body: 'This range controls the attack of transients, the edge of guitars, and the punch of the snare. It is also where listener fatigue originates. A small boost here (+1\u20132 dB) adds presence; too much causes harshness after 20\u201330 minutes of listening.',
    watch: '3\u20134 kHz is the peak sensitivity range of the human ear (Fletcher-Munson). Excessive energy here causes fatigue, described as "harsh," "aggressive," or "tiring." Ear fatigue at this frequency leads to poor mixing decisions late in a session.',
    tool: 'Broad presence boost (+1 dB @ 3 kHz) for cut on a system. Dynamic EQ or multiband compression to tame transient spikes without affecting sustained notes. De-esser targeted at 3.5\u20135 kHz for vocals.'
  },
  presence: {
    icon: '\u26a0',
    title: 'De-essing & Sibilance',
    range: '5\u20138 kHz',
    body: 'Sibilance (the "s," "sh," and "t" sounds in vocals) sits predominantly between 5\u20138 kHz. De-essing is frequency-specific dynamic compression that only triggers on sibilant peaks, leaving the rest of the signal untouched.',
    watch: 'Over-bright digital recordings often accumulate excessive energy at 6\u20137 kHz. This translates as harshness on cheaper earbuds (which boost this range) and is particularly damaging on streams, where lossy codecs can exaggerate sibilance artifacts.',
    tool: 'De-esser targeted at the exact sibilant frequency. Settings: fast attack (0.5\u20132 ms), medium release (50\u2013100 ms), 3\u20136 dB of gain reduction. Apply per vocal track, not on the master bus.'
  },
  brilliance: {
    icon: '\u2728',
    title: 'Brightness & Sheen',
    range: '8\u201312 kHz',
    body: 'This range gives a mix its "sheen" \u2014 the silky quality on cymbals, the breath on acoustic guitars, and the open quality of professional-sounding mixes. A gentle air shelf boost here is often described as "expensive-sounding."',
    watch: 'Low-quality digital recordings and aggressive MP3 encoding degrade this range first. If your mix sounds "closed in" or lacking sparkle after loudness processing, check whether limiting has crushed the transient content here.',
    tool: 'Gentle high-shelf boost (+1 to +2 dB) with a smooth, wide shelf (Neve or API-style). Pultec-style EQ simultaneously boosts and attenuates around the same frequency for presence without harshness.'
  },
  air: {
    icon: '\u2728',
    title: 'Air Band \u2014 Open-ness',
    range: '12\u201320 kHz',
    body: 'The air band gives mixes their sense of space and studio quality. Boosting here adds the "breath" that separates high-quality recordings from project studio work. However, most speakers have limited extension above 16 kHz.',
    watch: 'AI-generated audio and neural compression codecs frequently apply a hard spectral ceiling above 16 kHz. If the Spectral Analysis section below shows a ceiling warning, your source file has been aggressively processed. Boosting a non-existent frequency achieves nothing.',
    tool: 'High-frequency air shelf boost (+1 to +3 dB) above 16 kHz using an analog-modeled EQ (Neve 8078, API 550). Monitor at low volumes to judge the effect. Skip this if the Spectral Analysis shows a neural compression ceiling.'
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FREQ_DESCRIPTORS — Musical descriptors at key frequencies
// Sorted ascending by hz. getLensDescriptor() does a linear scan
// and returns the entry whose range brackets the cursor frequency.
// Defined at module scope — never re-created on render.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var FREQ_DESCRIPTORS = [
  { lo:    20, hi:    40, name: 'Infrasonic',   note: 'felt not heard' },
  { lo:    40, hi:    80, name: 'Sub Bass',      note: 'rumble & weight' },
  { lo:    80, hi:   120, name: 'Bass Body',     note: 'kick & bass guitar' },
  { lo:   120, hi:   200, name: 'Low Warmth',    note: 'fundamental warmth' },
  { lo:   200, hi:   320, name: 'Boominess',     note: 'mud & box resonance' },
  { lo:   320, hi:   500, name: 'Low Mud',       note: 'honk & congestion' },
  { lo:   500, hi:   800, name: 'Warmth',        note: 'body of vocals' },
  { lo:   800, hi:  1200, name: 'Presence',      note: 'vocal intelligibility' },
  { lo:  1200, hi:  2000, name: 'Nasal',         note: 'horn & phone resonance' },
  { lo:  2000, hi:  3200, name: 'Attack',        note: 'transient edge' },
  { lo:  3200, hi:  5000, name: 'Harshness',     note: 'ear fatigue zone' },
  { lo:  5000, hi:  7000, name: 'Sibilance',     note: 's & t consonants' },
  { lo:  7000, hi: 10000, name: 'Definition',    note: 'crispness & cut' },
  { lo: 10000, hi: 14000, name: 'Brilliance',    note: 'sheen & sparkle' },
  { lo: 14000, hi: 20000, name: 'Air',           note: 'openness & breath' },
];

function getLensDescriptor(hz) {
  for (var di = 0; di < FREQ_DESCRIPTORS.length; di++) {
    var fd = FREQ_DESCRIPTORS[di];
    if (hz >= fd.lo && hz < fd.hi) { return fd; }
  }
  return FREQ_DESCRIPTORS[FREQ_DESCRIPTORS.length - 1];
}

// Format Hz for display: < 1000 → "440 HZ", ≥ 1000 → "4.4 KHZ"
function fmtHz(hz) {
  if (hz < 1000) { return Math.round(hz) + ' HZ'; }
  return (hz / 1000).toFixed(1) + ' KHZ';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GHOST_CURVES — Reference spectral shapes for 3 archetypes
// Each entry has 8 normalized values matching the 8 analysis bands:
//   [sub, bass, lowmid, mid, uppermid, presence, brilliance, air]
// Values are 0–100 relative energy, representing an "ideal" shape.
//
// Pink Noise:  natural -3dB/oct rolloff — balanced reference
// Trap / 808:  elevated sub+bass, recessed mids, bright presence
// Acoustic:    minimal sub, strong mids, smooth top
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var GHOST_CURVES = [
  {
    id:   'none',
    label: 'NO REF',
    vals:  null
  },
  // ── Noise references ─────────────────────────────────────────────────────
  // vals are dBFS per band: [sub, bass, lowmid, mid, uppermid, presence, brilliance, air]
  {
    id:    'pink',
    label: 'PINK NOISE',
    color: '#7ca8c8',
    desc:  'Natural -3dB/oct rolloff. The universal balanced mix reference.',
    vals:  [-3, -5, -7, -9, -11, -13, -15, -17]
  },
  {
    id:    'white',
    label: 'WHITE NOISE',
    color: '#aaaacc',
    desc:  'Flat equal energy per Hz. A useful ceiling check — music should always roll off below this.',
    vals:  [-6, -6, -6, -6, -6, -6, -6, -6]
  },
  // ── Genre references ──────────────────────────────────────────────────────
  {
    id:    'trap',
    label: 'TRAP / 808',
    color: '#c45a8a',
    desc:  'Sub-dominant. Elevated bass, recessed low-mids, sharp upper presence for hi-hat cut.',
    vals:  [-2, -1, -10, -12, -9, -5, -10, -16]
  },
  {
    id:    'hiphop',
    label: 'HIP-HOP',
    color: '#c47acc',
    desc:  'Punchy kick and bass fundamentals, scooped low-mids, forward upper-mids for vocal intelligibility.',
    vals:  [-4, -2, -9, -7, -7, -8, -12, -17]
  },
  {
    id:    'edm',
    label: 'EDM / CLUB',
    color: '#5a8aee',
    desc:  'Extended sub for club systems, scooped mids for headroom, bright presence for synth and hi-hat cut.',
    vals:  [-1, -2, -11, -13, -9, -4, -8, -13]
  },
  {
    id:    'rock',
    label: 'ROCK',
    color: '#cc7744',
    desc:  'Balanced low-mid crunch for guitars, strong upper-mids for snare bite, moderate top-end presence.',
    vals:  [-9, -5, -4, -6, -5, -7, -10, -15]
  },
  {
    id:    'acoustic',
    label: 'ACOUSTIC',
    color: '#6aaa74',
    desc:  'Minimal sub, natural bass, full mids for vocal intelligibility, smooth and controlled top end.',
    vals:  [-16, -9, -5, -3, -5, -7, -9, -12]
  },
  {
    id:    'jazz',
    label: 'JAZZ',
    color: '#c4a844',
    desc:  'Warm upright-bass-forward low end, natural midrange body, gentle rolloff above 8kHz.',
    vals:  [-13, -5, -4, -3, -6, -9, -12, -16]
  },
  {
    id:    'classical',
    label: 'CLASSICAL',
    color: '#88aacc',
    desc:  'Full natural dynamic range, extended air for hall reverb, smooth mids. Least processed shape.',
    vals:  [-14, -10, -7, -5, -6, -7, -8, -10]
  },
  {
    id:    'podcast',
    label: 'PODCAST',
    color: '#88cc88',
    desc:  'Bass-cut for headphone listening, hyper-forward mids for intelligibility, minimal air.',
    vals:  [-18, -15, -8, -1, -3, -8, -14, -18]
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SpectralGraph v3 — Interactive Lens + Reference Ghost
//
// NEW in v3:
//   - Scanning lens: vertical line + frequency badge follows cursor
//     throttled via requestAnimationFrame ref (no 60fps re-renders)
//   - Reference ghost curves: 3 genre archetypes drawn as dotted
//     path behind user data for visual comparison
//   - Genre selector UI below header
//
// Preserved from v2:
//   - CRT glow filter, 1.5px crisp stroke, gradient fill
//   - Interactive band nodes + mastering tip panel
//   - useMemo for Catmull-Rom path (user curve)
//   - All Babel safety rules
//
// Babel rules:
//   - ALL hooks unconditionally at top (Black screen rules 1 & 2)
//   - No arrow functions — IIFE closures for loop handlers
//   - useMemo / useRef use function(){} not () => {}
//   - var throughout
//   - T.active does not exist — use T.accent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SpectralGraph(props) {
  var T         = props.T;
  var bands     = props.bands;
  var analyzing = props.analyzing;

  // ── ALL HOOKS FIRST — unconditional, no exceptions ──────────────────────────

  // Active band for mastering tip panel
  var activeBandArr = useState(null);
  var activeBand    = activeBandArr[0];
  var setActiveBand = activeBandArr[1];

  // Lens state: { svgX, hz } or null when cursor is outside chart
  var lensArr    = useState(null);
  var lensState  = lensArr[0];
  var setLens    = lensArr[1];

  // Active ghost curve id
  var ghostArr   = useState('none');
  var activeGhost = ghostArr[0];
  var setGhost   = ghostArr[1];

  // rAF throttle ref — holds pending frame id, prevents queuing multiple frames
  var rafRef = useRef(null);

  // SVG element ref — needed to compute bounding rect for mouse→SVG coordinate mapping
  var svgRef = useRef(null);

  // ── Layout constants ────────────────────────────────────────────────────────
  var W      = 600;
  var H      = 110;
  var PAD_T  = 14;
  var PAD_B  = 6;
  var PAD_L  = 32;   // left gutter reserved for dB Y-axis labels
  var PLOT_W = W - PAD_L;
  var PLOT_H = H - PAD_T - PAD_B;

  // ── Log scale helpers ───────────────────────────────────────────────────────
  var F_MIN  = 20;
  var F_MAX  = 20000;
  var logMin = Math.log10(F_MIN);
  var logMax = Math.log10(F_MAX);

  // fToX maps hz → X in PLOT space (offset by PAD_L)
  var fToX = function(hz) {
    var clamped = Math.max(F_MIN, Math.min(F_MAX, hz));
    return PAD_L + ((Math.log10(clamped) - logMin) / (logMax - logMin)) * PLOT_W;
  };

  var nToY = function(n) {
    return PAD_T + PLOT_H - (n / 100) * PLOT_H;
  };

  // ── ±18 dB display scale — defined here so useMemo blocks can use dbToNorm ──
  // Must match EQ_MIN/EQ_MAX/EQ_SPAN in generateSpectralProfile normalization.
  var EQ_MIN  = -18;
  var EQ_MAX  = +18;
  var EQ_SPAN = EQ_MAX - EQ_MIN;  // 36 dB

  // dbToNorm: dBFS value → 0-100 Y position on the ±18 display scale
  var dbToNorm = function(db) {
    return Math.max(0, Math.min(100, ((db - EQ_MIN) / EQ_SPAN) * 100));
  };

  // Inverse: SVG x coordinate → Hz (for lens readout), accounts for PAD_L
  var xToHz = function(svgX) {
    var plotX = svgX - PAD_L;
    var ratio  = Math.max(0, Math.min(1, plotX / PLOT_W));
    var logHz  = logMin + ratio * (logMax - logMin);
    return Math.pow(10, logHz);
  };

  // ── Static data ─────────────────────────────────────────────────────────────
  var FREQ_TICKS = [
    { hz:    20, label: '20'  },
    { hz:   100, label: '100' },
    { hz:   500, label: '500' },
    { hz:  1000, label: '1K'  },
    { hz:  5000, label: '5K'  },
    { hz: 10000, label: '10K' },
    { hz: 20000, label: '20K' },
  ];

  var DANGER_ZONES = [
    { hz:   315, label: 'MUD',      color: '#c4983a' },
    { hz:  3000, label: 'HARSH',    color: '#c47a3a' },
    { hz:  8000, label: 'PRESENCE', color: '#6688aa' },
  ];

  // ── Derived ─────────────────────────────────────────────────────────────────
  var hasData   = bands && bands.length > 0;
  var activeTip = null;
  if (activeBand && BAND_TIPS[activeBand]) { activeTip = BAND_TIPS[activeBand]; }

  // ── useMemo: user curve paths — MUST be before early return (hook rule) ──────
  // Guards inside handle the empty-bands case so we never crash on null data.
  var pathMemo = useMemo(function() {
    if (!bands || bands.length === 0) { return { pts: [], pathD: '', fillD: '' }; }
    var mPts = [];
    for (var bi = 0; bi < bands.length; bi++) {
      var bnd = bands[bi];
      mPts.push({
        x:     fToX(Math.sqrt(bnd.lo * bnd.hi)),
        y:     nToY(bnd.normalized),
        id:    bnd.id,
        n:     bnd.normalized,
        label: bnd.label
      });
    }
    var mAll = [{ x: fToX(F_MIN), y: mPts[0].y }]
      .concat(mPts)
      .concat([{ x: fToX(F_MAX), y: mPts[mPts.length - 1].y }]);

    var mPathD = 'M ' + mAll[0].x.toFixed(2) + ',' + mAll[0].y.toFixed(2);
    for (var pi = 1; pi < mAll.length; pi++) {
      var mp0  = mAll[pi - 2] || mAll[0];
      var mp1  = mAll[pi - 1];
      var mp2  = mAll[pi];
      var mp3  = mAll[pi + 1] || mAll[mAll.length - 1];
      var cx1  = mp1.x + (mp2.x - mp0.x) / 6;
      var cy1  = mp1.y + (mp2.y - mp0.y) / 6;
      var cx2  = mp2.x - (mp3.x - mp1.x) / 6;
      var cy2  = mp2.y - (mp3.y - mp1.y) / 6;
      mPathD += ' C ' + cx1.toFixed(2) + ',' + cy1.toFixed(2)
             + ' '    + cx2.toFixed(2) + ',' + cy2.toFixed(2)
             + ' '    + mp2.x.toFixed(2) + ',' + mp2.y.toFixed(2);
    }

    var mBaseY = nToY(0);
    var mFillD = mPathD
      + ' L ' + fToX(F_MAX).toFixed(2) + ',' + mBaseY.toFixed(2)
      + ' L ' + fToX(F_MIN).toFixed(2) + ',' + mBaseY.toFixed(2)
      + ' Z';

    return { pts: mPts, pathD: mPathD, fillD: mFillD };
  }, [bands]);

  // ── useMemo: ghost reference curve path — MUST be before early return ────────
  var ghostPathD = useMemo(function() {
    if (!bands || bands.length === 0) { return ''; }
    if (activeGhost === 'none') { return ''; }

    var gc = null;
    for (var gi = 0; gi < GHOST_CURVES.length; gi++) {
      if (GHOST_CURVES[gi].id === activeGhost) { gc = GHOST_CURVES[gi]; break; }
    }
    if (!gc || !gc.vals || gc.vals.length !== bands.length) { return ''; }

    var gPts = [];
    for (var gbi = 0; gbi < bands.length; gbi++) {
      gPts.push({
        x: fToX(Math.sqrt(bands[gbi].lo * bands[gbi].hi)),
        y: nToY(dbToNorm(gc.vals[gbi]))
      });
    }

    var gAll = [{ x: fToX(F_MIN), y: gPts[0].y }]
      .concat(gPts)
      .concat([{ x: fToX(F_MAX), y: gPts[gPts.length - 1].y }]);

    var gD = 'M ' + gAll[0].x.toFixed(2) + ',' + gAll[0].y.toFixed(2);
    for (var gpi = 1; gpi < gAll.length; gpi++) {
      var gp0  = gAll[gpi - 2] || gAll[0];
      var gp1  = gAll[gpi - 1];
      var gp2  = gAll[gpi];
      var gp3  = gAll[gpi + 1] || gAll[gAll.length - 1];
      var gcx1 = gp1.x + (gp2.x - gp0.x) / 6;
      var gcy1 = gp1.y + (gp2.y - gp0.y) / 6;
      var gcx2 = gp2.x - (gp3.x - gp1.x) / 6;
      var gcy2 = gp2.y - (gp3.y - gp1.y) / 6;
      gD += ' C ' + gcx1.toFixed(2) + ',' + gcy1.toFixed(2)
         + ' '    + gcx2.toFixed(2) + ',' + gcy2.toFixed(2)
         + ' '    + gp2.x.toFixed(2) + ',' + gp2.y.toFixed(2);
    }
    return gD;
  }, [activeGhost, bands]);

  // ── Early return AFTER all hooks ────────────────────────────────────────────
  // Extract pathMemo results here — after all hooks, before early return guard
  var pts   = pathMemo.pts;
  var pathD = pathMemo.pathD;
  var fillD = pathMemo.fillD;

  if (!hasData) {
    var emptyMsg = analyzing ? 'ANALYZING\u2026' : 'LOAD A TRACK TO GENERATE SPECTRAL PROFILE';
    return (
      <div style={{ padding: '16px 14px', background: T.card, border: '1px solid ' + T.border, borderRadius: T.r || 0 }}>
        <div style={{ fontSize: 7, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.muted, marginBottom: 6, fontFamily: "'Share Tech Mono', monospace" }}>EQ PROFILE</div>
        <div style={{ fontSize: 9, color: T.muted, fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{emptyMsg}</div>
      </div>
    );
  }



  // Resolve active ghost object for color + desc
  var activeGhostObj = null;
  for (var goi = 0; goi < GHOST_CURVES.length; goi++) {
    if (GHOST_CURVES[goi].id === activeGhost) { activeGhostObj = GHOST_CURVES[goi]; break; }
  }

  // ── Mouse lens handler — rAF throttled ─────────────────────────────────────
  // onMouseMove fires at display rate (potentially 240Hz on fast screens).
  // We gate state updates to one per animation frame via rafRef.
  // The handler reads clientX/Y and the SVG bounding rect to map
  // pixel coordinates into SVG viewBox space, then converts to Hz.
  // No arrow functions — regular function expression stored in var.
  var handleMouseMove = function(e) {
    // If a frame is already pending, skip this event entirely
    if (rafRef.current !== null) { return; }

    // Capture the raw coordinate before the async rAF callback fires
    var clientX = e.clientX;

    rafRef.current = requestAnimationFrame(function() {
      rafRef.current = null; // allow next frame

      if (!svgRef.current) { return; }
      var rect   = svgRef.current.getBoundingClientRect();
      var relX   = clientX - rect.left;           // pixels from SVG left edge
      var svgX   = (relX / rect.width) * W;       // scale to full viewBox width
      var svgXc  = Math.max(PAD_L, Math.min(W, svgX)); // clamp to plot area only
      var hz     = xToHz(svgXc);

      setLens({ svgX: svgXc, hz: hz });
    });
  };

  var handleMouseLeave = function() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLens(null);
  };

  // ── Pre-build SVG elements ──────────────────────────────────────────────────

  // ── dB Y-axis — ±18 dB window, 0 dBFS at vertical centre ───────────────────
  // EQ_MIN, EQ_MAX, EQ_SPAN, dbToNorm are defined above near nToY so they are
  // available to useMemo blocks. Axis ticks use the same dbToNorm here.

  // Fixed ticks every 6 dB — professional EQ standard spacing
  var DB_ABS_TICKS = [18, 12, 6, 0, -6, -12, -18];

  var dbAxisEls = [];
  for (var dai = 0; dai < DB_ABS_TICKS.length; dai++) {
    var tickDb  = DB_ABS_TICKS[dai];
    var tickN   = dbToNorm(tickDb);
    var tickY   = nToY(tickN).toFixed(2);
    var isZero  = tickDb === 0;
    var tickLbl = tickDb > 0 ? ('+' + tickDb) : (tickDb === 0 ? '0' : String(tickDb));
    dbAxisEls.push(
      <g key={'db' + dai}>
        <line x1={PAD_L - 4} y1={tickY} x2={W} y2={tickY}
          stroke={isZero ? T.accent : T.border}
          strokeWidth={isZero ? '0.7' : '0.4'}
          strokeDasharray={isZero ? '' : '2,6'}
          opacity={isZero ? '0.6' : '0.22'} />
        <text x={PAD_L - 5} y={tickY}
          textAnchor='end' dominantBaseline='middle'
          fontSize='6' fill={isZero ? T.accent : T.muted}
          fontFamily="'Share Tech Mono', monospace"
          letterSpacing='0.04em' opacity={isZero ? '1' : '0.75'}>
          {tickLbl}
        </text>
      </g>
    );
  }

  // dBFS unit label — rotated vertical text in left gutter
  var dbUnitEl = (
    <text
      x='7' y={(PAD_T + PLOT_H / 2).toFixed(2)}
      textAnchor='middle' fontSize='5.5'
      fill={T.muted} fontFamily="'Share Tech Mono', monospace"
      letterSpacing='0.08em' opacity='0.7'
      transform={'rotate(-90, 7, ' + (PAD_T + PLOT_H / 2).toFixed(2) + ')'}>
      DBFS
    </text>
  );

  // Danger zone verticals
  var dzEls = [];
  for (var dzi = 0; dzi < DANGER_ZONES.length; dzi++) {
    var dz  = DANGER_ZONES[dzi];
    var dzX = fToX(dz.hz).toFixed(2);
    dzEls.push(
      <g key={dz.label}>
        <line x1={dzX} y1={PAD_T} x2={dzX} y2={H - PAD_B}
          stroke={dz.color} strokeWidth='0.7' strokeDasharray='2,4' opacity='0.4' />
        <text x={dzX} y={PAD_T - 3} textAnchor='middle'
          fontSize='5' fill={dz.color} opacity='0.7'
          fontFamily="'Share Tech Mono', monospace" letterSpacing='0.05em'>
          {dz.label}
        </text>
      </g>
    );
  }

  // Frequency tick labels
  var tickEls = [];
  for (var ti = 0; ti < FREQ_TICKS.length; ti++) {
    var tk  = FREQ_TICKS[ti];
    var tkX = fToX(tk.hz).toFixed(2);
    tickEls.push(
      <text key={tk.label} x={tkX} y='9' textAnchor='middle'
        fontSize='6' fill={T.sub} fontFamily="'Share Tech Mono', monospace" letterSpacing='0.05em'>
        {tk.label}
      </text>
    );
  }

  // Interactive nodes + band hit areas
  var nodeEls = [];
  var hitEls  = [];
  var bandLblEls = [];

  for (var li = 0; li < pts.length; li++) {
    var bp     = pts[li];
    var bpId   = bp.id;
    var isAct  = activeBand === bpId;
    var bpColor = isAct ? T.accent : T.muted;
    var bpFW    = isAct ? '700' : '400';
    var bpFS    = isAct ? '7.5' : '6.5';

    var nFill   = isAct ? T.accent : 'transparent';
    var nRadius = isAct ? 5 : 3;
    var nSW     = isAct ? 1.5 : 1;
    var nOp     = bp.n > 5 ? 1 : 0.35;

    var clickHandler = (function(id) {
      return function() { setActiveBand(function(prev) { return prev === id ? null : id; }); };
    }(bpId));

    var hx1 = fToX(bands[li].lo).toFixed(2);
    var hw  = (fToX(bands[li].hi) - fToX(bands[li].lo)).toFixed(2);

    nodeEls.push(
      <circle key={bpId}
        cx={bp.x.toFixed(2)} cy={bp.y.toFixed(2)} r={nRadius}
        fill={nFill} stroke={T.accent} strokeWidth={nSW} opacity={nOp}
        style={{ cursor: 'pointer', transition: 'r 0.2s, fill 0.2s' }}
        onClick={clickHandler} />
    );

    hitEls.push(
      <rect key={bpId} x={hx1} y='0' width={hw} height={H}
        fill='transparent' style={{ cursor: 'pointer' }} onClick={clickHandler} />
    );

    bandLblEls.push(
      <text key={bpId} x={bp.x.toFixed(2)} y='9'
        textAnchor='middle' fontSize={bpFS} fill={bpColor} fontWeight={bpFW}
        fontFamily="'Share Tech Mono', monospace" letterSpacing='0.06em'
        style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
        onClick={clickHandler}>
        {bp.label.toUpperCase()}
      </text>
    );
  }

  // ── Lens readout values — pre-computed, no logic inside JSX ────────────────
  var lensX         = lensState ? lensState.svgX : -1;
  var lensHz        = lensState ? lensState.hz   : 0;
  var lensDesc      = lensState ? getLensDescriptor(lensHz) : null;
  var lensHzStr     = lensState ? fmtHz(lensHz)            : '';
  var lensNameStr   = lensDesc  ? lensDesc.name.toUpperCase() : '';
  var lensNoteStr   = lensDesc  ? lensDesc.note             : '';
  // Badge X clamped so label doesn't clip chart edges
  var lensBadgeX    = Math.max(70, Math.min(W - 70, lensX));
  // Badge goes above chart top if near ceiling, else floats at a fixed Y
  var lensBadgeY    = PAD_T + 4;

  // ── Active node badge position (for click tip overlay inside SVG) ──────────
  var badgeX = W / 2;
  var badgeY = PAD_T + 8;
  if (activeBand && activeTip) {
    for (var ani = 0; ani < pts.length; ani++) {
      if (pts[ani].id === activeBand) {
        badgeX = Math.max(60, Math.min(W - 60, pts[ani].x));
        badgeY = Math.max(PAD_T + 8, pts[ani].y - 16);
        break;
      }
    }
  }

  // ── Genre selector button data — pre-computed ───────────────────────────────
  var ghostBtnEls = [];
  for (var gbi2 = 0; gbi2 < GHOST_CURVES.length; gbi2++) {
    var gc2    = GHOST_CURVES[gbi2];
    var gcId   = gc2.id;
    var gcAct  = activeGhost === gcId;
    // Pre-compute all style values — no ternary in computed keys
    var gcBg     = gcAct ? (gc2.color || T.accent) : 'transparent';
    var gcColor  = gcAct ? T.bg : (gc2.color || T.muted);
    var gcBorder = gcAct ? (gc2.color || T.accent) : T.border;
    var gcHandler = (function(id) {
      return function() { setGhost(function(prev) { return prev === id ? 'none' : id; }); };
    }(gcId));
    ghostBtnEls.push(
      <button key={gcId} onClick={gcHandler} style={{
        background: gcBg, color: gcColor, border: '1px solid ' + gcBorder,
        fontFamily: "'Share Tech Mono', monospace", fontSize: 7,
        letterSpacing: '0.1em', padding: '3px 8px', cursor: 'pointer',
        borderRadius: T.r || 0, transition: 'all 0.15s'
      }}>
        {gc2.label}
      </button>
    );
  }

  // ── Stable SVG filter/gradient ids ─────────────────────────────────────────
  var filterId = 'spCrtGlow';
  var gradId   = 'spFillGrad';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.card, border: '1px solid ' + T.border, borderRadius: T.r || 0, overflow: 'hidden' }}>

      {/* ── Header + Ghost Selector ── */}
      <div style={{ borderBottom: '1px solid ' + T.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px 5px' }}>
          <span style={{ fontSize: 7, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.muted, fontFamily: "'Share Tech Mono', monospace" }}>EQ PROFILE</span>
          <span style={{ fontSize: 6.5, color: T.sub, fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>
            {activeBand ? '[ CLICK NODE AGAIN TO DISMISS ]' : '[ HOVER TO SCAN \u00b7 CLICK NODE FOR TIPS ]'}
          </span>
        </div>
        {/* Ghost curve selector row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px', padding: '0 12px 6px' }}>
          <span style={{ fontSize: 6.5, color: T.muted, fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.1em', marginRight: 2 }}>REF GHOST:</span>
          {ghostBtnEls}
          {activeGhostObj && activeGhostObj.desc && (
            <span style={{ fontSize: 6.5, color: T.sub, fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.04em', marginLeft: 4, flexBasis: '100%', paddingTop: 2 }}>{activeGhostObj.desc}</span>
          )}
        </div>
      </div>

      {/* ── SVG Chart ── */}
      <div style={{ padding: '6px 12px 0', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={'0 0 ' + W + ' ' + H}
          width='100%' height='auto'
          style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <filter id={filterId} x='-20%' y='-60%' width='140%' height='220%'>
              <feGaussianBlur in='SourceGraphic' stdDeviation='2.5' result='blur' />
              <feComposite in='SourceGraphic' in2='blur' operator='over' />
            </filter>
            <linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%'   stopColor={T.accent} stopOpacity='0.20' />
              <stop offset='100%' stopColor={T.accent} stopOpacity='0'    />
            </linearGradient>
          </defs>

          {/* dB Y-axis — labels in left gutter, vertical unit label */}
          {dbUnitEl}
          {dbAxisEls}
          {/* Axis spine — vertical line separating gutter from plot */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B}
            stroke={T.border} strokeWidth='0.5' opacity='0.5' />

          {/* Horizontal grid lines are now drawn by dbAxisEls (full-width dB ticks) */}

          {/* Vertical frequency grid — 20 / 100 / 1k / 10k, 0.1 opacity */}
          <line x1={fToX(20).toFixed(2)}    y1={PAD_T} x2={fToX(20).toFixed(2)}    y2={H - PAD_B} stroke={T.border} strokeWidth='0.6' opacity='0.1' />
          <line x1={fToX(100).toFixed(2)}   y1={PAD_T} x2={fToX(100).toFixed(2)}   y2={H - PAD_B} stroke={T.border} strokeWidth='0.6' opacity='0.1' />
          <line x1={fToX(1000).toFixed(2)}  y1={PAD_T} x2={fToX(1000).toFixed(2)}  y2={H - PAD_B} stroke={T.border} strokeWidth='0.6' opacity='0.1' />
          <line x1={fToX(10000).toFixed(2)} y1={PAD_T} x2={fToX(10000).toFixed(2)} y2={H - PAD_B} stroke={T.border} strokeWidth='0.6' opacity='0.1' />

          {/* Danger zone markers */}
          {dzEls}

          {/* ── Ghost reference curve — behind user data ── */}
          {ghostPathD && activeGhostObj && (
            <path d={ghostPathD} fill='none'
              stroke={activeGhostObj.color} strokeWidth='1' strokeLinejoin='round'
              strokeDasharray='4,4' opacity='0.45'
              style={{ pointerEvents: 'none', transition: 'd 0.35s ease-out' }} />
          )}

          {/* Band hit areas */}
          {hitEls}

          {/* Gradient fill under user curve */}
          <path d={fillD} fill={'url(#' + gradId + ')'}
            style={{ pointerEvents: 'none', transition: 'd 0.35s ease-out' }} />

          {/* CRT glow layer */}
          <path d={pathD} fill='none'
            stroke={T.accent} strokeWidth='3' strokeLinejoin='round' strokeLinecap='round'
            opacity='0.35' filter={'url(#' + filterId + ')'}
            style={{ pointerEvents: 'none', transition: 'd 0.35s ease-out' }} />

          {/* Primary crisp stroke */}
          <path d={pathD} fill='none'
            stroke={T.accent} strokeWidth='1.5' strokeLinejoin='round' strokeLinecap='round'
            style={{ pointerEvents: 'none', transition: 'd 0.35s ease-out' }} />

          {/* Interactive band nodes */}
          {nodeEls}

          {/* Active node badge — width computed from text length, not hardcoded */}
          {activeBand && activeTip && (
            <g style={{ pointerEvents: 'none' }}>
              {function() {
                var badgeText = activeTip.title.toUpperCase() + '  \u00b7  ' + activeTip.range;
                // Estimate SVG text width: ~5.4px per char at fontSize 6.5 with letterSpacing 0.06em
                var estW   = Math.ceil(badgeText.length * 5.6 + 20);
                var halfW  = Math.floor(estW / 2);
                var bx     = Math.max(halfW + 2, Math.min(W - halfW - 2, badgeX));
                return (
                  <g>
                    <rect
                      x={(bx - halfW).toFixed(2)} y={(badgeY - 10).toFixed(2)}
                      width={estW} height='13' rx='2' ry='2'
                      fill={T.panel} stroke={T.accent} strokeWidth='0.6' opacity='0.95' />
                    <text x={bx.toFixed(2)} y={(badgeY + 0.5).toFixed(2)}
                      textAnchor='middle' fontSize='6.5'
                      fill={T.accent} fontFamily="'Share Tech Mono', monospace" letterSpacing='0.06em'>
                      {badgeText}
                    </text>
                  </g>
                );
              }()}
            </g>
          )}

          {/* ── Scanning Lens — rendered last so it's always on top ── */}
          {lensState && (
            <g style={{ pointerEvents: 'none' }}>

              {/* Vertical scanning line */}
              <line
                x1={lensX.toFixed(2)} y1='0'
                x2={lensX.toFixed(2)} y2={H}
                stroke='#ffffff' strokeWidth='0.6' opacity='0.25'
              />

              {/* Lens label badge — B612 Mono, high contrast */}
              <rect
                x={(lensBadgeX - 62).toFixed(2)} y={(lensBadgeY - 1).toFixed(2)}
                width='124' height='22' rx='2' ry='2'
                fill={T.bg} stroke='#ffffff' strokeWidth='0.5' opacity='0.88'
              />
              {/* Hz readout — primary, larger */}
              <text
                x={lensBadgeX.toFixed(2)} y={(lensBadgeY + 8).toFixed(2)}
                textAnchor='middle' fontSize='8' fontWeight='700'
                fill='#ffffff' fontFamily="'B612 Mono', monospace" letterSpacing='0.06em'>
                {lensHzStr}
              </text>
              {/* Descriptor name */}
              <text
                x={lensBadgeX.toFixed(2)} y={(lensBadgeY + 17).toFixed(2)}
                textAnchor='middle' fontSize='5.5'
                fill='#aaaaaa' fontFamily="'B612 Mono', monospace" letterSpacing='0.08em'>
                {lensNameStr + '  \u00b7  ' + lensNoteStr}
              </text>

            </g>
          )}

        </svg>
      </div>

      {/* ── Frequency tick row ── */}
      <div style={{ padding: '0 12px' }}>
        <svg viewBox={'0 0 ' + W + ' 12'} width='100%' height='12' style={{ display: 'block' }}>
          {tickEls}
        </svg>
      </div>

      {/* ── Band name labels row ── */}
      <div style={{ padding: '0 12px 8px' }}>
        <svg viewBox={'0 0 ' + W + ' 12'} width='100%' height='12' style={{ display: 'block', cursor: 'pointer' }}>
          {bandLblEls}
        </svg>
      </div>

      {/* ── Mastering Tip Panel ── */}
      {activeTip && (
        <div style={{ borderTop: '1px solid ' + T.accent, background: T.panel }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px 6px', borderBottom: '1px solid ' + T.border }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 9, color: T.accent, fontFamily: "'Share Tech Mono', monospace" }}>{activeTip.icon}</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.accent, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Share Tech Mono', monospace" }}>{activeTip.title}</div>
                <div style={{ fontSize: 6.5, color: T.muted, letterSpacing: '0.1em', fontFamily: "'Share Tech Mono', monospace", marginTop: 1 }}>{activeTip.range}</div>
              </div>
            </div>
            <button onClick={function() { setActiveBand(null); }}
              style={{ background: 'none', border: '1px solid ' + T.border, color: T.muted, cursor: 'pointer', fontSize: 9, padding: '2px 7px', borderRadius: T.r || 0, fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>
              ESC
            </button>
          </div>
          <div style={{ padding: '10px 14px', fontSize: 10, color: T.text, lineHeight: 1.75 }}>{activeTip.body}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderTop: '1px solid ' + T.border }}>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{ minWidth: 72, flexShrink: 0, padding: '8px 10px 8px 12px', borderRight: '1px solid ' + T.border, borderBottom: '1px solid ' + T.border, display: 'flex', alignItems: 'flex-start', paddingTop: 9 }}>
                <div style={{ fontSize: 6.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#d29922', fontFamily: "'Share Tech Mono', monospace", whiteSpace: 'nowrap' }}>WATCH FOR</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: '8px 12px', fontSize: 10, color: T.text, lineHeight: 1.65, borderBottom: '1px solid ' + T.border, wordBreak: 'break-word' }}>{activeTip.watch}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{ minWidth: 72, flexShrink: 0, padding: '8px 10px 8px 12px', borderRight: '1px solid ' + T.border, display: 'flex', alignItems: 'flex-start', paddingTop: 9 }}>
                <div style={{ fontSize: 6.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.accent, fontFamily: "'Share Tech Mono', monospace", whiteSpace: 'nowrap' }}>TECHNIQUE</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: '8px 12px', fontSize: 10, color: T.text, lineHeight: 1.65, wordBreak: 'break-word' }}>{activeTip.tool}</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function OriginEstimateBadge(props){
  var T=props.T;
  var meta=props.meta;
  var analyzing=props.analyzing;

  var score=parseAiProbability(meta.aiProbability);
  var tier=getOriginTier(score);
  var hasScore=score!==null&&!analyzing;

  if(!hasScore){
    return(
      <div style={{marginBottom:16,padding:'12px 14px',background:T.card,border:'1px solid '+T.border,borderRadius:T.r||0}}>
        <div style={{fontSize:8,letterSpacing:'0.15em',textTransform:'uppercase',color:T.muted,marginBottom:6}}>Digital Artifact Score</div>
        <div style={{fontSize:11,color:T.muted,fontStyle:'italic'}}>{analyzing?'Analyzing\u2026':'Upload an audio file to run the artifact scan'}</div>
      </div>
    );
  }

  var barWidth=Math.min(99,Math.max(0,score))+'%';
  var hasAiArtifact=!!(meta.aiArtifact);
  var hasStereo=!!(meta.stereoCorrelation);
  var artifactIsWarn=hasAiArtifact&&meta.aiArtifact.charAt(0)==='\u26a0';
  var artifactIsOk=hasAiArtifact&&meta.aiArtifact.charAt(0)==='\u2713';
  var stereoIsStatic=hasStereo&&meta.stereoCorrelation.indexOf('Static')!==-1;
  var stereoIsBlurred=hasStereo&&meta.stereoCorrelation.indexOf('Blurred')!==-1;
  var stereoIsNatural=hasStereo&&meta.stereoCorrelation.indexOf('Natural')!==-1;
  var stereoColor=stereoIsStatic?'#f85149':(stereoIsBlurred?'#d29922':(stereoIsNatural?'#3fb950':T.muted));
  var artifactColor=artifactIsWarn?'#f97316':(artifactIsOk?'#3fb950':T.muted);

  return(
    <div style={{marginBottom:16,border:'1px solid '+tier.borderColor,borderRadius:T.r||0,overflow:'hidden',background:tier.bg}}>
      <div style={{padding:'10px 14px 8px',borderBottom:'1px solid '+tier.borderColor}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <span style={{fontSize:14,color:tier.color,lineHeight:1}}>{tier.icon}</span>
            <span style={{fontSize:11,fontWeight:700,color:tier.color,letterSpacing:'0.04em',textTransform:'uppercase'}}>{tier.label}</span>
          </div>
          <span style={{fontSize:16,fontWeight:700,color:tier.color,fontFamily:'monospace',letterSpacing:'0.06em'}}>{score}%</span>
        </div>
        <div style={{fontSize:9,color:T.muted,letterSpacing:'0.02em',paddingLeft:21}}>{tier.sublabel}</div>
      </div>
      <div style={{padding:'10px 14px 8px'}}>
        <div style={{fontSize:7,letterSpacing:'0.12em',color:T.muted,textTransform:'uppercase',marginBottom:5}}>Digital Artifact Score</div>
        <div style={{position:'relative',height:6,background:T.bg,borderRadius:3,overflow:'hidden',marginBottom:4}}>
          <div style={{position:'absolute',left:0,top:0,height:'100%',width:barWidth,background:tier.color,borderRadius:3}}/>
          <div style={{position:'absolute',top:0,left:'20%',width:1,height:'100%',background:T.border,opacity:0.7}}/>
          <div style={{position:'absolute',top:0,left:'50%',width:1,height:'100%',background:T.border,opacity:0.7}}/>
          <div style={{position:'absolute',top:0,left:'70%',width:1,height:'100%',background:T.border,opacity:0.7}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
          <span style={{fontSize:7,color:T.muted,fontFamily:'monospace'}}>0 Clean</span>
          <span style={{fontSize:7,color:T.muted,fontFamily:'monospace'}}>20 Low</span>
          <span style={{fontSize:7,color:T.muted,fontFamily:'monospace'}}>50 Moderate</span>
          <span style={{fontSize:7,color:T.muted,fontFamily:'monospace'}}>70 Elevated</span>
          <span style={{fontSize:7,color:T.muted,fontFamily:'monospace'}}>99</span>
        </div>
        {(hasAiArtifact||hasStereo)&&(
          <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>
            {hasAiArtifact&&(
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:T.bg,borderRadius:T.r||0,border:'1px solid '+T.border}}>
                <span style={{fontSize:8,color:T.muted,letterSpacing:'0.08em',textTransform:'uppercase'}}>Neural / Spectral</span>
                <span style={{fontSize:9,fontFamily:'monospace',color:artifactColor}}>{meta.aiArtifact}</span>
              </div>
            )}
            {hasStereo&&(
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:T.bg,borderRadius:T.r||0,border:'1px solid '+T.border}}>
                <span style={{fontSize:8,color:T.muted,letterSpacing:'0.08em',textTransform:'uppercase'}}>Stereo Field</span>
                <span style={{fontSize:9,fontFamily:'monospace',color:stereoColor}}>{meta.stereoCorrelation}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{padding:'8px 14px 10px',borderTop:'1px solid '+tier.borderColor,background:'rgba(0,0,0,0.15)'}}>
        <div style={{fontSize:8,color:T.muted,lineHeight:1.7,letterSpacing:'0.01em'}}>
          <span style={{color:T.text,fontWeight:600}}>Note: </span>
          This is a <span style={{color:T.text}}>Digital Artifact Score</span>, not an AI detector. Low-quality MP3s (128kbps and below), heavily noise-reduced recordings, vinyl transfers, and files processed through lossy codecs produce <span style={{fontStyle:'italic'}}>identical signals</span> to AI-generated audio. A high score flags anomalies \u2014 it does not identify origin. Always verify with context before drawing conclusions.
        </div>
      </div>
    </div>
  );
}
function getMetricColor(key,val){
  var n=parseFloat(val);
  if(key==='lufs') return n>=-14?'#3fb950':n>=-18?'#d29922':'#f85149';
  if(key==='samplePeak') return n>=-1?'#f85149':n>=-3?'#d29922':'#3fb950';
  if(key==='crestFactor') return n<6?'#f85149':n<8?'#d29922':'#3fb950';
  if(key==='dcOffset') return n>=0.5?'#f85149':n>=0.1?'#d29922':'#3fb950';
  return '#7ca8c8';
}
function getMetricStatus(key,val){
  var n=parseFloat(val);
  if(key==='lufs') return n>=-14?'streaming-loud':n>=-18?'broadcast range':'quiet master';
  if(key==='lra') return n<4?'compressed':n<8?'moderate':n<15?'dynamic':'very dynamic';
  if(key==='samplePeak') return n>=-1?'at ceiling':n>=-3?'hot':n>=-6?'normal':'conservative';
  if(key==='crestFactor') return n<6?'over-compressed':n<8?'limited':n<14?'natural':'uncompressed';
  if(key==='dcOffset') return n>=0.5?'filter required':n>=0.1?'low DC present':'clean';
  return '';
}
function getMetricWarn(key,val){
  var n=parseFloat(val);
  if(key==='lufs'){
    if(n>-6) return {level:'red',msg:'Extremely loud — will be turned down heavily on all platforms'};
    if(n>-14) return {level:'amber',msg:'Above streaming targets — platforms will apply gain reduction'};
    if(n<-23) return {level:'amber',msg:'Very quiet — may feel low on streaming platforms'};
  }
  if(key==='lra'){
    if(n<3) return {level:'amber',msg:'Very compressed — dynamics are heavily limited'};
    if(n>20) return {level:'amber',msg:'Highly dynamic — check loudness consistency'};
  }
  if(key==='samplePeak'){
    if(n>0) return {level:'red',msg:'Clipping — samples exceed 0 dBFS'};
    if(n>=-1) return {level:'red',msg:'At 0 dBFS ceiling — encode overshoot will cause clipping'};
    if(n>=-3) return {level:'amber',msg:'Very hot — leave 1-2 dB headroom for encode safety'};
  }
  if(key==='crestFactor'){
    if(n<4) return {level:'red',msg:'Severely over-compressed — transients are completely crushed'};
    if(n<6) return {level:'amber',msg:'Heavy limiting detected — little dynamic headroom remains'};
  }
  if(key==='dcOffset'){
    if(n>=0.5) return {level:'red',msg:'High DC offset — apply DC filter in your DAW before mastering'};
    if(n>=0.1) return {level:'amber',msg:'Measurable DC offset — worth filtering if heading to vinyl'};
  }
  return null;
}
var AM_KEYS=[
  {key:'lufs',      label:'INTEGRATED LUFS',  desc:'K-weighted integrated loudness (EBU R128 / ITU-R BS.1770-4). Two-pass gated — silence excluded.',  targets:'Spotify -14 / Apple -16 / YouTube -14 / Tidal -14'},
  {key:'lra',       label:'LOUDNESS RANGE',   desc:'Dynamic spread loud-to-quiet in Loudness Units (EBU Tech 3342). Higher = more dynamic.',             targets:'Typical 6-15 LU / Heavy limiting below 4 LU / Classical above 15 LU'},
  {key:'samplePeak',label:'SAMPLE PEAK',      desc:'Highest absolute sample value. Above -1 dBFS risks clipping after MP3/AAC encode overshoot.',        targets:'Safe headroom -2 dBFS / True peak limit -1 dBTP'},
  {key:'crestFactor',label:'CREST FACTOR',    desc:'Peak-to-RMS ratio. Low values mean heavily compressed transients.',                                   targets:'Limited below 6 dB / Mastered 8-14 dB / Acoustic above 18 dB'},
  {key:'dcOffset',  label:'DC OFFSET',        desc:'Mean signal displacement. Causes clicks at edit points and wastes headroom.',                        targets:'Transparent below 0.1% / Acceptable below 0.5% / Problematic at or above 0.5%'},
];
// ── Badge card sub-component — hover tooltip included ────────────────────────
function MetricBadge(props){
  var T=props.T;
  var key=props.metricKey;
  var label=props.label;
  var val=props.val;
  var desc=props.desc;
  var targets=props.targets;
  var analyzing=props.analyzing;
  var w=getMetricWarn(key,val);
  var col=getMetricColor(key,val);
  var borderCol='';
  var bg='';
  if(w){
    borderCol=(w.level==='red')?'#f85149':'#d29922';
    bg=(w.level==='red')?'rgba(248,81,73,0.06)':'rgba(210,153,34,0.06)';
  } else if(val){
    borderCol='#3fb950';
    bg=T.card;
  } else {
    borderCol=T.border;
    bg=T.card;
  }
  var pipColor=(w&&w.level==='red')?'#f85149':'#d29922';
  var statusText=getMetricStatus(key,val);
  return(
    <div className="tl-metric-wrap">
      {/* Hover tooltip — pure CSS opacity transition, no JS needed */}
      <div className="tl-metric-tooltip">
        <div style={{fontSize:10,fontWeight:700,color:'#cccccc',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6,fontFamily:"'Barlow Condensed',sans-serif"}}>{label}</div>
        {val&&<div style={{fontSize:13,fontWeight:700,color:col,fontFamily:'monospace',marginBottom:6}}>{val}</div>}
        <div style={{fontSize:11,color:'#aaaaaa',lineHeight:1.65,marginBottom:6}}>{desc}</div>
        <div style={{fontSize:10,color:'#888888',letterSpacing:'0.02em',borderTop:'1px solid #333',paddingTop:6}}>{targets}</div>
      </div>
      {/* Badge face */}
      <div style={{background:'#e8eaed',border:'1px solid '+borderCol,borderRadius:T.r||0,padding:'10px 12px',position:'relative',height:'100%',cursor:'default'}}>
        {(w)&&(
          <div style={{position:'absolute',top:8,right:8,width:7,height:7,borderRadius:'50%',background:pipColor}}/>
        )}
        <div style={{fontSize:8,letterSpacing:'0.16em',textTransform:'uppercase',color:'#555555',marginBottom:5,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</div>
        {(analyzing)&&(
          <div style={{fontSize:18,fontWeight:700,color:'#999999',fontFamily:'monospace',fontStyle:'italic'}}>—</div>
        )}
        {(!analyzing&&val)&&(
          <div>
            <div style={{fontSize:20,fontWeight:700,color:col,fontFamily:'monospace',lineHeight:1}}>{val}</div>
            <div style={{fontSize:9,color:'#666666',marginTop:5,letterSpacing:'0.06em'}}>{statusText}</div>
          </div>
        )}
        {(!analyzing&&!val)&&(
          <div style={{fontSize:13,color:'#999999',fontStyle:'italic'}}>—</div>
        )}
      </div>
    </div>
  );
}
// ── Warning row sub-component ─────────────────────────────────────────────────
function WarnRow(props){
  var T=props.T;
  var label=props.label;
  var level=props.level;
  var msg=props.msg;
  var color=(level==='red')?'#f85149':'#d29922';
  var icon=(level==='red')?'✕':'◆';
  return(
    <div style={{display:'flex',gap:12,alignItems:'flex-start',padding:'10px 14px',borderTop:'1px solid #cccccc'}}>
      <span style={{fontSize:12,color:color,flexShrink:0,marginTop:1}}>{icon}</span>
      <div>
        <div style={{fontSize:11,color:color,fontWeight:700,marginBottom:4,letterSpacing:'0.04em'}}>{label}</div>
        <div style={{fontSize:11,color:'#333333',lineHeight:1.6}}>{msg}</div>
      </div>
    </div>
  );
}
// ── Reference card sub-component ─────────────────────────────────────────────
function RefCard(props){
  var T=props.T;
  var label=props.label;
  var val=props.val;
  var desc=props.desc;
  var targets=props.targets;
  var col=getMetricColor(props.metricKey,val);
  return(
    <div style={{padding:'10px 14px',background:'#e8eaed',border:'1px solid '+T.border,borderRadius:T.r||0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:700,color:'#555555',letterSpacing:'0.1em',textTransform:'uppercase'}}>{label}</span>
        <span style={{fontSize:13,fontWeight:700,color:col,fontFamily:'monospace'}}>{val||'—'}</span>
      </div>
      <div style={{fontSize:11,color:'#333333',lineHeight:1.7,marginBottom:5}}>{desc}</div>
      <div style={{fontSize:10,color:'#555555',letterSpacing:'0.02em'}}>{targets}</div>
    </div>
  );
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOUDNESS GRAPH — Reference scale with genre benchmarks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LoudnessGraph({ currentLufs, currentLra, currentPeak, containerWidth, section, activeGenre, setActiveGenre, targetGenre, setTargetGenre, T }) {
  // section: 'scale' | 'dynamics' | 'health' | 'legend'
  // activeGenre and targetGenre are lifted to AnalysisPanel so shared state works across section renders

  // ── Static data — no arrow functions ────────────────────────────────────────
  var GENRE_MAP = [
    { id: 'ambient',    label: 'Ambient',          lufs: -20, lra: 15, color: '#58a6ff',
      insight: 'Ambient music preserves wide dynamic range and quiet headroom — the journey from silence to sound IS the music. High LRA reflects natural, breathing dynamics rather than compressed density.' },
    { id: 'classical',  label: 'Classical',         lufs: -18, lra: 16, color: '#7c9ebf',
      insight: 'Classical masters preserve the full dynamic arc of a performance — from a single violin pianissimo to a full orchestra fortissimo. Wide LRA is a feature, not a flaw. Streaming normalization actually benefits these masters.' },
    { id: 'jazz',       label: 'Jazz',              lufs: -17, lra: 12, color: '#8ec4c4',
      insight: 'Jazz lives in the dynamic interplay between players. A wide LRA captures the breath of a horn, the ghost notes of a brush, the space between phrases. Over-compression destroys the very thing that makes it swing.' },
    { id: 'lofi',       label: 'Lo-Fi / Bedroom',  lufs: -16, lra: 9,  color: '#a08cc8',
      insight: 'Lo-Fi exists in the comfort zone — quiet enough to study to, warm enough to feel. Gentle limiting preserves the intimacy and crackle that defines the genre. Streaming normalization means going louder gains nothing.' },
    { id: 'streaming',  label: 'Streaming',         lufs: -14, lra: 10, color: '#3fb950',
      insight: 'Streaming platforms normalize to around −14 LUFS. Masters louder than this get turned DOWN, wasting effort. Masters quieter get turned up, potentially revealing noise. This is the sweet spot for modern delivery.' },
    { id: 'hiphop',     label: 'Hip-Hop / Trap',    lufs: -10, lra: 6,  color: '#c7a030',
      insight: 'Hip-hop and trap rely on pounding sub-bass and punchy 808s that need consistent punch across earbuds, car speakers, and Bluetooth. Moderate limiting keeps the kicks hard without destroying the mix. At −10, streaming platforms will apply minor gain reduction.' },
    { id: 'country',    label: 'Country / Americana', lufs: -12, lra: 8, color: '#c47c3c',
      insight: 'Country production balances organic dynamics — the snap of a snare, the bloom of a steel guitar — with the commercial loudness expected on country radio and streaming playlists. A wider LRA than rock preserves the storytelling dynamics of the genre.' },
    { id: 'rnb',        label: 'R&B / Soul',        lufs: -11, lra: 7,  color: '#b05888',
      insight: 'R&B and soul rely on the emotional weight of a vocal and a groove that locks in. Moderate compression gives the genre its polished, controlled feel without squashing the dynamics that carry the emotional performance.' },
    { id: 'rockpop',    label: 'Rock / Pop',         lufs: -9,  lra: 7,  color: '#d29922',
      insight: 'Rock and pop rely on perceived loudness for energy and impact. Tight dynamic range keeps the track punchy across earbuds, car stereos, and club PA — but at this level, streaming will reduce the volume.' },
    { id: 'club',       label: 'Club / EDM',          lufs: -6,  lra: 4,  color: '#f85149',
      insight: 'Club music needs maximum density to compete on high-SPL sound systems. Minimal LRA means the kick and bass stay consistent at 120dB. This sounds crushed on headphones but translates powerfully on big systems.' }
  ];

  // ── Platform normalization targets ───────────────────────────────────────────
  // Each platform normalizes to a specific LUFS target during playback.
  // Masters above the target are turned DOWN; below are turned UP (or left).
  // Grouped platform marks: one marker per unique LUFS target
  // Streaming group = Spotify / YouTube / TikTok / Amazon / Tidal all at −14
  // Apple Music is separate at −16
  var PLATFORM_GROUPS = [
    {
      id: 'streaming', label: 'Streaming', lufs: -14, color: '#3fb950',
      note: 'Most streaming platforms normalize to −14 LUFS integrated (ITU-R BS.1770-4). Platforms: Spotify, YouTube, TikTok, Amazon Music, Tidal.',
      detail: 'Spotify −14 · YouTube −14 · TikTok −14 · Amazon −14 · Tidal −14'
    },
    {
      id: 'apple', label: 'Apple', lufs: -16, color: '#b8b8b8',
      note: 'Apple Music uses Sound Check / AES standard to normalize to −16 LUFS integrated. Slightly quieter target than most platforms.',
      detail: 'Apple Music / iTunes Match'
    }
  ];

  var SCALE_MIN = -24;
  var SCALE_MAX = -3;
  var SCALE_RANGE = SCALE_MAX - SCALE_MIN; // 21

  function toPercent(db) {
    return ((db - SCALE_MIN) / SCALE_RANGE) * 100;
  }

  function getLufsZoneColor(v) {
    if (v >= -9) return '#f85149';
    if (v >= -14) return '#d29922';
    if (v >= -18) return '#3fb950';
    return '#58a6ff';
  }

  function getLraDynamics(lra) {
    var halfWidthPct = Math.min(lra * 2, 44);
    var opacity, r, g, b, label, desc;
    if (lra >= 12) {
      opacity = 0.22; r = 88;  g = 166; b = 255;
      label = 'Breathing'; desc = 'Wide dynamic range — natural, open, expressive.';
    } else if (lra >= 8) {
      opacity = 0.38; r = 63;  g = 185; b = 80;
      label = 'Dynamic'; desc = 'Healthy dynamics — punchy but not crushed.';
    } else if (lra >= 5) {
      opacity = 0.55; r = 210; g = 153; b = 34;
      label = 'Moderate'; desc = 'Moderate compression — some dynamics lost.';
    } else {
      opacity = 0.82; r = 248; g = 81;  b = 73;
      label = 'Compressed'; desc = 'Heavy limiting — the sausage. Minimal dynamic contrast.';
    }
    var colorSolid = 'rgb(' + r + ',' + g + ',' + b + ')';
    var colorFill  = 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
    return { halfWidthPct: halfWidthPct, colorSolid: colorSolid, colorFill: colorFill, label: label, desc: desc };
  }

  // ── Pre-compute all values — nothing computed inside JSX ────────────────────
  var hasLufs = currentLufs !== undefined && currentLufs !== null && currentLufs !== '' && !isNaN(parseFloat(currentLufs));
  var lufsVal  = hasLufs ? parseFloat(currentLufs) : null;
  var clampedLufs = hasLufs ? Math.max(SCALE_MIN, Math.min(SCALE_MAX, lufsVal)) : null;
  var lufsPos  = hasLufs ? toPercent(clampedLufs) : 0;

  var hasLra  = currentLra !== undefined && currentLra !== null && currentLra !== '' && !isNaN(parseFloat(currentLra));
  var lraVal  = hasLra ? Math.max(0, parseFloat(currentLra)) : null;
  var lraDyn  = (hasLra && lraVal !== null) ? getLraDynamics(lraVal) : null;
  var hasBoth = hasLufs && lraDyn !== null;

  // ── Peak Safety Valve ────────────────────────────────────────────────────────
  var hasPeak      = currentPeak !== undefined && currentPeak !== null && currentPeak !== '' && !isNaN(parseFloat(currentPeak));
  var peakVal      = hasPeak ? parseFloat(currentPeak) : null;
  var peakBreached = hasPeak && peakVal > -0.1;   // true peak above −0.1 dBFS = danger
  var peakDotClass = peakBreached ? 'tl-peak-blink' : '';
  var peakDotColor = !hasPeak ? T.border : peakBreached ? '#f85149' : '#3fb950';
  var peakDotTitle = !hasPeak ? 'No peak data' : peakBreached ? 'TRUE PEAK: ' + peakVal + ' dBFS — above −0.1 dBFS ceiling. Encode overshoot will cause clipping.' : 'TRUE PEAK: ' + peakVal + ' dBFS — safe headroom';
  var peakLabelText = hasPeak ? (peakVal > 0 ? 'CLIP' : peakVal + ' dB') : 'PEAK';
  var peakLabelColor = peakBreached ? '#f85149' : T.muted;

  // ── Platform normalization bar — above the scale ─────────────────────────────
  // Two grouped markers: "Streaming −14" (all major platforms) and "Apple −16"
  var platformTickEls = [];
  var platformLabelEls = [];

  for (var pi = 0; pi < PLATFORM_GROUPS.length; pi++) {
    var pm = PLATFORM_GROUPS[pi];
    var pmPos = toPercent(pm.lufs);
    var pmLeft = pmPos + '%';
    var pmTopOffset = 0;

    var pmLabelLeft = 'calc(' + pmPos + '% - 1px)';

    platformTickEls.push(
      <div
        key={pm.id}
        title={pm.note}
        style={{
          position: 'absolute', left: pmLeft,
          top: 0, width: 2, height: '100%',
          background: pm.color,
          opacity: 0.85,
          cursor: 'help',
          zIndex: 3
        }}
      />
    );

    platformLabelEls.push(
      <div
        key={pm.id}
        title={pm.note}
        style={{
          position: 'absolute', left: pmLabelLeft,
          top: pmTopOffset,
          transform: 'translateX(-50%)',
          textAlign: 'center',
          lineHeight: 1,
          cursor: 'help',
          whiteSpace: 'nowrap'
        }}
      >
        <div style={{
          fontSize: 9, color: pm.color,
          fontFamily: "'Share Tech Mono', monospace",
          fontWeight: 700, letterSpacing: '0.04em'
        }}>{pm.label}</div>
        <div style={{
          fontSize: 7.5, color: T.muted,
          fontFamily: "'Share Tech Mono', monospace",
          letterSpacing: '0.02em', marginTop: 1
        }}>{pm.lufs} LUFS</div>
      </div>
    );
  }

  // Fixed label area height: 2 lines per label = 28px
  var platformLabelAreaHpx = '28px';

  // Legacy spotifyLeft kept for backwards compatibility with existing JSX refs — points to −14
  var spotifyPos       = toPercent(-14);
  var spotifyLeft      = spotifyPos + '%';
  var spotifyLabelLeft = 'calc(' + spotifyPos + '% - 1px)';

  // ── Scale gradient ────────────────────────────────────────────────────────────
  // Maps the −24 to −3 dB range to a perceptually meaningful color ramp:
  //  −24  deep blue    (quiet / ambient space)
  //  −18  teal-blue    (dynamic / broadcast lower boundary)
  //  −14  bright green (streaming sweet spot — Spotify target)
  //  −11  yellow-green (getting loud)
  //   −9  amber        (rock/pop territory, platforms will normalize down)
  //   −6  orange-red   (club / EDM — aggressive limiting)
  //   −3  hard red     (danger zone, right edge)
  // Each stop is computed as a % of the 21 dB range
  var gradStop = function(db, hex) { return hex + ' ' + toPercent(db).toFixed(1) + '%'; };
  var scaleGradient = 'linear-gradient(to right, '
    + gradStop(-24, '#0d2a4a') + ', '
    + gradStop(-18, '#0d4a3a') + ', '
    + gradStop(-14, '#1a5e2a') + ', '
    + gradStop(-11, '#4a6a10') + ', '
    + gradStop(-9,  '#6a4a08') + ', '
    + gradStop(-6,  '#7a2208') + ', '
    + gradStop(-3,  '#8a0808') + ')';

  // Pre-computed positions for user marker on main scale
  var markerLeft     = lufsPos + '%';
  var markerWrapLeft = 'calc(' + lufsPos + '% - 5px)';

  // Pre-computed dynamic width bar positions
  var dynHalfW        = hasBoth ? lraDyn.halfWidthPct : 0;
  var dynBarLeft      = 'calc(' + lufsPos + '% - ' + dynHalfW + '%)';
  var dynBarWidth     = (dynHalfW * 2) + '%';
  var dynEdgeLeftPos  = 'calc(' + lufsPos + '% - ' + dynHalfW + '% - 1px)';
  var dynEdgeRightPos = 'calc(' + lufsPos + '% + ' + dynHalfW + '%)';
  var dynDiamondLeft  = 'calc(' + lufsPos + '% - 4px)';

  // Pre-computed range label strings
  var rangeMin = hasBoth ? (lufsVal - lraVal / 2).toFixed(1) : '';
  var rangeMax = hasBoth ? (lufsVal + lraVal / 2).toFixed(1) : '';
  var rangeLabelLeft  = '← ' + rangeMin;
  var rangeLabelRight = rangeMax + ' →';

  // Pre-computed lra callout string (avoids inline expression in JSX)
  var lraCalloutText = hasLra && lraVal > 0 ? ' · LRA ' + lraVal + ' LU' : '';
  var dynHeaderText  = hasBoth ? lraDyn.label + ' · LRA ' + lraVal + ' LU' : '';

  // Convenience
  var borderRadius = T.r || 0;

  // Pre-compute activeInsight — no arrow function
  var activeInsight = null;
  for (var i = 0; i < GENRE_MAP.length; i++) {
    if (GENRE_MAP[i].id === activeGenre) { activeInsight = GENRE_MAP[i]; break; }
  }
  var legendMarginBottom = activeInsight ? 8 : 0;

  // ── Target genre lookup — no arrow function ─────────────────────────────────
  var targetData = null;
  for (var ti2 = 0; ti2 < GENRE_MAP.length; ti2++) {
    if (GENRE_MAP[ti2].id === targetGenre) { targetData = GENRE_MAP[ti2]; break; }
  }

  // ── T-themed color aliases ───────────────────────────────────────────────────
  // T.accent = user-defined highlight = the "Your Master" marker color
  // T.bright = primary heading/value text
  // T.muted  = secondary labels
  // T.panel  = card/badge backgrounds
  // T.border = structural borders
  // T.text   = body text
  var userMarkerColor  = T.accent;              // live marker = theme accent
  var userMarkerShadow = '0 0 6px ' + T.accent;
  var userMarkerGlow   = '0 0 4px ' + T.accent;

  // ── Mastering Health Score (1–100) ──────────────────────────────────────────
  // Formula: two weighted dimensions — LUFS proximity (60%) + LRA proximity (40%)
  // Each dimension: 100 at perfect match, drops linearly toward 0 at ±12 dB/LU tolerance.
  var healthScore   = null;
  var healthLabel   = '';
  var healthColor   = T.muted;
  var healthDesc    = '';
  var healthBarW    = '0%';
  var healthLufsScore  = 0;
  var healthLraScore   = 0;

  if (hasBoth && targetData) {
    // LUFS score: tolerance window ±8 LUFS from target centre
    var lufsDiff  = Math.abs(lufsVal - targetData.lufs);
    var lufsScore = Math.max(0, Math.round((1 - lufsDiff / 8) * 100));

    // LRA score: tolerance window ±8 LU from target centre
    var lraDiff  = Math.abs(lraVal - targetData.lra);
    var lraScore = Math.max(0, Math.round((1 - lraDiff / 8) * 100));

    // Weighted composite
    var raw = Math.round(lufsScore * 0.60 + lraScore * 0.40);
    healthScore = Math.max(1, Math.min(100, raw));

    healthLufsScore = Math.min(100, lufsScore);
    healthLraScore  = Math.min(100, lraScore);

    // Grade thresholds
    if (healthScore >= 85) {
      healthLabel = 'Excellent';
      healthColor = '#3fb950';
      healthDesc  = 'Master sits well within the target zone for ' + targetData.label + '.';
    } else if (healthScore >= 65) {
      healthLabel = 'Good';
      healthColor = '#58a6ff';
      healthDesc  = 'Broadly in range — minor adjustments could bring it closer to the ' + targetData.label + ' target.';
    } else if (healthScore >= 40) {
      healthLabel = 'Fair';
      healthColor = '#d29922';
      healthDesc  = 'Some distance from the ' + targetData.label + ' ideal. Consider revisiting compression or limiting.';
    } else {
      healthLabel = 'Off-Target';
      healthColor = '#f85149';
      healthDesc  = 'Master diverges significantly from the ' + targetData.label + ' benchmark. Both LUFS and LRA may need attention.';
    }

    healthBarW = healthScore + '%';
  }

  // ── Mastering Health sub-score label strings ─────────────────────────────────
  var healthLufsStr = hasBoth && targetData ? healthLufsScore + '%' : '—';
  var healthLraStr  = hasBoth && targetData ? healthLraScore  + '%' : '—';
  var healthScoreStr = healthScore !== null ? healthScore + '%' : '—';

  // Target genre dropdown option strings — built before return()
  var targetSelectEls = [];
  for (var tsi = 0; tsi < GENRE_MAP.length; tsi++) {
    var tsg = GENRE_MAP[tsi];
    targetSelectEls.push(
      <option key={tsg.id} value={tsg.id}>{tsg.label}</option>
    );
  }

  // ── Pre-build JSX arrays before return() ────────────────────────────────────

  // 1. Genre notch markers on main scale bar
  var genreNotchEls = [];
  for (var ni = 0; ni < GENRE_MAP.length; ni++) {
    var ng   = GENRE_MAP[ni];
    var nPos = toPercent(ng.lufs) + '%';
    var nIsActive = activeGenre === ng.id;
    var nOpacity  = nIsActive ? 1 : 0.65;
    var nId = ng.id; // capture for closure
    genreNotchEls.push(
      <div
        key={ng.id}
        onClick={function(gid) { return function() { setActiveGenre(activeGenre === gid ? null : gid); }; }(nId)}
        title={ng.label + ': ' + ng.lufs + ' LUFS'}
        style={{
          position: 'absolute', left: nPos, top: -1,
          width: 2, height: 16,
          background: ng.color, opacity: nOpacity,
          cursor: 'pointer', transition: 'opacity 0.15s', zIndex: 2
        }}
      />
    );
  }

  // 2. dB scale tick labels
  var DB_TICKS = [-24, -21, -18, -15, -12, -9, -6, -3];
  var dbTickEls = [];
  for (var ti = 0; ti < DB_TICKS.length; ti++) {
    var tdb  = DB_TICKS[ti];
    var tPos = toPercent(tdb) + '%';
    dbTickEls.push(
      <div key={tdb} style={{
        position: 'absolute', left: tPos,
        transform: 'translateX(-50%)',
        fontSize: 10, color: T.muted,
        fontFamily: "'Share Tech Mono', monospace",
        letterSpacing: 0, lineHeight: 1
      }}>
        {tdb}
      </div>
    );
  }

  // 3. Genre name labels — collision-aware 3-row layout
  // Each label has an approximate pixel width. We assign row 0 first, then row 1, then row 2.
  // Approximate px per character at fontSize 9px, Barlow Condensed: ~6.5px/char
  var CHAR_W = 6.5;
  var HALF_PAD = 8; // half of minimum gap between labels (px)

  // Scale bar total rendered width: use live measured containerWidth prop when available.
  // 56px = 2 × 28px horizontal padding inside the analysis content wrapper.
  // Falls back to 520 on first render before measurement completes.
  var SCALE_BAR_W_PX = (containerWidth && containerWidth > 100) ? (containerWidth - 56) : 520;

  // Compute label half-widths in % of scale bar
  var labelHalfWidths = [];
  for (var lhw = 0; lhw < GENRE_MAP.length; lhw++) {
    var charCount = GENRE_MAP[lhw].label.length;
    var halfPx = (charCount * CHAR_W / 2) + HALF_PAD;
    labelHalfWidths.push(halfPx / SCALE_BAR_W_PX * 100);
  }

  // Assign rows: greedily try row 0, then row 1, then row 2
  var labelRows = [];
  var rowOccupancy = [[], [], []]; // occupancy arrays for rows 0, 1, 2
  for (var lri = 0; lri < GENRE_MAP.length; lri++) {
    var lrPos   = toPercent(GENRE_MAP[lri].lufs);
    var lrLeft  = lrPos - labelHalfWidths[lri];
    var lrRight = lrPos + labelHalfWidths[lri];
    var assignedRow = 2; // fallback to row 2
    for (var row = 0; row < 3; row++) {
      var rowCollides = false;
      for (var ci = 0; ci < rowOccupancy[row].length; ci++) {
        var occ = rowOccupancy[row][ci];
        if (lrLeft < occ.right && lrRight > occ.left) { rowCollides = true; break; }
      }
      if (!rowCollides) { assignedRow = row; break; }
    }
    labelRows.push(assignedRow);
    rowOccupancy[assignedRow].push({ left: lrLeft, right: lrRight });
  }

  var genreLabelEls = [];
  for (var li = 0; li < GENRE_MAP.length; li++) {
    var lg        = GENRE_MAP[li];
    var lPos      = toPercent(lg.lufs) + '%';
    var lIsActive = activeGenre === lg.id;
    var lColor    = lIsActive ? lg.color : T.sub;
    var lWeight   = lIsActive ? 700 : 500;
    var lDecor    = lIsActive ? 'underline' : 'none';
    var lId       = lg.id;
    var lTop      = labelRows[li] === 0 ? 0 : labelRows[li] === 1 ? 14 : 28;
    genreLabelEls.push(
      <div
        key={lg.id}
        onClick={function(gid) { return function() { setActiveGenre(activeGenre === gid ? null : gid); }; }(lId)}
        style={{
          position: 'absolute', left: lPos, top: lTop,
          transform: 'translateX(-50%)',
          fontSize: 9, color: lColor,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: lWeight, letterSpacing: '0.04em',
          textTransform: 'uppercase', cursor: 'pointer',
          whiteSpace: 'nowrap', lineHeight: 1,
          transition: 'color 0.15s', textDecoration: lDecor
        }}
      >
        {lg.label}
      </div>
    );
  }

  // 4. Ghost grid reference lines inside dynamics bar
  var LRA_REFS = [4, 8, 12, 16];
  var dynGridEls = [];
  for (var gi = 0; gi < LRA_REFS.length; gi++) {
    var refLra   = LRA_REFS[gi];
    var refHalfW = Math.min(refLra * 2, 44);
    var refLeftL = 'calc(' + lufsPos + '% - ' + refHalfW + '%)';
    var refLeftR = 'calc(' + lufsPos + '% + ' + refHalfW + '%)';
    dynGridEls.push(
      <React.Fragment key={refLra}>
        <div style={{ position: 'absolute', left: refLeftL, top: 0, width: 1, height: '100%', background: T.border, opacity: 0.4 }} />
        <div style={{ position: 'absolute', left: refLeftR, top: 0, width: 1, height: '100%', background: T.border, opacity: 0.4 }} />
      </React.Fragment>
    );
  }

  // 5. Genre legend row + click
  var genreLegendEls = [];
  for (var gi2 = 0; gi2 < GENRE_MAP.length; gi2++) {
    var gg      = GENRE_MAP[gi2];
    var gIsActive = activeGenre === gg.id;
    var gOpacity  = (activeGenre && !gIsActive) ? 0.4 : 1;
    var gTextCol  = gIsActive ? gg.color : T.sub;
    var gFontW    = gIsActive ? 700 : 400;
    var gId2 = gg.id;
    genreLegendEls.push(
      <div
        key={gg.id}
        onClick={function(gid) { return function() { setActiveGenre(activeGenre === gid ? null : gid); }; }(gId2)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: gOpacity, transition: 'opacity 0.15s' }}
      >
        <div style={{ width: 9, height: 9, background: gg.color, borderRadius: 1, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: gTextCol, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: gFontW, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {gg.label} · {gg.lufs} LUFS
        </span>
      </div>
    );
  }

  // ── Section: SCALE ────────────────────────────────────────────────────────────
  var scaleSection = (
    <div style={{ marginBottom: 8 }}>
      {/* Platform bar above scale */}
      <div style={{ position: 'relative', marginBottom: 4 }}>
        <div style={{
          position: 'relative', height: 8, background: T.panel,
          border: '1px solid ' + T.border, borderRadius: 2, overflow: 'visible', marginBottom: 4
        }}>
          {platformTickEls}
        </div>
        <div style={{ position: 'relative', height: platformLabelAreaHpx }}>
          {platformLabelEls}
        </div>
      </div>

      {/* Scale container */}
      <div style={{ position: 'relative', paddingBottom: 36, paddingTop: 4 }}>
        <div style={{
          position: 'relative', height: 16, borderRadius: 2,
          background: scaleGradient, border: '1px solid ' + T.border, overflow: 'visible'
        }}>
          {genreNotchEls}
          {/* Peak Safety Dot */}
          <div className={peakDotClass} title={peakDotTitle} style={{
            position: 'absolute', right: -8, top: -8, width: 11, height: 11,
            borderRadius: '50%', background: peakDotColor, border: '1px solid ' + T.border,
            zIndex: 12, cursor: 'default', boxShadow: peakBreached ? '0 0 6px #f85149' : 'none'
          }} />
          {/* User LUFS marker */}
          {hasLufs && (
            <div style={{ position: 'absolute', left: markerWrapLeft, top: -5, width: 10, height: 26, zIndex: 10, pointerEvents: 'none' }}>
              <div style={{
                width: 10, height: 10, background: userMarkerColor, borderRadius: 1,
                transform: 'rotate(45deg)', margin: '8px auto 0', boxShadow: userMarkerShadow
              }} />
            </div>
          )}
        </div>

        {/* dB tick labels */}
        <div style={{ position: 'relative', height: 16, marginTop: 4 }}>{dbTickEls}</div>

        {/* Genre name labels — collision-aware two-row */}
        <div style={{ position: 'relative', height: 46, marginTop: 2 }}>{genreLabelEls}</div>

        {/* Peak legend flush right */}
        <div style={{ position: 'absolute', right: 0, top: -22, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div className={peakDotClass} style={{ width: 8, height: 8, borderRadius: '50%', background: peakDotColor, flexShrink: 0, boxShadow: peakBreached ? '0 0 5px #f85149' : 'none' }} />
          <div style={{ fontSize: 9, color: peakLabelColor, fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.04em' }}>{peakLabelText}</div>
        </div>
      </div>

      {/* LUFS callout */}
      {hasLufs && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 10px', background: T.panel,
          border: '1px solid ' + userMarkerColor, borderRadius: borderRadius, marginBottom: 0
        }}>
          <div style={{ width: 8, height: 8, background: userMarkerColor, borderRadius: 1, transform: 'rotate(45deg)', flexShrink: 0, boxShadow: userMarkerGlow }} />
          <div style={{ fontSize: 11, color: T.text, fontFamily: "'Share Tech Mono', monospace", flex: 1 }}>
            Your master: <span style={{ color: userMarkerColor, fontWeight: 700 }}>{lufsVal} LUFS</span>
            <span style={{ color: T.muted }}>{lraCalloutText}</span>
          </div>
        </div>
      )}
    </div>
  );

  // ── Section: DYNAMICS ────────────────────────────────────────────────────────
  var dynamicsSection = hasBoth ? (
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.muted }}>Dynamic Width</div>
        <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed', monospace", fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: lraDyn.colorSolid }}>{dynHeaderText}</div>
      </div>
      <div style={{ position: 'relative', height: 24, background: T.panel, border: '1px solid ' + T.border, borderRadius: 2, overflow: 'hidden' }}>
        {dynGridEls}
        <div style={{ position: 'absolute', left: dynBarLeft, top: 0, width: dynBarWidth, height: '100%', background: lraDyn.colorFill, transition: 'all 0.4s ease' }} />
        <div style={{ position: 'absolute', left: dynBarLeft, top: 0, width: dynBarWidth, height: '100%', border: '1px solid ' + lraDyn.colorSolid, borderRadius: 1, opacity: 0.6, pointerEvents: 'none', boxSizing: 'border-box', transition: 'all 0.4s ease' }} />
        <div style={{ position: 'absolute', left: markerLeft, top: 0, width: 1, height: '100%', background: userMarkerColor, opacity: 0.9, zIndex: 3 }} />
        <div style={{ position: 'absolute', left: dynDiamondLeft, top: '50%', transform: 'translateY(-50%) rotate(45deg)', width: 7, height: 7, background: userMarkerColor, zIndex: 4, boxShadow: userMarkerShadow }} />
        <div style={{ position: 'absolute', left: dynEdgeLeftPos, top: 0, width: 2, height: '100%', background: lraDyn.colorSolid, opacity: 0.85, zIndex: 3 }} />
        <div style={{ position: 'absolute', left: dynEdgeRightPos, top: 0, width: 2, height: '100%', background: lraDyn.colorSolid, opacity: 0.85, zIndex: 3 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <div style={{ fontSize: 10, color: T.muted, fontFamily: "'Share Tech Mono', monospace" }}>{rangeLabelLeft}</div>
        <div style={{ fontSize: 10, color: lraDyn.colorSolid, fontFamily: "'Share Tech Mono', monospace", textAlign: 'center' }}>{lraDyn.desc}</div>
        <div style={{ fontSize: 10, color: T.muted, fontFamily: "'Share Tech Mono', monospace" }}>{rangeLabelRight}</div>
      </div>
    </div>
  ) : (
    <div style={{ padding: '8px 12px', border: '1px dashed ' + T.border, borderRadius: borderRadius, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.muted }}>Dynamic Width</div>
      <div style={{ fontSize: 10, color: T.muted, fontStyle: 'italic' }}>— run analysis to visualize LRA</div>
    </div>
  );

  // ── Section: MASTERING HEALTH ────────────────────────────────────────────────
  var healthSection = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.muted }}>Mastering Health</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 10, color: T.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Target:</div>
          <select value={targetGenre} onChange={function(e) { setTargetGenre(e.target.value); }} style={{
            fontSize: 10, fontFamily: "'Share Tech Mono', monospace",
            background: T.panel, color: T.text,
            border: '1px solid ' + T.border, borderRadius: borderRadius,
            padding: '2px 4px', cursor: 'pointer', outline: 'none', letterSpacing: '0.04em'
          }}>
            {targetSelectEls}
          </select>
        </div>
      </div>
      {hasBoth ? (
        <div style={{ background: T.panel, border: '1px solid ' + healthColor, borderRadius: borderRadius, overflow: 'hidden' }}>
          <div style={{ position: 'relative', height: 6, background: T.border }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: healthBarW, background: healthColor, transition: 'width 0.5s ease, background 0.3s ease' }} />
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: healthColor, fontFamily: "'Share Tech Mono', monospace", lineHeight: 1 }}>{healthScoreStr}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: healthColor, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase' }}>{healthLabel}</div>
            </div>
            <div style={{ fontSize: 11, color: T.text, lineHeight: 1.6, marginBottom: 8 }}>{healthDesc}</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>LUFS match</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.bright, fontFamily: "'Share Tech Mono', monospace" }}>{healthLufsStr}</div>
              </div>
              <div style={{ width: 1, background: T.border, alignSelf: 'stretch' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>LRA match</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.bright, fontFamily: "'Share Tech Mono', monospace" }}>{healthLraStr}</div>
              </div>
              <div style={{ width: 1, background: T.border, alignSelf: 'stretch' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Target LUFS</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.bright, fontFamily: "'Share Tech Mono', monospace" }}>{targetData ? targetData.lufs : '—'}</div>
              </div>
              <div style={{ width: 1, background: T.border, alignSelf: 'stretch' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Target LRA</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.bright, fontFamily: "'Share Tech Mono', monospace" }}>{targetData ? targetData.lra + ' LU' : '—'}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '8px 12px', border: '1px dashed ' + T.border, borderRadius: borderRadius, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, color: T.muted, fontStyle: 'italic' }}>— run analysis to calculate health score</div>
        </div>
      )}
    </div>
  );

  // ── Section: LEGEND ──────────────────────────────────────────────────────────
  var legendSection = (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: legendMarginBottom }}>
        {genreLegendEls}
      </div>
      {activeInsight && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: T.panel,
          border: '1px solid ' + activeInsight.color, borderRadius: borderRadius,
          borderLeft: '3px solid ' + activeInsight.color
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: activeInsight.color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {activeInsight.label} · {activeInsight.lufs} LUFS / LRA {activeInsight.lra} LU
          </div>
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.6, fontFamily: "'Share Tech Mono', monospace" }}>
            {activeInsight.insight}
          </div>
        </div>
      )}
    </div>
  );

  // ── render — section-aware ───────────────────────────────────────────────────
  if (section === 'scale')    return scaleSection;
  if (section === 'dynamics') return dynamicsSection;
  if (section === 'health')   return healthSection;
  if (section === 'legend')   return legendSection;

  // Default: render all sections (backwards compat)
  return (
    <div style={{ marginBottom: 20 }}>
      {scaleSection}
      {dynamicsSection}
      {healthSection}
      {legendSection}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
function AnalysisPanel(props){
  var T=props.T;
  var meta=props.meta;
  var audioFile=props.audioFile;
  var lufsAnalyzing=props.lufsAnalyzing;
  var recalculate=props.recalculate;
  var hasData=!!meta.lufs;

  // Lifted state — shared across all LoudnessGraph section renders
  var [activeGenre,setActiveGenre]=React.useState(null);
  var [targetGenre,setTargetGenre]=React.useState('streaming');

  // Measure panel width for collision detection
  var panelRef=React.useRef(null);
  var [panelWidth,setPanelWidth]=React.useState(0);
  React.useEffect(function(){
    if(!panelRef.current)return;
    var ro=new ResizeObserver(function(entries){
      if(entries[0])setPanelWidth(entries[0].contentRect.width);
    });
    ro.observe(panelRef.current);
    setPanelWidth(panelRef.current.offsetWidth);
    return function(){ro.disconnect();};
  },[]);

  var warnings=[];
  if(hasData){
    for(var i=0;i<AM_KEYS.length;i++){
      var m=AM_KEYS[i];
      var w=meta[m.key]?getMetricWarn(m.key,meta[m.key]):null;
      if(w){ warnings.push({m:m,w:w}); }
    }
  }
  var hasRed=warnings.some(function(x){ return x.w.level==='red'; });
  var hasAmber=!hasRed&&warnings.some(function(x){ return x.w.level==='amber'; });
  var statusColor=hasRed?'#f85149':(hasAmber?'#d29922':'#3fb950');
  var statusText=hasRed?'Issues found':(hasAmber?'Review recommended':'All clear');
  var warnBorder='1px solid '+(hasRed?'#f85149':'#d29922');
  var warnBg=hasRed?'rgba(248,81,73,0.1)':'rgba(210,153,34,0.1)';
  var warnTitleColor=hasRed?'#f85149':'#d29922';
  var btnOpacity=(!audioFile||lufsAnalyzing)?0.4:1;
  var btnCursor=(!audioFile||lufsAnalyzing)?'default':'pointer';
  var issueLabel=warnings.length+' Issue'+(warnings.length>1?'s':'')+' Detected';

  // Shared LoudnessGraph props
  var lgProps={
    currentLufs:meta.lufs, currentLra:meta.lra, currentPeak:meta.samplePeak,
    containerWidth:panelWidth,
    activeGenre:activeGenre, setActiveGenre:setActiveGenre,
    targetGenre:targetGenre, setTargetGenre:setTargetGenre,
    T:T
  };

  var sectionLabel={
    fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase',
    color:T.muted,marginBottom:8,fontFamily:"'Barlow Condensed',sans-serif",
    fontWeight:600,display:'block'
  };

  return(
    <div ref={panelRef} style={{width:'100%',paddingBottom:40}}>
      {/* Page header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:T.bright,marginBottom:4,letterSpacing:'0.06em',textTransform:'uppercase'}}>Technical Analysis</div>
          <div style={{fontSize:10,color:T.muted}}>ITU-R BS.1770-4 / EBU R128 / Two-pass gated</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',marginTop:2}}>
          {(hasData&&!lufsAnalyzing)&&(
            <div style={{fontSize:8,padding:'3px 8px',borderRadius:2,border:'1px solid '+statusColor,color:statusColor}}>
              {statusText}
            </div>
          )}
          <button onClick={recalculate} disabled={!audioFile||lufsAnalyzing}
            style={{padding:'6px 12px',background:T.panel,color:T.text,border:'1px solid '+T.border,
              fontFamily:'inherit',fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',
              cursor:btnCursor,opacity:btnOpacity,borderRadius:T.r||0}}>
            {lufsAnalyzing?'Analyzing...':'Recalculate'}
          </button>
        </div>
      </div>

      {!audioFile&&(
        <div style={{padding:24,textAlign:'center',border:'1px dashed '+T.border,borderRadius:T.r||0,color:T.text,fontSize:11}}>
          Upload an audio file to run analysis
        </div>
      )}

      {audioFile&&(
        <div>

          {/* ── A. LOUDNESS READINGS ────────────────────────────────────────── */}
          <div style={{marginBottom:20}}>
            <span style={sectionLabel}>Loudness Readings</span>
            <div style={{display:'flex',gap:8,alignItems:'stretch'}}>
              {AM_KEYS.map(function(metric){
                return(
                  <MetricBadge
                    key={metric.key}
                    T={T}
                    metricKey={metric.key}
                    label={metric.label}
                    val={meta[metric.key]}
                    desc={metric.desc}
                    targets={metric.targets}
                    analyzing={lufsAnalyzing}
                  />
                );
              })}
            </div>
          </div>

          {/* ── B. DYNAMIC WIDTH ────────────────────────────────────────────── */}
          <div style={{marginBottom:20}}>
            <span style={sectionLabel}>Dynamic Range</span>
            <LoudnessGraph {...lgProps} section='dynamics'/>
          </div>

          {/* ── C. ISSUES DETECTED ──────────────────────────────────────────── */}
          {(!lufsAnalyzing&&warnings.length>0)&&(
            <div style={{marginBottom:20,border:warnBorder,borderRadius:T.r||0,overflow:'hidden'}}>
              <div style={{padding:'6px 12px',background:warnBg,fontSize:8,letterSpacing:'0.15em',textTransform:'uppercase',color:warnTitleColor}}>
                {issueLabel}
              </div>
              {warnings.map(function(item){
                return(
                  <WarnRow key={item.m.key} T={T} label={item.m.label} level={item.w.level} msg={item.w.msg}/>
                );
              })}
            </div>
          )}

          {/* ── D. LOUDNESS REFERENCE SCALE ─────────────────────────────────── */}
          <div style={{marginBottom:20}}>
            <span style={sectionLabel}>Loudness Reference Scale</span>
            <LoudnessGraph {...lgProps} section='scale'/>
          </div>

          {/* ── E. MASTERING HEALTH ─────────────────────────────────────────── */}
          <div style={{marginBottom:20}}>
            <LoudnessGraph {...lgProps} section='health'/>
          </div>

          {/* ── F. GENRE LEGEND ─────────────────────────────────────────────── */}
          <div style={{marginBottom:20}}>
            <span style={sectionLabel}>Genre Benchmarks</span>
            <LoudnessGraph {...lgProps} section='legend'/>
          </div>

          {/* ── G. EQ PROFILE ───────────────────────────────────────────────── */}
          <div style={{marginBottom:20}}>
            <span style={sectionLabel}>EQ Profile</span>
            <SpectralGraph T={T} bands={meta.spectralProfile||null} analyzing={lufsAnalyzing}/>
          </div>

          {/* ── H. SPECTRAL / ARTIFACT ANALYSIS ────────────────────────────── */}
          <div style={{marginBottom:20}}>
            <span style={sectionLabel}>Spectral Analysis</span>
            <OriginEstimateBadge T={T} meta={meta} analyzing={lufsAnalyzing}/>
          </div>

        </div>
      )}
    </div>
  );
}


