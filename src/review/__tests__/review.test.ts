import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReviewSearch,
  parseReviewLocation,
  REVIEW_SCREENS,
  REVIEW_VIEWPORTS,
  screenFor,
} from '../reviewScreens';
import { REVIEW_EPOCH_MS, seededRandom, withFixedEntropy } from '../deterministic';
import {
  createReviewFixtures,
  representativeLoadingStart,
  representativeMemoryStart,
  representativeScanStart,
  REPRESENTATIVE_SCAN_SCENARIO_ID,
} from '../reviewFixtures';
import { generateSyntheticDeltaLog, generateSyntheticPartitionedTable } from '../../data/stage5-delta-lake-parquet';
import { runScanScenario } from '../../data/stage6-scan-simulator';
import { createLoadingSession, DEFAULT_LOADING_SETTINGS } from '../../data/stage6-loading-simulator';
import { snapshotMemory } from '../../data/stage6-memory-simulator';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('review screens', () => {
  it('covers Architecture, five Stage 5 modules and eight Stage 6 modules, with unique ids', () => {
    expect(REVIEW_SCREENS).toHaveLength(14);
    expect(REVIEW_SCREENS.filter((s) => s.group === 'Architecture')).toHaveLength(1);
    expect(REVIEW_SCREENS.filter((s) => s.group === 'Stage 5')).toHaveLength(5);
    expect(REVIEW_SCREENS.filter((s) => s.group === 'Stage 6')).toHaveLength(8);
    expect(new Set(REVIEW_SCREENS.map((s) => s.id)).size).toBe(14);
  });

  it('maps every Stage 6 screen to a distinct VertiPaq tab', () => {
    const tabs = REVIEW_SCREENS.filter((s) => s.module === 'vertipaq').map((s) => s.tab);
    expect(new Set(tabs).size).toBe(8);
    expect(tabs).toEqual(['dictionary', 'encoding', 'segment', 'elimination', 'compression', 'loading', 'memory', 'storage']);
  });

  it('finds the screen for a module and tab, and falls back to the first screen', () => {
    expect(screenFor('deltaLake').id).toBe('delta-lake');
    expect(screenFor('vertipaq', 'memory').id).toBe('memory');
    expect(screenFor('vertipaq').id).toBe('dictionary');
    expect(screenFor('vertipaq', 'nonsense').id).toBe('architecture');
  });

  it('offers the three required desktop viewports plus Fit window', () => {
    expect(REVIEW_VIEWPORTS.map((v) => [v.id, v.width, v.height])).toEqual([
      ['fit', null, null],
      ['1920x1080', 1920, 1080],
      ['1600x900', 1600, 900],
      ['1366x768', 1366, 768],
    ]);
  });
});

describe('review location (URL)', () => {
  it('parses review, screen and viewport', () => {
    expect(parseReviewLocation('?review=1&screen=memory&viewport=1600x900')).toEqual({
      review: true,
      screenId: 'memory',
      viewportId: '1600x900',
    });
  });

  it('ignores unknown values and is off by default', () => {
    expect(parseReviewLocation('')).toEqual({ review: false, screenId: 'architecture', viewportId: 'fit' });
    expect(parseReviewLocation('?review=1&screen=nope&viewport=9x9')).toEqual({ review: true, screenId: 'architecture', viewportId: 'fit' });
    expect(parseReviewLocation('?review=0').review).toBe(false);
  });

  it('round-trips and writes nothing when review is off', () => {
    const location = { review: true, screenId: 'scan', viewportId: '1366x768' };
    expect(parseReviewLocation(buildReviewSearch(location))).toEqual(location);
    expect(buildReviewSearch({ review: true, screenId: 'scan', viewportId: 'fit' })).toBe('?review=1&screen=scan');
    expect(buildReviewSearch({ ...location, review: false })).toBe('');
  });
});

describe('deterministic entropy', () => {
  it('produces the same sequence for the same seed and different sequences for different seeds', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const first = [a(), a(), a()];
    expect(first).toEqual([b(), b(), b()]);
    expect(seededRandom(8)()).not.toBe(first[0]);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('fixes the clock and randomness inside the callback and restores both afterwards', () => {
    const realNow = Date.now;
    const realRandom = Math.random;
    const seen = withFixedEntropy(() => ({ now: Date.now(), r: Math.random() }));
    expect(seen.now).toBe(REVIEW_EPOCH_MS);
    expect(Date.now).toBe(realNow);
    expect(Math.random).toBe(realRandom);
  });

  it('restores the real clock and random source even when the callback throws', () => {
    const realNow = Date.now;
    const realRandom = Math.random;
    expect(() =>
      withFixedEntropy(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(Date.now).toBe(realNow);
    expect(Math.random).toBe(realRandom);
  });

  it('makes the time- and random-based Stage 5 generators repeatable', () => {
    expect(withFixedEntropy(generateSyntheticDeltaLog)).toEqual(withFixedEntropy(generateSyntheticDeltaLog));
    expect(withFixedEntropy(generateSyntheticPartitionedTable)).toEqual(withFixedEntropy(generateSyntheticPartitionedTable));
  });

  it('leaves the generators themselves unchanged: outside review they still vary with the clock', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000_000_000_000).mockReturnValueOnce(2_000_000_000_000);
    const a = generateSyntheticDeltaLog();
    const b = generateSyntheticDeltaLog();
    expect(a).not.toEqual(b);
  });

  it('builds identical review fixtures every time', () => {
    expect(createReviewFixtures()).toEqual(createReviewFixtures());
  });
});

describe('representative starting states', () => {
  it('Module 6: CustomerID reused, Revenue loaded on demand, no double-counted memory', () => {
    const start = representativeLoadingStart();
    expect(start.lastQuery).not.toBeNull();
    expect(start.lastQuery?.plan.alreadyResident).toEqual(['CustomerID']);
    expect(start.lastQuery?.plan.needsLoading).toEqual(['Revenue']);
    expect(start.queryColumns).toEqual(['CustomerID', 'Revenue']);
    const resident = snapshotMemory(start.session).residentColumns;
    expect(resident).toEqual(expect.arrayContaining(['CustomerID', 'Revenue']));
    expect(new Set(resident).size).toBe(resident.length);
  });

  it('Module 7: three columns loaded, Revenue evicted, and memory is lower after than before', () => {
    const start = representativeMemoryStart();
    const before = snapshotMemory(start.comparison.before);
    const after = snapshotMemory(start.comparison.after);
    expect(before.residentColumns).toEqual(expect.arrayContaining(['CustomerID', 'Revenue', 'Region']));
    expect(after.residentColumns).not.toContain('Revenue');
    expect(after.residentColumns).toEqual(expect.arrayContaining(['CustomerID', 'Region']));
    expect(after.residentBytes).toBeLessThan(before.residentBytes);
    expect(before.residentBytes - after.residentBytes).toBeGreaterThan(0);
    expect(start.lastEviction).not.toBeNull();
    expect(start.session).toBe(start.comparison.after);
  });

  it('Module 8: runs the CustomerID 100 to 200 scenario, matching the simulator called directly', () => {
    const start = representativeScanStart();
    expect(start.scenarioId).toBe(REPRESENTATIVE_SCAN_SCENARIO_ID);
    const direct = runScanScenario(createLoadingSession(DEFAULT_LOADING_SETTINGS), REPRESENTATIVE_SCAN_SCENARIO_ID);
    expect(start.result).toEqual(direct);
    expect(start.session).toBe(start.result.session);
  });

  it('is identical on every call', () => {
    expect(representativeLoadingStart()).toEqual(representativeLoadingStart());
    expect(representativeMemoryStart()).toEqual(representativeMemoryStart());
    expect(representativeScanStart()).toEqual(representativeScanStart());
  });
});
