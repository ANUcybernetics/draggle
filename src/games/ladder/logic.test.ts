import { describe, expect, it } from "vitest";

import {
  distancesFrom,
  isWord,
  letterKnowledge,
  MAX_MOVES,
  movesFor,
  neighbours,
  puzzleFor,
  sanitiseMoves,
  score,
  shareGrid,
  statusOf,
} from "./logic";
import { COMMON, VALID } from "./words";

describe("score", () => {
  it("marks greens, yellows and misses", () => {
    expect(score("tame", "team")).toEqual(["hit", "present", "present", "present"]);
    expect(score("abcd", "wxyz")).toEqual(["miss", "miss", "miss", "miss"]);
    expect(score("boat", "boat")).toEqual(["hit", "hit", "hit", "hit"]);
  });

  it("gives a repeated guess letter one yellow per copy in the target", () => {
    // target has a single l: the green one uses it up, so the other l is grey
    expect(score("lull", "bell")).toEqual(["miss", "miss", "hit", "hit"]);
    // one o in the target, two in the guess, neither in place: only the first is yellow
    expect(score("onto", "bolt")).toEqual(["present", "miss", "present", "miss"]);
    // two e in the target, both found out of place
    expect(score("eels", "lees")).toEqual(["present", "hit", "present", "hit"]);
  });

  it("lets a later green take the letter before an earlier yellow", () => {
    // target "abba"; guess "baab" has no greens, so two yellows then two... bounded by counts
    expect(score("baab", "abba")).toEqual(["present", "present", "present", "present"]);
    // the green at slot 3 uses the only a, so the a at slot 0 is grey
    expect(score("axxa", "bxxa")).toEqual(["miss", "hit", "hit", "hit"]);
  });
});

describe("move generation", () => {
  it("only yields valid, unseen words that differ in exactly the placed slot", () => {
    for (const current of COMMON.slice(0, 300)) {
      for (const letter of "abcdefghijklmnopqrstuvwxyz") {
        for (const { slot, word } of movesFor(current, letter, [current])) {
          expect(isWord(word)).toBe(true);
          expect(word[slot]).toBe(letter);
          expect(word).not.toBe(current);
          expect([...word].filter((ch, i) => ch !== current[i])).toHaveLength(1);
        }
      }
    }
  });

  it("skips words already on the ladder", () => {
    const [first] = neighbours("cart");
    expect(first).toBeDefined();
    const w = first as string;
    const slot = [...w].findIndex((ch, i) => ch !== "cart"[i]);
    const letter = w[slot] as string;
    expect(movesFor("cart", letter, ["cart"]).map((m) => m.word)).toContain(w);
    expect(movesFor("cart", letter, ["cart", w]).map((m) => m.word)).not.toContain(w);
  });

  it("agrees with the neighbour graph", () => {
    const viaMoves = new Set<string>();
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      for (const m of movesFor("cold", letter, [])) viaMoves.add(m.word);
    }
    expect(viaMoves).toEqual(new Set(neighbours("cold")));
  });
});

describe("daily puzzle", () => {
  it("is a pure function of the day", () => {
    expect(puzzleFor(17)).toEqual(puzzleFor(17));
  });

  it(
    "gives every day from 1 to 730 a common-word pair a short ladder apart",
    { timeout: 30_000 },
    () => {
      const steps = new Set<number>();
      const targets = new Set<string>();
      for (let day = 1; day <= 730; day++) {
        const p = puzzleFor(day);
        expect(COMMON).toContain(p.start);
        expect(COMMON).toContain(p.target);
        expect(VALID.has(p.start) && VALID.has(p.target)).toBe(true);
        expect(p.start).not.toBe(p.target);
        const shortest = distancesFrom(p.start).get(p.target);
        expect(shortest).toBe(p.steps);
        expect(shortest).toBeGreaterThanOrEqual(3);
        expect(shortest).toBeLessThanOrEqual(5);
        expect(shortest).toBeLessThanOrEqual(MAX_MOVES);
        steps.add(p.steps);
        targets.add(p.target);
      }
      expect([...steps].toSorted()).toEqual([3, 4, 5]);
      // a pool of ~1100 words, so some repeats over two years are expected, but not many
      expect(targets.size).toBeGreaterThan(450);
    },
  );
});

describe("game state", () => {
  it("reports win, loss and play", () => {
    expect(statusOf(["a", "b"], "z")).toBe("playing");
    expect(statusOf(["a", "z"], "z")).toBe("won");
    expect(statusOf(["a", "b", "c", "d", "e", "f"], "z")).toBe("lost");
    expect(statusOf(["a", "b", "c", "d", "e", "z"], "z")).toBe("won");
  });

  it("keeps only the legal prefix of a stored game", () => {
    expect(sanitiseMoves("cold", "bolt", ["bold", "bolt"])).toEqual(["bold", "bolt"]);
    expect(sanitiseMoves("cold", "bolt", ["bold", "zzzz", "bolt"])).toEqual(["bold"]);
    expect(sanitiseMoves("cold", "bolt", ["cold"])).toEqual([]);
    expect(sanitiseMoves("cold", "bolt", ["bold", "cold"])).toEqual(["bold"]);
    expect(sanitiseMoves("cold", "bolt", "nonsense")).toEqual([]);
  });

  it("builds one line of squares per move", () => {
    expect(shareGrid(["tame", "team"], "team")).toEqual(["🟩🟨🟨🟨", "🟩🟩🟩🟩"]);
  });

  it("remembers the best mark for each letter", () => {
    const known = letterKnowledge(["tame", "team"], "team");
    expect(known.get("t")).toBe("hit");
    expect(known.get("m")).toBe("hit");
    expect(letterKnowledge(["xyzw"], "team").get("x")).toBe("miss");
  });
});
