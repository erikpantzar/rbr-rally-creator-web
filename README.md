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

The app defaults to the public `rbr-rally-creator-service` instance (exposed via Tailscale
Funnel, with CORS already configured for this GitHub Pages origin) — no setup needed, just open
the app and go. The Settings section only needs to be touched to point at a different backend,
e.g. `http://localhost:3000` for local development against a service running on your own
machine; the override is stored in `localStorage` (not a secret, just a hostname) and clearing
the field reverts to the public default. Your rallysimfans.hu credentials are **not** stored
here: signing in sends them once to the service, which validates them via a real login and sets
an httpOnly session cookie. This app never reads or stores the raw password.

## Architecture

- **React + CSS Modules** (`*.module.css` per component) + one global `src/styles/tokens.css` for
  design tokens (colors, light/dark). No CSS-in-JS, no UI kit — plain, isolated component styles.
- **Component convention**: presentational components (`src/components/`) take data in via props
  and report out via callback props — no component reaches into `fetch`/`localStorage` itself.
  Only `App.jsx` owns state and talks to the service/localStorage. Mirrors
  [willys-web-prototype](https://github.com/erikpantzar/willys-web-prototype)'s
  `docs/COMPONENTS.md` convention.
- No router yet — Phase 1 is a single real view. Add one when a second distinct, deep-linkable
  page exists (e.g. a job-status page).

## Status

Phase 1 (auth): service URL settings + rallysimfans.hu sign-in against the service's httpOnly-cookie
session API. Rally creation itself isn't built yet.

**Known risk, untested**: the session cookie is cross-site (this GitHub Pages origin ↔ the
service's own host). Some browsers (Safari ITP, strict tracking-protection modes) block cross-site
cookies even with correct `SameSite=None; Secure` flags — test this for real before relying on it.
If it doesn't work in your browser, the fallback is a bearer token in the login response instead
of a cookie.
