import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from '../../engine/actions';
import { conquestCost, NO_BOOSTS } from '../../engine/queries';
import { getMap } from '../../engine/setup';
import type { Action, GameState } from '../../engine/types';
import {
  byTerrain,
  CONQUER_BASE,
  edgeRegions,
  expectLegal,
  expectNotLegal,
  fresh,
  giveActive,
  giveDeclined,
  neighborsOf,
  occupy,
  plainEntry,
  setPhase,
} from './helpers';

function conquer(state: GameState, region: number): GameState {
  return applyAction(state, { type: 'conquer', region, ...CONQUER_BASE });
}

describe('first conquest', () => {
  it('only edge regions are legal entries', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'ogres', 'stone', 10);
    setPhase(s, 'conquest');
    const edges = new Set(edgeRegions(s));
    const targets = getLegalActions(s)
      .filter((a) => a.type === 'conquer' || a.type === 'finalConquest')
      .map((a) => ('region' in a ? a.region : -1));
    expect(targets.length).toBeGreaterThan(0);
    for (const t of new Set(targets)) expect(edges.has(t)).toBe(true);
  });

  it('monster edge mudpool costs 2 + 2 (rulebook caption)', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 10); // no cost modifiers
    setPhase(s, 'conquest');
    const map = getMap(s);
    const target = map.regions.find((r) => r.isEdge && r.monsterSymbol);
    if (!target) throw new Error('map needs an edge monster region');
    const extra = target.terrain === 'blackMountain' ? 1 : 0;
    const cost = conquestCost(s, 0, target.id, { ...NO_BOOSTS, flamesAsEmpty: false });
    expect(cost).toBe(4 + extra);
  });
});

describe('conquest cost', () => {
  it('base 2, +1 per monster/token/mountain, river base 1', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 10);
    giveDeclined(s, 1, 'gnomes', null);
    const entry = plainEntry(s);
    expect(conquestCost(s, 0, entry, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(2);
    const bm = byTerrain(s, 'blackMountain')[0] as number;
    const base = s.regions[bm]?.monsters ?? 0;
    expect(conquestCost(s, 0, bm, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(3 + base);
    const river = byTerrain(s, 'river')[0] as number;
    expect(conquestCost(s, 0, river, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(1);
    // Occupied region: +1 per token (In Decline counts too).
    const other = byTerrain(s, 'mud').find((r) => !s.regions[r]?.monsters) as number;
    occupy(s, 1, other, 3, { inDecline: true });
    expect(conquestCost(s, 0, other, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(5);
  });

  it('deploys exactly cost tokens and requires a token in hand', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 6);
    setPhase(s, 'conquest');
    const entry = plainEntry(s);
    const next = conquer(s, entry);
    expect(next.regions[entry]?.tokens).toBe(2);
    expect(next.players[0]?.active?.hand).toBe(4);

    // With an empty hand no conquest actions exist.
    const empty = fresh(2, 3);
    giveActive(empty, 0, 'liches', 'stone', 0);
    setPhase(empty, 'conquest');
    expect(getLegalActions(empty).filter((a) => a.type !== 'endConquest')).toHaveLength(0);
  });

  it('unaffordable regions are not offered as plain conquests', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 2);
    setPhase(s, 'conquest');
    // Every offered conquer action must cost <= 2.
    for (const a of getLegalActions(s)) {
      if (a.type === 'conquer') {
        const cost = conquestCost(s, 0, a.region, { ...a, flamesAsEmpty: false });
        expect(cost).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('adjacency', () => {
  it('subsequent conquests must touch your territory; chasms are never targets', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 8);
    const entry = plainEntry(s);
    occupy(s, 0, entry, 1);
    setPhase(s, 'conquest');
    const adjacent = new Set(neighborsOf(s, entry));
    const map = getMap(s);
    for (const a of getLegalActions(s)) {
      if (a.type === 'conquer' || a.type === 'finalConquest') {
        expect(adjacent.has(a.region)).toBe(true);
        expect(map.regions[a.region]?.terrain).not.toBe('chasm');
      }
    }
  });
});

describe('defender losses & withdrawals', () => {
  it('multi-token defender loses 1 to the tray, survivors redeploy at end of turn', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'gnomes', 'mystic', 0);
    const entry = plainEntry(s);
    const other = neighborsOf(s, entry).find(
      (n) =>
        getMap(s).regions[n]?.terrain !== 'chasm' &&
        getMap(s).regions[n]?.terrain !== 'river' &&
        (s.regions[n]?.monsters ?? 0) === 0,
    );
    if (other === undefined) throw new Error('need a free neighbor');
    occupy(s, 1, entry, 3);
    occupy(s, 1, other, 1);
    const trayBefore = s.tray.gnomes;
    setPhase(s, 'conquest');
    // Gnome region: plain conquest at full cost is still allowed.
    const next = conquer(s, entry);
    expect(next.tray.gnomes).toBe(trayBefore + 1);
    expect(next.pendingDefenders).toEqual([{ player: 1, tokens: 2, inDecline: false }]);
    // At end of turn, defender auto-redeploys into their single region.
    let cur = applyAction(next, { type: 'endConquest' });
    const hand = cur.players[0]?.active?.hand ?? 0;
    if (hand > 0) cur = applyAction(cur, { type: 'deploy', region: entry, count: hand });
    cur = applyAction(cur, { type: 'endTurn' });
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.regions[other]?.tokens).toBe(3);
    expect(cur.pendingDefenders).toHaveLength(0);
  });

  it('a single defending token is destroyed', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'gnomes', 'mystic', 0);
    const entry = plainEntry(s);
    occupy(s, 1, entry, 1);
    const trayBefore = s.tray.gnomes;
    setPhase(s, 'conquest');
    const next = conquer(s, entry);
    expect(next.tray.gnomes).toBe(trayBefore + 1);
    expect(next.pendingDefenders).toHaveLength(0);
  });

  it('dispossessed defender with multiple regions redeploys interactively', () => {
    const s = fresh(3, 3);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'gnomes', 'mystic', 0);
    const entry = plainEntry(s);
    const map = getMap(s);
    const free = map.regions
      .filter(
        (r) =>
          r.terrain !== 'chasm' &&
          r.terrain !== 'river' &&
          !s.regions[r.id]?.monsters &&
          r.id !== entry &&
          !neighborsOf(s, entry).includes(r.id),
      )
      .map((r) => r.id);
    occupy(s, 1, entry, 4);
    occupy(s, 1, free[0] as number, 1);
    occupy(s, 1, free[1] as number, 1);
    setPhase(s, 'conquest');
    let cur = conquer(s, entry);
    cur = applyAction(cur, { type: 'endConquest' });
    const hand = cur.players[0]?.active?.hand ?? 0;
    if (hand > 0) cur = applyAction(cur, { type: 'deploy', region: entry, count: hand });
    cur = applyAction(cur, { type: 'endTurn' });
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.phase).toBe('defenderRedeploy');
    expect(cur.chooser).toBe(1);
    const deploys = getLegalActions(cur).filter((a) => a.type === 'defDeploy');
    expect(deploys.length).toBeGreaterThan(0);
    cur = applyAction(cur, { type: 'defDeploy', region: free[0] as number, count: 3 });
    expect(cur.regions[free[0] as number]?.tokens).toBe(4);
    // After the defender finishes, the attacker's turn completes (scoring ran).
    expect(cur.phase === 'pickCombo' || cur.phase === 'startTurn').toBe(true);
  });

  it('conquering your own In-Decline region works like an enemy conquest (A24)', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveDeclined(s, 0, 'gnomes', null);
    const entry = plainEntry(s);
    occupy(s, 0, entry, 1, { inDecline: true });
    const trayBefore = s.tray.gnomes;
    setPhase(s, 'conquest');
    const next = conquer(s, entry);
    expect(next.tray.gnomes).toBe(trayBefore + 1);
    expect(next.regions[entry]?.race).toBe('ogres');
    // The declined race is now gone: its banner returned to the market.
    expect(next.players[0]?.declined).toBeNull();
  });
});

describe('monster regions & marker discovery', () => {
  it('destroys monsters and places the top marker', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'mummies', 'stone', 12);
    setPhase(s, 'conquest');
    const map = getMap(s);
    const target = map.regions.find((r) => r.isEdge && r.monsterSymbol);
    if (!target) throw new Error('need edge monster region');
    const expectedMarker = s.markerDeck[0];
    const next = conquer(s, target.id);
    expect(next.regions[target.id]?.monsters).toBe(0);
    expect(next.monstersDestroyed).toBe(2);
    if (expectedMarker === 'stonehedge' || expectedMarker === 'wickedestPentacle') {
      expect(next.regions[target.id]?.markers).toContain(expectedMarker);
    } else {
      expect(next.regions[target.id]?.markers).toEqual([expectedMarker]);
    }
    expect(next.markerDeck).toHaveLength(s.markerDeck.length - 1);
  });
});

describe('ready troops / abandoning', () => {
  it('beginConquest picks up all but one token per region', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 2);
    const entry = plainEntry(s);
    occupy(s, 0, entry, 5);
    setPhase(s, 'startTurn');
    const next = applyAction(s, { type: 'beginConquest' });
    expect(next.regions[entry]?.tokens).toBe(1);
    expect(next.players[0]?.active?.hand).toBe(6);
  });

  it('abandoning all regions forces First Conquest entry again', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 0);
    const map = getMap(s);
    const inner = map.regions.find(
      (r) => !r.isEdge && r.terrain !== 'chasm' && r.terrain !== 'river' && !r.monsterSymbol,
    );
    if (!inner) throw new Error('need inner region');
    occupy(s, 0, inner.id, 4);
    setPhase(s, 'startTurn');
    let cur = applyAction(s, { type: 'abandon', region: inner.id });
    expect(cur.regions[inner.id]?.tokens).toBe(0);
    expect(cur.players[0]?.active?.hand).toBe(4);
    // Decline is no longer allowed after another start action.
    expectNotLegal(cur, (a) => a.type === 'decline');
    cur = applyAction(cur, { type: 'beginConquest' });
    const edges = new Set(edgeRegions(cur));
    for (const a of getLegalActions(cur)) {
      if (a.type === 'conquer') expect(edges.has(a.region)).toBe(true);
    }
  });
});

describe('final conquest / reinforcement die', () => {
  it('is offered only when short by 1-3 and ends the conquest phase', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 1);
    setPhase(s, 'conquest');
    const finals = getLegalActions(s).filter(
      (a): a is Action & { region: number } => a.type === 'finalConquest',
    );
    expect(finals.length).toBeGreaterThan(0);
    for (const a of finals) {
      const cost = conquestCost(s, 0, a.region, { ...NO_BOOSTS, flamesAsEmpty: false });
      expect(cost - 1).toBeGreaterThanOrEqual(1);
      expect(cost - 1).toBeLessThanOrEqual(3);
    }
    const target = finals[0] as Action & { region: number };
    const next = applyAction(s, target);
    // Success or failure, the conquest phase ended.
    expect(['redeploy', 'balrogPlace']).toContain(next.phase);
    const r = next.regions[target.region];
    const won = r?.owner === 0;
    if (won) {
      expect(r?.tokens).toBe(1); // deploys ALL remaining tokens
      expect(next.players[0]?.active?.hand).toBe(0);
    } else {
      expect(next.players[0]?.active?.hand).toBe(1);
    }
  });

  it('die outcomes are deterministic per seed', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 1);
    setPhase(s, 'conquest');
    const finals = getLegalActions(s).filter((a) => a.type === 'finalConquest');
    const a = finals[0];
    if (!a) throw new Error('no final conquest');
    const r1 = applyAction(s, a);
    const r2 = applyAction(s, a);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe('redeployment', () => {
  it('river regions are force-emptied for non-Kraken and hand must be placed', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'lizardmen', 'stone', 6);
    const river = byTerrain(s, 'river')[0] as number;
    const land = plainEntry(s);
    occupy(s, 0, land, 1);
    occupy(s, 0, river, 1);
    setPhase(s, 'conquest');
    let cur = applyAction(s, { type: 'endConquest' });
    expect(cur.phase).toBe('redeploy');
    expect(cur.regions[river]?.tokens).toBe(0);
    expect(cur.players[0]?.active?.hand).toBe(7);
    // endTurn is illegal until the hand is deployed.
    expectNotLegal(cur, (a) => a.type === 'endTurn');
    cur = applyAction(cur, { type: 'deploy', region: land, count: 7 });
    const next = applyAction(cur, { type: 'endTurn' });
    expect(next.phase).toBe('endOfTurn');
    expect(next.regions[land]?.tokens).toBe(8);
  });

  it('tokens stay in hand when no regions remain (re-entry next turn)', () => {
    const s = fresh(2, 3);
    giveActive(s, 0, 'liches', 'stone', 4);
    setPhase(s, 'conquest');
    let cur = applyAction(s, { type: 'endConquest' });
    cur = expectLegal(cur, (a) => a.type === 'endTurn') && applyAction(cur, { type: 'endTurn' });
    expect(cur.players[0]?.active?.hand).toBe(4);
  });
});
