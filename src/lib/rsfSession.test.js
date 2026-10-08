import { describe, it, expect } from 'vitest';
import { toRsfSessionState, canLogInToRsf, describeRsfSessionError } from './rsfSession.js';

describe('toRsfSessionState', () => {
  it('maps a valid saved session', () => {
    expect(toRsfSessionState({ ok: true, saved: true, status: 'valid', username: 'erik' })).toEqual({
      status: 'valid',
      username: 'erik',
    });
  });

  it('treats any other saved status as expired', () => {
    expect(toRsfSessionState({ ok: true, saved: true, status: 'expired', username: 'erik' }).status).toBe('expired');
  });

  it('maps a missing session or an error to missing', () => {
    expect(toRsfSessionState({ ok: false, status: 401, saved: false })).toEqual({ status: 'missing' });
    expect(toRsfSessionState({ ok: true, saved: false })).toEqual({ status: 'missing' });
  });
});

describe('canLogInToRsf', () => {
  it('accepts saved credentials or a valid session', () => {
    expect(canLogInToRsf({ status: 'saved' }, { status: 'missing' })).toBe(true);
    expect(canLogInToRsf({ status: 'unsaved' }, { status: 'valid' })).toBe(true);
  });

  it('rejects an expired session without credentials', () => {
    expect(canLogInToRsf({ status: 'unsaved' }, { status: 'expired' })).toBe(false);
  });
});

describe('describeRsfSessionError', () => {
  it('explains a rejected session and falls back for unknown reasons', () => {
    expect(describeRsfSessionError('session_expired')).toMatch(/rejected/);
    expect(describeRsfSessionError('automation_error')).toMatch(/Could not check/);
  });
});
