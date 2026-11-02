/**
 * [SIMULATION] Deterministic inputs for UI Review Mode.
 *
 * Most Stage 5 generators stamp the current time and add random file sizes, so two renders never look the same.
 * `withFixedEntropy` runs a generator with a fixed clock and a seeded random sequence, then restores the real
 * ones. The generators themselves are untouched, and normal (non-review) use of the app is unchanged.
 */

/** 15 June 2024, 12:00 UTC. Every review timestamp is relative to this instant. */
export const REVIEW_EPOCH_MS = Date.UTC(2024, 5, 15, 12, 0, 0);

export const REVIEW_SEED = 20240615;

/** Small seeded generator (mulberry32). The same seed always produces the same sequence. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs `generate` synchronously with a fixed Date.now and a seeded Math.random, restoring both afterwards. */
export function withFixedEntropy<T>(generate: () => T, seed: number = REVIEW_SEED): T {
  const realNow = Date.now;
  const realRandom = Math.random;
  const next = seededRandom(seed);
  Date.now = () => REVIEW_EPOCH_MS;
  Math.random = next;
  try {
    return generate();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}
