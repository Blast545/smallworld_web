import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, visibleCombos } from '../../engine/actions';
import { POWERS, RACES } from '../../engine/data';
import type { GameState } from '../../engine/types';
import { fresh } from './helpers';

function pick(state: GameState, combo: number): GameState {
  return applyAction(state, { type: 'pickCombo', combo });
}

describe('combo market', () => {
  it('combo i costs i coins dropped on the combos above', () => {
    const s = fresh(2, 11);
    const before = visibleCombos(s);
    const next = pick(s, 3);
    expect(next.players[0]?.coins).toBe(5 - 3);
    // Coins landed on the three combos that were above the picked one.
    for (let i = 0; i < 3; i++) {
      expect(next.column[i]?.coins).toBe(1);
      expect(next.column[i]?.banner).toBe(before[i]?.banner);
    }
    // Column slid up: old slot 4 is now slot 3, refilled from stack.
    expect(next.column[3]?.banner).toBe(before[4]?.banner);
    expect(next.column.filter((c) => c !== null)).toHaveLength(5);
  });

  it('picking the free top combo costs nothing', () => {
    const s = fresh(2, 11);
    const next = pick(s, 0);
    expect(next.players[0]?.coins).toBe(5);
  });

  it('picking the stack-top combo costs 5', () => {
    const s = fresh(2, 11);
    const stackTop = s.bannerStack[0];
    const next = pick(s, 5);
    expect(next.players[0]?.coins).toBe(0);
    expect(next.players[0]?.active?.race).toBe(stackTop);
    for (const c of next.column) expect(c?.coins).toBe(1);
  });

  it('coins on the picked combo are pocketed and can fund the cost (A11)', () => {
    const s = fresh(2, 11);
    // Drop coins on combos by having player 0 pick combo 2 (coins land on 0,1).
    let cur = pick(s, 2);
    // Play out player 0's turn so player 1 gets to pick.
    while (cur.phase !== 'pickCombo') {
      const acts = getLegalActions(cur);
      const preferred =
        acts.find((x) => x.type === 'mimeSkip') ??
        acts.find((x) => x.type === 'beginConquest') ??
        acts.find((x) => x.type === 'endConquest') ??
        acts.find((x) => x.type === 'deploy') ??
        acts.find((x) => x.type === 'endTurn') ??
        acts.find((x) => x.type === 'finishTurn') ??
        acts[0];
      if (!preferred) throw new Error('stuck');
      cur = applyAction(cur, preferred);
    }
    expect(cur.activePlayer).toBe(1);
    // Combo at position 1 carries 1 coin.
    expect(cur.column[1]?.coins).toBe(1);
    const p1coins = cur.players[1]?.coins ?? 0;
    cur = pick(cur, 1);
    // Paid 1, pocketed 1: net 0.
    expect(cur.players[1]?.coins).toBe(p1coins);
  });

  it('a broke player can only take affordable combos', () => {
    const s = fresh(2, 11);
    const p0 = s.players[0];
    if (p0) p0.coins = 0;
    const combos = getLegalActions(s).filter((a) => a.type === 'pickCombo');
    expect(combos.map((a) => (a.type === 'pickCombo' ? a.combo : -1))).toEqual([0]);
  });

  it('race tokens received = banner + badge values', () => {
    const s = fresh(3, 5);
    const c = visibleCombos(s)[0];
    if (!c) throw new Error('no combo');
    const next = pick(s, 0);
    const expected = Math.min(
      RACES[c.banner].banner + (c.power ? POWERS[c.power].value : 0),
      RACES[c.banner].supply,
    );
    expect(next.players[0]?.active?.hand).toBe(expected);
    expect(next.tray[c.banner]).toBe(RACES[c.banner].supply - expected);
  });

  it('Shadow Mimes may swap their badge with a visible combo (A12)', () => {
    // Find a seed where shadow mimes are visible at position 0.
    for (let seed = 1; seed < 400; seed++) {
      const s = fresh(2, seed);
      const combos = visibleCombos(s);
      const mimeIdx = combos.find((c) => c.banner === 'shadowMimes' && c.index === 0);
      if (!mimeIdx) continue;
      const next = pick(s, 0);
      expect(next.phase).toBe('mimeSwap');
      // Tokens not yet granted.
      expect(next.players[0]?.active?.hand).toBe(0);
      const targets = getLegalActions(next).filter((a) => a.type === 'mimeSwap');
      expect(targets.length).toBeGreaterThan(0);
      const target = targets[0];
      if (!target || target.type !== 'mimeSwap') throw new Error('no target');
      const targetCombo = visibleCombos(next).find((c) => c.index === target.combo);
      const myOldPower = mimeIdx.power;
      const after = applyAction(next, target);
      expect(after.players[0]?.active?.power).toBe(targetCombo?.power);
      // Token count computed after the swap.
      expect(after.players[0]?.active?.hand).toBe(
        RACES.shadowMimes.banner + (targetCombo?.power ? POWERS[targetCombo.power].value : 0),
      );
      // The old badge landed where the taken badge was; after the swap the
      // market replenishes and slides everything up one slot.
      if (target.combo === 5) {
        expect(after.badgeStack[0]).toBe(myOldPower);
      } else {
        expect(after.column[target.combo - 1]?.power).toBe(myOldPower);
      }
      // Skipping is also legal.
      const skipped = applyAction(next, { type: 'mimeSkip' });
      expect(skipped.players[0]?.active?.power).toBe(myOldPower);
      return;
    }
    throw new Error('no seed produced a visible Shadow Mimes combo at slot 0');
  });

  it('replenishes to 6 visible combos after every pick', () => {
    let s = fresh(3, 20);
    for (let i = 0; i < 3; i++) {
      const legal = getLegalActions(s).filter((a) => a.type === 'pickCombo');
      const a = legal[0];
      if (!a) throw new Error('no pick');
      s = applyAction(s, a);
      if (s.phase === 'mimeSwap') s = applyAction(s, { type: 'mimeSkip' });
      expect(visibleCombos(s).length).toBe(6);
      // hand the turn over quickly: begin conquest and end it, redeploy, finish
      while (s.phase !== 'pickCombo' && !s.gameOver) {
        const acts = getLegalActions(s);
        const preferred =
          acts.find((x) => x.type === 'beginConquest') ??
          acts.find((x) => x.type === 'endConquest') ??
          acts.find((x) => x.type === 'deploy') ??
          acts.find((x) => x.type === 'endTurn') ??
          acts.find((x) => x.type === 'finishTurn') ??
          acts[0];
        if (!preferred) throw new Error('stuck');
        s = applyAction(s, preferred);
      }
    }
  });
});
