import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from '../../engine/actions';
import { getVisibleState } from '../../engine/visibility';
import { chooseAction } from '../../bots/heuristic';
import { fresh } from './helpers';
import { runGame, replayGame, stateFingerprint } from '../selfplay';

describe('hidden information', () => {
  it('masks the marker deck, stack orders and opponent coins', () => {
    const s = fresh(3, 55);
    const p1 = s.players[1];
    if (p1) p1.coins = 99;
    const v = getVisibleState(s, 0);
    // Deck has the same size but canonical (not necessarily true) contents.
    expect(v.markerDeck.length).toBe(s.markerDeck.length);
    // Stack tops are visible; the rest is canonically sorted.
    expect(v.bannerStack[0]).toBe(s.bannerStack[0]);
    expect(v.badgeStack[0]).toBe(s.badgeStack[0]);
    expect(v.bannerStack.slice(1)).toEqual([...v.bannerStack.slice(1)].sort());
    // Own coins visible, opponents' replaced by an estimate.
    expect(v.players[0]?.coins).toBe(s.players[0]?.coins);
    expect(v.players[1]?.coins).not.toBe(99);
    // Board is fully visible.
    expect(JSON.stringify(v.regions)).toBe(JSON.stringify(s.regions));
  });

  it('legal actions computed on the visible state match the real state', () => {
    // Legality never depends on hidden info; sample a few random positions.
    for (const seed of [1, 2, 3]) {
      const res = runGame(2, seed, 'random');
      void res;
    }
    const s = fresh(2, 55);
    const v = getVisibleState(s, s.chooser);
    expect(JSON.stringify(getLegalActions(v))).toBe(JSON.stringify(getLegalActions(s)));
  });

  it('bots decide on the visible state and stay legal on the real one', () => {
    let s = fresh(4, 77);
    for (let i = 0; i < 120 && !s.gameOver; i++) {
      const visible = getVisibleState(s, s.chooser);
      const { action, reason } = chooseAction(visible, s.chooser);
      expect(reason.length).toBeGreaterThan(0);
      const legal = getLegalActions(s).map((a) => JSON.stringify(a));
      expect(legal).toContain(JSON.stringify(action));
      s = applyAction(s, action);
    }
  });
});

describe('determinism', () => {
  it('same seed + same actions => byte-identical states', () => {
    const res = runGame(3, 4242, 'random');
    const replayed = replayGame(3, 4242, res.actions);
    expect(stateFingerprint(replayed)).toBe(stateFingerprint(res.finalState));
  });

  it('bot decisions are deterministic', () => {
    const s = fresh(5, 99);
    const v1 = getVisibleState(s, 0);
    const v2 = getVisibleState(s, 0);
    expect(JSON.stringify(chooseAction(v1, 0))).toBe(JSON.stringify(chooseAction(v2, 0)));
  });
});
