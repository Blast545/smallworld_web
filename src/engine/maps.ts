// The four maps (one per player count). The physical boards' geometry is not
// machine-readable from the rulebook, so these are original layouts that
// follow the printed maps' structure (see ASSUMPTIONS A3).
//
// Each map is authored as an ASCII cell grid: identical characters form one
// region; digits are river regions; '#' and '%' are Abysmal Chasm regions.
// Adjacency, edge flags and river ends are derived from the grid so that the
// data can never disagree with the drawing.

import type { Terrain } from './data';

export interface MapRegion {
  id: number;
  key: string; // grid character, for debugging
  terrain: Terrain;
  isEdge: boolean; // touches the board edge (First Conquest entry)
  monsterSymbol: boolean; // starts with 2 Monster tokens
  volcanoSymbol: boolean; // chasm where the Flames' Volcano may be placed
  cells: number[]; // grid cells (row * cols + col), for rendering
}

export interface GameMap {
  id: string;
  playerCount: number;
  turns: number;
  cols: number;
  rows: number;
  regions: MapRegion[];
  adjacency: number[][]; // regionId -> sorted neighbor regionIds
}

interface MapSpec {
  id: string;
  playerCount: number;
  turns: number;
  grid: string[];
  terrains: Record<string, Terrain>; // for land regions; digits => river, #/% => chasm
  monsters: string;
  volcanoes: string; // chasm keys carrying the volcano symbol
}

const SPECS: MapSpec[] = [
  {
    id: 'caves-2p',
    playerCount: 2,
    turns: 10,
    grid: [
      'AABBC1DDE',
      'AFFBC1GEE',
      'HHFIC2GGJ',
      'HKII#22JJ',
      'KKL##M2NN',
      'OLLP#M33N',
      'OOPPQQQ3R',
    ],
    terrains: {
      A: 'mushroom', B: 'mud', C: 'crystal', D: 'blackMountain', E: 'mud',
      F: 'mine', G: 'crystal', H: 'blackMountain', I: 'mushroom', J: 'mud',
      K: 'crystal', L: 'mud', M: 'blackMountain', N: 'mine', O: 'mushroom',
      P: 'blackMountain', Q: 'mine', R: 'mud',
    },
    monsters: 'BGIMO',
    volcanoes: '#',
  },
  {
    id: 'grottoes-3p',
    playerCount: 3,
    turns: 10,
    grid: [
      'AABB1CCDDEE',
      'FABG1HCDIIE',
      'FFGG1HHJJIK',
      'LFMG22HJKKK',
      'LMM##2NNOOP',
      'LQM#333NOPP',
      'QQR%%S3TTUP',
      'QRR%SS33TUU',
    ],
    terrains: {
      A: 'mud', B: 'mine', C: 'crystal', D: 'blackMountain', E: 'mushroom',
      F: 'mud', G: 'mushroom', H: 'blackMountain', I: 'mud', J: 'crystal',
      K: 'mine', L: 'crystal', M: 'blackMountain', N: 'mine', O: 'mushroom',
      P: 'mud', Q: 'mushroom', R: 'mine', S: 'blackMountain', T: 'crystal',
      U: 'blackMountain',
    },
    monsters: 'GHJNRT',
    volcanoes: '#%',
  },
  {
    id: 'depths-4p',
    playerCount: 4,
    turns: 9,
    grid: [
      'AABBCC1DDEEF',
      'GABHC11DIIEF',
      'GGHHC1JJKIFF',
      'LGMH22JKKNNO',
      'LMM##22PKNOO',
      'LQ##R32PPSOT',
      'QQURR33VWSST',
      'XQUUR43VWWYT',
      'XXUZZ44VVWYY',
    ],
    terrains: {
      A: 'mushroom', B: 'mine', C: 'blackMountain', D: 'crystal', E: 'mud',
      F: 'blackMountain', G: 'mud', H: 'crystal', I: 'mine', J: 'mushroom',
      K: 'blackMountain', L: 'crystal', M: 'mud', N: 'mine', O: 'mushroom',
      P: 'mud', Q: 'mushroom', R: 'blackMountain', S: 'crystal', T: 'mud',
      U: 'mine', V: 'mud', W: 'blackMountain', X: 'crystal', Y: 'mine',
      Z: 'mushroom',
    },
    monsters: 'HJKPRU',
    volcanoes: '#',
  },
  {
    id: 'abyss-5p',
    playerCount: 5,
    turns: 8,
    grid: [
      'AABBCC1DDEEFF',
      'GABHC11DIIEJF',
      'GGHH21KKIJJJL',
      'MGNH22KOOPQLL',
      'MNN##22OPPQQR',
      'MS##T32%%VWRR',
      'SSXTT33%VVWWY',
      'ZSXT43aaaVbYY',
      'ZZX4444abbbcc',
    ],
    terrains: {
      A: 'mushroom', B: 'mine', C: 'blackMountain', D: 'crystal', E: 'mud',
      F: 'crystal', G: 'mud', H: 'crystal', I: 'mine', J: 'mushroom',
      K: 'blackMountain', L: 'mud', M: 'mud', N: 'mine', O: 'mushroom',
      P: 'mud', Q: 'crystal', R: 'blackMountain', S: 'mud', T: 'mine',
      V: 'crystal', W: 'blackMountain', X: 'mushroom', Y: 'crystal',
      Z: 'blackMountain', a: 'mud', b: 'mine', c: 'mushroom',
    },
    monsters: 'HJKPTVa',
    volcanoes: '#%',
  },
];

function buildMap(spec: MapSpec): GameMap {
  const rows = spec.grid.length;
  const cols = (spec.grid[0] as string).length;
  for (const row of spec.grid) {
    if (row.length !== cols) throw new Error(`map ${spec.id}: ragged grid row "${row}"`);
  }
  const keys: string[] = [];
  const cellsByKey = new Map<string, number[]>();
  for (let r = 0; r < rows; r++) {
    const row = spec.grid[r] as string;
    for (let c = 0; c < cols; c++) {
      const ch = row[c] as string;
      if (!cellsByKey.has(ch)) {
        cellsByKey.set(ch, []);
        keys.push(ch);
      }
      (cellsByKey.get(ch) as number[]).push(r * cols + c);
    }
  }
  const idByKey = new Map<string, number>();
  keys.forEach((k, i) => idByKey.set(k, i));

  const regions: MapRegion[] = keys.map((key, id) => {
    let terrain: Terrain;
    if (key >= '0' && key <= '9') terrain = 'river';
    else if (key === '#' || key === '%') terrain = 'chasm';
    else {
      const t = spec.terrains[key];
      if (!t) throw new Error(`map ${spec.id}: no terrain for region "${key}"`);
      terrain = t;
    }
    const cells = cellsByKey.get(key) as number[];
    const isEdge = cells.some((cell) => {
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      return r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
    });
    return {
      id,
      key,
      terrain,
      isEdge,
      monsterSymbol: spec.monsters.includes(key),
      volcanoSymbol: spec.volcanoes.includes(key),
      cells,
    };
  });

  const adjSets: Set<number>[] = regions.map(() => new Set<number>());
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const here = idByKey.get((spec.grid[r] as string)[c] as string) as number;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const r2 = r + dr;
        const c2 = c + dc;
        if (r2 >= rows || c2 >= cols) continue;
        const there = idByKey.get((spec.grid[r2] as string)[c2] as string) as number;
        if (there !== here) {
          (adjSets[here] as Set<number>).add(there);
          (adjSets[there] as Set<number>).add(here);
        }
      }
    }
  }
  const adjacency = adjSets.map((s) => [...s].sort((a, b) => a - b));

  // Sanity checks: these run once at module load and guarantee every map is
  // structurally valid (they back the setup.test.ts assertions).
  const rivers = regions.filter((rg) => rg.terrain === 'river');
  if (rivers.length < 2) throw new Error(`map ${spec.id}: needs a river`);
  const riverEnds = rivers.filter((rg) => rg.isEdge);
  if (riverEnds.length < 2) throw new Error(`map ${spec.id}: river needs 2 board-edge ends`);
  if (!regions.some((rg) => rg.terrain === 'chasm' && rg.volcanoSymbol))
    throw new Error(`map ${spec.id}: needs a volcano chasm`);
  const monsterRegions = regions.filter((rg) => rg.monsterSymbol);
  if (monsterRegions.length * 2 > 14)
    throw new Error(`map ${spec.id}: too many monster regions for 14 monster tokens`);
  if (monsterRegions.some((rg) => rg.terrain === 'river' || rg.terrain === 'chasm'))
    throw new Error(`map ${spec.id}: monster symbol on river/chasm`);
  if (regions.filter((rg) => rg.terrain === 'blackMountain').length > 9)
    throw new Error(`map ${spec.id}: more than 9 black mountain regions`);

  return {
    id: spec.id,
    playerCount: spec.playerCount,
    turns: spec.turns,
    cols,
    rows,
    regions,
    adjacency,
  };
}

export const MAPS: GameMap[] = SPECS.map(buildMap);

export function mapForPlayerCount(playerCount: number): GameMap {
  const m = MAPS.find((mm) => mm.playerCount === playerCount);
  if (!m) throw new Error(`no map for ${playerCount} players`);
  return m;
}
