// The braid drawn top to bottom, one crossing per row, with every relation a
// drag of a crossing. Rendering and drag choreography (pieces per crossing
// with halos for over/under, blank-then-closed rows for a cancellation, a
// row-by-row layout for the triangle move) are adapted from the braid demo in
// Dragology (MIT licence), src/demos/braid.tsx.
import { type Draggable, DraggableRenderer, type DragSpec, translate } from "dragology";
import { useMemo } from "react";

import type { GameProps } from "../GameIsland";

import { FitBoard } from "../../components/FitBoard";
import { type Outcome, SharePanel } from "../../components/SharePanel";
import { useStoredState } from "../../lib/storage";
import "./game.css";
import {
  cancelsAt,
  commuteAt,
  commutesAt,
  type Letter,
  moveBetween,
  type MoveKind,
  permutation,
  type Puzzle,
  puzzleFor,
  shareGrid,
  triangleAt,
  trianglesAt,
} from "./logic";

/**
 * A row of the board: a letter, or (only around a cancellation) a gap
 * standing in for one. A cancelled pair first turns blank (full height, no
 * crossing) mid-drag, then closed (no height) on drop, so the drop animation
 * slides the rows below up. Closed rows leave the word at the next drag.
 */
type Row = Letter & { gap?: "blank" | "closed" };

type Board = {
  rows: Row[];
  /** Lay strands out row by row for a triangle move at this row (see `pieces`). */
  twistAt?: number;
  /** Solved: nothing can be dragged. */
  done?: boolean;
};

type Saved = { board: Board; moves: MoveKind[] };

// Unscaled on a 360px phone (328px of content), so a 44px row is a 44px target.
const WIDTH = 320;
const PAD_X = 36;
const ROW_H = 44;
const TOP = 30;
const TAIL = 14;
const BOTTOM = 16;

/** The board's height for a word: it shrinks as crossings cancel. */
const boardHeight = (crossings: number) => TOP + crossings * ROW_H + TAIL + BOTTOM;

const wordOf = (board: Board): Letter[] =>
  board.rows.filter((r) => r.gap === undefined).map(({ i, sign }) => ({ i, sign }));

const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** The two strands at each row and which passes over; gaps swap nothing. */
function layoutCrossings(n: number, rows: Row[]) {
  const at = Array.from({ length: n }, (_, k) => k);
  return rows.map((r) => {
    const a = at[r.i] as number;
    const b = at[r.i + 1] as number;
    if (r.gap === undefined) [at[r.i], at[r.i + 1]] = [b, a];
    return { a, b, over: r.sign === 1 ? a : b };
  });
}

function makeBraid(n: number): Draggable<Board> {
  const gapX = (WIDTH - 2 * PAD_X) / (n - 1);
  const xAt = (pos: number) => PAD_X + pos * gapX;
  const yStart = TOP - 16;

  return ({ state: raw, d, draggedId }) => {
    const { rows, twistAt } = raw;
    const word = wordOf(raw);
    const state: Board = { rows: word };
    const heights: number[] = rows.map((r) => (r.gap === "closed" ? 0 : ROW_H));
    const tops = heights.map((_, j) => TOP + heights.slice(0, j).reduce((s, h) => s + h, 0));
    // (closed rows have no height, so the strands' ends rise as a pair cancels)
    const yEnd = TOP + heights.reduce((s, h) => s + h, 0) + TAIL;
    const xs = layoutCrossings(n, rows);

    // In a triangle move's three rows, its strands stack by how many of the
    // other two each passes over; elsewhere the strand on top at a crossing
    // is raised.
    const window = twistAt === undefined ? [] : [twistAt, twistAt + 1, twistAt + 2];
    const windowRank = new Map<number, number>();
    for (const j of window) {
      const x = xs[j];
      if (!x) continue;
      for (const v of [x.a, x.b]) windowRank.set(v, windowRank.get(v) ?? 0);
      windowRank.set(x.over, (windowRank.get(x.over) ?? 0) + 1);
    }
    const pieceZ = (v: number, j: number) =>
      window.includes(j) && windowRank.has(v)
        ? (windowRank.get(v) ?? 0)
        : xs[j]?.over === v
          ? 1
          : 0;

    // Strand v as pieces: a straight run then a curve across a row. Each
    // piece interpolates with the piece of the same index in the other
    // state, so every drag keeps each strand's piece count. Normally a strand
    // has a piece per row it crosses in (a slide just moves that piece down
    // or up); in the triangle layout it has one per row, so all three rows
    // bend at once.
    const pieces = (v: number) => {
      const out: { d: string; z: number }[] = [];
      let p = v;
      let from = `M ${xAt(p)} ${yStart}`;
      rows.forEach((r, j) => {
        const involved = p === r.i || p === r.i + 1;
        if (!involved && twistAt === undefined) return;
        const p1 = involved && r.gap === undefined ? (p === r.i ? r.i + 1 : r.i) : p;
        const y = tops[j] as number;
        const h = heights[j] as number;
        const m = y + h / 2;
        out.push({
          d: `${from} L ${xAt(p)} ${y} C ${xAt(p)} ${m} ${xAt(p1)} ${m} ${xAt(p1)} ${y + h}`,
          z: pieceZ(v, j),
        });
        from = `M ${xAt(p1)} ${y + h}`;
        p = p1;
      });
      return { pieces: out, tail: `${from} L ${xAt(p)} ${yEnd}` };
    };

    // ### Moves, all from the cleaned state
    const gappedAt = (k: number): Board => ({
      rows: word.map((l, m) =>
        m === k || m === k + 1 ? { ...(word[k] as Letter), gap: "blank" } : l,
      ),
    });
    const closeBlanks = (s: Board): Board => ({
      rows: s.rows.map((r) => (r.gap === "blank" ? { ...r, gap: "closed" } : r)),
    });
    const specFor = (k: number): DragSpec<Board> | null => {
      const branches: DragSpec<Board>[] = [];
      for (const j of [k - 1, k]) {
        if (commutesAt(word, j)) branches.push(d.between([state, { rows: commuteAt(word, j) }]));
        if (cancelsAt(word, j)) branches.push(d.between([state, gappedAt(j)]).onDrop(closeBlanks));
      }
      if (trianglesAt(n, word, k - 1)) {
        branches.push(
          d.between([
            { rows: word, twistAt: k - 1 },
            { rows: triangleAt(n, word, k - 1), twistAt: k - 1 },
          ]),
        );
      }
      return branches.length === 0 ? null : d.closest(branches).withBranchTransition(false);
    };

    // Crossing handles take ids from the pair of strands they cross (with a
    // suffix when a pair meets again), numbered without closed rows. Blank
    // rows keep theirs, at the middle of their pair, where a cancelled
    // crossing is dragged to.
    const firstBlank = rows.findIndex((r) => r.gap === "blank");
    const blankY = firstBlank < 0 ? 0 : (tops[firstBlank + 1] ?? 0);
    const seen = new Set<string>();
    const handleId = (a: number, b: number) => {
      let id = `x-${pairKey(a, b)}`;
      while (seen.has(id)) id += "x";
      seen.add(id);
      return id;
    };
    let k = 0;
    const handles = rows.flatMap((r, j) => {
      if (r.gap === "closed") return [];
      const x = xs[j] as { a: number; b: number };
      const id = handleId(x.a, x.b);
      const cx = (xAt(r.i) + xAt(r.i + 1)) / 2;
      const blank = r.gap === "blank";
      const spec = blank || raw.done ? null : specFor(k);
      if (!blank) k++;
      // A ring marks a crossing that can move; the rect lights up while it's
      // dragged. Both looks switch by opacity, so they blend between states.
      return [
        <g
          id={id}
          transform={translate(cx, blank ? blankY : (tops[j] as number) + ROW_H / 2)}
          dragologyZIndex={10}
          dragologyOnDrag={spec ? () => spec : undefined}
          className="braid-handle"
        >
          <circle className="braid-cue" r={17} opacity={spec ? 1 : 0} />
          <rect
            className="braid-hit"
            opacity={draggedId === id ? 1 : 0}
            transform={translate(-gapX / 2, -ROW_H / 2)}
            width={gapX}
            height={ROW_H}
            rx={12}
          />
        </g>,
      ];
    });

    const ends = permutation(n, word);
    const strands = Array.from({ length: n }, (_, v) => ({ v, ...pieces(v) }));

    return (
      <g>
        {strands.flatMap(({ v, pieces: ps, tail }) => [
          <path id={`tail-${v}-halo`} className="braid-halo" d={tail} />,
          <path
            id={`tail-${v}`}
            className={`braid-strand strand-${v}`}
            dragologyZIndex={1}
            d={tail}
          />,
          ...ps.flatMap((piece, m) => [
            <path
              id={`wire-${v}-${m}-halo`}
              className="braid-halo"
              dragologyZIndex={2 * piece.z + 2}
              d={piece.d}
            />,
            <path
              id={`wire-${v}-${m}`}
              className={`braid-strand strand-${v}`}
              dragologyZIndex={2 * piece.z + 3}
              d={piece.d}
            />,
          ]),
        ])}
        {Array.from({ length: n }, (_, v) => (
          <g id={`ends-${v}`} dragologyZIndex={8}>
            <circle
              className={`braid-end strand-${v}`}
              transform={translate(xAt(v), yStart)}
              r={7}
            />
            <circle
              className={`braid-end strand-${ends[v] ?? v}`}
              transform={translate(xAt(v), yEnd)}
              r={7}
            />
          </g>
        ))}
        {handles}
      </g>
    );
  };
}

const freshSave = (puzzle: Puzzle): Saved => ({ board: { rows: puzzle.word }, moves: [] });

/** Is a stored game from this puzzle (same braid shape, sane letters)? */
function fits(saved: Saved | undefined, puzzle: Puzzle): saved is Saved {
  const rows = saved?.board?.rows;
  if (!Array.isArray(rows) || !Array.isArray(saved?.moves)) return false;
  const ok = rows.every(
    (r) => Number.isInteger(r?.i) && r.i >= 0 && r.i < puzzle.n - 1 && Math.abs(r.sign) === 1,
  );
  if (!ok || rows.length > puzzle.word.length) return false;
  const word = wordOf(saved.board);
  return permutation(puzzle.n, word).join() === permutation(puzzle.n, puzzle.word).join();
}

const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** What the last move did, for the live status. */
const DID: Record<MoveKind, string> = {
  slide: "Slid a crossing.",
  twist: "Twisted three crossings.",
  cancel: "Cancelled a pair.",
};

export default function Game({ info, day }: GameProps) {
  const puzzle = useMemo(() => puzzleFor(day), [day]);
  const draggable = useMemo(() => makeBraid(puzzle.n), [puzzle]);
  const [stored, setSaved] = useStoredState<Saved>(`braid:${day}`, () => freshSave(puzzle));
  const saved = fits(stored, puzzle) ? stored : freshSave(puzzle);

  const word = wordOf(saved.board);
  const solved = word.length === puzzle.minLength;
  const start = puzzle.word.length;
  const height = boardHeight(word.length);

  function drop(board: Board) {
    const { done: _, ...next } = board;
    setSaved((prev) => {
      const current = fits(prev, puzzle) ? prev : freshSave(puzzle);
      const kind = moveBetween(puzzle.n, wordOf(current.board), wordOf(next));
      return { board: next, moves: kind ? [...current.moves, kind] : current.moves };
    });
  }

  const moves = saved.moves.length;
  const over = moves - puzzle.par;
  const outcome: Outcome = {
    solved: true,
    score: `${plural(moves, "move", "moves")} (par ${puzzle.par})`,
    grid: shareGrid(saved.moves, start, puzzle.minLength),
  };
  const result = `Down to ${plural(puzzle.minLength, "crossing", "crossings")} in ${plural(moves, "move", "moves")}`;
  const message = over <= 0 ? `${result}, right on par.` : `${result}, ${over} over par.`;
  const last = saved.moves.at(-1);
  const status = solved
    ? message
    : `${last ? `${DID[last]} ` : ""}${plural(word.length, "crossing", "crossings")} left, ${plural(moves, "move", "moves")} so far.`;

  return (
    <div className="braid">
      <p className="braid-goal">
        Get the braid down to {plural(puzzle.minLength, "crossing", "crossings")}. Par is the fewest
        moves that does it: {puzzle.par} today.
      </p>
      <p className="braid-help">
        Drag a ringed crossing up or down to slide it, or sideways to twist it. Drag two crossings
        with the same strand on top into each other to cancel them.
      </p>
      <FitBoard width={WIDTH} height={height} label={`Braid of ${puzzle.n} strands`}>
        <DraggableRenderer
          draggable={draggable}
          state={{ ...saved.board, done: solved }}
          onDropState={drop}
          width={WIDTH}
          height={height}
        />
      </FitBoard>
      <p className={solved ? "braid-status visually-hidden" : "braid-status"} aria-live="polite">
        {status}
      </p>
      {!solved && (
        <div className="braid-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setSaved(freshSave(puzzle))}
          >
            Start again
          </button>
        </div>
      )}
      {solved && <SharePanel info={info} day={day} outcome={outcome} message={message} />}
    </div>
  );
}
