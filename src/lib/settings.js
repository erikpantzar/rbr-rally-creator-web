// The service's base URL defaults to the public Tailscale Funnel address
// (see rbr-rally-creator-web#1) so a random visitor can use the app with no
// setup -- CORS on the service side already allows this GitHub Pages origin.
// localStorage can still override the default (e.g. to point at a local dev
// backend during development); it's not a secret, just a hostname, which is
// why it lives in localStorage rather than being the *only* option baked
// into the build. Mirrors willys-web-prototype's settings.js pattern. This
// is NOT where rallysimfans.hu credentials live -- those never touch
// localStorage, see lib/authApi.js (httpOnly cookie, server-held).
const KEY = 'rbr.baseUrl';

export const DEFAULT_BASE_URL = 'https://ep-precision-5570.tail5370f3.ts.net:8443/rally';

export function getBaseUrl() {
  return localStorage.getItem(KEY) || DEFAULT_BASE_URL;
}

export function setBaseUrl(url) {
  const trimmed = url.trim().replace(/\/+$/, '');
  // Saving the default (or clearing the field) drops the override, so
  // future changes to DEFAULT_BASE_URL take effect without a stale
  // localStorage value shadowing them.
  if (!trimmed || trimmed === DEFAULT_BASE_URL) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, trimmed);
  }
}

export function hasBaseUrl() {
  return Boolean(getBaseUrl());
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

export function setStageThumbnailsEnabled(enabled) {
  localStorage.setItem(THUMBNAILS_KEY, String(enabled));
}
