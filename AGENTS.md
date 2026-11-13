# Draggle

Four daily puzzles (ladder, braid, algebra, tiling) solved by dragging, built on
[Dragology](https://github.com/declarative-dragging/dragology). Astro static
site; each game is a React island.

## Commands

Prefix with `mise exec --`. Run with `CI=1`: `astro check` otherwise stops at an
interactive prompt.

- `pnpm check`: typecheck, oxlint, stylelint, oxfmt check, vitest, build. Must
  be green before committing.

## Layout

- each game is `src/games/<id>/Game.tsx`, a default export taking `GameProps`
  (`src/games/GameIsland.tsx`), registered in `src/games/registry.ts`; pure
  puzzle logic goes in `logic.ts` beside it, tested in `logic.test.ts`
- `rngFor(id, day)` in `src/lib/daily.ts` is the only source of randomness a
  puzzle may use, so everyone gets the same one

## Rules

- Mobile first: design for a 360px-wide touch screen, then widen. Boards go in
  `FitBoard`; every drag target is at least 44px on a phone.
- Dragology elements are matched by `id`, never React `key`: a `key` on an
  element inside a draggable throws. Position with `transform`, not `x`/`y`.
- Dragology can't blend a `className` that differs between states (it throws).
  Draw each look as its own child and switch with `opacity`.
- Moves the rules forbid are never offered as drop states; don't validate after
  the drop.
- Colours come from the tokens in `global.css` (classes, not hex in SVG), so
  dark mode works.
- On Linux, pass `--args "--no-sandbox"` to `agent-browser`.
