// Persists the in-progress rally build (rbr-rally-creator-web#6) so
// accidentally closing the tab, refreshing, or navigating away mid-build
// doesn't lose work. Mirrors settings.js's localStorage key/get/set
// convention. Scope is deliberately just the one "current draft" -- no
// history/multiple saved rallies (that's a different issue), and nothing
// here is a secret (it's the same rally-config shape submitted to the
// service, none of it is credentials).
const KEY = 'rbr.rallyDraft';

// Returns the saved draft, or null if there isn't one (first visit) or it
// can't be parsed (corrupted/edited-by-hand localStorage, or a shape from a
// future/older version of this app) -- callers fall back to their normal
// defaults in either case rather than crashing.
export function loadRallyDraft() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    return draft && typeof draft === 'object' ? draft : null;
  } catch {
    return null;
  }
}

export function saveRallyDraft(draft) {
  localStorage.setItem(KEY, JSON.stringify(draft));
}

// Called once a rally has actually been created -- the draft's job is done,
// so it shouldn't keep coming back on the next visit.
export function clearRallyDraft() {
  localStorage.removeItem(KEY);
}
