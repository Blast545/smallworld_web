// Headless self-play harness. Used by selfplay.test.ts (and runnable in Node
// with zero browser dependencies). On failure it dumps seed + action log so
// the game can be replayed deterministically.

import { mkdirSync, writeFileSync } from 'node:fs';
import { applyAction, getLegalActions } from '../engine/actions';
import { createInitialState } from '../engine/setup';
import { getVisibleState } from '../engine/visibility';
import { chooseAction } from '../bots/heuristic';
import { nextInt, seedRng } from '../engine/rng';
import type { RngState } from '../engine/rng';
import type { Action, GameConfig, GameState } from '../engine/types';
import { checkInvariants } from './invariants';

export const ACTION_CAP = 4000;

export interface SelfPlayResult {
  actions: Action[];
  finalState: GameState;
}

function makeConfig(playerCount: number, seed: number): GameConfig {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `Bot ${i + 1}`,
      controller: 'bot' as const,
    })),
    seed,
  };
}

function actionInLegalSet(action: Action, legal: Action[]): boolean {
  const key = JSON.stringify(action);
  return legal.some((a) => JSON.stringify(a) === key);
}

export function runGame(
  playerCount: number,
  seed: number,
  mode: 'random' | 'bots',
): SelfPlayResult {
  const config = makeConfig(playerCount, seed);
  let state = createInitialState(config, seed);
  let agentRng: RngState = seedRng(seed ^ 0x5eedf00d);
  const actions: Action[] = [];

  checkInvariants(state);
  while (!state.gameOver) {
    if (actions.length > ACTION_CAP) {
      throw new Error(`game exceeded ${ACTION_CAP} actions`);
    }
    const legal = getLegalActions(state);
    if (legal.length === 0) {
      throw new Error(`deadlock: no legal actions in phase ${state.phase}`);
    }
    let action: Action;
    if (mode === 'random') {
      const [i, s2] = nextInt(agentRng, legal.length);
      agentRng = s2;
      action = legal[i] as Action;
    } else {
      const visible = getVisibleState(state, state.chooser);
      const decision = chooseAction(visible, state.chooser);
      action = decision.action;
      if (!actionInLegalSet(action, legal)) {
        throw new Error(`bot chose illegal action ${JSON.stringify(action)}`);
      }
    }
    actions.push(action);
    state = applyAction(state, action);
    checkInvariants(state);
  }

  if (state.turn > state.maxTurns) {
    throw new Error(`game ran past its turn track: ${state.turn} > ${state.maxTurns}`);
  }
  if (state.winners.length === 0) throw new Error('no winner determined');
  return { actions, finalState: state };
}

export function replayGame(playerCount: number, seed: number, actions: Action[]): GameState {
  const config = makeConfig(playerCount, seed);
  let state = createInitialState(config, seed);
  for (const action of actions) {
    state = applyAction(state, action);
  }
  return state;
}

export function stateFingerprint(state: GameState): string {
  return JSON.stringify(state);
}

export function dumpFailure(
  playerCount: number,
  seed: number,
  mode: string,
  actions: Action[],
  error: unknown,
): string {
  const dir = 'selfplay-failures';
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/fail-${mode}-${playerCount}p-seed${seed}.json`;
  writeFileSync(
    file,
    JSON.stringify(
      {
        playerCount,
        seed,
        mode,
        error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
        actions,
      },
      null,
      2,
    ),
  );
  return file;
}
