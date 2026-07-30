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

export const getStages = (baseUrl) => request(baseUrl, '/catalog/stages');

export const getCarGroups = (baseUrl) => request(baseUrl, '/catalog/car-groups');

export const createRally = (baseUrl, config) =>
  request(baseUrl, '/rallies', { method: 'POST', body: config });

export const getJobStatus = (baseUrl, jobId) => request(baseUrl, `/jobs/${jobId}`);
