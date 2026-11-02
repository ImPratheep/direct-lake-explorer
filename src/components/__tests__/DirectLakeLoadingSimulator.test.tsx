import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import DirectLakeLoadingSimulator from '../DirectLakeLoadingSimulator';

const metric = (label: string): string => {
  const card = Array.from(document.querySelectorAll('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
  return card?.querySelector('.metric-value')?.textContent ?? '';
};

const columnRow = (name: string): HTMLTableRowElement => {
  const table = document.querySelectorAll('.loading-table')[0];
  const row = Array.from(table.querySelectorAll('tbody tr')).find((tr) => tr.querySelector('th')?.textContent === name);
  if (!row) throw new Error(`No row for ${name}`);
  return row as HTMLTableRowElement;
};
// Cells after the row header: [0] checkbox, [1] type, [2] rows, [3] storage, [4] state, [5] memory
const cell = (name: string, index: number): string => columnRow(name).querySelectorAll('td')[index].textContent ?? '';
const stateOf = (name: string): string => cell(name, 4);
const memoryOf = (name: string): string => cell(name, 5);

const planRow = (name: string): string[] => {
  const table = document.querySelectorAll('.loading-table')[1];
  const row = Array.from(table.querySelectorAll('tbody tr')).find((tr) => tr.querySelector('th')?.textContent === name);
  return Array.from(row?.querySelectorAll('td') ?? []).map((td) => td.textContent ?? '');
};

const select = (...names: string[]): void => {
  for (const name of names) fireEvent.click(screen.getByLabelText(`Select ${name} to load`));
};
const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const queryBox = (name: string): HTMLInputElement =>
  within(screen.getByRole('group', { name: 'Columns the query needs' })).getByLabelText(name) as HTMLInputElement;
const setQuery = (...names: string[]): void => {
  for (const box of Array.from(document.querySelectorAll<HTMLInputElement>('.loading-fieldset input'))) {
    if (box.checked) fireEvent.click(box);
  }
  for (const name of names) fireEvent.click(queryBox(name));
};
const lastResult = (): string => document.querySelector('.loading-result')?.textContent ?? '';
const logText = (): string => document.querySelector('.loading-log')?.textContent ?? '';
const snapshot = (): string[] => Array.from(document.querySelectorAll('.metric-value')).map((el) => el.textContent ?? '');
const demo = (index: number): void => {
  fireEvent.click(screen.getAllByRole('button').filter((b) => b.textContent?.startsWith(`${index}. `))[0]);
};
const rows = (value: number): void => {
  fireEvent.change(screen.getByLabelText(/^Row count/), { target: { value: String(value) } });
};

describe('DirectLakeLoadingSimulator component (Module 6)', () => {
  describe('initial state', () => {
    it('renders the heading, settings and five unloaded Customer columns', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      expect(screen.getByRole('heading', { name: 'Direct Lake Column Loading Simulator' })).toBeTruthy();
      for (const label of [/^Row count/, /^Rows per segment/, /^Null share/, /^Numeric and date representation$/]) {
        expect(screen.getByLabelText(label)).toBeTruthy();
      }
      for (const name of ['CustomerID', 'Revenue', 'LastPurchaseDate', 'Region', 'CustomerName']) {
        expect(stateOf(name)).toMatch(/^○ Unloaded/);
        expect(memoryOf(name)).toBe('0 B');
      }
      expect(metric('Resident Columns')).toBe('0 of 5');
      expect(metric('Total Simulated Memory')).toBe('0 B');
    });

    it('shows name, type, rows and the Module 5 estimated storage for each column', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const expected: Record<string, string> = {
        CustomerID: '1,394 B',
        Revenue: '2,520 B',
        LastPurchaseDate: '1,394 B',
        Region: '549 B',
        CustomerName: '3,336 B',
      };
      for (const [name, size] of Object.entries(expected)) {
        expect(cell(name, 2)).toBe('1,000');
        expect(cell(name, 3)).toBe(size);
        expect(cell(name, 1)).not.toBe('');
      }
      expect(metric('All Columns Together')).toBe('9,193 B');
    });

    it('is deterministic across renders', () => {
      const first = render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID', 'Revenue');
      press('Load selected');
      press('Finish loading');
      const a = snapshot();
      first.unmount();
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID', 'Revenue');
      press('Load selected');
      press('Finish loading');
      expect(snapshot()).toEqual(a);
    });
  });

  describe('loading columns', () => {
    it('loads one column step by step without counting memory early', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID');
      press('Load selected');
      expect(stateOf('CustomerID')).toMatch(/^◔ Loading \(0 of 3 steps\)/);
      expect(memoryOf('CustomerID')).toBe('0 B');

      press('Advance one step');
      expect(stateOf('CustomerID')).toMatch(/Loading \(1 of 3 steps\)/);
      expect(memoryOf('CustomerID')).toBe('464 B');
      expect(metric('In-progress Memory')).toBe('464 B');
      expect(metric('Resident Memory')).toBe('0 B');
      expect(metric('Loading Columns')).toBe('1');

      press('Finish loading');
      expect(stateOf('CustomerID')).toMatch(/^● Loaded \(resident\)/);
      expect(memoryOf('CustomerID')).toBe('1,394 B');
      expect(metric('Resident Columns')).toBe('1 of 5');
      expect(metric('Simulated Steps')).toBe('3');
      expect(stateOf('Revenue')).toMatch(/Unloaded/);
    });

    it('shows progress for a loading column through a progress element', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID');
      press('Load selected');
      press('Advance one step');
      const progress = screen.getByLabelText('CustomerID loading progress') as HTMLProgressElement;
      expect(progress.max).toBe(3);
      expect(progress.value).toBe(1);
    });

    it('loads several columns together and counts each once', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('Revenue', 'Region');
      press('Load selected');
      press('Finish loading');
      expect(stateOf('Revenue')).toMatch(/Loaded/);
      expect(stateOf('Region')).toMatch(/Loaded/);
      expect(metric('Resident Columns')).toBe('2 of 5');
      expect(metric('Resident Memory')).toBe('3,069 B');
      // The slower column (Revenue, 5 steps) decides the elapsed time because they load together.
      expect(metric('Simulated Steps')).toBe('5');
    });

    it('does not add memory when a resident column is requested again', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID');
      press('Load selected');
      press('Finish loading');
      const before = metric('Total Simulated Memory');
      press('Load selected');
      press('Load selected');
      expect(metric('Total Simulated Memory')).toBe(before);
      expect(metric('Resident Columns')).toBe('1 of 5');
      expect(logText()).toMatch(/CustomerID is already resident, so nothing is loaded and no memory is added/);
    });

    it('ignores a repeated request for a column that is already loading', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID');
      press('Load selected');
      press('Advance one step');
      press('Load selected');
      expect(stateOf('CustomerID')).toMatch(/Loading \(1 of 3 steps\)/);
      expect(logText()).toMatch(/already loading/);
    });

    it('selects all and none', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      press('Select all');
      press('Load selected');
      press('Finish loading');
      expect(metric('Resident Columns')).toBe('5 of 5');
      expect(metric('Total Simulated Memory')).toBe('9,193 B');
      expect(metric('Share Of All Columns')).toBe('100.0%');
      press('Select none');
      expect((screen.getByRole('button', { name: 'Load selected' }) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('invalid selections', () => {
    it('disables loading until a column is selected and explains why', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      expect((screen.getByRole('button', { name: 'Load selected' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Select at least one column to enable loading.')).toBeTruthy();
      select('Region');
      expect((screen.getByRole('button', { name: 'Load selected' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('disables stepping when nothing is loading', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      expect((screen.getByRole('button', { name: 'Advance one step' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Finish loading' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('disables the query when no column is chosen', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      setQuery();
      expect((screen.getByRole('button', { name: 'Run simulated query' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Select at least one column for the query.')).toBeTruthy();
    });
  });

  describe('simulated queries', () => {
    it('plans a cold query as needing both columns, without changing memory', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      expect(planRow('CustomerID')[0]).toBe('Needs loading');
      expect(planRow('Revenue')[0]).toBe('Needs loading');
      expect(metric('Total Simulated Memory')).toBe('0 B');
    });

    it('runs a cold query: loads both together, in the time of the slower one', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      press('Run simulated query');
      expect(lastResult()).toMatch(/Loaded by this query:\s*CustomerID, Revenue/);
      expect(lastResult()).toMatch(/Reused \(already resident\):\s*none/);
      expect(lastResult()).toMatch(/Simulated steps spent loading:\s*5/);
      expect(lastResult()).toMatch(/0 B before, 3,914 B after/);
      expect(stateOf('CustomerID')).toMatch(/Loaded/);
      expect(stateOf('Revenue')).toMatch(/Loaded/);
    });

    it('separates already-available columns from columns that need loading', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID');
      press('Load selected');
      press('Finish loading');
      expect(planRow('CustomerID')).toEqual(['Already available (resident)', '1,394 B', '0']);
      expect(planRow('Revenue')).toEqual(['Needs loading', '2,520 B', '5']);
      const plan = document.querySelector('.loading-plan')?.textContent ?? '';
      expect(plan).toMatch(/Already available \(resident, no loading needed\): CustomerID/);
      expect(plan).toMatch(/Need loading: Revenue/);

      press('Run simulated query');
      expect(lastResult()).toMatch(/Reused \(already resident\):\s*CustomerID/);
      expect(lastResult()).toMatch(/Loaded by this query:\s*Revenue/);
      expect(lastResult()).toMatch(/1,394 B before, 3,914 B after/);
    });

    it('makes the query wait for a column that is still loading', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID');
      press('Load selected');
      press('Advance one step');
      setQuery('CustomerID');
      expect(planRow('CustomerID')[0]).toBe('Still loading, query waits');
      press('Run simulated query');
      expect(lastResult()).toMatch(/Waited for \(already loading\):\s*CustomerID/);
      expect(stateOf('CustomerID')).toMatch(/Loaded/);
    });

    it('reuses resident columns with no loading steps and no extra memory', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('Region');
      press('Load selected');
      press('Finish loading');
      setQuery('Region');
      expect(document.querySelector('.loading-plan')?.textContent).toMatch(/Every column the query needs is already resident/);
      const memoryBefore = metric('Total Simulated Memory');
      press('Run simulated query');
      expect(lastResult()).toMatch(/Simulated steps spent loading:\s*0/);
      expect(metric('Total Simulated Memory')).toBe(memoryBefore);
    });

    it('states that loading is separate from running the query and does not load the whole model', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      press('Run simulated query');
      expect(lastResult()).toMatch(/column loading only/);
      expect(document.querySelector('.loading-plan')?.textContent).toMatch(/Column loading is separate from query execution/);
      expect(document.querySelector('.loading-plan')?.textContent).toMatch(/not the whole semantic model/);
      expect(stateOf('CustomerName')).toMatch(/Unloaded/);
      expect(metric('Unloaded Columns')).toBe('3');
    });
  });

  describe('demonstrations', () => {
    it('walks through the five required demonstrations with the documented numbers', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);

      demo(1);
      expect(metric('Resident Columns')).toBe('1 of 5');
      expect(metric('Total Simulated Memory')).toBe('1,394 B');
      expect(metric('Simulated Steps')).toBe('3');

      demo(2);
      expect(metric('Resident Columns')).toBe('3 of 5');
      expect(metric('Total Simulated Memory')).toBe('4,463 B');
      expect(metric('Share Of All Columns')).toBe('48.5%');
      expect(metric('Simulated Steps')).toBe('8');

      demo(3);
      expect(lastResult()).toMatch(/Reused \(already resident\):\s*CustomerID, Revenue/);
      expect(lastResult()).toMatch(/Loaded by this query:\s*none/);
      expect(lastResult()).toMatch(/Simulated steps spent loading:\s*0/);
      expect(metric('Total Simulated Memory')).toBe('4,463 B');

      demo(4);
      expect(lastResult()).toMatch(/Reused \(already resident\):\s*Region/);
      expect(lastResult()).toMatch(/Loaded by this query:\s*none/);
      expect(metric('Total Simulated Memory')).toBe('4,463 B');

      demo(5);
      expect(lastResult()).toMatch(/Loaded by this query:\s*LastPurchaseDate/);
      expect(lastResult()).toMatch(/Simulated steps spent loading:\s*3/);
      expect(lastResult()).toMatch(/4,463 B before, 5,857 B after/);
      expect(metric('Resident Columns')).toBe('4 of 5');
      expect(metric('Unloaded Columns')).toBe('1');
      expect(stateOf('CustomerName')).toMatch(/Unloaded/);
      expect(stateOf('LastPurchaseDate')).toMatch(/Loaded/);
    });

    it('lists the demonstrations as buttons', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '');
      expect(labels).toContain('1. Load CustomerID only');
      expect(labels).toContain('2. Load Revenue and Region');
      expect(labels.some((l) => /3\. Run a query needing CustomerID and Revenue/.test(l))).toBe(true);
      expect(labels.some((l) => /4\. Run another query using an already-loaded column/.test(l))).toBe(true);
      expect(labels.some((l) => /5\. Request a previously unloaded column/.test(l))).toBe(true);
    });
  });

  describe('conceptual flow', () => {
    it('shows the six stages in order with a simplified-flow disclaimer', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const labels = Array.from(document.querySelectorAll('.loading-flow-label')).map((el) => el.textContent);
      expect(labels).toEqual(['OneLake', 'Delta Lake', 'Parquet', 'Column access', 'VertiPaq representation', 'Semantic model availability']);
      expect(document.body.textContent).toMatch(/simplified conceptual flow, not the complete internal Fabric implementation/);
    });

    it('selecting a stage shows its labelled explanation', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const vertipaq = screen.getByRole('button', { name: /VertiPaq representation/ });
      expect(vertipaq.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(vertipaq);
      expect(vertipaq.getAttribute('aria-pressed')).toBe('true');
      const detail = document.querySelector('.loading-stage-detail')?.textContent ?? '';
      expect(detail).toMatch(/\[DOCUMENTED\]/);
      expect(detail).toMatch(/\[PROPRIETARY INTERNAL\]/);
    });

    it('moves a column along the flow as it loads', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const at = (stage: string): string => screen.getByRole('list', { name: `Columns at ${stage}` }).textContent ?? '';

      expect(at('Parquet')).toMatch(/CustomerID/);
      expect(at('Semantic model availability')).toBe('');

      select('CustomerID');
      press('Load selected');
      expect(at('Column access')).toMatch(/CustomerID/);
      expect(at('Parquet')).not.toMatch(/CustomerID/);

      press('Advance one step');
      press('Advance one step');
      expect(at('VertiPaq representation')).toMatch(/CustomerID/);

      press('Finish loading');
      expect(at('Semantic model availability')).toMatch(/● CustomerID/);
      expect(at('Parquet')).not.toMatch(/CustomerID/);
      expect(at('Parquet')).toMatch(/Revenue/);
    });
  });

  describe('settings, edge cases and reset', () => {
    it('resets the session when a setting changes and says so', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('CustomerID');
      press('Load selected');
      press('Finish loading');
      rows(2000);
      expect(stateOf('CustomerID')).toMatch(/Unloaded/);
      expect(cell('CustomerID', 2)).toBe('2,000');
      expect(screen.getByRole('status').textContent).toMatch(/Settings changed, so the simulation was reset/);
      expect(metric('Total Simulated Memory')).toBe('0 B');
    });

    it('handles zero rows: columns are empty, load instantly and use 0 B', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      rows(0);
      expect(screen.getByText(/There are no rows, so every column is empty/)).toBeTruthy();
      press('Select all');
      press('Load selected');
      expect(metric('Resident Columns')).toBe('5 of 5');
      expect(metric('Total Simulated Memory')).toBe('0 B');
      expect(metric('Share Of All Columns')).toBe('0.0%');
      expect((screen.getByRole('button', { name: 'Finish loading' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByLabelText('CustomerID loading progress')).toBeNull();
    });

    it('handles an all-null dataset without invalid numbers', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      fireEvent.change(screen.getByLabelText(/^Null share/), { target: { value: '100' } });
      press('Select all');
      press('Load selected');
      press('Finish loading');
      expect(metric('Resident Columns')).toBe('5 of 5');
      const text = document.querySelector('.dictionary-explorer')?.textContent ?? '';
      expect(text).not.toMatch(/NaN|Infinity|undefined/);
      expect(metric('Total Simulated Memory')).not.toMatch(/-/);
    });

    it('changes column sizes with the representation setting', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const valueSize = cell('CustomerID', 3);
      fireEvent.change(screen.getByLabelText('Numeric and date representation'), { target: { value: 'DICTIONARY' } });
      expect(cell('CustomerID', 3)).not.toBe(valueSize);
      expect(cell('Region', 3)).toBe('549 B');
    });

    it('resets to the defaults and clears the log', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      rows(500);
      select('Region');
      press('Load selected');
      press('Finish loading');
      press('Reset simulation');
      expect(screen.getByLabelText(/^Row count/).getAttribute('value')).toBe('1000');
      expect(stateOf('Region')).toMatch(/Unloaded/);
      expect(metric('Resident Columns')).toBe('0 of 5');
      expect(logText()).toMatch(/Nothing has happened yet/);
      expect(lastResult()).toBe('');
    });
  });

  describe('event log', () => {
    it('is a live log that records each request and completion in order', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const log = screen.getByRole('log');
      expect(log.getAttribute('aria-live')).toBe('polite');
      select('CustomerID');
      press('Load selected');
      press('Finish loading');
      const items = Array.from(log.querySelectorAll('li')).map((li) => li.textContent ?? '');
      expect(items).toHaveLength(2);
      expect(items[0]).toMatch(/Load requested for CustomerID: the entire column is loaded/);
      expect(items[1]).toMatch(/step 3 CustomerID is now resident \(1,394 B\)/);
    });
  });

  describe('explanations and technical accuracy', () => {
    it('shows each explanation mode', () => {
      const { rerender } = render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      expect(screen.getByRole('heading', { name: 'Explanation (beginner)' })).toBeTruthy();
      rerender(<DirectLakeLoadingSimulator explanationMode="intermediate" />);
      expect(screen.getByRole('heading', { name: 'Explanation (intermediate)' })).toBeTruthy();
      rerender(<DirectLakeLoadingSimulator explanationMode="advanced" />);
      expect(screen.getByRole('heading', { name: 'Explanation (advanced)' })).toBeTruthy();
    });

    it('uses all four labels in the advanced explanation and cites documented behaviour', () => {
      render(<DirectLakeLoadingSimulator explanationMode="advanced" />);
      const panel = document.querySelector('.explanation-panel')?.textContent ?? '';
      for (const label of ['[DOCUMENTED]', '[SIMULATION]', '[SIMPLIFIED MODEL]', '[PROPRIETARY INTERNAL]']) {
        expect(panel).toContain(label);
      }
      expect(panel).toMatch(/transcoding/);
      expect(panel).toMatch(/resident/);
    });

    it('never claims the whole model must load and says availability is not a full import', () => {
      render(<DirectLakeLoadingSimulator explanationMode="intermediate" />);
      const text = document.body.textContent ?? '';
      expect(text).toMatch(/Availability is not a full import/);
      expect(text).toMatch(/Does not claim that the whole semantic model must be loaded/);
      expect(text).not.toMatch(/entire (semantic )?model (must|is) (be )?loaded/i);
    });

    it('lists limitations: no framing, eviction or query execution', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const limits = document.querySelector('.limitations-panel')?.textContent ?? '';
      expect(limits).toMatch(/Does not model framing, eviction/);
      expect(limits).toMatch(/does not scan, filter or aggregate/i);
      expect(limits).toMatch(/Neither is a Microsoft figure/);
    });

    it('links its Microsoft Learn sources safely', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.loading-sources a'));
      expect(links.length).toBeGreaterThanOrEqual(2);
      expect(links.some((a) => a.href.includes('learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works'))).toBe(true);
      for (const a of links) {
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      }
    });

    it('shows state as text and a symbol, not colour alone', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      select('Region');
      press('Load selected');
      expect(stateOf('Region')).toMatch(/◔ Loading/);
      press('Finish loading');
      expect(stateOf('Region')).toMatch(/● Loaded/);
      expect(stateOf('Revenue')).toMatch(/○ Unloaded/);
    });
  });

  describe('CSS isolation', () => {
    it('uses only loading- classes beyond the shared Module panel classes', () => {
      render(<DirectLakeLoadingSimulator explanationMode="beginner" />);
      const shared = new Set([
        'dictionary-explorer',
        'explorer-header',
        'explorer-description',
        'explanation-panel',
        'controls-section',
        'control-group',
        'results-section',
        'metrics-grid',
        'metric-card',
        'metric-label',
        'metric-value',
        'concepts-panel',
        'limitations-panel',
      ]);
      const own = new Set<string>();
      for (const el of Array.from(document.querySelectorAll('[class]'))) {
        for (const name of Array.from(el.classList)) if (!shared.has(name)) own.add(name);
      }
      expect(Array.from(own).filter((name) => !name.startsWith('loading-'))).toEqual([]);
    });
  });
});
