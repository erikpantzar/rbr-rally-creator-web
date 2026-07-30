// Thin fetch wrapper for rbr-rally-creator-service's rally endpoints.
// `credentials: 'include'` is required on every call -- the session lives in
// a cross-site httpOnly cookie the service sets.
async function request(baseUrl, path, { method = 'GET', body } = {}) {
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
async function requestArray(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, ...data };
  }
  const data = await res.json().catch(() => []);
  return { ok: true, data };
}

export const getStages = (baseUrl) => requestArray(baseUrl, '/catalog/stages');

export const getCarGroups = (baseUrl) => requestArray(baseUrl, '/catalog/car-groups');

export const createRally = (baseUrl, config) =>
  request(baseUrl, '/rallies', { method: 'POST', body: config });

export const getJobStatus = (baseUrl, jobId) => request(baseUrl, `/jobs/${jobId}`);
