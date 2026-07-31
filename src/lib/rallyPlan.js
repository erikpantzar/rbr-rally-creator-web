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
