import { describe, expect, it } from 'vitest';
import { applyAction } from '../../engine/actions';
import { getScores, isTerminal } from '../../engine/scoring';
import type { GameState } from '../../engine/types';
import { byTerrain, fresh, giveActive, giveDeclined, occupy, setPhase } from './helpers';

function freeRegion(s: GameState, exclude: number[] = []): number {
  for (let i = 0; i < s.regions.length; i++) {
    const r = s.regions[i];
    if (!r) continue;
    if (byTerrain(s, 'chasm').includes(i) || byTerrain(s, 'river').includes(i)) continue;
    if (r.monsters === 0 && r.tokens === 0 && !exclude.includes(i)) return i;
  }
  throw new Error('no free region');
}

describe('base scoring', () => {
  it('+1 per active and per declined region', () => {
    const s = fresh(2, 44);
    giveActive(s, 0, 'ogres', 'frightened', 4);
    giveDeclined(s, 0, 'liches', null);
    const a = freeRegion(s);
    const b = freeRegion(s, [a]);
    const c = freeRegion(s, [a, b]);
    occupy(s, 0, a, 1);
    occupy(s, 0, b, 1);
    occupy(s, 0, c, 1, { inDecline: true });
    setPhase(s, 'endOfTurn');
    const coins = s.players[0]?.coins ?? 0;
    const cur = applyAction(s, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(coins + 3);
  });
});

describe('end of game', () => {
  it('ends after the final round and declares the richest player the winner', () => {
    const s = fresh(2, 44);
    s.turn = s.maxTurns; // final round
    giveActive(s, 0, 'ogres', 'frightened', 4);
    giveActive(s, 1, 'liches', 'mystic', 4);
    const a = freeRegion(s);
    occupy(s, 0, a, 1);
    const p0 = s.players[0];
    const p1 = s.players[1];
    if (p0) p0.coins = 10;
    if (p1) p1.coins = 3;
    // Player 1 finishes the last turn of the game.
    setPhase(s, 'endOfTurn', 1);
    const cur = applyAction(s, { type: 'finishTurn' });
    expect(cur.gameOver).toBe(true);
    expect(isTerminal(cur)).toBe(true);
    expect(cur.phase).toBe('gameOver');
    const scores = getScores(cur);
    expect(scores.winners).toEqual([0]);
    expect(applyAction.bind(null, cur, { type: 'finishTurn' })).toThrow();
  });

  it('coin tie broken by tokens on board; full tie shared (A46)', () => {
    const s = fresh(2, 44);
    s.turn = s.maxTurns;
    giveActive(s, 0, 'ogres', 'frightened', 4);
    giveActive(s, 1, 'liches', 'mystic', 4);
    const a = freeRegion(s);
    const b = freeRegion(s, [a]);
    occupy(s, 0, a, 3);
    occupy(s, 1, b, 1);
    const p0 = s.players[0];
    const p1 = s.players[1];
    if (p0) p0.coins = 9;
    if (p1) p1.coins = 10; // after +1 for the region, both at 10... p0 stays 9
    setPhase(s, 'endOfTurn', 1);
    let cur = applyAction(s, { type: 'finishTurn' });
    // p1 scored +1 => 11 vs 9: p1 wins outright. Redo for the tie case below.
    expect(getScores(cur).winners).toEqual([1]);

    const t = fresh(2, 44);
    t.turn = t.maxTurns;
    giveActive(t, 0, 'ogres', 'frightened', 4);
    giveActive(t, 1, 'liches', 'frightened', 4);
    occupy(t, 0, a, 3);
    occupy(t, 1, b, 1);
    const q0 = t.players[0];
    const q1 = t.players[1];
    if (q0) q0.coins = 11;
    if (q1) q1.coins = 10; // +1 => 11: coins tied, tokens 3 vs 1
    setPhase(t, 'endOfTurn', 1);
    cur = applyAction(t, { type: 'finishTurn' });
    expect(getScores(cur).winners).toEqual([0]);

    const u = fresh(2, 44);
    u.turn = u.maxTurns;
    giveActive(u, 0, 'ogres', 'frightened', 4);
    giveActive(u, 1, 'liches', 'frightened', 4);
    occupy(u, 0, a, 1);
    occupy(u, 1, b, 1);
    const r0 = u.players[0];
    const r1 = u.players[1];
    if (r0) r0.coins = 11;
    if (r1) r1.coins = 10;
    setPhase(u, 'endOfTurn', 1);
    cur = applyAction(u, { type: 'finishTurn' });
    expect(getScores(cur).winners).toEqual([0, 1]);
  });

  it('the turn counter advances when the round wraps', () => {
    const s = fresh(2, 44);
    giveActive(s, 1, 'ogres', 'frightened', 4);
    setPhase(s, 'endOfTurn', 1);
    const cur = applyAction(s, { type: 'finishTurn' });
    expect(cur.turn).toBe(2);
    expect(cur.activePlayer).toBe(0);
  });
});
