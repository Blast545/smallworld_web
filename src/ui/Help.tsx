// Full-screen reference sheets: all races ("troops") or all special powers
// ("modifiers"), for players new to the game.

import type { JSX } from 'react';
import {
  ALL_POWERS,
  ALL_RACES,
  POWER_HELP,
  POWERS,
  RACE_HELP,
  RACES,
} from '../engine/data';

export function HelpSheet({
  kind,
  onClose,
}: {
  kind: 'races' | 'powers';
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="rules" role="dialog" aria-label={`${kind} reference`}>
      <header className="topbar">
        <strong>{kind === 'races' ? 'All Troop Races' : 'All Special Powers'}</strong>
        <button className="ghost" onClick={onClose} aria-label="close help" data-testid="close-help">
          ✕
        </button>
      </header>
      <div className="rulesbody">
        <p className="sub">
          {kind === 'races'
            ? 'The number is how many troop tokens the race brings on its own.'
            : 'The number is how many extra troop tokens the power adds to any race.'}
        </p>
        {kind === 'races'
          ? ALL_RACES.map((r) => (
              <div className="helpentry" key={r}>
                <div className="helpname">
                  {RACES[r].name} <span className="helpvalue">+{RACES[r].banner} tokens</span>
                </div>
                <div className="helptext">{RACE_HELP[r]}</div>
              </div>
            ))
          : ALL_POWERS.map((p) => (
              <div className="helpentry" key={p}>
                <div className="helpname">
                  {POWERS[p].name} <span className="helpvalue">+{POWERS[p].value} tokens</span>
                </div>
                <div className="helptext">{POWER_HELP[p]}</div>
              </div>
            ))}
      </div>
    </div>
  );
}
