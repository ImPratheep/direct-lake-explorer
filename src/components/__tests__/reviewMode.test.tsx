import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import { REVIEW_SCREENS } from '../../review/reviewScreens';

const readCss = (name: string): string => readFileSync(resolve(__dirname, '..', name), 'utf8');

const setUrl = (search: string): void => window.history.replaceState(null, '', `/${search}`);

const openReview = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /UI Review/ }));
};

const reviewNav = (): HTMLElement => screen.getByRole('navigation', { name: 'Review screens' });
const goTo = (label: string): void => {
  fireEvent.click(within(reviewNav()).getByRole('button', { name: label }));
};

beforeEach(() => setUrl(''));
afterEach(() => {
  cleanup();
  setUrl('');
});

describe('UI Review Mode entry and exit', () => {
  it('is off by default, with a clearly labelled toggle and no review UI', () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: /UI Review/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('region', { name: 'UI Review Mode' })).toBeNull();
    expect(screen.queryByTestId('review-fold')).toBeNull();
  });

  it('opens from the header, shows the review panel and closes again', () => {
    render(<App />);
    openReview();
    expect(screen.getByRole('button', { name: /UI Review/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: 'UI Review Mode' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Exit review/ }));
    expect(screen.queryByRole('region', { name: 'UI Review Mode' })).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('opens directly from the URL on the requested screen and viewport', () => {
    setUrl('?review=1&screen=memory&viewport=1600x900');
    render(<App />);
    expect(screen.getByRole('region', { name: 'UI Review Mode' })).toBeTruthy();
    expect(screen.getByText(/Screen 13 of 14/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Memory Residency and Eviction Simulator' })).toBeTruthy();
    expect((screen.getByLabelText('Viewport') as HTMLSelectElement).value).toBe('1600x900');
    expect(screen.getByTestId('review-fold').textContent).toContain('900px fold');
  });

  it('keeps the URL in sync while navigating', () => {
    render(<App />);
    openReview();
    goTo('Parquet Explorer');
    expect(window.location.search).toBe('?review=1&screen=parquet');
    fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: '1366x768' } });
    expect(window.location.search).toBe('?review=1&screen=parquet&viewport=1366x768');
  });
});

describe('UI Review Mode navigation', () => {
  it('lists all 14 screens in three groups and marks the current one', () => {
    render(<App />);
    openReview();
    const nav = reviewNav();
    expect(within(nav).getAllByRole('button')).toHaveLength(14);
    expect(within(nav).getByText('Architecture', { selector: '.review-group-label' })).toBeTruthy();
    expect(within(nav).getByText('Stage 5', { selector: '.review-group-label' })).toBeTruthy();
    expect(within(nav).getByText('Stage 6', { selector: '.review-group-label' })).toBeTruthy();
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Architecture Explorer');
  });

  it('reaches every screen, and each one renders its module', () => {
    render(<App />);
    openReview();
    const seen = new Set<string>();
    for (const target of REVIEW_SCREENS) {
      goTo(target.label);
      expect(reviewNav().querySelector('[aria-current="page"]')?.textContent).toContain(target.label);
      const heading =
        target.module === 'vertipaq'
          ? document.querySelector('main .explorer-header h2')?.textContent
          : document.querySelector('main h2')?.textContent;
      expect(heading, target.id).toBeTruthy();
      seen.add(`${target.module}:${heading}`);
    }
    expect(seen.size).toBe(14);
  });

  it('steps with Next and Prev and wraps around', () => {
    render(<App />);
    openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Previous screen' }));
    expect(screen.getByText(/Screen 14 of 14/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next screen' }));
    expect(screen.getByText(/Screen 1 of 14/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next screen' }));
    expect(screen.getByText(/Screen 2 of 14/)).toBeTruthy();
  });

  it('follows the existing navigation too, so nothing is lost', () => {
    render(<App />);
    openReview();
    fireEvent.click(screen.getByTitle('Schema Evolution Explorer'));
    expect(reviewNav().querySelector('[aria-current="page"]')?.textContent).toContain('Schema Evolution');
    fireEvent.click(screen.getByTitle('VertiPaq Simulator'));
    fireEvent.click(screen.getByTitle('💾 Memory Residency'));
    expect(reviewNav().querySelector('[aria-current="page"]')?.textContent).toContain('7 Memory Residency');
  });
});

describe('UI Review Mode starting states', () => {
  it('opens Stage 5 simulators with results already shown', () => {
    render(<App />);
    openReview();
    goTo('Predicate Pushdown');
    expect(screen.getByText('Evaluation Results')).toBeTruthy();
    goTo('Partitioning Explorer');
    expect(screen.getByText('Partition Pruning Results')).toBeTruthy();
  });

  it('opens Modules 6 to 8 already populated', () => {
    render(<App />);
    openReview();
    goTo('6 Column Loading');
    expect(screen.getByText('Last query result')).toBeTruthy();
    expect(document.querySelectorAll('.loading-badge-loaded').length).toBeGreaterThan(0);
    goTo('7 Memory Residency');
    expect(screen.getByText(/Before and after/)).toBeTruthy();
    goTo('8 Storage Engine Scan');
    expect(screen.getAllByText(/handed back to the Formula Engine/).length).toBeGreaterThan(0);
  });

  it('shows identical Stage 5 data on every visit', () => {
    render(<App />);
    openReview();
    goTo('Delta Lake Explorer');
    const first = document.querySelector('main')?.textContent;
    goTo('Parquet Explorer');
    goTo('Delta Lake Explorer');
    expect(document.querySelector('main')?.textContent).toBe(first);
    expect(first).toMatch(/2024/);
  });

  it('leaves normal mode unchanged: Module 6 still starts with nothing loaded', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('VertiPaq Simulator'));
    fireEvent.click(screen.getByTitle('⬆️ Direct Lake Loading'));
    expect(screen.queryByText('Last query result')).toBeNull();
    expect(document.querySelectorAll('.loading-badge-loaded')).toHaveLength(0);
    fireEvent.click(screen.getByTitle('Predicate Pushdown Simulator'));
    expect(screen.queryByText('Evaluation Results')).toBeNull();
  });
});

describe('UI Review Mode reset', () => {
  it('restores the explanation mode, closes details and returns to a default state', () => {
    render(<App />);
    openReview();
    fireEvent.change(screen.getByLabelText('Explanation mode'), { target: { value: 'advanced' } });
    fireEvent.click(document.querySelector('.arch-card') as HTMLElement);
    expect(document.querySelector('.detail-panel')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default state' }));
    expect((screen.getByLabelText('Explanation mode') as HTMLSelectElement).value).toBe('beginner');
    expect(document.querySelector('.detail-panel')).toBeNull();
    expect(screen.getByText(/Screen 1 of 14/)).toBeTruthy();
  });

  it('restores a module you changed, and stays on the same screen', () => {
    render(<App />);
    openReview();
    goTo('6 Column Loading');
    const initial = document.querySelectorAll('.loading-badge-loaded').length;
    fireEvent.click(screen.getAllByRole('button', { name: /Load Revenue and Region/ })[0]);
    expect(document.querySelectorAll('.loading-badge-loaded').length).toBeGreaterThan(initial);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default state' }));
    expect(document.querySelectorAll('.loading-badge-loaded')).toHaveLength(initial);
    expect(screen.getByText(/Screen 12 of 14/)).toBeTruthy();
  });

  it('closes open dialogs', () => {
    render(<App />);
    openReview();
    fireEvent.click(screen.getAllByRole('button', { name: /legend/i })[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default state' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('UI Review Mode viewport guides', () => {
  it('limits the layout width and marks the fold only for a fixed viewport', () => {
    render(<App />);
    openReview();
    const app = document.querySelector('.app') as HTMLElement;
    expect(app.classList.contains('review-framed')).toBe(false);

    for (const [id, width, height] of [
      ['1920x1080', 1920, 1080],
      ['1600x900', 1600, 900],
      ['1366x768', 1366, 768],
    ] as const) {
      fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: id } });
      expect(app.classList.contains('review-framed')).toBe(true);
      expect(app.style.getPropertyValue('--review-frame-width')).toBe(`${width}px`);
      const fold = screen.getByTestId('review-fold');
      expect(fold.style.top).toBe(`${height}px`);
      expect(fold.getAttribute('aria-hidden')).toBe('true');
    }

    fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: 'fit' } });
    expect(app.classList.contains('review-framed')).toBe(false);
    expect(screen.queryByTestId('review-fold')).toBeNull();
  });

  it('reports the window size in text, not colour alone', () => {
    render(<App />);
    openReview();
    fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: '1366x768' } });
    expect(screen.getByText(/Window \d+ × \d+ \(target 1366 × 768\)/)).toBeTruthy();
  });

  it('hides and shows the review controls without leaving review mode', () => {
    render(<App />);
    openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Hide review controls' }));
    expect(screen.queryByRole('navigation', { name: 'Review screens' })).toBeNull();
    expect(screen.getByRole('region', { name: 'UI Review Mode' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show review controls' }));
    expect(reviewNav()).toBeTruthy();
  });
});

describe('UI Review Mode CSS scoping', () => {
  it('prefixes every ReviewPanel.css class with review-', () => {
    const css = readCss('ReviewPanel.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = css
      .split('\n')
      .filter((line) => /\{\s*$/.test(line) && !line.startsWith(' ') && !line.startsWith('@'))
      .flatMap((line) => line.replace(/\{\s*$/, '').split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(10);
    expect(selectors.filter((s) => !s.startsWith('.review-'))).toEqual([]);
  });

  it('does not use hard-coded colours', () => {
    const css = readCss('ReviewPanel.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
