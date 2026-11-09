import { describe, expect, it } from "vitest";

import { mulberry32, randInt } from "../../lib/daily";
import {
  exponentSum,
  greedyCancel,
  type Letter,
  MAX_CROSSINGS,
  moveBetween,
  type MoveKind,
  movesFrom,
  permutation,
  puzzleFor,
  SEARCH_CAP,
  shareGrid,
  solve,
  triangleAt,
  trianglesAt,
  visibleCancels,
  type Word,
} from "./logic";

/** Letters from generator numbers, negative for inverses: [1, -2] is σ₁ σ₂⁻¹. */
const w = (...gs: number[]): Letter[] =>
  gs.map((g) => ({ i: Math.abs(g) - 1, sign: g > 0 ? 1 : -1 }));
const gens = (word: Word) => word.map((l) => (l.i + 1) * l.sign);

// Artin's action of B_n on the free group F_n is faithful, so two words are
// the same braid exactly when they act the same way on every generator.
// Free-group words are arrays of ±(k+1) for x_k^±1.
function reduce(word: number[]): number[] {
  const out: number[] = [];
  for (const x of word) {
    if (out.at(-1) === -x) out.pop();
    else out.push(x);
  }
  return out;
}

const inverse = (word: number[]) => word.toReversed().map((x) => -x);

/** The image of each generator x_k under one letter's automorphism. */
function letterImages(n: number, { i, sign }: Letter): number[][] {
  const [a, b] = [i + 1, i + 2];
  return Array.from({ length: n }, (_, k) => {
    if (k === i) return sign === 1 ? [a, b, -a] : [b];
    if (k === i + 1) return sign === 1 ? [a] : [-b, a, b];
    return [k + 1];
  });
}

function artin(n: number, word: Word): string {
  let images = Array.from({ length: n }, (_, k) => [k + 1]);
  for (const l of word) {
    const prev = images;
    images = letterImages(n, l).map((img) =>
      reduce(img.flatMap((x) => (x > 0 ? prev[x - 1]! : inverse(prev[-x - 1]!)))),
    );
  }
  return JSON.stringify(images);
}

function randomWord(seed: number, n: number, length: number): Letter[] {
  const rng = mulberry32(seed);
  return Array.from({ length }, () => ({ i: randInt(rng, 0, n - 1), sign: rng() < 0.5 ? 1 : -1 }));
}

describe("relations", () => {
  it("turn σ₁σ₂σ₁ into σ₂σ₁σ₂", () => {
    expect(gens(triangleAt(3, w(1, 2, 1), 0))).toEqual([2, 1, 2]);
    expect(gens(triangleAt(3, w(-1, -2, -1), 0))).toEqual([-2, -1, -2]);
  });

  it("allow a mixed-sign triangle only when one strand passes over both others", () => {
    // strand 0 over both: σ₁ σ₂ σ₁⁻¹ = σ₂⁻¹ σ₁ σ₂
    expect(trianglesAt(3, w(1, 2, -1), 0)).toBe(true);
    expect(gens(triangleAt(3, w(1, 2, -1), 0))).toEqual([-2, 1, 2]);
    // each strand over exactly once: a cycle, so no move
    expect(trianglesAt(3, w(1, -2, 1), 0)).toBe(false);
  });

  it("offer slides only for crossings two or more positions apart", () => {
    const kinds = movesFrom(4, w(1, 3, 2)).map((m) => `${m.kind}@${m.at}`);
    expect(kinds).toEqual(["slide@0"]);
  });

  it("cancel only when the same strand passes over both times", () => {
    expect(movesFrom(3, w(2, -2)).map((m) => m.kind)).toEqual(["cancel"]);
    expect(movesFrom(3, w(2, 2))).toEqual([]);
  });

  it("keep the braid, its permutation and its exponent sum", () => {
    let checked = { slide: 0, twist: 0, cancel: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const n = 3 + (seed % 3);
      const word = randomWord(seed, n, 7);
      const braid = artin(n, word);
      for (const m of movesFrom(n, word)) {
        expect(permutation(n, m.word)).toEqual(permutation(n, word));
        expect(exponentSum(m.word)).toBe(exponentSum(word));
        expect(artin(n, m.word)).toBe(braid);
        checked = { ...checked, [m.kind]: checked[m.kind] + 1 };
      }
    }
    expect(checked.slide).toBeGreaterThan(50);
    expect(checked.twist).toBeGreaterThan(20);
    expect(checked.cancel).toBeGreaterThan(20);
  });

  it("name the move between two words, or none", () => {
    expect(moveBetween(4, w(1, 3), w(3, 1))).toBe("slide");
    expect(moveBetween(4, w(1, 2, 1), w(2, 1, 2))).toBe("twist");
    expect(moveBetween(4, w(1, -1, 3), w(3))).toBe("cancel");
    expect(moveBetween(4, w(1, 2), w(2, 1))).toBeNull();
  });
});

describe("solve", () => {
  it("finds the fewest crossings and the fewest moves to them", () => {
    // σ₁ σ₃ σ₁⁻¹: slide, then cancel
    expect(solve(4, w(1, 3, -1))).toMatchObject({ minLength: 1, par: 2 });
    // σ₁ σ₂ σ₁ σ₂⁻¹ σ₁⁻¹ = σ₂ σ₁ (σ₂ σ₂⁻¹) σ₁⁻¹ after a triangle move
    expect(solve(3, w(1, 2, 1, -2, -1))).toMatchObject({ minLength: 1, par: 3 });
  });

  it("gives up past the cap", () => {
    expect(solve(5, w(1, 3, 2, 4, 1, 3, 2, 4), 5)).toBeNull();
  });
});

describe("daily puzzles", () => {
  const days = Array.from({ length: 365 }, (_, k) => k + 1);
  const puzzles = days.map((day) => ({ day, puzzle: puzzleFor(day) }));

  it("are the same for everyone on a given day", () => {
    expect(puzzleFor(12)).toEqual(puzzleFor(12));
    expect(puzzleFor(12)).not.toEqual(puzzleFor(13));
  });

  it("have a verified minimum below the starting crossing count, within the search cap", () => {
    for (const { puzzle } of puzzles) {
      const solution = solve(puzzle.n, puzzle.word);
      expect(solution).not.toBeNull();
      expect(solution!.explored).toBeLessThanOrEqual(SEARCH_CAP);
      expect(solution!.minLength).toBe(puzzle.minLength);
      expect(solution!.par).toBe(puzzle.par);
      expect(puzzle.minLength).toBeLessThan(puzzle.word.length);
      expect(puzzle.word.length).toBeLessThanOrEqual(MAX_CROSSINGS);
      expect([4, 5]).toContain(puzzle.n);
    }
  });

  it("hide at least one cancellation behind a slide or triangle move", () => {
    for (const { puzzle } of puzzles) {
      expect(visibleCancels(puzzle.word)).toBeLessThanOrEqual(1);
      expect(greedyCancel(puzzle.word).length).toBeGreaterThan(puzzle.minLength);
    }
  });
});

describe("shareGrid", () => {
  it("draws one square per move and the crossing counts", () => {
    expect(shareGrid(["slide", "cancel", "twist", "cancel"], 10, 6)).toEqual([
      "⬜🟪⬜🟪",
      "10 → 6 crossings",
    ]);
    expect(shareGrid(Array.from<MoveKind>({ length: 12 }).fill("slide"), 8, 2)[1]).toBe("⬜⬜");
  });
});
