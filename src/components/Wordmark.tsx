import { type Draggable, DraggableRenderer, translate } from "dragology";
import { useState } from "react";

import { respectMotion } from "../lib/motion";
import { FitBoard } from "./FitBoard";

type Tile = { id: string; ch: string; ink: string };
type State = { tiles: Tile[] };

const TILE = 58;
const GAP = 8;
const PAD = 8;
const WIDTH = PAD * 2 + 7 * TILE + 6 * GAP;
const HEIGHT = PAD * 2 + TILE + 6;

const INKS = ["blue", "pink", "teal", "yellow"];
const initial: State = {
  tiles: Array.from("draggle", (ch, i) => ({ id: `${ch}${i}`, ch, ink: INKS[i % 4] ?? "blue" })),
};

function moveTile(tiles: Tile[], from: number, to: number): Tile[] {
  const out = [...tiles];
  const [tile] = out.splice(from, 1);
  if (tile) out.splice(to, 0, tile);
  return out;
}

const wordmark: Draggable<State> = ({ state, d, draggedId }) => (
  <g transform={translate(PAD, PAD)}>
    {state.tiles.map((tile, i) => {
      const lifted = draggedId === `tile-${tile.id}`;
      return (
        <g
          id={`tile-${tile.id}`}
          transform={translate(i * (TILE + GAP), 0)}
          dragologyZIndex={lifted ? "/1" : false}
          dragologyOnDrag={() =>
            respectMotion(
              d
                .closest(state.tiles.map((_, j) => ({ tiles: moveTile(state.tiles, i, j) })))
                .withFloating(),
            )
          }
        >
          <rect
            className="piece-shadow"
            x={lifted ? 6 : 3}
            y={lifted ? 6 : 3}
            width={TILE}
            height={TILE}
            rx={8}
          />
          <rect className={`piece ink-${tile.ink}`} width={TILE} height={TILE} rx={8} />
          <text
            className="piece-letter"
            x={TILE / 2}
            y={TILE / 2}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {tile.ch}
          </text>
        </g>
      );
    })}
  </g>
);

/** The site's name as letter tiles you can rearrange. */
export default function Wordmark() {
  const [word, setWord] = useState("draggle");
  return (
    <div className="wordmark">
      <FitBoard width={WIDTH} height={HEIGHT} label="Draggle, spelled in letter tiles you can drag">
        <DraggableRenderer
          draggable={wordmark}
          initialState={initial}
          width={WIDTH}
          height={HEIGHT}
          onDropState={(s) => setWord(s.tiles.map((t) => t.ch).join(""))}
        />
      </FitBoard>
      <p className="wordmark-note" role="status">
        {word === "gargled" ? "That spells gargled." : " "}
      </p>
    </div>
  );
}
