// Per-viewer progress in localStorage. Every access is guarded: storage can be
// missing or throw (private windows, blocked site data), and the games must
// still work without it.
import { useEffect, useState } from "react";

const PREFIX = "draggle:";

export function readStored<T>(key: string): T | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // progress just won't persist
  }
}

/** useState that persists to localStorage under `key`. */
export function useStoredState<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => readStored<T>(key) ?? initial());
  useEffect(() => writeStored(key, value), [key, value]);
  return [value, setValue] as const;
}

export type GameResult = {
  solved: boolean;
  /** Short score shown on the home page, e.g. "4/6" or "par". */
  score: string;
};

export const resultKey = (gameId: string, day: number) => `result:${gameId}:${day}`;

export function recordResult(gameId: string, day: number, result: GameResult): void {
  writeStored(resultKey(gameId, day), result);
}

export function readResult(gameId: string, day: number): GameResult | undefined {
  return readStored<GameResult>(resultKey(gameId, day));
}
