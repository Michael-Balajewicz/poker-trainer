// Seeded randomness.
//
// We never call Math.random(). Instead the seed lives in GameState as a plain
// number, so a hand is fully reproducible: the same seed always deals the same
// cards. That buys us three things — tests that can't flake, a "replay this
// hand" feature for free later, and a coach that gives the same answer twice
// for the same spot instead of two different ones.

/**
 * mulberry32 — a small, fast, seedable pseudo-random generator.
 * Returns a function that yields a new float in [0, 1) on each call.
 */
export function mulberry32(seed: number): () => number {
  // >>> 0 coerces to an unsigned 32-bit integer, which is the range this
  // algorithm is defined over.
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    // Math.imul is 32-bit integer multiply. Plain * would overflow into
    // floating point and break the algorithm.
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Derive the next hand's seed from this one, deterministically.
 *
 * A hand stores the seed it was dealt from. Rather than carrying a live
 * generator around (which wouldn't survive JSON.stringify), the next hand
 * just steps the seed forward with a standard linear congruential step.
 */
export function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0
}

/**
 * Fisher-Yates shuffle. Returns a new array; the input is not modified.
 *
 * Walking backwards and swapping each position with a random earlier one is
 * the only shuffle that is provably unbiased — every ordering is equally
 * likely. The naive "sort by random" approach is not.
 */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}
