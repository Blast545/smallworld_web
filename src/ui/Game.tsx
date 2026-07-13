// The game screen: board, market, phase controls, players bar, log.
// All legality comes from getLegalActions; taps on the board are matched
// against the legal action list, never validated locally.

import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { getLegalActions, visibleCombos } from '../engine/actions';
import {
  MARKERS,
  POWER_HELP,
  POWERS,
  RACE_HELP,
  RACES,
  TERRAIN_NAMES,
} from '../engine/data';
import { HelpSheet } from './Help';
import type { HelpKind } from './Help';
import type { GameMap } from '../engine/maps';
import { getMap } from '../engine/setup';
import { getScores } from '../engine/scoring';
import { tokensOnBoard } from '../engine/queries';
import type { Action, GameState } from '../engine/types';
import { Board, PLAYER_COLORS } from './Board';
import { Log } from './Log';
import type { GameStore } from './useGame';

type RegionMode =
  | { kind: 'none' }
  | { kind: 'action'; type: Action['type']; label: string };

export interface GameProps {
  store: GameStore;
  onExit: () => void;
  onShowRules: () => void;
}

export function Game({ store, onExit, onShowRules }: GameProps): JSX.Element {
  const state = store.state as GameState;
  const map = getMap(state);
  const human = store.humanSeat;
  const isHumanTurn = state.chooser === human && !state.gameOver;
  const legal = useMemo(
    () => (isHumanTurn ? getLegalActions(state) : []),
    [state, isHumanTurn],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<RegionMode>({ kind: 'none' });
  const [pendingChoice, setPendingChoice] = useState<Action[] | null>(null);
  const [tab, setTab] = useState<'board' | 'log'>('board');
  const [help, setHelp] = useState<HelpKind | null>(null);

  const say = (text: string): void => {
    setNotice(text);
    window.setTimeout(() => setNotice((cur) => (cur === text ? null : cur)), 3000);
  };

  const doAction = (action: Action): void => {
    setMode({ kind: 'none' });
    setPendingChoice(null);
    setNotice(null);
    store.dispatch(action);
  };

  // Region ids that respond to a tap right now.
  const highlights = useMemo(() => {
    const set = new Set<number>();
    if (!isHumanTurn) return set;
    const wanted =
      mode.kind === 'action'
        ? new Set<Action['type']>([mode.type])
        : new Set<Action['type']>([
            'conquer',
            'finalConquest',
            'wispConquer',
            'vampirize',
            'orbConquer',
            'placeBalrog',
            'placeVolcano',
            'deploy',
            'defDeploy',
          ]);
    for (const a of legal) {
      if ('region' in a && wanted.has(a.type)) set.add(a.region);
    }
    return set;
  }, [legal, isHumanTurn, mode]);

  const explainTap = (rid: number): string => {
    const mr = map.regions[rid] as GameMap['regions'][number];
    if (mr.terrain === 'chasm') return 'Abysmal Chasms are impassable.';
    const rs = state.regions[rid];
    if (rs && rs.figures.some((f) => f.kind === 'balrog')) return 'The Balrog makes it immune.';
    if (rs && rs.figures.some((f) => f.kind !== 'volcano')) return 'An immune region.';
    switch (state.phase) {
      case 'conquest':
        if (rs?.owner === human && !rs.inDecline) return 'Already yours.';
        return 'Not reachable or affordable for a conquest.';
      case 'redeploy':
      case 'declineRedeploy':
        return 'You can only reinforce regions you occupy.';
      case 'defenderRedeploy':
        return 'Routed tokens must go to regions your race still holds.';
      default:
        return 'Nothing to do there right now.';
    }
  };

  const onTapRegion = (rid: number): void => {
    if (!isHumanTurn) return;
    const wanted =
      mode.kind === 'action'
        ? [mode.type]
        : [
            'conquer',
            'finalConquest',
            'wispConquer',
            'vampirize',
            'orbConquer',
            'placeBalrog',
            'placeVolcano',
            'deploy',
            'defDeploy',
          ];
    const options = legal.filter(
      (a): a is Action & { region: number } =>
        'region' in a && a.region === rid && wanted.includes(a.type),
    );
    if (options.length === 0) {
      say(explainTap(rid));
      return;
    }
    // Deploy-style: one tap = one token.
    const deployLike = options.find(
      (a) => (a.type === 'deploy' || a.type === 'defDeploy') && 'count' in a && a.count === 1,
    );
    if (deployLike) {
      doAction(deployLike);
      return;
    }
    if (options.length === 1) {
      doAction(options[0] as Action);
      return;
    }
    // Multiple ways to take this region (boosts, die...): let the player pick.
    setPendingChoice(options);
  };

  const me = state.players[human];

  return (
    <div className="game">
      <header className="topbar">
        <button className="ghost" onClick={onExit} aria-label="menu">
          ☰
        </button>
        <div className="turninfo">
          <strong>Turn {state.turn}</strong>/{state.maxTurns} · {phaseLabel(state)}
        </div>
        <button className="ghost" onClick={onShowRules} aria-label="rules">
          📖
        </button>
      </header>

      <PlayersBar state={state} human={human} />

      {tab === 'board' ? (
        <div className="boardwrap">
          <Board
            map={map}
            state={state}
            highlights={highlights}
            selected={null}
            onTapRegion={onTapRegion}
          />
          <button
            className="legendbtn"
            aria-label="map legend"
            title="What do the colors and icons mean?"
            data-testid="open-legend"
            onClick={() => setHelp('legend')}
          >
            ℹ️
          </button>
        </div>
      ) : (
        <Log entries={store.uiLog} />
      )}

      <div className="tabs">
        <button className={tab === 'board' ? 'tab active' : 'tab'} onClick={() => setTab('board')}>
          Board
        </button>
        <button className={tab === 'log' ? 'tab active' : 'tab'} onClick={() => setTab('log')} data-testid="tab-log">
          Log
        </button>
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <footer className="controls">
        {state.gameOver ? (
          <GameOverPanel state={state} onExit={onExit} />
        ) : !isHumanTurn ? (
          <div className="waiting" data-testid="waiting">
            {state.config.players[state.chooser]?.name} is thinking…
          </div>
        ) : (
          <HumanControls
            state={state}
            legal={legal}
            mode={mode}
            setMode={setMode}
            doAction={doAction}
            me={{ coins: me?.coins ?? 0 }}
            say={say}
            showHelp={setHelp}
          />
        )}
      </footer>

      {help && <HelpSheet kind={help} onClose={() => setHelp(null)} />}

      {pendingChoice && (
        <div className="sheet" role="dialog" aria-label="choose how to conquer">
          <h3>Choose how to take this region</h3>
          {pendingChoice.map((a, i) => (
            <button key={i} className="big" onClick={() => doAction(a)}>
              {conquestVariantLabel(a)}
            </button>
          ))}
          <button className="big ghost" onClick={() => setPendingChoice(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function phaseLabel(state: GameState): string {
  switch (state.phase) {
    case 'pickCombo':
      return 'pick a race';
    case 'mimeSwap':
      return 'mime swap';
    case 'volcanoPlace':
      return 'place volcano';
    case 'startTurn':
      return 'plan';
    case 'conquest':
      return 'conquest';
    case 'balrogPlace':
      return 'balrog!';
    case 'redeploy':
      return 'redeploy';
    case 'declineRedeploy':
      return 'tomb redeploy';
    case 'endOfTurn':
      return 'end of turn';
    case 'defenderRedeploy':
      return 'retreat';
    case 'gameOver':
      return 'game over';
  }
}

function conquestVariantLabel(a: Action): string {
  if (a.type === 'wispConquer') return 'Roll the die (Will-o’-Wisps)';
  if (a.type === 'vampirize') return 'Vampirize the lone token';
  if (a.type === 'orbConquer') return `Shiny Orb${a.viaBag ? ' (via Bag)' : ''}`;
  if (a.type === 'finalConquest' || a.type === 'conquer') {
    const bits: string[] = [];
    if (a.useSword) bits.push('Sword −2');
    if (a.useSocks) bits.push('Socks (as empty)');
    if (a.useDoormat) bits.push('Flying Doormat');
    if (a.bagAs === 'swordOfKillerRabbit') bits.push('Bag as Sword');
    if (a.bagAs === 'stinkyTrollsSocks') bits.push('Bag as Socks');
    if (a.bagAs === 'flyingDoormat') bits.push('Bag as Doormat');
    const suffix = bits.length > 0 ? ` with ${bits.join(' + ')}` : '';
    return a.type === 'finalConquest' ? `Final conquest (roll die)${suffix}` : `Conquer${suffix}`;
  }
  return a.type;
}

// ---------------------------------------------------------------------------

function PlayersBar({ state, human }: { state: GameState; human: number }): JSX.Element {
  return (
    <div className="players">
      {state.players.map((p, i) => {
        const cfg = state.config.players[i];
        return (
          <div
            key={i}
            className={`player ${state.activePlayer === i && !state.gameOver ? 'active' : ''}`}
            style={{ borderColor: PLAYER_COLORS[i] }}
          >
            <div className="pname" style={{ color: PLAYER_COLORS[i] }}>
              {cfg?.name}
              {i === human ? ' (you)' : ''}
            </div>
            <div className="pinfo">
              {p.active
                ? `${RACES[p.active.race].name}${p.active.power ? ` · ${POWERS[p.active.power].name}` : ''} · ✋${p.active.hand}`
                : '—'}
              {p.declined ? ` · 🌒${RACES[p.declined.race].name}` : ''}
            </div>
            <div className="pinfo">
              🪙{i === human || state.gameOver ? p.coins : '?'} · ⬤{tokensOnBoard(state, i)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface ControlsProps {
  state: GameState;
  legal: Action[];
  mode: RegionMode;
  setMode: (m: RegionMode) => void;
  doAction: (a: Action) => void;
  me: { coins: number };
  say: (t: string) => void;
  showHelp: (h: HelpKind) => void;
}

function HumanControls({
  state,
  legal,
  mode,
  setMode,
  doAction,
  me,
  showHelp,
}: ControlsProps): JSX.Element {
  const has = (t: Action['type']): boolean => legal.some((a) => a.type === t);

  if (state.phase === 'pickCombo') {
    return (
      <ComboPicker
        state={state}
        legal={legal}
        doAction={doAction}
        coins={me.coins}
        showHelp={showHelp}
      />
    );
  }
  if (state.phase === 'mimeSwap') {
    return <MimePicker state={state} legal={legal} doAction={doAction} />;
  }
  if (mode.kind === 'action') {
    return (
      <div className="row">
        <div className="hint">{mode.label}</div>
        <button className="big ghost" onClick={() => setMode({ kind: 'none' })}>
          Cancel
        </button>
      </div>
    );
  }

  const buttons: JSX.Element[] = [];
  const modeButton = (type: Action['type'], label: string, hint: string): void => {
    if (legal.some((a) => a.type === type && 'region' in a)) {
      buttons.push(
        <button key={type} className="big" onClick={() => setMode({ kind: 'action', type, label: hint })}>
          {label}
        </button>,
      );
    }
  };

  switch (state.phase) {
    case 'volcanoPlace':
      return <div className="hint">Tap a volcano chasm to place the Volcano.</div>;
    case 'startTurn': {
      if (has('decline'))
        buttons.push(
          <button key="decline" className="big warn" onClick={() => confirmDecline() && doAction({ type: 'decline' })}>
            Go In Decline
          </button>,
        );
      modeButton('abandon', 'Abandon…', 'Tap a region to abandon it.');
      modeButton('moveGreatAncient', 'Move Ancient…', 'Tap a region for the Great Ancient.');
      modeButton('rebornReplace', 'Reborn…', 'Tap a declined region to revive.');
      buttons.push(
        <button key="conq" className="big primary" data-testid="begin-conquest" onClick={() => doAction({ type: 'beginConquest' })}>
          Ready troops ⚔️
        </button>,
      );
      return <div className="row">{buttons}</div>;
    }
    case 'conquest': {
      const hand = state.players[state.activePlayer]?.active?.hand ?? 0;
      const pool = state.players[state.activePlayer]?.active?.hammerPool ?? 0;
      return (
        <div className="row">
          <div className="hint">
            ✋{hand}
            {pool > 0 ? ` 🔨${pool}` : ''} — tap a highlighted region to conquer.
          </div>
          <button className="big primary" data-testid="end-conquest" onClick={() => doAction({ type: 'endConquest' })}>
            End conquests
          </button>
        </div>
      );
    }
    case 'balrogPlace':
      return <div className="hint">Tap a neighboring region for the Balrog.</div>;
    case 'redeploy':
    case 'declineRedeploy': {
      const hand =
        state.phase === 'redeploy'
          ? (state.players[state.activePlayer]?.active?.hand ?? 0)
          : state.declineTombPool;
      const armor = state.players[state.activePlayer]?.armorHand ?? 0;
      const endTurnLegal = has('endTurn');
      const armorLegal = has('deployArmor');
      return (
        <div className="row">
          <div className="hint">
            Reorganize all your troops: ✋{hand} in hand — use +/− below or tap regions on the
            board (+1).
            {armor > 0 ? ` 🛡️${armor} armors to place.` : ''}
          </div>
          <GarrisonEditor state={state} legal={legal} doAction={doAction} />
          {armorLegal && (
            <button
              className="big"
              onClick={() => setMode({ kind: 'action', type: 'deployArmor', label: 'Tap a region to armor.' })}
            >
              Place armor
            </button>
          )}
          {endTurnLegal && (
            <button className="big primary" data-testid="end-turn" onClick={() => doAction({ type: 'endTurn' })}>
              End turn
            </button>
          )}
        </div>
      );
    }
    case 'endOfTurn': {
      modeButton('placeQueen', 'Queen…', 'Tap a region for the Queen.');
      modeButton('placeGhost', 'Ghost…', 'Tap a region for the Ghost.');
      const scepter = legal.filter((a) => a.type === 'placeScepter');
      if (scepter.length > 0)
        buttons.push(
          <button
            key="scepter"
            className="big"
            onClick={() => setMode({ kind: 'action', type: 'placeScepter', label: 'Tap a region for the Scepter.' })}
          >
            Scepter…
          </button>,
        );
      const ring = legal.filter((a) => a.type === 'placeRing');
      if (ring.length > 0)
        buttons.push(
          <button
            key="ring"
            className="big"
            onClick={() => setMode({ kind: 'action', type: 'placeRing', label: 'Tap a region for the Ring.' })}
          >
            Ring…
          </button>,
        );
      modeButton('altarDiscard', 'Altar…', 'Tap a declined region to offer a token (+3).');
      buttons.push(
        <button key="finish" className="big primary" data-testid="finish-turn" onClick={() => doAction({ type: 'finishTurn' })}>
          Finish turn ✅
        </button>,
      );
      return <div className="row">{buttons}</div>;
    }
    case 'defenderRedeploy': {
      const pd = state.pendingDefenders[0];
      return (
        <div className="hint">
          Your troops retreat: place {pd?.tokens ?? 0} token(s) — tap your regions.
        </div>
      );
    }
    default:
      return <div className="hint">…</div>;
  }
}

function confirmDecline(): boolean {
  return window.confirm('Put your race In Decline? Your turn ends after scoring.');
}

// The mode-driven region taps for placeQueen/placeGhost/placeScepter/etc need
// the same tap plumbing as conquests; Game.onTapRegion covers types listed in
// `wanted` when a mode is active because mode.type is included there.

/** Per-region +/- troop editor used during the redeployment phases. */
function GarrisonEditor({
  state,
  legal,
  doAction,
}: {
  state: GameState;
  legal: Action[];
  doAction: (a: Action) => void;
}): JSX.Element {
  const map = getMap(state);
  const rows: { region: number; tokens: number; plus: Action | null; minus: Action | null }[] =
    [];
  const seen = new Set<number>();
  for (const a of legal) {
    if ((a.type === 'deploy' || a.type === 'withdraw') && !seen.has(a.region)) {
      seen.add(a.region);
      rows.push({
        region: a.region,
        tokens: state.regions[a.region]?.tokens ?? 0,
        plus:
          legal.find((x) => x.type === 'deploy' && x.region === a.region && x.count === 1) ?? null,
        minus:
          legal.find((x) => x.type === 'withdraw' && x.region === a.region && x.count === 1) ??
          null,
      });
    }
  }
  rows.sort((a, b) => a.region - b.region);
  if (rows.length === 0) return <></>;
  return (
    <div className="garrison" data-testid="garrison-editor">
      {rows.map((row) => (
        <div className="garrison-row" key={row.region}>
          <span className="garrison-name">
            #{row.region} {TERRAIN_NAMES[(map.regions[row.region] as GameMap['regions'][number]).terrain]}
          </span>
          <button
            className="step"
            aria-label={`remove a token from region ${row.region}`}
            disabled={!row.minus}
            data-testid={`minus-${row.region}`}
            onClick={() => row.minus && doAction(row.minus)}
          >
            −
          </button>
          <span className="garrison-count">{row.tokens}</span>
          <button
            className="step"
            aria-label={`add a token to region ${row.region}`}
            disabled={!row.plus}
            data-testid={`plus-${row.region}`}
            onClick={() => row.plus && doAction(row.plus)}
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
}

function ComboPicker({
  state,
  legal,
  doAction,
  coins,
  showHelp,
}: {
  state: GameState;
  legal: Action[];
  doAction: (a: Action) => void;
  coins: number;
  showHelp: (h: HelpKind) => void;
}): JSX.Element {
  const combos = visibleCombos(state);
  return (
    <div className="combos" data-testid="combo-picker">
      <div className="hint">
        Pick a Race &amp; Power combo (🪙{coins}). The top one is free; each lower one costs 1
        coin more.
      </div>
      <div className="helpbuttons">
        <button className="big" data-testid="help-races" onClick={() => showHelp('races')}>
          ℹ️ Troop races
        </button>
        <button className="big" data-testid="help-powers" onClick={() => showHelp('powers')}>
          ℹ️ Power modifiers
        </button>
      </div>
      {combos.map((c) => {
        const action = legal.find((a) => a.type === 'pickCombo' && a.combo === c.index);
        const tokens = RACES[c.banner].banner + (c.power ? POWERS[c.power].value : 0);
        return (
          <button
            key={c.index}
            className="combo"
            disabled={!action}
            data-testid={`combo-${c.index}`}
            onClick={() => action && doAction(action)}
          >
            <span className="combo-name">
              {RACES[c.banner].name}
              {c.power ? ` + ${POWERS[c.power].name}` : ''}
            </span>
            <span className="combo-sub">
              {tokens} tokens · cost {c.cost} coin{c.cost === 1 ? '' : 's'}
              {c.coins > 0 ? ` · carries 🪙${c.coins}` : ''}
            </span>
            <span className="combo-desc">⚔️ {RACE_HELP[c.banner]}</span>
            {c.power && <span className="combo-desc">✨ {POWER_HELP[c.power]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MimePicker({
  state,
  legal,
  doAction,
}: {
  state: GameState;
  legal: Action[];
  doAction: (a: Action) => void;
}): JSX.Element {
  const combos = visibleCombos(state);
  return (
    <div className="combos">
      <div className="hint">Shadow Mimes: swap your power with a visible one?</div>
      {legal
        .filter((a) => a.type === 'mimeSwap')
        .map((a) => {
          const c = combos.find((x) => a.type === 'mimeSwap' && x.index === a.combo);
          if (!c || !c.power) return null;
          return (
            <button key={c.index} className="combo" onClick={() => doAction(a)}>
              <span className="combo-name">Take {POWERS[c.power].name}</span>
              <span className="combo-sub">from {RACES[c.banner].name}</span>
            </button>
          );
        })}
      <button className="combo" onClick={() => doAction({ type: 'mimeSkip' })}>
        <span className="combo-name">Keep my power</span>
      </button>
    </div>
  );
}

function GameOverPanel({ state, onExit }: { state: GameState; onExit: () => void }): JSX.Element {
  const scores = getScores(state);
  return (
    <div className="gameover" data-testid="gameover">
      <h3>
        🏆 {scores.winners.map((w) => state.config.players[w]?.name).join(' & ')} win
        {scores.winners.length > 1 ? '' : 's'}!
      </h3>
      <ol className="scores">
        {state.players
          .map((p, i) => ({ i, coins: p.coins, tokens: scores.tokensOnBoard[i] ?? 0 }))
          .sort((a, b) => b.coins - a.coins || b.tokens - a.tokens)
          .map((row) => (
            <li key={row.i}>
              {state.config.players[row.i]?.name}: 🪙{row.coins} (⬤{row.tokens})
            </li>
          ))}
      </ol>
      <button className="big primary" onClick={onExit}>
        New game
      </button>
    </div>
  );
}

export { MARKERS, TERRAIN_NAMES };
