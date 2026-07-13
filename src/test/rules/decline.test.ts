import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from '../../engine/actions';
import type { GameState } from '../../engine/types';
import {
  byTerrain,
  expectNotLegal,
  fresh,
  giveActive,
  giveDeclined,
  occupy,
  plainEntry,
  setPhase,
} from './helpers';

function freeRegions(s: GameState, n: number): number[] {
  const out: number[] = [];
  for (const t of ['mud', 'mine', 'mushroom', 'crystal']) {
    for (const rid of byTerrain(s, t)) {
      if ((s.regions[rid]?.monsters ?? 0) === 0 && (s.regions[rid]?.tokens ?? 1) === 0) {
        out.push(rid);
        if (out.length === n) return out;
      }
    }
  }
  throw new Error('not enough free regions');
}

describe('entering in decline', () => {
  it('flips one token per region, discards the badge, ends the turn after scoring', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'mystic', 2);
    const [r1, r2] = freeRegions(s, 2);
    occupy(s, 0, r1 as number, 3);
    occupy(s, 0, r2 as number, 2);
    const trayBefore = s.tray.ogres;
    setPhase(s, 'startTurn');
    const coins = s.players[0]?.coins ?? 0;
    let cur = applyAction(s, { type: 'decline' });
    expect(cur.phase).toBe('endOfTurn');
    expect(cur.players[0]?.active).toBeNull();
    expect(cur.players[0]?.declined).toEqual({ race: 'ogres', power: null });
    expect(cur.badgeDiscard).toContain('mystic');
    expect(cur.regions[r1 as number]?.tokens).toBe(1);
    expect(cur.regions[r1 as number]?.inDecline).toBe(true);
    expect(cur.regions[r2 as number]?.tokens).toBe(1);
    // 3 extra board tokens + 2 hand tokens returned.
    expect(cur.tray.ogres).toBe(trayBefore + 3 + 2);
    // No conquest actions exist; finishing scores 1 per declined region.
    expectNotLegal(cur, (a) => a.type === 'conquer' || a.type === 'beginConquest');
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(coins + 2);
  });

  it('persisting badges are kept In Decline (A36)', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'muddy', 0);
    const [r1] = freeRegions(s, 1);
    occupy(s, 0, r1 as number, 2);
    setPhase(s, 'startTurn');
    const cur = applyAction(s, { type: 'decline' });
    expect(cur.players[0]?.declined).toEqual({ race: 'ogres', power: 'muddy' });
    expect(cur.badgeDiscard).not.toContain('muddy');
  });

  it('a second decline removes the first In-Decline race and returns its banner', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'mystic', 0);
    giveDeclined(s, 0, 'gnomes', null);
    const [r1, r2] = freeRegions(s, 2);
    occupy(s, 0, r1 as number, 2);
    occupy(s, 0, r2 as number, 2, { inDecline: true });
    const gnomesTray = s.tray.gnomes;
    setPhase(s, 'startTurn');
    const cur = applyAction(s, { type: 'decline' });
    expect(cur.tray.gnomes).toBe(gnomesTray + 2);
    expect(cur.regions[r2 as number]?.tokens).toBe(0);
    expect(cur.players[0]?.declined?.race).toBe('ogres');
    // The gnome banner is back in the market.
    const inMarket =
      cur.column.some((c) => c?.banner === 'gnomes') || cur.bannerStack.includes('gnomes');
    expect(inMarket).toBe(true);
  });

  it('decline is not allowed on the pick turn or after other start actions', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'mystic', 4);
    setPhase(s, 'startTurn');
    s.turnFlags.pickedThisTurn = true;
    expectNotLegal(s, (a) => a.type === 'decline');
  });

  it('wipe-out of the last In-Decline token returns the banner immediately', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'mystic', 6);
    giveDeclined(s, 1, 'gnomes', null);
    const entry = plainEntry(s);
    occupy(s, 1, entry, 1, { inDecline: true });
    setPhase(s, 'conquest');
    const cur = applyAction(s, {
      type: 'conquer',
      region: entry,
      useSword: false,
      useSocks: false,
      useDoormat: false,
      bagAs: null,
    });
    expect(cur.players[1]?.declined).toBeNull();
    const inMarket =
      cur.column.some((c) => c?.banner === 'gnomes') || cur.bannerStack.includes('gnomes');
    expect(inMarket).toBe(true);
  });

  it('a player with no active race must pick a combo on his turn', () => {
    const s = fresh(2, 9);
    giveDeclined(s, 0, 'gnomes', null);
    const [r1] = freeRegions(s, 1);
    occupy(s, 0, r1 as number, 1, { inDecline: true });
    setPhase(s, 'pickCombo');
    const legal = getLegalActions(s);
    expect(legal.every((a) => a.type === 'pickCombo')).toBe(true);
    expect(legal.length).toBeGreaterThan(0);
  });

  it('Vanishing removes all tokens and scores 2 per region', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'vanishing', 0);
    const [r1, r2] = freeRegions(s, 2);
    occupy(s, 0, r1 as number, 2);
    occupy(s, 0, r2 as number, 3);
    const trayBefore = s.tray.ogres;
    const coins = s.players[0]?.coins ?? 0;
    setPhase(s, 'startTurn');
    let cur = applyAction(s, { type: 'decline' });
    expect(cur.regions[r1 as number]?.tokens).toBe(0);
    expect(cur.tray.ogres).toBe(trayBefore + 5);
    expect(cur.players[0]?.declined).toBeNull();
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(coins + 4); // 2 regions x2
  });

  it('Tomb keeps all tokens and allows a final redeployment (A37)', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'tomb', 0);
    const [r1, r2] = freeRegions(s, 2);
    occupy(s, 0, r1 as number, 4);
    occupy(s, 0, r2 as number, 1);
    setPhase(s, 'startTurn');
    let cur = applyAction(s, { type: 'decline' });
    expect(cur.phase).toBe('declineRedeploy');
    expect(cur.players[0]?.declined).toEqual({ race: 'ogres', power: 'tomb' });
    // All tokens kept in place; the final redeployment moves them via
    // withdraw/deploy (each region keeps at least 1).
    expect(cur.regions[r1 as number]?.tokens).toBe(4);
    expect(cur.regions[r1 as number]?.inDecline).toBe(true);
    cur = applyAction(cur, { type: 'withdraw', region: r1 as number, count: 3 });
    expect(cur.declineTombPool).toBe(3);
    cur = applyAction(cur, { type: 'deploy', region: r2 as number, count: 3 });
    expect(cur.regions[r2 as number]?.tokens).toBe(4);
    expect(cur.regions[r2 as number]?.inDecline).toBe(true);
    cur = applyAction(cur, { type: 'endTurn' });
    expect(cur.phase).toBe('endOfTurn');
  });

  it('Wise scores +2 on the decline turn and later turns while on board', () => {
    const s = fresh(2, 9);
    giveActive(s, 0, 'ogres', 'wise', 0);
    const [r1] = freeRegions(s, 1);
    occupy(s, 0, r1 as number, 2);
    const coins = s.players[0]?.coins ?? 0;
    setPhase(s, 'startTurn');
    let cur = applyAction(s, { type: 'decline' });
    cur = applyAction(cur, { type: 'finishTurn' });
    // 1 for the region + 2 wise.
    expect(cur.players[0]?.coins).toBe(coins + 3);
  });
});
