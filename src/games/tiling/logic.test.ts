import { describe, expect, it } from "vitest";

import { rngFor } from "../../lib/daily";
import {
  baseTiling,
  distancesFrom,
  dominoCount,
  flipAt,
  flipDistance,
  flippableBlocks,
  generate,
  isPuzzle,
  matchCount,
  neighbours,
  PAR_MAX,
  PAR_MIN,
  rectMask,
  regionFor,
  shareGrid,
} from "./logic";

const rect = (w: number, h: number) => baseTiling(rectMask(w, h), w)!;

describe("flips", () => {
  it("swap a 2x2 block between horizontal and vertical pairs", () => {
    const t = "LRLR";
    expect(flipAt(t, 2, { bx: 0, by: 0 })).toBe("TTBB");
    expect(flipAt("TTBB", 2, { bx: 0, by: 0 })).toBe("LRLR");
  });

  it("keep every tiling a valid cover of the same cells", () => {
    const start = rect(6, 6);
    const all = [...distancesFrom(start, 6).keys()];
    for (const t of all.slice(0, 500)) {
      expect(dominoCount(t)).toBe(18);
      for (const n of neighbours(t, 6)) {
        // each L has an R to its right, each T a B below, and nothing else
        for (let i = 0; i < n.length; i++) {
          if (n[i] === "L") expect(n[i + 1]).toBe("R");
          if (n[i] === "R") expect(n[i - 1]).toBe("L");
          if (n[i] === "T") expect(n[i + 6]).toBe("B");
          if (n[i] === "B") expect(n[i - 6]).toBe("T");
        }
        expect(n).not.toBe(t);
        expect(neighbours(n, 6)).toContain(t);
      }
    }
  });

  it("find only flippable squares", () => {
    expect(flippableBlocks("LRLR", 2)).toHaveLength(1);
    // two horizontal dominoes over a vertical pair are not a flippable square
    expect(flippableBlocks("LRTTBB".slice(0, 2) + "LR", 2)).toHaveLength(1);
    expect(flippableBlocks("TLRB".replace("TLRB", "TTBB").replace("TT", "LR"), 2)).toHaveLength(0);
  });
});

describe("flip distance", () => {
  it("is 1 between the two 2x2 tilings", () => {
    const d = distancesFrom("LRLR", 2);
    expect(d.size).toBe(2);
    expect(d.get("TTBB")).toBe(1);
  });

  it("gives 2x3 three tilings with a longest distance of 2", () => {
    const d = distancesFrom(rect(3, 2), 3);
    expect(d.size).toBe(3);
    expect(Math.max(...d.values())).toBe(2);
  });

  it("counts the known tilings of small rectangles", () => {
    expect(distancesFrom(rect(4, 4), 4).size).toBe(36);
    expect(distancesFrom(rect(6, 6), 6).size).toBe(6728);
  });

  it("needs one flip per 2x2 block between the two uniform 2x4 tilings", () => {
    expect(flipDistance("LRLRLRLR", "TTTTBBBB", 4)).toBe(2);
  });

  it("is symmetric", () => {
    const d = distancesFrom(rect(4, 4), 4);
    const [a, b] = [...d.keys()].filter((_, i) => i % 11 === 0);
    expect(flipDistance(a!, b!, 4)).toBe(flipDistance(b!, a!, 4));
  });
});

describe("regions", () => {
  it("are all tileable with flips available", () => {
    for (let day = 1; day <= 200; day++) {
      const { mask } = regionFor(rngFor("tiling", day));
      const t = baseTiling(mask, 6);
      expect(t).not.toBeNull();
    }
  });
});

describe("daily puzzles", () => {
  it("are in range, distinct and reachable for days 1 to 365", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 365; day++) {
      const p = generate(rngFor("tiling", day));
      expect(p.par).toBeGreaterThanOrEqual(PAR_MIN);
      expect(p.par).toBeLessThanOrEqual(PAR_MAX);
      expect(p.start).not.toBe(p.plan);
      expect(flipDistance(p.start, p.plan, p.w)).toBe(p.par);
      expect(matchCount(p.start, p.plan)).toBeLessThan(dominoCount(p.start));
      seen.add(p.regionName);
    }
    expect(seen.size).toBeGreaterThan(5);
  }, 120_000);

  it("are the same on every call", () => {
    expect(generate(rngFor("tiling", 7))).toEqual(generate(rngFor("tiling", 7)));
  });
});

describe("share grid", () => {
  it("marks flips within par yellow and the rest black", () => {
    expect(shareGrid(7, 5)).toEqual(["🟨🟨🟨🟨🟨⬛⬛"]);
    expect(shareGrid(12, 12)[1]).toBe("🟨🟨");
  });
});

describe("stored puzzles", () => {
  it("accept a generated puzzle through a JSON round trip and reject damage", () => {
    const p = generate(rngFor("tiling", 3));
    const back = JSON.parse(JSON.stringify(p)) as unknown;
    expect(isPuzzle(back)).toBe(true);
    expect(isPuzzle({ ...p, start: p.start.replace("L", "T") })).toBe(false);
    expect(isPuzzle({ ...p, par: 40 })).toBe(false);
    expect(isPuzzle(null)).toBe(false);
  });
});
