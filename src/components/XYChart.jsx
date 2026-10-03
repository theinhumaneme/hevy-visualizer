import { useLayoutEffect, useRef, useState } from "react";
import { d3, gsap, C, T, EASE } from "../lib/motion.js";
import { el, fmt, fmtMs, spaced } from "../lib/format.js";
import { bindTip } from "../lib/tip.js";

const DAY = 864e5;
/* One small chart primitive for the metric panels: time or linear x, lines that break across gaps,
   dots (hollow = low confidence), step frontiers, bars and shaded bands. Marks carry stable keys, and a
   re-render moves existing marks to their new positions instead of rebuilding (reduced motion: instant).
   layers: [{ type: "line"|"dots"|"step"|"bars"|"band"|"rule", points|from/to|y, color, dash, gapDays, key }] */
export default function XYChart({ layers, x = {}, y = {}, height = 220, ariaLabel, reduced, margin }) {
  const host = useRef(null), state = useRef({});
  const [, relayout] = useState(0);
  useLayoutEffect(() => {
    const box = host.current; if (!box) return;
    const W = Math.max(240, box.clientWidth), H = height, m = { t: 14, r: 14, b: 26, l: 46, ...margin };
    let svg = box.querySelector("svg");
    if (!svg) { svg = el("svg", { role: "img" }, box); state.current = {}; }
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("aria-label", ariaLabel || "Chart");
    const pts = layers.flatMap(l => l.points || []);
    const xs = pts.map(p => p.x).concat(layers.filter(l => l.type === "band").flatMap(l => [l.from, l.to]));
    const isTime = x.type !== "linear";
    let xd = x.domain || d3.extent(xs);
    if (xd[0] == null) xd = isTime ? [new Date(Date.now() - 30 * DAY), new Date()] : [0, 1];
    if (+xd[0] === +xd[1]) xd = isTime ? [new Date(+xd[0] - 7 * DAY), new Date(+xd[1] + 7 * DAY)] : [xd[0] - 1, xd[1] + 1];
    const xs_ = (isTime ? d3.scaleTime() : d3.scaleLinear()).domain(xd).range([m.l, W - m.r]);
    if (!isTime && !x.domain) xs_.nice();
    const ys = pts.map(p => p.y).filter(v => v != null && isFinite(v)).concat(layers.filter(l => l.type === "rule").map(l => l.y));
    let yd = y.domain || d3.extent(ys);
    if (yd[0] == null) yd = [0, 1];
    if (y.zero) yd = [Math.min(0, yd[0]), Math.max(0, yd[1])];
    else { const pad = (yd[1] - yd[0]) * 0.1 || Math.abs(yd[0] * 0.05) || 1; yd = [yd[0] - pad, yd[1] + pad]; }
    const ysc = d3.scaleLinear().domain(yd).nice().range(y.invert ? [m.t, H - m.b] : [H - m.b, m.t]);
    const fy = y.format || (v => fmt(v, Math.abs(yd[1] - yd[0]) < 5 ? 1 : 0));

    // axes are cheap: redraw
    let g = svg.querySelector("g.axes"); if (g) g.remove();
    g = el("g", { class: "axes" }); svg.insertBefore(g, svg.firstChild);
    ysc.ticks(4).forEach(t => { el("line", { x1: m.l, x2: W - m.r, y1: ysc(t), y2: ysc(t), stroke: C.line }, g); el("text", { x: m.l - 6, y: ysc(t) + 3, "text-anchor": "end" }, g).textContent = fy(t); });
    // ticks: whole numbers only on count axes; day-level dates when the span is short, month-level otherwise
    const spanDays = isTime ? (xd[1] - xd[0]) / DAY : 0;
    const edge = W - m.r - 20;   // time labels past this are end-anchored so they stay inside the chart
    let xt = isTime ? spaced(xs_.ticks(6), xs_, 56, edge) : xs_.ticks(W < 420 ? 4 : 8);
    if (!isTime && x.integer !== false) xt = xt.filter(Number.isInteger);
    const xf = isTime ? (spanDays < 150 ? (t => t.toLocaleDateString("en-US", { month: "short", day: "numeric" })) : fmtMs) : (x.format || fmt);
    const seen = new Set();
    xt.forEach(t => { const label = xf(t); if (seen.has(label)) return; seen.add(label); el("text", { x: xs_(t), y: H - 8, "text-anchor": isTime && xs_(t) > edge ? "end" : "middle" }, g).textContent = label; });
    if (y.label) el("text", { x: m.l, y: 9 }, g).textContent = y.label;
    if (x.label) el("text", { x: W - m.r, y: H - 8, "text-anchor": "end", dy: "-12" }, g).textContent = x.label;

    const dur = reduced ? 0 : T.slow;
    const keep = new Set();
    let marks = svg.querySelector("g.marks"); if (!marks) marks = el("g", { class: "marks" }, svg);
    const upsert = (key, tag, attrs, init) => {
      let n = marks.querySelector(`[data-k="${CSS.escape(key)}"]`);
      const fresh = !n;
      if (fresh) { n = el(tag, { "data-k": key }, marks); if (init) init(n); }
      keep.add(n);
      const anim = {}, now = {};
      for (const [k, v] of Object.entries(attrs)) (["cx", "cy", "x", "y", "width", "height", "r"].includes(k) && !fresh ? anim : now)[k] = v;
      for (const [k, v] of Object.entries(now)) n.setAttribute(k, v);
      if (Object.keys(anim).length) gsap.to(n, { attr: anim, duration: dur, ease: EASE.morph, overwrite: true });
      return { n, fresh };
    };
    const linePath = (P, gapDays) => {
      let d = "", prev = null;
      for (const p of P) {
        if (p.y == null || !isFinite(p.y)) { prev = null; continue; }
        const brk = !prev || (gapDays && isTime && (p.x - prev.x) / DAY > gapDays);
        d += (brk ? "M" : "L") + xs_(p.x).toFixed(1) + " " + ysc(p.y).toFixed(1); prev = p;
      }
      return d;
    };
    layers.forEach((L, li) => {
      const lk = L.key || `${L.type}${li}`;
      if (L.type === "band") {
        upsert(lk, "rect", { x: xs_(L.from), y: m.t, width: Math.max(1, xs_(L.to) - xs_(L.from)), height: H - m.b - m.t, fill: L.color || "rgba(255,255,255,.04)" });
      } else if (L.type === "rule") {
        upsert(lk, "line", { x1: m.l, x2: W - m.r, y1: ysc(L.y), y2: ysc(L.y), stroke: L.color || C["text-lo"], "stroke-dasharray": L.dash || "4 4" });
      } else if (L.type === "line" || L.type === "step") {
        const P = L.type === "step" ? L.points.flatMap((p, i, a) => i ? [{ x: p.x, y: a[i - 1].y }, p] : [p]) : L.points;
        const { n, fresh } = upsert(lk, "path", { fill: "none", stroke: L.color || C.accent, "stroke-width": L.width || 2, "stroke-dasharray": L.dash || "", "stroke-linejoin": "round", "stroke-linecap": "round", opacity: L.opacity ?? 1 });
        const d = linePath(P, L.gapDays);
        if (fresh || reduced) { n.setAttribute("d", d); if (fresh && !reduced && !L.dash) { const len = n.getTotalLength(); n.style.strokeDasharray = `${len} ${len}`; gsap.fromTo(n, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: T.hero, ease: EASE.draw, onComplete: () => { n.style.strokeDasharray = L.dash || ""; } }); } }
        else gsap.to(n, { attr: { d }, duration: dur, ease: EASE.morph, overwrite: true });
      } else if (L.type === "dots") {
        L.points.forEach((p, i) => {
          if (p.y == null || !isFinite(p.y)) return;
          const k = `${lk}:${p.key ?? +p.x + ":" + i}`;
          const { n, fresh } = upsert(k, "circle", { cx: xs_(p.x), cy: ysc(p.y), r: p.r || L.r || 3, fill: p.hollow ? C["bg-1"] : p.color || L.color || C.accent,
            stroke: p.color || L.color || C.accent, "stroke-width": p.hollow ? 1.5 : 0, opacity: p.opacity ?? L.opacity ?? 1 });
          if (fresh && p.tip) bindTip(n, p.tip);
          if (fresh && !reduced) gsap.from(n, { attr: { r: 0 }, duration: T.base, ease: EASE.out, delay: Math.min(i * 0.01, 0.4) });
        });
      } else if (L.type === "bars") {
        const bw = L.barWidth || Math.max(2, (W - m.l - m.r) / Math.max(1, L.points.length) - 2);
        L.points.forEach((p, i) => {
          const k = `${lk}:${p.key ?? +p.x}`, y0 = ysc(Math.max(0, yd[0])), y1 = ysc(p.y || 0);
          const { n, fresh } = upsert(k, "rect", { x: xs_(p.x) - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.abs(y0 - y1), rx: 2, fill: p.color || L.color || C["accent-2"], opacity: p.opacity ?? L.opacity ?? .85 });
          if (fresh && p.tip) bindTip(n, p.tip);
          if (fresh && !reduced) gsap.from(n, { attr: { y: y0, height: 0 }, duration: T.slow, ease: EASE.draw, delay: Math.min(i * 0.006, 0.3) });
        });
      }
    });
    [...marks.children].forEach(n => { if (!keep.has(n)) { if (reduced) n.remove(); else gsap.to(n, { opacity: 0, duration: T.fast * T.exit, onComplete: () => n.remove() }); } });
  });
  // resize: re-run the same effect at the new width (marks move to new coordinates, nothing is rebuilt)
  useLayoutEffect(() => {
    const box = host.current; if (!box || typeof ResizeObserver === "undefined") return;
    let w = box.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(box.clientWidth - w) > 20) { w = box.clientWidth; relayout(n => n + 1); } });
    ro.observe(box); return () => ro.disconnect();
  }, []);
  return <div className="xy" ref={host} />;
}
