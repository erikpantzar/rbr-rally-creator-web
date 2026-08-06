// Shared fetch plumbing for the rbr-rally-creator-service wrappers
// (rallyApi.js / authApi.js) -- both carried verbatim copies of request()
// before this file existed, and duplicated plumbing is exactly the kind of
// thing that drifts. `credentials: 'include'` is required on every call --
// the session lives in a cross-site httpOnly cookie the service sets.
// The mock switch lives here too, so no real network code runs at all in
// mocked dev mode regardless of which wrapper the call came through.
import { USE_MOCK_API, mockRequest, mockRequestArray } from './mockService.js';

export async function request(baseUrl, path, { method = 'GET', body } = {}) {
  if (USE_MOCK_API) return mockRequest(path, { method, body });
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, ...data };
  return { ok: true, ...data };
}

// The catalog endpoints return a raw JSON array, not an object -- spreading
// an array into `{ ok: true, ...data }` produces numeric-keyed properties
// (`{0: ..., 1: ...}`), not a `.stages`/`.carGroups` array. Kept as a
// separate helper that wraps the array under `.data` instead.
export async function requestArray(baseUrl, path) {
  if (USE_MOCK_API) return mockRequestArray(path);
  const res = await fetch(`${baseUrl}${path}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, ...data };
  }
  const data = await res.json().catch(() => []);
  return { ok: true, data };
}
