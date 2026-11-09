// Domino tilings and flips. Pure: no DOM, clock or storage.
//
// A tiling is a string with one character per cell of a w-wide grid: "." for
// a cell outside the region, "L"/"R" for the left/right half of a horizontal
// domino and "T"/"B" for the top/bottom half of a vertical one. Two tilings
// are equal exactly when their strings are, and a flip is a swap of one 2x2
// block between "LR/LR" and "TT/BB".
import { pick, randInt, type Rng, shuffle } from "../../lib/daily";

export const GRID = 6;
export const PAR_MIN = 5;
export const PAR_MAX = 10;

export type Mask = boolean[];
export type Block = { bx: number; by: number };
export type Domino = { x: number; y: number; vertical: boolean };

// Regions, as drawn on a 6x6 grid. Each is simply connected and balanced, so
// every flip graph is connected and non-empty.
const TEMPLATES: { name: string; rows: string[] }[] = [
  { name: "Square", rows: ["######", "######", "######", "######", "######", "######"] },
  { name: "Clipped corners", rows: [".####.", "######", "######", "######", "######", ".####."] },
  { name: "Notched edge", rows: [".####.", "######", "######", "######", "######", "######"] },
  { name: "Corner bite", rows: ["######", "######", "######", "######", "###...", "###..."] },
  { name: "Wide rectangle", rows: ["#####.", "#####.", "#####.", "#####.", "#####.", "#####."] },
  { name: "Slim rectangle", rows: ["####..", "####..", "####..", "####..", "####..", "####.."] },
  { name: "Diamond", rows: ["..##..", ".####.", "######", "######", ".####.", "..##.."] },
  { name: "Stairs", rows: ["######", "######", "####..", "####..", "##....", "##...."] },
];

export type Region = { name: string; mask: Mask };

type Pt = [number, number];

function normalise(points: Pt[]): Pt[] {
  const minX = Math.min(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  return points.map(([x, y]) => [x - minX, y - minY]);
}

/** One of the eight rotations/reflections of a template, centred on the grid. */
function placed(rows: string[], transform: number): Mask {
  let pts: Pt[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "#") pts.push([x, y]);
    }),
  );
  for (let i = 0; i < transform % 4; i++) pts = normalise(pts.map(([x, y]) => [-y, x]));
  if (transform >= 4) pts = normalise(pts.map(([x, y]) => [-x, y]));
  const w = Math.max(...pts.map(([x]) => x)) + 1;
  const h = Math.max(...pts.map(([, y]) => y)) + 1;
  const dx = Math.floor((GRID - w) / 2);
  const dy = Math.floor((GRID - h) / 2);
  const mask: Mask = Array.from<boolean>({ length: GRID * GRID }).fill(false);
  for (const [x, y] of pts) mask[(y + dy) * GRID + x + dx] = true;
  return mask;
}

export function regionFor(rng: Rng): Region {
  const template = pick(rng, TEMPLATES);
  return { name: template.name, mask: placed(template.rows, randInt(rng, 0, 8)) };
}

export const regionNames = TEMPLATES.map((t) => t.name);

/** A rectangular mask on a w-wide grid, for tests and small cases. */
export function rectMask(w: number, h: number): Mask {
  return Array.from<boolean>({ length: w * h }).fill(true);
}

/** Some tiling of the region by backtracking, or null if there is none. */
export function baseTiling(mask: Mask, w: number): string | null {
  const cells: string[] = mask.map((inside) => (inside ? "?" : "."));
  const place = (from: number): boolean => {
    const i = cells.indexOf("?", from);
    if (i < 0) return true;
    const x = i % w;
    if (x + 1 < w && cells[i + 1] === "?") {
      cells[i] = "L";
      cells[i + 1] = "R";
      if (place(i + 2)) return true;
      cells[i] = cells[i + 1] = "?";
    }
    if (i + w < cells.length && cells[i + w] === "?") {
      cells[i] = "T";
      cells[i + w] = "B";
      if (place(i + 1)) return true;
      cells[i] = cells[i + w] = "?";
    }
    return false;
  };
  return place(0) ? cells.join("") : null;
}

/** Every 2x2 block that holds two parallel dominoes. */
export function flippableBlocks(t: string, w: number): Block[] {
  const out: Block[] = [];
  const h = t.length / w;
  for (let by = 0; by + 1 < h; by++) {
    for (let bx = 0; bx + 1 < w; bx++) {
      const i = by * w + bx;
      const c = t[i];
      const flippable =
        (c === "L" && t[i + w] === "L") || (c === "T" && t[i + 1] === "T" && t[i + w] === "B");
      if (flippable) out.push({ bx, by });
    }
  }
  return out;
}

/** The tiling after flipping the 2x2 block at (bx, by); it must be flippable. */
export function flipAt(t: string, w: number, { bx, by }: Block): string {
  const i = by * w + bx;
  const [top, bottom] = t[i] === "L" ? ["TT", "BB"] : ["LR", "LR"];
  return t.slice(0, i) + top + t.slice(i + 2, i + w) + bottom + t.slice(i + w + 2);
}

export function neighbours(t: string, w: number): string[] {
  return flippableBlocks(t, w).map((block) => flipAt(t, w, block));
}

/** Flip distance from `from` to every tiling reachable from it. */
export function distancesFrom(from: string, w: number): Map<string, number> {
  const dist = new Map<string, number>([[from, 0]]);
  let frontier = [from];
  for (let d = 1; frontier.length > 0; d++) {
    const next: string[] = [];
    for (const t of frontier) {
      for (const n of neighbours(t, w)) {
        if (!dist.has(n)) {
          dist.set(n, d);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/** The true minimum number of flips from `a` to `b`, or null if unreachable. */
export function flipDistance(a: string, b: string, w: number): number | null {
  return distancesFrom(a, w).get(b) ?? null;
}

export function dominoesOf(t: string, w: number): Domino[] {
  const out: Domino[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "L") out.push({ x: i % w, y: Math.floor(i / w), vertical: false });
    else if (t[i] === "T") out.push({ x: i % w, y: Math.floor(i / w), vertical: true });
  }
  return out;
}

/** How many of tiling `t`'s dominoes sit exactly where the plan has one. */
export function matchCount(t: string, plan: string): number {
  let n = 0;
  for (let i = 0; i < t.length; i++) if ((t[i] === "L" || t[i] === "T") && t[i] === plan[i]) n++;
  return n;
}

export function dominoCount(t: string): number {
  return [...t].filter((c) => c === "L" || c === "T").length;
}

/**
 * Chance that a player who always makes the flip that matches the most plan
 * dominoes (ties broken at random) reaches the plan in exactly `par` flips; and
 * the same for one who makes any flip that raises the match count.
 */
export function greedyHitRates(
  start: string,
  plan: string,
  w: number,
  distToPlan: Map<string, number>,
): { best: number; improving: number } {
  const rate = (improvingOnly: boolean): number => {
    const memo = new Map<string, number>();
    const p = (t: string): number => {
      const d = distToPlan.get(t)!;
      if (d === 0) return 1;
      const hit = memo.get(t);
      if (hit !== undefined) return hit;
      const here = matchCount(t, plan);
      const options = neighbours(t, w).map((n) => ({ n, score: matchCount(n, plan) }));
      let chosen: typeof options;
      if (improvingOnly) {
        const up = options.filter((o) => o.score > here);
        chosen = up.length > 0 ? up : options;
      } else {
        const top = Math.max(...options.map((o) => o.score));
        chosen = options.filter((o) => o.score === top);
      }
      const total = chosen.reduce(
        (sum, o) => sum + (distToPlan.get(o.n) === d - 1 ? p(o.n) : 0),
        0,
      );
      const value = total / chosen.length;
      memo.set(t, value);
      return value;
    };
    return p(start);
  };
  return { best: rate(false), improving: rate(true) };
}

export type Puzzle = {
  regionName: string;
  w: number;
  mask: Mask;
  start: string;
  plan: string;
  par: number;
  greedy: { best: number; improving: number };
};

const CANDIDATES = 24;
const GOOD_ENOUGH = 0.12;
const ACCEPTABLE = 0.35;
const ATTEMPTS = 6;

/** Everything about one day's puzzle, from that day's RNG alone. */
export function generate(rng: Rng): Puzzle {
  const w = GRID;
  let best: Puzzle | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 100 && (best === null || attempt < ATTEMPTS); attempt++) {
    if (best !== null && bestScore <= ACCEPTABLE) break;
    const region = regionFor(rng);
    const base = baseTiling(region.mask, w);
    if (!base) continue;
    let start = base;
    for (let i = 0; i < 400; i++) {
      const options = neighbours(start, w);
      if (options.length === 0) break;
      start = pick(rng, options);
    }
    const fromStart = distancesFrom(start, w);
    const wanted = randInt(rng, PAR_MIN + 1, PAR_MAX + 1);
    // Prefer the wanted par, then the nearest par in range.
    const order = Array.from(Array(PAR_MAX - PAR_MIN + 1).keys(), (k) => PAR_MIN + k).toSorted(
      (a, b) => Math.abs(a - wanted) - Math.abs(b - wanted),
    );
    let pool: string[] = [];
    for (const par of order) {
      pool = [...fromStart].filter(([, d]) => d === par).map(([t]) => t);
      if (pool.length > 0) break;
    }
    for (const plan of shuffle(rng, pool).slice(0, CANDIDATES)) {
      const greedy = greedyHitRates(start, plan, w, distancesFrom(plan, w));
      const score = Math.max(greedy.best, greedy.improving);
      if (score < bestScore) {
        bestScore = score;
        best = {
          regionName: region.name,
          w,
          mask: region.mask,
          start,
          plan,
          par: fromStart.get(plan)!,
          greedy,
        };
      }
      if (score <= GOOD_ENOUGH) break;
    }
  }
  if (!best) throw new Error("no tiling puzzle found");
  return best;
}

/** One square per flip: yellow while within par, black beyond it. */
export function shareGrid(flips: number, par: number): string[] {
  const squares = Array.from({ length: flips }, (_, i) => (i < par ? "🟨" : "⬛"));
  const lines: string[] = [];
  for (let i = 0; i < squares.length; i += 10) lines.push(squares.slice(i, i + 10).join(""));
  return lines;
}
