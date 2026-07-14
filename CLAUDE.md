# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A complete digital edition of Days of Wonder's **Small World Underground** (base game, 2–5 players): one human plus 1–4 heuristic bots, playable offline as an installable PWA. Vite + React 19 + TypeScript (strict). No state-management library, no component library, no CSS framework — plain CSS, and a pure-TypeScript rules engine with zero UI dependencies that also runs headless in Node.

## Commands

```bash
npm run dev              # local dev server
npm run dev -- --host    # expose on LAN (open on a phone, Add to Home Screen)
npm run build            # tsc -b (all three project refs) + vite build
npm run preview -- --host

npm run typecheck        # tsc -b --force
npm run lint             # eslint .
npm run test             # vitest run — full suite incl. the self-play battery
npm run selfplay         # just src/test/selfplay.test.ts (2000 random + 500 bot games)
npm run e2e              # playwright (builds+previews first via webServer)
npm run verify           # typecheck → lint → test → build → e2e, in order
```

Run one Vitest file / test:

```bash
npx vitest run src/test/rules/conquest.test.ts
npx vitest run src/test/rules/conquest.test.ts -t 'name substring'
```

The self-play test is slow (thousands of full games); when iterating on the engine, run the relevant `src/test/rules/*.test.ts` cluster first, then the full suite before finishing.

## Architecture

```
src/engine/   pure rules — no UI, no React, runs in Node
src/bots/     one-ply heuristic chooser + weighted evaluation (consumes masked state)
src/ui/       React components only — no rules logic, dispatches engine actions
src/test/     rule-cluster unit tests, self-play harness, invariants, Playwright e2e
docs/         rulebook transcription, rules spec, assumptions log, test plan
```

### Core invariants — do not violate these

- **`applyAction(state, action)` is the only way state changes**, and it never mutates its input (it `cloneState`s first). `getLegalActions(state)` is the single source of truth for legality. Both live in `src/engine/actions.ts` (~1800 lines, the heart of the engine).
- **The whole game is a pure function of `(config, seed, action sequence)`.** All randomness flows through a seeded PRNG (`src/engine/rng.ts`, mulberry32) whose `RngState` is a plain number stored *inside* `GameState`. Every random event consumes and returns RNG state explicitly. Never call `Math.random()` in the engine or bots.
- **Persistence and resume replay the action log** — the localStorage save (`src/ui/useGame.ts`) is `{ config, actions, reasons }`, and loading re-runs `applyAction` from the initial state. Because of this, any change to action semantics can invalidate old saves; the self-play determinism replay (below) guards against accidental non-determinism.
- **Hidden information is masked by `getVisibleState(state, playerId)`** (`src/engine/visibility.ts`). Both the UI and the bots consume *only* the masked state, never raw `GameState`. It replaces the face-down Place/Relic deck, sub-top stack orders, and opponents' coin totals with deterministic canonical stand-ins, and re-seeds RNG so future rolls aren't predictable — the masked state is still a fully-playable `GameState`, so bots can `applyAction` on it for lookahead without seeing the truth.

### Data & state model

- `src/engine/data.ts` — all static content: 15 races, 21 powers, 15 places/relics, terrains, token supplies, plus player-facing one-line help strings. IDs here (`RaceId`, `PowerId`, `MarkerId`, `Terrain`) are string-literal unions used everywhere.
- `src/engine/types.ts` — `GameState`, the `Action` union (every legal move is one variant), `Phase`, and `TurnFlags` (a large per-turn bookkeeping record for once-per-turn relic/power uses). Read this first to understand the state shape.
- `src/engine/maps.ts` + `setup.ts` — four original maps (one per player count; geography is *not* the printed geography, see [A3]) and `createInitialState`. Region adjacency/terrain live in the map; live occupancy lives in `GameState.regions`.
- `src/engine/queries.ts` — pure derived queries (reachability, conquest cost/budget, marker/figure lookup, immunity). `src/engine/scoring.ts` — end-of-turn scoring, terminality, final scores.

### Rules judgment calls

The rulebook is ambiguous, self-contradictory, or unextractable in many places. **Every ruling adopted is documented in `docs/ASSUMPTIONS.md` as `[A#]`** and referenced from code comments and `docs/RULES.md`. When touching rules logic, check for a governing `[A#]` first, and if you make a new judgment call, add one. `docs/RULES.md` is the implementation-ready spec (also rendered in-app via `src/ui/Rules.tsx`); `docs/TEST_PLAN.md` says what the tests assert.

## Testing model

- **Rule-cluster unit tests**: `src/test/rules/*.test.ts` (conquest, decline, powers, combos, scoring, markers, races, setup, visibility). Helpers in `src/test/rules/helpers.ts`.
- **Self-play battery** (`src/test/selfplay.test.ts` + `selfplay.ts`): 2000 random-legal-action games + 500 all-bot games across all player counts. Every step is checked against `src/test/invariants.ts` (token/monster/banner conservation, occupancy consistency, unique markers/figures, etc.), and every finished game is **replayed and fingerprinted** to prove determinism.
- **Failure → regression flow**: a self-play failure dumps `{ playerCount, seed, mode, error, actions }` to `selfplay-failures/` (gitignored). Once the underlying bug is fixed, move the JSON to `src/test/regressions/` — the regression test re-runs every fixture's seed forever.
- **E2E**: `src/test/e2e/game.spec.ts`, Playwright on an emulated iPhone 12 viewport (Chromium — WebKit isn't available here), against the production preview build. Plays a full game to a winner, then tests offline relaunch and resume-from-save.

## Conventions that will bite you

- **Strict TS everywhere**, including `noUncheckedIndexedAccess` (array access is `T | undefined` — hence the `must()`/guard helpers in the engine), `exactOptionalPropertyTypes`, and `verbatimModuleSyntax` (**use `import type` for type-only imports** or the build fails).
- **ESLint**: `@typescript-eslint/no-explicit-any` is an **error**, `ban-ts-comment` is an error, and `no-console` allows only `console.error`. Don't reach for `any` or `@ts-ignore`.
- **The UI must contain no rules logic** — components dispatch `Action`s and render `GameState`; all legality/effects belong in the engine. Bots must never throw (they fall back to the first legal action) and must never see unmasked state.
- `GameState` is JSON-safe by construction (`cloneState` deep-copies field by field, and `stateFingerprint` is `JSON.stringify`). Keep it serializable — no `Map`/`Set`/class instances in state (those appear only in transient scoring/query return values).
- Three composite tsconfig project refs: `tsconfig.app.json` (app, excludes `src/test`), `tsconfig.test.json` (includes tests + node types), `tsconfig.node.json` (vite/playwright config). `npm run build` builds all three.
