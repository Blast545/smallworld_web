// Heuristic bot: one-ply lookahead over getLegalActions with a weighted
// evaluation and seeded tie-breaking noise. It always returns a legal action
// and never throws — if simulation of a candidate fails, that candidate is
// skipped; if everything fails, the first legal action is returned.

import { applyAction, getLegalActions } from '../engine/actions';
import { POWERS, RACES, TERRAIN_NAMES } from '../engine/data';
import type { GameMap } from '../engine/maps';
import { conquestBudget, conquestCost, computeReach, NO_BOOSTS } from '../engine/queries';
import { hashString } from '../engine/rng';
import { getMap } from '../engine/setup';
import type { Action, GameState } from '../engine/types';
import { evaluate, racePrior } from './evaluate';

export interface BotDecision {
  action: Action;
  reason: string;
}

/** P(reinforcement die >= n) for shortfall n in 1..3 (faces 0,0,0,1,2,3). */
function dieSuccessProbability(shortfall: number): number {
  if (shortfall <= 0) return 1;
  if (shortfall === 1) return 3 / 6;
  if (shortfall === 2) return 2 / 6;
  if (shortfall === 3) return 1 / 6;
  return 0;
}

/**
 * Choose an action for `playerId` on a masked (visible) state.
 * Deterministic given (state, playerId).
 */
export function chooseAction(state: GameState, playerId: number): BotDecision {
  const legal = getLegalActions(state);
  if (legal.length === 0) throw new Error('bot asked to act with no legal actions');
  const fallback: BotDecision = {
    action: legal[0] as Action,
    reason: 'only reasonable option',
  };
  if (legal.length === 1) return fallback;

  const candidates = pruneCandidates(state, legal);
  let best: { action: Action; score: number } | null = null;
  for (const action of candidates) {
    let score: number;
    try {
      score = scoreCandidate(state, playerId, action);
    } catch {
      continue; // never let a simulation failure break the bot
    }
    score += tieNoise(state, playerId, action);
    if (best === null || score > best.score) best = { action, score };
  }
  if (best === null) return fallback;
  return { action: best.action, reason: describe(state, playerId, best.action) };
}

/** Cap the candidate list so decisions stay fast on a phone. */
function pruneCandidates(_state: GameState, legal: Action[]): Action[] {
  // Deploy-style actions: only "1" and "all" per region.
  const out: Action[] = [];
  const maxCount = new Map<string, number>();
  for (const a of legal) {
    if (a.type === 'deploy' || a.type === 'defDeploy') {
      const key = `${a.type}:${a.region}`;
      maxCount.set(key, Math.max(maxCount.get(key) ?? 0, a.count));
    }
  }
  for (const a of legal) {
    if (a.type === 'deploy' || a.type === 'defDeploy') {
      const key = `${a.type}:${a.region}`;
      if (a.count === 1 || a.count === maxCount.get(key)) out.push(a);
    } else {
      out.push(a);
    }
  }
  return out.length > 140 ? out.slice(0, 140) : out;
}

function scoreCandidate(state: GameState, me: number, action: Action): number {
  // Die-roll actions: evaluate as an expectation instead of sampling the
  // masked RNG, so the bot neither fears nor trusts a single simulated roll.
  if (action.type === 'finalConquest' || action.type === 'wispConquer') {
    const cost = conquestCost(state, me, action.region, {
      ...(action.type === 'finalConquest' ? action : NO_BOOSTS),
      flamesAsEmpty: computeReach(state, me).flamesEmpty.has(action.region),
    });
    const budget = conquestBudget(state, me);
    const p = dieSuccessProbability(cost - budget);
    const here = evaluate(state, me);
    const regionValue = 1.5 * Math.max(1, state.maxTurns - state.turn);
    // Failure ends the conquest phase: worth roughly the current position.
    return here + p * regionValue - 0.15;
  }
  const after = applyAction(state, action);
  let score = evaluate(after, me);
  score += shaping(state, after, me, action);
  return score;
}

/** Action-specific shaping the plain evaluation can't see. */
function shaping(before: GameState, _after: GameState, _me: number, action: Action): number {
  switch (action.type) {
    case 'decline': {
      // The evaluation collapses after a decline (no active race); add the
      // value of fielding a fresh race next turn.
      const turnsLeft = before.maxTurns - before.turn;
      if (turnsLeft < 1) return -5; // never decline on the last turn
      return 8 * 0.55 * Math.min(turnsLeft, 3);
    }
    case 'pickCombo': {
      const combos = before.column;
      const banner =
        action.combo === 5 ? before.bannerStack[0] : combos[action.combo]?.banner;
      const power = action.combo === 5 ? before.badgeStack[0] : combos[action.combo]?.power;
      let bonus = banner ? racePrior(banner) : 0;
      if (power === 'vanishing' || power === 'reborn' || power === 'tomb') bonus += 0.2;
      return bonus;
    }
    case 'endConquest': {
      // Mild penalty for stopping while profitable conquests remain — the
      // conquer candidates themselves will outscore this when they're good.
      return -0.05;
    }
    case 'endTurn':
      return 0;
    default:
      return 0;
  }
}

function tieNoise(state: GameState, playerId: number, action: Action): number {
  const h = hashString(`${state.actionCount}:${playerId}:${JSON.stringify(action)}`);
  return (h % 1000) / 1000 * 0.02;
}

function describe(state: GameState, _me: number, action: Action): string {
  const map = getMap(state);
  const terrain = (rid: number): string =>
    TERRAIN_NAMES[(map.regions[rid] as GameMap['regions'][number]).terrain];
  switch (action.type) {
    case 'pickCombo': {
      const c = action.combo === 5 ? null : state.column[action.combo];
      const banner = action.combo === 5 ? state.bannerStack[0] : c?.banner;
      const power = action.combo === 5 ? state.badgeStack[0] : c?.power;
      const name = banner ? RACES[banner].name : 'a race';
      return `picked ${name}${power ? ` + ${POWERS[power].name}` : ''} as the best value in the market`;
    }
    case 'mimeSwap':
      return 'mimicked a stronger special power';
    case 'mimeSkip':
      return 'kept its own special power';
    case 'placeVolcano':
      return 'chose the volcano with the richest surroundings';
    case 'decline':
      return 'sent an over-extended race into decline to grab a fresh one';
    case 'abandon':
      return `abandoned ${terrain(action.region)} #${action.region} to free troops`;
    case 'moveGreatAncient':
      return 'moved the Great Ancient to guard a better region';
    case 'rebornReplace':
      return 'reborn: revived a declined region with the new race';
    case 'beginConquest':
      return 'readied troops for conquest';
    case 'conquer': {
      const r = state.regions[action.region];
      const why =
        r && r.monsters > 0
          ? 'to loot its Place or Relic'
          : r && r.tokens > 0
            ? 'to push a rival out'
            : 'because it scores every turn';
      return `conquered ${terrain(action.region)} #${action.region} ${why}`;
    }
    case 'finalConquest':
      return `risked the reinforcement die on ${terrain(action.region)} #${action.region}`;
    case 'wispConquer':
      return `used the wisp-light die near its crystals on #${action.region}`;
    case 'vampirize':
      return `vampirized the lone defender of #${action.region}`;
    case 'orbConquer':
      return `used the Shiny Orb to subvert #${action.region}`;
    case 'endConquest':
      return 'stopped conquering to fortify';
    case 'placeBalrog':
      return `unleashed the Balrog on #${action.region}`;
    case 'deploy':
      return `garrisoned ${action.count} token(s) in #${action.region}`;
    case 'deployArmor':
      return `armored #${action.region}`;
    case 'endTurn':
      return 'finished redeployment';
    case 'placeQueen':
      return `sheltered the Queen in #${action.region} (immune)`;
    case 'placeGhost':
      return `sent the Ghost to protect #${action.region}`;
    case 'placeScepter':
      return `doubled #${action.region}'s takings with the Scepter`;
    case 'placeRing':
      return `taxed the neighbors of #${action.region} with Froggy's Ring`;
    case 'altarDiscard':
      return 'offered a declined soul at the Altar for 3 coins';
    case 'finishTurn':
      return 'ended the turn';
    case 'defDeploy':
      return `regrouped ${action.count} routed token(s) into #${action.region}`;
  }
}
