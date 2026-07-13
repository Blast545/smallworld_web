# Small World Underground — digital edition

A complete single-player-vs-bots implementation of Days of Wonder's
**Small World Underground** (base game, 2–5 players): one human plus 1–4
heuristic bots, playable offline as an installable PWA on an iPhone.

Built with Vite + React + TypeScript (strict). No state-management library,
no component library, no CSS framework — plain CSS keeps the bundle small and
every style auditable. The rules engine (`src/engine/`) is pure TypeScript
with zero UI dependencies and runs headless in Node.

## Run it

```bash
npm install
npm run dev            # local development
npm run dev -- --host  # expose on your LAN — open the printed URL on your
                       # iPhone in Safari, then Share > Add to Home Screen
```

Production build + preview (what the E2E tests run against):

```bash
npm run build
npm run preview -- --host
```

Deploy anywhere static (the app is fully self-contained):

```bash
npm run build && npx vercel deploy --prod dist   # or netlify deploy --prod --dir=dist
```

## Verify

```bash
npm run verify
```

Runs, in order: strict typecheck, ESLint, the full Vitest suite (rule-cluster
unit tests + 2,000 random-legal-action self-play games + 500 all-bot games
with invariants and determinism replays at every step), the production build,
and a Playwright end-to-end game on an emulated iPhone viewport (full game vs
4 bots to a declared winner, offline relaunch, resume-from-save).

Self-play failures dump seed + action log into `selfplay-failures/`; fixed
ones are promoted to `src/test/regressions/` and replayed forever.

## Docs

- `docs/rulebook.txt` — transcription of the rulebook the game was built from
- `docs/RULES.md` — implementation-ready rules spec (also rendered in-app)
- `docs/ASSUMPTIONS.md` — every rules judgment call, for auditing
- `docs/TEST_PLAN.md` — what the tests assert

## Architecture

```
src/engine/   pure rules: types, maps, setup, actions, scoring, rng, visibility
src/bots/     evaluation + one-ply heuristic chooser (consumes masked state)
src/ui/       React components only — no rules logic, dispatches engine actions
src/test/     rule-cluster unit tests, self-play harness, Playwright e2e
```

`applyAction` is the only way state changes; `getLegalActions` is the single
source of legality; the whole game is a pure function of
`(config, seed, action sequence)`; hidden information (the face-down
Place/Relic deck, opponents' coin totals, stack orders) is masked by
`getVisibleState`, which both the UI and the bots consume.
