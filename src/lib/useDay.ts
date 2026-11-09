import { dayNumber } from "./daily";

/** Today's puzzle number, or `?day=N` from the URL (for replaying old days). */
export function currentDay(): number {
  const today = dayNumber(new Date());
  const param = new URLSearchParams(globalThis.location?.search ?? "").get("day");
  const requested = param == null ? Number.NaN : Number.parseInt(param, 10);
  return Number.isInteger(requested) && requested >= 1 && requested <= today ? requested : today;
}
