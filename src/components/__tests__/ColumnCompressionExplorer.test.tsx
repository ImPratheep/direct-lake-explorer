import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ColumnCompressionExplorer from '../ColumnCompressionExplorer';

const metric = (label: string): string => {
  const card = Array.from(document.querySelectorAll('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
  return card?.querySelector('.metric-value')?.textContent ?? '';
};
const percent = (label: string): number => parseFloat(metric(label));

const setScenario = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Value distribution'), { target: { value } });
};
const setEncoding = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Modelled representation'), { target: { value } });
};
const setRows = (value: number): void => {
  fireEvent.change(screen.getByLabelText(/^Row count/), { target: { value: String(value) } });
};
const setSegments = (value: number): void => {
  fireEvent.change(screen.getByLabelText(/^Rows per segment/), { target: { value: String(value) } });
};
const setCardinality = (value: number): void => {
  fireEvent.change(screen.getByLabelText(/^Distinct values/), { target: { value: String(value) } });
};
const setNulls = (value: number): void => {
  fireEvent.change(screen.getByLabelText(/^Null share/), { target: { value: String(value) } });
};
const snapshot = (): string[] => Array.from(document.querySelectorAll('.metric-value')).map((el) => el.textContent ?? '');
const compareRow = (label: string): string[] => {
  const row = Array.from(document.querySelectorAll('.compression-compare-table tbody tr')).find(
    (tr) => tr.querySelector('th')?.textContent === label,
  );
  return Array.from(row?.querySelectorAll('td') ?? []).map((td) => td.textContent ?? '');
};

describe('ColumnCompressionExplorer component (Module 5)', () => {
  it('renders heading, controls and the default low-cardinality text estimate', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);

    expect(screen.getByRole('heading', { name: 'Column Compression Explorer' })).toBeTruthy();
    for (const label of [/^Value distribution$/, /^Modelled representation$/, /^Row count/, /^Distinct values/, /^Rows per segment/, /^Null share/]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(metric('Rows')).toBe('1,000');
    expect(metric('Distinct Values')).toBe('5');
    expect(metric('Cardinality Ratio')).toBe('0.005 (low)');
    expect(metric('Original Estimated Size')).toBe('8,977 B');
    expect(metric('Dictionary Size')).toBe('45 B');
    expect(metric('Encoded Value Size')).toBe('376 B');
    expect(metric('Other Modelled Overhead')).toBe('128 B');
    expect(metric('Total Estimated Compressed Size')).toBe('549 B');
    expect(metric('Compression Ratio')).toBe('16.35x');
    expect(metric('Estimated Memory Savings')).toBe('8,428 B (93.9%)');
    expect(metric('Dictionary Overhead %')).toBe('8.2%');
  });

  it('is deterministic across renders', () => {
    const first = render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const a = snapshot();
    first.unmount();
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    expect(snapshot()).toEqual(a);
  });

  it('identifies every number as a simulation, not a VertiPaq measurement', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    expect(document.querySelector('.compression-summary')?.textContent).toMatch(/Every number below is a simulation, not a VertiPaq measurement/);
    expect(document.querySelector('.compression-insights')?.textContent).toMatch(/not VertiPaq measurements/);
  });

  it('offers all the required distributions plus a Customer column', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const options = Array.from((screen.getByLabelText('Value distribution') as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual([
      'Customer table column',
      'Low-cardinality text',
      'High-cardinality text',
      'Sequential integers',
      'Random integers',
      'Repeated decimals',
      'Dates (spread randomly)',
      'Dates (sorted)',
    ]);
  });

  it('each distribution starts at its documented cardinality and updates the metrics', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    for (const [scenario, distinct] of [
      ['RANDOM_INTEGERS', '500'],
      ['REPEATED_DECIMALS', '20'],
      ['DATES_RANDOM', '365'],
      ['DATES_SORTED', '365'],
      ['SEQUENTIAL_INTEGERS', '1,000'],
      ['HIGH_CARDINALITY_TEXT', '1,000'],
      ['LOW_CARDINALITY_TEXT', '5'],
    ]) {
      setScenario(scenario);
      expect(metric('Distinct Values')).toBe(distinct);
    }
  });

  it('shows dictionary overhead dominating high-cardinality text and a negative-savings warning', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setScenario('HIGH_CARDINALITY_TEXT');
    expect(percent('Dictionary Overhead %')).toBeGreaterThan(90);
    expect(metric('Compression Ratio')).toBe('0.93x');
    expect(metric('Estimated Memory Savings').startsWith('-')).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/larger than its original size/);
    expect(metric('Cardinality Ratio')).toBe('1.000 (high)');
  });

  it('compares the dictionary and value representations for sequential integers', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setScenario('SEQUENTIAL_INTEGERS');
    expect(metric('Compression Ratio')).toBe('0.85x');

    setEncoding('VALUE');
    expect(metric('Compression Ratio')).toBe('5.74x');
    expect(metric('Dictionary Size')).toBe('0 B');
    expect(metric('Dictionary Overhead %')).toBe('0.0%');
    expect(document.querySelector('.compression-summary')?.textContent).toMatch(/Model:\s*value/);
    expect(screen.queryByText(/Dictionary \(shared, counted once\)/)).toBeNull();
    expect(screen.getByText('Column metadata (value model)')).toBeTruthy();
  });

  it('disables the value representation for text and explains why', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const option = Array.from((screen.getByLabelText('Modelled representation') as HTMLSelectElement).options).find((o) => o.value === 'VALUE');
    expect(option?.disabled).toBe(true);
    expect(screen.getByText(/Text columns use the dictionary model only/)).toBeTruthy();

    setScenario('SEQUENTIAL_INTEGERS');
    expect(Array.from((screen.getByLabelText('Modelled representation') as HTMLSelectElement).options).find((o) => o.value === 'VALUE')?.disabled).toBe(false);
    expect(screen.getByText(/Microsoft documents that numeric data uses value encoding/)).toBeTruthy();
  });

  it('falls back to the dictionary model when switching from value encoding to a text column', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setScenario('SEQUENTIAL_INTEGERS');
    setEncoding('VALUE');
    setScenario('HIGH_CARDINALITY_TEXT');
    expect((screen.getByLabelText('Modelled representation') as HTMLSelectElement).value).toBe('DICTIONARY');
    expect(metric('Dictionary Size')).not.toBe('0 B');
  });

  it('lets cardinality change where it is a free choice and locks it elsewhere', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const slider = screen.getByLabelText(/^Distinct values/) as HTMLInputElement;
    expect(slider.disabled).toBe(false);
    setCardinality(40);
    expect(metric('Distinct Values')).toBe('40');
    expect(parseInt(metric('Dictionary Size'), 10)).toBeGreaterThan(45);

    setScenario('SEQUENTIAL_INTEGERS');
    expect((screen.getByLabelText(/^Distinct values/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Every row is distinct in this distribution.')).toBeTruthy();
    setScenario('CUSTOMER_COLUMN');
    expect((screen.getByLabelText(/^Distinct values/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Cardinality comes from the Customer data.')).toBeTruthy();
  });

  it('limits the distinct-value slider to the rows and keeps the estimate valid when rows shrink', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setScenario('RANDOM_INTEGERS');
    setRows(300);
    expect(metric('Distinct Values')).toBe('300');
    expect((screen.getByLabelText(/^Distinct values/) as HTMLInputElement).max).toBe('300');
  });

  it('selects a Customer column and uses the shared dataset', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setScenario('CUSTOMER_COLUMN');
    fireEvent.change(screen.getByLabelText('Customer column'), { target: { value: 'Region' } });
    expect(metric('Distinct Values')).toBe('5');
    fireEvent.change(screen.getByLabelText('Customer column'), { target: { value: 'CustomerID' } });
    expect(metric('Distinct Values')).toBe('1,000');
    expect(document.querySelector('.compression-summary')?.textContent).toContain('CustomerID (int64)');
  });

  it('changes the segment size without changing the dictionary: overhead grows, dictionary stays', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const dictionaryBefore = metric('Dictionary Size');
    setSegments(50);
    expect(document.querySelectorAll('.compression-segment-table tbody tr')).toHaveLength(20);
    expect(metric('Other Modelled Overhead')).toBe('1,280 B');
    expect(metric('Dictionary Size')).toBe(dictionaryBefore);
    expect(screen.getByText(/counted once, not once per segment/)).toBeTruthy();
    expect(document.querySelector('.compression-segment-table caption')?.textContent).toMatch(/its bytes are not repeated per segment/);
  });

  it('handles zero rows: zero sizes, ratio 1, a message and no segment tables', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setRows(0);
    expect(metric('Total Estimated Compressed Size')).toBe('0 B');
    expect(metric('Compression Ratio')).toBe('1.00x');
    expect(metric('Cardinality Ratio')).toBe('0.000 (none (no non-null values))');
    expect(screen.getByText('There are no rows, so every size is 0 and there is nothing to compress.', { selector: 'p' })).toBeTruthy();
    expect(document.querySelector('.compression-segment-table')).toBeNull();
    expect((screen.getByLabelText(/^Distinct values/) as HTMLInputElement).disabled).toBe(true);
    expect(document.querySelectorAll('.compression-compare-table tbody tr')).toHaveLength(11);
  });

  it('handles an all-null column without NaN or Infinity', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setNulls(100);
    expect(metric('Distinct Values')).toBe('0');
    expect(metric('Cardinality Ratio')).toContain('none');
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('never shows NaN, Infinity or a negative size across distributions, models, nulls and row counts', () => {
    render(<ColumnCompressionExplorer explanationMode="advanced" />);
    for (const scenario of ['CUSTOMER_COLUMN', 'LOW_CARDINALITY_TEXT', 'HIGH_CARDINALITY_TEXT', 'SEQUENTIAL_INTEGERS', 'RANDOM_INTEGERS', 'REPEATED_DECIMALS', 'DATES_RANDOM', 'DATES_SORTED']) {
      setScenario(scenario);
      for (const rows of [0, 100, 2000]) {
        setRows(rows);
        for (const nulls of [0, 100]) {
          setNulls(nulls);
          expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
          for (const label of ['Original Estimated Size', 'Dictionary Size', 'Encoded Value Size', 'Other Modelled Overhead', 'Total Estimated Compressed Size']) {
            expect(metric(label).startsWith('-')).toBe(false);
          }
        }
      }
    }
  });

  it('adds nulls to the segment statistics and a reserved dictionary entry', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setNulls(25);
    const nullCells = Array.from(document.querySelectorAll('.compression-segment-table tbody tr td:nth-child(3)')).map((td) => parseInt(td.textContent ?? '0', 10));
    expect(nullCells.some((n) => n > 0)).toBe(true);
    expect(document.querySelector('.compression-dictionary-table caption')?.textContent).toMatch(/including reserved ID 5 for null/);
  });

  it('resets every control and the estimate', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setScenario('SEQUENTIAL_INTEGERS');
    setEncoding('VALUE');
    setRows(300);
    setSegments(100);
    setNulls(25);
    expect(metric('Rows')).toBe('300');

    fireEvent.click(screen.getByRole('button', { name: 'Reset simulation' }));
    expect((screen.getByLabelText('Value distribution') as HTMLSelectElement).value).toBe('LOW_CARDINALITY_TEXT');
    expect((screen.getByLabelText('Modelled representation') as HTMLSelectElement).value).toBe('DICTIONARY');
    expect(metric('Rows')).toBe('1,000');
    expect(metric('Total Estimated Compressed Size')).toBe('549 B');
    expect((screen.getByLabelText(/^Null share/) as HTMLSelectElement).value).toBe('0');
  });

  it('shows the storage breakdown as text, with shares that match the metrics', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const rows = Array.from(document.querySelectorAll('.compression-table caption'))
      .find((c) => c.textContent === 'Where the estimated bytes come from')
      ?.closest('table')
      ?.querySelectorAll('tbody tr');
    const parts = Array.from(rows ?? []).map((tr) => tr.querySelector('th')?.textContent);
    expect(parts).toEqual([
      'Original (uncompressed, modelled)',
      'Dictionary (shared, counted once)',
      'Encoded IDs',
      'Segment overhead',
      'Total estimated compressed size',
    ]);
    expect(Array.from(rows ?? [])[1].querySelectorAll('td')[1].textContent).toBe('8.2%');
  });

  it('shows original values beside encoded IDs and the dictionary', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const rows = document.querySelectorAll('.compression-table tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    const encodedCells = Array.from(document.querySelectorAll('.compression-split table:first-child tbody tr td:nth-child(3)')).map((td) => td.textContent);
    expect(encodedCells).toHaveLength(10);
    expect(encodedCells.every((text) => /^ID \d+$/.test(text ?? ''))).toBe(true);
    expect(document.querySelectorAll('.compression-dictionary-table tbody tr')).toHaveLength(5);
  });

  it('shows stored offsets instead of IDs in the value representation, with no dictionary table', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    setScenario('SEQUENTIAL_INTEGERS');
    setEncoding('VALUE');
    expect(document.querySelector('.compression-dictionary-table')).toBeNull();
    const stored = Array.from(document.querySelectorAll('.compression-split table tbody tr td:nth-child(3)')).map((td) => td.textContent);
    expect(stored.slice(0, 3)).toEqual(['0', '1', '2']);
    expect(screen.getByText('Stored value')).toBeTruthy();
  });

  it('compares the six examples and every Customer column side by side', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const labels = Array.from(document.querySelectorAll('.compression-compare-table tbody th')).map((th) => th.textContent);
    expect(labels).toEqual([
      'Low-cardinality text',
      'High-cardinality text',
      'Sequential integers',
      'Random integers',
      'Repeated decimals',
      'Dates (spread randomly)',
      'CustomerID (Customer table)',
      'Revenue (Customer table)',
      'LastPurchaseDate (Customer table)',
      'Region (Customer table)',
      'CustomerName (Customer table)',
    ]);
    expect(compareRow('Low-cardinality text')[8]).toBe('Dictionary only');
    expect(compareRow('High-cardinality text')[6]).toBe('n/a');
    expect(compareRow('Sequential integers')[8]).toBe('Value');
    expect(compareRow('Repeated decimals')[8]).toBe('Dictionary');
    expect(compareRow('Sequential integers')[5]).toBe('0.85x');
    expect(compareRow('Sequential integers')[7]).toBe('5.74x');
  });

  it('keeps the comparison in step with the shared row count and segment size', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    expect(compareRow('Sequential integers')[3]).toBe('8,000'); // 1,000 rows x 8 bytes
    setRows(500);
    expect(compareRow('Sequential integers')[3]).toBe('4,000');
    const before = compareRow('Sequential integers')[4];
    setSegments(50);
    expect(compareRow('Sequential integers')[4]).not.toBe(before);
  });

  it('draws bar charts that are hidden from assistive tech because the tables carry the same facts', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const charts = Array.from(document.querySelectorAll('.compression-chart'));
    expect(charts).toHaveLength(2);
    expect(charts.every((chart) => chart.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(charts[0].querySelectorAll('.compression-chart-row')).toHaveLength(1);
    expect(charts[1].querySelectorAll('.compression-chart-row')).toHaveLength(18);
    expect(charts[1].querySelectorAll('.compression-part-dictionary').length).toBe(18);
  });

  it('lists every assumption behind the estimates', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const terms = Array.from(document.querySelectorAll('.compression-assumptions dt')).map((el) => el.textContent);
    expect(terms).toEqual(['Original size', 'Dictionary', 'Encoded IDs', 'Value encoding', 'Segment overhead', 'Not modelled']);
  });

  it('changes the explanation per mode and labels documented, simplified and proprietary content', () => {
    const { rerender } = render(<ColumnCompressionExplorer explanationMode="beginner" />);
    expect(screen.getByText(/three main ways/)).toBeTruthy();
    rerender(<ColumnCompressionExplorer explanationMode="intermediate" />);
    expect(screen.getByText(/This module never decides which one a real engine uses\. All segments|Cardinality drives both parts/)).toBeTruthy();
    rerender(<ColumnCompressionExplorer explanationMode="advanced" />);
    expect(screen.getByText(/\[DOCUMENTED\] Microsoft Learn \(data reduction techniques/)).toBeTruthy();
    expect(screen.getByText(/\[SIMPLIFIED MODEL\] Dictionary model/)).toBeTruthy();
    expect(screen.getByText(/\[PROPRIETARY INTERNAL\] The engine's real encoding choice/)).toBeTruthy();
  });

  it('distinguishes documented, simulated, simplified and proprietary content', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    for (const label of ['[DOCUMENTED]', '[SIMPLIFIED MODEL]', '[SIMULATION]', '[PROPRIETARY INTERNAL]']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('does not claim an engine always selects a strategy, invent selection rules, or present estimates as measurements', () => {
    render(<ColumnCompressionExplorer explanationMode="advanced" />);
    const page = document.body.textContent ?? '';
    expect(page).toContain('does not claim a strategy is always selected');
    expect(page).toContain('Models two representations that you choose between');
    expect(page).toContain('Actual VertiPaq compression depends on implementation details that are not fully documented publicly');
    expect(page).toContain('Boolean columns are not part of the shared Customer dataset');
    expect(page).not.toMatch(/recommended (encoding|compression)|VertiPaq (will )?always|the engine (will )?(choose|select)s?/i);
    expect(page).not.toMatch(/actual VertiPaq (size|ratio) (is|of)/i);
  });

  it('quotes example numbers that the simulator really produces', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    expect(compareRow('Sequential integers')[5]).toBe('0.85x');
    expect(compareRow('Sequential integers')[7]).toBe('5.74x');
    expect(compareRow('Random integers')[5]).toBe('1.52x');
    expect(compareRow('Random integers')[7]).toBe('3.96x');
    expect(compareRow('Repeated decimals')[5]).toBe('8.75x');
    expect(compareRow('Repeated decimals')[7]).toBe('3.34x');
    expect(compareRow('Dates (spread randomly)')[5]).toBe('1.92x');
    expect(compareRow('Dates (spread randomly)')[7]).toBe('5.74x');
    const examples = document.querySelector('.compression-examples')?.textContent ?? '';
    for (const text of ['about 16x', '0.93x', '0.85x', 'about 5.7x', 'about 1.5x', '4.0x', 'about 8.8x', '3.3x', 'about 1.9x']) {
      expect(examples).toContain(text);
    }
  });

  it('presents the sources with safe external links', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const link = screen.getByRole('link', { name: /Data reduction techniques for Import modeling/ }) as HTMLAnchorElement;
    expect(link.href).toContain('learn.microsoft.com');
    expect(link.rel).toContain('noopener');
  });

  it('uses only compression- prefixed classes for its own elements', () => {
    render(<ColumnCompressionExplorer explanationMode="beginner" />);
    const own = Array.from(document.querySelectorAll('.compression-explorer *'))
      .flatMap((el) => Array.from(el.classList))
      .filter((cls) => cls.startsWith('compression'));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((cls) => cls.startsWith('compression-'))).toBe(true);
  });
});
