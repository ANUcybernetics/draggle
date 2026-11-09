import { type Draggable, DraggableRenderer, translate } from "dragology";
import { useMemo } from "react";

import type { GameProps } from "../GameIsland";

import { FitBoard } from "../../components/FitBoard";
import { respectMotion } from "../../lib/motion";
import { SharePanel } from "../../components/SharePanel";
import { useStoredState } from "../../lib/storage";
import "./game.css";
import {
  ALPHABET,
  letterKnowledge,
  type Mark,
  MAX_MOVES,
  movesFor,
  type Puzzle,
  puzzleFor,
  sanitiseMoves,
  score,
  shareGrid,
  type Status,
  statusOf,
  WORD_LEN,
} from "./logic";

/** `placed` exists only in the previews and drop of a drag: the letter in its new slot. */
type State = { moves: string[]; placed?: { letter: string; slot: number } };
type Saved = { moves: string[] };

const TILE = 39;
const GAP = 4;
const ROW_PITCH = TILE + GAP;
const WIDTH = 322;
const WORD_W = WORD_LEN * TILE + (WORD_LEN - 1) * GAP;
const X0 = (WIDTH - WORD_W) / 2 + 8;
/** Start and the six moves, plus a row for the target once it's revealed. */
const rowsFor = (status: Status) => (status === "lost" ? MAX_MOVES + 2 : MAX_MOVES + 1);
const keysY = (status: Status) => rowsFor(status) * ROW_PITCH + 8;
const KEY_PITCH = 44;
const KEY_COLS = 7;
const KEY_SIZE = 38;
const boardHeight = (status: Status) =>
  keysY(status) + Math.ceil(ALPHABET.length / KEY_COLS) * KEY_PITCH;

const slotX = (slot: number) => X0 + slot * (TILE + GAP);
const rowY = (row: number) => row * ROW_PITCH;

function keyPos(index: number, status: Status): [number, number] {
  const row = Math.floor(index / KEY_COLS);
  const inRow = Math.min(KEY_COLS, ALPHABET.length - row * KEY_COLS);
  const x = (WIDTH - KEY_COLS * KEY_PITCH) / 2 + ((KEY_COLS - inRow) * KEY_PITCH) / 2;
  return [x + (index % KEY_COLS) * KEY_PITCH, keysY(status) + row * KEY_PITCH];
}

type Face = Mark | "plain";
const FACES: readonly Face[] = ["plain", "miss", "present", "hit"];
const LETTER_STYLES: readonly (readonly [string, readonly Face[]])[] = [
  ["ladder-on-paper", ["plain", "miss"]],
  ["ladder-on-teal", ["hit"]],
  ["ladder-on-yellow", ["present"]],
];

const markClass = (mark: Face) =>
  mark === "hit"
    ? "piece ink-teal"
    : mark === "present"
      ? "piece ink-yellow"
      : mark === "miss"
        ? "piece ladder-miss"
        : "piece";

/** A fixed tile. Dragology can't blend classes, so the mark is part of the id. */
function tile(id: string, x: number, y: number, letter: string, mark: Mark) {
  return (
    <g id={`${id}-${mark}`} transform={translate(x, y)}>
      <rect className="piece-shadow" x={3} y={3} width={TILE} height={TILE} rx={8} />
      <rect className={markClass(mark)} width={TILE} height={TILE} rx={8} />
      <text
        className="piece-letter"
        x={TILE / 2}
        y={TILE / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {letter.toUpperCase()}
      </text>
    </g>
  );
}

function ghost(id: string, x: number, y: number, letter: string) {
  return (
    <g id={id} transform={translate(x, y)}>
      <rect className="ladder-ghost" width={TILE} height={TILE} rx={8} />
      <text
        className="piece-letter ladder-ghost-letter"
        x={TILE / 2}
        y={TILE / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {letter.toUpperCase()}
      </text>
    </g>
  );
}

function ladder(puzzle: Puzzle): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const words = [puzzle.start, ...state.moves];
    const current = words.at(-1) as string;
    const status = statusOf(state.moves, puzzle.target);
    const settled = !state.placed;
    const knowledge = letterKnowledge(words, puzzle.target);
    const nextRow = words.length;

    return (
      <g>
        {Array.from({ length: rowsFor(status) }, (_, r) => (
          <g id={`label-${r}`} transform={translate(X0 - 10, rowY(r) + TILE / 2)}>
            <text className="ladder-label" textAnchor="end" dominantBaseline="central">
              {rowLabel(r, words.length, status)}
            </text>
          </g>
        ))}

        {words.map((word, r) => {
          const marks = score(word, puzzle.target);
          return Array.from(word, (letter, slot) =>
            state.placed && r === words.length - 1 && slot === state.placed.slot
              ? null
              : tile(`w-${r}-${slot}`, slotX(slot), rowY(r), letter, marks[slot] ?? "miss"),
          );
        })}

        {settled && status === "playing"
          ? Array.from(current, (letter, slot) =>
              ghost(`g-${slot}`, slotX(slot), rowY(nextRow), letter),
            )
          : null}

        {settled && status === "lost"
          ? Array.from(puzzle.target, (letter, slot) =>
              tile(`t-${slot}`, slotX(slot), rowY(nextRow), letter, "hit"),
            )
          : null}

        {Array.from(ALPHABET, (letter, index) => {
          const placed = state.placed?.letter === letter ? state.placed : undefined;
          const [kx, ky] = keyPos(index, status);
          const options =
            settled && status === "playing"
              ? movesFor(current, letter, words).map(({ slot, word }) => ({
                  moves: [...state.moves, word],
                  placed: { letter, slot },
                }))
              : [];
          const lifted = draggedId === `key-${letter}`;
          const size = placed ? TILE : KEY_SIZE;
          const pad = placed ? 0 : (KEY_PITCH - KEY_SIZE) / 2;
          const mark = placed
            ? score(words.at(-1) as string, puzzle.target)[placed.slot]
            : knowledge.get(letter);
          const [x, y] = placed ? [slotX(placed.slot), rowY(words.length - 1)] : [kx, ky];
          return (
            <g
              id={`key-${letter}`}
              transform={translate(x, y)}
              dragologyZIndex={lifted || placed ? "/1" : false}
              dragologyOnDrag={
                settled && status === "playing"
                  ? () =>
                      respectMotion(
                        d
                          .closest(options.length > 0 ? options : [state])
                          .whenFar(state)
                          .withFloating(),
                      )
                  : undefined
              }
            >
              <rect width={KEY_PITCH} height={KEY_PITCH} fill="transparent" />
              <rect
                className="piece-shadow"
                x={pad + (lifted ? 6 : 3)}
                y={pad + (lifted ? 6 : 3)}
                width={size}
                height={size}
                rx={8}
              />
              {/* Dragology can't blend classes, and a nested id would split a child off the
                  draggable, so every look is always drawn and shown by opacity. */}
              {FACES.map((face) => (
                <rect
                  className={markClass(face)}
                  opacity={(mark ?? "plain") === face ? 1 : 0}
                  x={pad}
                  y={pad}
                  width={size}
                  height={size}
                  rx={8}
                />
              ))}
              {LETTER_STYLES.map(([cls, marks]) => (
                <text
                  className={`piece-letter ${cls}`}
                  opacity={marks.includes(mark ?? "plain") ? 1 : 0}
                  x={pad + size / 2}
                  y={pad + size / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {letter.toUpperCase()}
                </text>
              ))}
              <rect
                className="ladder-veil"
                opacity={settled && status === "playing" && options.length === 0 ? 0.5 : 0}
                x={pad}
                y={pad}
                width={size}
                height={size}
                rx={8}
              />
            </g>
          );
        })}
      </g>
    );
  };
}

/** Unused rows go unlabelled once the game ends. */
function rowLabel(row: number, wordCount: number, status: Status): string | number {
  if (row === 0) return "start";
  if (status === "playing") return row;
  if (row < wordCount) return row;
  return row === wordCount && status === "lost" ? "was" : "";
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

function summary(puzzle: Puzzle, moves: string[]): string {
  const result = statusOf(moves, puzzle.target);
  if (result !== "playing") return endMessage(puzzle, moves, result);
  const words = [puzzle.start, ...moves];
  const current = words.at(-1) as string;
  const status = statusOf(moves, puzzle.target);
  const parts = [`Current word ${current.toUpperCase().split("").join(" ")}.`];
  if (moves.length > 0) {
    const before = words[words.length - 2] as string;
    const slot = [...current].findIndex((ch, i) => ch !== before[i]);
    const marks = score(current, puzzle.target);
    const hits = marks.filter((m) => m === "hit").length;
    const present = marks.filter((m) => m === "present").length;
    parts.push(
      `Last move: ${before.toUpperCase()} to ${current.toUpperCase()}, changing letter ${slot + 1} to ${current[slot]?.toUpperCase()}.`,
      `${hits} in the right place, ${present} in the word but elsewhere.`,
    );
  }
  if (status === "playing") {
    const left = MAX_MOVES - moves.length;
    parts.push(`${left} ${plural(left, "move", "moves")} left.`);
  }
  return parts.join(" ");
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

function endMessage(puzzle: Puzzle, moves: string[], status: "won" | "lost"): string {
  if (status === "lost") return `Out of moves: the hidden word was ${puzzle.target.toUpperCase()}.`;
  const n = moves.length;
  const how = n === puzzle.steps ? ", the shortest way" : "";
  return `Landed it in ${NUMBER_WORDS[n]}${how}.`;
}

export default function Game({ info, day }: GameProps) {
  const puzzle = useMemo(() => puzzleFor(day), [day]);
  const draggable = useMemo(() => ladder(puzzle), [puzzle]);
  const [saved, setSaved] = useStoredState<Saved>(`ladder:${day}`, () => ({ moves: [] }));
  const moves = useMemo(
    () => sanitiseMoves(puzzle.start, puzzle.target, saved.moves),
    [puzzle, saved.moves],
  );
  const status = statusOf(moves, puzzle.target);
  const height = boardHeight(status);

  return (
    <div className="ladder">
      <p className="ladder-hint">
        {status === "playing"
          ? "Drag a letter onto a tile in the dotted row. It only drops where it makes a real word."
          : ""}
      </p>
      <FitBoard
        width={WIDTH}
        height={height}
        label="Ladder board: your words so far, and the alphabet to drag letters from"
      >
        <DraggableRenderer
          draggable={draggable}
          state={{ moves }}
          width={WIDTH}
          height={height}
          onDropState={(s) => {
            if (s.placed) setSaved({ moves: s.moves });
          }}
        />
      </FitBoard>
      <p className="ladder-status" role="status">
        {summary(puzzle, moves)}
      </p>
      {status !== "playing" ? (
        <SharePanel
          info={info}
          day={day}
          outcome={{
            solved: status === "won",
            score: status === "won" ? `${moves.length}/${MAX_MOVES}` : `X/${MAX_MOVES}`,
            grid: shareGrid(moves, puzzle.target),
          }}
          message={endMessage(puzzle, moves, status)}
        />
      ) : null}
    </div>
  );
}
