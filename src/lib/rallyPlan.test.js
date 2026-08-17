import { describe, it, expect } from 'vitest';
import {
  applyLegFieldChange,
  applySharedLegFieldChange,
  isLegSynced,
  getSharedLegTimes,
  setLegSynced,
  createDefaultLegConfig,
  createLegConfigForAppend,
  clampLegTimes,
  isLegOpenTimeTooSoon,
  computeLegStageRanges,
  createDefaultStageConfig,
  createStageConfigForCatalogStage,
  normalizeLastStageService,
  getRecentServiceConfigs,
  parseStageKm,
  formatKm,
  applyPickedStageToConfig,
  createDefaultServiceFields,
  isSurfaceAgeChangeable,
  FIXED_SURFACE_AGE_ID,
  MAX_LEG_SPAN_DAYS,
  MIN_LEG_LEAD_MINUTES,
  CLAMP_LEG_LEAD_MINUTES,
} from './rallyPlan.js';

// All timestamps below are fixed "YYYY-MM-DDTHH:mm" datetime-local strings in
// mid-May, deliberately away from any DST transition so day arithmetic is
// stable, and every `now` is an explicit Date -- never Date.now()/stockholmNow().
const fixedNow = () => new Date(2026, 4, 10, 12, 0, 0); // 2026-05-10T12:00

function leg(open_time, close_time, stage_count = 0, synced = true) {
  return { open_time, close_time, stage_count, synced };
}

describe('applyLegFieldChange', () => {
  it('pushing open_time past its own close_time re-opens the window (snap lands at open + MAX_LEG_SPAN_DAYS)', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-05T10:00')];
    const result = applyLegFieldChange(legs, 0, 'open_time', '2026-05-06T10:00');
    expect(result[0].open_time).toBe('2026-05-06T10:00');
    expect(result[0].close_time).toBe('2026-05-13T10:00'); // +7d
  });

  it('a close_time edit beyond open + MAX_LEG_SPAN_DAYS is clamped back to the max span', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-05T10:00')];
    const result = applyLegFieldChange(legs, 0, 'close_time', '2026-05-11T10:00'); // +10d
    expect(result[0].close_time).toBe('2026-05-08T10:00'); // open + 7d
  });

  // rbr-rally-creator-web#127: the pre-sync version of this function used to
  // cascade an edited leg's times onto every FOLLOWING leg once it collided
  // with the next leg's open_time. That's gone now -- keeping legs in step
  // is the shared control's job, and a leg reachable through this function
  // is by definition either already overridden or being toggled between
  // sync states, so touching an unrelated sibling here would be wrong.
  it('touches only the edited leg, even when the new open_time collides with the next leg', () => {
    const legs = [
      leg('2026-05-01T10:00', '2026-05-06T10:00'),
      leg('2026-05-03T12:00', '2026-05-05T12:00'),
      leg('2026-05-05T14:00', '2026-05-07T14:00'),
    ];
    const result = applyLegFieldChange(legs, 0, 'open_time', '2026-05-04T10:00');
    expect(result[0].open_time).toBe('2026-05-04T10:00');
    expect(result[1]).toEqual(legs[1]);
    expect(result[2]).toEqual(legs[2]);
    expect(legs[0].open_time).toBe('2026-05-01T10:00'); // input array not mutated
  });
});

describe('isLegSynced', () => {
  it('is true when synced is explicitly true, and false only when explicitly false', () => {
    expect(isLegSynced({ synced: true })).toBe(true);
    expect(isLegSynced({ synced: false })).toBe(false);
  });

  it('defaults to true for legs with no synced key at all (pre-#127 saved drafts)', () => {
    expect(isLegSynced({ open_time: '', close_time: '' })).toBe(true);
  });
});

describe('getSharedLegTimes', () => {
  it("reads the first synced leg's open/close, ignoring overridden legs before it", () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-06T10:00', 0, false), leg('2026-05-02T10:00', '2026-05-07T10:00')];
    expect(getSharedLegTimes(legs)).toEqual({ open_time: '2026-05-02T10:00', close_time: '2026-05-07T10:00' });
  });

  it('falls back to the first leg when every leg has broken sync', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-06T10:00', 0, false)];
    expect(getSharedLegTimes(legs)).toEqual({ open_time: '2026-05-01T10:00', close_time: '2026-05-06T10:00' });
  });

  it('is empty-safe for an empty schedule', () => {
    expect(getSharedLegTimes([])).toEqual({ open_time: '', close_time: '' });
  });
});

describe('applySharedLegFieldChange', () => {
  it('applies the edit to every synced leg identically, leaving overridden legs untouched', () => {
    const legs = [
      leg('2026-05-01T10:00', '2026-05-06T10:00'),
      leg('2026-05-01T10:00', '2026-05-06T10:00', 0, false), // overridden, different close on purpose below
      leg('2026-05-01T10:00', '2026-05-06T10:00'),
    ];
    legs[1].close_time = '2026-05-20T10:00';

    const result = applySharedLegFieldChange(legs, 'open_time', '2026-05-03T10:00');

    expect(result[0]).toMatchObject({ open_time: '2026-05-03T10:00', close_time: '2026-05-06T10:00' });
    expect(result[2]).toMatchObject({ open_time: '2026-05-03T10:00', close_time: '2026-05-06T10:00' });
    expect(result[1]).toEqual(legs[1]); // overridden leg is completely untouched
  });

  it('applies the same max-span clamp per synced leg as a single-leg edit would', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-05T10:00'), leg('2026-05-01T10:00', '2026-05-05T10:00')];
    const result = applySharedLegFieldChange(legs, 'close_time', '2026-05-09T10:00'); // +8d
    expect(result[0].close_time).toBe('2026-05-08T10:00'); // open + 7d
    expect(result[1].close_time).toBe('2026-05-08T10:00');
  });

  it('is a no-op when no leg is synced', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-06T10:00', 0, false)];
    const result = applySharedLegFieldChange(legs, 'open_time', '2026-05-03T10:00');
    expect(result).toEqual(legs);
  });
});

describe('setLegSynced', () => {
  it('breaking sync (false) flips only that leg\'s flag, leaving its current times as-is', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-06T10:00'), leg('2026-05-01T10:00', '2026-05-06T10:00')];
    const result = setLegSynced(legs, 1, false);
    expect(result[1]).toEqual({ ...legs[1], synced: false });
    expect(result[0]).toEqual(legs[0]);
  });

  it('re-syncing (true) snaps the leg to the CURRENT shared value, even if it had drifted while overridden', () => {
    const legs = [
      leg('2026-05-01T10:00', '2026-05-06T10:00'),
      leg('2026-06-15T09:00', '2026-06-20T09:00', 0, false), // drifted while overridden
    ];
    const result = setLegSynced(legs, 1, true);
    expect(result[1]).toEqual({ open_time: '2026-05-01T10:00', close_time: '2026-05-06T10:00', stage_count: 0, synced: true });
  });
});

describe('createDefaultLegConfig', () => {
  it('defaults synced to true (rule 1: every leg starts sharing the default)', () => {
    expect(createDefaultLegConfig(0).synced).toBe(true);
  });
});

describe('createLegConfigForAppend', () => {
  it('joins the shared group, inheriting the current shared open/close rather than a fresh "now"', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-06T10:00', 2)];
    const appended = createLegConfigForAppend(legs, 0);
    expect(appended).toEqual({
      open_time: '2026-05-01T10:00',
      close_time: '2026-05-06T10:00',
      stage_count: 0,
      synced: true,
    });
  });

  it('falls back to createDefaultLegConfig for an empty schedule', () => {
    const appended = createLegConfigForAppend([], 0);
    expect(appended.synced).toBe(true);
    expect(appended.open_time).toBeTruthy();
  });
});

describe('clampLegTimes', () => {
  it('shifts open_time to now + CLAMP_LEG_LEAD_MINUTES and moves close_time by the same delta (duration preserved)', () => {
    const result = clampLegTimes('2026-05-01T10:00', '2026-05-03T10:00', fixedNow());
    expect(result.open_time).toBe('2026-05-10T12:10');
    expect(result.close_time).toBe('2026-05-12T12:10'); // still a 2-day leg
  });

  it('caps the shifted close_time at MAX_LEG_SPAN_DAYS after the new open_time', () => {
    // 10-day leg: after the shift the close would land 10 days out, over the 7-day cap.
    const result = clampLegTimes('2026-05-01T10:00', '2026-05-11T10:00', fixedNow());
    expect(result.open_time).toBe('2026-05-10T12:10');
    expect(result.close_time).toBe('2026-05-17T12:10'); // new open + 7d
  });

  it('handles unparseable open and missing close: open still clamps forward, close passes through', () => {
    const garbageOpen = clampLegTimes('not-a-date', '2026-05-12T10:00', fixedNow());
    expect(garbageOpen.open_time).toBe('2026-05-10T12:10');
    expect(garbageOpen.close_time).toBe('2026-05-12T10:00'); // delta 0, unchanged

    const noClose = clampLegTimes('2026-05-01T10:00', '', fixedNow());
    expect(noClose.open_time).toBe('2026-05-10T12:10');
    expect(noClose.close_time).toBe('');
  });
});

describe('isLegOpenTimeTooSoon', () => {
  it('is false for empty or unparseable open times (missing data is not a warning)', () => {
    expect(isLegOpenTimeTooSoon('', fixedNow())).toBe(false);
    expect(isLegOpenTimeTooSoon(null, fixedNow())).toBe(false);
    expect(isLegOpenTimeTooSoon('not-a-date', fixedNow())).toBe(false);
  });

  it('is true when open_time is in the past or inside the minimum lead window', () => {
    expect(isLegOpenTimeTooSoon('2026-05-10T11:00', fixedNow())).toBe(true); // past
    expect(isLegOpenTimeTooSoon('2026-05-10T12:04', fixedNow())).toBe(true); // 4 min < MIN_LEG_LEAD_MINUTES
  });

  it('is false at exactly now + MIN_LEG_LEAD_MINUTES (boundary is allowed)', () => {
    expect(MIN_LEG_LEAD_MINUTES).toBe(5);
    expect(isLegOpenTimeTooSoon('2026-05-10T12:05', fixedNow())).toBe(false);
  });
});

// rbr-rally-creator-web#123: super_rally moved from a per-leg field to a
// single rally-wide one (RallyBuilder's DEFAULT_RALLY_BASICS) -- a fresh leg
// no longer carries it at all.
describe('createDefaultLegConfig', () => {
  it('does not include a super_rally field', () => {
    expect(createDefaultLegConfig(3)).not.toHaveProperty('super_rally');
  });
});

describe('computeLegStageRanges', () => {
  it('turns per-leg stage counts into cumulative [start, end) ranges with 1-based start_stage_no', () => {
    const ranges = computeLegStageRanges([
      leg('', '', 3),
      leg('', '', 2),
      leg('', '', 0),
    ]);
    expect(ranges).toEqual([
      { startIndex: 0, endIndex: 3, startStageNo: 1 },
      { startIndex: 3, endIndex: 5, startStageNo: 4 },
      { startIndex: 5, endIndex: 5, startStageNo: 6 },
    ]);
  });

  it('treats missing or negative stage counts as zero and returns [] for an empty schedule', () => {
    expect(computeLegStageRanges([])).toEqual([]);
    const ranges = computeLegStageRanges([{ stage_count: -2 }, {}]);
    expect(ranges).toEqual([
      { startIndex: 0, endIndex: 0, startStageNo: 1 },
      { startIndex: 0, endIndex: 0, startStageNo: 1 },
    ]);
  });
});

describe('normalizeLastStageService', () => {
  it('forces the last stage to No Service (service_time, nummechanics, mechanicsSkill) without touching earlier stages', () => {
    const plan = [
      { service_time: '60 minutes', nummechanics: '6 mechanic', mechanicsSkill: 'Expert' },
      { service_time: '30 minutes', nummechanics: '4 mechanic', mechanicsSkill: 'Expert' },
    ];
    const result = normalizeLastStageService(plan);
    expect(result[1]).toEqual({
      service_time: 'No Service',
      nummechanics: 'No Service',
      mechanicsSkill: 'No Service',
    });
    expect(result[0]).toEqual(plan[0]);
    expect(plan[1].service_time).toBe('30 minutes'); // input not mutated
  });

  it('is a no-op (same reference) when the last stage already has No Service, and for an empty plan', () => {
    const plan = [{ service_time: 'No Service', nummechanics: 'No Service', mechanicsSkill: 'No Service' }];
    expect(normalizeLastStageService(plan)).toBe(plan);
    const empty = [];
    expect(normalizeLastStageService(empty)).toBe(empty);
  });
});

describe('getRecentServiceConfigs', () => {
  function serviced(uid, overrides = {}) {
    return {
      _uid: uid,
      service_time: '60 minutes',
      nummechanics: '6 mechanic',
      mechanicsSkill: 'Expert',
      _serviceEditedAt: 1000,
      ...overrides,
    };
  }

  it('excludes the stage being edited, No Service stages, and never-saved stages', () => {
    const plan = [
      serviced('a'),
      { _uid: 'b', service_time: 'No Service', nummechanics: 'No Service', mechanicsSkill: 'No Service' },
      { _uid: 'c', service_time: '30 minutes', nummechanics: '4 mechanic', mechanicsSkill: 'Skilled' }, // never saved, no timestamp
    ];
    expect(getRecentServiceConfigs(plan, 'a')).toEqual([]);
  });

  it('dedupes identical configs to one entry, keyed to the most recent edit', () => {
    const plan = [
      serviced('a', { _serviceEditedAt: 1000 }),
      serviced('b', { _serviceEditedAt: 3000 }),
      serviced('c', { _serviceEditedAt: 2000 }),
    ];
    const result = getRecentServiceConfigs(plan, 'x');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ service_time: '60 minutes', nummechanics: '6 mechanic', mechanicsSkill: 'Expert', editedAt: 3000 });
  });

  it('orders distinct configs most-recently-edited first', () => {
    const plan = [
      serviced('a', { service_time: '30 minutes', _serviceEditedAt: 1000 }),
      serviced('b', { service_time: '60 minutes', _serviceEditedAt: 3000 }),
      serviced('c', { service_time: '15 minutes', _serviceEditedAt: 2000 }),
    ];
    const result = getRecentServiceConfigs(plan, 'x');
    expect(result.map((c) => c.service_time)).toEqual(['60 minutes', '15 minutes', '30 minutes']);
  });

  it('caps the result at `limit` (default 4)', () => {
    const plan = ['30 minutes', '60 minutes', '15 minutes', '20 minutes', '45 minutes'].map((service_time, i) =>
      serviced(String(i), { service_time, _serviceEditedAt: i })
    );
    expect(getRecentServiceConfigs(plan, 'x')).toHaveLength(4);
    expect(getRecentServiceConfigs(plan, 'x', 2)).toHaveLength(2);
  });
});

describe('parseStageKm / formatKm', () => {
  it('parses the numeric km out of a catalog length and falls back to 0 for missing/unparseable stages', () => {
    expect(parseStageKm({ length: '13.4 km' })).toBe(13.4);
    expect(parseStageKm(null)).toBe(0); // unassigned brick
    expect(parseStageKm({ length: 'unknown' })).toBe(0);
    expect(parseStageKm({})).toBe(0);
  });

  it('formats km back in the catalog display style with one decimal', () => {
    expect(formatKm(13.4)).toBe('13.4 km');
    expect(formatKm(5)).toBe('5.0 km');
  });
});

describe('createStageConfigForCatalogStage', () => {
  it('arrives assigned to the catalog stage with a surface-matched tyre, defaults otherwise', () => {
    const config = createStageConfigForCatalogStage({ id: 42, surface: 'tarmac', name: 'Col de Turini' });
    const defaults = createDefaultStageConfig();
    expect(config.stage_id).toBe(42);
    expect(config.def_tyre_id).toBe('Tarmac Dry');
    expect(config.wetness_id).toBe(defaults.wetness_id);
    expect(config.service_time).toBe(defaults.service_time);
    expect(config._label).toBe('');
  });

  it('keeps the generic tyre default when the surface has no mapping', () => {
    const config = createStageConfigForCatalogStage({ id: 7, surface: 'moon dust' });
    expect(config.def_tyre_id).toBe(createDefaultStageConfig().def_tyre_id);
  });

  it('mints a fresh _uid per call so repeated adds of one stage stay distinct bricks', () => {
    const stage = { id: 42, surface: 'gravel' };
    expect(createStageConfigForCatalogStage(stage)._uid).not.toBe(
      createStageConfigForCatalogStage(stage)._uid
    );
  });
});

describe('applyPickedStageToConfig', () => {
  const config = { _uid: 'u1', stage_id: null, def_tyre_id: 'Gravel Dry', wetness_id: 'wet', tracksettings_id: 'Evening' };

  it('sets stage_id, surface-matched tyre default, and resets wetness/weather to the new stage\'s first option', () => {
    const stage = { id: 's-tarmac', surface: 'tarmac', wetnessOptions: ['dry', 'damp'], weatherOptions: ['Morning Clear'] };
    const result = applyPickedStageToConfig(config, stage);
    expect(result).toMatchObject({
      stage_id: 's-tarmac',
      def_tyre_id: 'Tarmac Dry',
      wetness_id: 'dry',
      tracksettings_id: 'Morning Clear',
    });
    expect(result).not.toBe(config); // no mutation of the input
    expect(config.stage_id).toBe(null);
  });

  it('leaves def_tyre_id untouched when the surface has no known default (defensive fallback)', () => {
    const stage = { id: 's-x', surface: 'lava', wetnessOptions: [], weatherOptions: [] };
    const result = applyPickedStageToConfig(config, stage);
    expect(result.def_tyre_id).toBe('Gravel Dry'); // carried over from config, not clobbered
  });

  it('resolves to a null stage_id and empty wetness/weather for a null stage (defensive)', () => {
    const result = applyPickedStageToConfig(config, null);
    expect(result).toMatchObject({ stage_id: null, wetness_id: '', tracksettings_id: '' });
  });

  it('rbr-rally-creator-web#128: pins surface_age_id to "New" when the picked stage cannot vary it', () => {
    const wornConfig = { ...config, surface_age_id: '3' };
    const stage = {
      id: 's-fixed',
      surface: 'tarmac',
      supportsVariableSurface: false,
      wetnessOptions: ['dry'],
      weatherOptions: ['Noon Clear'],
    };
    const result = applyPickedStageToConfig(wornConfig, stage);
    expect(result.surface_age_id).toBe(FIXED_SURFACE_AGE_ID);
  });

  it('leaves surface_age_id untouched when the picked stage does support variable surface age', () => {
    const wornConfig = { ...config, surface_age_id: '3' };
    const stage = {
      id: 's-variable',
      surface: 'tarmac',
      supportsVariableSurface: true,
      wetnessOptions: ['dry'],
      weatherOptions: ['Noon Clear'],
    };
    const result = applyPickedStageToConfig(wornConfig, stage);
    expect(result.surface_age_id).toBe('3');
  });
});

describe('isSurfaceAgeChangeable', () => {
  it('is false only when the stage explicitly says so', () => {
    expect(isSurfaceAgeChangeable({ supportsVariableSurface: false })).toBe(false);
  });

  it('defaults to true for stages that support it, are missing the field, or are null', () => {
    expect(isSurfaceAgeChangeable({ supportsVariableSurface: true })).toBe(true);
    expect(isSurfaceAgeChangeable({})).toBe(true);
    expect(isSurfaceAgeChangeable(null)).toBe(true);
  });
});

describe('constants', () => {
  it('keeps the leg span cap one day under the confirmed 8-day open-to-close site limit', () => {
    expect(MAX_LEG_SPAN_DAYS).toBe(7);
    expect(CLAMP_LEG_LEAD_MINUTES).toBeGreaterThan(MIN_LEG_LEAD_MINUTES);
  });
});

// rbr-rally-creator-web#107: extracted so the workspace's "Add service after
// this stage" shortcut and a brand-new stage's seed config can never drift
// apart -- see the two assertions below.
describe('createDefaultServiceFields', () => {
  it('gives a real (non-"No Service") starting tier', () => {
    const fields = createDefaultServiceFields();
    expect(fields.service_time).toBe('60 minutes');
    expect(fields.nummechanics).toBe('6 mechanic');
    expect(fields.mechanicsSkill).toBe('Expert');
  });

  it('matches exactly the service fields a freshly-created stage config seeds', () => {
    const fresh = createDefaultStageConfig();
    const shortcut = createDefaultServiceFields();
    expect({
      service_time: fresh.service_time,
      nummechanics: fresh.nummechanics,
      mechanicsSkill: fresh.mechanicsSkill,
    }).toEqual(shortcut);
  });
});
