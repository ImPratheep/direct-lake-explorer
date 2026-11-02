import type { ApplicationState } from '../types';

export type ReviewModuleId = ApplicationState['activeModule'];

export interface ReviewScreen {
  id: string;
  label: string;
  group: 'Architecture' | 'Stage 5' | 'Stage 6';
  module: ReviewModuleId;
  /** VertiPaq tab id, for Stage 6 screens. */
  tab?: string;
}

/** The 14 screens a UI review covers, in review order: Architecture, five Stage 5 modules, eight Stage 6 modules. */
export const REVIEW_SCREENS: ReadonlyArray<ReviewScreen> = [
  { id: 'architecture', label: 'Architecture Explorer', group: 'Architecture', module: 'architecture' },
  { id: 'delta-lake', label: 'Delta Lake Explorer', group: 'Stage 5', module: 'deltaLake' },
  { id: 'parquet', label: 'Parquet Explorer', group: 'Stage 5', module: 'parquet' },
  { id: 'pushdown', label: 'Predicate Pushdown', group: 'Stage 5', module: 'predicatePushdown' },
  { id: 'partitioning', label: 'Partitioning Explorer', group: 'Stage 5', module: 'partitioning' },
  { id: 'schema-evolution', label: 'Schema Evolution', group: 'Stage 5', module: 'schemaEvolution' },
  { id: 'dictionary', label: '1 Dictionary Encoding', group: 'Stage 6', module: 'vertipaq', tab: 'dictionary' },
  { id: 'encoding', label: '2 Value vs Hash', group: 'Stage 6', module: 'vertipaq', tab: 'encoding' },
  { id: 'segments', label: '3 Segment Explorer', group: 'Stage 6', module: 'vertipaq', tab: 'segment' },
  { id: 'elimination', label: '4 Segment Elimination', group: 'Stage 6', module: 'vertipaq', tab: 'elimination' },
  { id: 'compression', label: '5 Column Compression', group: 'Stage 6', module: 'vertipaq', tab: 'compression' },
  { id: 'loading', label: '6 Column Loading', group: 'Stage 6', module: 'vertipaq', tab: 'loading' },
  { id: 'memory', label: '7 Memory Residency', group: 'Stage 6', module: 'vertipaq', tab: 'memory' },
  { id: 'scan', label: '8 Storage Engine Scan', group: 'Stage 6', module: 'vertipaq', tab: 'storage' },
];

export interface ReviewViewport {
  id: string;
  label: string;
  width: number | null;
  height: number | null;
}

export const REVIEW_VIEWPORTS: ReadonlyArray<ReviewViewport> = [
  { id: 'fit', label: 'Fit window', width: null, height: null },
  { id: '1920x1080', label: '1920 × 1080', width: 1920, height: 1080 },
  { id: '1600x900', label: '1600 × 900', width: 1600, height: 900 },
  { id: '1366x768', label: '1366 × 768', width: 1366, height: 768 },
];

export const findReviewScreen = (id: string | null | undefined): ReviewScreen | undefined =>
  REVIEW_SCREENS.find((screen) => screen.id === id);

/** The screen that is showing for the given module and (for VertiPaq) tab. */
export const screenFor = (module: ReviewModuleId, tab?: string): ReviewScreen =>
  REVIEW_SCREENS.find((screen) => screen.module === module && (module !== 'vertipaq' || screen.tab === (tab ?? 'dictionary'))) ??
  REVIEW_SCREENS[0];

export interface ReviewLocation {
  review: boolean;
  screenId: string;
  viewportId: string;
}

/** Reads `?review=1&screen=<id>&viewport=<id>`. Unknown values fall back to the first screen and Fit window. */
export function parseReviewLocation(search: string): ReviewLocation {
  const params = new URLSearchParams(search);
  const review = params.get('review');
  return {
    review: review === '1' || review === 'true',
    screenId: findReviewScreen(params.get('screen'))?.id ?? REVIEW_SCREENS[0].id,
    viewportId: REVIEW_VIEWPORTS.find((entry) => entry.id === params.get('viewport'))?.id ?? 'fit',
  };
}

export function buildReviewSearch(location: ReviewLocation): string {
  if (!location.review) return '';
  const params = new URLSearchParams({ review: '1', screen: location.screenId });
  if (location.viewportId !== 'fit') params.set('viewport', location.viewportId);
  return `?${params.toString()}`;
}
