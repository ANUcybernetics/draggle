# Draggle

Four daily puzzles (ladder, braid, algebra, tiling) solved by dragging, built on
[Dragology](https://github.com/declarative-dragging/dragology). Astro static
site; each game is a React island.

## Commands

Prefix with `mise exec --`. Run with `CI=1`: `astro check` otherwise stops at an
interactive prompt.

- `pnpm dev` / `pnpm build` / `pnpm preview`
- `pnpm check`: typecheck, oxlint, stylelint, oxfmt check, vitest, build. Must
  be green before committing.

## Layout

- `src/games/registry.ts`: game ids, titles and one-line blurbs
- `src/games/<id>/Game.tsx`: the game, default export taking `GameProps`
  (`src/games/GameIsland.tsx`); `logic.ts` beside it holds the pure puzzle
  logic, tested in `logic.test.ts`
- `src/lib/daily.ts`: puzzle numbering and seeded RNG; `rngFor(id, day)` is the
  only source of randomness a puzzle may use, so everyone gets the same one
- `src/lib/storage.ts`: `useStoredState` for in-progress state (localStorage,
  guarded)
- `src/components/`: `FitBoard` (scales a fixed-size board to the screen),
  `SharePanel` (records the result and offers the emoji share text)
- `src/styles/global.css`: design tokens and shared piece styles

## Rules

- Mobile first: design for a 360px-wide touch screen, then widen. Boards go in
  `FitBoard`; every drag target is at least 44px on a phone.
- Dragology elements are matched by `id`, never React `key`: a `key` on an
  element inside a draggable throws. Position with `transform`, not `x`/`y`.
- Moves the rules forbid are never offered as drop states; don't validate after
  the drop.
- Colours come from the tokens in `global.css` (classes, not hex in SVG), so
  dark mode works.
- Browser checks use the `agent-browser` CLI, with `--args "--no-sandbox"` on
  Linux.
