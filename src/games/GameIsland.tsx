import { type ComponentType, lazy, Suspense } from "react";

import { currentDay } from "../lib/useDay";
import { gameInfo, type GameInfo } from "./registry";

export type GameProps = { info: GameInfo; day: number };

const GAMES: Record<GameInfo["id"], ComponentType<GameProps>> = {
  algebra: lazy(() => import("./algebra/Game")),
  braid: lazy(() => import("./braid/Game")),
  ladder: lazy(() => import("./ladder/Game")),
  tiling: lazy(() => import("./tiling/Game")),
};

/** The client-only entry point for one game's page. */
export default function GameIsland({ id }: { id: GameInfo["id"] }) {
  const Game = GAMES[id];
  const day = currentDay();
  return (
    <>
      <p className="game-day">Puzzle #{day}</p>
      <Suspense fallback={<p className="loading">Setting out the pieces…</p>}>
        <Game info={gameInfo(id)} day={day} />
      </Suspense>
    </>
  );
}
