// The service's base URL (e.g. a tailnet HTTPS address) is asked for once
// and kept in localStorage rather than baked into this public repo/build --
// it's not a secret, just a hostname that could change without a redeploy.
// Mirrors willys-web-prototype's settings.js pattern. This is NOT where
// rallysimfans.hu credentials live -- those never touch localStorage, see
// lib/authApi.js (httpOnly cookie, server-held).
const KEY = 'rbr.baseUrl';

export function getBaseUrl() {
  return localStorage.getItem(KEY) || '';
}

export function setBaseUrl(url) {
  localStorage.setItem(KEY, url.replace(/\/+$/, ''));
}

export function hasBaseUrl() {
  return Boolean(getBaseUrl());
}
