import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { LogEntry } from '../engine/types';
import { PLAYER_COLORS } from './Board';

export function Log({ entries }: { entries: LogEntry[] }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);
  return (
    <div className="log" ref={ref} data-testid="game-log">
      {entries.map((e, i) => (
        <div key={i} className="logline">
          <span className="logturn">T{e.turn}</span>
          <span
            className="logtext"
            style={
              e.player !== null
                ? { borderLeft: `3px solid ${PLAYER_COLORS[e.player]}`, paddingLeft: 6 }
                : undefined
            }
          >
            {e.text}
            {e.reason ? <em className="logreason"> — {e.reason}</em> : null}
          </span>
        </div>
      ))}
      {entries.length === 0 && <div className="logline">No entries yet.</div>}
      <span data-testid="log-count" hidden>
        {entries.length}
      </span>
    </div>
  );
}
