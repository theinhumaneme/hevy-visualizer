/* ================================================================
   EXERCISE REGISTRY — the single source for what an exercise is.
   One entry per exact Hevy title: family, movement pattern, direct and secondary muscles, equipment and
   load semantics. Every view (Story, Recap, Compare, dashboard, Analysis) reads this; nothing else maps muscles.

   Muscle credit is a counting convention: each direct muscle gets 1 set, each secondary ½ (docs/metrics-opportunities.md).
   Load semantics decide what a blank weight means:
     external    — a logged weight is external load; a blank one is UNKNOWN, never "bodyweight"
     assisted    — the weight is machine assistance (lower = more of your own strength)
     bodyweight  — explicitly unloaded; a positive weight means added load
     hold        — timed hold
     cardio      — not a resistance set
     unknown     — the title alone can't tell (e.g. Standing Calf Raise): blank weight stays unknown
   ================================================================ */

export const MUSCLES = {
  chest: "Chest", back: "Back", traps: "Traps", frontDelt: "Front delts", sideDelt: "Side delts", rearDelt: "Rear delts",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", core: "Core", quads: "Quads", hamstrings: "Hamstrings",
  glutes: "Glutes", calves: "Calves",
};
export const UPPER = new Set(["chest", "back", "traps", "frontDelt", "sideDelt", "rearDelt", "biceps", "triceps", "forearms"]);
export const LOWER = new Set(["quads", "hamstrings", "glutes", "calves"]);
// movement ratios use patterns, not muscles (so a rear-delt fly is a pull, a triceps dip is a push)
export const PUSH_PATTERNS = new Set(["Horizontal push", "Vertical push", "Dip", "Chest fly"]);
export const PULL_PATTERNS = new Set(["Vertical pull", "Horizontal pull"]);
export const PATTERNS = ["Horizontal push", "Vertical push", "Dip", "Chest fly", "Shoulder isolation", "Vertical pull", "Horizontal pull", "Shrug",
  "Elbow flexion", "Elbow extension", "Squat", "Lunge", "Knee extension", "Knee flexion", "Hip hinge", "Hip extension / abduction", "Calf",
  "Core (flexion)", "Core (rotation)", "Core (anti-movement)"];

const R = (family, pattern, direct, secondary, load, note) => ({ family, pattern, direct, secondary, load, note });
// Exact titles found in Hevy exports (all 59 in the reference file, plus a few common ones).
const REGISTRY = {
  "Pull Up (Assisted)": R("Assisted pull-up", "Vertical pull", ["back"], ["biceps"], "assisted"),
  "Chin Up (Assisted)": R("Assisted chin-up", "Vertical pull", ["back"], ["biceps"], "assisted"),
  "Pull Up": R("Pull-up", "Vertical pull", ["back"], ["biceps"], "bodyweight"),
  "Chin Up": R("Chin-up", "Vertical pull", ["back"], ["biceps"], "bodyweight"),
  "Lat Pulldown (Cable)": R("Lat pulldown", "Vertical pull", ["back"], ["biceps"], "external"),
  "Lat Pulldown - Close Grip (Cable)": R("Lat pulldown", "Vertical pull", ["back"], ["biceps"], "external"),
  "Rope Straight Arm Pulldown": R("Straight-arm pulldown", "Vertical pull", ["back"], [], "external"),
  "Iso-Lateral Row (Machine)": R("Row", "Horizontal pull", ["back"], ["biceps"], "external"),
  "Seated Cable Row - V Grip (Cable)": R("Row", "Horizontal pull", ["back"], ["biceps"], "external"),
  "Single Arm Cable Row": R("Row", "Horizontal pull", ["back"], ["biceps"], "external", "single-arm load convention unknown"),
  "Dumbbell Row": R("Row", "Horizontal pull", ["back"], ["biceps"], "external", "per-hand vs total unknown"),
  "Rear Delt Reverse Fly (Machine)": R("Rear-delt fly", "Horizontal pull", ["rearDelt"], ["traps"], "external"),
  "Face Pull": R("Face pull", "Horizontal pull", ["rearDelt"], ["traps"], "external"),
  "Shrug (Smith Machine)": R("Shrug", "Shrug", ["traps"], [], "external"),
  "Shrug (Dumbbell)": R("Shrug", "Shrug", ["traps"], [], "external", "per-hand vs total unknown"),
  "Push Up": R("Push-up", "Horizontal push", ["chest"], ["triceps", "frontDelt"], "bodyweight"),
  "Iso-Lateral Chest Press (Machine)": R("Machine chest press", "Horizontal push", ["chest"], ["triceps", "frontDelt"], "external"),
  "Chest Press (Machine)": R("Machine chest press", "Horizontal push", ["chest"], ["triceps", "frontDelt"], "external"),
  "Bench Press (Dumbbell)": R("Bench press", "Horizontal push", ["chest"], ["triceps", "frontDelt"], "external"),
  "Bench Press (Barbell)": R("Bench press", "Horizontal push", ["chest"], ["triceps", "frontDelt"], "external"),
  "Incline Bench Press (Barbell)": R("Incline bench press", "Horizontal push", ["chest"], ["triceps", "frontDelt"], "external"),
  "Chest Dip (Assisted)": R("Assisted dip", "Dip", ["chest"], ["triceps"], "assisted"),
  "Triceps Dip (Assisted)": R("Assisted dip", "Dip", ["triceps"], ["chest"], "assisted"),
  "Chest Fly (Machine)": R("Chest fly", "Chest fly", ["chest"], [], "external"),
  "Incline Chest Fly (Dumbbell)": R("Chest fly", "Chest fly", ["chest"], [], "external"),
  "Shoulder Press (Machine Plates)": R("Shoulder press", "Vertical push", ["frontDelt", "sideDelt"], ["triceps"], "external"),
  "Front Raise (Dumbbell)": R("Front raise", "Shoulder isolation", ["frontDelt"], [], "external"),
  "Lateral Raise (Dumbbell)": R("Lateral raise", "Shoulder isolation", ["sideDelt"], [], "external"),
  "Bicep Curl (Cable)": R("Biceps curl", "Elbow flexion", ["biceps"], [], "external"),
  "Bicep Curl (Barbell)": R("Biceps curl", "Elbow flexion", ["biceps"], [], "external"),
  "Bicep Curl (Dumbbell)": R("Biceps curl", "Elbow flexion", ["biceps"], [], "external", "per-hand vs total unknown"),
  "Seated Incline Curl (Dumbbell)": R("Biceps curl", "Elbow flexion", ["biceps"], [], "external"),
  "Preacher Curl (Barbell)": R("Biceps curl", "Elbow flexion", ["biceps"], [], "external"),
  "Triceps Pushdown": R("Triceps extension", "Elbow extension", ["triceps"], [], "external"),
  "Triceps Rope Pushdown": R("Triceps extension", "Elbow extension", ["triceps"], [], "external"),
  "Skullcrusher (Barbell)": R("Triceps extension", "Elbow extension", ["triceps"], [], "external"),
  "Skullcrusher (Dumbbell)": R("Triceps extension", "Elbow extension", ["triceps"], [], "external"),
  "Triceps Extension (Barbell)": R("Triceps extension", "Elbow extension", ["triceps"], [], "external"),
  "Squat (Bodyweight)": R("Bodyweight squat", "Squat", ["quads"], ["glutes"], "bodyweight"),
  "Sumo Squat": R("Sumo squat", "Squat", ["quads"], ["glutes"], "unknown", "no load logged; resistance semantics provisional"),
  "Hack Squat (Machine)": R("Machine squat", "Squat", ["quads"], ["glutes"], "external"),
  "Squat (Machine)": R("Machine squat", "Squat", ["quads"], ["glutes"], "external"),
  "Squat (Barbell)": R("Barbell squat", "Squat", ["quads"], ["glutes"], "external"),
  "Leg Press Horizontal (Machine)": R("Leg press", "Squat", ["quads"], ["glutes"], "external"),
  "Leg Press (Machine)": R("Leg press", "Squat", ["quads"], ["glutes"], "external"),
  "Bulgarian Split Squat (Dumbbell)": R("Split squat", "Lunge", ["quads"], ["glutes"], "external", "loads blank in this file: reps with unknown load"),
  "Leg Extension (Machine)": R("Leg extension", "Knee extension", ["quads"], [], "external"),
  "Seated Leg Curl (Machine)": R("Leg curl", "Knee flexion", ["hamstrings"], [], "external"),
  "Lying Leg Curl (Machine)": R("Leg curl", "Knee flexion", ["hamstrings"], [], "external"),
  "Back Extension (Hyperextension)": R("Back extension", "Hip hinge", ["glutes"], ["hamstrings"], "bodyweight", "glute/hamstring/erector split depends on execution"),
  "Romanian Deadlift (Barbell)": R("Romanian deadlift", "Hip hinge", ["hamstrings", "glutes"], [], "external"),
  "Deadlift (Barbell)": R("Deadlift", "Hip hinge", ["glutes", "hamstrings"], ["back"], "external"),
  "Hip Thrust (Barbell)": R("Hip thrust", "Hip extension / abduction", ["glutes"], ["hamstrings"], "external"),
  "Standing Calf Raise": R("Calf raise", "Calf", ["calves"], [], "unknown", "may be bodyweight or machine"),
  "Calf Press (Machine)": R("Calf raise", "Calf", ["calves"], [], "external"),
  "Sit Up": R("Sit-up / crunch", "Core (flexion)", ["core"], [], "bodyweight"),
  "Crunch": R("Sit-up / crunch", "Core (flexion)", ["core"], [], "bodyweight"),
  "Leg Raise Parallel Bars": R("Leg raise", "Core (flexion)", ["core"], [], "bodyweight", "hip-flexor involvement not counted"),
  "Lying Leg Raise": R("Leg raise", "Core (flexion)", ["core"], [], "bodyweight", "hip-flexor involvement not counted"),
  "Torso Rotation": R("Torso rotation", "Core (rotation)", ["core"], [], "external"),
  "Plank": R("Plank", "Core (anti-movement)", ["core"], [], "hold"),
  "Jumping Jack": R("Cardio", "Cardio", [], [], "cardio"),
  "Elliptical Trainer": R("Cardio", "Cardio", [], [], "cardio"),
  "Walking": R("Cardio", "Cardio", [], [], "cardio"),
  "Cycling": R("Cardio", "Cardio", [], [], "cardio"),
  "Treadmill": R("Cardio", "Cardio", [], [], "cardio"),
};

// Fallbacks for titles not in the registry: pattern + muscles by keyword, then load semantics by equipment.
const KEYWORDS = [
  [/treadmill|walking|running|\brun\b|cycling|bike|elliptical|jumping jack|stair|rowing machine|jump rope|swim|hiit|sprint|burpee|ski ?erg|sled/, "Cardio", [], []],
  [/plank|dead ?bug|pallof|hollow|ab wheel|rollout|bird ?dog|wall sit/, "Core (anti-movement)", ["core"], []],
  [/crunch|sit ?-?up|leg raise|knee raise|toes to bar|v-?up|flutter/, "Core (flexion)", ["core"], []],
  [/russian twist|torso rotation|wood ?chop|oblique|side bend/, "Core (rotation)", ["core"], []],
  [/tricep|skull ?crusher|pushdown|push down|french press|kickback(?!.*glute)/, "Elbow extension", ["triceps"], []],
  [/leg curl|hamstring curl|nordic/, "Knee flexion", ["hamstrings"], []],
  [/curl|bicep|preacher|hammer/, "Elbow flexion", ["biceps"], []],
  [/lateral raise|side raise|upright row|y ?-?raise/, "Shoulder isolation", ["sideDelt"], []],
  [/front raise/, "Shoulder isolation", ["frontDelt"], []],
  [/face pull|rear delt|reverse fly/, "Horizontal pull", ["rearDelt"], ["traps"]],
  [/pull ?-?up|chin ?-?up|pulldown|pull down|pullover|straight arm/, "Vertical pull", ["back"], ["biceps"]],
  [/\brows?\b/, "Horizontal pull", ["back"], ["biceps"]],
  [/shrug/, "Shrug", ["traps"], []],
  [/romanian|\brdl\b|stiff ?leg|good morning|deadlift|rack pull/, "Hip hinge", ["hamstrings", "glutes"], []],
  [/back extension|hyperextension/, "Hip hinge", ["glutes"], ["hamstrings"]],
  [/hip thrust|glute|abduct/, "Hip extension / abduction", ["glutes"], []],
  [/leg extension/, "Knee extension", ["quads"], []],
  [/calf/, "Calf", ["calves"], []],
  [/split squat|lunge|step ?-?up|pistol/, "Lunge", ["quads"], ["glutes"]],
  [/squat|leg press|hack/, "Squat", ["quads"], ["glutes"]],
  [/shoulder press|overhead press|military|arnold|push press|landmine press/, "Vertical push", ["frontDelt", "sideDelt"], ["triceps"]],
  [/\bdips?\b/, "Dip", ["chest"], ["triceps"]],
  [/\bfly\b|flye|pec deck|crossover|cable cross/, "Chest fly", ["chest"], []],
  [/bench|chest press|push ?-?up|floor press|incline press|decline press/, "Horizontal push", ["chest"], ["triceps", "frontDelt"]],
  [/wrist|farmer/, "Other", ["forearms"], []],
];
const BODYWEIGHT_NAMES = /^(push ?-?up|pull ?-?up|chin ?-?up|dips?|sit ?-?up|crunch|burpee|pistol squat|air squat|squat \(bodyweight\)|lunge \(bodyweight\))/;
const EQUIPMENT = [["Machine", /\(machine|machine\)|smith/i], ["Cable", /cable|rope/i], ["Dumbbell", /dumbbell/i], ["Barbell", /barbell/i],
  ["Kettlebell", /kettlebell/i], ["Band", /\bband/i], ["Assisted", /assisted/i], ["Bodyweight", /bodyweight/i]];

export function equipmentOf(title) { const e = EQUIPMENT.find(([, re]) => re.test(title)); return e ? e[0] : "Unspecified"; }

/* classify(title) → { direct, secondary, muscles, pattern, family, load, equipment, cardio, mapped, source, note } */
export function classify(title) {
  const r = REGISTRY[title.trim()];
  const equipment = equipmentOf(title);
  if (r) return { ...r, muscles: [...r.direct, ...r.secondary], equipment, cardio: r.load === "cardio", mapped: true, source: "registry" };
  const low = title.toLowerCase();
  const k = KEYWORDS.find(([re]) => re.test(low));
  const pattern = k ? k[1] : "Other", direct = k ? k[2] : [], secondary = k ? k[3] : [];
  const cardio = pattern === "Cardio";
  const load = cardio ? "cardio" : /assist/i.test(title) ? "assisted" : pattern === "Core (anti-movement)" && /plank|hold|wall sit/.test(low) ? "hold"
    : BODYWEIGHT_NAMES.test(low) || equipment === "Bodyweight" ? "bodyweight" : equipment !== "Unspecified" ? "external" : "unknown";
  return { family: k ? pattern : title, pattern, direct, secondary, muscles: [...direct, ...secondary], load, equipment, cardio,
    mapped: cardio || direct.length > 0, source: k ? "keyword" : "none" };
}

// A correction from the data review: "cardio", or [direct, secondary?]
export function corrected(title, o) {
  const base = classify(title);
  if (o === "cardio") return { ...base, direct: [], secondary: [], muscles: [], cardio: true, load: "cardio", pattern: "Cardio", mapped: true, corrected: true };
  const [d, s] = o;
  return { ...base, direct: [d], secondary: s && s !== d ? [s] : [], muscles: [d, ...(s && s !== d ? [s] : [])], cardio: false,
    load: base.load === "cardio" ? "unknown" : base.load, mapped: true, corrected: true };
}

// Muscle credit pairs for one set: direct 1, secondary ½ (a muscle listed in both counts once, as direct).
export function credits(c) {
  const out = c.direct.map(m => [m, 1]);
  for (const m of c.secondary) if (!c.direct.includes(m)) out.push([m, 0.5]);
  return out;
}
export const registryTitles = () => Object.keys(REGISTRY);
