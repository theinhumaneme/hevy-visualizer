// Shared tooltip. Mouse: floats near the pointer. Touch: a bottom sheet. Keyboard: every bound mark is
// focusable and shows the same content anchored to it; Escape dismisses.
let tipTouch = false;
const tipEl = () => document.getElementById("tip");
const plain = html => html.replace(/<br\s*\/?>/g, ". ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function place(tip, x, y) {
  const r = tip.getBoundingClientRect();
  if (x + 14 + r.width > innerWidth - 8) x = x - r.width - 28;
  if (y + 14 + r.height > innerHeight - 8) y = y - r.height - 28;
  tip.style.left = Math.max(8, x + 14) + "px"; tip.style.top = Math.max(8, y + 14) + "px";
}
export function showTip(html, ev) {
  const tip = tipEl(); if (!tip) return;
  tip.innerHTML = html; tip.hidden = false;
  tipTouch = !!ev && ev.pointerType === "touch";
  tip.classList.toggle("sheet", tipTouch);
  if (tipTouch || !ev) return;
  if (ev.type === "focus") { const r = ev.target.getBoundingClientRect(); place(tip, r.right, r.top); }
  else place(tip, ev.clientX, ev.clientY);
}
export function hideTip() { const tip = tipEl(); if (tip) tip.hidden = true; }
export function bindTip(node, html, { focus = true } = {}) {
  const get = () => (typeof html === "function" ? html() : html);
  node.addEventListener("pointermove", e => { if (e.pointerType !== "touch") showTip(get(), e); });
  node.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") hideTip(); });
  node.addEventListener("pointerup", e => { if (e.pointerType === "touch") { e.stopPropagation(); showTip(get(), e); } });
  if (focus) {
    node.setAttribute("tabindex", "0");
    if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", plain(get()));
    if (!node.getAttribute("role")) node.setAttribute("role", "img");
    node.classList.add("focusable-mark");
    node.addEventListener("focus", e => showTip(get(), e));
    node.addEventListener("blur", hideTip);
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerup", e => { const t = tipEl(); if (tipTouch && t && !t.contains(e.target)) hideTip(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
  addEventListener("scroll", () => { const t = tipEl(); if (t && !t.hidden && !tipTouch && !(document.activeElement && document.activeElement.classList?.contains("focusable-mark"))) hideTip(); }, { passive: true });
}
