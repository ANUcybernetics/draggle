// Puzzle numbering and seeded randomness. Pure: no clock or storage access.

/** Local calendar date of puzzle #1. */
export const LAUNCH = { year: 2026, month: 11, day: 9 };

const MS_PER_DAY = 86_400_000;

/** Puzzle number for a local calendar date; #1 is the launch date. */
export function dayNumber(date: Date): number {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const launch = Date.UTC(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day);
  return Math.floor((today - launch) / MS_PER_DAY) + 1;
}

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = () => number;

/** Mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The deterministic RNG for one game on one day. */
export function rngFor(gameId: string, day: number): Rng {
  return mulberry32(hashString(`draggle:${gameId}:${day}`));
}

export function randInt(rng: Rng, lo: number, hiExclusive: number): number {
  return lo + Math.floor(rng() * (hiExclusive - lo));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randInt(rng, 0, items.length)];
  if (item === undefined) throw new Error("pick from empty list");
  return item;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
