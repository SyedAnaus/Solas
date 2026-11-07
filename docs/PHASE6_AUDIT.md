# Phase 6 design and interaction audit

Reviewed 7 November 2026 against the supplied palette and frosted-glass references.
This completes the existing in-progress redesign rather than replacing the routing engine.

## Visual system

- Light-only UI and basemap. Removed theme switching and the dark-style loading path.
- Nourished `#EBE5D3` for warm supporting surfaces, Link Water `#D3D9EB` for cool fills,
  Bright Slate `#3B4497` and Pow Orange `#E05320` for route identity. Small text uses darker
  ink and orange variants for contrast. Frosted surfaces have opaque fallbacks.
- Route selection uses a check mark, dark outline and pressed state. It does not change
  the meaning of evidence colours: mapped lit is yellow, likely lit is mint/dashed,
  mapped unlit is coral, unknown is white/dotted. Every status has a text label.
- Each route mode has a concise benefit. Sources, accessibility detail and tuning controls
  open on request. Route times and evidence come from the real graph; no placeholder statistics.

## Completed interaction fixes

- Phone sheet with three detents, native tap, drag/flick, cancellation, keyboard resizing,
  inert collapsed content, focus recovery and visual-viewport sizing.
- Scrollable tablet/desktop side panel. Camera insets account for sheet height, the expanded
  evidence key, attribution and controls; resize refits routes. Show whole route collapses
  the phone sheet to expose the map. Both map controls remain above an expanded sheet.
- Preserved trip hashes when using the skip link; restored focus when returning from details.
- Native About dialog with focus containment and Escape. Tooltips support keyboard, touch,
  hover and dismissal, and avoid clipping against scroll containers and viewport edges.
- Approximately 44 px control targets, explicit accessible names, route announcements,
  and system/in-app reduced motion. Loading skeletons and retryable data failures.
- Regression fix for route layers hiding evidence after toggling. Map callouts retain DOM
  focus when selecting another route and identify routes by name as well as colour.
  Nearby callouts are separated so both alternatives remain tappable on shared streets.
- Accessibility summaries no longer present difficulty categories as counts of physical
  sections. Nonzero missing-data shares below 1% remain visible as less than 1%.

## Verification

The Playwright matrix uses 360×800, 390×844, 768×1024, 1024×768 and 1440×900 viewports.
It exercises the empty planner, all four modes, tuning options, evidence/source details,
About/settings, loading/failure/retry, and phone sheet tap/drag/keyboard interactions.
It checks overflow, focus, light mode under a dark system preference, reduced motion and
axe WCAG A/AA rules, plus trip-preserving skip navigation and callout hit targets. Browser tests use the committed Cork graph and intentionally block
remote map services to verify the offline fallback deterministically. The interactive
visual audit separately uses the live OpenFreeMap basemap.

Run `npm run check` and `npm run test:e2e`; both are required by the deployment workflow.
Automated accessibility checks do not substitute for assistive-technology user testing.
Physical-device Safari/VoiceOver and Android/TalkBack testing remain manual release checks.
The existing map-data limitations, estimated walking speed and approximate Google Maps
handoff remain explicitly disclosed in the interface.
