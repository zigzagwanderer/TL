// ╔══════════════════════════════════════════════════════════════╗
// ║  LiveEQMeter                                                 ║
// ║  8-band live EQ visualiser — 32 px tall SVG                 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Props:
//   analyserNode  AnalyserNode | null  — pre-connected Web Audio AnalyserNode
//   T             object               — theme (T.accent, T.border)
//
// Design:
//   No React state for animation. The SVG skeleton is rendered once by React.
//   All per-frame changes (height, y) are applied via setAttribute inside a
//   requestAnimationFrame loop, bypassing the virtual DOM entirely.
//   useLayoutEffect fires synchronously after DOM paint so the rect nodes
//   are guaranteed to exist before the first tick() query.
//
// Babel rules:
//   • var throughout — no const / let
//   • No arrow functions (function keyword only)
//   • All hooks unconditionally at the top of every component
//   • React. prefix on all hooks — no bare globals
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

var EQ_BANDS = [
  [20,    60   ],  // Sub-bass
  [60,    200  ],  // Bass
  [200,   500  ],  // Low-mid
  [500,   2000 ],  // Mid
  [2000,  5000 ],  // Upper-mid
  [5000,  8000 ],  // Presence
  [8000,  12000],  // Brilliance
  [12000, 20000],  // Air
];

var EQ_H      = 32;                            // total SVG height (px)
var EQ_PAD    = 2;                             // top / bottom padding (px)
var EQ_MAX_H  = EQ_H - EQ_PAD * 2;            // 28 px usable bar height
var EQ_BAR_W  = 7;                             // bar width (px)
var EQ_GAP    = 2;                             // inter-bar gap (px)
var EQ_SVG_W  = 8 * EQ_BAR_W + 7 * EQ_GAP;   // 70 px
var EQ_SMOOTH = 0.8;                           // smoothing: 0=instant, 1=frozen
var EQ_IDXS   = [0, 1, 2, 3, 4, 5, 6, 7];    // static — avoids per-render alloc

function LiveEQMeter(props) {
  var analyserNode = props.analyserNode;
  var T            = props.T;

  // ── All hooks at the top — Babel safety ──────────────────────────────────
  var svgRef = React.useRef(null);
  var rafRef = React.useRef(null);
  // ─────────────────────────────────────────────────────────────────────────

  // useLayoutEffect fires synchronously after DOM mutations so the rect nodes
  // are guaranteed to exist when tick() first calls querySelectorAll.
  React.useLayoutEffect(function () {
    if (!analyserNode) return;

    var svg = svgRef.current;
    if (!svg) return;

    // Capture the 8 rect nodes once — avoids querySelectorAll on every frame.
    var rects = svg.querySelectorAll('.eq-bar');

    // ── Pre-compute logarithmic band → bin mapping ────────────────────────
    var bufLen    = analyserNode.frequencyBinCount;
    var dataArray = new Uint8Array(bufLen);
    var nyquist   = analyserNode.context.sampleRate / 2;
    var binHz     = nyquist / bufLen;

    function freqToBin(hz) {
      return Math.min(bufLen - 1, Math.max(0, Math.round(hz / binHz)));
    }

    var bandBins = [];
    for (var b = 0; b < EQ_BANDS.length; b++) {
      bandBins.push([
        freqToBin(EQ_BANDS[b][0]),
        freqToBin(EQ_BANDS[b][1]),
      ]);
    }

    var smoothed = [0, 0, 0, 0, 0, 0, 0, 0];

    // ── RAF animation loop ────────────────────────────────────────────────
    function tick() {
      analyserNode.getByteFrequencyData(dataArray);

      for (var i = 0; i < EQ_BANDS.length; i++) {
        var lo    = bandBins[i][0];
        var hi    = bandBins[i][1];
        var count = hi - lo + 1;
        var sum   = 0;

        for (var j = lo; j <= hi; j++) {
          sum += dataArray[j];
        }

        var raw     = count > 0 ? sum / count : 0;
        smoothed[i] = smoothed[i] * EQ_SMOOTH + raw * (1 - EQ_SMOOTH);

        var pct  = Math.min(1, smoothed[i] / 255);
        var barH = Math.max(1, Math.round(pct * EQ_MAX_H));
        var barY = EQ_H - EQ_PAD - barH;

        rects[i].setAttribute('height', barH);
        rects[i].setAttribute('y',      barY);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    // ── Cleanup: cancel RAF loop on unmount / analyserNode change ─────────
    return function cleanup() {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyserNode]);

  // ── Static SVG skeleton ───────────────────────────────────────────────────
  // React renders this once. height and y on each rect are intentionally NOT
  // set as JSX props — they are owned exclusively by the RAF loop above, so
  // the reconciler never diffs or touches them after the initial mount.
  return (
    <svg
      ref={svgRef}
      width={EQ_SVG_W}
      height={EQ_H}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {EQ_IDXS.map(function (i) {
        return (
          <rect
            key={i}
            className="eq-bar"
            x={i * (EQ_BAR_W + EQ_GAP)}
            y={EQ_H - EQ_PAD - 1}
            width={EQ_BAR_W}
            height={1}
            rx={1}
            fill={T.accent}
            fillOpacity={0.4}
          />
        );
      })}
    </svg>
  );
}
