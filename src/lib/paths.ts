/** Site-relative path for a page, respecting Astro's `base` (e.g. GitHub Pages). */
export function sitePath(page = ""): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${page}`;
}
