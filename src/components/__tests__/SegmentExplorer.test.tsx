import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SegmentExplorer from '../SegmentExplorer';

// Metric labels such as "Rows" also appear as table headers, so read cards by class.
const metric = (label: string): string => {
  const card = Array.from(document.querySelectorAll('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
  return card?.querySelector('.metric-value')?.textContent ?? '';
};

const setColumn = (name: string): void => {
  fireEvent.change(screen.getByLabelText('Column'), { target: { value: name } });
};
const setSegmentSize = (value: number): void => {
  fireEvent.change(screen.getByLabelText(/Rows per segment/), { target: { value: String(value) } });
};
const orderLine = (): string => document.querySelector('.seg-order-line')?.textContent ?? '';
const snapshot = (): string[] => Array.from(document.querySelectorAll('.metric-value')).map((el) => el.textContent ?? '');

describe('SegmentExplorer component (Module 3)', () => {
  it('renders heading, controls and the default ordered-key result', () => {
    render(<SegmentExplorer explanationMode="beginner" />);

    expect(screen.getByRole('heading', { name: 'Segment Explorer' })).toBeTruthy();
    for (const label of [/^Column$/, /Dataset size/, /Rows per segment/, /Row order before segmenting/, /Null share/]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect((screen.getByLabelText('Column') as HTMLSelectElement).value).toBe('CustomerID');
    expect(metric('Rows')).toBe('1,000');
    expect(metric('Segments')).toBe('2');
    expect(metric('Overlapping Segments')).toBe('0 of 2');
    expect(orderLine()).toContain('ascending');
  });

  it('is deterministic across renders', () => {
    const first = render(<SegmentExplorer explanationMode="beginner" />);
    const a = snapshot();
    first.unmount();
    render(<SegmentExplorer explanationMode="beginner" />);
    expect(snapshot()).toEqual(a);
  });

  it('offers one example column per data type from the shared Customer table', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    const options = Array.from((screen.getByLabelText('Column') as HTMLSelectElement).options).map((o) => o.text);
    for (const [type, name] of [
      ['Integer', 'CustomerID'],
      ['Decimal', 'Revenue'],
      ['Date', 'LastPurchaseDate'],
      ['Text', 'Region'],
    ]) {
      expect(options.some((text) => text.startsWith(type) && text.includes(name))).toBe(true);
    }
  });

  it('labels rows per segment as an educational assumption and regenerates segments when it changes', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    expect(screen.getByText('Rows per segment: 500 (educational assumption)')).toBeTruthy();

    setSegmentSize(250);
    expect(screen.getByText('Rows per segment: 250 (educational assumption)')).toBeTruthy();
    expect(metric('Segments')).toBe('4');
    expect(screen.getByRole('list', { name: 'Segments' }).querySelectorAll('li')).toHaveLength(4);
    expect(document.querySelectorAll('.seg-table tbody tr')).toHaveLength(4);
  });

  it('shows one shorter final segment when the rows do not divide evenly', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    fireEvent.change(screen.getByLabelText(/Dataset size/), { target: { value: '1100' } });
    expect(metric('Segments')).toBe('3');
    expect(metric('Last Segment Rows')).toBe('100');
  });

  it('makes a single partial segment when the segment size exceeds the dataset', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    fireEvent.change(screen.getByLabelText(/Dataset size/), { target: { value: '100' } });
    expect(metric('Segments')).toBe('1');
    expect(metric('Last Segment Rows')).toBe('100');
  });

  it('shows overlapping ranges for an unordered column and reports them in the stat and on the tiles', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    setColumn('LastPurchaseDate');
    setSegmentSize(250);

    expect(orderLine()).toContain('unordered');
    expect(metric('Overlapping Segments')).toBe('4 of 4');
    expect(screen.getAllByText('Range overlaps another')).toHaveLength(4);
    expect(screen.getByText(/see Module 4/)).toBeTruthy();
  });

  it('segments the sorted rows when "Sorted by this column" is chosen', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    setColumn('Revenue');
    setSegmentSize(250);
    const unsortedOverlap = metric('Overlapping Segments');

    fireEvent.change(screen.getByLabelText('Row order before segmenting'), { target: { value: 'SORTED_ASCENDING' } });
    const order = orderLine();
    expect(order).toMatch(/as loaded:\s*unordered/);
    expect(order).toMatch(/As segmented:\s*ascending/);
    expect(unsortedOverlap).toBe('4 of 4');
    expect(parseInt(metric('Overlapping Segments'), 10)).toBeLessThan(4);
  });

  it('lets you select a segment and shows its details', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    expect(screen.getByRole('heading', { name: 'Segment 0 details' })).toBeTruthy();

    const second = screen.getByRole('button', { name: /^Segment 1\b/ });
    expect(second.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(second);

    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Segment 1 details' })).toBeTruthy();
    const facts = document.querySelector('.seg-facts')?.textContent ?? '';
    expect(facts).toContain('rows 501 to 1,000');
    expect(facts).toContain('501 / 1000');
    expect(document.querySelector('.seg-table tr[aria-current="true"] th')?.textContent).toBe('1');
  });

  it('keeps a valid selection when the number of segments shrinks', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    setSegmentSize(100);
    fireEvent.click(screen.getByRole('button', { name: /^Segment 9\b/ }));
    expect(screen.getByRole('heading', { name: 'Segment 9 details' })).toBeTruthy();

    setSegmentSize(2000);
    expect(metric('Segments')).toBe('1');
    expect(screen.getByRole('heading', { name: 'Segment 0 details' })).toBeTruthy();
  });

  it('adds a reserved dictionary entry when nulls are present', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    setColumn('Region');
    expect(metric('Dictionary Entries')).toBe('5');
    expect(metric('Null Rows')).toBe('0');

    fireEvent.change(screen.getByLabelText(/Null share/), { target: { value: '10' } });
    expect(metric('Dictionary Entries')).toBe('6');
    expect(parseInt(metric('Null Rows'), 10)).toBeGreaterThan(0);
  });

  it('shows the shared dictionary share per segment', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    setColumn('Region');
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/of 5 \(100%\)/).length).toBeGreaterThan(0);
  });

  it('changes the explanation per mode and labels documented, simulated and proprietary content', () => {
    const { rerender } = render(<SegmentExplorer explanationMode="beginner" />);
    expect(screen.getByText(/chunks called segments/)).toBeTruthy();

    rerender(<SegmentExplorer explanationMode="intermediate" />);
    expect(screen.getByText(/Module 4 uses these ranges/)).toBeTruthy();

    rerender(<SegmentExplorer explanationMode="advanced" />);
    expect(screen.getByText(/\[DOCUMENTED\] Microsoft Learn \(INFO\.STORAGETABLECOLUMNSEGMENTS\)/)).toBeTruthy();
    expect(screen.getByText(/\[SIMULATION\] Rows per segment is a configurable educational assumption/)).toBeTruthy();
    expect(screen.getByText(/\[SIMPLIFIED MODEL\] One dictionary per column shared by all its segments/)).toBeTruthy();
    expect(screen.getByText(/\[PROPRIETARY INTERNAL\] How the engine chooses segment boundaries/)).toBeTruthy();
  });

  it('distinguishes documented, simulated, simplified and proprietary content', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    for (const label of ['[DOCUMENTED]', '[SIMULATION]', '[SIMPLIFIED MODEL]', '[PROPRIETARY INTERNAL]']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('does not state a universal segment size and says the statistics are calculated here', () => {
    render(<SegmentExplorer explanationMode="advanced" />);
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/8 million|1,048,576|1 million rows per segment|segments are always|every segment (is|has) (exactly )?\d/i);
    expect(page).toContain('does not state or imply a real segment size');
    expect(page).toContain('Does not assume segments are evenly distributed in value');
    expect(page).toContain('not metadata read from any engine');
  });

  it('presents the sources with safe external links', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    const link = screen.getByRole('link', { name: /INFO\.STORAGETABLECOLUMNSEGMENTS/ }) as HTMLAnchorElement;
    expect(link.href).toContain('learn.microsoft.com');
    expect(link.rel).toContain('noopener');
  });

  it('uses only seg- prefixed classes for its own elements', () => {
    render(<SegmentExplorer explanationMode="beginner" />);
    const own = Array.from(document.querySelectorAll('.seg-explorer *'))
      .flatMap((el) => Array.from(el.classList))
      .filter((cls) => cls.startsWith('seg'));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((cls) => cls.startsWith('seg-'))).toBe(true);
  });
});
