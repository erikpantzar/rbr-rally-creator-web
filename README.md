# rbr-rally-creator-web

React + Vite frontend for creating RBR rallies on [rallysimfans.hu](https://rallysimfans.hu)
through a nicer UI than the site's own wizard. Deployed to GitHub Pages at
https://erikpantzar.github.io/rbr-rally-creator-web/.

Paired with [rbr-rally-creator-service](https://github.com/erikpantzar/rbr-rally-creator-service),
the Playwright automation backend this app talks to. See
[ideas-and-projects/active/rally-creation-automation/NOTES.md](https://github.com/erikpantzar/ideas-and-projects/blob/main/active/rally-creation-automation/NOTES.md)
for the full plan.

## Setup

```
npm install
npm run dev
```

The app talks to the public `rbr-rally-creator-service` instance by default (exposed via
Tailscale Funnel, with CORS already configured for this GitHub Pages origin) — no setup needed,
just open the app and go. There's no visible settings UI to change this (the "Service connection"
section was removed once the public URL became a stable, permanent address); pointing at a
different backend for local development is a devtools-only escape hatch instead —
`localStorage.setItem('rbr.baseUrl', 'http://localhost:3000')` then reload, clear the key to
revert to the public default. Your rallysimfans.hu credentials are **not** stored here: signing in
sends them once to the service, which validates them via a real login and sets an httpOnly session
cookie. This app never reads or stores the raw password.

## Architecture

- **React + CSS Modules** (`*.module.css` per component) + one global `src/styles/tokens.css` for
  design tokens (colors, light/dark, amber accent — see DESIGN_SPEC.md). No CSS-in-JS, no UI kit —
  plain, isolated component styles.
- **Component convention**: presentational components (`src/components/`) take data in via props
  and report out via callback props — no component reaches into `fetch`/`localStorage` itself.
  Only `App.jsx`/`RallyBuilder.jsx` own state and talk to the service/localStorage. Mirrors
  [willys-web-prototype](https://github.com/erikpantzar/willys-web-prototype)'s
  `docs/COMPONENTS.md` convention.
- **`@dnd-kit`** (`core`/`sortable`/`utilities`) for the road book's drag-to-reorder interaction.
  An earlier drag-*source* catalog panel (`StageCatalogPanel`, for dragging a stage in from a
  side panel) was tried and removed — stage picking is click-only now, inside the stage-config
  modal; only already-placed stage "bricks" are draggable, for reordering. See DESIGN_SPEC.md's
  "Scope note" — drag-and-drop *creation* from a catalog remains explicitly out of scope.
- No router yet — still a single real view (the "My Rallies" list is a toggleable sidebar panel,
  not a route). Add one if a second distinct, deep-linkable page shows up.

## Status

Fully built and is the only way to use the app — there's no separate "auth phase" any more, the
rally builder and sign-in flow are both live on the one screen. What's actually there:

- **Rally builder as a "document of bricks"** (DESIGN_SPEC.md): legs and stages are added one at a
  time (no manual count inputs — "+ Add Leg" / "+ Add stage"), stages within a leg reorder via
  drag (`@dnd-kit`) or up/down buttons, and a full-screen stage-config modal handles add/edit/
  duplicate for a stage's full field set.
- **Leg management**: legs can be removed as well as added; removing a leg that still has stages
  shows an inline confirmation bubble (not a native `confirm()` dialog) offering to merge those
  stages into the adjacent leg rather than silently dropping them. Both stage deletion and leg
  removal get a 5-second "Undo" toast.
  - Legs are capped at 6 (min 1), matching the real site's own wizard.
- **Readiness banner** replaces the old `alert()`-based validation — lists every reason "Create
  Rally" is currently disabled, with an inline one-click fix where one exists (e.g. a leg whose
  start time has gone stale gets a "Fix start time(s)" action right on that problem line).
- **Leg-time rules**: a leg can't start less than 5 minutes from now, and can't stay open more
  than 6 days — both checked against **Europe/Stockholm** wall-clock time (not the visiting
  browser's own timezone), matching the equivalent server-side rule in
  `rbr-rally-creator-service`. Rechecked every 30 seconds so the check can't go stale purely from
  time passing while the rest of the rally is still being built. These specific numbers (5 min /
  6 days) remain best-guess values pending a confirmed live-site boundary test — see
  `rbr-rally-creator-service`#12.
- **Locked/read-only state** once a rally job succeeds — no more add/edit/delete/reorder, and a
  "Duplicate as new draft" action clones the config into a fresh editable document.
- **Rally history**: a toggleable sidebar panel (an overlay, not a layout that resizes the main
  document) listing rallies saved via an explicit "Save" action — independent of the always-on
  `localStorage` autosave of whatever's currently being built, which restores on its own after an
  accidental refresh/close regardless of whether it's ever been explicitly saved.
- **Per-stage nickname**: an optional, purely local text label on each stage (shown always, not
  gated behind any toggle) to help tell stages apart at a glance while building — this is a
  planning aid only. It is stripped before submission and never reaches
  `rbr-rally-creator-service` or rallysimfans.hu. This is distinct from — and does **not** feed —
  the rally-level "Hide stage names" checkbox in the rally-basics form, which is the real site
  setting; investigation into the real wizard found no per-stage custom-name mechanism there at
  all (two independent sources: the captured field schema and the raw DOM), so there is currently
  no way for a custom per-stage name to reach participants on the real site.
- **Job progress** is its own screen, not layered onto the document: live step-by-step progress, a
  "Test run" (dry-run) checkbox that validates the whole flow without actually publishing,
  cooperative job cancellation (`DELETE /jobs/:id`), and the browser tab title reflecting progress
  percentage (and blinking on completion) so the tab can be safely switched away from mid-run.
- **Amber/monospace visual language** from DESIGN_SPEC.md is live in `tokens.css` (`--accent` at
  oklch hue ~92, both light and dark `prefers-color-scheme`/`data-theme` variants).

**Known gaps, still open**:
- No real icon set for surface/weather/tyre glyphs — collapsed stage bricks still show a
  first-letter placeholder (`G`/`T`/`S` for gravel/tarmac/snow).
- Cross-site session cookie behavior in strict-tracking-protection browsers (Safari ITP etc.) is
  still untested. Some browsers block cross-site cookies even with correct
  `SameSite=None; Secure` flags — verify this for real before relying on it. If it doesn't work in
  a given browser, the fallback is a bearer token in the login response instead of a cookie.
- The leg-time constants above (5 min minimum lead, 6-day max span) are implemented and enforced
  on both sides, but the exact numbers are still best-guess pending `rbr-rally-creator-service`#12.
