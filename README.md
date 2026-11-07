# Solas

**The better walk is worth seeing.** Solas compares walking routes in a small part of Cork City
(University College Cork ↔ Parnell Place Bus Station) and shows the trade-off between the fastest
walk and alternatives that are better lit, easier underfoot or step-free, with honest evidence about
what the map data does and does not know.

Solas does **not** promise a "safe" route or a certified accessible route. It reports what
OpenStreetMap contributors have mapped, and says clearly where data is missing.

- Live site: https://syedanaus.github.io/Solas/
- Status: in development (see [docs/PLAN.md](docs/PLAN.md) for phases)

## How it works

- A fully static React + TypeScript app built with Vite and hosted on GitHub Pages. There is no
  server, database, login or API key.
- The map uses [MapLibre GL JS](https://maplibre.org/) with keyless
  [OpenFreeMap](https://openfreemap.org/) styles (tiles are hosted by OpenFreeMap). If a style can't
  be loaded, Solas tries another, then falls back to a built-in style that shows only its own
  walking network.
- The walking network is prepared offline from OpenStreetMap by a Python script and committed as
  static JSON. Routes are computed in the browser.

## Requirements

- Node.js **24 LTS** (see `.nvmrc`; `^22.12` also works). Node 23 is end-of-life and some test
  dependencies warn on it.
- npm 10+.
- For regenerating map data only: Python 3.12 (see `scripts/requirements.txt`).

## Commands

```bash
npm ci                 # install exact locked dependencies
npm run dev            # dev server at http://localhost:5173/Solas/
npm run typecheck      # TypeScript, strict mode
npm run lint           # ESLint
npm test               # Vitest unit and component tests
npm run build          # production build into dist/ (also writes dist/404.html)
npm run check:dist     # verify base paths and scan dist/ for credential patterns
npm run preview        # serve dist/ at http://localhost:4173/Solas/
npm run check          # all of the above, in order
```

`.npmrc` sets `legacy-peer-deps=true` to avoid an npm crash ("Cannot read properties of null
(reading 'edgesOut')") while resolving Vitest 5's optional peers. Peers this project needs are
listed explicitly in `package.json`.

## Deploying to GitHub Pages

Deployment is automatic: `.github/workflows/deploy.yml` runs typecheck, lint, tests, build and the
`dist/` check on every push and pull request, and deploys `dist/` to GitHub Pages on pushes to
`main`.

One-time setup for a fork or a new repository:

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`. The site appears at `https://OWNER.github.io/REPOSITORY/`.

The Vite `base` is taken from the `BASE_PATH` environment variable, which the workflow sets to
`/<repository name>/`. Locally it defaults to `/Solas/`. All runtime files are loaded through
`import.meta.env.BASE_URL`, so nested asset paths work under the project URL.

## Licences and attribution

- Code: MIT (see [LICENSE](LICENSE)).
- Map data © OpenStreetMap contributors, available under the
  [Open Database License](https://www.openstreetmap.org/copyright). Derived walking-network data in
  `public/data/` is published under ODbL 1.0.
- Basemap: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap.

See [ATTRIBUTION.md](ATTRIBUTION.md).
