import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import MemoryResidencySimulator from '../MemoryResidencySimulator';

const metric = (label: string): string => {
  const card = Array.from(document.querySelectorAll('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
  return card?.querySelector('.metric-value')?.textContent ?? '';
};

const columnsTable = (): HTMLElement => within(screen.getByRole('region', { name: 'Customer columns and their residency' })).getByRole('table');
const rowFor = (table: HTMLElement, name: string): HTMLTableRowElement => {
  const row = Array.from(table.querySelectorAll('tbody tr')).find((tr) => tr.querySelector('th')?.textContent === name);
  if (!row) throw new Error(`No row for ${name}`);
  return row as HTMLTableRowElement;
};
// Cells after the row header: [0] checkbox, [1] type, [2] size, [3] residency, [4] memory now, [5] evicted / reloaded
const cell = (name: string, index: number): string => rowFor(columnsTable(), name).querySelectorAll('td')[index].textContent ?? '';
const residency = (name: string): string => cell(name, 3);
const occupied = (name: string): string => cell(name, 4);
const history = (name: string): string => cell(name, 5);

const comparisonRow = (name: string): string[] => {
  const region = screen.getByRole('region', { name: 'Before and after comparison' });
  const row = rowFor(within(region).getByRole('table'), name);
  return [row.querySelector('th')?.textContent ?? '', ...Array.from(row.querySelectorAll('td')).map((td) => td.textContent ?? '')];
};
const planRow = (name: string): string[] => {
  const region = screen.getByRole('region', { name: 'Query column plan' });
  return Array.from(rowFor(within(region).getByRole('table'), name).querySelectorAll('td')).map((td) => td.textContent ?? '');
};

const select = (...names: string[]): void => {
  for (const name of names) fireEvent.click(screen.getByLabelText(`Select ${name}`));
};
const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const button = (name: string | RegExp): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement;
const demo = (index: number): void => {
  fireEvent.click(screen.getAllByRole('button').filter((b) => b.textContent?.startsWith(`${index}. `))[0]);
};
const group = (name: string): HTMLElement => screen.getByRole('group', { name });
const setBudget = (value: string): void => {
  fireEvent.change(screen.getByLabelText(/^Illustrative memory budget/), { target: { value } });
};
const setRows = (value: number): void => {
  fireEvent.change(screen.getByLabelText(/^Row count/), { target: { value: String(value) } });
};
const setQuery = (...names: string[]): void => {
  for (const box of Array.from(group('Columns the query needs').querySelectorAll<HTMLInputElement>('input'))) {
    if (box.checked) fireEvent.click(box);
  }
  for (const name of names) fireEvent.click(within(group('Columns the query needs')).getByLabelText(name));
};
const protect = (...names: string[]): void => {
  for (const name of names) fireEvent.click(within(group('Columns the scenario must not evict')).getByLabelText(name));
};
const text = (selector: string): string => document.querySelector(selector)?.textContent ?? '';
const logText = (): string => text('.memory-log');
const summary = (): string => text('.memory-summary');
const snapshotValues = (): string[] => Array.from(document.querySelectorAll('.metric-value')).map((el) => el.textContent ?? '');

const loadThree = (): void => {
  select('CustomerID', 'Revenue', 'Region');
  press('Load selected');
  press('Select none');
};

describe('MemoryResidencySimulator component (Module 7)', () => {
  describe('initial state', () => {
    it('renders the heading, settings and five non-resident Customer columns', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      expect(screen.getByRole('heading', { name: 'Memory Residency and Eviction Simulator' })).toBeTruthy();
      for (const label of [/^Row count/, /^Rows per segment/, /^Null share/, /^Numeric and date representation$/, /^Illustrative memory budget/]) {
        expect(screen.getByLabelText(label)).toBeTruthy();
      }
      for (const name of ['CustomerID', 'Revenue', 'LastPurchaseDate', 'Region', 'CustomerName']) {
        expect(residency(name)).toBe('○ Not resident');
        expect(occupied(name)).toBe('0 B');
        expect(history(name)).toBe('0 / 0');
      }
      expect(metric('Resident Columns')).toBe('0 of 5');
      expect(metric('Total Simulated Memory')).toBe('0 B');
      expect(text('.memory-groups')).toMatch(/Resident: none/);
      expect(text('.memory-groups')).toMatch(/Not resident: CustomerID, Revenue, LastPurchaseDate, Region, CustomerName/);
    });

    it('shows the Module 5 estimated sizes through the Module 6 session', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      const expected: Record<string, string> = {
        CustomerID: '1,394 B',
        Revenue: '2,520 B',
        LastPurchaseDate: '1,394 B',
        Region: '549 B',
        CustomerName: '3,336 B',
      };
      for (const [name, size] of Object.entries(expected)) expect(cell(name, 2)).toBe(size);
      expect(metric('All Columns Together')).toBe('9,193 B');
    });

    it('is deterministic across renders', () => {
      const first = render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue');
      press('Evict selected');
      const a = snapshotValues();
      first.unmount();
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue');
      press('Evict selected');
      expect(snapshotValues()).toEqual(a);
    });
  });

  describe('loading and evicting', () => {
    it('loads columns so they become resident and occupy memory', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      for (const name of ['CustomerID', 'Revenue', 'Region']) expect(residency(name)).toBe('● Resident');
      expect(occupied('Revenue')).toBe('2,520 B');
      expect(metric('Resident Columns')).toBe('3 of 5');
      expect(metric('Total Simulated Memory')).toBe('4,463 B');
      expect(text('.memory-groups')).toMatch(/Resident: CustomerID, Revenue, Region/);
    });

    it('evicts a selected column: memory falls and the status changes in text, not colour alone', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue');
      press('Evict selected');
      expect(residency('Revenue')).toBe('○ Not resident');
      expect(occupied('Revenue')).toBe('0 B');
      expect(residency('Region')).toBe('● Resident');
      expect(metric('Total Simulated Memory')).toBe('1,943 B');
      expect(metric('Resident Columns')).toBe('2 of 5');
      expect(history('Revenue')).toBe('1 / 0');
    });

    it('shows memory before and after, with the change per column', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue');
      press('Evict selected');
      expect(summary()).toMatch(/Evict selected columns: memory before 4,463 B, after 1,943 B \(change -2,520 B\)/);
      expect(comparisonRow('Revenue')).toEqual(['Revenue', '● Resident, 2,520 B', '○ Not resident, 0 B', 'Evicted']);
      expect(comparisonRow('Region')).toEqual(['Region', '● Resident, 549 B', '● Resident, 549 B', 'Unchanged']);
      expect(text('.memory-plan')).toMatch(/Evicted \(user action\): Revenue/);
      expect(text('.memory-plan')).toMatch(/data stays in storage/);
    });

    it('evicts several columns at once and records one log entry each', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue', 'Region');
      press('Evict selected');
      expect(metric('Total Simulated Memory')).toBe('1,394 B');
      expect(logText().match(/was evicted/g)).toHaveLength(2);
    });

    it('labels the unused-column scenario in the log', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Region');
      press('Evict selected as an unused-column scenario');
      expect(logText()).toMatch(/Region was evicted \(unused-column scenario\)/);
      expect(metric('Total Simulated Memory')).toBe('3,914 B');
    });

    it('keeps retained columns resident while others are evicted', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue', 'Region');
      press('Evict selected');
      expect(residency('CustomerID')).toBe('● Resident');
      expect(occupied('CustomerID')).toBe('1,394 B');
    });
  });

  describe('repeated eviction and re-requesting', () => {
    it('evicting an already evicted column changes nothing and says so', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue');
      press('Evict selected');
      press('Evict selected');
      expect(metric('Total Simulated Memory')).toBe('1,943 B');
      expect(history('Revenue')).toBe('1 / 0');
      expect(logText()).toMatch(/Revenue is not resident, so there is nothing to evict/);
      expect(text('.memory-plan')).toMatch(/Nothing was evicted, so memory is unchanged/);
      expect(text('.memory-plan')).toMatch(/Revenue was skipped: it is not resident/);
    });

    it('a query needing an evicted column plans to load it again, and runs that load', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue');
      press('Evict selected');
      expect(planRow('CustomerID')[0]).toBe('Already available (resident)');
      expect(planRow('Revenue')).toEqual(['Needs loading (was evicted earlier)', '2,520 B', '5']);

      press('Run simulated query');
      expect(text('.memory-result')).toMatch(/Reused \(already resident\):\s*CustomerID/);
      expect(text('.memory-result')).toMatch(/Loaded by this query:\s*Revenue/);
      expect(text('.memory-result')).toMatch(/Simulated steps spent loading:\s*5/);
      expect(text('.memory-result')).toMatch(/1,943 B before, 4,463 B after/);
      expect(residency('Revenue')).toBe('● Resident');
      expect(history('Revenue')).toBe('1 / 1');
      expect(metric('Total Simulated Memory')).toBe('4,463 B');
    });

    it('does not mark a never-loaded column as evicted earlier', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      expect(planRow('Revenue')[0]).toBe('Needs loading');
    });
  });

  describe('invalid selections', () => {
    it('disables loading and eviction until a column is selected and explains why', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      for (const name of ['Load selected', 'Evict selected', 'Evict selected as an unused-column scenario']) {
        expect(button(name).disabled).toBe(true);
      }
      expect(screen.getByText('Select at least one column to enable loading and eviction.')).toBeTruthy();
      select('Region');
      expect(button('Load selected').disabled).toBe(false);
      expect(button('Evict selected').disabled).toBe(false);
    });

    it('disables the query when no column is chosen', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      setQuery();
      expect(button('Run simulated query').disabled).toBe(true);
      expect(screen.getByText('Select at least one column for the query.')).toBeTruthy();
    });
  });

  describe('illustrative memory budget', () => {
    it('is clearly labelled as a simulation setting, not a Fabric limit', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      expect(document.body.textContent).toMatch(/This budget is a setting of this simulator, not a Fabric limit or setting/);
      expect(document.body.textContent).toMatch(/Policy of this scenario/);
      expect(document.body.textContent).toMatch(/It is not Microsoft's policy/);
    });

    it('shows headroom, over budget and exact boundary states', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      setBudget('5000');
      expect(text('.memory-budget-status')).toMatch(/Within the illustrative budget: 4,463 B used of 5,000 B, headroom 537 B \(89\.3% of the budget\)/);
      setBudget('4463');
      expect(text('.memory-budget-status')).toMatch(/Within the illustrative budget: 4,463 B used of 4,463 B, headroom 0 B \(100\.0%/);
      setBudget('4462');
      expect(text('.memory-budget-status')).toMatch(/Over the illustrative budget: 4,463 B used of 4,462 B, over by 1 B/);
    });

    it('exposes the budget use as a meter that is also described in text', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      setBudget('8926');
      const meter = screen.getByRole('meter', { name: 'Simulated memory as a share of the illustrative budget' });
      expect(meter.getAttribute('aria-valuenow')).toBe('50');
      setBudget('1000');
      expect(meter.getAttribute('aria-valuenow')).toBe('100');
      expect(text('.memory-budget-status')).toMatch(/Over the illustrative budget/);
    });

    it('handles a zero budget without dividing by zero', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      setBudget('0');
      expect(text('.memory-budget-status')).toMatch(/over by 4,463 B\./);
      expect(text('.memory-budget-status')).not.toMatch(/NaN|Infinity|%/);
    });

    it('rejects invalid budgets: shows an alert and disables the scenario', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      for (const bad of ['', '-5', '1.5']) {
        setBudget(bad);
        expect(screen.getByRole('alert').textContent).toMatch(/whole number of bytes, 0 or more/);
        expect(button('Apply memory-pressure scenario').disabled).toBe(true);
        expect(screen.getByLabelText(/^Illustrative memory budget/).getAttribute('aria-invalid')).toBe('true');
      }
      setBudget('100');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(button('Apply memory-pressure scenario').disabled).toBe(false);
    });
  });

  describe('memory-pressure scenario', () => {
    it('evicts the largest unprotected column until the budget fits, and says what it did', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      protect('CustomerID');
      press('Apply memory-pressure scenario');
      expect(summary()).toMatch(/Memory-pressure scenario: memory before 4,463 B, after 1,943 B/);
      expect(residency('Revenue')).toBe('○ Not resident');
      expect(residency('CustomerID')).toBe('● Resident');
      expect(logText()).toMatch(/illustrative budget of 3,000 B/);
      expect(logText()).toMatch(/simulation settings, not Fabric behaviour/);
      expect(text('.memory-budget-status')).toMatch(/Within the illustrative budget/);
    });

    it('does nothing when memory is already within the budget', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      setBudget('4463');
      press('Apply memory-pressure scenario');
      expect(metric('Total Simulated Memory')).toBe('4,463 B');
      expect(logText()).toMatch(/within the illustrative budget of 4,463 B, so nothing is evicted/);
    });

    it('the chosen order changes the outcome', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      fireEvent.change(screen.getByLabelText('Eviction order used by the scenario'), { target: { value: 'EARLIEST_LOADED_FIRST' } });
      protect('CustomerID');
      press('Apply memory-pressure scenario');
      expect(residency('Region')).toBe('○ Not resident');
      expect(residency('Revenue')).toBe('○ Not resident');
      expect(metric('Total Simulated Memory')).toBe('1,394 B');
    });

    it('reports when protected columns keep memory over the budget', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      setBudget('1000');
      protect('CustomerID');
      press('Apply memory-pressure scenario');
      expect(residency('CustomerID')).toBe('● Resident');
      expect(metric('Total Simulated Memory')).toBe('1,394 B');
      expect(logText()).toMatch(/Still 394 B over the illustrative budget/);
      expect(text('.memory-budget-status')).toMatch(/Over the illustrative budget.*over by 394 B/);
    });

    it('with a zero budget and nothing protected evicts every resident column', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      setBudget('0');
      press('Apply memory-pressure scenario');
      expect(metric('Resident Columns')).toBe('0 of 5');
      expect(metric('Total Simulated Memory')).toBe('0 B');
    });

    it('the refresh scenario evicts every resident column and labels it', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      press('Refresh scenario: evict every resident column');
      expect(metric('Resident Columns')).toBe('0 of 5');
      expect(logText()).toMatch(/evicted \(refresh scenario\)/);
      expect(summary()).toMatch(/Refresh scenario: memory before 4,463 B, after 0 B/);
    });
  });

  describe('demonstrations', () => {
    it('walks the five scenarios with the documented figures', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);

      demo(1);
      expect(metric('Total Simulated Memory')).toBe('4,463 B');
      expect(metric('Resident Columns')).toBe('3 of 5');

      demo(2);
      expect(metric('Total Simulated Memory')).toBe('1,943 B');
      expect(summary()).toMatch(/before 4,463 B, after 1,943 B/);

      demo(3);
      expect(text('.memory-result')).toMatch(/Loaded by this query:\s*Revenue/);
      expect(metric('Total Simulated Memory')).toBe('4,463 B');
      expect(history('Revenue')).toBe('1 / 1');

      demo(4);
      expect(metric('Total Simulated Memory')).toBe('1,943 B');
      expect(residency('CustomerID')).toBe('● Resident');
      expect(residency('Revenue')).toBe('○ Not resident');

      demo(5);
      expect(metric('Resident Columns')).toBe('0 of 5');
      expect(metric('Total Simulated Memory')).toBe('0 B');
    });

    it('the pressure demonstration uses the budget chosen on the page', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      demo(1);
      setBudget('4000');
      demo(4);
      expect(logText()).toMatch(/illustrative budget of 4,000 B/);
      expect(metric('Total Simulated Memory')).toBe('1,943 B');
    });

    it('lists five demonstrations as buttons', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '');
      expect(labels).toContain('1. Load CustomerID, Revenue and Region');
      expect(labels).toContain('2. Evict Revenue (user action)');
      expect(labels.some((l) => /3\. Query CustomerID and Revenue \(Revenue was evicted\)/.test(l))).toBe(true);
      expect(labels.some((l) => /4\. Memory-pressure scenario, protecting CustomerID/.test(l))).toBe(true);
      expect(labels.some((l) => /5\. Refresh scenario/.test(l))).toBe(true);
    });
  });

  describe('settings, edge cases and reset', () => {
    it('resets the session when a setting changes and says so', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      setRows(2000);
      expect(residency('CustomerID')).toBe('○ Not resident');
      expect(screen.getByRole('status').textContent).toMatch(/Settings changed, so the simulation was reset/);
      expect(metric('Total Simulated Memory')).toBe('0 B');
    });

    it('handles zero rows: columns occupy 0 B, evicting releases nothing, no NaN', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      setRows(0);
      expect(screen.getByText(/There are no rows, so every column is empty/)).toBeTruthy();
      select('CustomerID', 'Revenue');
      press('Load selected');
      expect(residency('CustomerID')).toBe('● Resident');
      expect(metric('Total Simulated Memory')).toBe('0 B');
      press('Evict selected');
      expect(residency('CustomerID')).toBe('○ Not resident');
      expect(summary()).toMatch(/memory before 0 B, after 0 B \(change 0 B\)/);
      expect(document.querySelector('.memory-explorer')?.textContent).not.toMatch(/NaN|Infinity|undefined/);
    });

    it('handles an all-null dataset without invalid numbers', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      fireEvent.change(screen.getByLabelText(/^Null share/), { target: { value: '100' } });
      press('Select all');
      press('Load selected');
      select('Region');
      press('Evict selected');
      const all = document.querySelector('.memory-explorer')?.textContent ?? '';
      expect(all).not.toMatch(/NaN|Infinity|undefined/);
      expect(metric('Total Simulated Memory')).not.toMatch(/-/);
    });

    it('resets to the defaults, clearing history and the comparison', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      loadThree();
      select('Revenue');
      press('Evict selected');
      setBudget('10');
      press('Reset simulation');
      expect(metric('Resident Columns')).toBe('0 of 5');
      expect(history('Revenue')).toBe('0 / 0');
      expect(logText()).toMatch(/Nothing has happened yet/);
      expect(screen.getByText('Load, evict or run a query to compare memory before and after.')).toBeTruthy();
      expect((screen.getByLabelText(/^Illustrative memory budget/) as HTMLInputElement).value).toBe('3000');
    });
  });

  describe('event history', () => {
    it('is a polite live log that records load, eviction and reload in order', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      const log = screen.getByRole('log');
      expect(log.getAttribute('aria-live')).toBe('polite');
      select('Region');
      press('Load selected');
      press('Evict selected');
      press('Load selected');
      const items = Array.from(log.querySelectorAll('li')).map((li) => li.textContent ?? '');
      expect(items[0]).toMatch(/Load requested for Region/);
      expect(items[1]).toMatch(/Region is now resident \(549 B\)/);
      expect(items[2]).toMatch(/Region was evicted \(user action\)\. 549 B of simulated memory is released/);
      expect(items[3]).toMatch(/Load requested for Region/);
    });
  });

  describe('explanations and technical accuracy', () => {
    it('shows each explanation mode', () => {
      const { rerender } = render(<MemoryResidencySimulator explanationMode="beginner" />);
      expect(screen.getByRole('heading', { name: 'Explanation (beginner)' })).toBeTruthy();
      rerender(<MemoryResidencySimulator explanationMode="intermediate" />);
      expect(screen.getByRole('heading', { name: 'Explanation (intermediate)' })).toBeTruthy();
      rerender(<MemoryResidencySimulator explanationMode="advanced" />);
      expect(screen.getByRole('heading', { name: 'Explanation (advanced)' })).toBeTruthy();
    });

    it('uses all four labels in the advanced explanation and the documented-versus-simulated panel', () => {
      render(<MemoryResidencySimulator explanationMode="advanced" />);
      const panel = text('.explanation-panel');
      const facts = text('.memory-facts');
      for (const label of ['[DOCUMENTED]', '[SIMULATION]', '[SIMPLIFIED MODEL]', '[PROPRIETARY INTERNAL]']) {
        expect(panel).toContain(label);
        expect(facts).toContain(label);
      }
      expect(panel).toMatch(/memory pressure/);
      expect(panel).toMatch(/SKU determines the maximum memory/);
    });

    it('says what is not claimed: no real limits, thresholds, algorithm or Fabric reproduction', () => {
      render(<MemoryResidencySimulator explanationMode="advanced" />);
      expect(text('.explanation-panel')).toMatch(/real memory limits, eviction thresholds and algorithm, eviction priority and timing are not published/);
      const limits = text('.limitations-panel');
      expect(limits).toMatch(/does not reproduce Fabric memory management/);
      expect(limits).toMatch(/does not model a least-recently-used or any other real policy/);
      expect(limits).toMatch(/Neither is a Fabric setting, limit or threshold/);
      expect(limits).toMatch(/Evicts only when you act/);
    });

    it('does not state any real Fabric memory figure or claim automatic eviction', () => {
      render(<MemoryResidencySimulator explanationMode="advanced" />);
      const body = document.body.textContent ?? '';
      expect(body).not.toMatch(/\b\d+\s?(GB|MB|TB)\b/i);
      expect(body).not.toMatch(/Fabric (automatically )?evicts (the )?(least|oldest)/i);
    });

    it('links its Microsoft Learn sources safely', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.memory-sources a'));
      expect(links.some((a) => a.href.includes('learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works'))).toBe(true);
      for (const a of links) {
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      }
    });
  });

  describe('accessibility', () => {
    it('gives every checkbox and control an accessible name', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('.memory-explorer input'))) {
        const named = input.getAttribute('aria-label') || input.labels?.length;
        expect(named).toBeTruthy();
      }
    });

    it('uses row and column headers and named scrollable regions for tables', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      const table = columnsTable();
      expect(table.querySelectorAll('thead th[scope="col"]').length).toBe(7);
      expect(table.querySelectorAll('tbody th[scope="row"]').length).toBe(5);
      expect(screen.getByRole('region', { name: 'Customer columns and their residency' }).getAttribute('tabindex')).toBe('0');
    });

    it('never shows residency by colour alone: every state has a symbol and a word', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
      select('Region');
      press('Load selected');
      expect(residency('Region')).toMatch(/^● Resident$/);
      expect(residency('Revenue')).toMatch(/^○ Not resident$/);
    });
  });

  describe('CSS isolation', () => {
    it('uses only memory- classes beyond the shared Module panel classes', () => {
      render(<MemoryResidencySimulator explanationMode="beginner" />);
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
      expect(Array.from(own).filter((name) => !name.startsWith('memory-'))).toEqual([]);
    });
  });
});
