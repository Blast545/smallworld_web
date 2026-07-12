// Game store: holds the authoritative GameState, replays saves, drives bot
// turns, and auto-saves (config + action log) to localStorage after every
// action. The UI contains no rules logic — it only dispatches engine actions.

import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAction, getLegalActions } from '../engine/actions';
import { createInitialState } from '../engine/setup';
import { getVisibleState } from '../engine/visibility';
import { chooseAction } from '../bots/heuristic';
import type { Action, GameConfig, GameState, LogEntry } from '../engine/types';

const SAVE_KEY = 'swu-save-v1';
const BOT_DELAY_MS = 220;

export interface SaveData {
  config: GameConfig;
  actions: Action[];
  reasons: (string | null)[];
}

export interface GameStore {
  state: GameState | null;
  uiLog: LogEntry[];
  humanSeat: number;
  startGame: (config: GameConfig) => void;
  dispatch: (action: Action) => void;
  resign: () => void;
  botThinking: boolean;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data.config || !Array.isArray(data.actions)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

function replay(save: SaveData): { state: GameState; log: LogEntry[] } {
  let state = createInitialState(save.config, save.config.seed);
  const log: LogEntry[] = [...state.log];
  save.actions.forEach((action, i) => {
    const before = state.log.length;
    state = applyAction(state, action);
    const reason = save.reasons[i] ?? null;
    for (let j = before; j < state.log.length; j++) {
      const entry = state.log[j] as LogEntry;
      log.push(reason && j === before ? { ...entry, reason } : entry);
    }
  });
  return { state, log };
}

export function useGame(initialSave: SaveData | null): GameStore {
  const saveRef = useRef<SaveData | null>(initialSave);
  const [state, setState] = useState<GameState | null>(() => {
    if (!initialSave) return null;
    try {
      return replay(initialSave).state;
    } catch {
      clearSave();
      saveRef.current = null;
      return null;
    }
  });
  const [uiLog, setUiLog] = useState<LogEntry[]>(() => {
    if (!saveRef.current || state === null) return [];
    try {
      return replay(saveRef.current).log;
    } catch {
      return [];
    }
  });
  const [botThinking, setBotThinking] = useState(false);

  const humanSeat = saveRef.current?.config.players.findIndex((p) => p.controller === 'human') ?? 0;

  const persist = useCallback(() => {
    const save = saveRef.current;
    if (!save) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Storage full or unavailable: the game continues unsaved.
    }
  }, []);

  const startGame = useCallback(
    (config: GameConfig) => {
      const fresh = createInitialState(config, config.seed);
      saveRef.current = { config, actions: [], reasons: [] };
      persist();
      setState(fresh);
      setUiLog([...fresh.log]);
    },
    [persist],
  );

  const dispatchInternal = useCallback(
    (action: Action, reason: string | null) => {
      setState((prev) => {
        if (!prev || prev.gameOver) return prev;
        const next = applyAction(prev, action);
        const save = saveRef.current;
        if (save) {
          save.actions.push(action);
          save.reasons.push(reason);
          persist();
        }
        setUiLog((old) => {
          const added = next.log.slice(prev.log.length);
          const withReason = added.map((e, i) =>
            reason && i === 0 ? { ...e, reason } : e,
          );
          return [...old, ...withReason];
        });
        return next;
      });
    },
    [persist],
  );

  const dispatch = useCallback(
    (action: Action) => dispatchInternal(action, null),
    [dispatchInternal],
  );

  const resign = useCallback(() => {
    clearSave();
    saveRef.current = null;
    setState(null);
    setUiLog([]);
  }, []);

  // Bot driver: whenever it's a bot's turn to choose, decide after a short
  // delay so the log is followable.
  useEffect(() => {
    if (!state || state.gameOver) {
      setBotThinking(false);
      return;
    }
    const chooser = state.chooser;
    const controller = state.config.players[chooser]?.controller;
    if (controller !== 'bot') {
      setBotThinking(false);
      return;
    }
    setBotThinking(true);
    const timer = window.setTimeout(() => {
      const visible = getVisibleState(state, chooser);
      let decision;
      try {
        decision = chooseAction(visible, chooser);
      } catch {
        // Absolute fallback: the bot must never stall the game.
        const legal = getLegalActions(state);
        if (legal.length === 0) return;
        decision = { action: legal[0] as Action, reason: 'fallback' };
      }
      dispatchInternal(decision.action, decision.reason);
    }, BOT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state, dispatchInternal]);

  return { state, uiLog, humanSeat, startGame, dispatch, resign, botThinking };
}
