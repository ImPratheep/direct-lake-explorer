import { describe, expect, it } from 'vitest';
import { getArchitectureComponents } from '../index';

const components = getArchitectureComponents();
const AREAS = ['Storage', 'Semantic', 'VertiPaq', 'Query', 'Memory'];

describe('architecture component data', () => {
  it('has unique ids and names', () => {
    expect(new Set(components.map((c) => c.id)).size).toBe(components.length);
    expect(new Set(components.map((c) => c.name)).size).toBe(components.length);
  });

  it('lists at least one component in every area', () => {
    for (const area of AREAS) {
      expect(components.filter((c) => c.layer === area).length, area).toBeGreaterThan(0);
    }
  });

  it('gives every component all three explanation levels and at least one source', () => {
    for (const c of components) {
      for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
        expect(c.explanations[level].trim().length, `${c.id} ${level}`).toBeGreaterThan(20);
      }
      expect(c.sources.length, c.id).toBeGreaterThan(0);
    }
  });

  it('cites only Microsoft Learn pages', () => {
    for (const c of components) {
      for (const s of c.sources) expect(s.url, c.id).toMatch(/^https:\/\/learn\.microsoft\.com\//);
    }
  });

  it('does not describe simulated or proprietary behaviour as documented fact', () => {
    for (const c of components.filter((x) => x.layer !== 'Storage')) {
      if (c.classification === 'DOCUMENTED') {
        expect(c.explanations.advanced, c.id).not.toMatch(/\b(LRU|least recently used)\b/i);
      }
      expect(JSON.stringify(c.explanations), c.id).not.toMatch(/\b\d+\s?(GB|MB)\b/);
    }
  });
});
