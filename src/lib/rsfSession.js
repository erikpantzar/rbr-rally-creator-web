export const RSF_SESSION_REASONS = {
  missing_cookies: 'Paste both cookie values.',
  session_expired: 'rallysimfans.hu rejected these cookies. Log in again in your browser and copy fresh ones.',
  rate_limited: 'rallysimfans.hu is rate limiting right now. Wait a minute and try again.',
};

export const describeRsfSessionError = (reason) =>
  RSF_SESSION_REASONS[reason] ?? 'Could not check the session. Try again.';

export const toRsfSessionState = (res) =>
  res.ok && res.saved
    ? { status: res.status === 'valid' ? 'valid' : 'expired', username: res.username ?? null }
    : { status: 'missing' };

export const canLogInToRsf = (credState, rsfState) =>
  credState.status === 'saved' || rsfState.status === 'valid';
