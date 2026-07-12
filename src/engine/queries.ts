// Read-only helpers over GameState: occupancy, control, adjacency/reach,
// immunity and conquest cost. All rules-legality logic that actions.ts needs
// lives here so the UI and bots can share it.

import type { MarkerId, PowerId, RelicId } from './data';
import type { GameMap } from './maps';
import { getMap } from './setup';
import type { ConquestBoosts, GameState, RegionState } from './types';

export function activeRegionIds(state: GameState, player: number): number[] {
  const out: number[] = [];
  state.regions.forEach((r, i) => {
    if (r.owner === player && !r.inDecline && r.tokens > 0) out.push(i);
  });
  return out;
}

export function declinedRegionIds(state: GameState, player: number): number[] {
  const out: number[] = [];
  state.regions.forEach((r, i) => {
    if (r.owner === player && r.inDecline && r.tokens > 0) out.push(i);
  });
  return out;
}

/** Is the player's active race off the map (First Conquest rules apply)? */
export function isEntering(state: GameState, player: number): boolean {
  return activeRegionIds(state, player).length === 0;
}

/** Conquest budget: hand tokens plus Silver Hammers for Iron Dwarves. */
export function conquestBudget(state: GameState, player: number): number {
  const a = state.players[player]?.active;
  if (!a) return 0;
  return a.hand + (a.race === 'ironDwarves' ? a.hammerPool : 0);
}

/**
 * Does the player currently benefit from `power`? True when it is his active
 * race's badge, or when it is the Stonehedge power and his active race
 * occupies the Stonehedge region (A50).
 */
export function hasActivePower(state: GameState, player: number, power: PowerId): boolean {
  const a = state.players[player]?.active;
  if (!a) return false;
  if (a.power === power) return true;
  if (state.stonehedgePower === power) {
    const sh = findMarkerRegion(state, 'stonehedge');
    if (sh !== null) {
      const r = state.regions[sh] as RegionState;
      if (r.owner === player && !r.inDecline && r.tokens > 0) return true;
    }
  }
  return false;
}

/** Same for the player's In-Decline race (persisting badges + Stonehedge). */
export function hasDeclinedPower(state: GameState, player: number, power: PowerId): boolean {
  const d = state.players[player]?.declined;
  if (!d) return false;
  if (d.power === power) return true;
  if (state.stonehedgePower === power) {
    const sh = findMarkerRegion(state, 'stonehedge');
    if (sh !== null) {
      const r = state.regions[sh] as RegionState;
      if (r.owner === player && r.inDecline && r.tokens > 0) return true;
    }
  }
  return false;
}

export function findMarkerRegion(state: GameState, marker: MarkerId): number | null {
  for (let i = 0; i < state.regions.length; i++) {
    if ((state.regions[i] as RegionState).markers.includes(marker)) return i;
  }
  return null;
}

export function findFigureRegion(state: GameState, kind: string): number | null {
  for (let i = 0; i < state.regions.length; i++) {
    if ((state.regions[i] as RegionState).figures.some((f) => f.kind === kind)) return i;
  }
  return null;
}

/** Player controls a relic for USE: his active race occupies its region. */
export function controlsRelic(state: GameState, player: number, relic: RelicId): boolean {
  const rid = findMarkerRegion(state, relic);
  if (rid === null) return false;
  const r = state.regions[rid] as RegionState;
  return r.owner === player && !r.inDecline && r.tokens > 0;
}

/** A relic is "in play" once discovered and on the board (for the Bag). */
export function relicInPlay(state: GameState, relic: RelicId): boolean {
  return findMarkerRegion(state, relic) !== null;
}

/** Bag available for use this turn (Magic power, not used yet). */
export function bagAvailable(state: GameState, player: number): boolean {
  return (
    hasActivePower(state, player, 'magic') &&
    state.turnFlags.bagUsedAs === null &&
    state.activePlayer === player &&
    state.bagLocation !== null
  );
}

/**
 * Immunity from Balrog / Great Ancient / Queen / Ghost. The Balrog blocks
 * everyone; the other figures block opponents of the figure's owner (A16).
 * The Ghost's protection holds for whoever it protects, regardless of the
 * crypt's current controller, except against the region's own occupant.
 */
export function isImmuneFor(state: GameState, regionId: number, attacker: number): boolean {
  const r = state.regions[regionId] as RegionState;
  for (const f of r.figures) {
    if (f.kind === 'balrog') return true;
    if (f.kind === 'volcano') continue;
    if (f.kind === 'ghost') {
      // Immune unless the attacker already occupies it (cannot happen for a
      // conquest anyway); ghosts protect the region against everyone but the
      // occupant's own redeployments.
      if (r.owner !== attacker) return true;
    } else if (f.owner !== attacker) {
      return true;
    }
  }
  return false;
}

export function isGnomeRegion(state: GameState, regionId: number): boolean {
  const r = state.regions[regionId] as RegionState;
  return r.race === 'gnomes' && r.tokens > 0;
}

// ---------------------------------------------------------------------------
// Reach (which regions can be attacked, and how)

export interface ReachInfo {
  /** Plain map adjacency to own active regions, or First-Conquest edge entry. */
  plain: Set<number>;
  /** Reach granted by racial powers / Brass Pipe (blocked against Gnomes). */
  extended: Set<number>;
  /** Regions the Flames attack at as-if-empty cost. */
  flamesEmpty: Set<number>;
  entering: boolean;
}

export function computeReach(state: GameState, player: number): ReachInfo {
  const map = getMap(state);
  const p = state.players[player];
  const a = p?.active;
  const plain = new Set<number>();
  const extended = new Set<number>();
  const flamesEmpty = new Set<number>();
  if (!a) return { plain, extended, flamesEmpty, entering: true };

  const own = activeRegionIds(state, player);
  const entering = own.length === 0;
  const volcanoRegion = findFigureRegion(state, 'volcano');

  if (entering) {
    if (a.race === 'flames') {
      // Flames enter adjacent to the Volcano only (A53).
      if (volcanoRegion !== null) {
        for (const n of map.adjacency[volcanoRegion] as number[]) plain.add(n);
      }
    } else {
      for (const r of map.regions) if (r.isEdge) plain.add(r.id);
      if (a.race === 'spiderines') {
        for (const cid of chasmBorderRegions(map)) plain.add(cid);
      }
    }
  } else {
    for (const rid of own) {
      for (const n of map.adjacency[rid] as number[]) plain.add(n);
    }
    if (a.race === 'spiderines') {
      for (const cid of chasmBorderRegions(map)) extended.add(cid);
    }
    if (a.race === 'lizardmen') {
      for (const rid of lizardmenReach(state, map, player, own)) extended.add(rid);
    }
    if (a.race === 'flames' && volcanoRegion !== null) {
      for (const n of map.adjacency[volcanoRegion] as number[]) extended.add(n);
    }
    // Great Brass Pipe: all regions of the Pipe's terrain are mutually
    // adjacent for the player occupying the Pipe's region (A56).
    const pipe = findMarkerRegion(state, 'greatBrassPipe');
    if (pipe !== null) {
      const pr = state.regions[pipe] as RegionState;
      if (pr.owner === player && !pr.inDecline && pr.tokens > 0) {
        const terrain = (map.regions[pipe] as GameMap['regions'][number]).terrain;
        for (const r of map.regions) if (r.terrain === terrain) extended.add(r.id);
      }
    }
  }

  // Flames as-if-empty set: volcano-adjacent, plus regions adjacent to the
  // component of Flames regions connected to the volcano (A22).
  if (a.race === 'flames' && volcanoRegion !== null) {
    for (const n of map.adjacency[volcanoRegion] as number[]) flamesEmpty.add(n);
    const ownSet = new Set(own);
    const comp = new Set<number>();
    const queue: number[] = [];
    for (const n of map.adjacency[volcanoRegion] as number[]) {
      if (ownSet.has(n)) {
        comp.add(n);
        queue.push(n);
      }
    }
    while (queue.length > 0) {
      const cur = queue.pop() as number;
      for (const n of map.adjacency[cur] as number[]) {
        if (ownSet.has(n) && !comp.has(n)) {
          comp.add(n);
          queue.push(n);
        }
        if (!ownSet.has(n)) flamesEmpty.add(n);
      }
    }
  }

  // Never targetable: chasms, own active regions.
  for (const set of [plain, extended, flamesEmpty]) {
    for (const rid of [...set]) {
      const mr = map.regions[rid] as GameMap['regions'][number];
      const rs = state.regions[rid] as RegionState;
      if (mr.terrain === 'chasm') set.delete(rid);
      else if (rs.owner === player && !rs.inDecline && rs.tokens > 0) set.delete(rid);
    }
  }

  return { plain, extended, flamesEmpty, entering };
}

export function chasmBorderRegions(map: GameMap): number[] {
  const out = new Set<number>();
  for (const r of map.regions) {
    if (r.terrain !== 'chasm') continue;
    for (const n of map.adjacency[r.id] as number[]) {
      if ((map.regions[n] as GameMap['regions'][number]).terrain !== 'chasm') out.add(n);
    }
  }
  return [...out];
}

/**
 * Lizardmen river transparency (A17): unoccupied (or self-occupied) river
 * regions act as connectors. Returns regions reachable through river chains
 * that touch the player's territory, including blocking occupied river
 * regions at the chain ends and the passable river regions themselves.
 */
function lizardmenReach(
  state: GameState,
  map: GameMap,
  player: number,
  own: number[],
): Set<number> {
  const out = new Set<number>();
  const ownSet = new Set(own);
  const passable = (rid: number): boolean => {
    const mr = map.regions[rid] as GameMap['regions'][number];
    if (mr.terrain !== 'river') return false;
    const rs = state.regions[rid] as RegionState;
    return rs.tokens === 0 || rs.owner === player;
  };
  // BFS through passable river regions starting from rivers adjacent to
  // player's territory.
  const visited = new Set<number>();
  const queue: number[] = [];
  for (const rid of own) {
    for (const n of map.adjacency[rid] as number[]) {
      if (passable(n) && !visited.has(n)) {
        visited.add(n);
        queue.push(n);
      } else if (
        (map.regions[n] as GameMap['regions'][number]).terrain === 'river' &&
        !passable(n)
      ) {
        out.add(n); // occupied river adjacent to us: attackable normally anyway
      }
    }
  }
  while (queue.length > 0) {
    const cur = queue.pop() as number;
    out.add(cur); // passable river region is itself attackable (if empty of others)
    for (const n of map.adjacency[cur] as number[]) {
      const mr = map.regions[n] as GameMap['regions'][number];
      if (mr.terrain === 'river') {
        if (passable(n)) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        } else {
          out.add(n); // occupied river blocks passage but is attackable
        }
      } else if (mr.terrain !== 'chasm' && !ownSet.has(n)) {
        out.add(n); // land region bordering the passable chain
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conquest cost

export interface CostOptions extends ConquestBoosts {
  /** Attack benefits from Flames' as-if-empty cost. */
  flamesAsEmpty: boolean;
}

export const NO_BOOSTS: ConquestBoosts = {
  useSword: false,
  useSocks: false,
  useDoormat: false,
  bagAs: null,
};

/**
 * Tokens required to conquer `regionId`. Assumes target legality was already
 * established. `gnomeTarget` strips attacker-side benefits (RULES 4.4).
 */
export function conquestCost(
  state: GameState,
  player: number,
  regionId: number,
  opts: CostOptions,
): number {
  const map = getMap(state);
  const mr = map.regions[regionId] as GameMap['regions'][number];
  const rs = state.regions[regionId] as RegionState;
  const a = state.players[player]?.active;
  if (!a) throw new Error('no active race');
  const gnomeTarget = isGnomeRegion(state, regionId);

  const asEmpty =
    !gnomeTarget &&
    (opts.useSocks || opts.bagAs === 'stinkyTrollsSocks' || opts.flamesAsEmpty);

  let cost = mr.terrain === 'river' ? 1 : 2;
  if (!asEmpty) {
    cost += rs.monsters + rs.tokens + rs.armors;
  }
  if (rs.blackMountain) cost += 1;
  if (rs.markers.includes('keepOnMotherland')) cost += 1;

  // Attacker modifiers. Mummies' penalty always applies; benefits are
  // blocked against Gnome-held regions.
  if (a.race === 'mummies') cost += 1;
  if (!gnomeTarget) {
    if (a.race === 'ogres') cost -= 1;
    if (a.race === 'cultists') {
      const ga = findFigureRegion(state, 'greatAncient');
      if (ga !== null && adjacentForPlayer(state, player, ga, regionId)) cost -= 1;
    }
    // Vengeful discount against players this attacker has marked.
    const marks = state.players[player]?.vengeanceMarks ?? [];
    if (
      hasActivePower(state, player, 'vengeful') &&
      rs.owner !== null &&
      rs.owner !== player &&
      marks.includes(rs.owner)
    ) {
      cost -= 1;
    }
    if (opts.useSword || opts.bagAs === 'swordOfKillerRabbit') cost -= 2;
  }
  return Math.max(1, cost);
}

/** Effective adjacency between two specific regions, for the player (A20). */
export function adjacentForPlayer(
  state: GameState,
  player: number,
  from: number,
  to: number,
): boolean {
  const map = getMap(state);
  if ((map.adjacency[from] as number[]).includes(to)) return true;
  const a = state.players[player]?.active;
  if (!a) return false;
  if (a.race === 'spiderines') {
    const borders = new Set(chasmBorderRegions(map));
    if (borders.has(to)) return true;
  }
  const pipe = findMarkerRegion(state, 'greatBrassPipe');
  if (pipe !== null) {
    const pr = state.regions[pipe] as RegionState;
    if (pr.owner === player && !pr.inDecline && pr.tokens > 0) {
      const t = (map.regions[pipe] as GameMap['regions'][number]).terrain;
      if (
        (map.regions[from] as GameMap['regions'][number]).terrain === t &&
        (map.regions[to] as GameMap['regions'][number]).terrain === t
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Number of race tokens each player has on the board (tie-breaker). */
export function tokensOnBoard(state: GameState, player: number): number {
  let n = 0;
  for (const r of state.regions) {
    if (r.owner === player) n += r.tokens;
  }
  return n;
}

/**
 * Connected components of the player's regions (active race) under the
 * race's effective adjacency (A43). Used by Flocking and Quarreling.
 */
export function activeComponents(state: GameState, player: number): number[][] {
  const map = getMap(state);
  const own = activeRegionIds(state, player);
  const ownSet = new Set(own);
  const a = state.players[player]?.active;
  const spider = a?.race === 'spiderines';
  const chasmBorders = spider ? new Set(chasmBorderRegions(map)) : null;
  let pipeTerrain: string | null = null;
  const pipe = findMarkerRegion(state, 'greatBrassPipe');
  if (pipe !== null) {
    const pr = state.regions[pipe] as RegionState;
    if (pr.owner === player && !pr.inDecline && pr.tokens > 0) {
      pipeTerrain = (map.regions[pipe] as GameMap['regions'][number]).terrain;
    }
  }
  const linked = (x: number, y: number): boolean => {
    if ((map.adjacency[x] as number[]).includes(y)) return true;
    if (spider && chasmBorders && chasmBorders.has(x) && chasmBorders.has(y)) return true;
    if (
      pipeTerrain !== null &&
      (map.regions[x] as GameMap['regions'][number]).terrain === pipeTerrain &&
      (map.regions[y] as GameMap['regions'][number]).terrain === pipeTerrain
    ) {
      return true;
    }
    return false;
  };
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const start of own) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.pop() as number;
      comp.push(cur);
      for (const other of own) {
        if (!seen.has(other) && linked(cur, other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    comps.push(comp);
  }
  void ownSet;
  return comps;
}
