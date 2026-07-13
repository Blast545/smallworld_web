import { describe, expect, it } from 'vitest';
import { applyAction } from '../../engine/actions';
import { conquestCost, findFigureRegion, NO_BOOSTS } from '../../engine/queries';
import { getMap } from '../../engine/setup';
import type { GameState } from '../../engine/types';
import {
  byTerrain,
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

function freeNeighbor(s: GameState, region: number, exclude: number[] = []): number {
  const map = getMap(s);
  const n = neighborsOf(s, region).find(
    (x) =>
      map.regions[x]?.terrain !== 'chasm' &&
      map.regions[x]?.terrain !== 'river' &&
      (s.regions[x]?.monsters ?? 0) === 0 &&
      (s.regions[x]?.tokens ?? 0) === 0 &&
      !exclude.includes(x),
  );
  if (n === undefined) throw new Error('no free neighbor');
  return n;
}

function freeRegion(s: GameState, exclude: number[] = []): number {
  const map = getMap(s);
  const r = map.regions.find(
    (x) =>
      x.terrain !== 'chasm' &&
      x.terrain !== 'river' &&
      (s.regions[x.id]?.monsters ?? 0) === 0 &&
      (s.regions[x.id]?.tokens ?? 0) === 0 &&
      !exclude.includes(x.id),
  );
  if (!r) throw new Error('no free region');
  return r.id;
}

function scoreDelta(s: GameState): number {
  const before = s.players[s.activePlayer]?.coins ?? 0;
  const after = applyAction(s, { type: 'finishTurn' });
  return (after.players[s.activePlayer]?.coins ?? 0) - before;
}

describe('scoring powers', () => {
  it('Adventurous: +1 per occupied region with a Popular Place', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'adventurous', 4);
    const r = freeRegion(s);
    occupy(s, 0, r, 1);
    s.regions[r]?.markers.push('keepOnMotherland');
    setPhase(s, 'endOfTurn');
    // base 1 + adventurous 1 + keep 1
    expect(scoreDelta(s)).toBe(3);
  });

  it('Fisher: +1 per complete pair of coastal regions', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'fisher', 6);
    const map = getMap(s);
    const rivers = byTerrain(s, 'river');
    const coastal = map.regions
      .filter(
        (r) =>
          r.terrain !== 'river' &&
          r.terrain !== 'chasm' &&
          (s.regions[r.id]?.monsters ?? 0) === 0 &&
          neighborsOf(s, r.id).some((n) => rivers.includes(n)),
      )
      .map((r) => r.id);
    occupy(s, 0, coastal[0] as number, 1);
    occupy(s, 0, coastal[1] as number, 1);
    occupy(s, 0, coastal[2] as number, 1);
    setPhase(s, 'endOfTurn');
    // 3 base + floor(3/2) = 1
    expect(scoreDelta(s)).toBe(4);
  });

  it('Flocking: +2 when all regions form one connected set', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'flocking', 6);
    const a = freeRegion(s);
    const b = freeNeighbor(s, a);
    occupy(s, 0, a, 1);
    occupy(s, 0, b, 1);
    setPhase(s, 'endOfTurn');
    expect(scoreDelta(s)).toBe(4); // 2 base + 2 flocking

    const split = fresh(2, 21);
    giveActive(split, 0, 'ogres', 'flocking', 6);
    const x = freeRegion(split);
    const y = freeRegion(split, [x, ...neighborsOf(split, x)]);
    occupy(split, 0, x, 1);
    occupy(split, 0, y, 1);
    setPhase(split, 'endOfTurn');
    expect(scoreDelta(split)).toBe(2); // no bonus
  });

  it('Frightened: +1 per region with at least 3 tokens', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'frightened', 2);
    const a = freeRegion(s);
    const b = freeRegion(s, [a]);
    occupy(s, 0, a, 3);
    occupy(s, 0, b, 2);
    setPhase(s, 'endOfTurn');
    expect(scoreDelta(s)).toBe(3); // 2 base + 1
  });

  it('Mining/Mystic/Stone/Muddy terrain bonuses; Muddy persists In Decline', () => {
    for (const [power, terrain] of [
      ['mining', 'mine'],
      ['mystic', 'crystal'],
      ['stone', 'blackMountain'],
      ['muddy', 'mud'],
    ] as const) {
      const s = fresh(2, 21);
      giveActive(s, 0, 'ogres', power, 6);
      const rid = byTerrain(s, terrain).find(
        (r) => (s.regions[r]?.monsters ?? 0) === 0 && (s.regions[r]?.tokens ?? 0) === 0,
      );
      if (rid === undefined) throw new Error(`no free ${terrain}`);
      occupy(s, 0, rid, 1);
      setPhase(s, 'endOfTurn');
      expect(scoreDelta(s), power).toBe(2);
    }
    // Muddy In Decline.
    const s = fresh(2, 21);
    giveDeclined(s, 0, 'ogres', 'muddy');
    const rid = byTerrain(s, 'mud').find((r) => (s.regions[r]?.monsters ?? 0) === 0);
    if (rid === undefined) throw new Error('no free mud');
    occupy(s, 0, rid, 1, { inDecline: true });
    setPhase(s, 'endOfTurn');
    expect(scoreDelta(s)).toBe(2);
  });

  it('Quarreling: +1 per separate group', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'quarreling', 6);
    const x = freeRegion(s);
    const y = freeRegion(s, [x, ...neighborsOf(s, x)]);
    occupy(s, 0, x, 1);
    occupy(s, 0, y, 1);
    setPhase(s, 'endOfTurn');
    expect(scoreDelta(s)).toBe(4); // 2 base + 2 groups
  });

  it('Thieving: takes 1 coin from each bordering opponent, capped by their purse', () => {
    const s = fresh(3, 21);
    giveActive(s, 0, 'ogres', 'thieving', 6);
    giveActive(s, 1, 'gnomes', 'mystic', 4);
    giveActive(s, 2, 'liches', 'mining', 4);
    const mine = freeRegion(s);
    occupy(s, 0, mine, 1);
    const n1 = freeNeighbor(s, mine);
    occupy(s, 1, n1, 1);
    const n2 = freeNeighbor(s, mine, [n1]);
    occupy(s, 2, n2, 1);
    const p2 = s.players[2];
    if (p2) p2.coins = 0; // broke: pays nothing
    setPhase(s, 'endOfTurn');
    const before1 = s.players[1]?.coins ?? 0;
    const after = applyAction(s, { type: 'finishTurn' });
    expect(after.players[1]?.coins).toBe(before1 - 1);
    expect(after.players[2]?.coins).toBe(0);
    expect(after.players[0]?.coins).toBe(5 + 1 /* base */ + 1 /* stolen */);
  });
});

describe('conquest powers', () => {
  it('Vampire: once per turn per opponent, single active tokens only, token to tray', () => {
    const s = fresh(3, 21);
    giveActive(s, 0, 'ogres', 'vampire', 6);
    giveActive(s, 1, 'gnomes', 'mystic', 4); // gnomes protected — use liches for target
    giveActive(s, 2, 'liches', 'mining', 6);
    const base = freeRegion(s);
    occupy(s, 0, base, 2);
    const t1 = freeNeighbor(s, base);
    occupy(s, 2, t1, 1);
    const t2 = freeNeighbor(s, base, [t1]);
    occupy(s, 2, t2, 1);
    setPhase(s, 'conquest');
    const trayLiches = s.tray.liches;
    const trayOgres = s.tray.ogres;
    const cur = applyAction(s, { type: 'vampirize', region: t1 });
    expect(cur.regions[t1]?.race).toBe('ogres');
    expect(cur.regions[t1]?.tokens).toBe(1);
    expect(cur.tray.liches).toBe(trayLiches + 1);
    expect(cur.tray.ogres).toBe(trayOgres - 1); // bonus token from tray
    expect(cur.players[0]?.active?.hand).toBe(6); // hand untouched
    // Second vampirize against the same opponent this turn: illegal.
    expectNotLegal(cur, (a) => a.type === 'vampirize' && a.region === t2);
  });

  it('Vampire needs the target to be a single token', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'vampire', 6);
    giveActive(s, 1, 'liches', 'mining', 6);
    const base = freeRegion(s);
    occupy(s, 0, base, 2);
    const t1 = freeNeighbor(s, base);
    occupy(s, 1, t1, 2);
    setPhase(s, 'conquest');
    expectNotLegal(s, (a) => a.type === 'vampirize' && a.region === t1);
  });

  it('Immortal: no token lost when conquered; survivors redeploy', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'liches', 'immortal', 6);
    const entry = plainEntry(s);
    occupy(s, 1, entry, 2);
    const home = freeRegion(s, [entry, ...neighborsOf(s, entry)]);
    occupy(s, 1, home, 1);
    const tray = s.tray.liches;
    setPhase(s, 'conquest');
    const cur = conquer(s, entry);
    expect(cur.tray.liches).toBe(tray); // nothing discarded
    expect(cur.pendingDefenders).toEqual([{ player: 1, tokens: 2, inDecline: false }]);
  });

  it('Immortal token lost to vampirization', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'vampire', 6);
    giveActive(s, 1, 'liches', 'immortal', 6);
    const base = freeRegion(s);
    occupy(s, 0, base, 2);
    const t = freeNeighbor(s, base);
    occupy(s, 1, t, 1);
    const tray = s.tray.liches;
    setPhase(s, 'conquest');
    const cur = applyAction(s, { type: 'vampirize', region: t });
    expect(cur.tray.liches).toBe(tray + 1);
    expect(cur.pendingDefenders).toHaveLength(0);
  });

  it('Martyr: +1 coin per region conquered by an opponent', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'liches', 'martyr', 6);
    const entry = plainEntry(s);
    occupy(s, 1, entry, 1);
    const coins = s.players[1]?.coins ?? 0;
    setPhase(s, 'conquest');
    const cur = conquer(s, entry);
    expect(cur.players[1]?.coins).toBe(coins + 1);
  });

  it('Vengeful: marker on being attacked, -1 next turn against the attacker', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'liches', 'vengeful', 6);
    const entry = plainEntry(s);
    occupy(s, 1, entry, 1);
    const home = freeRegion(s, [entry, ...neighborsOf(s, entry)]);
    occupy(s, 1, home, 2);
    setPhase(s, 'conquest');
    const cur = conquer(s, entry);
    expect(cur.players[1]?.vengeanceMarks).toEqual([0]);
    // Vengeful player attacks an ogre region at -1.
    setPhase(cur, 'conquest', 1);
    const ogreRegion = entry;
    const cost = conquestCost(cur, 1, ogreRegion, { ...NO_BOOSTS, flamesAsEmpty: false });
    // base 2 + 2 ogre tokens - 1 vengeance = 3
    expect(cost).toBe(2 + (cur.regions[ogreRegion]?.tokens ?? 0) - 1);
    // Markers are recovered at the end of the vengeful player's turn.
    setPhase(cur, 'endOfTurn', 1);
    const done = applyAction(cur, { type: 'finishTurn' });
    expect(done.players[1]?.vengeanceMarks).toEqual([]);
  });

  it('Shield: armors gained per mushroom region, +1 defense, discarded on conquest', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'shield', 2);
    giveActive(s, 1, 'liches', 'stone', 8);
    const shroom = byTerrain(s, 'mushroom').find(
      (r) => (s.regions[r]?.monsters ?? 0) === 0 && (s.regions[r]?.tokens ?? 0) === 0,
    );
    if (shroom === undefined) throw new Error('no free mushroom');
    occupy(s, 0, shroom, 1);
    setPhase(s, 'conquest');
    let cur = applyAction(s, { type: 'endConquest' });
    expect(cur.players[0]?.armorHand).toBe(1);
    expectLegal(cur, (a) => a.type === 'deployArmor');
    cur = applyAction(cur, { type: 'deployArmor', region: shroom });
    expect(cur.regions[shroom]?.armors).toBe(1);
    const hand = cur.players[0]?.active?.hand ?? 0;
    if (hand > 0) cur = applyAction(cur, { type: 'deploy', region: shroom, count: hand });
    cur = applyAction(cur, { type: 'endTurn' });
    // Armor adds +1 defense for the attacker.
    const cost = conquestCost(cur, 1, shroom, { ...NO_BOOSTS, flamesAsEmpty: false });
    expect(cost).toBe(2 + (cur.regions[shroom]?.tokens ?? 0) + 1);
    // Conquering discards the armor.
    setPhase(cur, 'conquest', 1);
    const after = conquer(cur, shroom);
    expect(after.regions[shroom]?.armors).toBe(0);
  });

  it('Reborn: replaces 1-2 declined regions with single active tokens at turn start', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'stone', 4);
    giveDeclined(s, 0, 'liches', 'reborn');
    const a = freeRegion(s);
    const b = freeRegion(s, [a]);
    const c = freeRegion(s, [a, b]);
    occupy(s, 0, a, 1, { inDecline: true });
    occupy(s, 0, b, 1, { inDecline: true });
    occupy(s, 0, c, 1, { inDecline: true });
    setPhase(s, 'startTurn');
    const trayLiches = s.tray.liches;
    const trayOgres = s.tray.ogres;
    let cur = applyAction(s, { type: 'rebornReplace', region: a });
    expect(cur.regions[a]?.race).toBe('ogres');
    expect(cur.regions[a]?.inDecline).toBe(false);
    expect(cur.tray.liches).toBe(trayLiches + 1);
    expect(cur.tray.ogres).toBe(trayOgres - 1);
    cur = applyAction(cur, { type: 'rebornReplace', region: b });
    // Third use this turn is not offered.
    expectNotLegal(cur, (a2) => a2.type === 'rebornReplace');
  });

  it('Royal: queen placement makes the region immune; frozen after decline', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'royal', 6);
    giveActive(s, 1, 'liches', 'stone', 8);
    const home = plainEntry(s);
    occupy(s, 0, home, 2);
    setPhase(s, 'endOfTurn');
    let cur = applyAction(s, { type: 'placeQueen', region: home });
    expect(findFigureRegion(cur, 'queen')).toBe(home);
    // Opponent cannot conquer it.
    setPhase(cur, 'conquest', 1);
    expectNotLegal(
      cur,
      (a) => (a.type === 'conquer' || a.type === 'finalConquest') && a.region === home,
    );
    // After decline the queen stays and cannot be re-placed.
    setPhase(cur, 'startTurn', 0);
    cur = applyAction(cur, { type: 'decline' });
    expect(findFigureRegion(cur, 'queen')).toBe(home);
    expectNotLegal(cur, (a) => a.type === 'placeQueen');
  });

  it('Tomb: conquered tomb regions lose 1 and redeploy the rest into tomb regions', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'stone', 10);
    giveDeclined(s, 1, 'liches', 'tomb');
    const entry = plainEntry(s);
    occupy(s, 1, entry, 3, { inDecline: true });
    const other = freeRegion(s, [entry, ...neighborsOf(s, entry)]);
    occupy(s, 1, other, 2, { inDecline: true });
    const tray = s.tray.liches;
    setPhase(s, 'conquest');
    let cur = conquer(s, entry);
    expect(cur.tray.liches).toBe(tray + 1);
    expect(cur.pendingDefenders).toEqual([{ player: 1, tokens: 2, inDecline: true }]);
    cur = applyAction(cur, { type: 'endConquest' });
    const hand = cur.players[0]?.active?.hand ?? 0;
    if (hand > 0) cur = applyAction(cur, { type: 'deploy', region: entry, count: hand });
    cur = applyAction(cur, { type: 'endTurn' });
    cur = applyAction(cur, { type: 'finishTurn' });
    // Auto-redeployed into the single remaining tomb region.
    expect(cur.regions[other]?.tokens).toBe(4);
  });

  it('Tomb tokens with no regions left are permanently lost (A33)', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'stone', 10);
    giveDeclined(s, 1, 'liches', 'tomb');
    const entry = plainEntry(s);
    occupy(s, 1, entry, 3, { inDecline: true });
    const tray = s.tray.liches;
    setPhase(s, 'conquest');
    let cur = conquer(s, entry);
    cur = applyAction(cur, { type: 'endConquest' });
    const hand = cur.players[0]?.active?.hand ?? 0;
    if (hand > 0) cur = applyAction(cur, { type: 'deploy', region: entry, count: hand });
    cur = applyAction(cur, { type: 'endTurn' });
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.tray.liches).toBe(tray + 3);
    expect(cur.players[1]?.declined).toBeNull();
  });

  it('Magic: the Bag duplicates a relic in play and returns to hand when its region falls', () => {
    const s = fresh(2, 21);
    giveActive(s, 0, 'ogres', 'magic', 8);
    giveActive(s, 1, 'liches', 'stone', 8);
    // Sword is in play somewhere on the board (owned by the opponent even).
    const swordHome = plainEntry(s);
    occupy(s, 1, swordHome, 1);
    s.regions[swordHome]?.markers.push('swordOfKillerRabbit');
    s.bagLocation = 'hand';
    const base = freeNeighbor(s, swordHome);
    occupy(s, 0, base, 2);
    setPhase(s, 'conquest');
    // Bag-as-sword reduces cost by 2 (min 1): base 2 + 1 token - 1 ogre - 2 = min 1.
    const action = expectLegal(
      s,
      (a) => a.type === 'conquer' && a.region === swordHome && a.bagAs === 'swordOfKillerRabbit',
    );
    const cur = applyAction(s, action);
    expect(cur.regions[swordHome]?.race).toBe('ogres');
    expect(cur.bagLocation).toBe(swordHome);
    expect(cur.turnFlags.bagUsedAs).toBe('swordOfKillerRabbit');
    // Opponent takes the bag region: bag returns to hand, not captured.
    setPhase(cur, 'conquest', 1);
    const p1 = cur.players[1];
    if (p1?.active) p1.active.hand = 8;
    const back = conquer(cur, swordHome);
    expect(back.bagLocation).toBe('hand');
  });
});
