import type { DragSpec } from "dragology";

/** True when the viewer has asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Dragology animates drops and branch switches whatever the viewer's motion
 * preference, so wrap every drag spec in this to make both instant on request.
 */
export function respectMotion<T extends object>(spec: DragSpec<T>): DragSpec<T> {
  return prefersReducedMotion() ? spec.withDropTransition(0).withBranchTransition(0) : spec;
}
