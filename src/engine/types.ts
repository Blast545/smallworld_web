import type { MarkerId, PowerId, RaceId, RelicId } from './data';
import type { RngState } from './rng';

// ---------------------------------------------------------------------------
// Configuration

export interface PlayerConfig {
  name: string;
  controller: 'human' | 'bot';
}

export interface GameConfig {
  players: PlayerConfig[]; // 2..5, seat order = play order, seat 0 starts
  seed: number;
}

// ---------------------------------------------------------------------------
// Board state

export type FigureKind = 'balrog' | 'greatAncient' | 'queen' | 'ghost' | 'volcano';

export interface Figure {
  kind: FigureKind;
  owner: number | null; // player index; null for balrog / parked volcano
}

export interface RegionState {
  owner: number | null; // player occupying with race tokens
  race: RaceId | null;
  inDecline: boolean;
  tokens: number;
  monsters: number;
  blackMountain: boolean;
  armors: number; // Mushroom Armors (belong to the occupying Shield race)
  hammers: number; // Silver Hammers deployed here during the Dwarves' turn
  markers: MarkerId[]; // places & relics in the region
  figures: Figure[];
}

// ---------------------------------------------------------------------------
// Players

export interface ActiveRace {
  race: RaceId;
  power: PowerId | null; // null only under badge starvation (A13)
  hand: number; // race tokens in hand
  hammerPool: number; // Iron Dwarves: hammers in front of the player
}

export interface DeclinedRace {
  race: RaceId;
  power: PowerId | null; // kept only when the power persists in decline (A36)
}

export interface PlayerState {
  coins: number;
  active: ActiveRace | null;
  declined: DeclinedRace | null;
  /** Mushroom Armors in hand (Shield), waiting to be deployed. */
  armorHand: number;
  /** Players this player's Vengeful power has marked (may attack at -1). */
  vengeanceMarks: number[];
}

// ---------------------------------------------------------------------------
// Market

export interface ComboSlot {
  banner: RaceId;
  power: PowerId | null;
  coins: number;
}

// ---------------------------------------------------------------------------
// Phases & flags

export type Phase =
  | 'pickCombo'
  | 'mimeSwap'
  | 'volcanoPlace'
  | 'startTurn'
  | 'conquest'
  | 'balrogPlace'
  | 'redeploy'
  | 'declineRedeploy'
  | 'endOfTurn'
  | 'defenderRedeploy'
  | 'gameOver';

export interface TurnFlags {
  pickedThisTurn: boolean;
  declinedThisTurn: boolean;
  startActionsTaken: boolean; // any abandon/reborn/GA move -> decline no longer allowed
  vanishedRegions: number; // regions scored at 2 by Vanishing this turn
  greatAncientMoved: boolean;
  rebornUsed: number; // 0..2
  conquestsMade: number;
  doormatUsed: boolean;
  socksUsed: boolean;
  swordUsed: boolean;
  orbUsed: boolean;
  bagUsedAs: RelicId | null;
  vampireUsedVs: number[];
  queenPlaced: boolean;
  ghostPlaced: boolean;
  scepterRegion: number | null; // real Scepter placement this turn
  bagScepterRegion: number | null; // Bag-as-Scepter placement this turn
  ringRegion: number | null; // real Ring placement this turn
  bagRingRegion: number | null; // Bag-as-Ring placement this turn
  altarUsed: boolean;
  /** Region the Wickedest Pentacle was just discovered in (balrogPlace phase). */
  pentacleRegion: number | null;
  /** Where to resume after balrogPlace: back to conquest, or straight to redeploy. */
  balrogReturn: 'conquest' | 'redeploy' | null;
}

export interface PendingDefender {
  player: number;
  tokens: number;
  inDecline: boolean;
}

// ---------------------------------------------------------------------------
// Log

export interface LogEntry {
  turn: number;
  player: number | null;
  text: string;
  /** Bot decision reason, filled by the app layer when a bot acts. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Game state

export interface GameState {
  config: GameConfig;
  mapId: string;
  rng: RngState;
  turn: number; // 1..maxTurns (round counter = game turn track)
  maxTurns: number;
  activePlayer: number;
  /** Who must act now (differs from activePlayer during defenderRedeploy). */
  chooser: number;
  phase: Phase;
  players: PlayerState[];
  regions: RegionState[];
  /** Combo market: 5 column slots (cost = index) ... */
  column: (ComboSlot | null)[];
  /** ... plus the stacks; the top of each is the 6th visible combo (cost 5). */
  bannerStack: RaceId[];
  badgeStack: PowerId[];
  badgeDiscard: PowerId[];
  /** Face-down Places & Relics stack; index 0 is the top. Hidden info. */
  markerDeck: MarkerId[];
  tray: Record<RaceId, number>;
  monstersDestroyed: number;
  /** Stonehedge's drawn power, once discovered. */
  stonehedgePower: PowerId | null;
  /** Bag-o'-Many-Things location: region id, 'hand', or null when out of play. */
  bagLocation: number | 'hand' | null;
  turnFlags: TurnFlags;
  /** Tomb tokens picked up for the final redeployment on a decline turn. */
  declineTombPool: number;
  pendingDefenders: PendingDefender[];
  actionCount: number;
  log: LogEntry[];
  gameOver: boolean;
  winners: number[]; // player indexes, set when gameOver
}

// ---------------------------------------------------------------------------
// Actions

export interface ConquestBoosts {
  useSword: boolean;
  useSocks: boolean;
  useDoormat: boolean;
  bagAs: 'swordOfKillerRabbit' | 'stinkyTrollsSocks' | 'flyingDoormat' | null;
}

export type Action =
  | { type: 'pickCombo'; combo: number } // 0..4 column, 5 = stack top
  | { type: 'mimeSwap'; combo: number }
  | { type: 'mimeSkip' }
  | { type: 'placeVolcano'; region: number }
  | { type: 'decline' }
  | { type: 'abandon'; region: number }
  | { type: 'moveGreatAncient'; region: number }
  | { type: 'rebornReplace'; region: number }
  | { type: 'beginConquest' }
  | ({ type: 'conquer'; region: number } & ConquestBoosts)
  | ({ type: 'finalConquest'; region: number } & ConquestBoosts)
  | { type: 'wispConquer'; region: number }
  | { type: 'vampirize'; region: number }
  | { type: 'orbConquer'; region: number; viaBag: boolean }
  | { type: 'endConquest' }
  | { type: 'placeBalrog'; region: number }
  | { type: 'deploy'; region: number; count: number }
  | { type: 'deployArmor'; region: number }
  | { type: 'endTurn' }
  | { type: 'placeQueen'; region: number }
  | { type: 'placeGhost'; region: number }
  | { type: 'placeScepter'; region: number; viaBag: boolean }
  | { type: 'placeRing'; region: number; viaBag: boolean }
  | { type: 'altarDiscard'; region: number }
  | { type: 'finishTurn' }
  | { type: 'defDeploy'; region: number; count: number };

export interface Scores {
  coins: number[];
  tokensOnBoard: number[];
  winners: number[];
}
