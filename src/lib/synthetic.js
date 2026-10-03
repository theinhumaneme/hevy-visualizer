import * as H from "./derive.js";

// Synthetic: ~15 months of push/pull/legs, 3–4 sessions a week, overload with noise, deloads and a 10-day break.
export function synthCSV(now = new Date()) {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const P = {
    Push: [["Bench Press (Barbell)", 95, 8, 4, 5], ["Shoulder Press (Dumbbell)", 25, 10, 3, 2.5], ["Lateral Raise (Dumbbell)", 12.5, 15, 3, 2.5], ["Chest Fly (Machine)", 70, 12, 3, 5], ["Triceps Pushdown", 40, 12, 3, 5]],
    Pull: [["Pull Up (Assisted)", 70, 8, 4, -5], ["Seated Cable Row - V Grip (Cable)", 80, 10, 3, 5], ["Face Pull", 30, 15, 3, 2.5], ["Bicep Curl (Dumbbell)", 20, 10, 3, 2.5], ["Crunch", 0, 15, 3, 0]],
    Legs: [["Squat (Barbell)", 115, 8, 4, 5], ["Romanian Deadlift (Barbell)", 95, 10, 3, 5], ["Leg Extension (Machine)", 70, 12, 3, 5], ["Seated Leg Curl (Machine)", 60, 12, 3, 5], ["Standing Calf Raise", 90, 15, 3, 5], ["Plank", 0, 0, 3, 0]],
  };
  const rows = [["title", "start_time", "end_time", "description", "exercise_title", "superset_id", "exercise_notes", "set_index", "set_type", "weight_lbs", "reps", "distance_miles", "duration_seconds", "rpe"].join(",")];
  const M3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const stamp = d => `${d.getDate()} ${M3[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const end = H.startOfDay(now), start = new Date(+end - 460 * H.DAY);
  const count = {}; let k = 0;
  for (let d = new Date(start); d < end; d = new Date(+d + H.DAY)) {
    const wk = Math.floor((d - start) / (7 * H.DAY)), dow = (d.getDay() + 6) % 7;
    if (wk === 30 || (wk === 31 && dow < 3) || (wk >= 44 && wk < 47)) continue;   // a 10-day break and a 3-week one
    if (![0, 2, 4].includes(dow) && !(dow === 5 && rnd() < 0.45)) continue;
    if (rnd() < 0.08) continue;                                          // the odd missed day
    const title = ["Push", "Pull", "Legs"][k++ % 3], deload = wk % 6 === 5 ? 0.85 : 1;
    const t0 = new Date(+d + (17 + Math.floor(rnd() * 3)) * 3600e3 + Math.floor(rnd() * 4) * 15 * 6e4);
    const t1 = new Date(+t0 + (48 + Math.floor(rnd() * 30)) * 6e4);
    for (const [ex, base, reps, sets, inc] of P[title]) {
      const n = count[ex] = (count[ex] || 0) + 1;
      let w = inc ? base + inc * Math.floor(n / 7) : 0;
      if (inc < 0) w = Math.max(20, base + inc * Math.floor(n / 9));
      w = inc ? Math.round(w * (inc < 0 ? 1 : deload) / Math.abs(inc)) * Math.abs(inc) : 0;
      let i = 0;
      if (/Bench|Squat \(/.test(ex)) rows.push([title, stamp(t0), stamp(t1), "", ex, "", "", i++, "warmup", Math.round(w * 0.5), 10, "", "", ""].map(v => typeof v === "string" && v.includes(",") ? `"${v}"` : v).join(","));
      for (let s = 0; s < sets; s++) {
        const r = ex === "Plank" ? "" : Math.max(4, reps + Math.round((rnd() - 0.6) * 2) + (n % 3 === 2 ? 1 : 0) - (s === sets - 1 && rnd() < 0.4 ? 1 : 0));
        rows.push([title, stamp(t0), stamp(t1), "", ex, "", "", i++, "normal", w || "", r, "", ex === "Plank" ? 45 + Math.min(12, Math.floor(n / 4)) * 5 : "", ""].map(v => typeof v === "string" && v.includes(",") ? `"${v}"` : v).join(","));
      }
    }
  }
  return rows.join("\n");
}
