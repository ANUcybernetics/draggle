import type { GameProps } from "../GameIsland";

export default function Game({ info, day }: GameProps) {
  return (
    <p>
      {info.title} #{day} is still being built.
    </p>
  );
}
