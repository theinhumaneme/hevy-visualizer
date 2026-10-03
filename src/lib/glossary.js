/* ================================================================
   GLOSSARY — one definition per metric, shown wherever the metric first appears.
   Keep each entry to one or two plain sentences; calculation details live in "How this is calculated".
   hintHTML() renders the same accessible control for the imperative (HTML-string) views.
   ================================================================ */
export const GLOSSARY = {
  logged: ["Logged workouts", "All retained workout entries in your imported history, including short workouts."],
  qualifying: ["Qualifying sessions", "Workouts with at least 4 working sets. Shorter workouts still count their working sets in every total."],
  working: ["Working sets", "Logged sets other than warm-ups and cardio. This label doesn't measure how hard a set felt."],
  weightLifted: ["Weight lifted", "Total training volume: the sum of logged weight × reps for working sets with external load. Bodyweight exercises and machine assistance aren't included."],
  setVolume: ["Set volume", "Logged weight × reps for one externally loaded working set."],
  sessionVolume: ["Session volume", "The sum of set volumes for one exercise (or one workout) in a session."],
  topSet: ["Top set", "The heaviest working set for a loaded exercise, or the set with the least assistance for an assisted one. Read it with its rep count."],
  e1rm: ["Estimated one-rep max", "An estimate from logged weight and reps (Epley: weight × (1 + reps ÷ 30)), not a recorded single. Estimates from sets of 11+ reps are marked low confidence."],
  record: ["Personal record", "A new best compared with earlier entries for the same exercise in this imported history — even when the page shows a shorter period. One workout can set several kinds of record."],
  streak: ["Weekly streak", "Consecutive weeks meeting your weekly session target. Weeks start on Monday; the current, unfinished week doesn't break a streak."],
  target: ["Weekly target", "The number of qualifying sessions a week counts as 'on target'. Inferred from your typical active week until you choose one in Overview → Consistency."],
  block: ["Training block", "A run of logged sessions with gaps under 14 days. A gap of 14 days or more starts a new block."],
  credit: ["Direct and secondary sets", "Direct sets train an exercise's main muscle; secondary sets involve an assisting muscle. Credited totals count direct sets fully and secondary sets at half — so credits across muscles add up to more than your unique sets."],
  median: ["Median", "The middle value when the observations are put in order."],
  iqr: ["Typical range", "The middle half of the observations, from the 25th to the 75th percentile."],
  relative: ["Relative strength", "The displayed weight divided by a body-weight measurement from the same day or within 7 days. 1.2× means 1.2 times body weight."],
  perMinute: ["Volume per minute", "Logged external-load volume divided by usable workout duration. It reflects exercise choice and how time was logged, not workout quality."],
  rpe: ["RPE", "Rating of perceived exertion: the effort rating recorded for a set, where available."],
  dash: ["No value (–)", "This value couldn't be calculated from the available entries; the reason is shown nearby. A dash doesn't mean zero."],
  assistance: ["Machine assistance", "On assisted exercises the logged weight is help from the machine, so a lower number means you lifted more of yourself."],
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// <details> works with mouse, touch and keyboard without scripts, and never depends on hover or `title`
export function hintHTML(key, label) {
  const [term, def] = GLOSSARY[key];
  return `<details class="hint"><summary aria-label="What does “${esc(label || term)}” mean?"><span aria-hidden="true">i</span></summary><span class="hint-body"><b>${esc(term)}</b>${esc(def)}</span></details>`;
}
