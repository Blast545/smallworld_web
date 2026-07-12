// End-of-turn scoring (RULES §5), terminality and final scores.

import type { RaceId } from './data';
import type { GameMap } from './maps';
import { getMap } from './setup';
import {
  activeComponents,
  activeRegionIds,
  declinedRegionIds,
  findMarkerRegion,
  hasActivePower,
  hasDeclinedPower,
  tokensOnBoard,
} from './queries';
import type { GameState, RegionState, Scores } from './types';

export interface ScoreLine {
  label: string;
  amount: number; // bank coins (positive) — transfers are separate
}

export interface TurnScore {
  /** Bank coins attributable to a specific region (Scepter doubles these). */
  regionCoins: Map<number, number>;
  /** Bank coins not tied to one region (never doubled, A45). */
  setLines: ScoreLine[];
  /** Coins taken from other players: player index -> amount. */
  transfers: Map<number, number>;
}

function addRegion(t: TurnScore, region: number, amount: number): void {
  t.regionCoins.set(region, (t.regionCoins.get(region) ?? 0) + amount);
}

/** Compute the active player's end-of-turn scoring. Pure. */
export function computeTurnScore(state: GameState, player: number): TurnScore {
  const map = getMap(state);
  const t: TurnScore = { regionCoins: new Map(), setLines: [], transfers: new Map() };
  const p = state.players[player];
  if (!p) throw new Error('bad player');
  const active = p.active;
  const activeIds = activeRegionIds(state, player);
  const declinedIds = declinedRegionIds(state, player);

  // Base: 1 per occupied region (active + declined).
  for (const rid of activeIds) addRegion(t, rid, 1);
  for (const rid of declinedIds) addRegion(t, rid, 1);

  // Vanishing scored 2 per (now empty) region on the decline turn.
  if (state.turnFlags.vanishedRegions > 0) {
    t.setLines.push({
      label: 'Vanishing (2 per region)',
      amount: state.turnFlags.vanishedRegions * 2,
    });
  }

  const terrainOf = (rid: number): string =>
    (map.regions[rid] as GameMap['regions'][number]).terrain;

  // Race bonuses (active race only).
  if (active) {
    if (active.race === 'shrooms') {
      for (const rid of activeIds) if (terrainOf(rid) === 'mushroom') addRegion(t, rid, 1);
    }
    if (active.race === 'drow') {
      for (const rid of activeIds) {
        let lonely = true;
        for (const n of map.adjacency[rid] as number[]) {
          const nr = state.regions[n] as RegionState;
          const foreignTokens =
            nr.tokens > 0 && !(nr.owner === player && !nr.inDecline && nr.race === active.race);
          if (foreignTokens || nr.monsters > 0) {
            lonely = false;
            break;
          }
        }
        if (lonely) addRegion(t, rid, 1);
      }
    }
  }

  // Power bonuses.
  const powerRegions = (pred: (rid: number) => boolean): number[] => activeIds.filter(pred);
  if (hasActivePower(state, player, 'mining')) {
    for (const rid of powerRegions((r) => terrainOf(r) === 'mine')) addRegion(t, rid, 1);
  }
  if (hasActivePower(state, player, 'mystic')) {
    for (const rid of powerRegions((r) => terrainOf(r) === 'crystal')) addRegion(t, rid, 1);
  }
  if (hasActivePower(state, player, 'stone')) {
    for (const rid of powerRegions((r) => terrainOf(r) === 'blackMountain')) addRegion(t, rid, 1);
  }
  if (hasActivePower(state, player, 'muddy')) {
    for (const rid of powerRegions((r) => terrainOf(r) === 'mud')) addRegion(t, rid, 1);
  }
  // Muddy persists In Decline (A36).
  if (hasDeclinedPower(state, player, 'muddy')) {
    for (const rid of declinedIds) if (terrainOf(rid) === 'mud') addRegion(t, rid, 1);
  }
  if (hasActivePower(state, player, 'adventurous')) {
    for (const rid of activeIds) {
      const r = state.regions[rid] as RegionState;
      if (r.markers.some((m) => isPopularPlace(m))) addRegion(t, rid, 1);
    }
  }
  if (hasActivePower(state, player, 'frightened')) {
    for (const rid of activeIds) {
      if ((state.regions[rid] as RegionState).tokens >= 3) addRegion(t, rid, 1);
    }
  }
  if (hasActivePower(state, player, 'fisher')) {
    const coastal = activeIds.filter(
      (rid) =>
        terrainOf(rid) !== 'river' &&
        (map.adjacency[rid] as number[]).some((n) => terrainOf(n) === 'river'),
    );
    const pairs = Math.floor(coastal.length / 2);
    if (pairs > 0) t.setLines.push({ label: 'Fisher (coastal pairs)', amount: pairs });
  }
  if (hasActivePower(state, player, 'flocking')) {
    const comps = activeComponents(state, player);
    if (comps.length === 1 && activeIds.length > 0) {
      t.setLines.push({ label: 'Flocking (single group)', amount: 2 });
    }
  }
  if (hasActivePower(state, player, 'quarreling')) {
    const comps = activeComponents(state, player);
    if (comps.length > 0) {
      t.setLines.push({ label: `Quarreling (${comps.length} groups)`, amount: comps.length });
    }
  }
  if (hasDeclinedPower(state, player, 'wise') && declinedIds.length > 0) {
    t.setLines.push({ label: 'Wise (In Decline)', amount: 2 });
  }
  if (hasActivePower(state, player, 'thieving') && active) {
    const borderPlayers = new Set<number>();
    for (const rid of activeIds) {
      for (const n of map.adjacency[rid] as number[]) {
        const nr = state.regions[n] as RegionState;
        if (nr.owner !== null && nr.owner !== player && !nr.inDecline && nr.tokens > 0) {
          borderPlayers.add(nr.owner);
        }
      }
    }
    for (const other of borderPlayers) {
      const pay = Math.min(1, state.players[other]?.coins ?? 0);
      if (pay > 0) t.transfers.set(other, (t.transfers.get(other) ?? 0) + pay);
    }
  }

  // Places (controlled by occupancy, active or declined).
  const occupiedBy = (rid: number): boolean => {
    const r = state.regions[rid] as RegionState;
    return r.owner === player && r.tokens > 0;
  };
  const keep = findMarkerRegion(state, 'keepOnMotherland');
  if (keep !== null && occupiedBy(keep)) addRegion(t, keep, 1);
  const mine = findMarkerRegion(state, 'mineOfLostDwarf');
  if (mine !== null && occupiedBy(mine)) {
    t.setLines.push({ label: 'Mine of the Lost Dwarf', amount: 2 });
  }
  const df = findMarkerRegion(state, 'diamondFields');
  if (df !== null && occupiedBy(df)) {
    const dfRegion = state.regions[df] as RegionState;
    const dfTerrain = terrainOf(df);
    addRegion(t, df, 1);
    for (const rid of [...activeIds, ...declinedIds]) {
      if (rid === df) continue;
      const r = state.regions[rid] as RegionState;
      if (r.race === dfRegion.race && terrainOf(rid) === dfTerrain) addRegion(t, rid, 1);
    }
  }
  if (state.turnFlags.altarUsed) {
    t.setLines.push({ label: 'Altar of Souls', amount: 3 });
  }

  // Froggy's Ring (real and Bag-as-Ring placements this turn).
  for (const ringRegion of [state.turnFlags.ringRegion, state.turnFlags.bagRingRegion]) {
    if (ringRegion === null) continue;
    const payers = new Set<number>();
    for (const n of map.adjacency[ringRegion] as number[]) {
      const nr = state.regions[n] as RegionState;
      if (nr.owner !== null && nr.owner !== player && !nr.inDecline && nr.tokens > 0) {
        payers.add(nr.owner);
      }
    }
    for (const other of payers) {
      const already = t.transfers.get(other) ?? 0;
      const pay = Math.min(1, Math.max(0, (state.players[other]?.coins ?? 0) - already));
      if (pay > 0) t.transfers.set(other, already + pay);
    }
  }

  // Scepter of Avarice doubles a region's bank coins (A45).
  for (const scepterRegion of [state.turnFlags.scepterRegion, state.turnFlags.bagScepterRegion]) {
    if (scepterRegion === null) continue;
    if (mine !== null && scepterRegion === mine) continue; // no effect in the Mine
    const cur = t.regionCoins.get(scepterRegion) ?? 0;
    if (cur > 0) t.regionCoins.set(scepterRegion, cur * 2);
  }

  // The Balrog's region scores for nobody: it is never occupied, so it never
  // appears in regionCoins — nothing to subtract.

  return t;
}

function isPopularPlace(m: string): boolean {
  return (
    m === 'altarOfSouls' ||
    m === 'cryptOfTombRaider' ||
    m === 'diamondFields' ||
    m === 'greatBrassPipe' ||
    m === 'fountainOfYouth' ||
    m === 'keepOnMotherland' ||
    m === 'mineOfLostDwarf' ||
    m === 'stonehedge' ||
    m === 'wickedestPentacle'
  );
}

export function totalScore(t: TurnScore): number {
  let sum = 0;
  for (const v of t.regionCoins.values()) sum += v;
  for (const l of t.setLines) sum += l.amount;
  for (const v of t.transfers.values()) sum += v;
  return sum;
}

export function isTerminal(state: GameState): boolean {
  return state.gameOver;
}

export function getScores(state: GameState): Scores {
  const coins = state.players.map((p) => p.coins);
  const tokens = state.players.map((_, i) => tokensOnBoard(state, i));
  const maxCoins = Math.max(...coins);
  const leaders = coins.map((_, i) => i).filter((i) => (coins[i] as number) === maxCoins);
  let winners = leaders;
  if (leaders.length > 1) {
    const maxTokens = Math.max(...leaders.map((i) => tokens[i] as number));
    winners = leaders.filter((i) => (tokens[i] as number) === maxTokens);
  }
  return { coins, tokensOnBoard: tokens, winners };
}

export function raceTokensTotal(state: GameState, race: RaceId): number {
  let n = state.tray[race];
  for (const r of state.regions) if (r.race === race) n += r.tokens;
  for (const p of state.players) {
    if (p.active?.race === race) n += p.active.hand;
  }
  for (const pd of state.pendingDefenders) {
    const p = state.players[pd.player];
    const r = pd.inDecline ? p?.declined?.race : p?.active?.race;
    if (r === race) n += pd.tokens;
  }
  // Tomb tokens picked up for the final redeployment on a decline turn.
  if (state.declineTombPool > 0) {
    const decliner = state.players[state.activePlayer];
    if (decliner?.declined?.race === race) n += state.declineTombPool;
  }
  return n;
}
