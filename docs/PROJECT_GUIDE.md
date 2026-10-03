# Training Story — Project Guide

Training Story is a static web application that turns Hevy workout CSV exports into training summaries, charts, comparisons and a scroll-driven story. The repository and Cloudflare Pages project are named `hevy-visualizer`.

**Live webpage:** [https://hevy-visualizer.pages.dev/](https://hevy-visualizer.pages.dev/)

This guide describes the implementation in this repository as of October 3, 2026. The production URL returned HTTP 200 when checked on that date. Local changes appear on the live webpage only after a deployment.

## Contents

- [Project scope](#project-scope)
- [Getting started](#getting-started)
- [Views and controls](#views-and-controls)
- [CSV formats and import behavior](#csv-formats-and-import-behavior)
- [Metric definitions and calculation rules](#metric-definitions-and-calculation-rules)
- [Data review and corrections](#data-review-and-corrections)
- [Privacy and storage](#privacy-and-storage)
- [Architecture and repository map](#architecture-and-repository-map)
- [Local development](#local-development)
- [Testing and verification](#testing-and-verification)
- [Deployment and hosting](#deployment-and-hosting)
- [Troubleshooting](#troubleshooting)
- [Maintenance checklist](#maintenance-checklist)

## Project scope

- Analyze an imported workout history without an account or a server-side data store.
- Optionally add a measurements export for observed body weight and strength relative to body weight.
- Explore consistency, workload, muscle assignments, exercise progression and personal records.
- Compare two workouts or up to four exercises.
- Review import issues and apply temporary corrections within the loaded tab.
- Try generated sample workouts without providing an export.

The application has no backend, database, Hevy API integration or synchronization service. It analyzes the history supplied by the user. Missing entries, changes in logging habits and incomplete exports affect the conclusions. Metrics describe logged training; they do not establish effort, recovery, workout quality or the cause of a trend.

## Getting started

1. Open the [live webpage](https://hevy-visualizer.pages.dev/).
2. Obtain a workout export from Hevy. The app's export instructions point to **Profile → Settings → Export & import data → Export workouts**.
3. Optionally obtain an **Export measurements** CSV for body-weight context.
4. Drop the CSV files onto the landing page, or select **choose files**. You can select both files together.
5. Open **Overview** for the training summary, or scroll through **Story** for highlights.
6. Choose a date range and weight unit. Open **Files & settings → Review imported data** to inspect exclusions and exercise mappings.

You can also select **Try it with sample data**. Sample workouts are generated locally and identified as example data in the interface.

A workouts export is required to start. Measurements alone do not open the dashboard. Keep the original exports: refreshing or closing the page clears the loaded data and corrections.

## Views and controls

### Available views

| View | Purpose and interactions |
| --- | --- |
| Story | Scroll through total lifted, training calendar, weekly rhythm, muscle coverage, major lifts, records, rep ranges, volume per minute, body weight where available, insights and calculation explanations. |
| Recap | See totals, records and highlights for a chosen period, with changes against a previous period when available. Recap has its own period picker. |
| Overview | Explore weekly training charts, exercise and muscle summaries, data coverage, consistency, spacing and rolling workload. Select a top exercise to open its progress. |
| Exercises | Select one exercise and inspect its recorded sets, load, reps and comparable progression. Includes load–rep comparisons and matched-load or matched-set views where data supports them. |
| Records | Review new records and best logged performances. Exercise names open their progress; loaded-exercise column headings support sorting. |
| History | Search by workout or exercise name, then open a workout to inspect its exercises and sets. |
| Analysis | Explore muscle dose, movement patterns, body-weight observations, training blocks, balance and progression. Defaults to full history. |
| Compare | Compare two workouts exercise by exercise, or overlay up to four exercise trends. |

### Date ranges

The main picker controls Story, Compare, Overview, Exercises, Records and History. Analysis uses full history by default; after choosing a range in the top bar, select **Selected range** in Analysis to apply it there. Recap's period is independent of the main picker.

| Preset | Meaning |
| --- | --- |
| All time | All retained imported workouts. Calendar summaries extend through today. |
| Last year | The previous calendar year, January 1 through December 31. |
| Last 3 months | A rolling range ending today, beginning one day after the corresponding date three calendar months earlier. |
| Last month | The previous calendar month. |
| This month | The first of the current month through today. |
| Custom | User-entered start and end dates; reversed dates are swapped, and blank endpoints leave that side open. |

Workouts are selected by their start time. Both date endpoints are intended to include the selected calendar day. Date parsing and calendar grouping use the browser's local time; the app does not infer a workout's original time zone.

Recap compares complete calendar periods against preceding calendar periods. A month in progress compares the same elapsed days of the prior month, capped at that month's final day. Other bounded ranges compare the immediately preceding window of the same length. All time has no preceding range.

### Units, navigation and accessibility

- **lb / kg** converts loaded weights and body-weight displays throughout the app. Imported distance units are retained separately.
- **Files & settings** provides file replacement, data review, clearing loaded data, reduced motion and ambient-background controls.
- **Help** contains getting-started instructions, definitions and links to calculation explanations.
- The operating system's reduced-motion preference applies until the user explicitly chooses a motion preference in the app.
- On narrower screens, view navigation moves to a horizontally scrollable bottom bar.
- Chart details support hover, touch or keyboard focus where implemented. Escape dismisses chart details and dialogs; dialogs manage focus.
- URL hashes such as `#overview` and `#compare` select a view. Sharing a URL does not share the imported history.

### Comparison behavior

Workout comparison can suggest the closest earlier qualifying workout by exercise overlap. Similarity is shared exercises divided by the union of exercises; ties favor the same workout title, then the more recent candidate.

Exercise comparison supports top set, estimated one-rep max, session volume, reps per session and weekly sets. You can view raw values or percentage change from the first observation in the selected range. For top-set assistance, less assistance counts as improvement. Trend rates use a least-squares slope per 30 days and require at least three points with a usable time span. Raw comparisons may involve different units, so check each series' labels.

## CSV formats and import behavior

Files are recognized from their columns, not their filenames. A file named `workouts.csv` is not accepted merely because of its name.

### Workout CSV

Each row represents one set. After header normalization, the parser requires `title`, `start_time` and `exercise_title`. Workout-file detection looks for `exercise_title` and `start_time` before that validation.

| Column | Use |
| --- | --- |
| `title` | Workout name; combined with the original start-time string to identify a session. |
| `start_time` | Required for each retained row; supplies the workout date and time. |
| `exercise_title` | Required for each retained row; exercise classification and grouping. |
| `end_time` | Session duration, when readable and eligible. |
| `set_index` | Set order within an exercise; zero is a valid index. |
| `set_type` | Defaults to `normal`; `warmup` is excluded from working sets. |
| `weight_lbs` or `weight_kg` | Logged external load or machine assistance, interpreted through exercise classification. If both columns exist, kg is selected. |
| `reps` | Rep counts, volume and performance comparisons. |
| `duration_seconds` | Timed exercises and cardio duration. |
| `distance_miles` or `distance_km` | Imported distance; km is selected if present. |
| `rpe` | Recorded perceived exertion where populated. |
| `superset_id` | Superset metadata; zero is retained as a valid identifier. |
| `description` | Workout notes. |
| `exercise_notes` | Exercise notes. |

Minimal illustrative workout CSV:

```csv
title,start_time,end_time,exercise_title,set_index,set_type,weight_lbs,reps
Push,"1 Oct 2026, 18:00","1 Oct 2026, 19:00",Bench Press (Barbell),0,normal,100,8
Push,"1 Oct 2026, 18:00","1 Oct 2026, 19:00",Bench Press (Barbell),1,normal,100,8
Push,"1 Oct 2026, 18:00","1 Oct 2026, 19:00",Bench Press (Barbell),2,normal,100,6
Push,"1 Oct 2026, 18:00","1 Oct 2026, 19:00",Push Up,0,normal,,15
```

This example contains four working sets, so the workout qualifies as a session. Its external-load volume is `100 × (8 + 8 + 6) = 2,200 lb`; the push-ups contribute reps and sets, but no external-load volume.

### Measurements CSV

A measurements file must have `date` and at least one recognized measurement column: `weight_lbs`, `weight_kg`, `fat_percent`, or a column ending in `_cm` or `_in`.

```csv
date,weight_lbs,fat_percent
2026-10-01,180,
2026-10-03,179.5,
```

Positive body weights are converted to canonical pounds internally. Other numeric measurement fields are retained, but the main body-weight analytics require populated weight values. Entries with unreadable dates or no usable measurements are skipped; a measurements export with no readable entries is rejected.

### Normalization and replacement

- PapaParse reads headers and skips empty lines. Byte-order marks are removed and CRLF/CR line endings are normalized.
- Header case is lowered; whitespace and hyphens become underscores. Supported aliases include `exercise_name → exercise_title`, `start_date → start_time`, `set_number → set_index` and `Weight (kg) → weight_kg`. This is a defined alias list, not general translation support.
- Date parsing explicitly supports English month-name exports such as `28 Sep 2026, 18:30` and `Oct 1, 2026, 8:28 PM`, then falls back to JavaScript date parsing. Prefer the original export over manually reformatted dates.
- A new workout file **replaces** loaded workout history; files are not merged. It resets the main date range and data-review corrections.
- Existing measurements remain when a new workout file is loaded. A new measurements file replaces the previous measurements.
- If several accepted files of the same kind are selected together, the last successfully read file of that kind wins.
- Files can be dropped anywhere in the app. One invalid file does not prevent another valid selected file from being processed; errors appear in a banner.

## Metric definitions and calculation rules

The source of truth is the calculation code, principally `src/lib/derive.js`, `exerciseRegistry.js`, `progression.js`, `workload.js` and `bodyWeight.js`. Thresholds below are application choices.

### Rows, workouts and working sets

- **Retained set:** a row remaining after parsing, deduplication and user session exclusions.
- **Working set:** a retained set whose type is not `warmup` and whose exercise is not classified as cardio. The definition does not imply a measured effort level.
- **Logged workout:** retained rows grouped by the original `start_time` string plus workout `title`.
- **Qualifying session:** a workout with at least **four working sets**.
- **Short workout / fragment:** fewer than four working sets. Its working sets, reps and external-load volume remain in totals, but it does not count as a qualifying session.
- **Training day:** a day with a retained workout entry; several workouts on one day count as one day.

Rows with missing start time or exercise, unreadable dates, or duplicate keys are dropped. The duplicate key combines original start time, workout title, exercise title, set index, weight, reps and duration seconds; it is not a comparison of every CSV column.

Weights above **1,000 lb** or **450 kg** are flagged and set to unknown. The row and its reps can remain; the weight no longer contributes to external-load volume. These upper bounds are sanity checks, not comprehensive validation of every numeric field.

### Load semantics, volume and top sets

| Exercise/set kind | Performance interpretation | External-load volume |
| --- | --- | --- |
| Loaded | Positive external weight and reps on a working set. Top set is the heaviest set, with more reps breaking a tie. | `weight × reps` |
| Assisted | Logged weight is machine assistance. The top set has the least assistance, with more reps breaking a tie. | Excluded |
| Bodyweight | No positive external load, positive reps, and an exercise classified as bodyweight. Performance uses reps. | Excluded |
| Unknown load | Positive reps without a positive weight on an externally loaded or ambiguous exercise. Does not become bodyweight automatically. | Excluded |
| Timed hold | A working set with a positive duration and no positive reps. | Excluded |
| Warm-up or cardio | Retained for appropriate context, excluded from working-set resistance metrics. | Excluded |

**Weight lifted / tonnage** is the sum of externally loaded working-set volume. It uses the logged weight without automatically doubling dumbbell loads, adding body mass, or estimating mechanical work.

Unit conversion uses exactly `1 lb = 0.45359237 kg`. Values are converted before derivation at full precision; display rounding happens later.

### Estimated one-rep max and records

For a loaded set of more than one rep, Epley's estimate is:

```text
estimated 1RM = weight × (1 + reps / 30)
```

A single-rep set uses its recorded weight directly. Estimates from **11 or more reps** are marked low confidence. Exercise-session summaries prefer estimates from sets of ten or fewer reps and use a flagged fallback only when none exist.

Records are evaluated chronologically against the entire retained imported history before the chosen range is applied. The first session of an exercise's performance kind establishes a baseline and is not a record. Excluding a session recomputes those baselines.

- Loaded exercises can establish a heavier-weight record, more reps at an exact weight, a reliable estimated-1RM record or a session-volume record.
- Estimated-1RM records require a non-low-confidence estimate. The record selector prioritizes weight, then estimated 1RM, then volume; rep records at specific loads can also be emitted.
- Assisted exercises can establish a lower-assistance record.
- Bodyweight exercises can establish a most-reps record.
- An exercise's main performance kind is the most common measurable session kind; ties favor loaded, then assisted, then bodyweight. Main progression histories compare sessions of the matching kind.

Record totals count record events, so one workout can contribute more than one. An exported history is the comparison boundary: importing only recent workouts cannot recover earlier records.

### Consistency, workload and muscle credits

- Calendar weeks begin on **Monday**. Weeks with no logged qualifying sessions remain in calendar summaries.
- The default weekly target is the floor of the median qualifying-session count in active weeks, with a minimum of one. A chosen target is saved on the device and used across the relevant views.
- Weekly streaks count consecutive weeks meeting the target. An unfinished current week that has not yet met it does not break the current streak.
- Frequency panels distinguish calendar weeks, active weeks and weeks covered by training blocks. Partial weeks at range boundaries count as weeks.
- A gap of **14 days or more** between retained workouts starts a new training block.
- Rolling workload sums qualifying sessions and working sets over trailing **7-day** and **28-day** windows.
- Muscle assignments come from exact exercise mappings, keyword fallbacks and optional user corrections.
- Each working set earns **1.0 direct-muscle credit** and **0.5 secondary-muscle credit** per assigned muscle. Credits across muscles may exceed the number of unique working sets.
- Story's recent muscle summary uses an up-to-eight-week window near the end of observed training within the view. Its training-rhythm window uses the latest up to **26 weeks** relative to the last workout. The interface exposes the applicable periods.
- The displayed 10–20 weekly muscle-set band is a soft contextual guide; it is not an individualized target.

### Duration and comparable progression

Session duration is derived from the first retained row's start and end timestamps. Durations outside **15–240 minutes**, or missing end times, are excluded from duration-based summaries. Their sets and volume remain.

The total-duration metric uses qualifying sessions with valid durations. Volume per minute additionally requires positive external-load volume:

```text
volume per minute = external-load workout volume / eligible duration in minutes
```

The Exercises progression explorer offers more controlled comparisons:

- **Load–rep frontier:** sets that are not outperformed in both load and reps by another set; less assistance is the favorable load direction for assisted exercises.
- **Load at a rep target:** best load in each session among sets reaching at least the selected reps; actual achieved reps remain visible. Suggested rep targets require at least three qualifying observations from distinct exercise sessions.
- **Reps at a fixed load:** best reps, total reps and set count at a load used in at least two sessions.
- **Matched set count:** total reps from the first selected number of sets at an exact load, only in sessions with enough matching sets.
- **Comparable trend:** the latest run of comparable points separated by gaps under 14 days, with at least four points spanning at least 21 days. First and recent windows are disjoint thirds of the points; rates use least-squares regression.

The general progression summary in Analysis uses a separate recent-window detector: up to 12 weeks, at least four sessions and at least six weeks of span. It compares the earlier and later halves of the observations. At least 2% improvement in top load or reliable estimated 1RM, or any increase in best reps at a load used in both halves, produces a progressing label; otherwise it reports steady.

### Body weight and relative strength

Body-weight analytics distinguish observed measurements from inferred matches:

1. Multiple weigh-ins on the same calendar day are averaged into one daily observation; the original values remain available in the model.
2. A workout uses a same-day observation when available.
3. Otherwise it uses the nearest observation within **seven days**; an equally distant earlier observation wins.
4. Otherwise the matcher permits interpolation between bracketing observations no more than **14 days** apart.
5. Otherwise the workout has no matched body weight, with a reason. Distant endpoints are never carried forward indefinitely.

Because the seven-day nearest rule runs first, it usually covers any day inside a bracket of 14 days or less under the default thresholds. The interpolation branch matters if those thresholds change.

- Trailing means use actual observed weigh-ins within their calendar window and require at least **three observed days**.
- Body-weight slope requires at least **three weigh-in dates over 14 or more days**. It reports a fitted change per week.
- Gaps longer than 14 days separate covered measurement stretches.
- Recap's body-weight change compares mean observed weights in the first and last 14-day windows, with at least two observations in each and nonoverlapping observation groups.
- Relative load uses `logged load / eligible matched body weight`.
- Assisted effective-load context uses `body weight − assistance`, with a corresponding fraction of body weight. This is a proxy based on the logged machine setting.

Sparse observations yield an unavailable value and explanation. A dash is not zero, and observations absent from a week are not invented measurements.

## Data review and corrections

Open **Files & settings → Review imported data** to inspect:

- Imported rows, columns and populated fields.
- Parsing errors, dropped rows and ignored implausible weights, with CSV line numbers where available.
- The reconciliation from imported rows to working sets and qualifying sessions.
- Missing or unusual workout durations and short workout flags.
- Exercise muscle assignments, classification sources and unmapped exercises.

You can uncheck a workout to exclude its entire session, assign a primary and optional secondary muscle, or classify an exercise as cardio. Corrections update the common calculation model and all views. Excluded workouts can be checked again; individual mappings and all corrections can be reset.

Corrections do not modify the original CSV and are not persisted. A new workout import or a page reload discards them. Use the original export or a separately saved corrected copy if a change must survive future imports.

## Privacy and storage

Workout and measurements files are read with the browser File API and parsed in the tab. The application contains no upload endpoint, account system or server-side workout store. Imported histories, measurement entries, session exclusions and muscle corrections live in memory.

The following small preferences are stored in `localStorage` on the current origin:

| Key | Stored value |
| --- | --- |
| `story:unit` | Preferred weight unit. |
| `story:motion` | Explicit full/reduced-motion preference. |
| `story:ambient` | Whether the ambient background is paused. |
| `story:target` | Chosen weekly workout target. |

Reloading or closing a tab clears imported data; **Clear loaded data** immediately returns to the landing page. Preferences survive these actions. Clearing the site's browser storage removes saved preferences.

The webpage still makes ordinary requests for HTML, JavaScript, CSS and icons. `index.html` also loads Archivo, Inter and JetBrains Mono from Google Fonts, using `fonts.googleapis.com` and `fonts.gstatic.com`. These font requests do not contain imported CSV contents. The app has font fallbacks, and browser tests deliberately block external requests. Cloudflare serves the static site and can process ordinary request metadata according to its service configuration.

The files under `data/` are local test inputs, not runtime sample data. Vite's deployed output consists of built application assets and files under `public/`; the current app does not reference `data/` as public assets. Review local CSV contents before committing or distributing the repository.

## Architecture and repository map

### Technology stack

| Dependency | Responsibility |
| --- | --- |
| React 19 / React DOM | App state, controls, dialogs and panels. |
| Vite 7 / React Vite plugin | Development server and static production build. |
| PapaParse 5 | CSV parsing and header handling. |
| D3 7 | Story and analytical SVG charts. |
| GSAP 3 | Motion and scroll-driven scenes. |
| Chart.js 4 | Existing dashboard chart renderer, loaded through the lazy dashboard module. |
| Playwright | Chromium end-to-end verification. |
| Wrangler 4 | Cloudflare Pages deployment tooling. |

`package.json` defines allowed version ranges; `package-lock.json` records exact resolved versions.

### Data flow

```text
Chosen or dropped CSV files
  → readExports / PapaParse / header normalization
  → parseRows or parseMeasurements
  → inUnit (display-unit conversion)
  → prepare (classification, corrections, sessions, history and records)
  → deriveMetrics (selected period, target and body-weight context)
  → React panels, D3 story/charts and dashboard renderer
```

The prepared history remains available for chronological records and comparisons. Range metrics supply the current view. Recap derives its own period, and Analysis can derive full-history metrics independently of the main picker.

### Important files

| Path | Responsibility |
| --- | --- |
| `src/main.jsx` | React application entry point. |
| `src/App.jsx` | Imported data, tabs, ranges, units, preferences and correction state. |
| `src/lib/csv.js` | File recognition and asynchronous import orchestration. |
| `src/lib/derive.js` | Parsing, normalization, preparation, records and shared range metrics. |
| `src/lib/exerciseRegistry.js` | Exercise-to-muscle mapping, patterns, equipment and load semantics. |
| `src/lib/dataQuality.js` | Coverage, reconciliation, duration quality, freshness and join reports. |
| `src/lib/progression.js` | Comparable sets, frontiers, matched-load trends and workout similarity. |
| `src/lib/workload.js` | Calendar summaries, consistency, rolling workload and muscle dose. |
| `src/lib/bodyWeight.js` | Observation aggregation, matching, coverage, smoothing and trends. |
| `src/lib/ranges.js` | Presets, custom dates and prior-period resolution. |
| `src/lib/glossary.js` | Shared metric definitions. |
| `src/lib/synthetic.js` | Generated sample workouts. |
| `src/lib/motion.js`, `tokens.js`, `tip.js`, `useDialog.js` | Motion, chart tokens, chart details and focus/dialog helpers. |
| `src/components/` | Landing, navigation, Story, Recap, Compare, Help, Data Review and analytical panels. |
| `src/story/buildStory.js` | Imperative story scene rendering and animation. |
| `src/dashboard/legacy.js`, `analysis.js` | Existing dashboard and analysis rendering. |
| `src/styles.css` | Visual styling and responsive layouts. |
| `index.html` | Page metadata, font requests and app mount point. |
| `public/` | Icons, web manifest and Cloudflare `_headers`. |
| `tests/unit.mjs` | Hand-computed calculation checks. |
| `tests/run.mjs` | End-to-end browser checks against the production build. |
| `tests/fixtures/` | Small deterministic CSV fixtures, including malformed-input cases. |
| `data/` | Local workout and measurement inputs used by browser tests. |
| `vite.config.js` | Build output and dev-server configuration. |
| `wrangler.jsonc` | Cloudflare Pages project and output directory. |

The pure calculation modules can run in Node without a browser DOM. React owns the dashboard wrapper and newer panels; imperative renderers own their designated chart containers.

## Local development

### Requirements

- Node.js compatible with Vite 7: **Node 20.19+ within the Node 20 series, or Node 22.12+ and later**. Prefer an actively supported Node LTS satisfying that constraint.
- npm.
- A modern browser with the File API, JavaScript and SVG support.
- Playwright's Chromium installation for the full browser suite.
- Cloudflare authentication and Pages access only when deploying.

The application does not require runtime environment variables, API keys or a backend configuration.

### Install and start

From the repository root, install the locked dependencies:

```bash
npm ci
```

Use `npm install` instead when intentionally updating dependencies or creating a new lockfile.

```bash
npm run dev
```

Vite is configured to start on port **5173**; use the URL printed in the terminal because it can choose another port if that port is busy.

### Build and preview

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. Preview uses [http://localhost:4173](http://localhost:4173) with a strict port: it fails if 4173 is already occupied. Production source maps are disabled.

### npm scripts

| Command | Behavior |
| --- | --- |
| `npm run dev` | Start Vite development server. |
| `npm run build` | Generate production assets in `dist/`. |
| `npm run preview` | Serve an existing production build on port 4173. |
| `npm test` | Run unit checks, build, then run browser checks. |
| `npm run deploy` | Build, then deploy `dist/` with Wrangler Pages. |

## Testing and verification

Run the full existing verification workflow:

```bash
npm test
```

To run only the calculation suite:

```bash
node tests/unit.mjs
```

If Chromium is missing:

```bash
npx playwright install chromium
```

The browser suite reads `data/workouts.csv` and `data/measurements.csv` in addition to the checked-in test fixtures. Both local data files must exist with usable Hevy exports for the current suite. It starts its own Vite preview server on an available port and writes screenshots under `tests/screenshots/`, which is ignored by Git.

Coverage includes:

- Independent hand-computed totals, records, corrections and unit conversions.
- Header aliases, duplicate rows, implausible loads and blank-load semantics.
- Comparable progression, muscle credits, eligible body-weight joins and range boundaries.
- Invalid file handling and absence of network writes during tested import flows.
- Story, all Recap presets, dashboard views and both comparison modes.
- Replacing exports, sample data, full-history versus selected-range Analysis.
- Data-review interactions, dialog focus and keyboard chart details.
- Reduced motion and layouts at 375px and 390px widths.

The browser suite blocks off-origin requests, including Google Fonts, to exercise fallback fonts. Automated checks cover specified flows rather than proving every browser, input format or accessibility requirement. After a meaningful UI change, inspect the relevant desktop and mobile views as well.

## Deployment and hosting

### Current configuration

- **Provider:** Cloudflare Pages.
- **Project:** `hevy-visualizer`.
- **Production webpage:** [https://hevy-visualizer.pages.dev/](https://hevy-visualizer.pages.dev/).
- **Build command:** `npm run build`.
- **Build output:** `dist`.
- **Wrangler compatibility date:** `2026-10-01`.
- **Runtime bindings:** none; there are no Pages Functions or database requirements.

### Deploy from the command line

Authenticate with an account that can access the Pages project:

```bash
npx wrangler login
```

Then build and upload:

```bash
npm run deploy
```

The script runs `npm run build && wrangler pages deploy dist`; `wrangler.jsonc` supplies the project configuration. Check Wrangler's final URL and whether the deployment is production or a branch preview. Publishing a preview does not necessarily update the stable production URL.

For an explicit production-branch deployment, use the production branch configured for the Pages project:

```bash
npm run build
npx wrangler pages deploy dist --project-name hevy-visualizer --branch YOUR_PRODUCTION_BRANCH
```

Replace `YOUR_PRODUCTION_BRANCH` with the actual configured branch. The repository currently has no configured Git remote, so a remote branch name should not be assumed.

### Git-based deployments

If the Pages project is configured for Git integration, use:

| Setting | Value |
| --- | --- |
| Root directory | Repository root, unless deliberately hosted in a monorepo. |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | A version satisfying the Vite requirement above. |
| Production branch | The branch actually configured in Cloudflare Pages. |

Git integration is a hosting option; the local files do not prove that it is already enabled. Static frontend hosting elsewhere is also possible by serving the contents of `dist/`.

### Headers and caching

`public/_headers` is copied into the build for Cloudflare Pages:

- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` disables camera, microphone and geolocation.
- `X-Frame-Options: DENY` prevents framing.
- `/assets/*` receives a one-year immutable cache policy, appropriate for Vite's hashed assets.

The file does not define a Content Security Policy. Other hosts must implement equivalent headers through their own configuration if they do not support Pages-style `_headers` files.

### After deployment

1. Open the production URL and confirm the intended build is visible.
2. Try sample data and open Story, Overview, Exercises and Compare.
3. Check a mobile width and reduced motion.
4. Confirm imported files still remain in the tab and only expected preference keys are stored.
5. Verify the static headers and asset loading. If a release is faulty, use the hosting provider's deployment history to restore a known working release.

## Troubleshooting

| Symptom | Likely cause and next step |
| --- | --- |
| File is rejected as non-Hevy | Confirm it is a CSV export rather than an HTML page or spreadsheet file. Check the normalized required columns. |
| Measurements alone do not load | Load the workout CSV first or select both files together. |
| New import seems to remove old workouts | Workout files replace history. Export the complete history you want to analyze. |
| Old body weight appears with a new history | Measurements intentionally remain after workout replacement. Load a new measurements CSV, or clear loaded data before starting over. |
| Session count is lower than workout count | Workouts under four working sets remain in totals but are excluded from qualifying-session counts. Review short-workout flags. |
| Lifted volume is lower than expected | Warm-ups, cardio, bodyweight and assistance do not contribute external-load volume. Blank or implausible weights do not count; excluded sessions and dropped rows also affect totals. |
| An exercise's muscle totals look wrong | Inspect its mapping in Data Review and correct the primary or secondary muscle. Custom names can miss exact mappings. |
| No estimated 1RM or progression trend | Check exercise kind, logged load/reps, confidence and the minimum count/span requirements. More history or a wider range may be needed. |
| No body-weight comparison or relative strength | Confirm positive weight measurements and eligible date matches. Sparse endpoint windows can prevent Recap change calculations. |
| Date range appears ignored in Analysis | Select **Selected range** in Analysis; it defaults to full history. |
| Recap uses a different period | Recap has an independent period picker. |
| Data or corrections disappear on refresh | This is the tab-memory design. Reload the CSV; corrections must be reapplied. |
| Settings do not persist | Browser storage may be blocked or cleared. The app catches storage errors so importing can still work. |
| Fonts differ or do not load | Google Fonts may be blocked or unavailable. Local fallback fonts remain usable. |
| Vite fails with a Node compatibility error | Install a Node version satisfying the documented engine range, then reinstall locked dependencies. |
| Preview reports port 4173 in use | Stop the conflicting process or run Vite preview with another explicit port. The npm preview script uses a strict port. |
| Browser tests cannot launch Chromium | Run `npx playwright install chromium`. |
| Tests report missing CSV files | Restore the two local `data/` exports required by `tests/run.mjs`. |
| Deployment fails to authenticate | Run Wrangler login and verify account access to the Pages project. |
| Live webpage does not show the latest change | Confirm the build succeeded and the upload targeted the configured production branch. Check the returned deployment URL. |

## Maintenance checklist

- Keep calculation changes in shared data modules and update the glossary and guide when definitions change.
- Preserve direction-aware assistance handling and the distinction between unknown load and bodyweight.
- Validate calculation changes against independent hand-computed examples; run the existing full suite for changes spanning views.
- Keep range boundaries, full-history record baselines and unit conversions consistent across the UI.
- Avoid persisting or transmitting imported workout and measurements data without an explicit change to the product's privacy behavior.
- Keep personal CSVs and credentials out of public assets and review test data before publishing source.
- Maintain the lockfile when changing dependencies and confirm Node compatibility after upgrades.
- Keep the README's production URL and this guide aligned with hosting and application changes.
