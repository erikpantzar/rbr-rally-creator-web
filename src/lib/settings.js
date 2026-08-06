// The service's base URL defaults to the public Tailscale Funnel address
// (see rbr-rally-creator-web#1) so a random visitor can use the app with no
// setup -- CORS on the service side already allows this GitHub Pages origin.
// A `rbr.baseUrl` localStorage entry can still override the default (e.g.
// to point at a local dev backend during development) -- there's no UI or
// setter for it any more, it's a devtools-only escape hatch: set/remove the
// key manually and reload. It's not a secret, just a hostname, which is why
// it lives in localStorage rather than being the *only* option baked into
// the build. Mirrors willys-web-prototype's settings.js pattern. This is
// NOT where rallysimfans.hu credentials live -- those never touch
// localStorage, see lib/authApi.js (httpOnly cookie, server-held).
const KEY = 'rbr.baseUrl';

export const DEFAULT_BASE_URL = 'https://ep-precision-5570.tail5370f3.ts.net:8443/rally';

export function getBaseUrl() {
  return localStorage.getItem(KEY) || DEFAULT_BASE_URL;
}

// rbr-rally-creator-web#100: whether StagePicker renders stage thumbnails at
// all -- a plain display preference, same "sticks in localStorage, not a
// secret" reasoning as baseUrl above. Defaults to on (thumbnails were never
// optional before this), so an unset key must read as `true`, not the usual
// falsy-default -- hence the explicit !== 'false' check rather than a
// Boolean(...) coercion.
const THUMBNAILS_KEY = 'rbr.stageThumbnailsEnabled';

export function getStageThumbnailsEnabled() {
  return localStorage.getItem(THUMBNAILS_KEY) !== 'false';
}

// rbr-rally-creator-web#107: the PICKER_WORKSPACE behavior flag
// (docs/redesign/07-picker-workspace.md §6) -- chooses whether RoadBook's
// modalState renders the new PickerWorkspace (sidebar + live detail pane)
// or the pre-existing StageConfigModal flow. The plan doc offers two homes
// for this flag ("module-level in RoadBook, or settings.js if we want a
// runtime toggle for dogfooding") -- settings.js was picked so the
// workspace can be dogfooded on a deployed build without a rebuild, same
// devtools-only escape-hatch pattern as baseUrl above: no UI, no setter
// export; flip it from the console and reload:
//
//   localStorage.setItem('rbr.pickerWorkspaceEnabled', 'true')   // on
//   localStorage.removeItem('rbr.pickerWorkspaceEnabled')        // off
//
// Defaults OFF (unset key reads false) -- the old modal flow stays the
// shipped behavior until the doc's Phase 3 cutover flips/removes this.
const PICKER_WORKSPACE_KEY = 'rbr.pickerWorkspaceEnabled';

export function getPickerWorkspaceEnabled() {
  return localStorage.getItem(PICKER_WORKSPACE_KEY) === 'true';
}

export function setStageThumbnailsEnabled(enabled) {
  try {
    localStorage.setItem(THUMBNAILS_KEY, String(enabled));
  } catch {
    // Best-effort persistence, same reasoning as rallyStorage.js's
    // setCurrentDraft -- a display preference isn't worth a crash.
  }
}
