import {
  type DragFrame,
  type Draggable,
  DraggableRenderer,
  type DragInitContext,
  type DragSpecData,
  Modifier,
  modifier,
  rotateDeg,
  translate,
  Vec2,
} from "dragology";
import { useEffect, useMemo, useState } from "react";

import type { GameProps } from "../GameIsland";

import { FitBoard } from "../../components/FitBoard";
import { respectMotion } from "../../lib/motion";
import { SharePanel } from "../../components/SharePanel";
import { rngFor } from "../../lib/daily";
import { readStored, useStoredState, writeStored } from "../../lib/storage";
import "./game.css";
import {
  type Block,
  dominoCount,
  dominoesOf,
  flippableBlocks,
  generate,
  GRID,
  isPuzzle,
  matchCount,
  type Puzzle,
  shareGrid,
} from "./logic";

const CELL = 52;
const PAD = 8;
const INSET = 2.5;
const WIDTH = GRID * CELL + PAD * 2;
const MINI = 24;

/** (x, y) is the top-left cell; `angle` only ever grows by 90, so flips rotate. */
type Tile = { id: string; x: number; y: number; angle: number };
type State = { tiles: Tile[]; flips: number };
type Saved = State & { sig: string };

const isVertical = (tile: Tile) => (tile.angle / 90) % 2 !== 0;

function tilesOf(tiling: string): Tile[] {
  return dominoesOf(tiling, GRID).map((d, i) => ({
    id: `t${i}`,
    x: d.x,
    y: d.y,
    angle: d.vertical ? 90 : 0,
  }));
}

function tilingOf(tiles: Tile[], mask: boolean[]): string {
  const cells: string[] = mask.map((inside) => (inside ? "?" : "."));
  for (const t of tiles) {
    const i = t.y * GRID + t.x;
    if (isVertical(t)) {
      cells[i] = "T";
      cells[i + GRID] = "B";
    } else {
      cells[i] = "L";
      cells[i + 1] = "R";
    }
  }
  return cells.join("");
}

/** Turn the two dominoes in a 2x2 block a quarter turn clockwise about its centre. */
function flip(state: State, tiling: string, { bx, by }: Block): State {
  const horizontal = tiling[by * GRID + bx] === "L";
  const at = (x: number, y: number) =>
    state.tiles.findIndex((t) =>
      isVertical(t) ? t.x === x && t.y <= y && y <= t.y + 1 : t.y === y && t.x <= x && x <= t.x + 1,
    );
  // [cell that locates the domino, where its top-left cell lands]
  const moves: [number, number, number, number][] = horizontal
    ? [
        [bx, by, bx + 1, by],
        [bx, by + 1, bx, by],
      ]
    : [
        [bx, by, bx, by],
        [bx + 1, by, bx, by + 1],
      ];
  const tiles = [...state.tiles];
  for (const [cx, cy, x, y] of moves) {
    const i = at(cx, cy);
    tiles[i] = { ...tiles[i]!, x, y, angle: tiles[i]!.angle + 90 };
  }
  return { tiles, flips: state.flips + 1 };
}

const centre = (t: Tile) => ({
  x: (t.x + (isVertical(t) ? 0.5 : 1)) * CELL,
  y: (t.y + (isVertical(t) ? 1 : 0.5)) * CELL,
});

/** The rows the region occupies, so the board needn't draw empty space. */
function rowSpan(mask: boolean[]): { top: number; rows: number } {
  const used = mask.flatMap((inside, i) => (inside ? [Math.floor(i / GRID)] : []));
  const top = Math.min(...used);
  return { top, rows: Math.max(...used) - top + 1 };
}

function floorPath(mask: boolean[], cell: number) {
  return mask
    .map((inside, i) =>
      inside
        ? `M${(i % GRID) * cell},${Math.floor(i / GRID) * cell}h${cell}v${cell}h${-cell}Z`
        : "",
    )
    .join("");
}

/**
 * Makes a flip follow how far the pointer has travelled from where it grabbed,
 * in any direction, rather than only along the line the domino moves in. The
 * pointer is remapped onto that line, and the gap reported to `d.closest` is
 * the real distance to where the domino lands, so a drag toward one square
 * beats a drag toward the other.
 */
class AnyDirection<T extends object> extends Modifier<T> {
  readonly name = "anyDirection";
  private origin: Vec2 | undefined;

  constructor(
    ctx: DragInitContext<T>,
    inner: DragSpecData<T>,
    readonly axis: Vec2,
  ) {
    super(ctx, inner);
  }

  frame(frame: DragFrame) {
    const origin = (this.origin ??= frame.pointer);
    const travelled = frame.pointer.dist(origin) * FOLLOW;
    const along = origin.add(this.axis.withLen(travelled));
    const result = this.inner.run({ pointer: along });
    return { ...result, gap: frame.pointer.dist(result.grabPos ?? along) };
  }
}
const anyDirection = modifier(AnyDirection);

/** Pointer travel per unit of domino travel: a flip takes about a cell of drag. */
const FOLLOW = 0.7;

function makeDraggable(puzzle: Puzzle, peek: boolean, solved: boolean): Draggable<State> {
  const { mask, plan } = puzzle;
  const { top } = rowSpan(mask);
  const ghosts = dominoesOf(plan, GRID);
  return ({ state, d, draggedId }) => {
    const tiling = tilingOf(state.tiles, mask);
    const blocks = flippableBlocks(tiling, GRID);
    return (
      <g transform={translate(PAD, PAD - top * CELL)}>
        <g id="floor" dragologyZIndex={-1}>
          <path className="floor" d={floorPath(mask, CELL)} />
        </g>
        {peek && (
          <g id="ghosts" dragologyZIndex={5} pointerEvents="none">
            {ghosts.map((g, i) => (
              <rect
                id={`ghost-${i}`}
                className="ghost"
                transform={translate(g.x * CELL + 5, g.y * CELL + 5)}
                width={(g.vertical ? 1 : 2) * CELL - 10}
                height={(g.vertical ? 2 : 1) * CELL - 10}
                rx={6}
              />
            ))}
          </g>
        )}
        {state.tiles.map((tile) => {
          const vertical = isVertical(tile);
          const here = vertical ? "T" : "L";
          const matched = plan[tile.y * GRID + tile.x] === here;
          const mine = blocks.filter(
            ({ bx, by }) => tile.x >= bx && tile.x <= bx + 1 && tile.y >= by && tile.y <= by + 1,
          );
          const c = centre(tile);
          const lifted = draggedId === `tile-${tile.id}`;
          return (
            <g
              id={`tile-${tile.id}`}
              transform={translate(c.x, c.y) + rotateDeg(tile.angle)}
              dragologyZIndex={lifted ? "/1" : false}
              dragologyOnDrag={
                solved || mine.length === 0
                  ? undefined
                  : () => {
                      const specs = mine.map((b) => {
                        const next = flip(state, tiling, b);
                        const to = centre(next.tiles.find((t) => t.id === tile.id)!);
                        const axis = Vec2(to.x - c.x, to.y - c.y);
                        return d.between([state, next]).with(anyDirection(axis));
                      });
                      return respectMotion(
                        specs.length === 1 ? specs[0]! : d.closest(specs, { lockPast: 8 }),
                      );
                    }
              }
            >
              {/* Classes can't blend mid-flip, so orientation is two fills fading across. */}
              <rect className="tile-h" {...body} fillOpacity={vertical ? 0 : matched ? 1 : 0.4} />
              <rect className="tile-v" {...body} fillOpacity={vertical ? (matched ? 1 : 0.4) : 0} />
              <rect className="tile-edge" {...body} strokeWidth={lifted ? 4 : 2.5} />
              <circle className="tile-pip" r={matched ? 7 : 0} />
            </g>
          );
        })}
      </g>
    );
  };
}

function PlanView({ puzzle }: { puzzle: Puzzle }) {
  const { top, rows } = rowSpan(puzzle.mask);
  return (
    <svg
      className="plan"
      viewBox={`0 ${top * MINI} ${GRID * MINI} ${rows * MINI}`}
      style={{ aspectRatio: `${GRID} / ${rows}` }}
      role="img"
      aria-label="The plan: the tiling to make"
    >
      <path className="floor" d={floorPath(puzzle.mask, MINI)} />
      {dominoesOf(puzzle.plan, GRID).map((g) => (
        <rect
          className={`${g.vertical ? "tile-v" : "tile-h"} plan-tile`}
          transform={`translate(${g.x * MINI + 1.5} ${g.y * MINI + 1.5})`}
          width={(g.vertical ? 1 : 2) * MINI - 3}
          height={(g.vertical ? 2 : 1) * MINI - 3}
          rx={4}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

const body = {
  x: -CELL + INSET,
  y: -CELL / 2 + INSET,
  width: 2 * CELL - 2 * INSET,
  height: CELL - 2 * INSET,
  rx: 8,
};

function message(flips: number, par: number): string {
  if (flips === par) return `Solved in ${flips} flips, the fewest possible.`;
  return `Solved in ${flips} flips. It can be done in ${par}.`;
}

const CACHE_VERSION = 1;

/** The day's puzzle, from the cache if it is there and valid, else generated. */
function usePuzzle(day: number): Puzzle | null {
  const key = `tiling-puzzle:${day}`;
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => {
    const cached = readStored<{ v: number; puzzle: unknown }>(key);
    return cached?.v === CACHE_VERSION && isPuzzle(cached.puzzle) ? cached.puzzle : null;
  });
  useEffect(() => {
    if (puzzle) return;
    const done = (made: Puzzle) => {
      writeStored(key, { v: CACHE_VERSION, puzzle: made });
      setPuzzle(made);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const worker = new Worker(new URL("./generate.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<Puzzle>) => done(event.data));
    // if the worker can't start, generate here after the page has painted
    worker.addEventListener("error", () => {
      timer = setTimeout(() => done(generate(rngFor("tiling", day))), 30);
    });
    // Worker.postMessage takes no targetOrigin (that's window.postMessage)
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(day);
    return () => {
      worker.terminate();
      clearTimeout(timer);
    };
  }, [puzzle, day, key]);
  return puzzle;
}

export default function Game(props: GameProps) {
  const puzzle = usePuzzle(props.day);
  if (!puzzle) return <p className="loading">Laying out the floor…</p>;
  return <Play {...props} puzzle={puzzle} />;
}

function Play({ info, day, puzzle }: GameProps & { puzzle: Puzzle }) {
  const sig = `${puzzle.start}/${puzzle.plan}`;
  const fresh = (): Saved => ({ sig, tiles: tilesOf(puzzle.start), flips: 0 });
  const [saved, setSaved] = useStoredState<Saved>(`tiling:${day}`, fresh);
  const [peek, setPeek] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(setConfirming, 4000, false);
    return () => clearTimeout(timer);
  }, [confirming]);

  const state = saved.sig === sig ? saved : fresh();
  const tiling = tilingOf(state.tiles, puzzle.mask);
  const height = rowSpan(puzzle.mask).rows * CELL + PAD * 2;
  const total = dominoCount(puzzle.plan);
  const matching = matchCount(tiling, puzzle.plan);
  const solved = tiling === puzzle.plan;
  const draggable = useMemo(() => makeDraggable(puzzle, peek, solved), [puzzle, peek, solved]);

  const { flips } = state;
  const summary = solved
    ? `Solved in ${flips} ${flips === 1 ? "flip" : "flips"}, par ${puzzle.par}.`
    : `${flips} ${flips === 1 ? "flip" : "flips"} so far, par ${puzzle.par}. ${matching} of ${total} dominoes match the plan.`;

  function reset() {
    if (flips > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSaved(fresh());
  }

  return (
    <div className="tiling">
      <p className="tiling-help">
        Two dominoes side by side in a 2×2 square can turn together. Drag one to turn the pair.
      </p>
      <p className="tiling-region">{puzzle.regionName}</p>
      <FitBoard
        width={WIDTH}
        height={height}
        label="The floor: drag a domino to flip it with its partner"
      >
        <DraggableRenderer
          draggable={draggable}
          state={state}
          onDropState={(next) => setSaved({ ...next, sig })}
          width={WIDTH}
          height={height}
        />
      </FitBoard>

      <div className="tiling-panel">
        <figure className="tiling-plan">
          <PlanView puzzle={puzzle} />
          <figcaption>Plan</figcaption>
        </figure>
        <div className="tiling-side">
          <p className="tiling-count">
            <strong>{flips}</strong> {flips === 1 ? "flip" : "flips"}{" "}
            <span className="tiling-par">Par {puzzle.par}</span>
          </p>
          <p className="tiling-match" aria-hidden="true">
            {solved ? "Matches the plan" : `${matching} of ${total} in place`}
          </p>
          <p className="visually-hidden" role="status" aria-live="polite">
            {summary}
          </p>
        </div>
      </div>
      <div className="tiling-buttons">
        <button type="button" className="button button-quiet" onClick={() => setPeek(!peek)}>
          {peek ? "Hide plan" : "Show plan"}
        </button>
        <button type="button" className="button" onClick={reset}>
          {confirming ? "Tap again to reset" : "Reset"}
        </button>
      </div>
      <p className="tiling-key">
        Solid dominoes with a dot are in the right place. Pale ones still need to move.
      </p>

      {solved && (
        <SharePanel
          info={info}
          day={day}
          outcome={{
            solved: true,
            score: `${flips} ${flips === 1 ? "flip" : "flips"} (par ${puzzle.par})`,
            grid: shareGrid(flips, puzzle.par),
          }}
          message={message(flips, puzzle.par)}
        />
      )}
    </div>
  );
}
