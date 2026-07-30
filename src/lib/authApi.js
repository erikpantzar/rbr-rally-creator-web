// Thin fetch wrapper for rbr-rally-creator-service's /auth/* endpoints.
// `credentials: 'include'` is required on every call -- the session lives
// in a cross-site httpOnly cookie the service sets, this app never reads
// or stores the raw username/password itself.
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

export const login = (baseUrl, username, password) =>
  request(baseUrl, '/auth/login', { method: 'POST', body: { username, password } });

export const getSession = (baseUrl) => request(baseUrl, '/auth/session');

export const logout = (baseUrl) => request(baseUrl, '/auth/logout', { method: 'POST' });
