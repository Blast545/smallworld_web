// Static game data: races, special powers, places & relics.
// Banner and badge values were read from the rulebook page images
// (docs/rulebook.txt); token supplies come from the component list.

export type RaceId =
  | 'cultists'
  | 'drow'
  | 'flames'
  | 'gnomes'
  | 'ironDwarves'
  | 'kraken'
  | 'liches'
  | 'lizardmen'
  | 'mudmen'
  | 'mummies'
  | 'ogres'
  | 'shadowMimes'
  | 'shrooms'
  | 'spiderines'
  | 'willOWisps';

export type PowerId =
  | 'adventurous'
  | 'fisher'
  | 'flocking'
  | 'frightened'
  | 'immortal'
  | 'magic'
  | 'martyr'
  | 'mining'
  | 'muddy'
  | 'mystic'
  | 'quarreling'
  | 'reborn'
  | 'royal'
  | 'shield'
  | 'stone'
  | 'thieving'
  | 'tomb'
  | 'vampire'
  | 'vanishing'
  | 'vengeful'
  | 'wise';

export type PlaceId =
  | 'altarOfSouls'
  | 'cryptOfTombRaider'
  | 'diamondFields'
  | 'greatBrassPipe'
  | 'fountainOfYouth'
  | 'keepOnMotherland'
  | 'mineOfLostDwarf'
  | 'stonehedge'
  | 'wickedestPentacle';

export type RelicId =
  | 'flyingDoormat'
  | 'froggysRing'
  | 'stinkyTrollsSocks'
  | 'scepterOfAvarice'
  | 'shinyOrb'
  | 'swordOfKillerRabbit';

export type MarkerId = PlaceId | RelicId;

export type Terrain =
  | 'mine'
  | 'mushroom'
  | 'crystal'
  | 'mud'
  | 'blackMountain'
  | 'river'
  | 'chasm';

export interface RaceInfo {
  name: string;
  banner: number; // tokens granted by the banner
  supply: number; // hard token supply limit
}

export const RACES: Record<RaceId, RaceInfo> = {
  cultists: { name: 'Cultists', banner: 5, supply: 10 },
  drow: { name: 'Drow', banner: 4, supply: 9 },
  flames: { name: 'Flames', banner: 4, supply: 9 },
  gnomes: { name: 'Gnomes', banner: 6, supply: 11 },
  ironDwarves: { name: 'Iron Dwarves', banner: 7, supply: 12 },
  kraken: { name: 'Kraken', banner: 5, supply: 10 },
  liches: { name: 'Liches', banner: 5, supply: 10 },
  lizardmen: { name: 'Lizardmen', banner: 7, supply: 12 },
  mudmen: { name: 'Mudmen', banner: 5, supply: 12 },
  mummies: { name: 'Mummies', banner: 10, supply: 15 },
  ogres: { name: 'Ogres', banner: 5, supply: 10 },
  shadowMimes: { name: 'Shadow Mimes', banner: 7, supply: 12 },
  shrooms: { name: 'Shrooms', banner: 5, supply: 10 },
  spiderines: { name: 'Spiderines', banner: 7, supply: 12 },
  willOWisps: { name: "Will-o'-Wisps", banner: 6, supply: 11 },
};

export interface PowerInfo {
  name: string;
  value: number; // bonus tokens granted by the badge
  persistsInDecline: boolean; // badge kept next to the declined banner (A36)
}

export const POWERS: Record<PowerId, PowerInfo> = {
  adventurous: { name: 'Adventurous', value: 5, persistsInDecline: false },
  fisher: { name: 'Fisher', value: 4, persistsInDecline: false },
  flocking: { name: 'Flocking', value: 5, persistsInDecline: false },
  frightened: { name: 'Frightened', value: 4, persistsInDecline: false },
  immortal: { name: 'Immortal', value: 4, persistsInDecline: false },
  magic: { name: 'Magic', value: 5, persistsInDecline: false },
  martyr: { name: 'Martyr', value: 4, persistsInDecline: false },
  mining: { name: 'Mining', value: 4, persistsInDecline: false },
  muddy: { name: 'Muddy', value: 3, persistsInDecline: true },
  mystic: { name: 'Mystic', value: 4, persistsInDecline: false },
  quarreling: { name: 'Quarreling', value: 3, persistsInDecline: false },
  reborn: { name: 'Reborn', value: 5, persistsInDecline: true },
  royal: { name: 'Royal', value: 5, persistsInDecline: true },
  shield: { name: 'Shield', value: 3, persistsInDecline: false },
  stone: { name: 'Stone', value: 4, persistsInDecline: false },
  thieving: { name: 'Thieving', value: 4, persistsInDecline: false },
  tomb: { name: 'Tomb', value: 5, persistsInDecline: true },
  vampire: { name: 'Vampire', value: 5, persistsInDecline: false },
  vanishing: { name: 'Vanishing', value: 5, persistsInDecline: false },
  vengeful: { name: 'Vengeful', value: 4, persistsInDecline: false },
  wise: { name: 'Wise', value: 4, persistsInDecline: true },
};

export interface MarkerInfo {
  name: string;
  kind: 'place' | 'relic';
}

export const MARKERS: Record<MarkerId, MarkerInfo> = {
  altarOfSouls: { name: 'Altar of Souls', kind: 'place' },
  cryptOfTombRaider: { name: 'Crypt of the Tomb-raider', kind: 'place' },
  diamondFields: { name: 'Diamond Fields', kind: 'place' },
  greatBrassPipe: { name: 'Great Brass Pipe', kind: 'place' },
  fountainOfYouth: { name: 'Fountain of Youth', kind: 'place' },
  keepOnMotherland: { name: 'Keep on the Motherland', kind: 'place' },
  mineOfLostDwarf: { name: 'Mine of the Lost Dwarf', kind: 'place' },
  stonehedge: { name: 'Stonehedge', kind: 'place' },
  wickedestPentacle: { name: 'Wickedest Pentacle', kind: 'place' },
  flyingDoormat: { name: 'Flying Doormat', kind: 'relic' },
  froggysRing: { name: "Froggy's Ring", kind: 'relic' },
  stinkyTrollsSocks: { name: "Stinky Troll's Socks", kind: 'relic' },
  scepterOfAvarice: { name: 'Scepter of Avarice', kind: 'relic' },
  shinyOrb: { name: 'Shiny Orb', kind: 'relic' },
  swordOfKillerRabbit: { name: 'Sword of the Killer Rabbit', kind: 'relic' },
};

export const ALL_RACES = Object.keys(RACES) as RaceId[];
export const ALL_POWERS = Object.keys(POWERS) as PowerId[];
export const ALL_MARKERS = Object.keys(MARKERS) as MarkerId[];
export const ALL_RELICS = ALL_MARKERS.filter((m) => MARKERS[m].kind === 'relic') as RelicId[];

export const MONSTER_SUPPLY = 14;
export const ARMOR_SUPPLY = 8;
export const HAMMER_SUPPLY = 7;

/** One-line player-facing summaries of each race's ability. */
export const RACE_HELP: Record<RaceId, string> = {
  cultists:
    'Their first conquest summons the immune Great Ancient; regions next to it cost 1 less to conquer.',
  drow: '+1 coin per region of theirs that borders no other race and no monsters.',
  flames:
    'Erupt from a Volcano chasm; regions linked to it through their territory are conquered as if empty.',
  gnomes:
    'Their regions cannot be attacked using powers, relics or places — only plain adjacent force.',
  ironDwarves:
    'Forge a Silver Hammer per Mine region each turn; hammers pay for conquests (never defense).',
  kraken: 'The only race that may occupy and score River regions — even once In Decline.',
  liches:
    'Opponents pay them 1 coin to conquer their In-Decline regions; a broke player cannot attack them at all.',
  lizardmen: 'Swim through unoccupied River regions to conquer distant shores.',
  mudmen: 'Grow 1 new token per Mudpool region they hold, every redeployment.',
  mummies: 'A huge horde (10), but every conquest costs 1 extra token.',
  ogres: 'Conquer any region with 1 less token than normal (minimum 1).',
  shadowMimes: 'When picked, may immediately copy the special power of another visible combo.',
  shrooms: '+1 coin per Mushroom Forest region they hold.',
  spiderines:
    'All regions bordering a Chasm count as adjacent to them — and are valid entry points.',
  willOWisps:
    'May roll the reinforcement die before any conquest of, or next to, their Mystic Crystal regions.',
};

/** One-line player-facing summaries of each special power. */
export const POWER_HELP: Record<PowerId, string> = {
  adventurous: '+1 coin per Popular Place region you hold at turn’s end.',
  fisher: '+1 coin per complete pair of riverside (coastal) regions you hold.',
  flocking: '+2 coins if all your regions form one connected group.',
  frightened: '+1 coin per region you garrison with 3 or more tokens.',
  immortal: 'Lose no tokens when your regions are conquered — every survivor redeploys.',
  magic: 'The Bag-o’-Many-Things copies any one Relic in play, once per turn.',
  martyr: '+1 coin every time an opponent conquers one of your regions.',
  mining: '+1 coin per Mine region you hold.',
  muddy: '+1 coin per Mudpool region you hold — even In Decline.',
  mystic: '+1 coin per Mystic Crystal region you hold.',
  quarreling: '+1 coin per separate group your regions split into.',
  reborn: 'Once In Decline: each turn, revive 1–2 of their regions with your new race.',
  royal: 'Your Queen makes one of your regions immune to attack.',
  shield: 'Gain a Mushroom Armor per Mushroom Forest region: each adds +1 defense, even In Decline.',
  stone: '+1 coin per Black Mountain region you hold.',
  thieving: 'Steal 1 coin from every player whose active troops border yours.',
  tomb: 'Keep ALL your tokens on the map when going In Decline, and redeploy them once.',
  vampire: 'Once per turn per opponent: replace a lone enemy token with one of yours.',
  vanishing: 'When declining, score 2 coins per region — then the race vanishes entirely.',
  vengeful: 'Whoever attacks you can be attacked back next turn at 1 less token.',
  wise: '+2 coins at the end of every turn while In Decline on the board.',
};

export const TERRAIN_NAMES: Record<Terrain, string> = {
  mine: 'Mine',
  mushroom: 'Mushroom Forest',
  crystal: 'Mystic Crystal',
  mud: 'Mudpool',
  blackMountain: 'Black Mountain',
  river: 'River',
  chasm: 'Abysmal Chasm',
};
