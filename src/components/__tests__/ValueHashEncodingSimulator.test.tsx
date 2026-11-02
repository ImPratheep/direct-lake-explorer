import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ValueHashEncodingSimulator from '../ValueHashEncodingSimulator';

const metric = (label: string): string => {
  const labelElement = screen.getByText(label);
  return labelElement.parentElement?.querySelector('.metric-value')?.textContent ?? '';
};

const selectColumn = (name: string): void => {
  fireEvent.change(screen.getByLabelText('Column'), { target: { value: name } });
};

describe('ValueHashEncodingSimulator component', () => {
  it('renders the heading, controls and both encoding panels for the default Integer column', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);

    expect(screen.getByRole('heading', { name: 'Value vs Hash Encoding Simulator' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Value encoding' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hash encoding' })).toBeTruthy();
    expect((screen.getByLabelText('Column') as HTMLSelectElement).value).toBe('CustomerID');
    expect(metric('Rows')).toBe('1,000');
    expect(metric('Distinct Values')).toBe('1,000');
    expect(metric('Smaller In This Model')).toBe('Value');
  });

  it('offers one example column per data type from the shared Customer table', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    const options = Array.from((screen.getByLabelText('Column') as HTMLSelectElement).options).map((o) => o.text);

    expect(options.some((text) => text.startsWith('Integer') && text.includes('CustomerID'))).toBe(true);
    expect(options.some((text) => text.startsWith('Decimal') && text.includes('Revenue'))).toBe(true);
    expect(options.some((text) => text.startsWith('Date') && text.includes('LastPurchaseDate'))).toBe(true);
    expect(options.some((text) => text.startsWith('Text') && text.includes('Region'))).toBe(true);
  });

  it('shows value encoding as not applicable for a text column and disables the outlier option', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    selectColumn('Region');

    expect(metric('Value Encoded')).toBe('N/A');
    expect(metric('Smaller In This Model')).toBe('Hash only (text)');
    expect(metric('Distinct Values')).toBe('5');
    expect((screen.getByLabelText(/Add one extreme value/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Text is not numeric/)).toBeTruthy();
  });

  it('updates metrics when the row count changes', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    fireEvent.change(screen.getByLabelText(/Rows:/), { target: { value: '500' } });

    expect(metric('Rows')).toBe('500');
    expect(metric('Distinct Values')).toBe('500');
  });

  it('flips the model result for LastPurchaseDate with the extreme value at 5,000 rows', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    selectColumn('LastPurchaseDate');
    expect(metric('Smaller In This Model')).toBe('Value');

    fireEvent.change(screen.getByLabelText(/Rows:/), { target: { value: '5000' } });
    fireEvent.click(screen.getByLabelText(/Add one extreme value/));

    expect(metric('Smaller In This Model')).toBe('Hash');
    expect(screen.getAllByText('9999-12-31').length).toBeGreaterThan(0);
  });

  it('formats decimals with two places in the sample tables', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    selectColumn('Revenue');
    const cells = Array.from(document.querySelectorAll('.vh-table tbody td')).map((td) => td.textContent ?? '');
    expect(cells.some((text) => /^\d+\.\d{2}$/.test(text))).toBe(true);
  });

  it('changes the explanation for each mode and labels proprietary details in advanced mode', () => {
    const { rerender } = render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    expect(screen.getByText(/Both are lossless/)).toBeTruthy();

    rerender(<ValueHashEncodingSimulator explanationMode="intermediate" />);
    expect(screen.getByText(/does not predict which encoding the engine selects/, { selector: 'p' })).toBeTruthy();

    rerender(<ValueHashEncodingSimulator explanationMode="advanced" />);
    expect(screen.getByText(/\[DOCUMENTED\] Microsoft Learn/)).toBeTruthy();
    expect(screen.getByText(/\[PROPRIETARY INTERNAL\] The engine/)).toBeTruthy();
  });

  it('distinguishes documented, simplified, simulated and proprietary content', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    for (const label of ['[DOCUMENTED]', '[SIMPLIFIED MODEL]', '[SIMULATION]', '[PROPRIETARY INTERNAL]']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('states that hash encoding is lossless and lists limitations and sources', () => {
    render(<ValueHashEncodingSimulator explanationMode="beginner" />);
    expect(screen.getByText(/It is lossless; it does not replace data with an irreversible hash/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Limitations/ })).toBeTruthy();
    const link = screen.getByRole('link', { name: /Column\.EncodingHint/ }) as HTMLAnchorElement;
    expect(link.href).toContain('learn.microsoft.com');
    expect(link.rel).toContain('noopener');
  });
});
