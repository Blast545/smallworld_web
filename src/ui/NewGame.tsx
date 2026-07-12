import { useState } from 'react';
import type { JSX } from 'react';
import type { GameConfig, PlayerConfig } from '../engine/types';
import { mapForPlayerCount } from '../engine/maps';

const BOT_NAMES = ['Grubnik', 'Morwena', 'Thagrun', 'Zsofia'];

export function NewGame({
  onStart,
  canResume,
  onResume,
}: {
  onStart: (config: GameConfig) => void;
  canResume: boolean;
  onResume: () => void;
}): JSX.Element {
  const [bots, setBots] = useState(2);
  const [seat, setSeat] = useState(0);
  const [seedText, setSeedText] = useState('');
  const [name, setName] = useState('You');

  const playerCount = bots + 1;
  const map = mapForPlayerCount(playerCount);

  const start = (): void => {
    const seed =
      seedText.trim() === ''
        ? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
        : hashSeed(seedText.trim());
    const players: PlayerConfig[] = [];
    for (let i = 0; i < playerCount; i++) {
      if (i === Math.min(seat, playerCount - 1)) {
        players.push({ name: name.trim() || 'You', controller: 'human' as const });
      } else {
        players.push({
          name: BOT_NAMES[players.filter((p) => p.controller === 'bot').length] ?? 'Bot',
          controller: 'bot' as const,
        });
      }
    }
    onStart({ players, seed });
  };

  return (
    <div className="newgame">
      <h1>Small World Underground</h1>
      <p className="sub">One human vs. heuristic bots · offline PWA</p>

      {canResume && (
        <button className="big primary" onClick={onResume} data-testid="resume">
          Resume saved game
        </button>
      )}

      <label>
        Opponents (bots)
        <div className="segmented" data-testid="bot-count">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={bots === n ? 'seg active' : 'seg'}
              data-testid={`bots-${n}`}
              onClick={() => setBots(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </label>
      <p className="sub">
        {playerCount} players · map “{map.id}” · {map.turns} turns
      </p>

      <label>
        Your seat (turn order)
        <div className="segmented">
          {Array.from({ length: playerCount }, (_, i) => (
            <button key={i} className={seat === i ? 'seg active' : 'seg'} onClick={() => setSeat(i)}>
              {i + 1}
            </button>
          ))}
        </div>
      </label>

      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} />
      </label>

      <label>
        Seed (optional, for reproducible games)
        <input
          value={seedText}
          onChange={(e) => setSeedText(e.target.value)}
          placeholder="random"
          inputMode="text"
          data-testid="seed-input"
        />
      </label>

      <button className="big primary" onClick={start} data-testid="start-game">
        Start game
      </button>

      <p className="sub">
        Races and powers are drafted in-game from the combo market, exactly as in the board game —
        there is no faction pre-pick.
      </p>
    </div>
  );
}

function hashSeed(text: string): number {
  const n = Number(text);
  if (Number.isFinite(n) && Number.isInteger(n)) return n >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
