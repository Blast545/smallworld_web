// The full self-play verification battery (TEST_PLAN):
// 2000 random-legal-action games + 500 all-heuristic-bot games across every
// player count, with invariants checked at every step and a determinism
// replay for every game. Failures dump seed + action log to
// selfplay-failures/ for deterministic regression replay.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Action } from '../engine/types';
import { dumpFailure, replayGame, runGame, stateFingerprint } from './selfplay';

const RANDOM_PER_COUNT = 500; // x4 player counts = 2000 games
const BOT_PER_COUNT = 125; // x4 player counts = 500 games

describe('self-play: random legal actions', () => {
  for (const pc of [2, 3, 4, 5]) {
    it(`${RANDOM_PER_COUNT} random games with ${pc} players`, () => {
      for (let i = 0; i < RANDOM_PER_COUNT; i++) {
        const seed = pc * 100_000 + i;
        let actions: Action[] = [];
        try {
          const res = runGame(pc, seed, 'random');
          actions = res.actions;
          const replayed = replayGame(pc, seed, res.actions);
          if (stateFingerprint(replayed) !== stateFingerprint(res.finalState)) {
            throw new Error('determinism broken: replay diverged');
          }
        } catch (err) {
          const file = dumpFailure(pc, seed, 'random', actions, err);
          throw new Error(`random self-play failed (dumped to ${file}): ${String(err)}`);
        }
      }
    });
  }
});

describe('self-play: heuristic bots', () => {
  for (const pc of [2, 3, 4, 5]) {
    it(`${BOT_PER_COUNT} bot games with ${pc} players`, () => {
      for (let i = 0; i < BOT_PER_COUNT; i++) {
        const seed = pc * 1_000_000 + i;
        let actions: Action[] = [];
        try {
          const res = runGame(pc, seed, 'bots');
          actions = res.actions;
          const replayed = replayGame(pc, seed, res.actions);
          if (stateFingerprint(replayed) !== stateFingerprint(res.finalState)) {
            throw new Error('determinism broken: replay diverged');
          }
        } catch (err) {
          const file = dumpFailure(pc, seed, 'bots', actions, err);
          throw new Error(`bot self-play failed (dumped to ${file}): ${String(err)}`);
        }
      }
    });
  }
});

describe('self-play: regression fixtures', () => {
  // Every dumped failure that has been fixed is replayed forever. Fixture
  // games must now complete without errors (they were dumped mid-failure, so
  // we re-run the full game from their seed, not just the recorded prefix).
  it('replays all committed regression fixtures cleanly', () => {
    let files: string[] = [];
    try {
      files = readdirSync('src/test/regressions').filter((f) => f.endsWith('.json'));
    } catch {
      files = [];
    }
    for (const f of files) {
      const data = JSON.parse(readFileSync(`src/test/regressions/${f}`, 'utf8')) as {
        playerCount: number;
        seed: number;
        mode: 'random' | 'bots';
      };
      const res = runGame(data.playerCount, data.seed, data.mode);
      expect(res.finalState.gameOver).toBe(true);
    }
  });
});
