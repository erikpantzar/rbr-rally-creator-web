// Thin wrappers for rbr-rally-creator-service's rally endpoints. The shared
// fetch plumbing (credentials-include cookie handling, the mock-API switch,
// and the array-vs-object response shapes) lives in apiClient.js.
import { request, requestArray } from './apiClient.js';

// rbr-rally-creator-web#97: the header's ServiceStatus indicator polls this
// to show whether the backend (and specifically its Playwright automation,
// not just the bare HTTP server) is up. Note `ok` here ends up reflecting
// the service's own `ok` field (via request()'s `{ ok: true, ...data }`
// spread) when the request succeeds, not just "got an HTTP response".
export const getHealth = (baseUrl) => request(baseUrl, '/health');

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
