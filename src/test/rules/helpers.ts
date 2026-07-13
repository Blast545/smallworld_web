// Shared scenario helpers. Tests build controlled positions by direct state
// surgery (keeping the tray consistent), then exercise the engine only
// through getLegalActions / applyAction.

import { expect } from 'vitest';
import { getLegalActions } from '../../engine/actions';
import type { PowerId, RaceId } from '../../engine/data';
import { getMap } from '../../engine/setup';
import { createInitialState } from '../../engine/setup';
import type { Action, GameConfig, GameState } from '../../engine/types';

export function config(playerCount: number, seed = 7): GameConfig {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `P${i}`,
      controller: 'bot' as const,
    })),
    seed,
  };
}

export function fresh(playerCount = 2, seed = 7): GameState {
  return createInitialState(config(playerCount, seed), seed);
}

/** Give a player an active race + power with `hand` tokens (from the tray). */
export function giveActive(
  state: GameState,
  player: number,
  race: RaceId,
  power: PowerId | null,
  hand: number,
): void {
  const p = state.players[player];
  if (!p) throw new Error('bad player');
  if (state.tray[race] < hand) throw new Error('not enough tokens in tray for test setup');
  state.tray[race] -= hand;
  p.active = { race, power, hand, hammerPool: 0 };
  // Remove the banner from the market so banner conservation holds.
  removeBannerFromMarket(state, race);
  if (power !== null) removeBadgeFromMarket(state, power);
}

export function giveDeclined(
  state: GameState,
  player: number,
  race: RaceId,
  power: PowerId | null,
): void {
  const p = state.players[player];
  if (!p) throw new Error('bad player');
  p.declined = { race, power };
  removeBannerFromMarket(state, race);
  if (power !== null) removeBadgeFromMarket(state, power);
}

function removeBannerFromMarket(state: GameState, race: RaceId): void {
  const col = state.column.findIndex((c) => c?.banner === race);
  if (col >= 0) {
    const slot = state.column[col];
    if (slot?.power !== null && slot?.power !== undefined) state.badgeDiscard.push(slot.power);
    // Slide the column up and refill from the stack, mirroring replenish.
    const kept = state.column.filter((c, i) => c !== null && i !== col);
    while (kept.length < 5 && state.bannerStack.length > 0) {
      const banner = state.bannerStack.shift() as RaceId;
      const power = state.badgeStack.shift() ?? null;
      kept.push({ banner, power, coins: 0 });
    }
    state.column = [...kept];
    while (state.column.length < 5) state.column.push(null);
    return;
  }
  const idx = state.bannerStack.indexOf(race);
  if (idx >= 0) state.bannerStack.splice(idx, 1);
}

function removeBadgeFromMarket(state: GameState, power: PowerId): void {
  for (const slot of state.column) {
    if (slot?.power === power) {
      slot.power = state.badgeStack.shift() ?? null;
      return;
    }
  }
  const idx = state.badgeStack.indexOf(power);
  if (idx >= 0) state.badgeStack.splice(idx, 1);
  const d = state.badgeDiscard.indexOf(power);
  if (d >= 0) state.badgeDiscard.splice(d, 1);
}

/** Put `tokens` of a player's race into a region (from tray or hand). */
export function occupy(
  state: GameState,
  player: number,
  region: number,
  tokens: number,
  opts: { inDecline?: boolean; fromHand?: boolean } = {},
): void {
  const p = state.players[player];
  if (!p) throw new Error('bad player');
  const race = opts.inDecline ? p.declined?.race : p.active?.race;
  if (!race) throw new Error('player has no such race');
  if (opts.fromHand) {
    const a = p.active;
    if (!a || a.hand < tokens) throw new Error('not enough hand tokens');
    a.hand -= tokens;
  } else {
    if (state.tray[race] < tokens) throw new Error('not enough tray tokens');
    state.tray[race] -= tokens;
  }
  const r = state.regions[region];
  if (!r) throw new Error('bad region');
  if (r.tokens > 0) throw new Error('region already occupied (test setup)');
  r.owner = player;
  r.race = race;
  r.inDecline = opts.inDecline ?? false;
  r.tokens = tokens;
}

/** Clear the monsters from a region back "out of the game" (test setup). */
export function clearMonsters(state: GameState, region: number): void {
  const r = state.regions[region];
  if (!r) throw new Error('bad region');
  state.monstersDestroyed += r.monsters;
  r.monsters = 0;
}

export function setPhase(
  state: GameState,
  phase: GameState['phase'],
  player = 0,
): void {
  state.phase = phase;
  state.activePlayer = player;
  state.chooser = player;
}

export function legalOf(state: GameState, type: Action['type']): Action[] {
  return getLegalActions(state).filter((a) => a.type === type);
}

export function expectLegal(state: GameState, pred: (a: Action) => boolean): Action {
  const found = getLegalActions(state).find(pred);
  expect(found, 'expected a matching legal action').toBeDefined();
  return found as Action;
}

export function expectNotLegal(state: GameState, pred: (a: Action) => boolean): void {
  const found = getLegalActions(state).find(pred);
  expect(found, 'expected NO matching legal action').toBeUndefined();
}

/** Region ids by terrain from the map. */
export function byTerrain(state: GameState, terrain: string): number[] {
  return getMap(state)
    .regions.filter((r) => r.terrain === terrain)
    .map((r) => r.id);
}

export function edgeRegions(state: GameState): number[] {
  return getMap(state)
    .regions.filter((r) => r.isEdge && r.terrain !== 'chasm')
    .map((r) => r.id);
}

export function neighborsOf(state: GameState, region: number): number[] {
  return getMap(state).adjacency[region] as number[];
}

/** An edge, non-monster, non-river, non-mountain region (cheap entry). */
export function plainEntry(state: GameState): number {
  const map = getMap(state);
  const found = map.regions.find(
    (r) =>
      r.isEdge &&
      r.terrain !== 'chasm' &&
      r.terrain !== 'river' &&
      r.terrain !== 'blackMountain' &&
      !r.monsterSymbol,
  );
  if (!found) throw new Error('no plain entry region');
  return found.id;
}

export const CONQUER_BASE = {
  useSword: false,
  useSocks: false,
  useDoormat: false,
  bagAs: null,
} as const;
