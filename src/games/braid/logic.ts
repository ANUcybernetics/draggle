// Braid words in the Artin generators, the three relations the game lets you
// apply, and the daily puzzle. Pure: the only randomness is the Rng passed in.
//
// Which strand passes over at each crossing, when a mixed-sign triangle move
// applies and how it sets the signs all follow the braid demo in Dragology
// (MIT licence), src/demos/braid.tsx.
//
// Convention: letters act on positions. Letter { i, sign } is σ_{i+1}^sign: it
// crosses the strands in positions i and i+1 (0-indexed), and the strand in
// position i before the crossing passes over when sign is +1, under when -1.
import { randInt, type Rng, rngFor } from "../../lib/daily";

export type Sign = 1 | -1;
export type Letter = { i: number; sign: Sign };
export type Word = readonly Letter[];

/** The strand (numbered by starting position, from 0) in each position after `word`. */
export function permutation(n: number, word: Word): number[] {
  const at = Array.from({ length: n }, (_, k) => k);
  for (const { i } of word) [at[i], at[i + 1]] = [at[i + 1] as number, at[i] as number];
  return at;
}

export const exponentSum = (word: Word) => word.reduce((sum, l) => sum + l.sign, 0);

export type Crossing = { a: number; b: number; over: number };

/** For each letter, the strands in its two positions just before it (a left, b right) and which passes over. */
export function crossings(n: number, word: Word): Crossing[] {
  const at = Array.from({ length: n }, (_, k) => k);
  return word.map(({ i, sign }) => {
    const a = at[i] as number;
    const b = at[i + 1] as number;
    [at[i], at[i + 1]] = [b, a];
    return { a, b, over: sign === 1 ? a : b };
  });
}

const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** Can letters j and j+1 trade places (σ_i σ_k = σ_k σ_i, |i−k| ≥ 2)? */
export function commutesAt(word: Word, j: number): boolean {
  const p = word[j];
  const q = word[j + 1];
  return p !== undefined && q !== undefined && Math.abs(p.i - q.i) >= 2;
}

export function commuteAt(word: Word, j: number): Letter[] {
  const w = [...word];
  [w[j], w[j + 1]] = [w[j + 1] as Letter, w[j] as Letter];
  return w;
}

/** Do letters j and j+1 cancel (σ_i σ_i⁻¹: the same strand passes over both times)? */
export function cancelsAt(word: Word, j: number): boolean {
  const p = word[j];
  const q = word[j + 1];
  return p !== undefined && q !== undefined && p.i === q.i && p.sign !== q.sign;
}

export const cancelAt = (word: Word, j: number): Letter[] => word.toSpliced(j, 2);

/**
 * Is `word[start..start+2]` a triangle σ_i σ_k σ_i (|i−k| = 1) the move applies
 * to? The three strands must be layered consistently: one of them passes over
 * both of the others.
 */
export function trianglesAt(n: number, word: Word, start: number): boolean {
  const [p, q, r] = word.slice(start, start + 3);
  if (start < 0 || !p || !q || !r) return false;
  if (p.i !== r.i || Math.abs(p.i - q.i) !== 1) return false;
  const overs = crossings(n, word)
    .slice(start, start + 3)
    .map((x) => x.over);
  return overs.some((v) => overs.filter((u) => u === v).length === 2);
}

/** σ_i σ_k σ_i → σ_k σ_i σ_k at `start`, with the signs set so each pair of strands keeps the same one on top. */
export function triangleAt(n: number, word: Word, start: number): Letter[] {
  const overOf = new Map(
    crossings(n, word)
      .slice(start, start + 3)
      .map((x) => [pairKey(x.a, x.b), x.over]),
  );
  const [p, q] = word.slice(start, start + 2) as [Letter, Letter];
  const w = [...word];
  w[start] = { i: q.i, sign: 1 };
  w[start + 1] = { i: p.i, sign: 1 };
  w[start + 2] = { i: q.i, sign: 1 };
  const xs = crossings(n, w);
  for (let k = start; k < start + 3; k++) {
    const { a, b } = xs[k] as Crossing;
    w[k] = { i: (w[k] as Letter).i, sign: overOf.get(pairKey(a, b)) === a ? 1 : -1 };
  }
  return w;
}

export type MoveKind = "slide" | "twist" | "cancel";
export type Move = { kind: MoveKind; at: number; word: Letter[] };

/** Every word one move from `word`. */
export function movesFrom(n: number, word: Word): Move[] {
  const out: Move[] = [];
  for (let j = 0; j + 1 < word.length; j++) {
    if (commutesAt(word, j)) out.push({ kind: "slide", at: j, word: commuteAt(word, j) });
    if (cancelsAt(word, j)) out.push({ kind: "cancel", at: j, word: cancelAt(word, j) });
    if (trianglesAt(n, word, j)) out.push({ kind: "twist", at: j, word: triangleAt(n, word, j) });
  }
  return out;
}

/** A compact string for a word, for hashing. */
export const wordKey = (word: Word) =>
  String.fromCharCode(...word.map((l) => 97 + 2 * l.i + (l.sign === 1 ? 0 : 1)));

/** Which move takes `before` to `after`, if one does. */
export function moveBetween(n: number, before: Word, after: Word): MoveKind | null {
  const key = wordKey(after);
  return movesFrom(n, before).find((m) => wordKey(m.word) === key)?.kind ?? null;
}

/** Cancel adjacent pairs until none are left, without any other move. */
export function greedyCancel(word: Word): Letter[] {
  let w = [...word];
  for (let j = 0; j + 1 < w.length;) {
    if (cancelsAt(w, j)) {
      w = cancelAt(w, j);
      j = Math.max(0, j - 1);
    } else j++;
  }
  return w;
}

/** Most words a puzzle's search may visit; puzzles that need more are rejected. */
export const SEARCH_CAP = 40_000;

export type Solution = {
  /** Fewest crossings reachable. */
  minLength: number;
  /** Fewest moves to reach a word with `minLength` crossings. */
  par: number;
  /** Words visited. */
  explored: number;
};

/**
 * Breadth-first search over every word reachable from `word` by the three
 * moves. None of them lengthens a word, so the search is finite; it gives up
 * (returning null) past `cap` words.
 */
export function solve(n: number, word: Word, cap = SEARCH_CAP): Solution | null {
  const seen = new Set([wordKey(word)]);
  let frontier: Word[] = [word];
  let best = { minLength: word.length, par: 0 };
  for (let dist = 0; frontier.length > 0; dist++) {
    const next: Word[] = [];
    for (const w of frontier) {
      if (w.length < best.minLength) best = { minLength: w.length, par: dist };
      for (const m of movesFrom(n, w)) {
        const key = wordKey(m.word);
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > cap) return null;
        next.push(m.word);
      }
    }
    frontier = next;
  }
  return { ...best, explored: seen.size };
}

export type Puzzle = {
  n: number;
  word: Letter[];
  minLength: number;
  par: number;
};

/** The longest starting word: the board has a row per crossing. */
export const MAX_CROSSINGS = 12;
const MIN_PAR = 5;
/** Slides and triangle moves the shortest solution needs. */
const MIN_REARRANGEMENTS = 2;

function randomLetter(rng: Rng, n: number): Letter {
  return { i: randInt(rng, 0, n - 1), sign: rng() < 0.5 ? 1 : -1 };
}

/** A short word with no letter beside another on the same pair of positions. */
function randomBase(rng: Rng, n: number, length: number): Letter[] {
  const w: Letter[] = [];
  while (w.length < length) {
    const l = randomLetter(rng, n);
    if (w.at(-1)?.i !== l.i) w.push(l);
  }
  return w;
}

/** One length-keeping move, favouring triangle moves, which tangle more. */
function scramble(rng: Rng, n: number, word: Letter[]): Letter[] {
  const moves = movesFrom(n, word).filter((m) => m.kind !== "cancel");
  const twists = moves.filter((m) => m.kind === "twist");
  const pool = twists.length > 0 && rng() < 0.6 ? twists : moves;
  return pool.length === 0 ? word : (pool[randInt(rng, 0, pool.length)] as Move).word;
}

/** Insert a cancelling pair σ_i^s σ_i^-s somewhere. */
function insertPair(rng: Rng, n: number, word: Letter[]): Letter[] {
  const l = randomLetter(rng, n);
  const at = randInt(rng, 0, word.length + 1);
  return word.toSpliced(at, 0, l, { i: l.i, sign: l.sign === 1 ? -1 : 1 });
}

/** Cancelling pairs side by side in the word. */
export const visibleCancels = (word: Word) => word.filter((_, j) => cancelsAt(word, j)).length;

/**
 * A puzzle: a short word tangled by inverse moves (inserting cancelling pairs,
 * triangle moves, slides), kept only if its true minimum is below its length,
 * at most one pair cancels straight away, and cancelling alone can't reach the
 * minimum.
 */
export function generate(rng: Rng): Puzzle {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const n = rng() < 0.5 ? 4 : 5;
    let word = randomBase(rng, n, randInt(rng, 2, 5));
    const pairs = randInt(rng, 3, 5);
    for (let p = 0; p < pairs; p++) {
      word = insertPair(rng, n, word);
      for (let k = randInt(rng, 3, 8); k > 0; k--) word = scramble(rng, n, word);
    }
    if (word.length > MAX_CROSSINGS || visibleCancels(word) > 1) continue;
    const solution = solve(n, word);
    if (!solution || solution.par < MIN_PAR) continue;
    const cancels = (word.length - solution.minLength) / 2;
    if (solution.par - cancels < MIN_REARRANGEMENTS) continue;
    if (greedyCancel(word).length <= solution.minLength) continue;
    return { n, word, minLength: solution.minLength, par: solution.par };
  }
  throw new Error("no braid puzzle found");
}

export const puzzleFor = (day: number) => generate(rngFor("braid", day));

const GRID_WIDTH = 10;

/**
 * Share lines: one square per move, pink for a cancellation and white for a
 * slide or triangle move, then the crossing count from start to finish.
 */
export function shareGrid(kinds: readonly MoveKind[], from: number, to: number): string[] {
  const squares = kinds.map((k) => (k === "cancel" ? "🟪" : "⬜"));
  const lines: string[] = [];
  for (let k = 0; k < squares.length; k += GRID_WIDTH) {
    lines.push(squares.slice(k, k + GRID_WIDTH).join(""));
  }
  return [...lines, `${from} → ${to} crossings`];
}
