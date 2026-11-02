import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';

const readCss = (name: string): string => readFileSync(resolve(__dirname, '..', name), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('UI shell', () => {
  it('has one h1 and marks the current page in the navigation', () => {
    render(<App />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const nav = screen.getByRole('navigation');
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);

    fireEvent.click(screen.getByTitle('VertiPaq Simulator'));
    const after = screen.getByRole('navigation').querySelectorAll('[aria-current="page"]');
    expect(after).toHaveLength(1);
    expect(after[0].getAttribute('title')).toBe('VertiPaq Simulator');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('labels the explanation mode selector', () => {
    render(<App />);
    expect(screen.getByLabelText('Explanation mode')).toBeTruthy();
  });

  it('opens the pipeline and legend as dialogs and closes them with Escape', () => {
    render(<App />);
    for (const [open, name] of [
      [/query pipeline/i, /query pipeline/i],
      [/legend/i, /legend/i],
    ] as const) {
      fireEvent.click(screen.getAllByRole('button', { name: open })[0]);
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(within(dialog).getAllByRole('button', { name: /close/i }).length).toBeGreaterThan(0);
      expect(name).toBeTruthy();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });

  it('lists components in all five areas, so no area shows the empty state', () => {
    render(<App />);
    expect(screen.queryByText(/No component cards in this area yet/)).toBeNull();
    const counts = Array.from(document.querySelectorAll('.arch-area')).map((a) => a.querySelectorAll('.arch-card').length);
    expect(counts).toHaveLength(5);
    expect(counts.every((n) => n > 0)).toBe(true);
  });

  it('describes the five areas as conceptual, not physical layers', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /legend/i })[0]);
    expect(screen.getAllByText(/not five independent physical layers/i).length).toBeGreaterThan(0);
  });

  it('exposes the details panel as an ARIA tab list when a component is selected', () => {
    render(<App />);
    const card = document.querySelector<HTMLButtonElement>('.arch-card');
    expect(card).toBeTruthy();
    fireEvent.click(card as HTMLButtonElement);
    expect(card?.getAttribute('aria-pressed')).toBe('true');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toBeTruthy();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });
});

describe('Details panel depth', () => {
  const select = (name: RegExp): void => {
    const card = screen.getAllByRole('button').find((b) => b.classList.contains('arch-card') && name.test(b.textContent ?? ''));
    expect(card).toBeTruthy();
    fireEvent.click(card as HTMLElement);
  };

  it('shows the other two explanation levels as expandable sections', () => {
    render(<App />);
    select(/OneLake/);
    const panel = screen.getByRole('region', { name: 'Component details' });
    expect(within(panel).getByText('Intermediate')).toBeTruthy();
    expect(within(panel).getByText('Advanced')).toBeTruthy();
    expect(within(panel).queryByText('Beginner', { selector: 'summary' })).toBeNull();
  });

  it('offers hands-on links only for components with a matching simulator', () => {
    render(<App />);
    select(/Delta Lake/);
    expect(screen.getByRole('button', { name: /Delta Lake Explorer/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Delta Lake Explorer/ }));
    expect(screen.getByTitle('Delta Lake Explorer').getAttribute('aria-current')).toBe('page');
  });

  it('opens the matching VertiPaq tab from a hands-on link', () => {
    render(<App />);
    select(/Compression/);
    fireEvent.click(within(screen.getByRole('region', { name: 'Component details' })).getByRole('button', { name: /Column Compression/ }));
    expect(screen.getByRole('heading', { name: 'Column Compression Explorer' })).toBeTruthy();
  });

  it('shows inputs and outputs as a flow and links related components', () => {
    render(<App />);
    select(/OneLake/);
    fireEvent.click(screen.getByRole('tab', { name: 'Inputs/Outputs' }));
    expect(screen.getByRole('group', { name: 'Data flow for OneLake' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: 'Component details' })).getByRole('button', { name: /Lakehouse/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Lakehouse' })).toBeTruthy();
  });

  it('marks related names without a listed component as concepts, not links', () => {
    render(<App />);
    select(/OneLake/);
    fireEvent.click(screen.getByRole('tab', { name: 'Inputs/Outputs' }));
    expect(within(screen.getByRole('region', { name: 'Component details' })).getByRole('button', { name: /Shortcuts/ })).toBeTruthy();
    select(/Row-Level Security/);
    fireEvent.click(screen.getByRole('tab', { name: 'Inputs/Outputs' }));
    expect(screen.getAllByText('Related concept').length).toBeGreaterThan(0);
  });
});

describe('UI design system CSS', () => {
  it('defines tokens once, in index.css, and never redefines :root in App.css', () => {
    expect(stripComments(readFileSync(resolve(__dirname, '../../styles/index.css'), 'utf8'))).toContain('--color-accent-blue');
    expect(stripComments(readCss('App.css'))).not.toMatch(/:root\s*\{/);
  });

  it('keeps Stage 4 stylesheets on tokens with no hard-coded dark-theme colours', () => {
    for (const file of ['ArchitectureExplorer.css', 'DetailPanel.css', 'DataFlowWalkthrough.css', 'Legend.css']) {
      const css = stripComments(readCss(file));
      expect(css, file).toContain('var(--');
      expect(css, file).not.toMatch(/rgba?\(\s*(0|241)\s*,/);
    }
  });

  it('scopes Stage 4 component rules to their own roots', () => {
    const rootFor: Record<string, string> = {
      'ArchitectureExplorer.css': '.arch-',
      'DetailPanel.css': '.detail-panel',
      'DataFlowWalkthrough.css': '.data-flow-walkthrough',
      'Legend.css': '.legend',
    };
    for (const [file, root] of Object.entries(rootFor)) {
      const selectors = stripComments(readCss(file))
        .split('\n')
        .filter((l) => /\{\s*$/.test(l) && !l.startsWith(' ') && !l.startsWith('@') && !l.startsWith('}'))
        .flatMap((l) => l.replace(/\{\s*$/, '').split(','))
        .map((s) => s.trim())
        .filter(Boolean);
      const offenders = selectors.filter((s) => !s.startsWith(root) && !s.startsWith('.arch'));
      expect(offenders, file).toEqual([]);
    }
  });

  it('does not use dark text on accent fills that were previously unreadable', () => {
    const css = stripComments(readCss('SchemaEvolutionExplorer.css'));
    expect(css).not.toMatch(/color:\s*#000000/);
  });
});
