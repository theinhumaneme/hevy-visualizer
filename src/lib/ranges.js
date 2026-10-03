// Date-range presets shared by Story and Recap. Ranges are inclusive calendar days.
import { startOfDay } from "./derive.js";

const MONTH = d => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const PRESETS = [
  { id: "all", label: "All time" },
  { id: "year", label: "Last year" },
  { id: "3m", label: "Last 3 months" },
  { id: "lastMonth", label: "Last month" },
  { id: "month", label: "This month so far" },
  { id: "custom", label: "Custom" },
];
// labels that name what they mean: "Last year" is the previous calendar year
export const presetLabel = (p, now = new Date()) => p.id === "year" ? `Last year (${now.getFullYear() - 1})` : p.label;
export const presetNote = { year: "Previous calendar year", month: "From the 1st of this month to today", "3m": "The last 3 months up to today", lastMonth: "Previous calendar month" };

export function resolveRange(r, now = new Date()) {
  const today = startOfDay(now), y = today.getFullYear(), m = today.getMonth();
  switch (r.id) {
    case "year": return { from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31), title: String(y - 1) };
    case "3m": return { from: new Date(y, m - 3, today.getDate() + 1), to: today, title: "the last 3 months" };
    case "lastMonth": { const from = new Date(y, m - 1, 1); return { from, to: new Date(y, m, 0), title: MONTH(from) }; }
    case "month": return { from: new Date(y, m, 1), to: today, title: MONTH(today) };
    case "custom": {
      const from = r.from ? parseISO(r.from) : null, to = r.to ? parseISO(r.to) : null;
      const [a, b] = from && to && from > to ? [to, from] : [from, to];
      return { from: a, to: b, title: a || b ? `${a ? short(a) : "the start"} – ${b ? short(b) : "today"}` : "all time" };
    }
    default: return { from: null, to: null, title: "all time" };
  }
}
// The same-length window just before a range, for "vs previous period" deltas.
export function previousRange(res) {
  if (!res.from) return null;
  const to = res.to || startOfDay(new Date());
  const days = Math.round((to - res.from) / 864e5) + 1;
  // calendar months/years compare with the previous calendar month/year
  if (res.from.getDate() === 1 && new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate() === to.getDate() && days > 27) {
    const months = (to.getFullYear() - res.from.getFullYear()) * 12 + to.getMonth() - res.from.getMonth() + 1;
    return { from: new Date(res.from.getFullYear(), res.from.getMonth() - months, 1), to: new Date(res.from.getFullYear(), res.from.getMonth(), 0) };
  }
  // a month in progress compares with the same days of the month before
  if (res.from.getDate() === 1 && to.getMonth() === res.from.getMonth() && to.getFullYear() === res.from.getFullYear()) {
    const pf = new Date(res.from.getFullYear(), res.from.getMonth() - 1, 1);
    return { from: pf, to: new Date(pf.getFullYear(), pf.getMonth(), Math.min(to.getDate(), new Date(pf.getFullYear(), pf.getMonth() + 1, 0).getDate())) };
  }
  return { from: new Date(+res.from - days * 864e5), to: new Date(+res.from - 864e5) };
}
export const toISO = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
export const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const short = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
