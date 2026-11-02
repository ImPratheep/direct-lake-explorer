import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom does not apply stylesheets, so these tests read the CSS source. They guard against
// global class names colliding across stages (App.css uses .control-group for the header controls;
// Stage 5's Predicate Pushdown Simulator uses .simulator-header).
const read = (name: string): string => readFileSync(resolve(__dirname, '..', name), 'utf8');

// Selectors that appear at the start of a rule (or after a comma) in the given CSS text.
const selectorLines = (css: string): string[] =>
  css
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /[{,]$/.test(line) && !line.startsWith('@') && !line.startsWith('/*'));

const SHARED_NAMES = ['.control-group', '.simulator-header', '.metrics-grid', '.metric-label', '.metric-value'];

const startsWithSharedName = (selector: string): boolean =>
  SHARED_NAMES.some((name) => new RegExp(`^${name.replace('.', '\\.')}(?![\\w-])`).test(selector));

describe('CSS scoping across stages', () => {
  it.each([
    'DictionaryEncodingExplorer.css',
    'ValueHashEncodingSimulator.css',
    'VertiPaqSimulator.css',
    'SegmentExplorer.css',
    'SegmentEliminationSimulator.css',
    'ColumnCompressionExplorer.css',
    'DirectLakeLoadingSimulator.css',
    'MemoryResidencySimulator.css',
    'StorageEngineScanSimulator.css',
  ])(
    '%s does not define unscoped selectors that other stages also use',
    (file) => {
      const offenders = selectorLines(read(file)).filter(startsWithSharedName);
      expect(offenders).toEqual([]);
    },
  );

  it.each([
    ['SegmentExplorer.css', 'seg-'],
    ['SegmentEliminationSimulator.css', 'elim-'],
    ['ColumnCompressionExplorer.css', 'compression-'],
    ['DirectLakeLoadingSimulator.css', 'loading-'],
    ['MemoryResidencySimulator.css', 'memory-'],
    ['StorageEngineScanSimulator.css', 'scan-'],
  ])('%s only defines selectors that start with the %s prefix', (file, prefix) => {
    const offenders = selectorLines(read(file)).filter((selector) => !selector.startsWith(`.${prefix}`));
    expect(offenders).toEqual([]);
  });

  it('Predicate Pushdown scopes its .control-group rules to its own root', () => {
    const offenders = selectorLines(read('PredicatePushdownSimulator.css')).filter((s) => /^\.control-group(?![\w-])/.test(s));
    expect(offenders).toEqual([]);
    expect(read('PredicatePushdownSimulator.css')).toContain('.predicate-pushdown-simulator .control-group');
  });

  it('VertiPaq header rules are scoped under .vertipaq-simulator', () => {
    const css = read('VertiPaqSimulator.css');
    expect(css).toContain('.vertipaq-simulator .simulator-header');
    expect(css).toContain('.vertipaq-simulator .simulator-header h2');
  });

  it('App.css keeps the original header .control-group definition', () => {
    const css = read('App.css');
    expect(css).toMatch(/^\.control-group \{\s*display: flex;\s*align-items: center;/m);
  });
});
