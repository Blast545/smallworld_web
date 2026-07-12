// getLegalActions / applyAction: the single source of truth for legality and
// the only way state changes. applyAction never mutates its input.

import { MARKERS, POWERS, RACES } from './data';
import type { MarkerId, PowerId, RaceId } from './data';
import type { GameMap } from './maps';
import { cloneState, freshTurnFlags, getMap } from './setup';
import {
  activeRegionIds,
  bagAvailable,
  computeReach,
  conquestBudget,
  conquestCost,
  controlsRelic,
  declinedRegionIds,
  findFigureRegion,
  findMarkerRegion,
  hasActivePower,
  hasDeclinedPower,
  isGnomeRegion,
  isImmuneFor,
  relicInPlay,
  NO_BOOSTS,
} from './queries';
import type { ReachInfo } from './queries';
import { computeTurnScore, getScores, totalScore } from './scoring';
import { nextInt, rollReinforcementDie, shuffled } from './rng';
import type { Action, ComboSlot, ConquestBoosts, GameState, RegionState } from './types';

// ---------------------------------------------------------------------------
// Small helpers

function log(state: GameState, player: number | null, text: string): void {
  state.log.push({ turn: state.turn, player, text });
}

function playerName(state: GameState, i: number): string {
  return state.config.players[i]?.name ?? `Player ${i + 1}`;
}

function raceName(race: RaceId): string {
  return RACES[race].name;
}

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing ${what}`);
  return v;
}

function region(state: GameState, id: number): RegionState {
  const r = state.regions[id];
  if (!r) throw new Error(`bad region ${id}`);
  return r;
}

// ---------------------------------------------------------------------------
// Market helpers

interface VisibleCombo {
  index: number; // 0..4 column, 5 = stack top
  banner: RaceId;
  power: PowerId | null;
  coins: number;
  cost: number;
}

export function visibleCombos(state: GameState): VisibleCombo[] {
  const out: VisibleCombo[] = [];
  state.column.forEach((c, i) => {
    if (c) out.push({ index: i, banner: c.banner, power: c.power, coins: c.coins, cost: i });
  });
  const topBanner = state.bannerStack[0];
  if (topBanner !== undefined) {
    out.push({
      index: 5,
      banner: topBanner,
      power: state.badgeStack[0] ?? null,
      coins: 0,
      cost: 5,
    });
  }
  return out;
}

/** Draw the next badge from the stack, reshuffling discards if needed (A13). */
function drawBadge(state: GameState): PowerId | null {
  if (state.badgeStack.length === 0 && state.badgeDiscard.length > 0) {
    const [reshuffled, rng] = shuffled(state.badgeDiscard, state.rng);
    state.badgeStack = reshuffled;
    state.badgeDiscard = [];
    state.rng = rng;
  }
  return state.badgeStack.shift() ?? null;
}

/** Refill the column so 6 combos are visible when supply allows. */
function replenishMarket(state: GameState): void {
  // Slide combos up to close gaps (coins ride along).
  const kept = state.column.filter((c): c is ComboSlot => c !== null);
  while (kept.length < 5) {
    const banner = state.bannerStack.shift();
    if (banner === undefined) break;
    kept.push({ banner, power: drawBadge(state), coins: 0 });
  }
  state.column = [...kept];
  while (state.column.length < 5) state.column.push(null);
}

/** A vanished race's banner returns to the market (A42). */
function returnBanner(state: GameState, race: RaceId, power: PowerId | null): void {
  // Any badge still attached to the vanished race is discarded.
  if (power !== null) state.badgeDiscard.push(power);
  const empty = state.column.findIndex((c) => c === null);
  if (empty >= 0) {
    state.column[empty] = { banner: race, power: drawBadge(state), coins: 0 };
  } else {
    state.bannerStack.push(race);
  }
}

// ---------------------------------------------------------------------------
// Race/board removal helpers

/** Remove a player's declined race from the map entirely. */
function removeDeclinedRace(state: GameState, player: number): void {
  const p = must(state.players[player], 'player');
  const d = p.declined;
  if (!d) return;
  for (const r of state.regions) {
    if (r.owner === player && r.inDecline) {
      state.tray[d.race] += r.tokens;
      clearRegionOccupancy(state, r);
    }
  }
  finishDeclinedRemoval(state, player);
}

/** Banner bookkeeping once a declined race has no tokens left anywhere. */
function checkDeclinedGone(state: GameState, player: number): void {
  const p = must(state.players[player], 'player');
  if (!p.declined) return;
  const hasRegions = declinedRegionIds(state, player).length > 0;
  const hasPending = state.pendingDefenders.some(
    (pd) => pd.player === player && pd.inDecline && pd.tokens > 0,
  );
  if (!hasRegions && !hasPending) finishDeclinedRemoval(state, player);
}

function finishDeclinedRemoval(state: GameState, player: number): void {
  const p = must(state.players[player], 'player');
  const d = p.declined;
  if (!d) return;
  log(state, player, `The In-Decline ${raceName(d.race)} have vanished from the map.`);
  returnBanner(state, d.race, d.power);
  p.declined = null;
  removeOrphanFigures(state);
}

/** Clear tokens/armors from a region (marker/mountain/figures stay). */
function clearRegionOccupancy(_state: GameState, r: RegionState): void {
  r.owner = null;
  r.race = null;
  r.inDecline = false;
  r.tokens = 0;
  r.armors = 0; // armors are discarded when the region is lost/abandoned
  r.hammers = 0;
}

/** Remove Queen/Great Ancient when their owning race left the board. */
function removeOrphanFigures(state: GameState): void {
  for (const r of state.regions) {
    r.figures = r.figures.filter((f) => {
      if (f.kind === 'queen') {
        if (f.owner === null) return false;
        return (
          hasActivePower(state, f.owner, 'royal') || hasDeclinedPower(state, f.owner, 'royal')
        );
      }
      if (f.kind === 'greatAncient') {
        if (f.owner === null) return false;
        return state.players[f.owner]?.active?.race === 'cultists';
      }
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// getLegalActions

export function getLegalActions(state: GameState): Action[] {
  if (state.gameOver) return [];
  switch (state.phase) {
    case 'pickCombo':
      return legalPickCombo(state);
    case 'mimeSwap':
      return legalMimeSwap(state);
    case 'volcanoPlace':
      return legalVolcanoPlace(state);
    case 'startTurn':
      return legalStartTurn(state);
    case 'conquest':
      return legalConquest(state);
    case 'balrogPlace':
      return legalBalrogPlace(state);
    case 'redeploy':
      return legalRedeploy(state);
    case 'declineRedeploy':
      return legalDeclineRedeploy(state);
    case 'endOfTurn':
      return legalEndOfTurn(state);
    case 'defenderRedeploy':
      return legalDefenderRedeploy(state);
    case 'gameOver':
      return [];
  }
}

function legalPickCombo(state: GameState): Action[] {
  const p = must(state.players[state.activePlayer], 'player');
  const out: Action[] = [];
  for (const c of visibleCombos(state)) {
    // Pocketed coins on the chosen combo count toward paying its cost (A11).
    if (p.coins + c.coins >= c.cost) out.push({ type: 'pickCombo', combo: c.index });
  }
  return out;
}

function legalMimeSwap(state: GameState): Action[] {
  const out: Action[] = [{ type: 'mimeSkip' }];
  for (const c of visibleCombos(state)) {
    if (c.power !== null) out.push({ type: 'mimeSwap', combo: c.index });
  }
  return out;
}

function legalVolcanoPlace(state: GameState): Action[] {
  const map = getMap(state);
  const out: Action[] = [];
  for (const r of map.regions) {
    if (r.volcanoSymbol) out.push({ type: 'placeVolcano', region: r.id });
  }
  return out;
}

function legalStartTurn(state: GameState): Action[] {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const out: Action[] = [];
  const f = state.turnFlags;

  if (p.active && !f.pickedThisTurn && !f.startActionsTaken) {
    out.push({ type: 'decline' });
  }
  if (p.active) {
    for (const rid of activeRegionIds(state, me)) {
      out.push({ type: 'abandon', region: rid });
    }
    // Cultists: move the Great Ancient to any occupied region.
    if (p.active.race === 'cultists' && !f.greatAncientMoved) {
      const ga = findFigureRegion(state, 'greatAncient');
      if (ga !== null) {
        for (const rid of activeRegionIds(state, me)) {
          if (rid !== ga) out.push({ type: 'moveGreatAncient', region: rid });
        }
      }
    }
    // Reborn: swap 1-2 declined regions for single active tokens (A10).
    if (hasDeclinedPower(state, me, 'reborn') && f.rebornUsed < 2) {
      const tokensAvailable = state.tray[p.active.race] > 0 || p.active.hand > 0;
      if (tokensAvailable) {
        for (const rid of declinedRegionIds(state, me)) {
          out.push({ type: 'rebornReplace', region: rid });
        }
      }
    }
  }
  out.push({ type: 'beginConquest' });
  return out;
}

interface ConquestOption {
  boosts: ConquestBoosts;
  cost: number;
}

/** Enumerate boost combinations that change reachability or cost. */
function conquestOptions(
  state: GameState,
  me: number,
  rid: number,
  reach: ReachInfo,
): ConquestOption[] {
  const r = region(state, rid);
  const gnome = isGnomeRegion(state, rid);
  const flamesAsEmpty = reach.flamesEmpty.has(rid);
  const reachable = reach.plain.has(rid) || (!gnome && reach.extended.has(rid));

  const swordReal = controlsRelic(state, me, 'swordOfKillerRabbit') && !state.turnFlags.swordUsed;
  const socksReal = controlsRelic(state, me, 'stinkyTrollsSocks') && !state.turnFlags.socksUsed;
  const doormatReal = controlsRelic(state, me, 'flyingDoormat') && !state.turnFlags.doormatUsed;
  const bagOk = bagAvailable(state, me);
  const bagSword = bagOk && relicInPlay(state, 'swordOfKillerRabbit');
  const bagSocks = bagOk && relicInPlay(state, 'stinkyTrollsSocks');
  const bagDoormat = bagOk && relicInPlay(state, 'flyingDoormat');

  const socksUseful = r.monsters + r.tokens + r.armors > 0 && !flamesAsEmpty;
  const needDoormat = !reachable;

  const opts: ConquestOption[] = [];
  const seen = new Set<string>();
  const swordModes: ('none' | 'real' | 'bag')[] = ['none'];
  if (!gnome && swordReal) swordModes.push('real');
  if (!gnome && bagSword) swordModes.push('bag');
  const socksModes: ('none' | 'real' | 'bag')[] = ['none'];
  if (!gnome && socksReal && socksUseful) socksModes.push('real');
  if (!gnome && bagSocks && socksUseful) socksModes.push('bag');
  const doormatModes: ('none' | 'real' | 'bag')[] = needDoormat ? [] : ['none'];
  if (needDoormat && !gnome) {
    if (doormatReal) doormatModes.push('real');
    if (bagDoormat) doormatModes.push('bag');
  }

  for (const sw of swordModes) {
    for (const so of socksModes) {
      for (const dm of doormatModes) {
        // The Bag can back at most one relic per turn.
        const bagUses = [sw, so, dm].filter((m) => m === 'bag').length;
        if (bagUses > 1) continue;
        const boosts: ConquestBoosts = {
          useSword: sw === 'real',
          useSocks: so === 'real',
          useDoormat: dm === 'real',
          bagAs:
            sw === 'bag'
              ? 'swordOfKillerRabbit'
              : so === 'bag'
                ? 'stinkyTrollsSocks'
                : dm === 'bag'
                  ? 'flyingDoormat'
                  : null,
        };
        const cost = conquestCost(state, me, rid, { ...boosts, flamesAsEmpty });
        const key = `${boosts.useSword}|${boosts.useSocks}|${boosts.useDoormat}|${boosts.bagAs}`;
        if (!seen.has(key)) {
          seen.add(key);
          opts.push({ boosts, cost });
        }
      }
    }
  }
  return opts;
}

function legalConquest(state: GameState): Action[] {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = p.active;
  const out: Action[] = [{ type: 'endConquest' }];
  if (!a) return out;

  const budget = conquestBudget(state, me);
  const reach = computeReach(state, me);
  const map = getMap(state);

  // A player must have at least one race token in hand to initiate a
  // conquest; Iron Dwarves additionally need a real dwarf in every conquest
  // (A15), which the same check enforces.
  const canInitiate = a.hand >= 1;

  const wisp = a.race === 'willOWisps';
  const ownCrystals = new Set(
    activeRegionIds(state, me).filter(
      (rid) => (map.regions[rid] as GameMap['regions'][number]).terrain === 'crystal',
    ),
  );

  for (let rid = 0; rid < state.regions.length; rid++) {
    const mr = map.regions[rid] as GameMap['regions'][number];
    if (mr.terrain === 'chasm') continue;
    const r = region(state, rid);
    if (r.owner === me && !r.inDecline && r.tokens > 0) continue;
    if (isImmuneFor(state, rid, me)) continue;
    const gnome = isGnomeRegion(state, rid);
    // Liches lockout: an attacker with no coins cannot conquer any
    // Liches-occupied region of an opponent (A25).
    if (r.race === 'liches' && r.tokens > 0 && r.owner !== me && p.coins < 1) continue;

    const plainReach = reach.plain.has(rid);
    const extReach = !gnome && reach.extended.has(rid);
    const anyReach = plainReach || extReach;

    if (canInitiate) {
      for (const opt of conquestOptions(state, me, rid, reach)) {
        const usesDoormat = opt.boosts.useDoormat || opt.boosts.bagAs === 'flyingDoormat';
        if (!anyReach && !usesDoormat) continue;
        if (budget >= opt.cost) {
          out.push({ type: 'conquer', region: rid, ...opt.boosts });
        } else if (opt.cost - budget <= 3) {
          out.push({ type: 'finalConquest', region: rid, ...opt.boosts });
        }
      }
      // Will-o'-Wisps die (A27/A28): before any conquest of a crystal region
      // or a region adjacent to an occupied crystal region. Racial power, so
      // never against Gnomes.
      if (wisp && anyReach && !gnome) {
        const nearOwnCrystal =
          mr.terrain === 'crystal' ||
          (map.adjacency[rid] as number[]).some((n) => ownCrystals.has(n));
        if (nearOwnCrystal) {
          const cost = conquestCost(state, me, rid, { ...NO_BOOSTS, flamesAsEmpty: false });
          if (cost - budget <= 3) out.push({ type: 'wispConquer', region: rid });
        }
      }
    }

    // Vampire / Shiny Orb substitutions: single active opponent token.
    const singleActiveOpp =
      r.owner !== null && r.owner !== me && !r.inDecline && r.tokens === 1 && !gnome;
    if (singleActiveOpp && anyReach) {
      const tokenAvailable = state.tray[a.race] > 0 || a.hand > 0;
      if (
        tokenAvailable &&
        hasActivePower(state, me, 'vampire') &&
        !state.turnFlags.vampireUsedVs.includes(r.owner as number)
      ) {
        out.push({ type: 'vampirize', region: rid });
      }
      if (tokenAvailable && controlsRelic(state, me, 'shinyOrb') && !state.turnFlags.orbUsed) {
        out.push({ type: 'orbConquer', region: rid, viaBag: false });
      }
      if (tokenAvailable && bagAvailable(state, me) && relicInPlay(state, 'shinyOrb')) {
        out.push({ type: 'orbConquer', region: rid, viaBag: true });
      }
    }
  }
  return out;
}

function legalBalrogPlace(state: GameState): Action[] {
  const out: Action[] = [];
  for (const rid of balrogTargets(state)) out.push({ type: 'placeBalrog', region: rid });
  return out;
}

function balrogTargets(state: GameState): number[] {
  const me = state.activePlayer;
  const map = getMap(state);
  const pentacle = state.turnFlags.pentacleRegion;
  if (pentacle === null) return [];
  const out: number[] = [];
  for (const n of map.adjacency[pentacle] as number[]) {
    const mr = map.regions[n] as GameMap['regions'][number];
    if (mr.terrain === 'chasm') continue;
    if (isGnomeRegion(state, n)) continue;
    if (isImmuneFor(state, n, me)) continue;
    out.push(n);
  }
  return out;
}

function legalRedeploy(state: GameState): Action[] {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = p.active;
  const out: Action[] = [];
  const own = a ? activeRegionIds(state, me) : [];
  if (a && own.length > 0) {
    for (const rid of own) {
      for (let c = 1; c <= a.hand; c++) out.push({ type: 'deploy', region: rid, count: c });
      if (p.armorHand > 0) out.push({ type: 'deployArmor', region: rid });
    }
  }
  if (!a || a.hand === 0 || own.length === 0) out.push({ type: 'endTurn' });
  return out;
}

function legalDeclineRedeploy(state: GameState): Action[] {
  const me = state.activePlayer;
  const out: Action[] = [];
  const pool = state.declineTombPool;
  const own = declinedRegionIds(state, me);
  if (pool > 0 && own.length > 0) {
    for (const rid of own) {
      for (let c = 1; c <= pool; c++) out.push({ type: 'deploy', region: rid, count: c });
    }
  } else {
    out.push({ type: 'endTurn' });
  }
  return out;
}

function legalEndOfTurn(state: GameState): Action[] {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const f = state.turnFlags;
  const out: Action[] = [{ type: 'finishTurn' }];
  const own = activeRegionIds(state, me);

  if (!f.declinedThisTurn && p.active && hasActivePower(state, me, 'royal') && !f.queenPlaced) {
    const queenAt = findFigureRegion(state, 'queen');
    for (const rid of own) {
      if (rid !== queenAt) out.push({ type: 'placeQueen', region: rid });
    }
  }

  if (!f.ghostPlaced) {
    const crypt = findMarkerRegion(state, 'cryptOfTombRaider');
    if (crypt !== null) {
      const cr = region(state, crypt);
      if (cr.owner === me && !cr.inDecline && cr.tokens > 0) {
        const ghostAt = findFigureRegion(state, 'ghost');
        const map = getMap(state);
        for (let rid = 0; rid < state.regions.length; rid++) {
          if (rid === crypt || rid === ghostAt) continue;
          const mr = map.regions[rid] as GameMap['regions'][number];
          if (mr.terrain === 'chasm') continue;
          if (region(state, rid).figures.some((fig) => fig.kind === 'balrog')) continue;
          out.push({ type: 'placeGhost', region: rid });
        }
      }
    }
  }

  if (!f.declinedThisTurn && p.active) {
    const bagOk = bagAvailable(state, me);
    // Scepter of Avarice.
    if (f.scepterRegion === null && controlsRelic(state, me, 'scepterOfAvarice')) {
      for (const rid of own) {
        if (rid !== f.bagScepterRegion) {
          out.push({ type: 'placeScepter', region: rid, viaBag: false });
        }
      }
    }
    if (bagOk && relicInPlay(state, 'scepterOfAvarice') && f.bagScepterRegion === null) {
      for (const rid of own) {
        if (rid !== f.scepterRegion) out.push({ type: 'placeScepter', region: rid, viaBag: true });
      }
    }
    // Froggy's Ring.
    if (f.ringRegion === null && controlsRelic(state, me, 'froggysRing')) {
      for (const rid of own) {
        if (rid !== f.bagRingRegion) out.push({ type: 'placeRing', region: rid, viaBag: false });
      }
    }
    if (bagOk && relicInPlay(state, 'froggysRing') && f.bagRingRegion === null) {
      for (const rid of own) {
        if (rid !== f.ringRegion) out.push({ type: 'placeRing', region: rid, viaBag: true });
      }
    }
  }

  // Altar of Souls: usable even In Decline.
  if (!f.altarUsed) {
    const altar = findMarkerRegion(state, 'altarOfSouls');
    if (altar !== null) {
      const ar = region(state, altar);
      if (ar.owner === me && ar.tokens > 0) {
        for (const rid of declinedRegionIds(state, me)) {
          out.push({ type: 'altarDiscard', region: rid });
        }
      }
    }
  }
  return out;
}

function legalDefenderRedeploy(state: GameState): Action[] {
  const pd = state.pendingDefenders[0];
  if (!pd) return [];
  const out: Action[] = [];
  const own = pd.inDecline
    ? declinedRegionIds(state, pd.player)
    : activeRegionIds(state, pd.player);
  for (const rid of own) {
    for (let c = 1; c <= pd.tokens; c++) out.push({ type: 'defDeploy', region: rid, count: c });
  }
  return out;
}

// ---------------------------------------------------------------------------
// applyAction

export function applyAction(prev: GameState, action: Action): GameState {
  if (prev.gameOver) throw new Error('game is over');
  const state = cloneState(prev);
  state.actionCount += 1;
  switch (action.type) {
    case 'pickCombo':
      applyPickCombo(state, action.combo);
      break;
    case 'mimeSwap':
      applyMimeSwap(state, action.combo);
      break;
    case 'mimeSkip':
      applyMimeSkip(state);
      break;
    case 'placeVolcano':
      applyPlaceVolcano(state, action.region);
      break;
    case 'decline':
      applyDecline(state);
      break;
    case 'abandon':
      applyAbandon(state, action.region);
      break;
    case 'moveGreatAncient':
      applyMoveGreatAncient(state, action.region);
      break;
    case 'rebornReplace':
      applyRebornReplace(state, action.region);
      break;
    case 'beginConquest':
      applyBeginConquest(state);
      break;
    case 'conquer':
      applyConquer(state, action.region, action, false);
      break;
    case 'finalConquest':
      applyFinalConquest(state, action.region, action);
      break;
    case 'wispConquer':
      applyWispConquer(state, action.region);
      break;
    case 'vampirize':
      applySubstitution(state, action.region, 'vampire', false);
      break;
    case 'orbConquer':
      applySubstitution(state, action.region, 'orb', action.viaBag);
      break;
    case 'endConquest':
      requirePhase(state, 'conquest');
      startRedeployPhase(state);
      break;
    case 'placeBalrog':
      applyPlaceBalrog(state, action.region);
      break;
    case 'deploy':
      applyDeploy(state, action.region, action.count);
      break;
    case 'deployArmor':
      applyDeployArmor(state, action.region);
      break;
    case 'endTurn':
      applyEndTurn(state);
      break;
    case 'placeQueen':
      applyPlaceQueen(state, action.region);
      break;
    case 'placeGhost':
      applyPlaceGhost(state, action.region);
      break;
    case 'placeScepter':
      applyPlaceScepter(state, action.region, action.viaBag);
      break;
    case 'placeRing':
      applyPlaceRing(state, action.region, action.viaBag);
      break;
    case 'altarDiscard':
      applyAltarDiscard(state, action.region);
      break;
    case 'finishTurn':
      applyFinishTurn(state);
      break;
    case 'defDeploy':
      applyDefDeploy(state, action.region, action.count);
      break;
  }
  return state;
}

function requirePhase(state: GameState, ...phases: string[]): void {
  if (!phases.includes(state.phase)) {
    throw new Error(`action not allowed in phase ${state.phase}`);
  }
}

// ---------------------------------------------------------------------------
// Combo picking

function applyPickCombo(state: GameState, comboIndex: number): void {
  requirePhase(state, 'pickCombo');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const combos = visibleCombos(state);
  const chosen = combos.find((c) => c.index === comboIndex);
  if (!chosen) throw new Error(`combo ${comboIndex} not available`);
  if (p.coins + chosen.coins < chosen.cost) throw new Error('cannot afford combo');

  // Pocket the coins on the combo, then pay one per combo above (A11).
  p.coins += chosen.coins;
  p.coins -= chosen.cost;
  if (comboIndex === 5) {
    state.bannerStack.shift();
    if (chosen.power !== null) state.badgeStack.shift();
    // Coins dropped on the 5 column combos.
    state.column.forEach((c) => {
      if (c) c.coins += 1;
    });
  } else {
    for (let i = 0; i < comboIndex; i++) {
      const c = state.column[i];
      if (c) c.coins += 1;
    }
    state.column[comboIndex] = null;
  }

  p.active = {
    race: chosen.banner,
    power: chosen.power,
    hand: 0, // granted after the (potential) Mime swap
    hammerPool: 0,
  };
  state.turnFlags.pickedThisTurn = true;
  log(
    state,
    me,
    `${playerName(state, me)} picks ${raceName(chosen.banner)}${
      chosen.power ? ` + ${POWERS[chosen.power].name}` : ''
    }${chosen.coins > 0 ? ` (pockets ${chosen.coins} coins)` : ''}.`,
  );

  if (chosen.banner === 'shadowMimes' && visibleCombos(state).some((c) => c.power !== null)) {
    state.phase = 'mimeSwap';
    return;
  }
  finalizePick(state);
}

function applyMimeSwap(state: GameState, comboIndex: number): void {
  requirePhase(state, 'mimeSwap');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  const target = visibleCombos(state).find((c) => c.index === comboIndex);
  if (!target || target.power === null) throw new Error('bad mime swap target');
  const takenPower = target.power;
  const myPower = a.power;
  a.power = takenPower;
  if (comboIndex === 5) {
    if (myPower !== null) state.badgeStack[0] = myPower;
    else state.badgeStack.shift();
  } else {
    const slot = must(state.column[comboIndex], 'combo slot');
    slot.power = myPower;
  }
  log(state, me, `${playerName(state, me)} mimics ${POWERS[takenPower].name}.`);
  finalizePick(state);
}

function applyMimeSkip(state: GameState): void {
  requirePhase(state, 'mimeSwap');
  finalizePick(state);
}

function finalizePick(state: GameState): void {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  const tokens = RACES[a.race].banner + (a.power ? POWERS[a.power].value : 0);
  const granted = Math.min(tokens, state.tray[a.race]);
  state.tray[a.race] -= granted;
  a.hand = granted;
  log(state, me, `${playerName(state, me)} receives ${granted} ${raceName(a.race)} tokens.`);

  replenishMarket(state);
  // Flames choose a volcano-symbol chasm for the Volcano (their entry point).
  if (a.race === 'flames') {
    const map = getMap(state);
    const sites = map.regions.filter((r) => r.volcanoSymbol);
    if (sites.length > 1) {
      state.phase = 'volcanoPlace';
      return;
    }
    placeVolcano(state, me, (sites[0] as GameMap['regions'][number]).id);
  }
  state.phase = 'startTurn';
}

function placeVolcano(state: GameState, me: number, rid: number): void {
  const map = getMap(state);
  const mr = map.regions[rid] as GameMap['regions'][number];
  if (!mr.volcanoSymbol) throw new Error('not a volcano chasm');
  // Remove any parked volcano from an earlier Flames episode (A39).
  for (const r of state.regions) {
    r.figures = r.figures.filter((f) => f.kind !== 'volcano');
  }
  region(state, rid).figures.push({ kind: 'volcano', owner: me });
  log(state, me, `The Volcano erupts in region ${rid}.`);
}

function applyPlaceVolcano(state: GameState, rid: number): void {
  requirePhase(state, 'volcanoPlace');
  placeVolcano(state, state.activePlayer, rid);
  state.phase = 'startTurn';
}

// ---------------------------------------------------------------------------
// Start of turn

function applyDecline(state: GameState): void {
  requirePhase(state, 'startTurn');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const f = state.turnFlags;
  if (f.pickedThisTurn || f.startActionsTaken) throw new Error('decline not allowed now');
  const a = must(p.active, 'active race');

  // Remove the previous In-Decline race first.
  removeDeclinedRace(state, me);

  const tomb = hasActivePower(state, me, 'tomb');
  const vanishing = hasActivePower(state, me, 'vanishing');
  const own = activeRegionIds(state, me);

  // Hand tokens and hammers return to the supply.
  state.tray[a.race] += a.hand;
  a.hand = 0;
  a.hammerPool = 0;
  for (const r of state.regions) r.hammers = 0;
  if (p.armorHand > 0) p.armorHand = 0;
  if (hasActivePower(state, me, 'magic')) state.bagLocation = null;

  if (vanishing) {
    f.vanishedRegions = own.length;
    for (const rid of own) {
      const r = region(state, rid);
      state.tray[a.race] += r.tokens;
      clearRegionOccupancy(state, r);
    }
    log(state, me, `${playerName(state, me)}'s ${raceName(a.race)} vanish (Vanishing).`);
  } else {
    for (const rid of own) {
      const r = region(state, rid);
      if (!tomb) {
        state.tray[a.race] += r.tokens - 1;
        r.tokens = 1;
      }
      r.inDecline = true;
    }
  }

  // Badge: kept when it has In-Decline effects, discarded otherwise (A36).
  const keptPower = a.power !== null && POWERS[a.power].persistsInDecline ? a.power : null;
  if (a.power !== null && keptPower === null) state.badgeDiscard.push(a.power);

  if (a.race === 'cultists') {
    for (const r of state.regions) {
      r.figures = r.figures.filter((fig) => fig.kind !== 'greatAncient');
    }
  }
  // The Volcano stays parked on its chasm (A39) but stops belonging to us.
  for (const r of state.regions) {
    for (const fig of r.figures) if (fig.kind === 'volcano') fig.owner = null;
  }

  if (vanishing || own.length === 0) {
    // Nothing remains on the map: banner goes straight back to the market.
    returnBanner(state, a.race, null);
    if (a.power !== null && keptPower !== null) state.badgeDiscard.push(keptPower);
    p.declined = null;
  } else {
    p.declined = { race: a.race, power: keptPower };
  }
  p.active = null;
  f.declinedThisTurn = true;
  log(state, me, `${playerName(state, me)} puts ${raceName(a.race)} In Decline.`);
  removeOrphanFigures(state);

  if (tomb && !vanishing && own.length > 0) {
    // Tomb: keep all tokens; allow one final redeployment (A37).
    let pool = 0;
    for (const rid of own) {
      const r = region(state, rid);
      pool += r.tokens - 1;
      r.tokens = 1;
    }
    state.declineTombPool = pool;
    state.phase = pool > 0 ? 'declineRedeploy' : 'endOfTurn';
    return;
  }
  state.phase = 'endOfTurn';
}

function applyAbandon(state: GameState, rid: number): void {
  requirePhase(state, 'startTurn');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  const r = region(state, rid);
  if (r.owner !== me || r.inDecline || r.tokens === 0) throw new Error('not your active region');
  a.hand += r.tokens;
  clearRegionOccupancy(state, r);
  state.turnFlags.startActionsTaken = true;
  log(state, me, `${playerName(state, me)} abandons region ${rid}.`);
  removeOrphanFigures(state);
}

function applyMoveGreatAncient(state: GameState, rid: number): void {
  requirePhase(state, 'startTurn');
  const me = state.activePlayer;
  const f = state.turnFlags;
  if (f.greatAncientMoved) throw new Error('Great Ancient already moved');
  const r = region(state, rid);
  if (r.owner !== me || r.inDecline || r.tokens === 0) throw new Error('not your active region');
  const from = findFigureRegion(state, 'greatAncient');
  if (from === null) throw new Error('Great Ancient not on the board');
  const fr = region(state, from);
  const fig = fr.figures.find((x) => x.kind === 'greatAncient');
  fr.figures = fr.figures.filter((x) => x.kind !== 'greatAncient');
  if (fig) r.figures.push(fig);
  f.greatAncientMoved = true;
  f.startActionsTaken = true;
  log(state, me, `The Great Ancient moves to region ${rid}.`);
}

function applyRebornReplace(state: GameState, rid: number): void {
  requirePhase(state, 'startTurn');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  const f = state.turnFlags;
  if (!hasDeclinedPower(state, me, 'reborn')) throw new Error('no Reborn power');
  if (f.rebornUsed >= 2) throw new Error('Reborn already used twice');
  const d = must(p.declined, 'declined race');
  const r = region(state, rid);
  if (r.owner !== me || !r.inDecline || r.tokens === 0) throw new Error('not your declined region');
  // Token from tray, else from hand (A10).
  if (state.tray[a.race] > 0) state.tray[a.race] -= 1;
  else if (a.hand > 0) a.hand -= 1;
  else throw new Error('no active token available');
  state.tray[d.race] += r.tokens;
  r.race = a.race;
  r.inDecline = false;
  r.tokens = 1;
  f.rebornUsed += 1;
  f.startActionsTaken = true;
  log(state, me, `Reborn: region ${rid} now hosts ${raceName(a.race)}.`);
  checkDeclinedGone(state, me);
}

function applyBeginConquest(state: GameState): void {
  requirePhase(state, 'startTurn');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = p.active;
  if (a) {
    // Ready troops: pick up all but one token per region (A14).
    for (const rid of activeRegionIds(state, me)) {
      const r = region(state, rid);
      a.hand += r.tokens - 1;
      r.tokens = 1;
    }
  }
  state.phase = 'conquest';
}

// ---------------------------------------------------------------------------
// Conquest resolution

interface ConquestOutcome {
  drawnMarker: MarkerId | null;
}

/**
 * Shared conquest resolution: displaces defenders/monsters, deploys
 * `deployTokens` real tokens (+hammers), draws a marker if monsters were
 * present. Legality checks happen before this is called.
 */
function resolveConquest(
  state: GameState,
  me: number,
  rid: number,
  deployReal: number,
  deployHammers: number,
  opts: { socks: boolean },
): ConquestOutcome {
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  const r = region(state, rid);
  const hadMonsters = r.monsters > 0;

  // Displace defenders.
  if (r.owner !== null && r.tokens > 0) {
    const defPlayer = r.owner;
    const dp = must(state.players[defPlayer], 'defender');
    const defRace = must(r.race, 'defender race');
    const defDeclined = r.inDecline;

    // Liches tax (A25): pay 1 coin to the owner of In-Decline Liches.
    if (defDeclined && defRace === 'liches' && defPlayer !== me) {
      if (p.coins < 1) throw new Error('cannot conquer Liches with no coins');
      p.coins -= 1;
      dp.coins += 1;
      log(state, me, `${playerName(state, me)} pays 1 coin to the Liches' owner.`);
    }
    // Martyr: +1 coin when an opponent conquers a Martyr region.
    if (!defDeclined && defPlayer !== me && hasActivePower(state, defPlayer, 'martyr')) {
      dp.coins += 1;
      log(state, defPlayer, `Martyr: ${playerName(state, defPlayer)} gains 1 coin.`);
    }
    // Vengeful: the defender marks the attacker.
    if (defPlayer !== me && hasActivePower(state, defPlayer, 'vengeful')) {
      if (!dp.vengeanceMarks.includes(me)) dp.vengeanceMarks.push(me);
      log(state, defPlayer, `${playerName(state, defPlayer)} hands a Vengeance marker.`);
    }

    // Losses: 1 token to the tray, except Socks (all redeploy) and active
    // Immortal defenders (no loss). A single defending token is destroyed.
    const immortal =
      !defDeclined && defPlayer !== me && hasActivePower(state, defPlayer, 'immortal');
    const lost = opts.socks || immortal ? 0 : 1;
    const survivors = r.tokens - lost;
    state.tray[defRace] += lost;
    if (survivors > 0) {
      const existing = state.pendingDefenders.find(
        (pd) => pd.player === defPlayer && pd.inDecline === defDeclined,
      );
      if (existing) existing.tokens += survivors;
      else
        state.pendingDefenders.push({
          player: defPlayer,
          tokens: survivors,
          inDecline: defDeclined,
        });
    }
    clearRegionOccupancy(state, r);
    if (defDeclined) checkDeclinedGone(state, defPlayer);
  }

  // Monsters are destroyed (A49).
  if (r.monsters > 0) {
    state.monstersDestroyed += r.monsters;
    r.monsters = 0;
  }

  // Deploy.
  r.owner = me;
  r.race = a.race;
  r.inDecline = false;
  r.tokens = deployReal;
  r.hammers = deployHammers;
  a.hand -= deployReal;
  a.hammerPool -= deployHammers;

  // The Bag never falls to a conqueror; it goes back to its owner's hand.
  if (state.bagLocation === rid) {
    state.bagLocation = 'hand';
  }
  // A conquered Crypt frees the Ghost (RULES markers cluster).
  if (r.markers.includes('cryptOfTombRaider')) {
    for (const rr of state.regions) {
      rr.figures = rr.figures.filter((fig) => fig.kind !== 'ghost');
    }
  }
  removeOrphanFigures(state);

  // Draw a Place/Relic when the region held monsters.
  let drawn: MarkerId | null = null;
  if (hadMonsters) {
    drawn = state.markerDeck.shift() ?? null;
    if (drawn === null) throw new Error('marker deck empty on monster conquest');
    r.markers.push(drawn);
    log(state, me, `${playerName(state, me)} discovers ${MARKERS[drawn].name}!`);
    resolveDiscovery(state, me, rid, drawn);
  }
  state.turnFlags.conquestsMade += 1;
  return { drawnMarker: drawn };
}

function resolveDiscovery(state: GameState, me: number, rid: number, marker: MarkerId): void {
  if (marker === 'stonehedge') {
    // Draw a random badge from the stack, excluding the visible top (A51).
    if (state.badgeStack.length <= 1 && state.badgeDiscard.length > 0) {
      const [reshuffledBadges, rng2] = shuffled(state.badgeDiscard, state.rng);
      state.badgeStack = [...state.badgeStack, ...reshuffledBadges];
      state.badgeDiscard = [];
      state.rng = rng2;
    }
    if (state.badgeStack.length > 1) {
      const [idx, rng3] = nextInt(state.rng, state.badgeStack.length - 1);
      state.rng = rng3;
      const drawnPower = state.badgeStack.splice(idx + 1, 1)[0] as PowerId;
      state.stonehedgePower = drawnPower;
      log(state, me, `Stonehedge channels the ${POWERS[drawnPower].name} power.`);
    }
    return;
  }
  if (marker === 'wickedestPentacle') {
    state.turnFlags.pentacleRegion = rid;
    if (balrogTargets(state).length > 0) {
      state.turnFlags.balrogReturn = 'conquest';
      state.phase = 'balrogPlace';
    } else {
      state.turnFlags.pentacleRegion = null;
      log(state, me, 'The Balrog finds no lair and returns to the void.');
    }
    return;
  }
  // Cultists: the Great Ancient appears in the first region they conquer.
  // (Handled in conquer flow, not here.)
}

function applyPlaceBalrog(state: GameState, rid: number): void {
  requirePhase(state, 'balrogPlace');
  const me = state.activePlayer;
  if (!balrogTargets(state).includes(rid)) throw new Error('illegal Balrog target');
  const r = region(state, rid);
  // Displace occupants: they lose 2 tokens (A48); Immortal loses none.
  if (r.owner !== null && r.tokens > 0) {
    const defPlayer = r.owner;
    const defRace = must(r.race, 'race');
    const defDeclined = r.inDecline;
    const dp = must(state.players[defPlayer], 'defender');
    const immortal =
      !defDeclined && hasActivePower(state, defPlayer, 'immortal') && defPlayer !== me;
    const lost = immortal ? 0 : Math.min(2, r.tokens);
    state.tray[defRace] += lost;
    const survivors = r.tokens - lost;
    if (survivors > 0) {
      const existing = state.pendingDefenders.find(
        (pd) => pd.player === defPlayer && pd.inDecline === defDeclined,
      );
      if (existing) existing.tokens += survivors;
      else
        state.pendingDefenders.push({
          player: defPlayer,
          tokens: survivors,
          inDecline: defDeclined,
        });
    }
    if (!defDeclined && defPlayer !== me && hasActivePower(state, defPlayer, 'martyr')) {
      dp.coins += 1;
    }
    if (defPlayer !== me && hasActivePower(state, defPlayer, 'vengeful')) {
      if (!dp.vengeanceMarks.includes(me)) dp.vengeanceMarks.push(me);
    }
    clearRegionOccupancy(state, r);
    if (defDeclined) checkDeclinedGone(state, defPlayer);
  }
  if (r.monsters > 0) {
    state.monstersDestroyed += r.monsters;
    r.monsters = 0;
  }
  if (state.bagLocation === rid) state.bagLocation = 'hand';
  r.figures.push({ kind: 'balrog', owner: null });
  log(state, me, `The Balrog invades region ${rid}. It is immune and scores for nobody.`);
  removeOrphanFigures(state);

  const ret = state.turnFlags.balrogReturn ?? 'conquest';
  state.turnFlags.pentacleRegion = null;
  state.turnFlags.balrogReturn = null;
  if (ret === 'conquest') state.phase = 'conquest';
  else startRedeployPhase(state);
}

function assertConquestLegal(state: GameState, rid: number, boosts: ConquestBoosts): void {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  const map = getMap(state);
  const mr = map.regions[rid] as GameMap['regions'][number];
  const r = region(state, rid);
  if (mr.terrain === 'chasm') throw new Error('cannot conquer a chasm');
  if (r.owner === me && !r.inDecline && r.tokens > 0) throw new Error('already yours');
  if (isImmuneFor(state, rid, me)) throw new Error('region is immune');
  if (a.hand < 1) throw new Error('need a race token in hand');
  if (r.race === 'liches' && r.tokens > 0 && r.owner !== me && p.coins < 1) {
    throw new Error('no coins: cannot attack Liches');
  }
  const gnome = isGnomeRegion(state, rid);
  const reach = computeReach(state, me);
  const usesDoormat = boosts.useDoormat || boosts.bagAs === 'flyingDoormat';
  const reachable = reach.plain.has(rid) || (!gnome && reach.extended.has(rid)) || (!gnome && usesDoormat);
  if (!reachable) throw new Error('region not reachable');
  if (gnome && (boosts.useSword || boosts.useSocks || boosts.useDoormat || boosts.bagAs !== null)) {
    throw new Error('cannot use powers/relics against Gnomes');
  }
  if (boosts.useSword && (!controlsRelic(state, me, 'swordOfKillerRabbit') || state.turnFlags.swordUsed))
    throw new Error('Sword not available');
  if (boosts.useSocks && (!controlsRelic(state, me, 'stinkyTrollsSocks') || state.turnFlags.socksUsed))
    throw new Error('Socks not available');
  if (boosts.useDoormat && (!controlsRelic(state, me, 'flyingDoormat') || state.turnFlags.doormatUsed))
    throw new Error('Doormat not available');
  if (boosts.bagAs !== null) {
    if (!bagAvailable(state, me) || !relicInPlay(state, boosts.bagAs))
      throw new Error('Bag not available');
    if (
      (boosts.bagAs === 'swordOfKillerRabbit' && boosts.useSword) ||
      (boosts.bagAs === 'stinkyTrollsSocks' && boosts.useSocks) ||
      (boosts.bagAs === 'flyingDoormat' && boosts.useDoormat)
    ) {
      throw new Error('Bag cannot duplicate a power already applied (A32)');
    }
  }
}

function markBoostsUsed(state: GameState, rid: number, boosts: ConquestBoosts): void {
  const f = state.turnFlags;
  if (boosts.useSword) {
    f.swordUsed = true;
    moveMarker(state, 'swordOfKillerRabbit', rid);
  }
  if (boosts.useSocks) {
    f.socksUsed = true;
    moveMarker(state, 'stinkyTrollsSocks', rid);
  }
  if (boosts.useDoormat) {
    f.doormatUsed = true;
    moveMarker(state, 'flyingDoormat', rid);
  }
  if (boosts.bagAs !== null) {
    f.bagUsedAs = boosts.bagAs;
    state.bagLocation = rid;
  }
}

function moveMarker(state: GameState, marker: MarkerId, to: number): void {
  const from = findMarkerRegion(state, marker);
  if (from !== null) {
    const fr = region(state, from);
    fr.markers = fr.markers.filter((m) => m !== marker);
  }
  region(state, to).markers.push(marker);
}

function applyConquer(
  state: GameState,
  rid: number,
  boosts: ConquestBoosts,
  viaDie: boolean,
): void {
  requirePhase(state, 'conquest');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  assertConquestLegal(state, rid, boosts);
  const reach = computeReach(state, me);
  const cost = conquestCost(state, me, rid, { ...boosts, flamesAsEmpty: reach.flamesEmpty.has(rid) });
  const budget = conquestBudget(state, me);
  if (budget < cost) throw new Error('not enough tokens');

  // Spend hammers first (A15), always at least one real token.
  const hammers = a.race === 'ironDwarves' ? Math.min(a.hammerPool, cost - 1) : 0;
  const real = cost - hammers;
  const socks = boosts.useSocks || boosts.bagAs === 'stinkyTrollsSocks';
  markBoostsUsed(state, rid, boosts);
  const firstConquest = reach.entering;
  resolveConquest(state, me, rid, real, hammers, { socks });
  log(state, me, `${playerName(state, me)} conquers region ${rid} with ${cost} token(s).`);

  // Cultists: the Great Ancient appears in their first conquered region.
  if (a.race === 'cultists' && findFigureRegion(state, 'greatAncient') === null && firstConquest) {
    region(state, rid).figures.push({ kind: 'greatAncient', owner: me });
    log(state, me, 'The Great Ancient rises. Its region is immune.');
  }
  void viaDie;
}

function applyFinalConquest(state: GameState, rid: number, boosts: ConquestBoosts): void {
  requirePhase(state, 'conquest');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  assertConquestLegal(state, rid, boosts);
  const reach = computeReach(state, me);
  const cost = conquestCost(state, me, rid, { ...boosts, flamesAsEmpty: reach.flamesEmpty.has(rid) });
  const budget = conquestBudget(state, me);
  if (budget >= cost) throw new Error('not short: use a normal conquest');
  if (cost - budget > 3) throw new Error('short by more than 3');

  const [roll, rng] = rollReinforcementDie(state.rng);
  state.rng = rng;
  const firstConquest = reach.entering;
  if (budget + roll >= cost) {
    // Deploy ALL remaining tokens (and hammers) there — manual, final conquest.
    const hammers = a.race === 'ironDwarves' ? a.hammerPool : 0;
    const real = a.hand;
    const socks = boosts.useSocks || boosts.bagAs === 'stinkyTrollsSocks';
    markBoostsUsed(state, rid, boosts);
    resolveConquest(state, me, rid, real, hammers, { socks });
    log(
      state,
      me,
      `${playerName(state, me)} rolls ${roll} and wins the final conquest of region ${rid}.`,
    );
    if (
      a.race === 'cultists' &&
      findFigureRegion(state, 'greatAncient') === null &&
      firstConquest
    ) {
      region(state, rid).figures.push({ kind: 'greatAncient', owner: me });
    }
  } else {
    // The Doormat does not move on a failed attempt.
    log(
      state,
      me,
      `${playerName(state, me)} rolls ${roll}: the final conquest of region ${rid} fails.`,
    );
  }
  if (state.phase === 'conquest') startRedeployPhase(state);
  else state.turnFlags.balrogReturn = 'redeploy';
}

function applyWispConquer(state: GameState, rid: number): void {
  requirePhase(state, 'conquest');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  if (a.race !== 'willOWisps') throw new Error('not Will-o-Wisps');
  if (isGnomeRegion(state, rid)) throw new Error('racial die not usable against Gnomes');
  assertConquestLegal(state, rid, { ...NO_BOOSTS });
  const map = getMap(state);
  const mr = map.regions[rid] as GameMap['regions'][number];
  const ownCrystals = activeRegionIds(state, me).filter(
    (x) => (map.regions[x] as GameMap['regions'][number]).terrain === 'crystal',
  );
  const eligible =
    mr.terrain === 'crystal' ||
    (map.adjacency[rid] as number[]).some((n) => ownCrystals.includes(n));
  if (!eligible) throw new Error('target not near your Mystic Crystals');
  const cost = conquestCost(state, me, rid, { ...NO_BOOSTS, flamesAsEmpty: false });
  const budget = conquestBudget(state, me);
  if (cost - budget > 3) throw new Error('short by more than 3');

  const [roll, rng] = rollReinforcementDie(state.rng);
  state.rng = rng;
  if (budget + roll >= cost) {
    const spend = Math.max(1, cost - roll);
    const real = Math.min(a.hand, spend);
    resolveConquest(state, me, rid, real, 0, { socks: false });
    log(state, me, `Will-o'-Wisps roll ${roll} and conquer region ${rid} with ${real} token(s).`);
  } else {
    log(state, me, `Will-o'-Wisps roll ${roll} and fail; their conquests end (A28).`);
    startRedeployPhase(state);
  }
}

function applySubstitution(
  state: GameState,
  rid: number,
  kind: 'vampire' | 'orb',
  viaBag: boolean,
): void {
  requirePhase(state, 'conquest');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = must(p.active, 'active race');
  const r = region(state, rid);
  if (r.owner === null || r.owner === me || r.inDecline || r.tokens !== 1)
    throw new Error('target must be a single active opponent token');
  if (isGnomeRegion(state, rid)) throw new Error('Gnomes cannot be substituted');
  if (isImmuneFor(state, rid, me)) throw new Error('region is immune');
  if (r.race === 'liches' && p.coins < 1) throw new Error('no coins: cannot attack Liches');
  const reach = computeReach(state, me);
  if (!reach.plain.has(rid) && !reach.extended.has(rid)) throw new Error('not reachable');
  if (kind === 'vampire') {
    if (!hasActivePower(state, me, 'vampire')) throw new Error('no Vampire power');
    if (state.turnFlags.vampireUsedVs.includes(r.owner)) throw new Error('already used vs them');
  } else if (viaBag) {
    if (!bagAvailable(state, me) || !relicInPlay(state, 'shinyOrb'))
      throw new Error('Bag/Orb not available');
  } else {
    if (!controlsRelic(state, me, 'shinyOrb') || state.turnFlags.orbUsed)
      throw new Error('Orb not available');
  }
  const defPlayer = r.owner;
  const defRace = must(r.race, 'race');
  const dp = must(state.players[defPlayer], 'defender');
  // Bonus token from tray, else hand.
  if (state.tray[a.race] > 0) state.tray[a.race] -= 1;
  else if (a.hand > 0) a.hand -= 1;
  else throw new Error('no token available');

  // Substituted token goes to the tray; Immortal tokens are lost too.
  state.tray[defRace] += 1;
  if (hasActivePower(state, defPlayer, 'martyr')) dp.coins += 1;
  if (hasActivePower(state, defPlayer, 'vengeful') && !dp.vengeanceMarks.includes(me)) {
    dp.vengeanceMarks.push(me);
  }
  r.owner = me;
  r.race = a.race;
  r.inDecline = false;
  r.tokens = 1;
  // Armors protect but do not block substitution; they are discarded.
  r.armors = 0;
  if (state.bagLocation === rid) state.bagLocation = 'hand';
  if (r.markers.includes('cryptOfTombRaider')) {
    for (const rr of state.regions) {
      rr.figures = rr.figures.filter((fig) => fig.kind !== 'ghost');
    }
  }
  if (kind === 'vampire') {
    state.turnFlags.vampireUsedVs.push(defPlayer);
    log(state, me, `Vampires drain region ${rid}.`);
  } else {
    if (viaBag) {
      state.turnFlags.bagUsedAs = 'shinyOrb';
      state.bagLocation = rid;
    } else {
      state.turnFlags.orbUsed = true;
      moveMarker(state, 'shinyOrb', rid);
    }
    log(state, me, `The Shiny Orb subverts region ${rid}.`);
  }
  state.turnFlags.conquestsMade += 1;
  removeOrphanFigures(state);
}

// ---------------------------------------------------------------------------
// Redeployment

function startRedeployPhase(state: GameState): void {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const a = p.active;
  if (a) {
    // Empty the River (Kraken excepted).
    if (a.race !== 'kraken') {
      const map = getMap(state);
      for (let rid = 0; rid < state.regions.length; rid++) {
        const mr = map.regions[rid] as GameMap['regions'][number];
        const r = region(state, rid);
        if (mr.terrain === 'river' && r.owner === me && !r.inDecline && r.tokens > 0) {
          a.hand += r.tokens;
          a.hammerPool += r.hammers;
          clearRegionOccupancy(state, r);
        }
      }
    }
    // Mudmen: 1 new token per Mudpool region occupied.
    if (a.race === 'mudmen') {
      const map = getMap(state);
      const muds = activeRegionIds(state, me).filter(
        (rid) => (map.regions[rid] as GameMap['regions'][number]).terrain === 'mud',
      ).length;
      const gain = Math.min(muds, state.tray[a.race]);
      if (gain > 0) {
        state.tray[a.race] -= gain;
        a.hand += gain;
        log(state, me, `Mudmen grow: +${gain} token(s) from Mudpools.`);
      }
    }
    // Shield: 1 armor per Mushroom Forest region occupied (cap 8).
    if (hasActivePower(state, me, 'shield')) {
      const map = getMap(state);
      const shrooms = activeRegionIds(state, me).filter(
        (rid) => (map.regions[rid] as GameMap['regions'][number]).terrain === 'mushroom',
      ).length;
      const inPlay =
        state.regions.reduce((acc, r) => acc + r.armors, 0) +
        state.players.reduce((acc, pl) => acc + pl.armorHand, 0);
      const gain = Math.max(0, Math.min(shrooms, 8 - inPlay));
      if (gain > 0) {
        p.armorHand += gain;
        log(state, me, `Shield: +${gain} Mushroom Armor(s).`);
      }
    }
  }
  state.phase = 'redeploy';
}

function applyDeploy(state: GameState, rid: number, count: number): void {
  requirePhase(state, 'redeploy', 'declineRedeploy');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const r = region(state, rid);
  if (state.phase === 'redeploy') {
    const a = must(p.active, 'active race');
    if (r.owner !== me || r.inDecline || r.tokens === 0) throw new Error('not your active region');
    if (count < 1 || count > a.hand) throw new Error('bad deploy count');
    a.hand -= count;
    r.tokens += count;
  } else {
    // Tomb final redeployment among declined regions (A37).
    const pool = state.declineTombPool;
    if (r.owner !== me || !r.inDecline || r.tokens === 0)
      throw new Error('not your declined region');
    if (count < 1 || count > pool) throw new Error('bad deploy count');
    state.declineTombPool = pool - count;
    r.tokens += count;
  }
}

function applyDeployArmor(state: GameState, rid: number): void {
  requirePhase(state, 'redeploy');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const r = region(state, rid);
  if (r.owner !== me || r.inDecline || r.tokens === 0) throw new Error('not your active region');
  if (p.armorHand < 1) throw new Error('no armor in hand');
  p.armorHand -= 1;
  r.armors += 1;
}

function applyEndTurn(state: GameState): void {
  requirePhase(state, 'redeploy', 'declineRedeploy');
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  if (state.phase === 'redeploy') {
    const a = p.active;
    if (a && a.hand > 0 && activeRegionIds(state, me).length > 0) {
      throw new Error('deploy your hand first');
    }
    if (a) {
      // Iron Dwarves: gain a hammer per Mine region, then pull hammers off
      // the map (A15/A30 guarantee one dwarf stays everywhere).
      if (a.race === 'ironDwarves') {
        const map = getMap(state);
        const mines = activeRegionIds(state, me).filter(
          (rid) => (map.regions[rid] as GameMap['regions'][number]).terrain === 'mine',
        ).length;
        const inPlay =
          a.hammerPool + state.regions.reduce((acc, r) => acc + r.hammers, 0);
        const gain = Math.max(0, Math.min(mines, 7 - inPlay));
        a.hammerPool += gain;
        for (const r of state.regions) {
          if (r.owner === me && r.hammers > 0) {
            a.hammerPool += r.hammers;
            r.hammers = 0;
          }
        }
        if (gain > 0) log(state, me, `Iron Dwarves forge ${gain} Silver Hammer(s).`);
      }
      // Undeployed armors return to the tray.
      p.armorHand = 0;
    }
  } else {
    if (state.declineTombPool > 0) throw new Error('redeploy your Tomb tokens first');
  }
  state.phase = 'endOfTurn';
}

// ---------------------------------------------------------------------------
// End of turn

function applyPlaceQueen(state: GameState, rid: number): void {
  requirePhase(state, 'endOfTurn');
  const me = state.activePlayer;
  const f = state.turnFlags;
  if (f.declinedThisTurn) throw new Error('the Queen stays put on a decline turn (A41)');
  if (f.queenPlaced) throw new Error('Queen already placed');
  if (!hasActivePower(state, me, 'royal')) throw new Error('no Royal power');
  const r = region(state, rid);
  if (r.owner !== me || r.inDecline || r.tokens === 0) throw new Error('not your active region');
  for (const rr of state.regions) {
    rr.figures = rr.figures.filter((fig) => fig.kind !== 'queen');
  }
  r.figures.push({ kind: 'queen', owner: me });
  f.queenPlaced = true;
  log(state, me, `The Queen holds court in region ${rid} (immune).`);
}

function applyPlaceGhost(state: GameState, rid: number): void {
  requirePhase(state, 'endOfTurn');
  const me = state.activePlayer;
  const f = state.turnFlags;
  if (f.ghostPlaced) throw new Error('Ghost already placed');
  const crypt = findMarkerRegion(state, 'cryptOfTombRaider');
  if (crypt === null) throw new Error('Crypt not in play');
  const cr = region(state, crypt);
  if (cr.owner !== me || cr.inDecline || cr.tokens === 0)
    throw new Error('you do not control the Crypt with active troops');
  if (rid === crypt) throw new Error('Ghost cannot protect the Crypt itself');
  const map = getMap(state);
  if ((map.regions[rid] as GameMap['regions'][number]).terrain === 'chasm')
    throw new Error('no ghosts in chasms');
  const r = region(state, rid);
  if (r.figures.some((fig) => fig.kind === 'balrog')) throw new Error('the Balrog is there');
  for (const rr of state.regions) {
    rr.figures = rr.figures.filter((fig) => fig.kind !== 'ghost');
  }
  r.figures.push({ kind: 'ghost', owner: me });
  f.ghostPlaced = true;
  log(state, me, `The Tomb-raider's Ghost haunts region ${rid} (immune).`);
}

function applyPlaceScepter(state: GameState, rid: number, viaBag: boolean): void {
  requirePhase(state, 'endOfTurn');
  const me = state.activePlayer;
  const f = state.turnFlags;
  if (f.declinedThisTurn) throw new Error('relics cannot be used on a decline turn');
  const r = region(state, rid);
  if (r.owner !== me || r.inDecline || r.tokens === 0) throw new Error('not your active region');
  if (viaBag) {
    if (!bagAvailable(state, me) || !relicInPlay(state, 'scepterOfAvarice'))
      throw new Error('Bag/Scepter not available');
    if (f.bagScepterRegion !== null) throw new Error('Bag already used');
    if (f.scepterRegion === rid) throw new Error('Scepter already applies there (A32)');
    f.bagScepterRegion = rid;
    f.bagUsedAs = 'scepterOfAvarice';
    state.bagLocation = rid;
  } else {
    if (!controlsRelic(state, me, 'scepterOfAvarice')) throw new Error('no Scepter');
    if (f.scepterRegion !== null) throw new Error('Scepter already placed');
    if (f.bagScepterRegion === rid) throw new Error('Bag-Scepter already applies there (A32)');
    f.scepterRegion = rid;
    moveMarker(state, 'scepterOfAvarice', rid);
  }
  log(state, me, `The Scepter of Avarice gleams over region ${rid}.`);
}

function applyPlaceRing(state: GameState, rid: number, viaBag: boolean): void {
  requirePhase(state, 'endOfTurn');
  const me = state.activePlayer;
  const f = state.turnFlags;
  if (f.declinedThisTurn) throw new Error('relics cannot be used on a decline turn');
  const r = region(state, rid);
  if (r.owner !== me || r.inDecline || r.tokens === 0) throw new Error('not your active region');
  if (viaBag) {
    if (!bagAvailable(state, me) || !relicInPlay(state, 'froggysRing'))
      throw new Error('Bag/Ring not available');
    if (f.bagRingRegion !== null) throw new Error('Bag already used');
    if (f.ringRegion === rid) throw new Error('Ring already applies there (A32)');
    f.bagRingRegion = rid;
    f.bagUsedAs = 'froggysRing';
    state.bagLocation = rid;
  } else {
    if (!controlsRelic(state, me, 'froggysRing')) throw new Error('no Ring');
    if (f.ringRegion !== null) throw new Error('Ring already placed');
    if (f.bagRingRegion === rid) throw new Error('Bag-Ring already applies there (A32)');
    f.ringRegion = rid;
    moveMarker(state, 'froggysRing', rid);
  }
  log(state, me, `Froggy's Ring croaks in region ${rid}.`);
}

function applyAltarDiscard(state: GameState, rid: number): void {
  requirePhase(state, 'endOfTurn');
  const me = state.activePlayer;
  const f = state.turnFlags;
  if (f.altarUsed) throw new Error('Altar already used');
  const altar = findMarkerRegion(state, 'altarOfSouls');
  if (altar === null) throw new Error('Altar not in play');
  const ar = region(state, altar);
  if (ar.owner !== me || ar.tokens === 0) throw new Error('you do not occupy the Altar');
  const p = must(state.players[me], 'player');
  const d = must(p.declined, 'declined race');
  const r = region(state, rid);
  if (r.owner !== me || !r.inDecline || r.tokens === 0) throw new Error('not your declined region');
  r.tokens -= 1;
  state.tray[d.race] += 1;
  if (r.tokens === 0) clearRegionOccupancy(state, r);
  f.altarUsed = true;
  log(state, me, `Altar of Souls: a soul is offered from region ${rid} (+3 coins).`);
  checkDeclinedGone(state, me);
}

function applyFinishTurn(state: GameState): void {
  requirePhase(state, 'endOfTurn');
  advanceToDefendersOrScore(state);
}

function advanceToDefendersOrScore(state: GameState): void {
  // Resolve pending defenders in seat order (A34); auto-resolve those with
  // no choice, hand interactive redeploys to the defender.
  while (state.pendingDefenders.length > 0) {
    const pd = state.pendingDefenders[0];
    if (!pd || pd.tokens === 0) {
      state.pendingDefenders.shift();
      continue;
    }
    const own = pd.inDecline
      ? declinedRegionIds(state, pd.player)
      : activeRegionIds(state, pd.player);
    if (own.length === 0) {
      const p = must(state.players[pd.player], 'player');
      if (pd.inDecline) {
        // In-Decline survivors with nowhere to go are lost (A33).
        const race = p.declined?.race;
        if (race) state.tray[race] += pd.tokens;
        state.pendingDefenders.shift();
        checkDeclinedGone(state, pd.player);
      } else if (p.active) {
        // Active survivors wait in hand and re-enter next turn.
        p.active.hand += pd.tokens;
        state.pendingDefenders.shift();
      } else {
        state.pendingDefenders.shift();
      }
      continue;
    }
    if (own.length === 1) {
      // No real choice: auto-deploy.
      const r = region(state, own[0] as number);
      r.tokens += pd.tokens;
      state.pendingDefenders.shift();
      continue;
    }
    state.phase = 'defenderRedeploy';
    state.chooser = pd.player;
    return;
  }
  scoreAndAdvance(state);
}

function applyDefDeploy(state: GameState, rid: number, count: number): void {
  requirePhase(state, 'defenderRedeploy');
  const pd = must(state.pendingDefenders[0], 'pending defender');
  const r = region(state, rid);
  if (r.owner !== pd.player || r.inDecline !== pd.inDecline || r.tokens === 0)
    throw new Error('not an eligible region');
  if (count < 1 || count > pd.tokens) throw new Error('bad count');
  r.tokens += count;
  pd.tokens -= count;
  if (pd.tokens === 0) {
    state.pendingDefenders.shift();
    state.chooser = state.activePlayer;
    advanceToDefendersOrScore(state);
  }
}

// ---------------------------------------------------------------------------
// Scoring & turn handoff

function scoreAndAdvance(state: GameState): void {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  const t = computeTurnScore(state, me);
  const bank = totalScore(t) - [...t.transfers.values()].reduce((a, b) => a + b, 0);
  p.coins += bank;
  for (const [other, amount] of t.transfers) {
    const op = must(state.players[other], 'player');
    const pay = Math.min(amount, op.coins);
    op.coins -= pay;
    p.coins += pay;
  }
  const total = totalScore(t);
  if (total > 0) {
    log(state, me, `${playerName(state, me)} scores ${total} victory coin(s).`);
  }

  // Vengeance markers handed out to opponents come back (A35).
  p.vengeanceMarks = [];

  // Next player.
  state.turnFlags = freshTurnFlags();
  state.declineTombPool = 0;
  const next = (me + 1) % state.players.length;
  if (next === 0) {
    if (state.turn >= state.maxTurns) {
      state.gameOver = true;
      state.phase = 'gameOver';
      const scores = getScores(state);
      state.winners = scores.winners;
      const names = scores.winners.map((w) => playerName(state, w)).join(', ');
      log(state, null, `Game over! Winner${scores.winners.length > 1 ? 's' : ''}: ${names}.`);
      return;
    }
    state.turn += 1;
    log(state, null, `— Turn ${state.turn} of ${state.maxTurns} —`);
  }
  state.activePlayer = next;
  state.chooser = next;
  beginPlayerTurn(state);
}

function beginPlayerTurn(state: GameState): void {
  const me = state.activePlayer;
  const p = must(state.players[me], 'player');
  // Fountain of Youth: automatic bonus token (A8/A9).
  if (p.active) {
    const fountain = findMarkerRegion(state, 'fountainOfYouth');
    if (fountain !== null) {
      const fr = region(state, fountain);
      if (fr.owner === me && !fr.inDecline && fr.tokens > 0 && state.tray[p.active.race] > 0) {
        state.tray[p.active.race] -= 1;
        p.active.hand += 1;
        log(state, me, `Fountain of Youth: +1 ${raceName(p.active.race)} token.`);
      }
    }
  }
  state.phase = p.active ? 'startTurn' : 'pickCombo';
}
