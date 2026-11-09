import { describe, expect, it } from "vitest";

import {
  combine,
  distribute,
  divide,
  type Eq,
  eqKey,
  eqText,
  isSolved,
  type Item,
  moveAcross,
  par,
  PAR_WINDOW,
  puzzleFor,
  q,
  qEq,
  reorder,
  result,
  rewrites,
  shortestPath,
  solve,
  weekday,
} from "./logic";

let n = 0;
const x = (coef: number, d = 1): Item => ({ id: `i${n++}`, kind: "x", coef: q(coef, d) });
const c = (coef: number, d = 1): Item => ({ id: `i${n++}`, kind: "c", coef: q(coef, d) });
const g = (coef: number, b: number): Item => ({
  id: `i${n++}`,
  kind: "g",
  coef: q(coef),
  inner: [
    { id: `i${n++}`, kind: "x", coef: q(1) },
    { id: `i${n++}`, kind: "c", coef: q(b) },
  ],
});
const eq = (lhs: Item[], rhs: Item[]): Eq => ({ lhs, rhs });

/** Every equation reachable in `depth` rewrites, reorders included. */
function reachable(start: Eq, depth: number): Eq[] {
  const seen = new Map([[eqKey(start), start]]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    frontier = frontier
      .flatMap((e) => rewrites(e).map((r) => r.eq))
      .filter((e) => {
        if (seen.has(eqKey(e))) return false;
        seen.set(eqKey(e), e);
        return true;
      });
  }
  return [...seen.values()];
}

describe("text", () => {
  it("writes equations with proper minus signs and juxtaposition", () => {
    expect(eqText(eq([x(5), c(-3)], [x(2), c(9)]))).toBe("5x − 3 = 2x + 9");
    expect(eqText(eq([g(2, 3), x(-1)], []))).toBe("2(x + 3) − x = 0");
    expect(eqText(eq([x(1)], [c(12, 5)]))).toBe("x = 12/5");
  });
});

describe("rewrites", () => {
  const start = eq([x(5), c(-3)], [x(2), c(9)]);

  it("moving a term across flips its sign", () => {
    const r = moveAcross(start, "lhs", 1, 2);
    expect(eqText(r.eq)).toBe("5x = 2x + 9 + 3");
    expect(r.text).toBe("Moved −3 across the equals sign, so it became +3.");
  });

  it("combines like terms, and only like terms", () => {
    const moved = moveAcross(start, "lhs", 1, 2).eq;
    expect(eqText(combine(moved, "rhs", 2, 1)?.eq ?? moved)).toBe("5x = 2x + 12");
    expect(combine(moved, "rhs", 0, 1)).toBeNull();
    const cancel = eq([x(3), x(-3), c(4)], [c(1)]);
    expect(eqText(combine(cancel, "lhs", 0, 1)?.eq ?? cancel)).toBe("4 = 1");
  });

  it("divides both sides by a lone term's coefficient, keeping fractions exact", () => {
    expect(eqText(divide(eq([x(3)], [c(12)]), "lhs")?.eq ?? start)).toBe("x = 4");
    expect(eqText(divide(eq([x(5)], [x(2), c(12)]), "lhs")?.eq ?? start)).toBe("x = (2/5)x + 12/5");
    expect(eqText(divide(eq([c(12)], [x(-1)]), "rhs")?.eq ?? start)).toBe("−12 = x");
    expect(divide(eq([x(1)], [c(4)]), "lhs")).toBeNull();
    expect(divide(start, "lhs")).toBeNull();
  });

  it("divides a lone bracket by its factor, and multiplies brackets out", () => {
    const br = eq([g(2, 3)], [c(10)]);
    expect(eqText(divide(br, "lhs")?.eq ?? br)).toBe("x + 3 = 5");
    expect(eqText(distribute(br, "lhs", 0)?.eq ?? br)).toBe("2x + 6 = 10");
    expect(eqText(divide(eq([x(3)], [g(3, 1), x(1)]), "lhs")?.eq ?? br)).toBe("x = x + 1 + (1/3)x");
  });

  it("reordering changes nothing but the order", () => {
    expect(eqKey(reorder(start, "rhs", 0, 1).eq)).toBe(eqKey(start));
  });
});

describe("solution sets", () => {
  const starts = [
    eq([x(5), c(-3)], [x(2), c(9)]),
    eq([g(3, -2), c(5)], [x(2), c(7)]),
    eq([g(2, 4)], [g(4, 5), c(-30)]),
    eq([x(4), c(6), x(-1)], [x(1), c(-12)]),
  ];

  it("no rewrite changes the answer", () => {
    for (const start of starts) {
      const answer = solve(start);
      expect(answer).not.toBeNull();
      for (const e of reachable(start, 4)) {
        const s = solve(e);
        expect(s && answer && qEq(s, answer), `${eqText(start)} → ${eqText(e)}`).toBe(true);
      }
    }
  });

  it("every positioned move and every combine keeps the answer too", () => {
    for (const start of starts) {
      const answer = solve(start);
      for (const e of reachable(start, 2)) {
        for (const side of ["lhs", "rhs"] as const) {
          const there = side === "lhs" ? e.rhs : e.lhs;
          e[side].forEach((_, i) => {
            for (let j = 0; j <= there.length; j++) {
              const s = solve(moveAcross(e, side, i, j).eq);
              expect(s && answer && qEq(s, answer)).toBe(true);
            }
            e[side].forEach((__, k) => {
              const r = combine(e, side, i, k);
              const s = r && solve(r.eq);
              if (r) expect(s && answer && qEq(s, answer)).toBe(true);
            });
          });
        }
      }
    }
  });
});

describe("par", () => {
  it("matches hand-worked examples", () => {
    // move −3, combine 9 + 3, move 2x, combine 5x − 2x, divide by 3
    expect(par(eq([x(5), c(-3)], [x(2), c(9)]))).toBe(5);
    // move 3x, combine to x: then move 8, combine
    expect(par(eq([x(4), c(8)], [x(3), c(4)]))).toBe(4);
    // move 4, combine, divide
    expect(par(eq([x(3), c(4)], [c(16)]))).toBe(3);
    // divide by 2, then move 3 and combine: shorter than multiplying out
    expect(par(eq([g(2, 3)], [c(10)]))).toBe(3);
    // already solved, either way round
    expect(par(eq([c(7)], [x(1)]))).toBe(0);
    expect(par(eq([x(3)], [c(12)]))).toBe(1);
  });

  it("returns a path that ends solved", () => {
    const path = shortestPath(eq([g(3, -2), c(5)], [x(2), c(7)]));
    const last = path.at(-1);
    expect(last && isSolved(last.eq)).toBe(true);
  });
});

describe("daily puzzles", () => {
  it("puzzle #1 is a Monday", () => {
    expect(weekday(1)).toBe(0);
    expect(weekday(7)).toBe(6);
    expect(weekday(8)).toBe(0);
  });

  it("every day of the first year has an integer answer and par 4 to 7", () => {
    for (let day = 1; day <= 365; day++) {
      const p = puzzleFor(day);
      const s = solve(p.start);
      expect(Number.isInteger(p.solution)).toBe(true);
      expect(s && qEq(s, q(p.solution)), `day ${day}`).toBe(true);
      expect(p.par).toBeGreaterThanOrEqual(4);
      expect(p.par).toBeLessThanOrEqual(7);
      expect(p.par).toBe(par(p.start));
    }
  });

  it("mostly lands in each weekday's window", () => {
    let inWindow = 0;
    for (let day = 1; day <= 365; day++) {
      const [lo, hi] = PAR_WINDOW[weekday(day)] ?? [0, 0];
      const p = puzzleFor(day).par;
      if (p >= lo && p <= hi) inWindow++;
    }
    expect(inWindow).toBeGreaterThan(350);
  });

  it("is the same puzzle every time for a day", () => {
    expect(eqText(puzzleFor(42).start)).toBe(eqText(puzzleFor(42).start));
  });
});

describe("result", () => {
  it("scores against par", () => {
    expect(result(5, 5)).toEqual({
      score: "5 moves (par 5)",
      grid: ["🟩🟩🟩🟩🟩"],
      message: "Solved in 5 moves, the fewest possible.",
    });
    expect(result(7, 5).grid).toEqual(["🟩🟩🟩🟩🟩🟧🟧"]);
    expect(result(6, 5).message).toBe("Solved in 6 moves. It can be done in 5.");
  });
});
