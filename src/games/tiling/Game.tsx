import { type Draggable, DraggableRenderer, rotateDeg, translate } from "dragology";
import { useMemo, useState } from "react";

import type { GameProps } from "../GameIsland";

import { FitBoard } from "../../components/FitBoard";
import { SharePanel } from "../../components/SharePanel";
import { rngFor } from "../../lib/daily";
import { useStoredState } from "../../lib/storage";
import "./game.css";
import {
  type Block,
  dominoCount,
  dominoesOf,
  flippableBlocks,
  generate,
  GRID,
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
                      const specs = mine.map((b) => d.between([state, flip(state, tiling, b)]));
                      return specs.length === 1 ? specs[0]! : d.closest(specs);
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
  if (flips === par) return "Par exactly. No shorter way to get there.";
  if (flips <= par + 2) return `Done in ${flips}, just ${flips - par} over par.`;
  return `The floor matches the plan. There's a ${par}-flip route if you want another look.`;
}

export default function Game({ info, day }: GameProps) {
  const puzzle = useMemo(() => generate(rngFor("tiling", day)), [day]);
  const sig = `${puzzle.start}/${puzzle.plan}`;
  const fresh = (): Saved => ({ sig, tiles: tilesOf(puzzle.start), flips: 0 });
  const [saved, setSaved] = useStoredState<Saved>(`tiling:${day}`, fresh);
  const [peek, setPeek] = useState(false);

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

  return (
    <div className="tiling">
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
            <strong>{flips}</strong> {flips === 1 ? "flip" : "flips"}
            <span className="tiling-par">Par {puzzle.par}</span>
          </p>
          <p className="tiling-match" aria-hidden="true">
            {solved ? "Matches the plan" : `${matching} of ${total} in place`}
          </p>
          <p className="visually-hidden" role="status" aria-live="polite">
            {summary}
          </p>
          <div className="tiling-buttons">
            <button
              type="button"
              className="button button-quiet"
              aria-pressed={peek}
              onClick={() => setPeek(!peek)}
            >
              {peek ? "Hide plan on floor" : "Show plan on floor"}
            </button>
            <button type="button" className="button" onClick={() => setSaved(fresh())}>
              Reset
            </button>
          </div>
        </div>
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
