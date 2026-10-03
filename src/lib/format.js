// Formatting + tiny DOM helpers shared by every view.
export const NS = "http://www.w3.org/2000/svg";
export const fmt = (x, p = 0) => (x == null || !isFinite(x)) ? "–" : (+x).toLocaleString("en-US", { maximumFractionDigits: p, minimumFractionDigits: 0 });
export const fmtD = (d, o = { month: "short", day: "numeric", year: "numeric" }) => d.toLocaleDateString("en-US", o);
export const fmtM = d => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
export const fmtMs = d => d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " ’");
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const short = ex => ex.replace(/\s*\([^)]*\)\s*/g, " ").trim();
export const equip = ex => (ex.match(/\(([^)]*)\)/) || [])[1] || "";
export const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Axis ticks thinned so neighbouring labels keep at least `gap` px between them (narrow charts get fewer, never overlapping).
// Past `edge` a label is drawn end-anchored, so it sits further left and needs more room from the one before.
export const spaced = (ticks, x, gap = 56, edge = Infinity) => { let last = -Infinity; return ticks.filter(t => { const p = x(t); if (p - last < (p > edge ? gap * 1.35 : gap)) return false; last = p; return true; }); };
export const fmtDur = min => min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m` : `${Math.round(min)} min`;
