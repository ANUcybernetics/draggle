import {
  type Draggable,
  DraggableRenderer,
  type DragSpec,
  type DragSpecBuilder,
  type DragSpecLike,
  type Svgx,
  translate,
} from "dragology";
import { useMemo } from "react";

import type { GameProps } from "../GameIsland";

import { FitBoard } from "../../components/FitBoard";
import { SharePanel } from "../../components/SharePanel";
import { useStoredState } from "../../lib/storage";
import {
  combine,
  distribute,
  divide,
  divisor,
  type Eq,
  eqKey,
  eqText,
  isOne,
  isSolved,
  type Item,
  moveAcross,
  other,
  puzzleFor,
  type Q,
  qAbs,
  qText,
  reorder,
  result,
  type Rewrite,
  type Side,
  SIDES,
  sideText,
} from "./logic";
import "./game.css";

// # Geometry (board units; the board is scaled to fit by FitBoard)

const W = 340;
const FONT = 28;
const SMALL = 18;
/** Recursive's mono advance, in ems. */
const ADV = 0.6;
const H = 54;
const PAD_X = 11;
const MIN_W = 50;
const GAP = 8;
const CHIP_GAP = 4;
const LINE_GAP = 10;
const TRAY_X = 4;
const TRAY_W = W - 2 * TRAY_X;
const TRAY_PAD = 10;
const TRAY_H = 2 * TRAY_PAD + 2 * H + LINE_GAP;
const EQ_BAND = 44;
const TRAY_Y: Record<Side, number> = { lhs: 4, rhs: 4 + TRAY_H + EQ_BAND };
const EQ_Y = 4 + TRAY_H + EQ_BAND / 2;
const HEIGHT = TRAY_Y.rhs + TRAY_H + 4;
/** Shrink a side's pieces by these steps until it fits on two lines. */
const SCALES = [1, 0.88, 0.76, 0.66];

/** What's written on a piece. */
type Face = { lead: string; coef: Q | null; x: boolean; paren: string | null };

type Placed = {
  item: Item;
  side: Side;
  index: number;
  x: number;
  y: number;
  s: number;
  chip: Face | null;
  chipW: number;
  body: Face;
  bodyW: number;
  w: number;
};

const digits = (n: number) => String(Math.abs(n)).length;

function faceContentW(f: Face, s: number): number {
  const adv = ADV * FONT * s;
  let w = f.lead ? adv + 3 * s : 0;
  if (f.coef) {
    w +=
      f.coef.d === 1
        ? digits(f.coef.n) * adv
        : Math.max(digits(f.coef.n), digits(f.coef.d)) * ADV * SMALL * s + 6 * s;
  }
  if (f.x) w += adv;
  if (f.paren) w += f.paren.length * adv;
  return w;
}

const pieceW = (f: Face, s: number) => Math.max(MIN_W * s, 2 * PAD_X * s + faceContentW(f, s));

/** The faces of an item: an optional number chip and the main piece. */
function faces(items: readonly Item[], i: number): { chip: Face | null; body: Face } {
  const it = items[i];
  if (!it) throw new Error("no such item");
  const neg = it.coef.n < 0;
  const lead = i === 0 ? (neg ? "−" : "") : neg ? "−" : "+";
  const k = qAbs(it.coef);
  const coef = isOne(k) ? null : k;
  const none = { lead: "", coef: null, x: false, paren: null };
  if (it.kind === "c") return { chip: null, body: { ...none, lead, coef: k } };
  if (it.kind === "g") {
    return {
      chip: { ...none, lead, coef },
      body: { ...none, paren: `(${sideText(it.inner)})` },
    };
  }
  // A lone x-term with a coefficient splits off its number, which divides.
  if (items.length === 1 && coef) {
    return { chip: { ...none, lead, coef }, body: { ...none, x: true } };
  }
  return { chip: null, body: { ...none, lead, coef, x: true } };
}

/** Pack a side's items into at most two centred lines in its tray. */
function layoutSide(items: readonly Item[], side: Side): Placed[] {
  const avail = TRAY_W - 2 * TRAY_PAD;
  let lines: Placed[][] = [];
  let s = 1;
  for (s of SCALES) {
    lines = [[]];
    let used = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Item;
      const { chip, body } = faces(items, i);
      const chipW = chip ? pieceW(chip, s) : 0;
      const bodyW = pieceW(body, s);
      const w = chip ? chipW + CHIP_GAP * s + bodyW : bodyW;
      const line = lines.at(-1) as Placed[];
      if (line.length > 0 && used + GAP * s + w > avail) {
        lines.push([]);
        used = 0;
      }
      used += (used > 0 ? GAP * s : 0) + w;
      const placed = { item, side, index: i, x: 0, y: 0, s, chip, chipW, body, bodyW, w };
      (lines.at(-1) as Placed[]).push(placed);
    }
    if (lines.length <= 2) break;
  }
  const lineH = H * s;
  const block = lines.length * lineH + (lines.length - 1) * LINE_GAP;
  const top = TRAY_Y[side] + (TRAY_H - block) / 2;
  lines.forEach((line, li) => {
    const total = line.reduce((t, p) => t + p.w, 0) + GAP * s * (line.length - 1);
    let x = W / 2 - total / 2;
    for (const p of line) {
      p.x = x;
      p.y = top + li * (lineH + LINE_GAP);
      x += p.w + GAP * s;
    }
  });
  return lines.flat();
}

// # Drawing

/** A face, drawn centred in a piece of width `w`. Always the same elements, so it blends. */
function drawFace(f: Face, w: number, s: number, ink: string): Svgx {
  const adv = ADV * FONT * s;
  const mid = (H * s) / 2;
  let cx = (w - faceContentW(f, s)) / 2;
  const leadX = cx + adv / 2;
  if (f.lead) cx += adv + 3 * s;
  const frac = f.coef && f.coef.d !== 1 ? f.coef : null;
  const fracW = frac ? Math.max(digits(frac.n), digits(frac.d)) * ADV * SMALL * s + 6 * s : 0;
  const intText = f.coef && !frac ? qText(f.coef) : "";
  const coefX = cx + (frac ? fracW : intText.length * adv) / 2;
  cx += frac ? fracW : intText.length * adv;
  const xX = cx + adv / 2;
  if (f.x) cx += adv;
  const parenX = cx + ((f.paren?.length ?? 0) * adv) / 2;
  const big = { fontSize: FONT * s, textAnchor: "middle", dominantBaseline: "central" } as const;
  const small = { ...big, fontSize: SMALL * s };
  return (
    <g className={`alg-face ${ink}`}>
      <text transform={translate(leadX, mid)} {...big}>
        {f.lead}
      </text>
      <text transform={translate(coefX, mid)} {...big}>
        {intText}
      </text>
      <text transform={translate(coefX, mid - 11 * s)} {...small}>
        {frac ? Math.abs(frac.n) : ""}
      </text>
      <rect
        className="alg-bar"
        transform={translate(coefX - fracW / 2 + 2 * s, mid - 1.25 * s)}
        width={frac ? fracW - 4 * s : 0}
        height={2.5 * s}
      />
      <text transform={translate(coefX, mid + 11 * s)} {...small}>
        {frac ? frac.d : ""}
      </text>
      <text className="alg-x" transform={translate(xX, mid)} {...big}>
        {f.x ? "x" : ""}
      </text>
      <text transform={translate(parenX, mid)} {...big}>
        {f.paren ?? ""}
      </text>
    </g>
  );
}

function piece(w: number, s: number, x: number, lifted: boolean, fill: string, face: Svgx): Svgx[] {
  const off = lifted ? 6 : 3;
  return [
    <rect
      className="piece-shadow"
      transform={translate(x + off, off)}
      width={w}
      height={H * s}
      rx={8}
    />,
    <rect
      className={`piece ${fill}`}
      transform={translate(x, 0)}
      width={w}
      height={H * s}
      rx={8}
    />,
    <g transform={translate(x, 0)}>{face}</g>,
  ];
}

// # Drag specs

type Board = { eq: Eq; locked: boolean; note: string };
type D = DragSpecBuilder<Board>;

const toBoard = (r: Rewrite): Board => ({ eq: r.eq, locked: false, note: r.text });

/** A dashed outline drawn while a drag could drop there. */
const outline = (x: number, y: number, w: number, h: number, label?: string) => (
  <g transform={translate(x, y)}>
    <rect className="alg-zone" width={w} height={h} rx={10} />
    {label && (
      <text className="alg-zone-label" transform={translate(w - 10, 18)} textAnchor="end">
        {label}
      </text>
    )}
  </g>
);

/** Drag a term or bracket: reorder it, move it across, or drop it on a like term. */
function itemDrag(d: D, state: Board, placed: Placed[], p: Placed): DragSpec<Board> {
  const { eq } = state;
  const { side, index: i } = p;
  const targets: DragSpecLike<Board>[] = [];
  const marks: Svgx[] = [];
  for (const q of placed) {
    if (q.side !== side || q.index === i) continue;
    const r = combine(eq, side, i, q.index);
    if (!r) continue;
    targets.push(d.dropTarget(`item-${q.item.id}`, toBoard(r), { boundsState: state }));
    marks.push(outline(q.x - 4, q.y - 4, q.w + 8, H * q.s + 8));
  }
  eq[side].forEach((_, j) => targets.push({ ...state, eq: reorder(eq, side, i, j).eq }));
  for (let j = 0; j <= eq[other(side)].length; j++) {
    targets.push(toBoard(moveAcross(eq, side, i, j)));
  }
  // No `whenFar`: anywhere on the board picks the nearest landing, and the
  // unchanged order is one of the targets, so letting go near home cancels.
  return d
    .closest(targets)
    .withFloating()
    .withOverlay(<g>{marks}</g>);
}

/** Drag a number chip: onto its brackets to multiply out, or across to divide both sides. */
function chipDrag(d: D, state: Board, p: Placed): DragSpec<Board> {
  const { eq } = state;
  const { side, index: i, item } = p;
  const targets: DragSpecLike<Board>[] = [];
  const marks: Svgx[] = [];
  const dist = item.kind === "g" ? distribute(eq, side, i) : null;
  if (dist) {
    targets.push(d.dropTarget(`item-${item.id}`, toBoard(dist), { boundsState: state }));
    const bx = p.x + p.chipW + CHIP_GAP * p.s;
    marks.push(outline(bx - 4, p.y - 4, p.bodyW + 8, H * p.s + 8));
  }
  const k = divisor(eq, side);
  const div = divide(eq, side);
  if (k && div) {
    const o = other(side);
    targets.push(d.dropTarget(`tray-${o}`, toBoard(div), { boundsState: state }));
    marks.push(outline(TRAY_X, TRAY_Y[o], TRAY_W, TRAY_H, `÷ ${k.n < 0 ? "−" : ""}${qText(k)}`));
  }
  return d
    .closest(targets)
    .whenFar(state)
    .withFloating()
    .withOverlay(<g>{marks}</g>);
}

const board: Draggable<Board> = ({ state, d, draggedId }) => {
  const placed = SIDES.flatMap((side) => layoutSide(state.eq[side], side));
  return (
    <g>
      {SIDES.map((side) => (
        <rect
          id={`tray-${side}`}
          className="alg-tray"
          transform={translate(TRAY_X, TRAY_Y[side])}
          width={TRAY_W}
          height={TRAY_H}
          rx={14}
        />
      ))}
      <text
        className="alg-equals"
        transform={translate(W / 2, EQ_Y)}
        textAnchor="middle"
        dominantBaseline="central"
      >
        =
      </text>
      {SIDES.filter((side) => state.eq[side].length === 0).map((side) => (
        <text
          id={`zero-${side}`}
          className="alg-zero"
          transform={translate(W / 2, TRAY_Y[side] + TRAY_H / 2)}
          textAnchor="middle"
          dominantBaseline="central"
        >
          0
        </text>
      ))}
      {placed.map((p) => {
        const { item, s } = p;
        const id = `item-${item.id}`;
        const chipId = `chip-${item.id}`;
        const bodyX = p.chip ? p.chipW + CHIP_GAP * s : 0;
        const fill = item.kind === "x" ? "ink-teal" : "";
        const ink = item.kind === "x" ? "alg-on" : "alg-ink";
        return (
          <g
            id={id}
            transform={translate(p.x, p.y)}
            dragologyZIndex={draggedId === id ? "/1" : false}
            dragologyOnDrag={state.locked ? undefined : () => itemDrag(d, state, placed, p)}
          >
            {piece(p.bodyW, s, bodyX, draggedId === id, fill, drawFace(p.body, p.bodyW, s, ink))}
            {p.chip && (
              <g
                id={chipId}
                dragologyZIndex={draggedId === chipId ? "/2" : 1}
                dragologyOnDrag={state.locked ? undefined : () => chipDrag(d, state, p)}
              >
                {piece(
                  p.chipW,
                  s,
                  0,
                  draggedId === chipId,
                  "ink-pink",
                  drawFace(p.chip, p.chipW, s, "alg-on"),
                )}
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

// # The game

type Saved = {
  v: 1;
  /** Key of the start equation, so a stale save for this day is dropped. */
  start: string;
  eq: Eq;
  history: Eq[];
  moves: number;
  last: string;
};

export default function Game({ info, day }: GameProps) {
  const puzzle = useMemo(() => puzzleFor(day), [day]);
  const startKey = eqKey(puzzle.start);
  const fresh = (): Saved => ({
    v: 1,
    start: startKey,
    eq: puzzle.start,
    history: [],
    moves: 0,
    last: "",
  });
  const [stored, setSaved] = useStoredState<Saved>(`algebra:${day}`, fresh);
  const saved = stored.v === 1 && stored.start === startKey ? stored : fresh();
  const solved = isSolved(saved.eq);
  const boardState = useMemo<Board>(
    () => ({ eq: saved.eq, locked: solved, note: "" }),
    [saved.eq, solved],
  );

  function onDrop(next: Board) {
    if (eqKey(next.eq) === eqKey(saved.eq)) {
      setSaved({ ...saved, eq: next.eq });
      return;
    }
    setSaved({
      ...saved,
      eq: next.eq,
      history: [...saved.history, saved.eq],
      moves: saved.moves + 1,
      last: next.note,
    });
  }

  function undo() {
    const prev = saved.history.at(-1);
    if (!prev) return;
    setSaved({
      ...saved,
      eq: prev,
      history: saved.history.slice(0, -1),
      last: "Undid the last move. It still counts.",
    });
  }

  const res = result(saved.moves, puzzle.par);

  return (
    <div className="algebra">
      <p className="alg-how">
        Drag a term across the equals sign to move it, or onto a like term to combine them. Drag a
        pink number onto its brackets to multiply out, or across the equals sign to divide by it.
        Reordering terms is free.
      </p>
      <div className="alg-bar-row">
        <p className="alg-count">
          Moves <strong>{saved.moves}</strong> <span className="alg-par">par {puzzle.par}</span>
        </p>
        <button
          type="button"
          className="button button-quiet"
          onClick={undo}
          disabled={solved || saved.history.length === 0}
        >
          Undo
        </button>
      </div>
      <FitBoard width={W} height={HEIGHT} label={`Equation: ${eqText(saved.eq)}`}>
        <DraggableRenderer
          draggable={board}
          state={boardState}
          onDropState={onDrop}
          width={W}
          height={HEIGHT}
        />
      </FitBoard>
      <p className="alg-last" aria-live="polite">
        {saved.last || "Undo steps back, but the move still counts."}{" "}
        <span className="visually-hidden">The equation is now {eqText(saved.eq)}.</span>
      </p>
      {solved && (
        <SharePanel
          info={info}
          day={day}
          outcome={{ solved: true, score: res.score, grid: res.grid }}
          message={res.message}
        />
      )}
    </div>
  );
}
