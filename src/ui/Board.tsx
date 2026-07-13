// SVG board rendered from the map's cell grid. Each region is drawn as a
// single traced outline (no internal grid seams). Pure presentation: taps are
// forwarded to the Game screen, which decides what (if anything) they mean.

import type { JSX } from 'react';
import type { GameMap } from '../engine/maps';
import type { GameState, RegionState } from '../engine/types';
import { FIGURE_GLYPH, MARKER_GLYPH, TERRAIN_FILL } from './glyphs';

const CELL = 40;

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

/**
 * Trace the boundary of a region (a set of grid cells) into SVG path loops.
 * Directed edges keep the region on the right of the travel direction
 * (clockwise loops in screen coordinates); at pinch points the walk prefers
 * the tightest right turn so it hugs the region.
 */
const outlineCache = new Map<string, string>();

export function regionOutline(map: GameMap, regionId: number): string {
  const key = `${map.id}:${regionId}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;

  const inRegion = new Set<number>();
  for (const c of cells(map, regionId)) inRegion.add(c.r * map.cols + c.c);
  const has = (r: number, c: number): boolean =>
    r >= 0 && c >= 0 && r < map.rows && c < map.cols && inRegion.has(r * map.cols + c);

  // Directed boundary edges between lattice points (grid units).
  type Pt = string; // "x,y"
  const edges = new Map<Pt, [number, number, number, number][]>(); // start -> [x1,y1,x2,y2]
  const addEdge = (x1: number, y1: number, x2: number, y2: number): void => {
    const k = `${x1},${y1}`;
    const list = edges.get(k) ?? [];
    list.push([x1, y1, x2, y2]);
    edges.set(k, list);
  };
  for (const { r, c } of cells(map, regionId)) {
    if (!has(r - 1, c)) addEdge(c, r, c + 1, r); // top, rightward
    if (!has(r, c + 1)) addEdge(c + 1, r, c + 1, r + 1); // right, downward
    if (!has(r + 1, c)) addEdge(c + 1, r + 1, c, r + 1); // bottom, leftward
    if (!has(r, c - 1)) addEdge(c, r + 1, c, r); // left, upward
  }

  const loops: string[] = [];
  const takeEdge = (
    from: Pt,
    prevDir: [number, number] | null,
  ): [number, number, number, number] | null => {
    const list = edges.get(from);
    if (!list || list.length === 0) return null;
    let pick = 0;
    if (prevDir && list.length > 1) {
      // Prefer the tightest right turn: cw(prev), straight, ccw(prev).
      const prefs: [number, number][] = [
        [-prevDir[1], prevDir[0]],
        [prevDir[0], prevDir[1]],
        [prevDir[1], -prevDir[0]],
      ];
      outer: for (const pref of prefs) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i] as [number, number, number, number];
          const dir: [number, number] = [Math.sign(e[2] - e[0]), Math.sign(e[3] - e[1])];
          if (dir[0] === pref[0] && dir[1] === pref[1]) {
            pick = i;
            break outer;
          }
        }
      }
    }
    const edge = list.splice(pick, 1)[0] as [number, number, number, number];
    if (list.length === 0) edges.delete(from);
    return edge;
  };

  for (;;) {
    const startKey = edges.keys().next().value as Pt | undefined;
    if (startKey === undefined) break;
    const first = takeEdge(startKey, null);
    if (!first) break;
    const pts: [number, number][] = [
      [first[0], first[1]],
      [first[2], first[3]],
    ];
    let dir: [number, number] = [Math.sign(first[2] - first[0]), Math.sign(first[3] - first[1])];
    for (;;) {
      const cur = pts[pts.length - 1] as [number, number];
      if (cur[0] === first[0] && cur[1] === first[1]) break;
      const next = takeEdge(`${cur[0]},${cur[1]}`, dir);
      if (!next) break; // should not happen on a well-formed boundary
      dir = [Math.sign(next[2] - next[0]), Math.sign(next[3] - next[1])];
      pts.push([next[2], next[3]]);
    }
    // Collapse collinear points for a shorter path.
    const compact: [number, number][] = [];
    for (const p of pts.slice(0, -1)) {
      const a = compact[compact.length - 2];
      const b = compact[compact.length - 1];
      if (a && b && Math.sign(b[0] - a[0]) === Math.sign(p[0] - b[0]) && Math.sign(b[1] - a[1]) === Math.sign(p[1] - b[1])) {
        compact[compact.length - 1] = p;
      } else {
        compact.push(p);
      }
    }
    loops.push(
      `M${compact.map(([x, y]) => `${x * CELL},${y * CELL}`).join('L')}Z`,
    );
  }
  const d = loops.join('');
  outlineCache.set(key, d);
  return d;
}

/** Cell nearest the centroid, so labels sit inside L-shaped regions. */
function labelPos(map: GameMap, regionId: number): { x: number; y: number } {
  const cs = cells(map, regionId);
  const sx = cs.reduce((a, c) => a + c.c, 0) / cs.length;
  const sy = cs.reduce((a, c) => a + c.r, 0) / cs.length;
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
      {/* region fills: one seamless shape per region */}
      {map.regions.map((region) => {
        const pos = labelPos(map, region.id);
        return (
          <g
            key={region.id}
            onClick={() => onTapRegion(region.id)}
            data-testid={`region-${region.id}`}
            data-hl={highlights.has(region.id) ? '1' : undefined}
          >
            <path
              d={regionOutline(map, region.id)}
              fill={TERRAIN_FILL[region.terrain]}
              fillRule="evenodd"
              stroke="#0d0a14"
              strokeWidth={3}
              strokeLinejoin="round"
              opacity={
                highlights.size > 0 && !highlights.has(region.id) && region.terrain !== 'chasm'
                  ? 0.45
                  : 1
              }
            />
            {/* Invisible anchor: guaranteed to sit inside the (possibly
                concave) region, giving tests and assistive tech a stable
                tap point. */}
            <rect
              className="tap"
              x={pos.x - 14}
              y={pos.y - 14}
              width={28}
              height={28}
              fill="transparent"
              pointerEvents="all"
            />
          </g>
        );
      })}
      {/* highlight outlines on top */}
      {map.regions
        .filter((r) => highlights.has(r.id) || selected === r.id)
        .map((r) => (
          <path
            key={`hl-${r.id}`}
            d={regionOutline(map, r.id)}
            fill="none"
            fillRule="evenodd"
            stroke={selected === r.id ? '#ffffff' : '#ffd54a'}
            strokeWidth={3.5}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ))}
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
        for (const f of rs.figures) badges.push(FIGURE_GLYPH[f.kind] ?? '?');
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
