// Whole-rally persistence (rbr-rally-creator-web#46) -- two concerns living
// in one file because they share the same payload shape and the same
// `rbr.` localStorage prefix family as stageConfigDraft.js's per-stage-edit
// drafts, but are otherwise independent:
//
// 1. `rbr.currentDraft` -- the single in-progress build, autosaved on every
//    edit (rbr-rally-creator-web#6, previously lib/rallyDraft.js). Restored
//    on mount so an accidental refresh/close doesn't lose work-in-progress
//    that was never explicitly saved.
// 2. `rbr.rallies` -- an explicit, named history of rallies the user chose
//    to Save, so they can come back and reopen an old one later. Distinct
//    from currentDraft: saving a rally to history does NOT clear
//    currentDraft (they're independent -- you can have unsaved edits to a
//    rally you've also saved a named copy of), and opening a rally from
//    history does not itself write to currentDraft either (see
//    RallyBuilder's mount-time hydration ordering).
//
// `payload` in both is always the same shape: { rallyBasics, carGroupIds,
// legSchedule, stagePlan } -- the same shape RallyBuilder's
// handleCreateRally assembles for submission, minus the _uid-stripping that
// only happens at actual submit time (stagePlan entries here keep _uid so
// dnd-kit identity survives a reload/reopen).
import { generateUid } from './rallyPlan.js';

const CURRENT_DRAFT_KEY = 'rbr.currentDraft';
const RALLIES_KEY = 'rbr.rallies';

export function getCurrentDraft() {
  const raw = localStorage.getItem(CURRENT_DRAFT_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

export function setCurrentDraft(payload) {
  localStorage.setItem(CURRENT_DRAFT_KEY, JSON.stringify({ updatedAt: new Date().toISOString(), payload }));
}

// Called once a rally has actually been created -- the draft's job is done,
// so it shouldn't keep coming back on the next visit. Also called when the
// user opens a saved rally from history (see RallyBuilder): that rally's
// own payload becomes what's on screen, so the stale currentDraft from
// whatever was being built before shouldn't resurface over it on the next
// reload.
export function clearCurrentDraft() {
  localStorage.removeItem(CURRENT_DRAFT_KEY);
}

function readRallies() {
  const raw = localStorage.getItem(RALLIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRallies(rallies) {
  localStorage.setItem(RALLIES_KEY, JSON.stringify(rallies));
}

// Sorted newest-first so RallyHistory doesn't have to know the storage
// order -- most-recently-touched rally is always what you'd want to see at
// the top of the list.
export function listRallies() {
  return readRallies().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getRally(id) {
  return readRallies().find((r) => r.id === id) ?? null;
}

// Upsert -- pass the id previously returned from here (stored by the caller
// as e.g. `currentRallyId`) to update that same history entry in place;
// omit/pass null/undefined to create a new one. Returns the id either way so
// the caller always knows which entry it's now tied to.
export function saveRally(id, title, payload) {
  const rallies = readRallies();
  const resolvedId = id ?? generateUid();
  const updatedAt = new Date().toISOString();
  const entry = { id: resolvedId, title: title?.trim() || '', updatedAt, payload };

  const existingIndex = rallies.findIndex((r) => r.id === resolvedId);
  if (existingIndex >= 0) {
    rallies[existingIndex] = entry;
  } else {
    rallies.push(entry);
  }
  writeRallies(rallies);
  return resolvedId;
}

export function deleteRally(id) {
  writeRallies(readRallies().filter((r) => r.id !== id));
}
