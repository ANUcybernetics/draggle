// Pure Ladder logic: the word graph, the daily puzzle, Wordle scoring and the
// share grid. No React, clock or storage.
import { pick, type Rng, rngFor } from "../../lib/daily";
import { COMMON, VALID } from "./words";

export const WORD_LEN = 4;
export const MAX_MOVES = 6;
export const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

export type Mark = "hit" | "present" | "miss";
export type Puzzle = { start: string; target: string; steps: number };
export type Move = { slot: number; word: string };

export const isWord = (w: string) => VALID.has(w);

/** Shortest-ladder lengths a day may ask for, weighted (cumulative). */
const STEP_WEIGHTS: readonly (readonly [number, number])[] = [
  [3, 0.4],
  [4, 0.85],
  [5, 1],
];

// Words one letter apart share a "pattern" with that slot blanked out.
let patterns: Map<string, string[]> | undefined;

function patternsOf(word: string): string[] {
  return Array.from(word, (_, i) => `${word.slice(0, i)}_${word.slice(i + 1)}`);
}

function buckets(): Map<string, string[]> {
  if (patterns) return patterns;
  const map = new Map<string, string[]>();
  for (const word of VALID) {
    for (const p of patternsOf(word)) {
      const bucket = map.get(p);
      if (bucket) bucket.push(word);
      else map.set(p, [word]);
    }
  }
  patterns = map;
  return map;
}

const neighbourCache = new Map<string, string[]>();

/** Every valid word one letter away from `word`. */
export function neighbours(word: string): string[] {
  const cached = neighbourCache.get(word);
  if (cached) return cached;
  const map = buckets();
  const found = patternsOf(word).flatMap((p) => (map.get(p) ?? []).filter((w) => w !== word));
  neighbourCache.set(word, found);
  return found;
}

/** The drops that turn `current` into a new valid word by placing `letter`. */
export function movesFor(current: string, letter: string, seen: readonly string[]): Move[] {
  const moves: Move[] = [];
  for (let slot = 0; slot < current.length; slot++) {
    if (current[slot] === letter) continue;
    const word = current.slice(0, slot) + letter + current.slice(slot + 1);
    if (isWord(word) && !seen.includes(word)) moves.push({ slot, word });
  }
  return moves;
}

/** Steps from `from` to every reachable word. */
export function distancesFrom(from: string): Map<string, number> {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const word = queue[head] as string;
    const d = dist.get(word) as number;
    for (const next of neighbours(word)) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

function differences(a: string, b: string): number {
  return [...a].filter((ch, i) => ch !== b[i]).length;
}

function pickSteps(rng: Rng): number {
  const r = rng();
  return (STEP_WEIGHTS.find(([, upTo]) => r < upTo) ?? STEP_WEIGHTS[0])?.[0] as number;
}

/**
 * The day's start and target, from `rngFor("ladder", day)` alone. Both are
 * common words; the target is exactly `steps` ladder steps from the start
 * (3 to 5, so the six-move budget leaves one to three spare), differs from it
 * in at least two letters, and has more than one way in, so neither end is a
 * dead-end shortcut.
 */
export function puzzleFor(day: number): Puzzle {
  const rng = rngFor("ladder", day);
  const steps = pickSteps(rng);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const start = pick(rng, COMMON);
    if (neighbours(start).length < 3) continue;
    const dist = distancesFrom(start);
    const targets = COMMON.filter(
      (w) => dist.get(w) === steps && differences(start, w) >= 2 && neighbours(w).length >= 2,
    );
    if (targets.length > 0) return { start, target: pick(rng, targets), steps };
  }
  throw new Error(`no ladder puzzle for day ${day}`);
}

/** Wordle scoring: greens first, then yellows while the target still has the letter. */
export function score(guess: string, target: string): Mark[] {
  const marks: Mark[] = Array.from(guess, () => "miss");
  const spare = new Map<string, number>();
  for (let i = 0; i < target.length; i++) {
    const t = target[i] as string;
    if (guess[i] === t) marks[i] = "hit";
    else spare.set(t, (spare.get(t) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === "hit") continue;
    const ch = guess[i] as string;
    const left = spare.get(ch) ?? 0;
    if (left > 0) {
      marks[i] = "present";
      spare.set(ch, left - 1);
    }
  }
  return marks;
}

export type Status = "playing" | "won" | "lost";

export function statusOf(moves: readonly string[], target: string): Status {
  if (moves.at(-1) === target) return "won";
  return moves.length >= MAX_MOVES ? "lost" : "playing";
}

/**
 * Replays stored moves from the start, dropping the first one that isn't a
 * legal step (and anything after it), so a stale or tampered save can't wedge
 * the game.
 */
export function sanitiseMoves(start: string, target: string, stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  const moves: string[] = [];
  let current = start;
  for (const word of stored) {
    if (statusOf(moves, target) !== "playing") break;
    if (typeof word !== "string" || !neighbours(current).includes(word)) break;
    if (word === start || moves.includes(word)) break;
    moves.push(word);
    current = word;
  }
  return moves;
}

const SQUARE: Record<Mark, string> = { hit: "🟩", present: "🟨", miss: "⬜" };

/** One line of squares per move. */
export function shareGrid(moves: readonly string[], target: string): string[] {
  return moves.map((word) =>
    score(word, target)
      .map((m) => SQUARE[m])
      .join(""),
  );
}

/** The best mark each letter has earned across the words played so far. */
export function letterKnowledge(words: readonly string[], target: string): Map<string, Mark> {
  const rank: Record<Mark, number> = { miss: 0, present: 1, hit: 2 };
  const known = new Map<string, Mark>();
  for (const word of words) {
    score(word, target).forEach((mark, i) => {
      const ch = word[i] as string;
      const old = known.get(ch);
      if (!old || rank[mark] > rank[old]) known.set(ch, mark);
    });
  }
  return known;
}
