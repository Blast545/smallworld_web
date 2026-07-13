// Full-screen reference sheets for players new to the game: all races
// ("troops"), all special powers ("modifiers"), and the map legend
// (terrain colors + board icons).

import type { JSX } from 'react';
import {
  ALL_MARKERS,
  ALL_POWERS,
  ALL_RACES,
  MARKERS,
  POWER_HELP,
  POWERS,
  RACE_HELP,
  RACES,
  TERRAIN_NAMES,
} from '../engine/data';
import type { Terrain } from '../engine/data';
import type { FigureKind } from '../engine/types';
import { PLAYER_COLORS } from './Board';
import {
  FIGURE_GLYPH,
  FIGURE_HELP,
  MARKER_GLYPH,
  MARKER_HELP,
  TERRAIN_FILL,
  TERRAIN_HELP,
} from './glyphs';

export type HelpKind = 'races' | 'powers' | 'legend';

const TERRAIN_ORDER: Terrain[] = [
  'mine',
  'mushroom',
  'crystal',
  'mud',
  'blackMountain',
  'river',
  'chasm',
];

const FIGURE_ORDER: FigureKind[] = ['balrog', 'greatAncient', 'queen', 'ghost', 'volcano'];

const TITLES: Record<HelpKind, string> = {
  races: 'All Troop Races',
  powers: 'All Special Powers',
  legend: 'Map Legend',
};

export function HelpSheet({
  kind,
  onClose,
}: {
  kind: HelpKind;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="rules" role="dialog" aria-label={`${kind} reference`}>
      <header className="topbar">
        <strong>{TITLES[kind]}</strong>
        <button className="ghost" onClick={onClose} aria-label="close help" data-testid="close-help">
          ✕
        </button>
      </header>
      <div className="rulesbody">
        {kind === 'races' && (
          <>
            <p className="sub">The number is how many troop tokens the race brings on its own.</p>
            {ALL_RACES.map((r) => (
              <div className="helpentry" key={r}>
                <div className="helpname">
                  {RACES[r].name} <span className="helpvalue">+{RACES[r].banner} tokens</span>
                </div>
                <div className="helptext">{RACE_HELP[r]}</div>
              </div>
            ))}
          </>
        )}
        {kind === 'powers' && (
          <>
            <p className="sub">
              The number is how many extra troop tokens the power adds to any race.
            </p>
            {ALL_POWERS.map((p) => (
              <div className="helpentry" key={p}>
                <div className="helpname">
                  {POWERS[p].name} <span className="helpvalue">+{POWERS[p].value} tokens</span>
                </div>
                <div className="helptext">{POWER_HELP[p]}</div>
              </div>
            ))}
          </>
        )}
        {kind === 'legend' && <Legend />}
      </div>
    </div>
  );
}

function Legend(): JSX.Element {
  return (
    <div data-testid="legend">
      <h2>Terrain colors</h2>
      {TERRAIN_ORDER.map((t) => (
        <div className="helpentry legendrow" key={t}>
          <span className="swatch" style={{ background: TERRAIN_FILL[t] }} />
          <div>
            <div className="helpname">{TERRAIN_NAMES[t]}</div>
            <div className="helptext">{TERRAIN_HELP[t]}</div>
          </div>
        </div>
      ))}

      <h2>Troops &amp; defense</h2>
      <div className="helpentry legendrow">
        <span className="swatch tokenswatch" style={{ background: PLAYER_COLORS[0] }}>
          3
        </span>
        <div className="helptext">
          A circle shows a player's troops and how many tokens defend the region (each token adds
          +1 to its conquest cost). The circle's color is the player's color.
        </div>
      </div>
      <div className="helpentry legendrow">
        <span className="swatch tokenswatch declined" style={{ background: PLAYER_COLORS[0] }}>
          1
        </span>
        <div className="helptext">
          A faded, dashed circle is a race In Decline: it still scores 1 coin per region for its
          owner but no longer attacks.
        </div>
      </div>
      <div className="helpentry legendrow">
        <span className="swatch glyphswatch">👾2</span>
        <div className="helptext">
          Monsters guard a hidden Popular Place or Righteous Relic; each monster adds +1 defense.
          Conquer them to reveal and claim it.
        </div>
      </div>
      <div className="helpentry legendrow">
        <span className="swatch glyphswatch">⛰️</span>
        <div className="helptext">
          Black Mountain marker: +1 defense, never moves, keeps defending its new owner.
        </div>
      </div>
      <div className="helpentry legendrow">
        <span className="swatch glyphswatch">🛡️</span>
        <div className="helptext">Mushroom Armor (Shield power): +1 defense each.</div>
      </div>
      <div className="helpentry legendrow">
        <span className="swatch glyphswatch">🔨</span>
        <div className="helptext">
          Silver Hammers (Iron Dwarves): pay for conquests, add no defense.
        </div>
      </div>

      <h2>Figures</h2>
      {FIGURE_ORDER.map((f) => (
        <div className="helpentry legendrow" key={f}>
          <span className="swatch glyphswatch">{FIGURE_GLYPH[f]}</span>
          <div className="helptext">{FIGURE_HELP[f]}</div>
        </div>
      ))}

      <h2>Popular Places &amp; Righteous Relics</h2>
      <p className="sub">
        Revealed by conquering monster regions. Places (🏛) never move; Relics can travel with
        their use. Whoever holds the region gets the power.
      </p>
      {ALL_MARKERS.map((m) => (
        <div className="helpentry legendrow" key={m}>
          <span className="swatch glyphswatch">{MARKER_GLYPH[m]}</span>
          <div>
            <div className="helpname">
              {MARKERS[m].name}{' '}
              <span className="helpvalue">{MARKERS[m].kind === 'place' ? 'Place' : 'Relic'}</span>
            </div>
            <div className="helptext">{MARKER_HELP[m]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
