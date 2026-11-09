import type { GameInfo } from "../games/registry";

import { readResult } from "../lib/storage";
import { currentDay } from "../lib/useDay";

export default function HomeStatus({ id }: { id: GameInfo["id"] }) {
  const day = currentDay();
  const result = readResult(id, day);
  if (!result) return <span className="status">#{day}, not played yet</span>;
  return (
    <span className="status status-done">
      #{day}, {result.solved ? result.score : "missed"}
    </span>
  );
}
