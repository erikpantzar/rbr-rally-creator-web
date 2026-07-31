// Shared stage-plan / leg-schedule helpers used by both the fetch/state
// owner (RallyBuilder) and the drag-and-drop road book (RoadBook). Kept
// framework-agnostic (no React) so both can import without a dependency
// cycle.

// Stable client-only identity for drag-and-drop keying (dnd-kit needs a
// unique, order-independent id per item). Never sent to the service --
// stripped in RallyBuilder before building the submit payload.
let uidCounter = 0;
export function generateUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  uidCounter += 1;
  return `uid-${Date.now()}-${uidCounter}`;
}

// A freshly-added stage slot starts unassigned (stage_id: null) -- the
// road book is a blank document you drag real stages into from the
// catalog, per Phase 3's "endgame vision", rather than pre-seeded with an
// arbitrary catalog entry.
export function createDefaultStageConfig() {
  return {
    _uid: generateUid(),
    stage_id: null,
    surface_age_id: '2',
    wetness_id: 'dry',
    tracksettings_id: 'Morning Clear Crisp',
    def_tyre_id: 'Gravel Dry',
    choose_tyre: true,
    choose_setup: true,
    service_time: '60 minutes',
    nummechanics: '6 mechanic',
    mechanicsSkill: 'Expert',
  };
}

// Used by the brick "Duplicate" action -- same config values as an existing
// stage, but a fresh _uid so it's a genuinely new brick rather than an alias
// for the one it was copied from.
export function cloneStageConfigWithNewUid(stageConfig) {
  return { ...stageConfig, _uid: generateUid() };
}

// Surface -> tyre compound defaults (rbr-rally-creator-web#24) -- "if I
// make a tarmac stage, auto pick tarmac tires but don't enforce it". These
// back a DEFAULT applied at the moment a stage is picked in the editor and
// a SUGGESTION offered when wetness is set to 'wet', not a constraint --
// callers always leave the tyre dropdown free to override afterward.
// Strings must match TYRE_OPTIONS exactly (rbr-rally-creator-service's
// src/lib/rallyOptions.js, the confirmed-valid enum served over
// GET /catalog/rally-options and validated against on submit) -- deliberately
// hardcoded here rather than pattern-built ("`${Surface} Dry`") so a rename
// on that side shows up as a mismatch rather than silently drifting.
const SURFACE_DEFAULT_TYRE = {
  tarmac: 'Tarmac Dry',
  gravel: 'Gravel Dry',
  snow: 'Snow',
};

// Wet-weather variant per surface. Snow has no wet entry in TYRE_OPTIONS
// (just the single 'Snow' compound), so it's deliberately absent here --
// getWetTyreForSurface returns null for it and callers treat that as "no
// suggestion applies", per the issue's own note that wet suggestions only
// make sense for tarmac/gravel.
const SURFACE_WET_TYRE = {
  tarmac: 'Tarmac Wet',
  gravel: 'Gravel Wet',
};

export function getDefaultTyreForSurface(surface) {
  return SURFACE_DEFAULT_TYRE[surface] ?? null;
}

export function getWetTyreForSurface(surface) {
  return SURFACE_WET_TYRE[surface] ?? null;
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm", in the browser's local
// time, not toISOString() (which is UTC and includes seconds/Z).
export function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Max span the site's own "leg open -> leg close" window allows is 7 days --
// this app caps legs at 6 to stay safely inside that limit rather than
// riding the edge of the site's own validation.
export const MAX_LEG_SPAN_DAYS = 6;

// rbr-rally-creator-web#37: the real site's wizard only ever offers 1-6 legs
// (confirmed against rbr-rally-creator-service's discovery capture of the
// live wizard, discovery/capabilities/rally-wizard-schema.json) -- the
// backend enforces this server-side, and this constant lets the frontend
// stop the user before they hit that 400, same "surface it before submit"
// idea as MAX_LEG_SPAN_DAYS above.
export const MAX_LEGS = 6;

// rbr-rally-creator-service#11 / PR#14: a leg's open_time can't be less than
// 5 minutes from "now" at the moment the automation actually schedules it
// (including already being in the past) -- the backend clamps it forward to
// CLAMP_LEG_LEAD_MINUTES minutes out as a defensive safety net, shifting
// close_time by the same delta to preserve the leg's originally-intended
// duration (capped at MAX_LEG_SPAN_DAYS). rbr-rally-creator-web#40: these two
// constants let the frontend warn the user before they hit that silent
// server-side adjustment, same "surface it before submit" idea as
// MAX_LEG_SPAN_DAYS/MAX_LEGS above. Deliberately not replicating the actual
// clamp-and-shift math client-side -- that stays the backend's job as a
// last-resort safety net for values that go stale while queued.
export const MIN_LEG_LEAD_MINUTES = 5;
export const CLAMP_LEG_LEAD_MINUTES = 10;

// True when `openTime` is less than MIN_LEG_LEAD_MINUTES from `now` --
// including already being in the past, or unparseable. Callers evaluate this
// with a fresh `now` on every render (see RallyBuilder's readinessProblems)
// rather than once on change, because this condition can become true purely
// from time passing while the user keeps building the rest of the rally, not
// just from editing the field itself.
export function isLegOpenTimeTooSoon(openTime, now = new Date()) {
  if (!openTime) return false;
  const openDate = new Date(openTime);
  if (Number.isNaN(openDate.getTime())) return false;
  const minOpenDate = new Date(now.getTime() + MIN_LEG_LEAD_MINUTES * 60 * 1000);
  return openDate < minOpenDate;
}

// Seeds a brand-new "+ Add stage" slot from the most recently added/edited
// stage already in the plan (rbr-rally-creator-web#5), instead of the
// generic hardcoded defaults -- carrying forward surface age/wetness/
// weather/tyre/service/mechanics settings makes it much faster to build a
// rally with consistent config across stages, rather than re-entering the
// same values on every stage. Like createDefaultStageConfig, the new slot
// still starts unassigned (stage_id: null) -- only the config fields carry
// over, not the previous stage's catalog assignment. Falls back to the
// generic defaults when there is no previous stage yet (empty plan).
export function createStageConfigFromPrevious(previousStageConfig) {
  if (!previousStageConfig) return createDefaultStageConfig();
  return {
    ...previousStageConfig,
    _uid: generateUid(),
    stage_id: null,
  };
}

// stage_count is the manual (non-drag) leg-boundary control: how many of
// the rally's stages fall in this leg. start_stage_no is derived from it
// (see computeLegStageRanges) rather than stored directly, so it can never
// drift out of sync with the counts a user has typed in or dragged.
//
// open_time/close_time default to "starts today, runs the max allowed span"
// so a new leg is submittable without the user having to touch the date
// pickers first -- they only need to adjust these if they want something
// other than "starting now".
export function createDefaultLegConfig(stageCount = 0) {
  const now = new Date();
  const closeDate = new Date(now);
  closeDate.setDate(closeDate.getDate() + MAX_LEG_SPAN_DAYS);

  return {
    open_time: toDatetimeLocalValue(now),
    close_time: toDatetimeLocalValue(closeDate),
    super_rally: 'disabled',
    stage_count: stageCount,
  };
}

// Evenly split `totalStages` across `legCount` legs (remainder stages go to
// the earliest legs) -- used only to seed/reseed defaults; a user's manual
// per-leg counts or leg-boundary drags otherwise take over.
export function distributeStagesEvenly(totalStages, legCount) {
  if (legCount <= 0) return [];
  const base = Math.floor(totalStages / legCount);
  const remainder = totalStages % legCount;
  return Array.from({ length: legCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Turns each leg's stage_count into an absolute [startIndex, endIndex) slice
// range over stagePlan, plus the 1-based start_stage_no the backend expects.
export function computeLegStageRanges(legSchedule) {
  let cursor = 0;
  return legSchedule.map((leg) => {
    const startIndex = cursor;
    const count = Math.max(0, leg.stage_count || 0);
    cursor += count;
    return { startIndex, endIndex: cursor, startStageNo: startIndex + 1 };
  });
}

// Real business rule (confirmed live against rallysimfans.hu, see
// rbr-rally-creator-service's discovery/capabilities/rally-wizard-schema.json
// step4_stageConfig.businessRule): every service_time option except
// "No Service" is disabled server-side on the rally's very last stage --
// there's no next stage left to service before. nummechanics/mechanicsSkill
// are disabled in lockstep. This normalizes the stored stage plan to match
// so the UI never shows/submits a full-service config that the site will
// silently drop on save.
export function normalizeLastStageService(stagePlan) {
  if (stagePlan.length === 0) return stagePlan;
  const lastIndex = stagePlan.length - 1;
  const last = stagePlan[lastIndex];
  if (last.service_time === 'No Service') return stagePlan;

  const next = [...stagePlan];
  next[lastIndex] = {
    ...last,
    service_time: 'No Service',
    nummechanics: 'No Service',
    mechanicsSkill: 'No Service',
  };
  return next;
}

// Service-chip tiers -- a UI-only grouping of the real service_time values
// (see rally-wizard-schema.json's step4_stageConfig.service_time.optgroups:
// "No Service" / "Road side service (2-5 min)" / "Service Park (10-60
// min)"). Purely a presentation grouping over the existing field; doesn't
// change the wire payload.
export const SERVICE_TIERS = {
  none: { key: 'none', label: 'No service', times: ['No Service'] },
  roadside: {
    key: 'roadside',
    label: 'Short roadside stop',
    times: ['2 minutes', '3 minutes', '4 minutes', '5 minutes'],
  },
  full: {
    key: 'full',
    label: 'Full service park',
    times: ['10 minutes', '15 minutes', '20 minutes', '30 minutes', '45 minutes', '60 minutes'],
  },
};

export function getServiceTier(serviceTime) {
  if (SERVICE_TIERS.roadside.times.includes(serviceTime)) return SERVICE_TIERS.roadside;
  if (SERVICE_TIERS.full.times.includes(serviceTime)) return SERVICE_TIERS.full;
  return SERVICE_TIERS.none;
}

// Parses the numeric km out of a catalog stage's `length` field (e.g.
// "13.4 km" -> 13.4), for rbr-rally-creator-web#18's per-leg/rally km
// totals. `stage` is the full catalog entry looked up via stageByCatalogId
// (see RoadBook) -- it's null/undefined when a stage brick hasn't had a
// stage_id assigned yet, and `length` could in principle be an unrecognized
// format, so this returns 0 rather than throwing in either case; callers
// summing across a leg/rally then just treat that brick as contributing
// nothing yet, instead of the whole total blowing up.
export function parseStageKm(stage) {
  const raw = stage?.length;
  if (typeof raw !== 'string') return 0;
  const match = raw.match(/[\d.]+/);
  if (!match) return 0;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) ? value : 0;
}

// Sums parsed km across a slice of stagePlan entries, given the
// catalog-id -> catalog-stage lookup map (RoadBook's stageByCatalogId).
// Shared by both a single leg's total and the whole rally's grand total --
// same math, just a different slice of stagePlan.
export function sumStagePlanKm(stagePlanSlice, stageByCatalogId) {
  return stagePlanSlice.reduce((total, stageConfig) => {
    const catalogStage = stageConfig.stage_id ? stageByCatalogId.get(stageConfig.stage_id) : null;
    return total + parseStageKm(catalogStage);
  }, 0);
}

// Renders a parsed km number back into the catalog's own display style
// (e.g. 13.4 -> "13.4 km") so that format only lives in one place.
export function formatKm(km) {
  return `${km.toFixed(1)} km`;
}
