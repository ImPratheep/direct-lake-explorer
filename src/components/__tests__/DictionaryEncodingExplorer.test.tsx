import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DictionaryEncodingExplorer from '../DictionaryEncodingExplorer';

const metric = (label: string): string => {
  const labelElement = screen.getByText(label);
  return labelElement.parentElement?.querySelector('.metric-value')?.textContent ?? '';
};

const selectColumn = (name: string): void => {
  fireEvent.change(screen.getByLabelText('Column'), { target: { value: name } });
};

const metricsSnapshot = (): string[] =>
  Array.from(document.querySelectorAll('.metric-value')).map((el) => el.textContent ?? '');

describe('DictionaryEncodingExplorer component (Module 1)', () => {
  it('renders heading, explanation and the seven metric cards', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);

    expect(screen.getByRole('heading', { name: 'Dictionary Encoding Explorer' })).toBeTruthy();
    expect(screen.getByText(/replaces every row with a small numeric ID/)).toBeTruthy();
    for (const label of [
      'Distinct Values',
      'Bits per ID',
      'Original Size',
      'Dictionary Size',
      'Encoded Size',
      'Compression Ratio',
      'Memory Saved',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('starts on the Region column with exactly 5 distinct values and 3 bits per ID', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    expect((screen.getByLabelText('Column') as HTMLSelectElement).value).toBe('Region');
    expect(metric('Distinct Values')).toBe('5');
    expect(metric('Bits per ID')).toBe('3');
  });

  it('is deterministic: two renders show identical metrics', () => {
    const first = render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    const a = metricsSnapshot();
    first.unmount();
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    expect(metricsSnapshot()).toEqual(a);
  });

  it('offers one example column per data type from the shared Customer table', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
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

  it('shows cardinality changing with the column and the row count', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    selectColumn('CustomerID');
    expect(metric('Distinct Values')).toBe('1,000');

    fireEvent.change(screen.getByLabelText(/Dataset Size/), { target: { value: '300' } });
    expect(screen.getByText('Dataset Size: 300 rows')).toBeTruthy();
    expect(metric('Distinct Values')).toBe('300');
  });

  it('warns when the dictionary makes the column bigger than the original', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    expect(screen.queryByRole('status')).toBeNull(); // Region compresses well

    selectColumn('CustomerID'); // every row distinct
    expect(screen.getByRole('status').textContent).toMatch(/bigger than the original/);
    expect(metric('Memory Saved').startsWith('-')).toBe(true);
  });

  it('shows original values next to their encoded IDs, with decimals to two places', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    selectColumn('Revenue');
    const cells = Array.from(document.querySelectorAll('.dictionary-table tbody td')).map((td) => td.textContent ?? '');
    expect(cells.some((text) => /^\d+\.\d{2}$/.test(text))).toBe(true);
    expect(document.querySelectorAll('.dictionary-table tbody tr')).toHaveLength(12);
  });

  it('no longer needs a Generate button because results update live', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    expect(screen.queryByRole('button', { name: 'Generate Dictionary' })).toBeNull();
  });

  it('changes the explanation per mode and labels proprietary details in advanced mode', () => {
    const { rerender } = render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    rerender(<DictionaryEncodingExplorer explanationMode="intermediate" />);
    expect(screen.getByText(/find the distinct values/)).toBeTruthy();
    rerender(<DictionaryEncodingExplorer explanationMode="advanced" />);
    expect(screen.getByText(/\[SIMPLIFIED MODEL\] Each distinct value/)).toBeTruthy();
    expect(screen.getByText(/\[PROPRIETARY INTERNAL\] The real dictionary layout/)).toBeTruthy();
  });

  it('distinguishes documented, simplified, simulated and proprietary content', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    for (const label of ['[DOCUMENTED]', '[SIMPLIFIED MODEL]', '[SIMULATION]', '[PROPRIETARY INTERNAL]']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('lists limitations that match the size model actually used, and sources', () => {
    render(<DictionaryEncodingExplorer explanationMode="beginner" />);
    expect(screen.getByRole('heading', { name: /Limitations/ })).toBeTruthy();
    expect(screen.getByText(/bit-packed IDs/)).toBeTruthy();
    expect(screen.queryByText(/4 bytes per ID/)).toBeNull();
    const link = screen.getByRole('link', { name: /Apache Parquet encodings/ }) as HTMLAnchorElement;
    expect(link.rel).toContain('noopener');
  });
});
