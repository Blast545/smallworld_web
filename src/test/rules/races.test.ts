import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from '../../engine/actions';
import { conquestCost, computeReach, findFigureRegion, NO_BOOSTS } from '../../engine/queries';
import { getMap } from '../../engine/setup';
import type { Action, GameState } from '../../engine/types';
import {
  byTerrain,
  clearMonsters,
  CONQUER_BASE,
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

function freeNeighbor(s: GameState, region: number): number {
  const map = getMap(s);
  const n = neighborsOf(s, region).find(
    (x) =>
      map.regions[x]?.terrain !== 'chasm' &&
      map.regions[x]?.terrain !== 'river' &&
      (s.regions[x]?.monsters ?? 0) === 0 &&
      (s.regions[x]?.tokens ?? 0) === 0,
  );
  if (n === undefined) throw new Error('no free neighbor');
  return n;
}

describe('Cultists', () => {
  it('Great Ancient appears on first conquest, region immune, -1 adjacent, movable', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'cultists', 'stone', 10);
    giveActive(s, 1, 'ogres', 'mystic', 6);
    setPhase(s, 'conquest');
    const entry = plainEntry(s);
    let cur = conquer(s, entry);
    expect(findFigureRegion(cur, 'greatAncient')).toBe(entry);
    // -1 for regions adjacent to the GA (min 1).
    const target = freeNeighbor(cur, entry);
    expect(conquestCost(cur, 0, target, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(1);
    // Opponent cannot conquer the GA region.
    const opp = { ...cur, activePlayer: 1, chooser: 1 };
    setPhase(opp as GameState, 'conquest', 1);
    occupy(opp as GameState, 1, freeNeighbor(opp as GameState, entry), 3);
    expectNotLegal(
      opp as GameState,
      (a) => (a.type === 'conquer' || a.type === 'finalConquest') && a.region === entry,
    );
    // GA moves at start of turn to another cultist region.
    cur = conquer(cur, target);
    setPhase(cur, 'startTurn');
    cur = applyAction(cur, { type: 'moveGreatAncient', region: target });
    expect(findFigureRegion(cur, 'greatAncient')).toBe(target);
  });
});

describe('Drow', () => {
  it('score +1 per region with no bordering foreign race or monsters', () => {
    const s = fresh(2, 13);
    // Frightened never triggers with 1-token regions, so only base + recluse score.
    giveActive(s, 0, 'drow', 'frightened', 4);
    const map = getMap(s);
    // Find a region whose neighborhood we can fully clear of monsters.
    const lonely = map.regions.find(
      (r) =>
        r.terrain !== 'chasm' &&
        r.terrain !== 'river' &&
        !r.monsterSymbol &&
        neighborsOf(s, r.id).every((n) => (s.regions[n]?.monsters ?? 0) === 0),
    );
    const crowded = map.regions.find(
      (r) =>
        r.terrain !== 'chasm' &&
        r.terrain !== 'river' &&
        !r.monsterSymbol &&
        r.id !== lonely?.id &&
        neighborsOf(s, r.id).some((n) => (s.regions[n]?.monsters ?? 0) > 0),
    );
    if (!lonely || !crowded) throw new Error('need suitable regions');
    occupy(s, 0, lonely.id, 1);
    occupy(s, 0, crowded.id, 1);
    setPhase(s, 'endOfTurn');
    const coins = s.players[0]?.coins ?? 0;
    const cur = applyAction(s, { type: 'finishTurn' });
    // 2 base + 1 recluse for the lonely region. Same-race neighbors do not
    // break the recluse bonus; the crowded region's monster neighbors do.
    expect(cur.players[0]?.coins).toBe(coins + 2 + 1);
  });
});

describe('Flames', () => {
  it('enter next to the Volcano at as-if-empty cost (A53/A22)', () => {
    const s = fresh(3, 13);
    giveActive(s, 0, 'flames', 'stone', 9);
    const map = getMap(s);
    const site = map.regions.find((r) => r.volcanoSymbol) as { id: number };
    s.regions[site.id]?.figures.push({ kind: 'volcano', owner: 0 });
    setPhase(s, 'conquest');
    const around = new Set(
      neighborsOf(s, site.id).filter((n) => map.regions[n]?.terrain !== 'chasm'),
    );
    const conquers = getLegalActions(s).filter(
      (a): a is Action & { region: number } => a.type === 'conquer',
    );
    expect(conquers.length).toBeGreaterThan(0);
    for (const a of conquers) expect(around.has(a.region)).toBe(true);
    // Occupied volcano-adjacent region costs as if empty (but static defense counts).
    const occupied = [...around].find((n) => map.regions[n]?.terrain !== 'blackMountain');
    if (occupied === undefined) throw new Error('no plain neighbor');
    giveActive(s, 1, 'ogres', 'mystic', 4);
    if ((s.regions[occupied]?.monsters ?? 0) === 0) {
      occupy(s, 1, occupied, 3);
    } else {
      // monster region: as-if-empty ignores the monsters too
    }
    const cost = conquestCost(s, 0, occupied, { ...NO_BOOSTS, flamesAsEmpty: true });
    expect(cost).toBe(2);
  });
});

describe('Gnomes', () => {
  it('block attacker powers/relic effects but not plain conquest; Mummies still pay +1', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'gnomes', 'mystic', 4);
    const entry = plainEntry(s);
    occupy(s, 1, entry, 1);
    // Ogre discount does not apply to Gnome regions.
    expect(conquestCost(s, 0, entry, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(3);
    setPhase(s, 'conquest');
    expectLegal(s, (a) => a.type === 'conquer' && a.region === entry);

    const m = fresh(2, 13);
    giveActive(m, 0, 'mummies', 'stone', 12);
    giveActive(m, 1, 'gnomes', 'mystic', 4);
    occupy(m, 1, entry, 1);
    expect(conquestCost(m, 0, entry, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(4);
  });

  it('cannot be vampirized, even as a single token', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'ogres', 'vampire', 8);
    giveActive(s, 1, 'gnomes', 'mystic', 4);
    const entry = plainEntry(s);
    const next = freeNeighbor(s, entry);
    occupy(s, 1, entry, 1);
    occupy(s, 0, next, 2);
    setPhase(s, 'conquest');
    expectNotLegal(s, (a) => a.type === 'vampirize' && a.region === entry);
  });
});

describe('Iron Dwarves', () => {
  it('gain hammers per mine at end of redeploy; hammers pay conquests, never defend', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'ironDwarves', 'stone', 6);
    const mine = byTerrain(s, 'mud')
      .concat(byTerrain(s, 'mine'))
      .find(
        (r) =>
          getMap(s).regions[r]?.terrain === 'mine' &&
          (s.regions[r]?.monsters ?? 0) === 0,
      );
    const mineId = byTerrain(s, 'mine').find((r) => (s.regions[r]?.monsters ?? 0) === 0);
    if (mineId === undefined) throw new Error('no free mine');
    void mine;
    occupy(s, 0, mineId, 2);
    setPhase(s, 'conquest');
    let cur = applyAction(s, { type: 'endConquest' });
    const hand = cur.players[0]?.active?.hand ?? 0;
    if (hand > 0) cur = applyAction(cur, { type: 'deploy', region: mineId, count: hand });
    cur = applyAction(cur, { type: 'endTurn' });
    expect(cur.players[0]?.active?.hammerPool).toBe(1);

    // Next turn: the hammer counts toward the conquest budget and is spent first.
    setPhase(cur, 'startTurn');
    cur = applyAction(cur, { type: 'beginConquest' });
    const target = freeNeighbor(cur, mineId);
    const cost = conquestCost(cur, 0, target, { ...NO_BOOSTS, flamesAsEmpty: false });
    const before = cur.players[0]?.active?.hand ?? 0;
    cur = conquer(cur, target);
    expect(cur.regions[target]?.hammers).toBe(Math.min(1, cost - 1));
    expect(cur.players[0]?.active?.hand).toBe(before - (cost - Math.min(1, cost - 1)));
    // Hammers come off the map at end of redeploy.
    cur = applyAction(cur, { type: 'endConquest' });
    const hand2 = cur.players[0]?.active?.hand ?? 0;
    if (hand2 > 0) cur = applyAction(cur, { type: 'deploy', region: target, count: hand2 });
    cur = applyAction(cur, { type: 'endTurn' });
    expect(cur.regions[target]?.hammers).toBe(0);
    expect(cur.players[0]?.active?.hammerPool).toBeGreaterThanOrEqual(1);
  });

  it('hammers are lost when the Dwarves decline (A30)', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'ironDwarves', 'stone', 0);
    const p = s.players[0];
    if (p?.active) p.active.hammerPool = 3;
    const entry = plainEntry(s);
    occupy(s, 0, entry, 2);
    setPhase(s, 'startTurn');
    const cur = applyAction(s, { type: 'decline' });
    expect(cur.players[0]?.declined?.race).toBe('ironDwarves');
    // No active race left holding hammers.
    expect(cur.players[0]?.active).toBeNull();
  });
});

describe('Kraken', () => {
  it('keep river regions, score them even In Decline, and block passage', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'kraken', 'stone', 8);
    const river = byTerrain(s, 'river');
    occupy(s, 0, river[0] as number, 2);
    setPhase(s, 'conquest');
    let cur = applyAction(s, { type: 'endConquest' });
    // River NOT force-emptied for kraken: their garrison stays put.
    expect(cur.regions[river[0] as number]?.owner).toBe(0);
    expect(cur.regions[river[0] as number]?.tokens).toBe(2);
    const hand = cur.players[0]?.active?.hand ?? 0;
    if (hand > 0)
      cur = applyAction(cur, { type: 'deploy', region: river[0] as number, count: hand });
    cur = applyAction(cur, { type: 'endTurn' });
    const coins = cur.players[0]?.coins ?? 0;
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(coins + 1);

    // In decline: still scores.
    setPhase(cur, 'startTurn');
    let dec = applyAction(cur, { type: 'decline' });
    const coins2 = dec.players[0]?.coins ?? 0;
    dec = applyAction(dec, { type: 'finishTurn' });
    expect(dec.players[0]?.coins).toBe(coins2 + 1);
  });
});

describe('Liches', () => {
  it('tax conquests of In-Decline Liches regions; broke attackers are locked out (A25)', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveDeclined(s, 1, 'liches', null);
    const entry = plainEntry(s);
    occupy(s, 1, entry, 1, { inDecline: true });
    setPhase(s, 'conquest');
    const coins0 = s.players[0]?.coins ?? 0;
    const coins1 = s.players[1]?.coins ?? 0;
    const cur = conquer(s, entry);
    expect(cur.players[0]?.coins).toBe(coins0 - 1);
    expect(cur.players[1]?.coins).toBe(coins1 + 1);

    const broke = fresh(2, 13);
    giveActive(broke, 0, 'ogres', 'stone', 8);
    giveDeclined(broke, 1, 'liches', null);
    occupy(broke, 1, entry, 1, { inDecline: true });
    const bp = broke.players[0];
    if (bp) bp.coins = 0;
    setPhase(broke, 'conquest');
    expectNotLegal(
      broke,
      (a) => (a.type === 'conquer' || a.type === 'finalConquest') && a.region === entry,
    );
  });
});

describe('Lizardmen', () => {
  it('treat unoccupied river chains as transparent; occupied river blocks (A17)', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'lizardmen', 'stone', 10);
    giveActive(s, 1, 'kraken', 'mystic', 4);
    const map = getMap(s);
    const rivers = byTerrain(s, 'river');
    // Occupy a land region bordering the river.
    const coastal = map.regions.find(
      (r) =>
        r.terrain !== 'river' &&
        r.terrain !== 'chasm' &&
        (s.regions[r.id]?.monsters ?? 0) === 0 &&
        neighborsOf(s, r.id).some((n) => rivers.includes(n)),
    ) as { id: number };
    occupy(s, 0, coastal.id, 1);
    const reach = computeReach(s, 0);
    // Some region NOT plainly adjacent must be reachable via the river.
    const extendedOnly = [...reach.extended].filter((r) => !reach.plain.has(r));
    expect(extendedOnly.length).toBeGreaterThan(0);

    // A Kraken sitting on the touching river region cuts the chain there.
    const touchingRiver = neighborsOf(s, coastal.id).find((n) => rivers.includes(n)) as number;
    occupy(s, 1, touchingRiver, 2);
    const reach2 = computeReach(s, 0);
    // The occupied river region itself is attackable, but nothing beyond it
    // unless another river touches our land.
    expect(reach2.plain.has(touchingRiver)).toBe(true);
    expect([...reach2.extended].filter((r) => !reach2.plain.has(r)).length).toBeLessThan(
      extendedOnly.length,
    );
  });
});

describe('Mudmen', () => {
  it('gain a token per Mudpool at redeploy, limited by the tray', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'mudmen', 'stone', 4);
    const muds = byTerrain(s, 'mud').filter((r) => (s.regions[r]?.monsters ?? 0) === 0);
    occupy(s, 0, muds[0] as number, 1);
    occupy(s, 0, muds[1] as number, 1);
    setPhase(s, 'conquest');
    const hand = s.players[0]?.active?.hand ?? 0;
    const cur = applyAction(s, { type: 'endConquest' });
    expect(cur.players[0]?.active?.hand).toBe(hand + 2);
  });
});

describe('Mummies & Ogres', () => {
  it('Mummies pay +1, Ogres pay -1 (min 1)', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'mummies', 'stone', 12);
    const entry = plainEntry(s);
    expect(conquestCost(s, 0, entry, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(3);
    const o = fresh(2, 13);
    giveActive(o, 0, 'ogres', 'stone', 8);
    expect(conquestCost(o, 0, entry, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(1);
  });
});

describe('Shrooms', () => {
  it('score +1 per Mushroom Forest region', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'shrooms', 'stone', 6);
    const shroomland = byTerrain(s, 'mushroom').filter(
      (r) => (s.regions[r]?.monsters ?? 0) === 0,
    );
    occupy(s, 0, shroomland[0] as number, 1);
    const mud = byTerrain(s, 'mud').find(
      (r) => (s.regions[r]?.monsters ?? 0) === 0 && (s.regions[r]?.tokens ?? 0) === 0,
    );
    if (mud === undefined) throw new Error('no free mud region');
    occupy(s, 0, mud, 1);
    setPhase(s, 'endOfTurn');
    const coins = s.players[0]?.coins ?? 0;
    const cur = applyAction(s, { type: 'finishTurn' });
    // 2 regions base + 1 shroom bonus (mushroom region only).
    expect(cur.players[0]?.coins).toBe(coins + 2 + 1);
  });
});

describe('Spiderines', () => {
  it('treat chasm-border regions as adjacent, including for first conquest', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'spiderines', 'stone', 10);
    setPhase(s, 'conquest');
    const map = getMap(s);
    const chasmBorder = new Set<number>();
    for (const r of map.regions) {
      if (r.terrain === 'chasm') {
        for (const n of neighborsOf(s, r.id)) {
          if (map.regions[n]?.terrain !== 'chasm') chasmBorder.add(n);
        }
      }
    }
    // A non-edge chasm-border region must be a legal first conquest.
    const inner = [...chasmBorder].find((r) => !map.regions[r]?.isEdge);
    if (inner === undefined) throw new Error('need inner chasm border');
    expectLegal(
      s,
      (a) => (a.type === 'conquer' || a.type === 'finalConquest') && a.region === inner,
    );
  });
});

describe("Will-o'-Wisps", () => {
  it('may roll the die before conquests near their crystals (A27/A28)', () => {
    const s = fresh(2, 13);
    giveActive(s, 0, 'willOWisps', 'stone', 6);
    const crystals = byTerrain(s, 'crystal').filter((r) => (s.regions[r]?.monsters ?? 0) === 0);
    occupy(s, 0, crystals[0] as number, 1);
    setPhase(s, 'conquest');
    const wisps = getLegalActions(s).filter(
      (a): a is Action & { region: number } => a.type === 'wispConquer',
    );
    expect(wisps.length).toBeGreaterThan(0);
    const map = getMap(s);
    for (const a of wisps) {
      const nearCrystal =
        map.regions[a.region]?.terrain === 'crystal' ||
        neighborsOf(s, a.region).includes(crystals[0] as number);
      expect(nearCrystal).toBe(true);
    }
    const target = wisps[0] as Action & { region: number };
    const cost = conquestCost(s, 0, target.region, { ...NO_BOOSTS, flamesAsEmpty: false });
    const cur = applyAction(s, target);
    const r = cur.regions[target.region];
    if (r?.owner === 0) {
      // Deployed max(1, cost - roll) tokens.
      expect(r.tokens).toBeGreaterThanOrEqual(1);
      expect(r.tokens).toBeLessThanOrEqual(cost);
      expect(cur.phase).toBe('conquest');
    } else {
      // Failed roll ends the conquest phase (A28).
      expect(cur.phase).toBe('redeploy');
    }
  });
});
void clearMonsters;
