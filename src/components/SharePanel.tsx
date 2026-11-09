import { useEffect, useState } from "react";

import type { GameInfo } from "../games/registry";

import { recordResult } from "../lib/storage";

export type Outcome = {
  solved: boolean;
  /** Short score, e.g. "4/6" or "7 moves (par 5)". */
  score: string;
  /** Emoji lines for the share text, one string per line. */
  grid: string[];
};

export function shareText(info: GameInfo, day: number, outcome: Outcome, url: string) {
  return [
    `Draggle ${info.title} #${day} ${outcome.solved ? outcome.score : "X"}`,
    ...outcome.grid,
    url,
  ].join("\n");
}

/** Shown once a game ends: records the result and offers the share text. */
export function SharePanel({
  info,
  day,
  outcome,
  message,
}: {
  info: GameInfo;
  day: number;
  outcome: Outcome;
  /** One sentence to the player, e.g. "Solved in four." */
  message: string;
}) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    recordResult(info.id, day, { solved: outcome.solved, score: outcome.score });
  }, [info.id, day, outcome.solved, outcome.score]);

  const url = new URL(info.id, globalThis.location.href.replace(/[^/]*$/, "")).href;
  const text = shareText(info, day, outcome, url);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section className="share" aria-labelledby="share-heading">
      <h2 id="share-heading">{message}</h2>
      <pre className="share-text">{text}</pre>
      <button type="button" className="button" onClick={copy}>
        Copy result
      </button>
      <p className="share-status" role="status">
        {copied === "copied" && "Copied. Paste it anywhere."}
        {copied === "failed" && "Couldn't reach the clipboard. Select the text above instead."}
      </p>
    </section>
  );
}
