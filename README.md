# Solas

**The better walk is worth seeing.** Solas compares walking routes in a small part of Cork City
(University College Cork ↔ Parnell Place Bus Station) and shows the trade-off between the fastest
walk and alternatives that are better lit, easier underfoot or step-free, with honest evidence about
what the map data does and does not know.

Solas does **not** promise a "safe" route or a certified accessible route. It reports what
OpenStreetMap contributors have mapped, and says clearly where data is missing.

- Live site: https://syedanaus.github.io/Solas/
- Status: Phases 1–2 done (map, real OSM walking graph, fastest route). See [docs/PLAN.md](docs/PLAN.md).

## Try it

1. Open https://syedanaus.github.io/Solas/ (or `npm run dev`).
2. Press **Try UCC → Parnell Place**, or pick a start and destination from the verified places,
   or tap the map inside the dashed outline. The location button asks for permission first.
3. The route card shows estimated time, distance and the lighting evidence along the route.
4. Links are shareable: `https://syedanaus.github.io/Solas/#from=ucc-quad&to=parnell-place`.

Current result for that demo (real OSM data, 7 Nov 2026): **about 29 min, 2.2 km**, of which
about 30% is mapped lit, 30% likely lit (near mapped lamps), under 5% mapped unlit and 40% has no
lighting information.

## How it works

- A fully static React + TypeScript app built with Vite and hosted on GitHub Pages. There is no
  server, database, login or API key.
- The map uses [MapLibre GL JS](https://maplibre.org/) with keyless
  [OpenFreeMap](https://openfreemap.org/) styles (tiles are hosted by OpenFreeMap). If a style can't
  be loaded, Solas tries another, then falls back to a built-in style that shows only its own
  walking network.
- The walking network is prepared offline from OpenStreetMap by a Python script and committed as
  static JSON (`public/data/cork/`). Routes are computed in the browser.

### Routing

- **Graph.** Each OSM path stretch between junctions is a *segment* with its real geometry,
  length, OSM way ids and tags. Each walkable direction becomes a directed edge, stored in a
  compact adjacency array.
- **Snapping.** A tapped point is matched to the nearest point on a walkable segment using a grid
  index. Points outside the coverage area, or more than 75 m from any walkway, are refused with an
  explanation rather than guessed.
- **Search.** A* with a straight-line heuristic (Dijkstra when the heuristic is off). Routes start
  and end part-way along segments, so the drawn line begins exactly at the chosen point. Costs must
  be finite and non-negative; hard exclusions (for example, steps in step-free mode) are infinite
  cost, never a small penalty. If no path exists, Solas says so and draws nothing.
- **Metrics.** Distance, time (at 1.3 m/s ≈ 4.7 km/h, shown as an estimate) and lighting shares
  are computed from the same pieces of segment that make up the drawn line. Percentages are
  distance-weighted and rounded to 5 points with a method that keeps the total at 100; a small
  non-zero share shows as "<5%", never "0%".
- **Indoor passages** (`highway=corridor`, `indoor=yes`) are avoided by default, because building
  opening hours are rarely mapped.
- All tunable numbers are in [`src/config/routing.ts`](src/config/routing.ts).

## Regenerating the Cork data

Only needed to refresh the data or change the area. Requires Python 3.12 and internet access.

```bash
uv venv .venv --python 3.12                     # or: python -m venv .venv
uv pip install --python .venv/Scripts/python.exe -r scripts/requirements.txt   # Windows path
.venv/Scripts/python.exe scripts/prepare_cork_data.py            # add --refresh to bypass the cache
```

On macOS/Linux use `.venv/bin/python`. The script retries politely when the public Overpass
server is busy. It writes `public/data/cork/graph.json`, `public/data/cork/manifest.json` and
`docs/DATASET_REPORT.md`. If downloads fail it writes nothing and exits with an error; the app then
shows a "data unavailable" state. Synthetic graphs exist only as test fixtures in `tests/fixtures/`
and are labelled synthetic. See [DATA_SOURCES.md](DATA_SOURCES.md) for sources and limitations.

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
