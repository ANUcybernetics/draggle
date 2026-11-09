// Algebra: solve a linear equation in x by rewrites, one per drag. Pure: the
// expression model, the rewrites, the par search, daily generation and text.
import { LAUNCH, pick, randInt, type Rng, rngFor } from "../../lib/daily";

// # Rationals (always reduced, denominator positive)

export type Q = { n: number; d: number };

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function q(n: number, d = 1): Q {
  if (d === 0) throw new Error("zero denominator");
  const s = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  // `+ 0` turns -0 into 0, so keys stay stable.
  return { n: (s * n) / g + 0, d: Math.abs(d) / g };
}

export const qAdd = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qMul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
export const qDiv = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
export const qNeg = (a: Q) => q(-a.n, a.d);
export const qAbs = (a: Q) => q(Math.abs(a.n), a.d);
export const qEq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
export const isOne = (a: Q) => a.n === 1 && a.d === 1;
const ZERO = q(0);
const ONE = q(1);

// # Equations

/** A term: a multiple of x, or a constant. The id follows it through rewrites. */
export type Term = { id: string; kind: "x" | "c"; coef: Q };
/** coef × (inner), e.g. 2(x + 3). The coefficient is never 1. */
export type Group = { id: string; kind: "g"; coef: Q; inner: Term[] };
export type Item = Term | Group;
export type Side = "lhs" | "rhs";
/** An empty side is 0. */
export type Eq = { lhs: Item[]; rhs: Item[] };

export const other = (side: Side): Side => (side === "lhs" ? "rhs" : "lhs");
export const SIDES: readonly Side[] = ["lhs", "rhs"];

export type RewriteKind = "move" | "combine" | "divide" | "distribute" | "reorder";
export type Rewrite = { eq: Eq; kind: RewriteKind; text: string };

const withSide = (eq: Eq, side: Side, items: Item[]): Eq => ({ ...eq, [side]: items });

function insertAt<T>(xs: readonly T[], i: number, x: T): T[] {
  return [...xs.slice(0, i), x, ...xs.slice(i)];
}

const scaleItem = (item: Item, k: Q): Item => ({ ...item, coef: qMul(item.coef, k) });

/** Unwrap any group whose coefficient has become 1. */
function normalise(items: Item[]): Item[] {
  return items.flatMap((it) => (it.kind === "g" && isOne(it.coef) ? it.inner : [it]));
}

/** x-coefficient and constant of a side: a x + b. */
export function linear(items: readonly Item[]): { a: Q; b: Q } {
  let a = ZERO;
  let b = ZERO;
  for (const it of items) {
    if (it.kind === "g") {
      const inner = linear(it.inner);
      a = qAdd(a, qMul(it.coef, inner.a));
      b = qAdd(b, qMul(it.coef, inner.b));
    } else if (it.kind === "x") a = qAdd(a, it.coef);
    else b = qAdd(b, it.coef);
  }
  return { a, b };
}

/** The unique solution, or null if there isn't one. */
export function solve(eq: Eq): Q | null {
  const l = linear(eq.lhs);
  const r = linear(eq.rhs);
  const a = qAdd(l.a, qNeg(r.a));
  const b = qAdd(l.b, qNeg(r.b));
  return a.n === 0 ? null : qNeg(qDiv(b, a));
}

const xAlone = (items: Item[]) =>
  items.length === 1 && items[0]?.kind === "x" && isOne(items[0].coef);
const oneNumber = (items: Item[]) =>
  items.length === 0 || (items.length === 1 && items[0]?.kind === "c");

/** x = n or n = x, with n a single number (or nothing, for 0). */
export function isSolved(eq: Eq): boolean {
  return (xAlone(eq.lhs) && oneNumber(eq.rhs)) || (xAlone(eq.rhs) && oneNumber(eq.lhs));
}

// # Keys: equal up to ids and the order of terms within a side

const qKey = (a: Q) => (a.d === 1 ? `${a.n}` : `${a.n}/${a.d}`);

function itemKey(it: Item): string {
  if (it.kind === "g") return `${qKey(it.coef)}(${sideKey(it.inner)})`;
  return `${qKey(it.coef)}${it.kind}`;
}

const sideKey = (items: readonly Item[]) => items.map(itemKey).toSorted().join(",");

export const eqKey = (eq: Eq) => `${sideKey(eq.lhs)}=${sideKey(eq.rhs)}`;

// # Text (for the live region and move descriptions)

/** |q| as text: 3 or 12/5. */
export const qText = (a: Q) => (a.d === 1 ? `${Math.abs(a.n)}` : `${Math.abs(a.n)}/${a.d}`);

/** An item without its sign: 3, 5x, x, 2(x + 3). */
export function bodyText(it: Item): string {
  const k = qAbs(it.coef);
  if (it.kind === "c") return qText(k);
  const coef = isOne(k) ? "" : k.d === 1 ? qText(k) : `(${qText(k)})`;
  return it.kind === "g" ? `${coef}(${sideText(it.inner)})` : `${coef}x`;
}

/** An item standing alone, signed: −3, 5x, +3 (with `plus`). */
export function signedText(it: Item, plus = false): string {
  return `${it.coef.n < 0 ? "−" : plus ? "+" : ""}${bodyText(it)}`;
}

export function sideText(items: readonly Item[]): string {
  if (items.length === 0) return "0";
  return items
    .map((it, i) => {
      const neg = it.coef.n < 0;
      if (i === 0) return `${neg ? "−" : ""}${bodyText(it)}`;
      return `${neg ? " − " : " + "}${bodyText(it)}`;
    })
    .join("");
}

export const eqText = (eq: Eq) => `${sideText(eq.lhs)} = ${sideText(eq.rhs)}`;

// # Rewrites

/** Reorder within a side: free, never counted. */
export function reorder(eq: Eq, side: Side, i: number, j: number): Rewrite {
  const items = eq[side];
  const it = items[i];
  if (!it) throw new Error("no such item");
  const without = items.filter((_, k) => k !== i);
  return { eq: withSide(eq, side, insertAt(without, j, it)), kind: "reorder", text: "" };
}

/** Item i of `side` crosses the equals sign to position j, its sign flipped. */
export function moveAcross(eq: Eq, side: Side, i: number, j: number): Rewrite {
  const it = eq[side][i];
  if (!it) throw new Error("no such item");
  const moved = scaleItem(it, q(-1));
  const next = withSide(
    withSide(
      eq,
      side,
      eq[side].filter((_, k) => k !== i),
    ),
    other(side),
    insertAt(eq[other(side)], j, moved),
  );
  return {
    eq: next,
    kind: "move",
    text: `Moved ${signedText(it)} across the equals sign, so it became ${signedText(moved, true)}.`,
  };
}

/** Item i dropped on like item k of the same side: they add, as item k. */
export function combine(eq: Eq, side: Side, i: number, k: number): Rewrite | null {
  const items = eq[side];
  const a = items[i];
  const b = items[k];
  if (!a || !b || i === k || a.kind === "g" || a.kind !== b.kind) return null;
  const coef = qAdd(a.coef, b.coef);
  const next = items.flatMap((it, m) => {
    if (m === i) return [];
    if (m === k) return coef.n === 0 ? [] : [{ ...b, coef }];
    return [it];
  });
  const text =
    coef.n === 0
      ? `${signedText(a)} and ${signedText(b)} cancelled out.`
      : `Combined ${signedText(a)} and ${signedText(b)} into ${signedText({ ...b, coef })}.`;
  return { eq: withSide(eq, side, next), kind: "combine", text };
}

/**
 * If `items` is one multiple of x, or one bracket, with coefficient not 1:
 * that coefficient (−1 included). The board shows it as a pink chip.
 */
export function divisorOf(items: readonly Item[]): Q | null {
  const it = items[0];
  if (items.length !== 1 || !it || it.kind === "c" || isOne(it.coef)) return null;
  return it.coef;
}

export const divisor = (eq: Eq, side: Side) => divisorOf(eq[side]);

/** Divide both sides by the coefficient of `side`'s lone term or bracket. */
export function divide(eq: Eq, side: Side): Rewrite | null {
  const k = divisor(eq, side);
  const it = eq[side][0];
  if (!k || !it) return null;
  const r = qDiv(ONE, k);
  const mine: Item[] = it.kind === "g" ? it.inner : [{ ...it, coef: ONE }];
  const theirs = normalise(eq[other(side)].map((x) => scaleItem(x, r)));
  const by = `${k.n < 0 ? "−" : ""}${qText(k)}`;
  return {
    eq: withSide(withSide(eq, side, mine), other(side), theirs),
    kind: "divide",
    text: `Divided both sides by ${by}.`,
  };
}

/** Multiply out bracket i of `side`: its terms take its place. */
export function distribute(eq: Eq, side: Side, i: number): Rewrite | null {
  const g = eq[side][i];
  if (!g || g.kind !== "g") return null;
  const terms = g.inner.map((t) => scaleItem(t, g.coef));
  const next = eq[side].flatMap((it, m) => (m === i ? terms : [it]));
  return {
    eq: withSide(eq, side, next),
    kind: "distribute",
    text: `Multiplied out ${signedText(g)} into ${sideText(terms)}.`,
  };
}

/** Every counted rewrite from `eq` (moves land at the end of the other side). */
export function rewrites(eq: Eq): Rewrite[] {
  const out: Rewrite[] = [];
  for (const side of SIDES) {
    const items = eq[side];
    items.forEach((it, i) => {
      out.push(moveAcross(eq, side, i, eq[other(side)].length));
      if (it.kind === "g") {
        const r = distribute(eq, side, i);
        if (r) out.push(r);
      }
      for (let k = i + 1; k < items.length; k++) {
        const r = combine(eq, side, i, k);
        if (r) out.push(r);
      }
    });
    const r = divide(eq, side);
    if (r) out.push(r);
  }
  return out;
}

/** A shortest sequence of counted rewrites to a solved equation (breadth-first). */
export function shortestPath(start: Eq, maxDepth = 10): Rewrite[] {
  if (isSolved(start)) return [];
  type Node = { eq: Eq; via: Rewrite | null; parent: Node | null };
  const seen = new Set([eqKey(start)]);
  let frontier: Node[] = [{ eq: start, via: null, parent: null }];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const r of rewrites(node.eq)) {
        const key = eqKey(r.eq);
        if (seen.has(key)) continue;
        seen.add(key);
        const child: Node = { eq: r.eq, via: r, parent: node };
        if (isSolved(r.eq)) {
          const path: Rewrite[] = [];
          for (let n: Node | null = child; n?.via; n = n.parent) path.unshift(n.via);
          return path;
        }
        next.push(child);
      }
    }
    frontier = next;
  }
  throw new Error(`no solution within ${maxDepth} moves: ${eqText(start)}`);
}

export const par = (start: Eq) => shortestPath(start).length;

// # Daily puzzles

/** 0 = Monday … 6 = Sunday, for puzzle `day` (#1 is the launch date). */
export function weekday(day: number): number {
  const date = new Date(Date.UTC(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day + day - 1));
  return (date.getUTCDay() + 6) % 7;
}

/** Par window by weekday: Monday is gentlest, the weekend has brackets on both sides. */
export const PAR_WINDOW: readonly (readonly [number, number])[] = [
  [4, 5],
  [5, 5],
  [5, 6],
  [5, 6],
  [5, 6],
  [6, 7],
  [6, 7],
];

export type Puzzle = { start: Eq; solution: number; par: number };

/** A spec for one item; `free` marks the constant solved for to fit the answer. */
type Spec =
  | { kind: "x"; coef: number }
  | { kind: "c"; coef: number; free?: boolean }
  | { kind: "g"; coef: number; b: number };

const nz = (rng: Rng, lo: number, hi: number) => pick(rng, [-1, 1]) * randInt(rng, lo, hi + 1);

/** Shapes for each weekday: [lhs, rhs] item specs. */
function shape(rng: Rng, wd: number): [Spec[], Spec[]] {
  const a = randInt(rng, 2, 10);
  const c = pick(
    rng,
    [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => v !== a),
  );
  const k = randInt(rng, 2, 6);
  const free: Spec = { kind: "c", coef: 0, free: true };
  switch (wd) {
    case 0:
      return [
        [
          { kind: "x", coef: a },
          { kind: "c", coef: nz(rng, 1, 12) },
        ],
        [{ kind: "x", coef: c }, free],
      ];
    case 1:
    case 2: {
      const e = nz(rng, 1, 6);
      return pick(rng, [
        [
          [
            { kind: "x", coef: a },
            { kind: "c", coef: nz(rng, 1, 12) },
            { kind: "x", coef: e },
          ],
          [{ kind: "x", coef: c }, free],
        ],
        [
          [
            { kind: "x", coef: a },
            { kind: "c", coef: nz(rng, 1, 12) },
          ],
          [{ kind: "x", coef: c }, { kind: "c", coef: nz(rng, 1, 9) }, free],
        ],
      ] as [Spec[], Spec[]][]);
    }
    case 3:
      return [
        [
          { kind: "g", coef: k, b: nz(rng, 1, 6) },
          { kind: "c", coef: nz(rng, 1, 9) },
        ],
        [free],
      ];
    case 4:
      return [[{ kind: "g", coef: k, b: nz(rng, 1, 6) }], [{ kind: "x", coef: c }, free]];
    case 5:
      return [
        [
          { kind: "g", coef: k, b: nz(rng, 1, 6) },
          { kind: "x", coef: nz(rng, 1, 4) },
        ],
        [{ kind: "x", coef: c }, free],
      ];
    default:
      return [
        [{ kind: "g", coef: k, b: nz(rng, 1, 6) }],
        [{ kind: "g", coef: randInt(rng, 2, 5), b: nz(rng, 1, 6) }, free],
      ];
  }
}

/** Build the equation for `specs` with answer `s`, or null if it comes out untidy. */
function build(specs: [Spec[], Spec[]], s: number, rng: Rng): Eq | null {
  let next = 0;
  const id = () => `t${next++}`;
  const make = (sp: Spec, value: number): Item =>
    sp.kind === "g"
      ? {
          id: id(),
          kind: "g",
          coef: q(sp.coef),
          inner: [
            { id: id(), kind: "x", coef: ONE },
            { id: id(), kind: "c", coef: q(sp.b) },
          ],
        }
      : { id: id(), kind: sp.kind, coef: q(value) };
  const value = (sp: Spec) =>
    sp.kind === "g" ? sp.coef * (s + sp.b) : sp.kind === "x" ? sp.coef * s : sp.coef;
  const [ls, rs] = specs;
  const fixed = (side: Spec[]) =>
    side.filter((sp) => !(sp.kind === "c" && sp.free)).reduce((t, sp) => t + value(sp), 0);
  const gap = fixed(ls) - fixed(rs);
  const freeOnLeft = ls.some((sp) => sp.kind === "c" && sp.free);
  const freeValue = freeOnLeft ? -gap : gap;
  if (freeValue === 0 || Math.abs(freeValue) > 40) return null;
  const sideOf = (side: Spec[]) =>
    side.map((sp) => make(sp, sp.kind === "c" && sp.free ? freeValue : sp.coef));
  const eq: Eq = { lhs: sideOf(ls), rhs: sideOf(rs) };
  // Constants that start out equal would cancel in a way that looks like a trick.
  const consts = [...eq.lhs, ...eq.rhs].filter((it) => it.kind === "c").map((it) => it.coef.n);
  if (new Set(consts).size !== consts.length) return null;
  const sol = solve(eq);
  if (!sol || !qEq(sol, q(s)) || isSolved(eq)) return null;
  // Now and then, put the brackets (or the bigger side) on the right.
  return rng() < 0.3 ? { lhs: eq.rhs, rhs: eq.lhs } : eq;
}

/** Today's equation: an integer answer, and par in the weekday's window. */
export function puzzleFor(day: number): Puzzle {
  const rng = rngFor("algebra", day);
  const wd = weekday(day);
  const [lo, hi] = PAR_WINDOW[wd] ?? [4, 7];
  let best: Puzzle | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const s = nz(rng, 1, 9);
    const eq = build(shape(rng, wd), s, rng);
    if (!eq) continue;
    const p = par(eq);
    const puzzle = { start: eq, solution: s, par: p };
    if (p >= lo && p <= hi) return puzzle;
    if (p >= 4 && p <= 7 && !best) best = puzzle;
  }
  if (best) return best;
  throw new Error(`no puzzle for day ${day}`);
}

// # Results

export type Result = { score: string; grid: string[]; message: string };

export function result(moves: number, parMoves: number): Result {
  const squares = Array.from({ length: moves }, (_, i) => (i < parMoves ? "🟩" : "🟧"));
  const grid: string[] = [];
  for (let i = 0; i < squares.length; i += 8) grid.push(squares.slice(i, i + 8).join(""));
  const over = moves - parMoves;
  const message =
    over <= 0
      ? `Solved in ${moves} moves, the fewest possible.`
      : `Solved in ${moves} moves. It can be done in ${parMoves}.`;
  return { score: `${moves} ${moves === 1 ? "move" : "moves"} (par ${parMoves})`, grid, message };
}

/** The live-region line once solved, e.g. "Solved: x = −4 in 5 moves, par 4." */
export function solvedLine(eq: Eq, moves: number, parMoves: number): string {
  return `Solved: ${eqText(eq)} in ${moves} ${moves === 1 ? "move" : "moves"}, par ${parMoves}.`;
}
