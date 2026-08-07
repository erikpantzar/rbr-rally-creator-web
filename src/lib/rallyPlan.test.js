import { describe, it, expect } from 'vitest';
import {
  applyLegFieldChange,
  clampLegTimes,
  isLegOpenTimeTooSoon,
  computeLegStageRanges,
  normalizeLastStageService,
  parseStageKm,
  formatKm,
  applyPickedStageToConfig,
  createDefaultServiceFields,
  createDefaultStageConfig,
  MAX_LEG_SPAN_DAYS,
  MIN_LEG_LEAD_MINUTES,
  CLAMP_LEG_LEAD_MINUTES,
} from './rallyPlan.js';

// All timestamps below are fixed "YYYY-MM-DDTHH:mm" datetime-local strings in
// mid-May, deliberately away from any DST transition so day arithmetic is
// stable, and every `now` is an explicit Date -- never Date.now()/stockholmNow().
const fixedNow = () => new Date(2026, 4, 10, 12, 0, 0); // 2026-05-10T12:00

function leg(open_time, close_time, stage_count = 0) {
  return { open_time, close_time, super_rally: 'disabled', stage_count };
}

describe('applyLegFieldChange', () => {
  it('pushing open_time past its own close_time re-opens the window (snap lands at open + MAX_LEG_SPAN_DAYS)', () => {
    // Rule 1's comment says "snap close_time to exactly open_time + 7 days",
    // but rule 2 (the max-span clamp, which also runs on open_time edits)
    // immediately pulls that +7d snap back down to +MAX_LEG_SPAN_DAYS (6d).
    // Documenting the actual net behavior: close = open + 6 days.
    const legs = [leg('2026-05-01T10:00', '2026-05-05T10:00')];
    const result = applyLegFieldChange(legs, 0, 'open_time', '2026-05-06T10:00');
    expect(result[0].open_time).toBe('2026-05-06T10:00');
    expect(result[0].close_time).toBe('2026-05-12T10:00'); // +6d, not the commented +7d
  });

  it('a close_time edit beyond open + MAX_LEG_SPAN_DAYS is clamped back to the max span', () => {
    const legs = [leg('2026-05-01T10:00', '2026-05-05T10:00')];
    const result = applyLegFieldChange(legs, 0, 'close_time', '2026-05-09T10:00'); // +8d
    expect(result[0].close_time).toBe('2026-05-07T10:00'); // open + 6d
  });

  it('editing a leg open_time to at/after the next leg resets every following leg to the edited leg times', () => {
    const legs = [
      leg('2026-05-01T10:00', '2026-05-06T10:00'),
      leg('2026-05-03T12:00', '2026-05-05T12:00'),
      leg('2026-05-05T14:00', '2026-05-07T14:00'),
    ];
    // New open (05-04) stays before leg 0's own close (05-06), so only the
    // cascade rule fires: legs 1 and 2 are reset to leg 0's exact times.
    const result = applyLegFieldChange(legs, 0, 'open_time', '2026-05-04T10:00');
    expect(result[1]).toMatchObject({ open_time: '2026-05-04T10:00', close_time: '2026-05-06T10:00' });
    expect(result[2]).toMatchObject({ open_time: '2026-05-04T10:00', close_time: '2026-05-06T10:00' });
  });

  it('leaves following legs untouched when the edited open_time stays before the next leg', () => {
    const legs = [
      leg('2026-05-01T10:00', '2026-05-03T10:00'),
      leg('2026-05-03T12:00', '2026-05-05T12:00'),
    ];
    const result = applyLegFieldChange(legs, 0, 'open_time', '2026-05-02T10:00');
    expect(result[0].open_time).toBe('2026-05-02T10:00');
    expect(result[1]).toEqual(legs[1]);
    expect(legs[0].open_time).toBe('2026-05-01T10:00'); // input array not mutated
  });
});

describe('clampLegTimes', () => {
  it('shifts open_time to now + CLAMP_LEG_LEAD_MINUTES and moves close_time by the same delta (duration preserved)', () => {
    const result = clampLegTimes('2026-05-01T10:00', '2026-05-03T10:00', fixedNow());
    expect(result.open_time).toBe('2026-05-10T12:10');
    expect(result.close_time).toBe('2026-05-12T12:10'); // still a 2-day leg
  });

  it('caps the shifted close_time at MAX_LEG_SPAN_DAYS after the new open_time', () => {
    // 8-day leg: after the shift the close would land 8 days out, over the 6-day cap.
    const result = clampLegTimes('2026-05-01T10:00', '2026-05-09T10:00', fixedNow());
    expect(result.open_time).toBe('2026-05-10T12:10');
    expect(result.close_time).toBe('2026-05-16T12:10'); // new open + 6d
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
});

describe('constants', () => {
  it('keeps the leg span cap safely under the site 7-day open-to-close limit', () => {
    expect(MAX_LEG_SPAN_DAYS).toBe(6);
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
