import { useEffect } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';

// Focus management for popovers and drawers: focus moves inside on open, Tab is trapped when `modal`,
// Escape or an outside press closes, and focus returns to whatever opened it.
export function useDialog(open, ref, onClose, { modal = false } = {}) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const opener = document.activeElement;
    const box = ref.current;
    const first = box.querySelector(FOCUSABLE);
    (first || box).focus({ preventScroll: true });
    const key = e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (modal && e.key === "Tab") {
        const f = [...box.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    const down = e => { if (!box.contains(e.target) && !(box.parentElement && box.parentElement.contains(e.target))) onClose(); };
    document.addEventListener("keydown", key, true);
    if (!modal) document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", down);
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);
}
