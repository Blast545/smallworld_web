// Shared visual vocabulary: terrain colors and board glyphs. The Board and
// the map legend both read from here so they can never disagree.

import type { FigureKind } from '../engine/types';
import type { MarkerId, Terrain } from '../engine/data';

export const TERRAIN_FILL: Record<Terrain, string> = {
  mine: '#8a6d3b',
  mushroom: '#3f7d4e',
  crystal: '#6d4fa1',
  mud: '#6e5b3a',
  blackMountain: '#3a3a44',
  river: '#2a6f97',
  chasm: '#14101a',
};

/** What each terrain means for play, in one line. */
export const TERRAIN_HELP: Record<Terrain, string> = {
  mine: 'Mines — the Mining power scores here; Iron Dwarves forge a Silver Hammer per Mine.',
  mushroom: 'Mushroom Forests — Shrooms score here; the Shield power grows armor here.',
  crystal:
    'Mystic Crystals — the Mystic power scores here; Will-o’-Wisps roll their die near theirs.',
  mud: 'Mudpools — Mudmen grow a token per Mudpool; the Muddy power scores here.',
  blackMountain:
    'Black Mountains — the immovable mountain gives +1 defense; the Stone power scores here.',
  river:
    'The River — costs only 1 to conquer, but must be emptied at turn’s end (Kraken excepted).',
  chasm: 'Abysmal Chasms — impassable, never enterable; Spiderines treat their shores as adjacent.',
};

export const FIGURE_GLYPH: Record<FigureKind, string> = {
  balrog: '👹',
  greatAncient: '🐙',
  queen: '👑',
  ghost: '👻',
  volcano: '🌋',
};

export const FIGURE_HELP: Record<FigureKind, string> = {
  balrog: 'The Balrog — its region is immune to everyone and scores for nobody.',
  greatAncient: 'The Great Ancient (Cultists) — makes its region immune.',
  queen: 'The Queen (Royal power) — makes its region immune.',
  ghost: 'The Tomb-raider’s Ghost (Crypt) — makes its region immune.',
  volcano: 'The Volcano — the Flames’ entry point onto the map.',
};

export const MARKER_GLYPH: Record<MarkerId, string> = {
  altarOfSouls: '⚱️',
  cryptOfTombRaider: '🏚️',
  diamondFields: '💎',
  greatBrassPipe: '🎺',
  fountainOfYouth: '⛲',
  keepOnMotherland: '🏰',
  mineOfLostDwarf: '⛏️',
  stonehedge: '🗿',
  wickedestPentacle: '⛧',
  flyingDoormat: '🪄',
  froggysRing: '💍',
  stinkyTrollsSocks: '🧦',
  scepterOfAvarice: '🪙',
  shinyOrb: '🔮',
  swordOfKillerRabbit: '🗡️',
};

/** One-line reminders of what each Place/Relic does for its holder. */
export const MARKER_HELP: Record<MarkerId, string> = {
  altarOfSouls: 'Sacrifice one of your In-Decline tokens for +3 coins at turn’s end.',
  cryptOfTombRaider: 'Lets its holder place the protective Ghost each turn.',
  diamondFields: '+1 coin for its region and every same-terrain region of that race.',
  greatBrassPipe: 'All regions of its terrain count as adjacent for its holder.',
  fountainOfYouth: '+1 troop token at the start of its holder’s turn.',
  keepOnMotherland: '+1 coin at turn’s end and +1 defense — even In Decline.',
  mineOfLostDwarf: '+2 coins at turn’s end — even In Decline.',
  stonehedge: 'Grants its holder a hidden extra Special Power.',
  wickedestPentacle: 'Unleashed the Balrog when discovered.',
  flyingDoormat: 'Once per turn: conquer any region, however far away.',
  froggysRing: 'Collects 1 coin from every player bordering its region.',
  stinkyTrollsSocks: 'Once per turn: conquer a region as if it were empty.',
  scepterOfAvarice: 'Doubles the coins one region produces at turn’s end.',
  shinyOrb: 'Once per turn: replace a lone enemy token with one of yours.',
  swordOfKillerRabbit: 'Once per turn: one conquest costs 2 fewer tokens.',
};
