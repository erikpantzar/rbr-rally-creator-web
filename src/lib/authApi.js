// Thin wrappers for rbr-rally-creator-service's /auth/credentials endpoint.
// The session lives in a cross-site httpOnly cookie the service sets (see
// apiClient.js for the shared fetch plumbing that always sends it) -- this
// app never reads or stores the raw username/password itself. Saving
// credentials does NOT validate them against rallysimfans.hu -- that only
// happens later, when a rally-creation job actually runs (not built yet).
import { request } from './apiClient.js';

export const saveCredentials = (baseUrl, username, password) =>
  request(baseUrl, '/auth/credentials', { method: 'POST', body: { username, password } });

export const getCredentialsStatus = (baseUrl) => request(baseUrl, '/auth/credentials');

export const clearCredentials = (baseUrl) =>
  request(baseUrl, '/auth/credentials', { method: 'DELETE' });
