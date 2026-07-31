// Whole-rally persistence -- saves multiple rally configurations by name/ID
// so users can build several rallies independently and come back to them later.
// Each saved rally stores: { id, title, updatedAt, payload } where payload
// is { rallyBasics, carGroupIds, stagePlan, legSchedule }.
import { generateUid } from './rallyPlan.js';

const RALLIES_KEY = 'rbr.rallies';

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

// Sorted newest-first so the user sees most-recently-touched rallies at the top.
export function listRallies() {
  return readRallies().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getRally(id) {
  return readRallies().find((r) => r.id === id) ?? null;
}

// Upsert -- pass an existing id to update that rally in place, or omit/pass null
// to create a new one. Returns the id either way so the caller knows which rally
// it's now working with.
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
