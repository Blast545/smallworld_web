// SVG board rendered from the map's cell grid. Pure presentation: taps are
// forwarded to the Game screen, which decides what (if anything) they mean.

import type { JSX } from 'react';
import type { GameMap } from '../engine/maps';
import type { GameState, RegionState } from '../engine/types';
import type { Terrain } from '../engine/data';

const CELL = 40;

const TERRAIN_FILL: Record<Terrain, string> = {
  mine: '#8a6d3b',
  mushroom: '#3f7d4e',
  crystal: '#6d4fa1',
  mud: '#6e5b3a',
  blackMountain: '#3a3a44',
  river: '#2a6f97',
  chasm: '#14101a',
};

export const PLAYER_COLORS = ['#e4572e', '#f3a712', '#2e86ab', '#9c528b', '#4cae4f'];

export interface BoardProps {
  map: GameMap;
  state: GameState;
  highlights: Set<number>;
  selected: number | null;
  onTapRegion: (regionId: number) => void;
}

interface Cell {
  r: number;
  c: number;
}

function cells(map: GameMap, regionId: number): Cell[] {
  const region = map.regions[regionId];
  if (!region) return [];
  return region.cells.map((cell) => ({ r: Math.floor(cell / map.cols), c: cell % map.cols }));
}

/** Centroid cell of a region (largest-cluster-ish: median cell). */
function labelPos(map: GameMap, regionId: number): { x: number; y: number } {
  const cs = cells(map, regionId);
  const sx = cs.reduce((a, c) => a + c.c, 0) / cs.length;
  const sy = cs.reduce((a, c) => a + c.r, 0) / cs.length;
  // Snap to the cell nearest the centroid so the label sits inside the region.
  let best = cs[0] as Cell;
  let bestD = Infinity;
  for (const c of cs) {
    const d = (c.c - sx) ** 2 + (c.r - sy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { x: (best.c + 0.5) * CELL, y: (best.r + 0.5) * CELL };
}

/** Border segments between different regions (and the outer rim). */
function borderPath(map: GameMap): string {
  const parts: string[] = [];
  const key = (r: number, c: number): number | null => {
    if (r < 0 || c < 0 || r >= map.rows || c >= map.cols) return null;
    const ch = map.regions.findIndex((rg) => rg.cells.includes(r * map.cols + c));
    return ch;
  };
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const here = key(r, c);
      if (key(r, c + 1) !== here) {
        parts.push(`M${(c + 1) * CELL},${r * CELL}v${CELL}`);
      }
      if (key(r + 1, c) !== here) {
        parts.push(`M${c * CELL},${(r + 1) * CELL}h${CELL}`);
      }
      if (c === 0) parts.push(`M0,${r * CELL}v${CELL}`);
      if (r === 0) parts.push(`M${c * CELL},0h${CELL}`);
    }
  }
  return parts.join('');
}

function figureGlyph(kind: string): string {
  switch (kind) {
    case 'balrog':
      return '👹';
    case 'greatAncient':
      return '🐙';
    case 'queen':
      return '👑';
    case 'ghost':
      return '👻';
    case 'volcano':
      return '🌋';
    default:
      return '?';
  }
}

const MARKER_GLYPH: Record<string, string> = {
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

export function Board({ map, state, highlights, selected, onTapRegion }: BoardProps): JSX.Element {
  const w = map.cols * CELL;
  const h = map.rows * CELL;
  return (
    <svg
      className="board"
      viewBox={`0 0 ${w} ${h}`}
      role="group"
      aria-label="game board"
      data-testid="board"
    >
      {map.regions.map((region) => (
        <g
          key={region.id}
          onClick={() => onTapRegion(region.id)}
          data-testid={`region-${region.id}`}
          data-hl={highlights.has(region.id) ? '1' : undefined}
        >
          {cells(map, region.id).map((cell, i) => (
            <rect
              key={i}
              x={cell.c * CELL}
              y={cell.r * CELL}
              width={CELL}
              height={CELL}
              fill={TERRAIN_FILL[region.terrain]}
              opacity={
                highlights.size > 0 && !highlights.has(region.id) && region.terrain !== 'chasm'
                  ? 0.45
                  : 1
              }
            />
          ))}
        </g>
      ))}
      <path d={borderPath(map)} stroke="#0d0a14" strokeWidth={3} fill="none" pointerEvents="none" />
      {/* highlight outlines */}
      {map.regions
        .filter((r) => highlights.has(r.id) || selected === r.id)
        .map((r) =>
          cells(map, r.id).map((cell, i) => (
            <rect
              key={`${r.id}-${i}`}
              x={cell.c * CELL + 1.5}
              y={cell.r * CELL + 1.5}
              width={CELL - 3}
              height={CELL - 3}
              fill="none"
              stroke={selected === r.id ? '#ffffff' : '#ffd54a'}
              strokeWidth={3}
              pointerEvents="none"
            />
          )),
        )}
      {/* region contents */}
      {map.regions.map((region) => {
        const rs = state.regions[region.id] as RegionState;
        const pos = labelPos(map, region.id);
        const bits: JSX.Element[] = [];
        if (rs.tokens > 0 && rs.owner !== null) {
          const color = PLAYER_COLORS[rs.owner] ?? '#999';
          bits.push(
            <g key="tokens" pointerEvents="none">
              <circle
                cx={pos.x}
                cy={pos.y}
                r={13}
                fill={color}
                opacity={rs.inDecline ? 0.55 : 1}
                stroke="#0d0a14"
                strokeWidth={1.5}
                strokeDasharray={rs.inDecline ? '3 2' : undefined}
              />
              <text x={pos.x} y={pos.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
                {rs.tokens}
              </text>
            </g>,
          );
        }
        if (rs.monsters > 0) {
          bits.push(
            <text key="monsters" pointerEvents="none" x={pos.x} y={pos.y + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#ffdddd">
              {`👾${rs.monsters}`}
            </text>,
          );
        }
        const badges: string[] = [];
        if (rs.blackMountain) badges.push('⛰️');
        for (let i = 0; i < rs.armors; i++) badges.push('🛡️');
        if (rs.hammers > 0) badges.push(`🔨${rs.hammers}`);
        for (const m of rs.markers) badges.push(MARKER_GLYPH[m] ?? '★');
        for (const f of rs.figures) badges.push(figureGlyph(f.kind));
        if (badges.length > 0) {
          bits.push(
            <text key="badges" pointerEvents="none" x={pos.x} y={pos.y - 15} textAnchor="middle" fontSize={11}>
              {badges.join('')}
            </text>,
          );
        }
        return <g key={region.id}>{bits}</g>;
      })}
    </svg>
  );
}
