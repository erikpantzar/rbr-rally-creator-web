import { describe, it, expect } from 'vitest';
import {
  aggregateStagesByCountry,
  resolveShapeName,
  buildShapeNameIndex,
  annotateWithShapeNames,
  WEATHER_SAMPLE_SIZE,
} from './countryExplore.js';

// Minimal catalog-shaped stage rows (see mockData.js's MOCK_STAGES for the
// full real shape) -- only the fields the aggregation reads.
function stage(overrides = {}) {
  return {
    id: 1,
    name: 'Test Stage',
    country: 'Sweden',
    length: '10.0 km',
    surface: 'gravel',
    wetnessOptions: ['dry', 'damp', 'wet'],
    weatherOptions: ['Morning Clear Crisp'],
    ...overrides,
  };
}

describe('aggregateStagesByCountry', () => {
  it('groups stages per country, sorted by country name', () => {
    const result = aggregateStagesByCountry([
      stage({ country: 'Sweden' }),
      stage({ country: 'Finland' }),
      stage({ country: 'Sweden' }),
    ]);
    expect(result.map((s) => s.country)).toEqual(['Finland', 'Sweden']);
    expect(result.map((s) => s.stageCount)).toEqual([1, 2]);
  });

  it('counts surfaces per country, sorted by count desc then name', () => {
    const result = aggregateStagesByCountry([
      stage({ surface: 'tarmac' }),
      stage({ surface: 'gravel' }),
      stage({ surface: 'gravel' }),
      stage({ surface: 'snow' }),
    ]);
    expect(result[0].surfaces).toEqual([
      { surface: 'gravel', count: 2 },
      { surface: 'snow', count: 1 },
      { surface: 'tarmac', count: 1 },
    ]);
  });

  it('unions wetness options in canonical dry/damp/wet order, unknown values last', () => {
    const result = aggregateStagesByCountry([
      stage({ wetnessOptions: ['wet'] }),
      stage({ wetnessOptions: ['damp', 'dry'] }),
      stage({ wetnessOptions: ['slush'] }),
    ]);
    expect(result[0].wetnessOptions).toEqual(['dry', 'damp', 'wet', 'slush']);
  });

  it('samples distinct weather options, excludes the "default" placeholder, and reports the true total', () => {
    const result = aggregateStagesByCountry([
      stage({ weatherOptions: ['W1', 'W2', 'W3', 'default'] }),
      stage({ weatherOptions: ['W2', 'W4', 'W5', 'W6'] }),
    ]);
    const [summary] = result;
    expect(summary.weatherTotal).toBe(6);
    expect(summary.weatherSample).toHaveLength(WEATHER_SAMPLE_SIZE);
    expect(summary.weatherSample).not.toContain('default');
    // Sample is a subset of the distinct union.
    for (const option of summary.weatherSample) {
      expect(['W1', 'W2', 'W3', 'W4', 'W5', 'W6']).toContain(option);
    }
  });

  it('computes km range over parseable lengths and ignores unparseable ones', () => {
    const result = aggregateStagesByCountry([
      stage({ length: '3.0 km' }),
      stage({ length: '18.1 km' }),
      stage({ length: undefined }),
      stage({ length: 'unknown' }),
    ]);
    expect(result[0].kmRange).toEqual({ min: 3.0, max: 18.1 });
  });

  it('reports a null km range when no stage length parses', () => {
    const result = aggregateStagesByCountry([stage({ length: undefined })]);
    expect(result[0].kmRange).toBeNull();
  });

  it('buckets stages with a missing/blank country under "Unknown" instead of dropping them', () => {
    const result = aggregateStagesByCountry([
      stage({ country: undefined }),
      stage({ country: '   ' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].country).toBe('Unknown');
    expect(result[0].stageCount).toBe(2);
  });

  it('sorts each country detail stage list by stage name', () => {
    const result = aggregateStagesByCountry([
      stage({ name: 'Zeta' }),
      stage({ name: 'Alpha' }),
    ]);
    expect(result[0].stages.map((s) => s.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('returns an empty array for an empty catalog', () => {
    expect(aggregateStagesByCountry([])).toEqual([]);
  });
});

describe('resolveShapeName', () => {
  // Real Natural Earth names from the vendored map that differ from the
  // catalog spellings the aliases exist for.
  const index = buildShapeNameIndex([
    'Sweden',
    'Czechia',
    'United States of America',
    'United Kingdom',
    "Côte d'Ivoire",
  ]);

  it('matches exact names directly', () => {
    expect(resolveShapeName('Sweden', index)).toBe('Sweden');
  });

  it('matches case-insensitively', () => {
    expect(resolveShapeName('sweden', index)).toBe('Sweden');
  });

  it('bridges catalog spellings to Natural Earth names via the alias table', () => {
    expect(resolveShapeName('Czech Republic', index)).toBe('Czechia');
    expect(resolveShapeName('USA', index)).toBe('United States of America');
    expect(resolveShapeName('Wales', index)).toBe('United Kingdom');
    expect(resolveShapeName('Ivory Coast', index)).toBe("Côte d'Ivoire");
  });

  it('returns null for names neither the map nor the alias table knows', () => {
    expect(resolveShapeName('Atlantis', index)).toBeNull();
    expect(resolveShapeName('', index)).toBeNull();
    expect(resolveShapeName(undefined, index)).toBeNull();
  });

  it('fails closed when an alias points at a shape missing from the map', () => {
    // 'Czech Republic' aliases to 'Czechia' -- with no Czechia shape in the
    // index the alias must resolve to null (UI flags it), not to the
    // dangling alias target.
    const noCzechia = buildShapeNameIndex(['Sweden']);
    expect(resolveShapeName('Czech Republic', noCzechia)).toBeNull();
  });
});

describe('annotateWithShapeNames', () => {
  it('adds shapeName to each summary, null for unmatched countries', () => {
    const index = buildShapeNameIndex(['Sweden']);
    const summaries = aggregateStagesByCountry([
      stage({ country: 'Sweden' }),
      stage({ country: 'Atlantis' }),
    ]);
    const annotated = annotateWithShapeNames(summaries, index);
    expect(annotated.find((s) => s.country === 'Sweden').shapeName).toBe('Sweden');
    expect(annotated.find((s) => s.country === 'Atlantis').shapeName).toBeNull();
  });
});
