// Persists the *currently open* stage editor's in-progress draft
// (rbr-rally-creator-web#16) -- distinct from rallyDraft.js, which only ever
// holds fully-saved stages (the committed stagePlan). Without this,
// refreshing the tab or closing it while the full-page stage editor is
// mid-edit throws away whatever the user was typing/picking, even though
// nothing has been "Saved" into the road book yet. Mirrors rallyDraft.js's
// key/get/set convention.
//
// Scope call: this is a single slot, not one draft per leg/stage. The
// editor is mounted/unmounted per open (RoadBook only ever has one instance
// on screen at a time), so there's only ever one "abandoned in-progress
// edit" worth recovering. `targetUid` records which brick the draft belongs
// to for 'edit' mode, so a stored draft only gets offered back if it
// matches the brick currently being edited -- otherwise reopening a
// *different* stage's editor could clobber its fields with an abandoned
// edit of some other stage. 'add'/'duplicate' have no established identity
// yet (they're for a brick that doesn't exist), so any abandoned add/
// duplicate draft is offered back regardless of which leg it's reopened
// from -- accepted tradeoff: if you abandon an add on one leg and then open
// "+ Add stage" on a *different* leg before finishing it, the abandoned
// draft wins over that leg's fresh previous-stage-seeded default. See
// StageConfigModal.jsx for the "only restore if it looks like real
// progress" + discard-and-start-fresh handling that further narrows this.
const KEY = 'rbr.stageConfigDraft';

// Returns the saved draft envelope ({ mode, targetUid, draft, savedAt }), or
// null if there isn't one or it can't be parsed -- callers fall back to
// their normal initial value in either case rather than crashing.
export function loadStageConfigDraft() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

export function saveStageConfigDraft(saved) {
  localStorage.setItem(KEY, JSON.stringify(saved));
}

// Called on successful Save and on explicit Cancel/Back -- either way the
// in-progress edit's job is done (committed to stagePlan, or deliberately
// abandoned), so it shouldn't resurface in an unrelated future session.
export function clearStageConfigDraft() {
  localStorage.removeItem(KEY);
}
