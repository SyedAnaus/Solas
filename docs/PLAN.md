# Solas — execution plan

Solas compares walking routes in a small, validated part of Cork City. Everything runs in the
browser from static files on GitHub Pages. The walking graph is built offline from OpenStreetMap
by `scripts/prepare_cork_data.py` and committed as static JSON.

## Starting point (2026-11-07)

The repository had only `README.md` and `LICENSE` (MIT). No PRD file was present in the
workspace, so the requirements in the project brief are the source of truth.

## Phases

Each phase leaves the app buildable, tested and deployable.

| Phase | Goal | Done when |
| --- | --- | --- |
| 1 | App skeleton + map on GitHub Pages | Vite/React/TS strict app with MapLibre + OpenFreeMap, theme toggle, attribution, style fallback, CI (typecheck, lint, test, build) deploying `dist/` to `https://syedanaus.github.io/Solas/` |
| 2 | Real OSM data + real fastest route | `prepare_cork_data.py` builds a walk graph for the UCC ↔ Parnell Place corridor; browser A* over that graph; map-tap and landmark endpoints; snapping with a max distance; route drawn from real edge geometry |
| 3 | Lighting evidence + better-lit alternative | Per-subsegment lighting classes (mapped lit / likely lit from lamps within 30 m / mapped unlit / unknown); candidate generation with penalties; detour cap; dedupe; comparison cards |
| 4 | Step-free and easier walking | Hard exclusions for steps / `wheelchair=no` / confirmed barriers; surface and incline preferences where tagged; explicit unknowns and "no verified step-free route" state |
| 5 | UI refinement | Bottom sheet (mobile) / side panel (desktop), route details panel, evidence overlay + legend, fine-tune sheet, Google Maps handoff, reduced motion, light theme polish |
| 6 | Hardening | Full test matrix (routing, scoring, snapping, geometry agreement, components), Playwright mobile checks, docs (README, DATA_SOURCES, ATTRIBUTION), production preview + live check |

## Key decisions

- **Static only.** No server code, no API keys. `VITE_*` variables are public, so none hold secrets.
- **Base path.** Vite `base` is `/Solas/` by default and is set from the repository name in CI.
  Data is loaded via `import.meta.env.BASE_URL`. The app is a single view, so no client router;
  any shareable state goes in the URL hash.
- **Basemap.** OpenFreeMap keyless styles (`dark` for the dark theme, `positron` for light).
  If a style cannot be fetched, the next style is tried, then a built-in offline style that shows
  only Solas's own walking network.
- **Routing.** A* with an admissible straight-line heuristic over a compact directed graph.
  All tunable numbers live in `src/config/routing.ts`.
- **Honesty rules.** No invented coordinates, routes, times, lighting or accessibility claims.
  Synthetic test fixtures live in `tests/fixtures/` and are labelled synthetic. When data is
  missing the UI says so.
