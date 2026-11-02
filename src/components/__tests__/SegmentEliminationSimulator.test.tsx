import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SegmentEliminationSimulator from '../SegmentEliminationSimulator';
import { generateSegments } from '../../data/stage6-segment-simulator';
import { generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../../data/stage6-synthetic-dataset';

const metric = (label: string): string => {
  const card = Array.from(document.querySelectorAll('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
  return card?.querySelector('.metric-value')?.textContent ?? '';
};

const setColumn = (name: string): void => {
  fireEvent.change(screen.getByLabelText('Column'), { target: { value: name } });
};
const setOperator = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Filter'), { target: { value } });
};
const valueInput = (): HTMLInputElement => screen.getByLabelText(/^(Value|Lower bound)/) as HTMLInputElement;
const setValue = (value: string): void => {
  fireEvent.change(valueInput(), { target: { value } });
};
const setUpper = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Upper bound (inclusive)'), { target: { value } });
};
const setSorted = (): void => {
  fireEvent.change(screen.getByLabelText('Row order before segmenting'), { target: { value: 'SORTED_ASCENDING' } });
};
const decisions = (): string[] =>
  Array.from(document.querySelectorAll('.elim-table tbody .elim-decision')).map((el) => el.textContent ?? '');
const reasons = (): string[] =>
  Array.from(document.querySelectorAll('.elim-table tbody .elim-reason')).map((el) => el.textContent ?? '');
const snapshot = (): string[] => Array.from(document.querySelectorAll('.metric-value')).map((el) => el.textContent ?? '');

describe('SegmentEliminationSimulator component (Module 4)', () => {
  it('renders heading, controls and the default CustomerID > 750 result', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);

    expect(screen.getByRole('heading', { name: 'Segment Elimination Simulator' })).toBeTruthy();
    for (const label of [/^Column$/, /^Filter$/, /^Value$/, /Dataset size/, /Rows per segment/, /Row order before segmenting/, /Null share/]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(document.querySelector('.elim-predicate-line code')?.textContent).toBe('CustomerID > 750');
    expect(metric('Total Segments')).toBe('4');
    expect(metric('Segments Scanned')).toBe('1');
    expect(metric('Segments Eliminated')).toBe('3');
    expect(metric('Rows Potentially Scanned')).toBe('250');
    expect(metric('Rows Potentially Avoided')).toBe('750');
    expect(metric('Elimination Percentage')).toBe('75.0%');
    expect(metric('Segments Eliminated %')).toBe('75.0%');
  });

  it('is deterministic across renders', () => {
    const first = render(<SegmentEliminationSimulator explanationMode="beginner" />);
    const a = snapshot();
    first.unmount();
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    expect(snapshot()).toEqual(a);
  });

  it('offers all seven filters and only numeric and date columns', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    const filters = Array.from((screen.getByLabelText('Filter') as HTMLSelectElement).options).map((o) => o.text);
    expect(filters).toEqual([
      'Greater than (>)',
      'Greater than or equal to (>=)',
      'Less than (<)',
      'Less than or equal to (<=)',
      'Equal to (=)',
      'Not equal to (!=)',
      'Between (inclusive) (BETWEEN)',
    ]);
    const columns = Array.from((screen.getByLabelText('Column') as HTMLSelectElement).options).map((o) => o.text);
    expect(columns.some((c) => c.includes('CustomerID'))).toBe(true);
    expect(columns.some((c) => c.includes('Revenue'))).toBe(true);
    expect(columns.some((c) => c.includes('LastPurchaseDate'))).toBe(true);
    expect(columns.some((c) => c.includes('Region') || c.includes('CustomerName'))).toBe(false);
  });

  it('explains why each segment was scanned or eliminated', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    expect(decisions()).toEqual(['Eliminated', 'Eliminated', 'Eliminated', 'Scanned']);
    const text = reasons();
    expect(text).toHaveLength(4);
    expect(text[0]).toMatch(/no value can be greater than 750/);
    expect(text[3]).toMatch(/Every non-null value in the range 751 to 1000 satisfies the predicate/);
  });

  it('shows the upper bound only for BETWEEN', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    expect(screen.queryByLabelText('Upper bound (inclusive)')).toBeNull();
    setOperator('BETWEEN');
    expect(screen.getByLabelText('Lower bound (inclusive)')).toBeTruthy();
    expect(screen.getByLabelText('Upper bound (inclusive)')).toBeTruthy();
    setOperator('LT');
    expect(screen.queryByLabelText('Upper bound (inclusive)')).toBeNull();
  });

  it('handles boundary equality: = 250 keeps segment 0 and = 251 keeps segment 1', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setOperator('EQ');
    setValue('250');
    expect(decisions()).toEqual(['Scanned', 'Eliminated', 'Eliminated', 'Eliminated']);
    expect(reasons()[0]).toMatch(/may or may not hold matching rows/);

    setValue('251');
    expect(decisions()).toEqual(['Eliminated', 'Scanned', 'Eliminated', 'Eliminated']);
  });

  it('supports not equal to, greater-or-equal, less-than, less-or-equal', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setOperator('NEQ');
    setValue('100');
    expect(metric('Segments Eliminated')).toBe('0');

    setOperator('GTE');
    setValue('751');
    expect(metric('Segments Eliminated')).toBe('3');
    setValue('750');
    expect(metric('Segments Eliminated')).toBe('2');

    setOperator('LT');
    setValue('251');
    expect(metric('Segments Eliminated')).toBe('3');
    setOperator('LTE');
    setValue('250');
    expect(metric('Segments Eliminated')).toBe('3');
    setValue('249');
    expect(metric('Segments Eliminated')).toBe('3');
  });

  it('applies defaults when the column changes and uses a date input for dates', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setColumn('LastPurchaseDate');

    expect(valueInput().type).toBe('date');
    expect(valueInput().value).toBe('2024-06-01');
    expect(document.querySelector('.elim-predicate-line code')?.textContent).toBe('LastPurchaseDate > 2024-06-01');
  });

  it('shows overlapping ranges for an unordered date column and eliminates segments when sorted', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setColumn('LastPurchaseDate');

    expect(metric('Segments Scanned')).toBe('4');
    expect(metric('Segments Eliminated')).toBe('0');
    expect(reasons().every((r) => /cannot rule this segment out/.test(r) && /may or may not hold matching rows/.test(r))).toBe(true);

    setSorted();
    expect(metric('Segments Eliminated')).toBe('2');
    expect(metric('Segments Scanned')).toBe('2');
  });

  it('Revenue between 1,000 and 2,000: none eliminated as loaded, two when sorted', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setColumn('Revenue');
    expect(document.querySelector('.elim-predicate-line code')?.textContent).toBe('Revenue BETWEEN 1000.00 AND 2000.00');
    expect(metric('Segments Eliminated')).toBe('0');
    setSorted();
    expect(metric('Segments Eliminated')).toBe('2');
  });

  it('shows an alert and hides results for invalid input, then recovers', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setValue('');
    expect(screen.getByRole('alert').textContent).toMatch(/must be a number/);
    expect(document.querySelector('.metrics-grid')).toBeNull();
    expect(valueInput().getAttribute('aria-invalid')).toBe('true');

    setValue('500');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(metric('Total Segments')).toBe('4');
  });

  it('reports a clear message for an empty date and for a missing upper bound', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setColumn('LastPurchaseDate');
    setValue('');
    expect(screen.getByRole('alert').textContent).toMatch(/valid date/);
    setValue('2024-06-01');

    setOperator('BETWEEN');
    setUpper('');
    expect(screen.getByRole('alert').textContent).toMatch(/upper bound/);
  });

  it('eliminates every segment when BETWEEN has its bounds reversed', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setOperator('BETWEEN');
    setValue('900');
    setUpper('100');
    expect(metric('Segments Eliminated')).toBe('4');
    expect(reasons()[0]).toMatch(/lower bound 900 is above the upper bound 100/);
  });

  it('handles nulls explicitly: shows null counts and explains they never match', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setColumn('Revenue');
    fireEvent.change(screen.getByLabelText(/Null share/), { target: { value: '25' } });

    const nullCells = Array.from(document.querySelectorAll('.elim-table tbody tr td:nth-child(3)')).map((td) => parseInt(td.textContent ?? '0', 10));
    expect(nullCells.some((n) => n > 0)).toBe(true);
    expect(document.querySelector('.elim-insights')?.textContent).toMatch(/null row\(s\) never satisfy these comparisons/);
    expect(document.querySelector('.elim-predicate-line')?.textContent).toMatch(/Null values never satisfy it/);
  });

  it('shows a single segment when the segment size exceeds the dataset', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    fireEvent.change(screen.getByLabelText(/Dataset size/), { target: { value: '100' } });
    expect(metric('Total Segments')).toBe('1');
    expect(metric('Rows Potentially Scanned')).toBe('0');
    expect(metric('Rows Potentially Avoided')).toBe('100');
  });

  it('uses the Module 3 segments for the same settings, not its own', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    setColumn('Revenue');
    fireEvent.change(screen.getByLabelText(/Rows per segment/), { target: { value: '300' } });
    setSorted();

    const column = getCustomerEncodingColumn(generateSyntheticCustomerRows(1000), 'Revenue');
    const module3 = generateSegments({ ...column, values: column.values.slice() }, 300, { rowOrder: 'SORTED_ASCENDING' });
    expect(metric('Total Segments')).toBe(String(module3.segments.length));

    const rows = Array.from(document.querySelectorAll('.elim-table tbody tr'));
    expect(rows).toHaveLength(module3.segments.length);
    rows.forEach((row, i) => {
      const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent);
      expect(cells[0]).toBe(String(module3.segments[i].rowCount));
      expect(cells[2]).toBe((module3.segments[i].statistics.minValue as number).toFixed(2));
      expect(cells[3]).toBe((module3.segments[i].statistics.maxValue as number).toFixed(2));
    });
  });

  it('draws one chart row per segment with eliminated and scanned bars distinguished', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    const chart = document.querySelector('.elim-chart') as HTMLElement;
    expect(chart.getAttribute('aria-hidden')).toBe('true');
    expect(chart.querySelectorAll('.elim-chart-row')).toHaveLength(4);
    expect(chart.querySelectorAll('.elim-chart-bar-eliminated')).toHaveLength(3);
    expect(chart.querySelectorAll('.elim-chart-bar-scanned')).toHaveLength(1);
    expect(chart.querySelectorAll('.elim-chart-band')).toHaveLength(4); // the same shaded region is drawn on each segment's row
    expect(Array.from(chart.querySelectorAll('.elim-chart-outcome')).map((el) => el.textContent)).toEqual([
      'Eliminated',
      'Eliminated',
      'Eliminated',
      'Scanned',
    ]);
  });

  it('changes the explanation per mode', () => {
    const { rerender } = render(<SegmentEliminationSimulator explanationMode="beginner" />);
    expect(screen.getByText(/Scanned does not mean the segment has matching rows/)).toBeTruthy();
    rerender(<SegmentEliminationSimulator explanationMode="intermediate" />);
    expect(screen.getByText(/Ranges are inclusive, so a range that touches the filter value exactly/)).toBeTruthy();
    rerender(<SegmentEliminationSimulator explanationMode="advanced" />);
    expect(screen.getByText(/\[DOCUMENTED\] Microsoft Fabric describes Delta file skipping/)).toBeTruthy();
    expect(screen.getByText(/\[SIMPLIFIED MODEL\] This module applies the same possibility test/)).toBeTruthy();
    expect(screen.getByText(/\[PROPRIETARY INTERNAL\] Whether VertiPaq segments carry min\/max metadata/)).toBeTruthy();
  });

  it('distinguishes documented, simulated, simplified and proprietary content', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    for (const label of ['[DOCUMENTED]', '[SIMPLIFIED MODEL]', '[SIMULATION]', '[PROPRIETARY INTERNAL]']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('does not present min/max segment metadata as documented VertiPaq behaviour', () => {
    render(<SegmentEliminationSimulator explanationMode="advanced" />);
    const page = document.body.textContent ?? '';
    expect(page).toContain('That is the Delta file layer, not VertiPaq segments.');
    expect(page).toContain('Does not claim that VertiPaq segments carry min/max metadata or use it this way');
    expect(page).toContain('Whether and how VertiPaq uses segment-level min and max.');
    expect(page).not.toMatch(/VertiPaq (documents|stores) (segment )?min/i);
    expect(page).not.toMatch(/every scanned segment (contains|has)/i);
  });

  it('states that scanned does not mean matching rows, in the note, concepts and result', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    expect(document.querySelector('.elim-note')?.textContent).toMatch(/does not mean the segment contains matching rows/);
    expect(screen.getByText(/can rule a segment out but can never prove it has a match/)).toBeTruthy();
    expect(document.querySelector('.elim-insights')?.textContent).toMatch(/possibility test/);
  });

  it('presents the sources with safe external links', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    const link = screen.getByRole('link', { name: /File skipping for Delta tables/ }) as HTMLAnchorElement;
    expect(link.href).toContain('learn.microsoft.com');
    expect(link.rel).toContain('noopener');
  });

  it('uses only elim- prefixed classes for its own elements', () => {
    render(<SegmentEliminationSimulator explanationMode="beginner" />);
    const own = Array.from(document.querySelectorAll('.elim-explorer *'))
      .flatMap((el) => Array.from(el.classList))
      .filter((cls) => cls.startsWith('elim'));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((cls) => cls.startsWith('elim-'))).toBe(true);
  });
});
