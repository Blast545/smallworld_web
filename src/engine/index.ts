export { createInitialState, cloneState, getMap } from './setup';
export { getLegalActions, applyAction, visibleCombos } from './actions';
export { isTerminal, getScores, computeTurnScore, totalScore } from './scoring';
export { getVisibleState } from './visibility';
export { MAPS, mapForPlayerCount } from './maps';
export type { GameMap, MapRegion } from './maps';
export * from './data';
export * from './types';
export {
  activeRegionIds,
  declinedRegionIds,
  conquestBudget,
  conquestCost,
  computeReach,
  hasActivePower,
  hasDeclinedPower,
  findMarkerRegion,
  findFigureRegion,
  controlsRelic,
  tokensOnBoard,
  isImmuneFor,
  NO_BOOSTS,
} from './queries';
