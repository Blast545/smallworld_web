import { ALL_MARKERS, ALL_POWERS, ALL_RACES, RACES } from './data';
import type { RaceId } from './data';
import { mapForPlayerCount } from './maps';
import type { GameMap } from './maps';
import { seedRng, shuffled } from './rng';
import type { ComboSlot, GameConfig, GameState, TurnFlags } from './types';

export function freshTurnFlags(): TurnFlags {
  return {
    pickedThisTurn: false,
    declinedThisTurn: false,
    startActionsTaken: false,
    vanishedRegions: 0,
    greatAncientMoved: false,
    rebornUsed: 0,
    conquestsMade: 0,
    doormatUsed: false,
    socksUsed: false,
    swordUsed: false,
    orbUsed: false,
    bagUsedAs: null,
    vampireUsedVs: [],
    queenPlaced: false,
    ghostPlaced: false,
    scepterRegion: null,
    bagScepterRegion: null,
    ringRegion: null,
    bagRingRegion: null,
    altarUsed: false,
    pentacleRegion: null,
    balrogReturn: null,
  };
}

export function getMap(state: GameState): GameMap {
  return mapForPlayerCount(state.config.players.length);
}

export function createInitialState(config: GameConfig, seed: number): GameState {
  const n = config.players.length;
  if (n < 2 || n > 5) throw new Error(`player count must be 2-5, got ${n}`);
  const map = mapForPlayerCount(n);
  const rng0 = seedRng(seed);
  const [banners, rng1] = shuffled(ALL_RACES, rng0);
  const [badges, rng2] = shuffled(ALL_POWERS, rng1);

  const column: (ComboSlot | null)[] = [];
  for (let i = 0; i < 5; i++) {
    column.push({ banner: banners[i] as RaceId, power: badges[i] ?? null, coins: 0 });
  }
  const bannerStack = banners.slice(5);
  const badgeStack = badges.slice(5);

  const monsterRegions = map.regions.filter((r) => r.monsterSymbol);
  const [markerPool, rng3] = shuffled(ALL_MARKERS, rng2);
  const markerDeck = markerPool.slice(0, monsterRegions.length);

  const tray = {} as Record<RaceId, number>;
  for (const r of ALL_RACES) tray[r] = RACES[r].supply;

  const state: GameState = {
    config: { players: config.players.map((p) => ({ ...p })), seed },
    mapId: map.id,
    rng: rng3,
    turn: 1,
    maxTurns: map.turns,
    activePlayer: 0,
    chooser: 0,
    phase: 'pickCombo',
    players: config.players.map(() => ({
      coins: 5,
      active: null,
      declined: null,
      armorHand: 0,
      vengeanceMarks: [],
    })),
    regions: map.regions.map((r) => ({
      owner: null,
      race: null,
      inDecline: false,
      tokens: 0,
      monsters: r.monsterSymbol ? 2 : 0,
      blackMountain: r.terrain === 'blackMountain',
      armors: 0,
      hammers: 0,
      markers: [],
      figures: [],
    })),
    column,
    bannerStack,
    badgeStack,
    badgeDiscard: [],
    markerDeck,
    tray,
    monstersDestroyed: 0,
    stonehedgePower: null,
    bagLocation: null,
    turnFlags: freshTurnFlags(),
    declineTombPool: 0,
    pendingDefenders: [],
    actionCount: 0,
    log: [
      {
        turn: 1,
        player: null,
        text: `Game start: ${n} players on map ${map.id} (${map.turns} turns).`,
      },
    ],
    gameOver: false,
    winners: [],
  };
  return state;
}

/** Deep clone of GameState. All fields are JSON-safe by construction. */
export function cloneState(s: GameState): GameState {
  return {
    config: { players: s.config.players.map((p) => ({ ...p })), seed: s.config.seed },
    mapId: s.mapId,
    rng: s.rng,
    turn: s.turn,
    maxTurns: s.maxTurns,
    activePlayer: s.activePlayer,
    chooser: s.chooser,
    phase: s.phase,
    players: s.players.map((p) => ({
      coins: p.coins,
      active: p.active ? { ...p.active } : null,
      declined: p.declined ? { ...p.declined } : null,
      armorHand: p.armorHand,
      vengeanceMarks: p.vengeanceMarks.slice(),
    })),
    regions: s.regions.map((r) => ({
      ...r,
      markers: r.markers.slice(),
      figures: r.figures.map((f) => ({ ...f })),
    })),
    column: s.column.map((c) => (c ? { ...c } : null)),
    bannerStack: s.bannerStack.slice(),
    badgeStack: s.badgeStack.slice(),
    badgeDiscard: s.badgeDiscard.slice(),
    markerDeck: s.markerDeck.slice(),
    tray: { ...s.tray },
    monstersDestroyed: s.monstersDestroyed,
    stonehedgePower: s.stonehedgePower,
    bagLocation: s.bagLocation,
    turnFlags: {
      ...s.turnFlags,
      vampireUsedVs: s.turnFlags.vampireUsedVs.slice(),
    },
    declineTombPool: s.declineTombPool,
    pendingDefenders: s.pendingDefenders.map((p) => ({ ...p })),
    actionCount: s.actionCount,
    log: s.log.slice(),
    gameOver: s.gameOver,
    winners: s.winners.slice(),
  };
}
