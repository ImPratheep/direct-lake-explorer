import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import StorageEngineScanSimulator from '../StorageEngineScanSimulator';

const metric = (label: string): string => {
  const card = Array.from(document.querySelectorAll('.metric-card')).find(
    (el) => el.querySelector('.metric-label')?.textContent === label,
  );
  return card?.querySelector('.metric-value')?.textContent ?? '';
};

const field = (label: string): HTMLElement => screen.getByLabelText(label);
const setField = (label: string, value: string): void => {
  fireEvent.change(field(label), { target: { value } });
};
const scenario = (id: string): void => setField('Query scenario', id);
const run = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Run scan' }));
};
const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const runButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Run scan' }) as HTMLButtonElement;
const alertText = (): string => screen.queryByRole('alert')?.textContent ?? '';
const text = (selector: string): string => document.querySelector(selector)?.textContent ?? '';

const segmentRows = (): string[][] => {
  const region = screen.getByRole('region', { name: 'Segments and whether they were scanned' });
  return Array.from(within(region).getAllByRole('row'))
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent ?? ''));
};
const compareRows = (): string[][] => {
  const region = screen.getByRole('region', { name: 'Comparison of storage orders' });
  return Array.from(within(region).getAllByRole('row'))
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent ?? ''));
};
const stepStatuses = (): string[] => Array.from(document.querySelectorAll('.scan-flow-status')).map((el) => el.textContent ?? '');
const stepText = (stage: string): string => {
  const item = Array.from(document.querySelectorAll('.scan-flow-item')).find((el) => el.querySelector('.scan-flow-label')?.textContent === stage);
  return item?.textContent ?? '';
};
const residentLine = (): string => text('.scan-groups');
const snapshotValues = (): string[] => Array.from(document.querySelectorAll('.metric-value')).map((el) => el.textContent ?? '');

describe('StorageEngineScanSimulator component (Module 8)', () => {
  describe('initial state', () => {
    it('renders the heading, settings, query controls and a not-yet-run sequence', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      expect(screen.getByRole('heading', { name: 'Storage Engine Scan Simulator' })).toBeTruthy();
      for (const label of [
        /^Row count/, /^Rows per segment/, /^Null share/, /^Numeric and date representation$/, 'Query scenario', 'Aggregation',
        'Column to aggregate', 'Filter column', 'Table storage order',
      ]) {
        expect(screen.getByLabelText(label)).toBeTruthy();
      }
      expect((field('Query scenario') as HTMLSelectElement).value).toBe('SUM_REVENUE');
      expect((field('Filter column') as HTMLSelectElement).value).toBe('');
      expect(stepStatuses()).toEqual(Array(6).fill('○ Not run yet'));
      expect(screen.getByText('Run a scan to see the statistics, the segment table and the result.')).toBeTruthy();
      expect(residentLine()).toMatch(/Resident: none/);
      expect(residentLine()).toMatch(/Simulated memory: 0 B/);
    });

    it('shows the six stages in order', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      const labels = Array.from(document.querySelectorAll('.scan-flow-label')).map((el) => el.textContent);
      expect(labels).toEqual([
        'Query request', 'Required column availability', 'Segment elimination', 'Candidate segment scan', 'Aggregation', 'Result',
      ]);
      expect(document.body.textContent).toMatch(/conceptual visualization of the stages/);
    });

    it('offers the six scenarios', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      const options = Array.from((field('Query scenario') as HTMLSelectElement).options).map((o) => o.text);
      expect(options).toEqual([
        'Scan Revenue and calculate SUM',
        'Revenue for CustomerID 100 to 200',
        'Revenue for Region = East',
        'Revenue for March 2023, table as loaded',
        'Revenue for March 2023, table sorted by date',
        'Latest LastPurchaseDate (MAX)',
        'Custom query',
      ]);
    });
  });

  describe('scenarios', () => {
    it('SUM with no filter: loads Revenue, every segment is a candidate, elimination is skipped', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      run();
      expect(metric('Requested Columns')).toBe('Revenue');
      expect(metric('Already Resident')).toBe('none');
      expect(metric('Loaded For This Query')).toBe('Revenue');
      expect(metric('Simulated Memory')).toBe('0 B to 2,520 B');
      expect(metric('Total Segments')).toBe('2');
      expect(metric('Eliminated Segments')).toBe('0');
      expect(metric('Candidate Segments')).toBe('2');
      expect(metric('Rows In Candidate Segments')).toBe('1,000');
      expect(metric('Actual Matching Rows')).toBe('1,000');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = 2,502,487.79');
      expect(stepStatuses()).toEqual(['✓ Done', '✓ Done', '– Skipped', '✓ Done', '✓ Done', '✓ Done']);
      expect(text('.scan-summary')).toMatch(/SELECT SUM\(Revenue\) FROM Customer/);
      expect(text('.scan-summary')).toMatch(/not xmSQL and not captured from any engine/);
    });

    it('CustomerID filter: eliminates a segment, and candidate rows differ from matching rows', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      run();
      scenario('REVENUE_BY_CUSTOMERID');
      expect((field('Filter column') as HTMLSelectElement).value).toBe('CustomerID');
      expect((field('Filter operator') as HTMLSelectElement).value).toBe('BETWEEN');
      expect((field('Lower bound') as HTMLInputElement).value).toBe('100');
      expect((field('Upper bound (inclusive)') as HTMLInputElement).value).toBe('200');
      run();

      expect(metric('Requested Columns')).toBe('Revenue, CustomerID');
      expect(metric('Already Resident')).toBe('Revenue');
      expect(metric('Loaded For This Query')).toBe('CustomerID');
      expect(metric('Simulated Memory')).toBe('2,520 B to 3,914 B');
      expect(metric('Eliminated Segments')).toBe('1');
      expect(metric('Candidate Segments')).toBe('1');
      expect(metric('Rows In Candidate Segments')).toBe('500');
      expect(metric('Actual Matching Rows')).toBe('101');
      expect(metric('Candidate Rows Not Matching')).toBe('399');
      expect(metric('Values Read (modelled)')).toBe('1,000');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = 249,311.15');
      expect(document.body.textContent).toMatch(/Candidate rows are not matching rows/);
      expect(stepStatuses()).toEqual(Array(6).fill('✓ Done'));
    });

    it('lists each segment with a decision shown as a symbol and a word, and why', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      const rows = segmentRows();
      expect(rows).toHaveLength(2);
      expect(rows[0][0]).toBe('0');
      expect(rows[0][2]).toBe('✓ Candidate (scanned)');
      expect(rows[0][4]).toBe('500');
      expect(rows[0][5]).toBe('101');
      expect(rows[1][2]).toBe('✗ Eliminated');
      expect(rows[1][3]).toMatch(/^The range 501 to 1000 does not intersect/);
      expect(rows[1][4]).toBe('0');
      expect(rows[1][5]).toBe('-');
    });

    it('text filter: no elimination, every segment scanned, the match count is still exact', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_REGION');
      run();
      expect(metric('Eliminated Segments')).toBe('0');
      expect(metric('Actual Matching Rows')).toBe('193');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = 462,329.55');
      expect(stepStatuses()[2]).toBe('– Skipped');
      expect(document.body.textContent).toMatch(/supports numeric and date columns only/);
    });

    it('date range as loaded versus sorted: same answer, different work', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('DATE_RANGE_AS_LOADED');
      run();
      expect(metric('Eliminated Segments')).toBe('0');
      expect(metric('Rows In Candidate Segments')).toBe('1,000');
      expect(metric('Actual Matching Rows')).toBe('39');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = 85,564.51');

      scenario('DATE_RANGE_SORTED');
      run();
      expect(metric('Eliminated Segments')).toBe('1');
      expect(metric('Rows In Candidate Segments')).toBe('500');
      expect(metric('Actual Matching Rows')).toBe('39');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = 85,564.51');
      expect(metric('Loaded For This Query')).toBe('none');
    });

    it('date MAX: aggregates a date column over every row', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('MAX_PURCHASE_DATE');
      run();
      expect(metric('Aggregation Result')).toBe('MAX(LastPurchaseDate) = 2024-12-30');
      expect(metric('Loaded For This Query')).toBe('LastPurchaseDate');
    });
  });

  describe('compare storage orders', () => {
    it('shows both orders for a filtered date query without loading anything', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('DATE_RANGE_AS_LOADED');
      expect(compareRows()).toEqual([
        ['As loaded', '0', '2', '1,000', '39', '85,564.51'],
        ['Sorted by LastPurchaseDate', '1', '1', '500', '39', '85,564.51'],
      ]);
      expect(residentLine()).toMatch(/Resident: none/);
      expect(stepStatuses()).toEqual(Array(6).fill('○ Not run yet'));
    });

    it('asks for a valid filter when there is none or the query is invalid', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      expect(screen.getByText(/Choose a valid filter to compare/)).toBeTruthy();
      scenario('REVENUE_BY_CUSTOMERID');
      setField('Lower bound', 'abc');
      expect(screen.getByText(/Choose a valid filter to compare/)).toBeTruthy();
    });

    it('the storage-order control is disabled without a filter and sorts when chosen', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      expect((field('Table storage order') as HTMLSelectElement).disabled).toBe(true);
      expect(screen.getByText('The storage order only matters when there is a filter.')).toBeTruthy();
      scenario('DATE_RANGE_AS_LOADED');
      setField('Table storage order', 'SORTED_ASCENDING');
      expect((field('Query scenario') as HTMLSelectElement).value).toBe('CUSTOM');
      run();
      expect(metric('Eliminated Segments')).toBe('1');
    });
  });

  describe('custom queries and boundaries', () => {
    it('GT at a segment maximum eliminates it, GTE does not', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Filter column', 'CustomerID');
      setField('Filter operator', 'GT');
      setField('Filter value', '500');
      run();
      expect(metric('Eliminated Segments')).toBe('1');
      expect(metric('Actual Matching Rows')).toBe('500');

      setField('Filter operator', 'GTE');
      run();
      expect(metric('Eliminated Segments')).toBe('0');
      expect(metric('Actual Matching Rows')).toBe('501');
    });

    it('no matching rows because every segment is eliminated: nothing is read and the result is blank', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Filter column', 'CustomerID');
      setField('Filter operator', 'GT');
      setField('Filter value', '5000');
      run();
      expect(metric('Candidate Segments')).toBe('0');
      expect(metric('Rows In Candidate Segments')).toBe('0');
      expect(metric('Actual Matching Rows')).toBe('0');
      expect(metric('Values Read (modelled)')).toBe('0');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = (blank)');
      expect(stepText('Candidate segment scan')).toMatch(/no candidate segments, so no rows were read/);
    });

    it('a candidate segment with no matching row still reads its rows', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Filter column', 'Revenue');
      setField('Filter operator', 'EQ');
      setField('Filter value', '100.005');
      run();
      expect(metric('Candidate Segments')).toBe('2');
      expect(metric('Actual Matching Rows')).toBe('0');
      expect(metric('Candidate Rows Not Matching')).toBe('1,000');
    });

    it('a date filter accepts yyyy-mm-dd and includes both bounds', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Filter column', 'LastPurchaseDate');
      setField('Lower bound', '2023-01-01');
      setField('Upper bound (inclusive)', '2024-12-31');
      setField('Aggregation', 'COUNT');
      run();
      expect(metric('Actual Matching Rows')).toBe('1,000');
      expect(metric('Aggregation Result')).toBe('COUNT(Revenue) = 1,000');
    });

    it('supports the five aggregations on a numeric column', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Column to aggregate', 'CustomerID');
      const expected: Record<string, string> = {
        SUM: 'SUM(CustomerID) = 500,500',
        COUNT: 'COUNT(CustomerID) = 1,000',
        MIN: 'MIN(CustomerID) = 1',
        MAX: 'MAX(CustomerID) = 1,000',
        AVERAGE: 'AVERAGE(CustomerID) = 500.50',
      };
      for (const [aggregation, result] of Object.entries(expected)) {
        setField('Aggregation', aggregation);
        run();
        expect(metric('Aggregation Result')).toBe(result);
      }
    });

    it('text filters offer only equal and not-equal, and default sensibly', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Filter column', 'Region');
      const options = Array.from((field('Filter operator') as HTMLSelectElement).options).map((o) => o.value);
      expect(options).toEqual(['EQ', 'NEQ']);
      expect((field('Filter value') as HTMLInputElement).value).toBe('East');
      setField('Filter operator', 'NEQ');
      run();
      expect(metric('Actual Matching Rows')).toBe('807');
    });
  });

  describe('invalid input', () => {
    it('SUM of a date column: shows the reason, disables Run, marks the scenario custom', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Column to aggregate', 'LastPurchaseDate');
      expect(alertText()).toMatch(/SUM is not meaningful for the date column LastPurchaseDate\. For this column use COUNT, MIN, MAX\./);
      expect(runButton().disabled).toBe(true);
      expect((field('Query scenario') as HTMLSelectElement).value).toBe('CUSTOM');
      setField('Aggregation', 'MAX');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(runButton().disabled).toBe(false);
    });

    it('SUM of a text column and an invalid number or date are rejected with messages', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Column to aggregate', 'Region');
      expect(alertText()).toMatch(/SUM is not meaningful for the text column Region\. For this column use COUNT\./);
      setField('Aggregation', 'COUNT');
      expect(screen.queryByRole('alert')).toBeNull();

      setField('Filter column', 'CustomerID');
      setField('Filter operator', 'EQ');
      setField('Filter value', 'abc');
      expect(alertText()).toMatch(/must be a number/);
      expect(runButton().disabled).toBe(true);
      setField('Filter value', '');
      expect(alertText()).toMatch(/must be a number/);

      setField('Filter column', 'LastPurchaseDate');
      setField('Filter operator', 'EQ');
      setField('Filter value', '2023-13-45');
      expect(alertText()).toMatch(/valid date in yyyy-mm-dd form/);
      setField('Filter column', 'Region');
      setField('Filter value', '');
      expect(alertText()).toMatch(/Enter the text value/);
    });

    it('an invalid query changes nothing: no run, no loading, no memory', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Column to aggregate', 'LastPurchaseDate');
      fireEvent.click(runButton());
      expect(residentLine()).toMatch(/Resident: none/);
      expect(text('.scan-log')).toMatch(/Nothing has happened yet/);
    });
  });

  describe('settings, empty data and nulls', () => {
    it('zero rows: no segments, blank SUM, COUNT 0, no NaN', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      fireEvent.change(screen.getByLabelText(/^Row count/), { target: { value: '0' } });
      run();
      expect(metric('Total Segments')).toBe('0');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = (blank)');
      expect(screen.getByText('There are no rows, so there are no segments.')).toBeTruthy();
      setField('Aggregation', 'COUNT');
      run();
      expect(metric('Aggregation Result')).toBe('COUNT(Revenue) = 0');
      expect(document.querySelector('.scan-explorer')?.textContent).not.toMatch(/NaN|Infinity|undefined/);
    });

    it('an all-null dataset: SUM is blank; a filter eliminates every segment as all null', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      setField('Null share (approximate)', '100');
      run();
      expect(metric('Actual Matching Rows')).toBe('1,000');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = (blank)');
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      expect(metric('Candidate Segments')).toBe('0');
      expect(segmentRows().every((r) => r[3].includes('only nulls'))).toBe(true);
    });

    it('changing a setting resets the session and the last result, and says so', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      run();
      fireEvent.change(screen.getByLabelText(/^Row count/), { target: { value: '2000' } });
      expect(screen.getByRole('status').textContent).toMatch(/Settings changed, so the simulation was reset/);
      expect(residentLine()).toMatch(/Resident: none/);
      expect(stepStatuses()).toEqual(Array(6).fill('○ Not run yet'));
      run();
      expect(metric('Total Segments')).toBe('4');
      expect(metric('Rows In Candidate Segments')).toBe('2,000');
    });

    it('rows per segment changes the segment count the scan uses', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      fireEvent.change(screen.getByLabelText(/^Rows per segment/), { target: { value: '100' } });
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      expect(metric('Total Segments')).toBe('10');
      expect(metric('Candidate Segments')).toBe('2'); // CustomerID 100 is in segment 0 (1 to 100); 101 to 200 is segment 1
      expect(metric('Actual Matching Rows')).toBe('101');
    });
  });

  describe('required columns, residency and eviction', () => {
    it('reuses resident columns and does not double count memory when the scan is repeated', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      expect(metric('Simulated Memory')).toBe('0 B to 3,914 B');
      run();
      expect(metric('Loaded For This Query')).toBe('none');
      expect(metric('Already Resident')).toBe('Revenue, CustomerID');
      expect(metric('Simulated Memory')).toBe('3,914 B to 3,914 B');
      expect(residentLine()).toMatch(/Simulated memory: 3,914 B/);
      expect(stepText('Required column availability')).toMatch(/Every required column was already resident, so nothing was loaded/);
    });

    it('a column evicted by the user is loaded again before the next scan', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      setField('Resident column to evict', 'Revenue');
      press('Evict column');
      expect(residentLine()).toMatch(/Resident: CustomerIDNot resident: Revenue/);
      expect(residentLine()).toMatch(/Simulated memory: 1,394 B/);
      run();
      expect(metric('Already Resident')).toBe('CustomerID');
      expect(metric('Loaded For This Query')).toBe('Revenue');
      expect(metric('Simulated Memory')).toBe('1,394 B to 3,914 B');
      expect(metric('Aggregation Result')).toBe('SUM(Revenue) = 249,311.15');
    });

    it('evicts every resident column, and disables eviction when nothing is resident', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      expect((screen.getByRole('button', { name: 'Evict column' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Evict every resident column' }) as HTMLButtonElement).disabled).toBe(true);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      press('Evict every resident column');
      expect(residentLine()).toMatch(/Resident: none/);
      expect(residentLine()).toMatch(/Simulated memory: 0 B/);
    });

    it('records loading, eviction and the scan in a polite live event history', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      const log = screen.getByRole('log');
      expect(log.getAttribute('aria-live')).toBe('polite');
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      setField('Resident column to evict', 'Revenue');
      press('Evict column');
      const items = Array.from(log.querySelectorAll('li')).map((li) => li.textContent ?? '');
      expect(items.some((i) => /Query needs: Revenue, CustomerID/.test(i))).toBe(true);
      expect(items.some((i) => /Scan finished: 1 of 2 segment\(s\) were candidates, 101 row\(s\) matched, SUM\(Revenue\) = 249,311\.15/.test(i))).toBe(true);
      expect(items[items.length - 1]).toMatch(/Revenue was evicted \(user action\)/);
    });

    it('resets to the defaults, clearing the result and the history', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      press('Reset simulation');
      expect((field('Query scenario') as HTMLSelectElement).value).toBe('SUM_REVENUE');
      expect((field('Filter column') as HTMLSelectElement).value).toBe('');
      expect(residentLine()).toMatch(/Resident: none/);
      expect(stepStatuses()).toEqual(Array(6).fill('○ Not run yet'));
      expect(text('.scan-log')).toMatch(/Nothing has happened yet/);
    });
  });

  describe('determinism', () => {
    it('the same actions give identical results across renders', () => {
      const first = render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('DATE_RANGE_SORTED');
      run();
      const a = snapshotValues();
      first.unmount();
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('DATE_RANGE_SORTED');
      run();
      expect(snapshotValues()).toEqual(a);
    });
  });

  describe('explanations and technical accuracy', () => {
    it('shows each explanation mode', () => {
      const { rerender } = render(<StorageEngineScanSimulator explanationMode="beginner" />);
      expect(screen.getByRole('heading', { name: 'Explanation (beginner)' })).toBeTruthy();
      rerender(<StorageEngineScanSimulator explanationMode="intermediate" />);
      expect(screen.getByRole('heading', { name: 'Explanation (intermediate)' })).toBeTruthy();
      rerender(<StorageEngineScanSimulator explanationMode="advanced" />);
      expect(screen.getByRole('heading', { name: 'Explanation (advanced)' })).toBeTruthy();
    });

    it('uses all four labels in the advanced explanation and in the documented-versus-simulated panel', () => {
      render(<StorageEngineScanSimulator explanationMode="advanced" />);
      const panel = text('.explanation-panel');
      const facts = text('.scan-facts');
      for (const label of ['[DOCUMENTED]', '[SIMULATION]', '[SIMPLIFIED MODEL]', '[PROPRIETARY INTERNAL]']) {
        expect(panel).toContain(label);
        expect(facts).toContain(label);
      }
      expect(panel).toMatch(/multiple VertiPaq storage engine queries/);
    });

    it('keeps column loading, elimination, scanning and the Formula Engine apart', () => {
      render(<StorageEngineScanSimulator explanationMode="intermediate" />);
      const body = text('.explanation-panel');
      expect(body).toMatch(/Column loading makes the needed columns resident/);
      expect(body).toMatch(/Segment elimination uses each segment's min and max/);
      expect(body).toMatch(/The scan then reads the actual rows of the candidate segments/);
      expect(body).toMatch(/Formula Engine, which evaluates DAX, is not simulated/);
      run();
      expect(stepText('Result')).toMatch(/handed back to the Formula Engine \(conceptual\)/);
      expect(stepText('Result')).toMatch(/not simulated/);
    });

    it('does not claim to reproduce xmSQL, the engine, its segment order or its performance, and shows no timings', () => {
      render(<StorageEngineScanSimulator explanationMode="advanced" />);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      const body = document.body.textContent ?? '';
      expect(body).toMatch(/not xmSQL/);
      expect(body).toMatch(/does not reproduce the VertiPaq engine, its scan order, its optimizations or its performance/);
      expect(body).toMatch(/no segment order here is the real engine's order/);
      expect(body).not.toMatch(/\b\d+(\.\d+)?\s?(ms|milliseconds|seconds)\b/i);
      expect(body).not.toMatch(/\bactual xmSQL\b(?! |,)/);
    });

    it('states the limitations honestly', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      const limits = text('.limitations-panel');
      expect(limits).toMatch(/Candidate rows are never treated as matching rows/);
      expect(limits).toMatch(/no segment elimination for text filters/);
      expect(limits).toMatch(/not a DAX engine/);
      expect(limits).toMatch(/Nulls the same rows in every column/);
    });

    it('links its sources safely, including Microsoft Learn', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.scan-sources a'));
      expect(links.some((a) => a.href.includes('analysis-services/tabular-models/query-interleaving'))).toBe(true);
      expect(links.some((a) => a.href.includes('direct-lake-how-it-works'))).toBe(true);
      for (const a of links) {
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      }
    });
  });

  describe('accessibility', () => {
    it('gives every input and select an accessible name', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_CUSTOMERID');
      for (const control of Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.scan-explorer input, .scan-explorer select'))) {
        expect(control.getAttribute('aria-label') || control.labels?.length).toBeTruthy();
      }
    });

    it('uses captions, column and row headers, and named focusable regions for tables', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      const region = screen.getByRole('region', { name: 'Segments and whether they were scanned' });
      expect(region.getAttribute('tabindex')).toBe('0');
      const table = within(region).getByRole('table');
      expect(table.querySelector('caption')?.textContent).toMatch(/Candidate segment table/);
      expect(table.querySelectorAll('thead th[scope="col"]').length).toBe(6);
      expect(table.querySelectorAll('tbody th[scope="row"]').length).toBe(2);
    });

    it('announces validation problems with role alert and results in a live region', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      run();
      expect(document.querySelector('.scan-section[aria-live="polite"]')).toBeTruthy();
      setField('Column to aggregate', 'Region');
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('never shows status by colour alone: every step has a symbol and a word', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      expect(stepStatuses().every((s) => /^(○ Not run yet|✓ Done|– Skipped)$/.test(s))).toBe(true);
      run();
      expect(stepStatuses().every((s) => /^(✓ Done|– Skipped)$/.test(s))).toBe(true);
    });
  });

  describe('CSS isolation', () => {
    it('uses only scan- classes beyond the shared Module panel classes', () => {
      render(<StorageEngineScanSimulator explanationMode="beginner" />);
      scenario('REVENUE_BY_CUSTOMERID');
      run();
      const shared = new Set([
        'dictionary-explorer', 'explorer-header', 'explorer-description', 'explanation-panel', 'controls-section', 'control-group',
        'results-section', 'metrics-grid', 'metric-card', 'metric-label', 'metric-value', 'concepts-panel', 'limitations-panel',
      ]);
      const own = new Set<string>();
      for (const el of Array.from(document.querySelectorAll('[class]'))) {
        for (const name of Array.from(el.classList)) if (!shared.has(name)) own.add(name);
      }
      expect(Array.from(own).filter((name) => !name.startsWith('scan-'))).toEqual([]);
    });
  });
});
