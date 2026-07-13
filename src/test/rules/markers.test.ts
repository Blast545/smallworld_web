import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from '../../engine/actions';
import { conquestCost, findFigureRegion, findMarkerRegion, NO_BOOSTS } from '../../engine/queries';
import { getMap } from '../../engine/setup';
import type { Action, GameState } from '../../engine/types';
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

function farFreeRegion(s: GameState, from: number): number {
  return freeRegion(s, [from, ...neighborsOf(s, from)]);
}

describe('Flying Doormat', () => {
  it('allows one non-adjacent conquest per turn and moves on success', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'stone', 8);
    const home = plainEntry(s);
    occupy(s, 0, home, 1);
    s.regions[home]?.markers.push('flyingDoormat');
    const far = farFreeRegion(s, home);
    setPhase(s, 'conquest');
    const action = expectLegal(
      s,
      (a) => a.type === 'conquer' && a.region === far && a.useDoormat === true,
    );
    const cur = applyAction(s, action);
    expect(cur.regions[far]?.owner).toBe(0);
    expect(findMarkerRegion(cur, 'flyingDoormat')).toBe(far);
    // Only once per turn.
    expectNotLegal(cur, (a) => a.type === 'conquer' && a.useDoormat === true);
  });
});

describe("Stinky Troll's Socks", () => {
  it('conquers as if empty; the whole garrison redeploys with no loss', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'liches', 'mystic', 4);
    const home = plainEntry(s);
    occupy(s, 0, home, 1);
    s.regions[home]?.markers.push('stinkyTrollsSocks');
    const target = freeNeighbor(s, home);
    occupy(s, 1, target, 4);
    const other = farFreeRegion(s, target);
    occupy(s, 1, other, 1);
    const tray = s.tray.liches;
    setPhase(s, 'conquest');
    const action = expectLegal(
      s,
      (a) => a.type === 'conquer' && a.region === target && a.useSocks === true,
    );
    const cost = conquestCost(s, 0, target, {
      useSword: false,
      useSocks: true,
      useDoormat: false,
      bagAs: null,
      flamesAsEmpty: false,
    });
    expect(cost).toBe(1); // base 2, -1 ogres, tokens ignored
    const cur = applyAction(s, action);
    expect(cur.tray.liches).toBe(tray); // no token lost
    expect(cur.pendingDefenders).toEqual([{ player: 1, tokens: 4, inDecline: false }]);
    expect(findMarkerRegion(cur, 'stinkyTrollsSocks')).toBe(target);
  });
});

describe('Sword of the Killer Rabbit', () => {
  it('reduces one conquest by 2 (min 1) once per turn', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'mummies', 'stone', 12);
    const home = plainEntry(s);
    occupy(s, 0, home, 1);
    s.regions[home]?.markers.push('swordOfKillerRabbit');
    const target = freeNeighbor(s, home);
    const plainCost = conquestCost(s, 0, target, { ...NO_BOOSTS, flamesAsEmpty: false });
    const swordCost = conquestCost(s, 0, target, {
      useSword: true,
      useSocks: false,
      useDoormat: false,
      bagAs: null,
      flamesAsEmpty: false,
    });
    expect(swordCost).toBe(Math.max(1, plainCost - 2));
    setPhase(s, 'conquest');
    const action = expectLegal(
      s,
      (a) => a.type === 'conquer' && a.region === target && a.useSword === true,
    );
    const cur = applyAction(s, action);
    expect(findMarkerRegion(cur, 'swordOfKillerRabbit')).toBe(target);
    expectNotLegal(cur, (a) => a.type === 'conquer' && a.useSword === true);
  });
});

describe('Shiny Orb', () => {
  it('substitutes a single active opponent token once per turn', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'stone', 8);
    giveActive(s, 1, 'liches', 'mystic', 6);
    const home = plainEntry(s);
    occupy(s, 0, home, 2);
    s.regions[home]?.markers.push('shinyOrb');
    const target = freeNeighbor(s, home);
    occupy(s, 1, target, 1);
    setPhase(s, 'conquest');
    const cur = applyAction(s, { type: 'orbConquer', region: target, viaBag: false });
    expect(cur.regions[target]?.race).toBe('ogres');
    expect(cur.regions[target]?.tokens).toBe(1);
    expect(findMarkerRegion(cur, 'shinyOrb')).toBe(target);
    expectNotLegal(cur, (a) => a.type === 'orbConquer');
  });
});

describe('Scepter of Avarice', () => {
  it('doubles the placed region bank coins; not player transfers; not the Mine', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'mystic', 6);
    const crystal = byTerrain(s, 'crystal').find(
      (r) => (s.regions[r]?.monsters ?? 0) === 0 && (s.regions[r]?.tokens ?? 0) === 0,
    );
    if (crystal === undefined) throw new Error('no free crystal');
    occupy(s, 0, crystal, 1);
    s.regions[crystal]?.markers.push('scepterOfAvarice');
    setPhase(s, 'endOfTurn');
    let cur = applyAction(s, { type: 'placeScepter', region: crystal, viaBag: false });
    const coins = cur.players[0]?.coins ?? 0;
    cur = applyAction(cur, { type: 'finishTurn' });
    // (1 base + 1 mystic) x2 = 4
    expect(cur.players[0]?.coins).toBe(coins + 4);

    // No effect in the Mine of the Lost Dwarf region.
    const m = fresh(2, 33);
    giveActive(m, 0, 'ogres', 'mystic', 6);
    const r = freeRegion(m);
    occupy(m, 0, r, 1);
    m.regions[r]?.markers.push('scepterOfAvarice', 'mineOfLostDwarf');
    setPhase(m, 'endOfTurn');
    let mc = applyAction(m, { type: 'placeScepter', region: r, viaBag: false });
    const mcoins = mc.players[0]?.coins ?? 0;
    mc = applyAction(mc, { type: 'finishTurn' });
    // 1 base (NOT doubled) + 2 mine of the lost dwarf
    expect(mc.players[0]?.coins).toBe(mcoins + 3);
  });
});

describe("Froggy's Ring", () => {
  it('collects 1 coin from each player with an active token bordering the ring', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'mystic', 6);
    giveActive(s, 1, 'liches', 'stone', 6);
    const home = plainEntry(s);
    occupy(s, 0, home, 1);
    s.regions[home]?.markers.push('froggysRing');
    occupy(s, 1, freeNeighbor(s, home), 1);
    setPhase(s, 'endOfTurn');
    let cur = applyAction(s, { type: 'placeRing', region: home, viaBag: false });
    const c0 = cur.players[0]?.coins ?? 0;
    const c1 = cur.players[1]?.coins ?? 0;
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(c0 + 1 /* base */ + 1 /* ring */);
    expect(cur.players[1]?.coins).toBe(c1 - 1);
  });
});

describe('Altar of Souls', () => {
  it('discards one In-Decline token for +3, works while In Decline', () => {
    const s = fresh(2, 33);
    giveDeclined(s, 0, 'liches', null);
    const altarRegion = freeRegion(s);
    occupy(s, 0, altarRegion, 2, { inDecline: true });
    s.regions[altarRegion]?.markers.push('altarOfSouls');
    setPhase(s, 'endOfTurn');
    const tray = s.tray.liches;
    let cur = applyAction(s, { type: 'altarDiscard', region: altarRegion });
    expect(cur.regions[altarRegion]?.tokens).toBe(1);
    expect(cur.tray.liches).toBe(tray + 1);
    const coins = cur.players[0]?.coins ?? 0;
    cur = applyAction(cur, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(coins + 1 /* base */ + 3 /* altar */);
  });
});

describe('Crypt of the Tomb-raider', () => {
  it('places the Ghost anywhere but the Crypt; region becomes immune; falls with the Crypt', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'mystic', 8);
    giveActive(s, 1, 'liches', 'stone', 10);
    const crypt = plainEntry(s);
    occupy(s, 0, crypt, 1);
    s.regions[crypt]?.markers.push('cryptOfTombRaider');
    const protectedRegion = freeRegion(s, [crypt]);
    occupy(s, 0, protectedRegion, 1);
    setPhase(s, 'endOfTurn');
    expectNotLegal(s, (a) => a.type === 'placeGhost' && a.region === crypt);
    const cur = applyAction(s, { type: 'placeGhost', region: protectedRegion });
    expect(findFigureRegion(cur, 'ghost')).toBe(protectedRegion);
    // Opponent cannot conquer the protected region...
    setPhase(cur, 'conquest', 1);
    expectNotLegal(
      cur,
      (a) => (a.type === 'conquer' || a.type === 'finalConquest') && a.region === protectedRegion,
    );
    // ...but conquering the Crypt frees the Ghost immediately.
    const after = conquer(cur, crypt);
    expect(findFigureRegion(after, 'ghost')).toBeNull();
  });
});

describe('Diamond Fields', () => {
  it('+1 for its region and each same-terrain region of the same race', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'frightened', 6);
    const muds = byTerrain(s, 'mud').filter(
      (r) => (s.regions[r]?.monsters ?? 0) === 0 && (s.regions[r]?.tokens ?? 0) === 0,
    );
    occupy(s, 0, muds[0] as number, 1);
    occupy(s, 0, muds[1] as number, 1);
    s.regions[muds[0] as number]?.markers.push('diamondFields');
    setPhase(s, 'endOfTurn');
    const coins = s.players[0]?.coins ?? 0;
    const cur = applyAction(s, { type: 'finishTurn' });
    // 2 base + 1 DF region + 1 same-terrain region
    expect(cur.players[0]?.coins).toBe(coins + 4);
  });
});

describe('Great Brass Pipe', () => {
  it('makes same-terrain regions adjacent for its controller (A56)', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'frightened', 8);
    const muds = byTerrain(s, 'mud').filter(
      (r) => (s.regions[r]?.monsters ?? 0) === 0 && (s.regions[r]?.tokens ?? 0) === 0,
    );
    const home = muds[0] as number;
    const far = muds.find((r) => !neighborsOf(s, home).includes(r) && r !== home);
    if (far === undefined) throw new Error('need distant same-terrain region');
    occupy(s, 0, home, 1);
    s.regions[home]?.markers.push('greatBrassPipe');
    setPhase(s, 'conquest');
    expectLegal(s, (a) => a.type === 'conquer' && a.region === far);
  });
});

describe('Fountain of Youth', () => {
  it('grants a bonus token at the start of the turn (A8), Active only (A9)', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'ogres', 'frightened', 2);
    giveActive(s, 1, 'liches', 'stone', 6);
    const home = freeRegion(s);
    occupy(s, 0, home, 1);
    s.regions[home]?.markers.push('fountainOfYouth');
    // Play out player 0's endOfTurn to hand the turn to player 1, then back.
    setPhase(s, 'endOfTurn', 1);
    // player 1 has no board presence; finishing turn 1 wraps to... simulate
    // directly: finish player 1's turn so player 0 begins a fresh turn.
    const cur = applyAction(s, { type: 'finishTurn' });
    expect(cur.activePlayer).toBe(0);
    expect(cur.players[0]?.active?.hand).toBe(3); // +1 from the fountain
  });
});

describe('Keep on the Motherland', () => {
  it('+1 coin and +1 defense, persisting In Decline', () => {
    const s = fresh(2, 33);
    giveDeclined(s, 0, 'liches', null);
    giveActive(s, 1, 'ogres', 'stone', 8);
    const keep = plainEntry(s);
    occupy(s, 0, keep, 1, { inDecline: true });
    s.regions[keep]?.markers.push('keepOnMotherland');
    // Defense: base 2 + 1 token + 1 keep - 1 ogre = 3.
    expect(conquestCost(s, 1, keep, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(3);
    // Scoring for the In-Decline occupant.
    setPhase(s, 'endOfTurn', 0);
    const coins = s.players[0]?.coins ?? 0;
    const cur = applyAction(s, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(coins + 1 /* base */ + 1 /* keep */);
  });
});

describe('Mine of the Lost Dwarf', () => {
  it('+2 at turn end, In Decline too', () => {
    const s = fresh(2, 33);
    giveDeclined(s, 0, 'liches', null);
    const r = freeRegion(s);
    occupy(s, 0, r, 1, { inDecline: true });
    s.regions[r]?.markers.push('mineOfLostDwarf');
    setPhase(s, 'endOfTurn');
    const coins = s.players[0]?.coins ?? 0;
    const cur = applyAction(s, { type: 'finishTurn' });
    expect(cur.players[0]?.coins).toBe(coins + 3);
  });
});

describe('Stonehedge', () => {
  it('draws a hidden power that benefits the current occupant (A50/A51)', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'mummies', 'frightened', 12);
    setPhase(s, 'conquest');
    // Force the top of the marker deck to be Stonehedge.
    const map = getMap(s);
    const target = map.regions.find((r) => r.isEdge && r.monsterSymbol);
    if (!target) throw new Error('need edge monster region');
    const deckIdx = s.markerDeck.indexOf('stonehedge');
    if (deckIdx === -1) s.markerDeck[0] = 'stonehedge';
    else {
      const tmp = s.markerDeck[0] as string;
      s.markerDeck[0] = 'stonehedge';
      s.markerDeck[deckIdx] = tmp as never;
    }
    const badgeCount = s.badgeStack.length;
    const cur = conquer(s, target.id);
    expect(cur.stonehedgePower).not.toBeNull();
    expect(cur.badgeStack.length).toBe(badgeCount - 1);
    // The visible stack-top badge was not the one drawn (A51).
    expect(cur.badgeStack[0]).toBe(s.badgeStack[0]);
  });
});

describe('Wickedest Pentacle', () => {
  it('sends the Balrog into a chosen neighbor: 2 tokens lost, region immune forever (A47/A48)', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'mummies', 'frightened', 12);
    giveActive(s, 1, 'liches', 'stone', 6);
    const map = getMap(s);
    const target = map.regions.find((r) => r.isEdge && r.monsterSymbol);
    if (!target) throw new Error('need edge monster region');
    const deckIdx = s.markerDeck.indexOf('wickedestPentacle');
    if (deckIdx === -1) s.markerDeck[0] = 'wickedestPentacle';
    else {
      const tmp = s.markerDeck[0] as string;
      s.markerDeck[0] = 'wickedestPentacle';
      s.markerDeck[deckIdx] = tmp as never;
    }
    // Put a liches garrison on a neighbor so the Balrog has a victim.
    const victim = freeNeighbor(s, target.id);
    occupy(s, 1, victim, 3);
    const tray = s.tray.liches;
    setPhase(s, 'conquest');
    let cur = conquer(s, target.id);
    expect(cur.phase).toBe('balrogPlace');
    const options = getLegalActions(cur).filter(
      (a): a is Action & { region: number } => a.type === 'placeBalrog',
    );
    expect(options.some((a) => a.region === victim)).toBe(true);
    cur = applyAction(cur, { type: 'placeBalrog', region: victim });
    expect(cur.tray.liches).toBe(tray + 2);
    expect(cur.pendingDefenders).toEqual([{ player: 1, tokens: 1, inDecline: false }]);
    expect(cur.regions[victim]?.figures.some((f) => f.kind === 'balrog')).toBe(true);
    expect(cur.regions[victim]?.owner).toBeNull();
    expect(cur.phase).toBe('conquest');
    // Immune to everyone, forever.
    expectNotLegal(
      cur,
      (a) => (a.type === 'conquer' || a.type === 'finalConquest') && a.region === victim,
    );
  });
});

describe('general marker rules', () => {
  it('markers never add defense (Keep excepted) and stay behind on abandon', () => {
    const s = fresh(2, 33);
    giveActive(s, 0, 'liches', 'frightened', 6);
    const r = plainEntry(s);
    occupy(s, 0, r, 2);
    s.regions[r]?.markers.push('diamondFields', 'shinyOrb');
    // Defense unchanged by the markers: 2 base + 2 tokens.
    giveActive(s, 1, 'ogres', 'stone', 8);
    expect(conquestCost(s, 1, r, { ...NO_BOOSTS, flamesAsEmpty: false })).toBe(3); // -1 ogre
    // Abandon leaves them in place.
    setPhase(s, 'startTurn', 0);
    const cur = applyAction(s, { type: 'abandon', region: r });
    expect(cur.regions[r]?.markers).toEqual(['diamondFields', 'shinyOrb']);
  });
});
