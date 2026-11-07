# Solas — execution plan

Solas compares walking routes in a small, validated part of Cork City. Everything runs in the
browser from static files on GitHub Pages. The walking graph is built offline from OpenStreetMap
by `scripts/prepare_cork_data.py` and committed as static JSON.

## Starting point (2026-11-07)

The repository had only `README.md` and `LICENSE` (MIT). No PRD file was present in the
workspace, so the requirements in the project brief are the source of truth.

## Phases

Numbering follows the project brief. Each phase leaves the app buildable, tested and deployed.

| Phase | Goal | Status |
| --- | --- | --- |
| 1 | App skeleton + map on GitHub Pages (Vite/React/TS, MapLibre + OpenFreeMap, CI deploy) | Done |
| 2 | Real OSM walking data for the UCC ↔ Parnell Place corridor (`prepare_cork_data.py`) | Done |
| 3 | Real fastest route: browser A*, snapping, map-tap and landmark endpoints | Done |
| 4 | Lighting evidence (4 classes with provenance) + better-lit alternative: candidate generation, detour cap, dedupe, 10-point threshold, side-by-side cards, evidence overlay | Done |
| 5 | Easier walking and step-free routes: hard exclusions, surface/smoothness preferences, unknown-data warnings, refined preferences | In progress |
| 6 | UI refinement, Playwright checks, docs and final deployment hardening | Next |

## Key decisions

- **Static only.** No server code, no API keys. `VITE_*` variables are public, so none hold secrets.
- **Base path.** Vite `base` is `/Solas/` by default and is set from the repository name in CI.
  Data is loaded via `import.meta.env.BASE_URL`. Shareable state lives in the URL hash.
- **Basemap.** OpenFreeMap keyless styles (`dark` / `positron`), then a second style, then a
  built-in offline style showing only Solas's own data.
- **Routing.** A* with an admissible straight-line heuristic over a compact directed graph.
  All tunable numbers live in `src/config/routing.ts`.
- **Better lit is earned, not assumed.** An alternative is shown only if it is a distinct path,
  within the user's detour cap, at least 10 points better on mapped-or-likely-lit length, with
  lighting evidence on at least half its length, and no extra length mapped as unlit. Otherwise
  the app shows one route and says why.
- **Honesty rules.** No invented coordinates, routes, times, lighting or accessibility claims.
  Synthetic test fixtures live in `tests/fixtures/` and are labelled synthetic.
