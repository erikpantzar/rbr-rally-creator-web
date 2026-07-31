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

export const getCars = (baseUrl) => requestArray(baseUrl, '/catalog/cars');

// The service is the single source of truth for these enumerated option
// lists (damage levels, pacenotes options, tyre compounds, etc.) -- it has
// actually driven the real site's wizard to confirm them. Don't hardcode
// separate copies here; fetch and use these instead.
export const getRallyOptions = (baseUrl) => request(baseUrl, '/catalog/rally-options');

export const createRally = (baseUrl, config) =>
  request(baseUrl, '/rallies', { method: 'POST', body: config });

export const getJobStatus = (baseUrl, jobId) => request(baseUrl, `/jobs/${jobId}`);

// Cooperative cancel (rbr-rally-creator-web#31). The response is only a
// snapshot at the moment the service received the request -- a queued job
// is cancelled immediately (200), but a running job just has the request
// noted (202) and keeps running until it notices at the next safe step
// boundary. Callers must keep polling getJobStatus() for the actual
// outcome rather than trusting this response as final.
export const cancelJob = (baseUrl, jobId) => request(baseUrl, `/jobs/${jobId}`, { method: 'DELETE' });
