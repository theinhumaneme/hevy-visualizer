# Hevy Visualizer

**Webpage:** [https://hevy-visualizer.pages.dev/](https://hevy-visualizer.pages.dev/)

**Detailed documentation:** [Project guide](docs/PROJECT_GUIDE.md) — usage, CSV formats, metric definitions, privacy, architecture, setup, testing, deployment and troubleshooting.

A stateless analyzer for [Hevy](https://hevy.com) exports. Drop your **workouts** CSV (and optionally your **measurements** CSV) and get:

- **Story**: a scroll-driven story of your training. It covers your total lifted, a calendar heatmap, when you train, a body map of sets per muscle, your main lifts, records, rep style, efficiency, body weight for context and insights.
- **Recap**: all time, last year, last 3 months, last month, this month or a custom range. Each recap shows numbers compared with the previous period, highlights and records.
- **Overview, Exercises, Records, History, Analysis**: the original dashboard. It has the weekly charts, the muscle "plates", a progress chart for each exercise, sortable record tables, searchable workout history, and the Analysis tab (training blocks, balance, progression, body-weight trends).
- **Compare**: two modes.
  - **Workouts** puts any two sessions side by side, exercise by exercise.
  - **Exercises** overlays up to four lifts, shown as % change or in raw values, with a trend per month for each.

A date-range picker (presets or custom dates) filters Story, Compare, Overview, Exercises, Records and History. Analysis defaults to full history and can switch to the selected range; Recap has its own period picker. The lb/kg switch applies everywhere.

**Your exports are never uploaded.** Files and data-review corrections are kept in browser memory only, so reloading or closing the tab clears them. `localStorage` holds display preferences (motion, ambient background and units) and your weekly workout target. The page loads Google Fonts; see the [privacy details](docs/PROJECT_GUIDE.md#privacy-and-storage).

## Develop

Use a Node.js version supported by Vite 7 (`20.19+` in the Node 20 series, or `22.12+` and later) and npm.

```bash
npm install
```

```bash
npm run dev
```

The app is React + Vite, with D3 and GSAP for the story and Chart.js for the dashboard tabs (loaded only when you open one).

- `src/lib/derive.js` is the single data layer. It parses, cleans, and runs `prepare()` (full history and records) and `deriveMetrics()` (any date range).
- `src/story/buildStory.js` builds and animates the story scenes.
- `src/dashboard/` is the ported dashboard.

```bash
npm test
```

This builds the app, serves `dist/` and runs Playwright end to end. It covers file validation, exact totals, date ranges, every recap period, both compare modes, every dashboard tab, motion on and off, and the mobile layout. Screenshots go to `tests/screenshots/`.

## Deploy (Cloudflare Pages)

It's a static site: no Functions, no D1, no bindings.

```bash
npx wrangler login
```

```bash
npm run deploy
```

For Git-based deploys in the Cloudflare dashboard, use build command `npm run build` and output directory `dist`. `public/_headers` sets security headers and long-term caching for hashed assets.
