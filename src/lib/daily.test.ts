import { describe, expect, it } from "vitest";

import { dayNumber, rngFor, shuffle } from "./daily";

describe("dayNumber", () => {
  it("numbers the launch date 1 and counts local calendar days", () => {
    expect(dayNumber(new Date(2026, 10, 9, 0, 1))).toBe(1);
    expect(dayNumber(new Date(2026, 10, 9, 23, 59))).toBe(1);
    expect(dayNumber(new Date(2026, 10, 10))).toBe(2);
    expect(dayNumber(new Date(2027, 10, 9))).toBe(366);
  });
});

describe("rngFor", () => {
  it("is deterministic per game and day", () => {
    const a = rngFor("ladder", 5);
    const b = rngFor("ladder", 5);
    const c = rngFor("braid", 5);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });

  it("shuffles to a permutation", () => {
    const out = shuffle(rngFor("x", 1), [1, 2, 3, 4, 5]);
    expect(out.toSorted()).toEqual([1, 2, 3, 4, 5]);
  });
});
