/* ================================================================
   DESIGN TOKENS — the single source for color, type, spacing, depth and motion.
   applyTokens() writes them as CSS custom properties (--name), so CSS, D3/GSAP scenes and Chart.js all read
   the same values. Nothing else in the app should hard-code a color.

   Color roles
     surface-*   page → card → raised → inset (track/empty cell), plus overlay
     border-*    subtle (dividers) → default (controls, cards) → strong (hover, emphasis)
     text-*      strong (headings, values) → default → muted (labels) → subtle (notes)
     accent      primary: your data, selected state, positive change   (softened lime)
     secondary   comparison / second series / earlier-vs-later          (clear blue)
     warm        records and alerts only                                (amber)
     danger      errors only
     series-*    chart roles, used the same way in every view (see SERIES below)
     seq-*       sequential ramp for heatmaps and the body map (seq-0 = nothing logged)
     cat-*       categorical colors for muscle groups
   All text colors clear WCAG AA (4.5:1) on every surface; filled ramp levels clear 3:1 on cards.
   ================================================================ */

export const COLOR = {
  "surface-page": "#0B0D10", "surface-card": "#13161B", "surface-raised": "#1A1E25", "surface-inset": "#232831",
  "surface-overlay": "rgba(11,13,16,.9)", "surface-scrim": "rgba(5,6,8,.62)",
  "border-subtle": "rgba(255,255,255,.07)", "border": "rgba(255,255,255,.12)", "border-strong": "rgba(255,255,255,.22)",
  "text-strong": "#EEF1F4", "text": "#D3D8DF", "text-muted": "#A7AFBA", "text-subtle": "#8C949F", "text-on-accent": "#0B0D10",
  accent: "#A6D86B", "accent-strong": "#BBE786", "accent-soft": "rgba(166,216,107,.14)", "accent-line": "rgba(166,216,107,.45)",
  secondary: "#62B0F0", "secondary-soft": "rgba(98,176,240,.14)",
  warm: "#F0A64A", "warm-soft": "rgba(240,166,74,.14)", "warm-line": "rgba(240,166,74,.45)",
  danger: "#EE7E6C", "danger-soft": "rgba(238,126,108,.14)",
  // chart roles
  "series-1": "#A6D86B",   // primary metric: your load / volume / direct sets / "B" (later)
  "series-2": "#62B0F0",   // comparison or second series: 28-day, weekly mean, secondary metric
  "series-3": "#A891F7",   // tertiary: secondary-muscle credit, assisted body-weight proxy
  "series-4": "#56C2B2",   // time and duration
  "series-muted": "#7D8691", // baseline, older, "A" (earlier), raw observations
  "series-record": "#F0A64A",
  "series-2-soft": "rgba(98,176,240,.32)", "series-1-soft": "rgba(166,216,107,.32)",
  grid: "rgba(255,255,255,.08)", "grid-strong": "rgba(255,255,255,.16)",
  "seq-0": "#1F242B", "seq-1": "#4B7234", "seq-2": "#689645", "seq-3": "#86B957", "seq-4": "#A6D86B",
  "cat-1": "#A6D86B", "cat-2": "#62B0F0", "cat-3": "#E3C26B", "cat-4": "#A891F7", "cat-5": "#56C2B2", "cat-6": "#E48FAE", "cat-7": "#8A94A3", "cat-8": "#C9A27A",
};
// what each series role means, so every view uses the same color for the same kind of data
export const SERIES = { primary: COLOR["series-1"], comparison: COLOR["series-2"], tertiary: COLOR["series-3"], time: COLOR["series-4"],
  baseline: COLOR["series-muted"], record: COLOR["series-record"] };

export const FONT = {
  display: '"Archivo","Arial Narrow","Helvetica Neue",Arial,system-ui,sans-serif',   // headings, hero numbers
  ui: '"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',                 // interface and body text
  num: '"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',                // numbers, axes, tables (tabular figures)
  mono: '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',      // set notation only (3×12 @ 40)
};
export const TYPE = {
  "fs-hero": "clamp(64px,13vw,200px)", "fs-display": "clamp(40px,6.4vw,76px)", "fs-h1": "clamp(30px,4.2vw,52px)",
  "fs-h2": "clamp(22px,2.4vw,28px)", "fs-h3": "15px", "fs-body": "15.5px", "fs-small": "13.5px", "fs-caption": "12.5px",
  "fs-label": "11.5px", "fs-chart": "11.5px", "fs-metric": "clamp(28px,3.4vw,40px)",
  "lh-display": ".98", "lh-heading": "1.1", "lh-body": "1.55", "lh-tight": "1.3",
  "track-label": ".08em", "track-display": "-.02em",
};
export const SPACE = { "sp-1": "4px", "sp-2": "8px", "sp-3": "12px", "sp-4": "16px", "sp-5": "24px", "sp-6": "32px", "sp-7": "48px",
  "radius-sm": "8px", "radius": "12px", "radius-lg": "16px", "radius-pill": "999px", "card-pad": "18px",
  "shadow-card": "inset 0 1px 0 rgba(255,255,255,.035), 0 12px 32px -18px rgba(0,0,0,.75)",
  "shadow-pop": "0 24px 60px -12px rgba(0,0,0,.7)" };
// motion: durations in ms for CSS; JS reads seconds from motion.js (same numbers)
export const MOTION = { "dur-instant": "100ms", "dur-fast": "200ms", "dur-base": "400ms", "dur-slow": "700ms", "dur-hero": "1200ms", "dur-epic": "2200ms",
  "ease-out-expo": "cubic-bezier(.16,1,.3,1)", "ease-out-quart": "cubic-bezier(.25,1,.5,1)", "ease-in-out": "cubic-bezier(.65,0,.35,1)", "ease-in-quart": "cubic-bezier(.5,0,.75,0)" };

export function applyTokens(root = typeof document !== "undefined" ? document.documentElement : null) {
  if (!root) return;
  const set = (k, v) => root.style.setProperty("--" + k, v);
  for (const [k, v] of Object.entries(COLOR)) set(k, v);
  for (const [k, v] of Object.entries(FONT)) set("font-" + k, v);
  for (const [k, v] of Object.entries({ ...TYPE, ...SPACE, ...MOTION })) set(k, v);
}
