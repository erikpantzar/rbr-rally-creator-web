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

// The service-fields portion of a fresh stage's defaults, pulled out on its
// own (rbr-rally-creator-web#107, "Add service after this stage" shortcut)
// so a stage that already has a real config -- surface/tyre/etc already
// set, just no service yet -- can be handed a sensible starting service
// without dragging in createDefaultStageConfig's unrelated defaults (which
// would stomp fields this stage already has). Same three values a
// freshly-created stage config seeds below, kept in exactly one place so
// the two "what does a stage's service start as" call sites (a brand-new
// brick, and this shortcut) can never drift apart.
export function createDefaultServiceFields() {
  return {
    service_time: '60 minutes',
    nummechanics: '6 mechanic',
    mechanicsSkill: 'Expert',
  };
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
    ...createDefaultServiceFields(),
    // Real site field (rbr-rally-creator-service#20): the public per-stage
    // name shown to participants when rallyBasics.hidden_stage_name is
    // checked. Sent to the backend as-is -- distinct from `_label` below.
    hidden_name: '',
    // Client-side-only planning nickname (rbr-rally-creator-web#64) --
    // underscore-prefixed, stripped before submission in RallyBuilder's
    // handleCreateRally, never sent to the site. NOT the same field as
    // hidden_name above: this is a private "what am I looking at" label for
    // the person building the rally, hidden_name is the public name
    // participants see on rallysimfans.hu.
    _label: '',
  };
}

// Used by the brick "Duplicate" action -- same config values as an existing
// stage, but a fresh _uid so it's a genuinely new brick rather than an alias
// for the one it was copied from. _label is deliberately carried over here
// (unlike createStageConfigFromPrevious's explicit reset) -- "Duplicate"
// means "make another copy of this exact stage", and a nickname is part of
// that stage's identity the same way its surface/tyre/service config is.
// It's on the user to rename the copy if they don't want a shared label; the
// alternative (silently blanking it) would be a surprising exception to
// "Duplicate copies everything" for this one field only.
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

// rbr-rally-creator-web#128: some catalog stages don't let the rally
// organizer change surface age/condition at all -- confirmed against a
// beta tester's real submit, where an unsupported pick ("Worn") came back
// silently reset to "New" rather than rejected. `stage.supportsVariableSurface`
// (rbr-rally-creator-service's discovery/capabilities/stages.json, scraped
// from stages.php's "surface" capability column) is the per-stage flag for
// this. '1' is the surfaceAge option's "New" value (rallyOptions.js /
// MOCK_RALLY_OPTIONS.surfaceAge) -- hardcoded here rather than derived from
// `options`, same "deliberately hardcoded, a rename shows up as a mismatch
// instead of silently drifting" reasoning as SURFACE_DEFAULT_TYRE above.
export const FIXED_SURFACE_AGE_ID = '1';

export function getDefaultTyreForSurface(surface) {
  return SURFACE_DEFAULT_TYRE[surface] ?? null;
}

export function getWetTyreForSurface(surface) {
  return SURFACE_WET_TYRE[surface] ?? null;
}

// Defensive default (`!== false`) so a stage record missing the field
// entirely (older cached catalog data, a mock stage in a test) reads as
// changeable rather than silently locking a control that used to work --
// only an explicit `false` from the catalog locks it.
export function isSurfaceAgeChangeable(stage) {
  return stage?.supportsVariableSurface !== false;
}

// A stage entry born already assigned to a catalog stage -- the Explore
// view's "Add" action (add-a-stage-from-the-map). Unlike the builder's
// blank slots above, the whole point here is arriving with stage_id set;
// the tyre default mirrors what StageEntryEditor applies at the moment a
// stage is picked there, so a stage added from the map ends up configured
// exactly as if it had been picked in the editor. Every other field keeps
// createDefaultStageConfig's defaults and stays editable in the builder.
export function createStageConfigForCatalogStage(stage) {
  const config = { ...createDefaultStageConfig(), stage_id: stage.id };
  const defaultTyre = getDefaultTyreForSurface(stage.surface);
  if (defaultTyre) config.def_tyre_id = defaultTyre;
  return config;
}

// What "picking a stage card" always means to a stage config, regardless of
// whether that pick is creating a brand-new brick (PickerWorkspace's
// click-to-add, rbr-rally-creator-web#107 Phase 2, D2) or retargeting an
// existing one ("Change stage", same doc, R6). Extracted so both call
// sites share one definition instead of forking it -- previously this logic
// lived only inline in StageEntryEditor's picker onSelect. Surface-matched
// tyre default (rbr-rally-creator-web#24) plus a reset of wetness/weather
// to the new stage's first option, since those option lists are per-stage
// (discovery/capabilities/stages.json) and a value valid for the old pick
// may not exist on the new one. Returns a whole new config object so
// callers can pass the result straight to onChange/onStagePlanChange in one
// atomic write (R6: stage_id and its dependent fields must never be split
// across two patches).
export function applyPickedStageToConfig(config, stage) {
  const defaultTyre = stage ? getDefaultTyreForSurface(stage.surface) : null;
  return {
    ...config,
    stage_id: stage?.id ?? null,
    ...(defaultTyre ? { def_tyre_id: defaultTyre } : {}),
    // rbr-rally-creator-web#128: a stage that doesn't support changing
    // surface age always runs as "New" on the real site -- pin the config
    // to that outcome the moment such a stage is picked, rather than
    // carrying forward a previous pick's age (or the generic default)
    // that's about to be disabled and misleading in the editor.
    ...(stage && !isSurfaceAgeChangeable(stage) ? { surface_age_id: FIXED_SURFACE_AGE_ID } : {}),
    wetness_id: stage?.wetnessOptions?.[0] ?? '',
    tracksettings_id: stage?.weatherOptions?.[0] ?? '',
  };
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm", in the browser's local
// time, not toISOString() (which is UTC and includes seconds/Z).
export function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// rbr-rally-creator-web#63: rallysimfans.hu itself runs on Europe/Stockholm
// time (CET/CEST -- UTC+1 in winter, UTC+2 in summer) no matter where the
// browser visiting this app happens to be. Every "now" used to reason about
// leg open/close timing (isLegOpenTimeTooSoon's default, createDefaultLegConfig's
// seed values, the fix-stale-times button in RallyBuilder) needs to mean
// Stockholm's wall-clock "now", not the visiting browser's local "now" --
// otherwise a visitor in, say, US/Pacific gets a "too soon" check (or a
// freshly-seeded default) that doesn't match what the real site would
// consider valid.
//
// Trick: ask Intl for Stockholm's wall-clock parts for the current instant,
// then build a plain `new Date(year, month-1, day, hour, minute, second)`
// from those parts. The resulting Date's epoch value is technically "wrong"
// (it's not Stockholm time correctly re-encoded at the UTC level) -- but
// every other function in this file only ever reads the LOCAL getters
// (.getFullYear/.getMonth/.getDate/.getHours/.getMinutes, see
// toDatetimeLocalValue just above) rather than doing absolute epoch math, so
// a Date whose local getters report Stockholm's wall-clock numbers is
// exactly what they need, regardless of what timezone the runtime itself is
// configured for. E.g. if the current instant is 14:00 UTC, Stockholm
// (UTC+1 in winter) reads that instant as 15:00 wall-clock -- Intl's
// timeZone option performs that UTC->Stockholm conversion for us, and the
// Date we construct from the resulting parts reports .getHours() === 15 no
// matter the runtime's own timezone.
export function stockholmNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    // hourCycle: 'h23' guarantees hour is always "00"-"23" -- hour12: false
    // has a documented quirk in some engines of reporting midnight as "24"
    // instead of "00".
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = (type) => Number(parts.find((p) => p.type === type)?.value);

  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
}

// rbr-rally-creator-web#126: beta tester (oka22) reported the real site
// allows up to 8-day rallies, since confirmed by rbr-rally-creator-service's
// discovery capture of the live wizard's own client-side JS
// (discovery/create-rally-wizard/step3.html: `const max_open_day = 8;`,
// the flatpickr bound on the close_time picker). Deliberately capped one
// day under that confirmed 8-day site limit rather than riding the exact
// edge of it -- same "stay safely inside the real limit" reasoning as the
// original 6-day guess, just re-anchored to a confirmed number instead of
// an uncited one. Must stay in sync with rbr-rally-creator-service's own
// LEG_MAX_SPAN_DAYS (src/lib/legTimeRules.js) -- the two are the frontend
// and backend halves of the same cap.
export const MAX_LEG_SPAN_DAYS = 7;

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
// just from editing the field itself. Defaults to stockholmNow() rather than
// the browser's own new Date() (rbr-rally-creator-web#63) since it's
// rallysimfans.hu's own clock, not the visiting browser's, that determines
// whether this leg is actually too soon.
export function isLegOpenTimeTooSoon(openTime, now = stockholmNow()) {
  if (!openTime) return false;
  const openDate = new Date(openTime);
  if (Number.isNaN(openDate.getTime())) return false;
  const minOpenDate = new Date(now.getTime() + MIN_LEG_LEAD_MINUTES * 60 * 1000);
  return openDate < minOpenDate;
}

// Shared clamp math, extracted out of RallyBuilder's "fix stale start times"
// button handler so it's a plain, named, exported, unit-testable helper
// instead of inlined event-handler math. Mirrors rbr-rally-creator-service's
// own normalizeLegTimes (src/lib/legTimeRules.js) shape/reasoning exactly --
// same two rules, just phrased over this app's "YYYY-MM-DDTHH:mm"
// datetime-local strings and stockholmNow() instead of the backend's
// caller-supplied `now`:
//  - shift open_time forward to `now + CLAMP_LEG_LEAD_MINUTES` (the backend's
//    own safety-net lead, rbr-rally-creator-service#11) -- callers only ever
//    invoke this for a leg already confirmed too-soon (isLegOpenTimeTooSoon),
//    so unlike the backend's version this doesn't re-check that condition
//    itself, it just performs the shift;
//  - shift close_time by that same delta so the leg's originally-intended
//    open->close duration survives the move;
//  - cap close_time at MAX_LEG_SPAN_DAYS from the new open_time, same as
//    handleLegFieldChange's manual-edit clamp above.
// `now` defaults to stockholmNow() (rallysimfans.hu's own clock, not the
// browser's) but takes it as a parameter -- same "deterministic/testable,
// caller controls which now" reasoning as the backend's normalizeLegTimes.
export function clampLegTimes(openTime, closeTime, now = stockholmNow()) {
  const newOpenDate = new Date(now.getTime() + CLAMP_LEG_LEAD_MINUTES * 60 * 1000);

  const oldOpenDate = new Date(openTime);
  const deltaMs = Number.isNaN(oldOpenDate.getTime())
    ? 0
    : newOpenDate.getTime() - oldOpenDate.getTime();

  let newCloseDate = null;
  const oldCloseDate = new Date(closeTime);
  if (closeTime && !Number.isNaN(oldCloseDate.getTime())) {
    newCloseDate = new Date(oldCloseDate.getTime() + deltaMs);

    const maxCloseDate = new Date(newOpenDate);
    maxCloseDate.setDate(maxCloseDate.getDate() + MAX_LEG_SPAN_DAYS);
    if (newCloseDate > maxCloseDate) {
      newCloseDate = maxCloseDate;
    }
  }

  return {
    open_time: toDatetimeLocalValue(newOpenDate),
    close_time: newCloseDate ? toDatetimeLocalValue(newCloseDate) : closeTime,
  };
}

// Shared open/close consistency math, factored out of the old #89
// applyLegFieldChange so both a single-leg edit (applyLegFieldChange below)
// and a shared-control edit (applySharedLegFieldChange, #127) apply the
// exact same two rules to whichever leg they're touching:
//
//  1. Own-leg consistency -- if the edited open_time now lands at or after
//     the leg's own close_time, snap close_time to exactly open_time +
//     MAX_LEG_SPAN_DAYS rather than leaving an inverted/zero-length window
//     on screen. This only fires from an open_time edit -- a close_time
//     edit that's simply earlier than open_time is caught by rule 2 below.
//
//  2. Max-span clamp -- pulls close_time back down if it now exceeds
//     open_time + MAX_LEG_SPAN_DAYS, regardless of which field was edited.
function applyLegTimeConsistencyRules(leg, field, value) {
  let updated = { ...leg, [field]: value };

  if (field === 'open_time' && updated.open_time && updated.close_time) {
    const openDate = new Date(updated.open_time);
    const closeDate = new Date(updated.close_time);
    if (!Number.isNaN(openDate.getTime()) && !Number.isNaN(closeDate.getTime()) && openDate >= closeDate) {
      const newCloseDate = new Date(openDate);
      newCloseDate.setDate(newCloseDate.getDate() + MAX_LEG_SPAN_DAYS);
      updated = { ...updated, close_time: toDatetimeLocalValue(newCloseDate) };
    }
  }

  if ((field === 'open_time' || field === 'close_time') && updated.open_time && updated.close_time) {
    const openDate = new Date(updated.open_time);
    const closeDate = new Date(updated.close_time);
    const maxCloseDate = new Date(openDate);
    maxCloseDate.setDate(maxCloseDate.getDate() + MAX_LEG_SPAN_DAYS);

    if (!Number.isNaN(closeDate.getTime()) && closeDate > maxCloseDate) {
      updated = { ...updated, close_time: toDatetimeLocalValue(maxCloseDate) };
    }
  }

  return updated;
}

// rbr-rally-creator-web#89, revised by #127: applies a manual edit to ONE
// leg's own open_time/close_time field -- the own-leg consistency +
// max-span rules above, nothing else. Reachable from the UI only for a leg
// that has broken sync (see setLegSynced below); a still-synced leg's
// open/close is edited through applySharedLegFieldChange instead. (Super
// Rally is no longer a per-leg field -- rbr-rally-creator-web#123 moved it
// to a single rally-wide control in RallyBasicsForm.)
//
// #89's original version of this function also cascaded the edit onto
// every FOLLOWING leg once it collided with the next leg's open_time, to
// keep an all-independent leg list in chronological order. #127 replaces
// that need: keeping legs in step is now the shared control's job (rule 1
// of the agreed behavior), and a leg that's deliberately been overridden
// should never have its independent times silently overwritten by a sibling
// edit (rule 3) -- so the cascade is gone, and this is back to a plain,
// single-leg write.
export function applyLegFieldChange(legSchedule, legIndex, field, value) {
  const newLegs = [...legSchedule];
  newLegs[legIndex] = applyLegTimeConsistencyRules(newLegs[legIndex], field, value);
  return newLegs;
}

// rbr-rally-creator-web#127: whether a leg follows the rally-wide shared
// open/close control (the default -- rule 1 of the agreed behavior) or has
// broken out with its own times via "set different times for this leg"
// (rule 2). Saved drafts/history (rallyStorage) from before this field
// existed have no `synced` key at all -- treated as synced, same as the
// field's own default, so restoring one doesn't silently scatter every leg
// into independent-override mode.
export function isLegSynced(leg) {
  return leg.synced !== false;
}

// The one open/close pair the shared control reads and edits. By
// construction every synced leg holds identical open_time/close_time --
// applySharedLegFieldChange below is the only writer for synced legs, and
// it always applies the same edit to every one of them at once -- so
// reading the first synced leg's values is enough. Falls back to the first
// leg overall when nothing is synced (every leg has been overridden), so
// the control still has a sane starting point rather than blank inputs.
export function getSharedLegTimes(legSchedule) {
  const source = legSchedule.find(isLegSynced) ?? legSchedule[0];
  return { open_time: source?.open_time ?? '', close_time: source?.close_time ?? '' };
}

// rbr-rally-creator-web#127: the shared open/close control's onChange --
// applies the same own-leg consistency/max-span rules as a single-leg edit
// (applyLegTimeConsistencyRules) to every leg still following the default
// (isLegSynced), and leaves overridden legs (rule 2) completely untouched.
// Since every synced leg shares identical open_time/close_time going in,
// applying the identical field/value edit to each individually keeps them
// identical coming out -- rule 3, "legs left unchanged keep following the
// default", holds for every render after this.
export function applySharedLegFieldChange(legSchedule, field, value) {
  return legSchedule.map((leg) => (isLegSynced(leg) ? applyLegTimeConsistencyRules(leg, field, value) : leg));
}

// rbr-rally-creator-web#127: the "set different times for this leg" /
// "use shared times" toggle -- the one place a leg's `synced` flag changes.
// Breaking sync (synced: false) leaves the leg's current open_time/
// close_time exactly as they are (they already match the shared value the
// moment sync breaks), so its now-independent inputs start from where the
// shared control had it rather than some unrelated default. Re-syncing
// (synced: true) snaps them back to the CURRENT shared value immediately,
// rather than leaving its stale independent times on screen until the next
// shared-control edit happens to overwrite them.
export function setLegSynced(legSchedule, legIndex, synced) {
  if (synced) {
    const { open_time, close_time } = getSharedLegTimes(legSchedule);
    return legSchedule.map((leg, i) => (i === legIndex ? { ...leg, synced: true, open_time, close_time } : leg));
  }
  return legSchedule.map((leg, i) => (i === legIndex ? { ...leg, synced: false } : leg));
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
    // A hidden/public name and a planning nickname are both labels for one
    // specific physical stage, not a config preference like surface
    // age/tyre that makes sense to reuse -- carrying either forward here
    // (the way stage_id itself explicitly isn't) would just seed a
    // brand-new, not-yet-assigned stage with a confusing duplicate name.
    hidden_name: '',
    _label: '',
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
// other than "starting now". Seeded from stockholmNow() rather than the
// browser's own new Date() (rbr-rally-creator-web#63) for the same reason as
// isLegOpenTimeTooSoon above -- "now" here means rallysimfans.hu's own
// Stockholm clock, not the visiting browser's.
//
// rbr-rally-creator-web#127: synced: true is the default every leg starts
// with -- rule 1 of the agreed behavior ("all legs share one open/close
// time" by default). Used for a rally's very first leg (there's no existing
// schedule to inherit shared times from yet); createLegConfigForAppend
// below is what a leg ADDED to an already-existing schedule actually uses.
export function createDefaultLegConfig(stageCount = 0) {
  const now = stockholmNow();
  const closeDate = new Date(now);
  closeDate.setDate(closeDate.getDate() + MAX_LEG_SPAN_DAYS);

  return {
    open_time: toDatetimeLocalValue(now),
    close_time: toDatetimeLocalValue(closeDate),
    stage_count: stageCount,
    synced: true,
  };
}

// rbr-rally-creator-web#127: seeds a leg appended to an ALREADY-EXISTING
// legSchedule (RoadBook's "+ Add Leg" button, and the workspace's own "+
// Add leg" shortcut, pickerWorkspace.js's applyAddLeg). Joins the shared
// group and starts from the CURRENT shared open/close (getSharedLegTimes)
// rather than a freshly-computed "now" default -- otherwise the new leg
// would carry synced: true while visibly showing different times than
// every other synced leg until the user happened to touch the shared
// control again. Falls back to createDefaultLegConfig's own stockholmNow()
// seed when there's no existing leg to inherit from (shouldn't normally
// happen here -- a rally always has at least one leg -- but keeps this safe
// to call on an empty schedule too).
export function createLegConfigForAppend(legSchedule, stageCount = 0) {
  if (legSchedule.length === 0) return createDefaultLegConfig(stageCount);
  const { open_time, close_time } = getSharedLegTimes(legSchedule);
  return { open_time, close_time, stage_count: stageCount, synced: true };
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

// Powers ServiceEntryForm's "Reuse a service" row -- most rallies reuse one
// or two service setups across many stages, so surfacing configs already
// used elsewhere in THIS stagePlan saves re-picking tier/duration/
// mechanics/skill from scratch each time. Deliberately scoped to the
// current stagePlan only, no cross-rally persistence -- a fresh rally
// starts with an empty list, same "derive from what's already in the plan,
// no new storage" approach as the rest of this file.
//
// Ordered by most-recently-edited, not most-used: reuse is "the thing I
// just set up", not "the thing that happens to appear most". Relies on
// `_serviceEditedAt`, a client-only timestamp applyServiceFieldsUpdate
// (pickerWorkspace.js) stamps on every service save -- never sent to the
// service, stripped alongside _uid/_label in RallyBuilder's submit payload.
// A stage that was never actually saved through the service form (still
// carrying createDefaultStageConfig's seeded defaults, or forced to "No
// Service" by normalizeLastStageService) has no timestamp and is excluded,
// which is exactly the "only real, deliberately-configured services" set
// reuse should offer.
//
// Deduped by the (service_time, nummechanics, mechanicsSkill) tuple, so
// five stages sharing one config surface as ONE chip -- keyed to whichever
// of them was edited most recently -- rather than five near-identical
// entries.
export function getRecentServiceConfigs(stagePlan, excludeUid, limit = 4) {
  const byConfig = new Map();

  for (const stage of stagePlan) {
    if (stage._uid === excludeUid) continue;
    if (stage.service_time === 'No Service') continue;
    if (stage._serviceEditedAt == null) continue;

    const key = `${stage.service_time}|${stage.nummechanics}|${stage.mechanicsSkill}`;
    const existing = byConfig.get(key);
    if (!existing || stage._serviceEditedAt > existing.editedAt) {
      byConfig.set(key, {
        service_time: stage.service_time,
        nummechanics: stage.nummechanics,
        mechanicsSkill: stage.mechanicsSkill,
        editedAt: stage._serviceEditedAt,
      });
    }
  }

  return [...byConfig.values()].sort((a, b) => b.editedAt - a.editedAt).slice(0, limit);
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
