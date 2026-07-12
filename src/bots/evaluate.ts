// Position evaluation for the heuristic bot. Derived from the game's real
// win condition: victory coins now, plus projected income over the remaining
// turns, plus board safety terms.

import type { GameState, RegionState } from '../engine/types';
import type { RaceId } from '../engine/data';
import { getMap } from '../engine/setup';
import { activeRegionIds, conquestBudget } from '../engine/queries';
import { computeTurnScore, totalScore } from '../engine/scoring';

/** Rough desirability priors for races/powers when shopping for combos. */
const RACE_PRIOR: Partial<Record<RaceId, number>> = {
  mummies: 1.5,
  lizardmen: 1.0,
  spiderines: 1.0,
  shadowMimes: 0.8,
  ironDwarves: 0.8,
  gnomes: 0.6,
  willOWisps: 0.6,
  kraken: 0.3,
  ogres: 0.8,
  cultists: 0.6,
  drow: 0.3,
  flames: 0.5,
  liches: 0.4,
  mudmen: 0.6,
  shrooms: 0.4,
};

export function racePrior(race: RaceId): number {
  return RACE_PRIOR[race] ?? 0.5;
}

/**
 * Evaluate `state` from `player`'s perspective. Bigger is better. Reads only
 * information visible to that player (callers pass a masked state).
 */
export function evaluate(state: GameState, player: number): number {
  const p = state.players[player];
  if (!p) return 0;
  const turnsLeft = Math.max(0, state.maxTurns - state.turn) + (state.activePlayer <= player ? 1 : 0);

  // Coins in the bank are the win condition.
  let score = p.coins;

  // Projected income: what this player would score at end of turn, repeated
  // over remaining turns (discounted — territory erodes).
  const income = totalScore(computeTurnScore(state, player));
  score += income * Math.min(turnsLeft, 4) * 0.55;

  // Material: tokens in hand can still conquer; tokens on the board hold
  // ground and break ties.
  const a = p.active;
  if (a) {
    score += a.hand * 0.2 + a.hammerPool * 0.15;
  }

  const map = getMap(state);
  const own = activeRegionIds(state, player);
  // Defensive shape: exposed single-token frontier regions are liabilities.
  for (const rid of own) {
    const r = state.regions[rid] as RegionState;
    let exposed = false;
    for (const n of map.adjacency[rid] as number[]) {
      const nr = state.regions[n] as RegionState;
      if (nr.owner !== null && nr.owner !== player && !nr.inDecline && nr.tokens > 0) {
        exposed = true;
        break;
      }
    }
    if (exposed && r.tokens <= 1 && r.armors === 0 && !r.blackMountain) score -= 0.3;
    score += Math.min(r.tokens, 3) * 0.05;
  }

  // Having conquest capacity late in a turn is slightly wasteful, which
  // nudges the bot to spend its hand; budget is otherwise counted above.
  void conquestBudget;
  return score;
}
