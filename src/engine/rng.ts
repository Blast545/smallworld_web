// Seeded, deterministic PRNG (mulberry32). The RNG state is a plain number so
// it can live inside the serializable GameState; every random event in the
// engine consumes and returns RNG state explicitly.

export type RngState = number;

export function seedRng(seed: number): RngState {
  const s = seed >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

export function nextU32(state: RngState): [number, RngState] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  return [(t ^ (t >>> 14)) >>> 0, a];
}

/** Uniform integer in [0, n). n must be >= 1. */
export function nextInt(state: RngState, n: number): [number, RngState] {
  if (n < 1) throw new Error(`nextInt: n must be >= 1, got ${n}`);
  // Rejection sampling to avoid modulo bias.
  const limit = Math.floor(0x100000000 / n) * n;
  let s = state;
  for (;;) {
    const [u, s2] = nextU32(s);
    s = s2;
    if (u < limit) return [u % n, s];
  }
}

export function shuffled<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const arr = items.slice();
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    const [j, s2] = nextInt(s, i + 1);
    s = s2;
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return [arr, s];
}

/** Reinforcement die: faces 0, 0, 0, 1, 2, 3 (see ASSUMPTIONS A2). */
export function rollReinforcementDie(state: RngState): [number, RngState] {
  const faces = [0, 0, 0, 1, 2, 3] as const;
  const [i, s] = nextInt(state, 6);
  return [faces[i] as number, s];
}

/** Deterministic 32-bit hash for strings (bot tie-breaking noise, not game RNG). */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
