export type GameInfo = {
  id: "ladder" | "braid" | "algebra" | "tiling";
  title: string;
  /** One line for the home page: what you do. */
  blurb: string;
};

export const GAMES: readonly GameInfo[] = [
  {
    id: "ladder",
    title: "Ladder",
    blurb: "Change one letter at a time to find the hidden word in six steps.",
  },
  {
    id: "braid",
    title: "Braid",
    blurb: "Slide, twist and cancel crossings until the braid has as few as possible.",
  },
  {
    id: "algebra",
    title: "Algebra",
    blurb: "Drag terms around the equation until x stands alone.",
  },
  {
    id: "tiling",
    title: "Tiling",
    blurb: "Flip dominoes until the floor matches the plan.",
  },
];

export function gameInfo(id: GameInfo["id"]): GameInfo {
  const info = GAMES.find((g) => g.id === id);
  if (!info) throw new Error(`unknown game ${id}`);
  return info;
}
