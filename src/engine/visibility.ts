// Hidden-information masking. Both the UI and the bots consume the result of
// getVisibleState, never the raw state. Hidden zones are replaced by
// deterministic canonical stand-ins so the masked state is still a fully
// playable GameState (bots can run applyAction on it for lookahead without
// ever seeing the truth).

import { ALL_MARKERS } from './data';
import type { MarkerId } from './data';
import { hashString } from './rng';
import { cloneState } from './setup';
import type { GameState } from './types';

export function getVisibleState(state: GameState, playerId: number): GameState {
  const v = cloneState(state);

  // The Place/Relic deck: contents and order are secret. Replace with a
  // canonical guess drawn from the markers not visible on the board.
  const onBoard = new Set<MarkerId>();
  for (const r of v.regions) for (const m of r.markers) onBoard.add(m);
  const unknown = ALL_MARKERS.filter((m) => !onBoard.has(m));
  v.markerDeck = unknown.slice(0, v.markerDeck.length);

  // Stack orders below the visible tops are hidden: canonical sort.
  const bannerTop = v.bannerStack[0];
  const bannerRest = v.bannerStack.slice(1).sort();
  v.bannerStack = bannerTop !== undefined ? [bannerTop, ...bannerRest] : [];
  const badgeTop = v.badgeStack[0];
  const badgeRest = v.badgeStack.slice(1).sort();
  v.badgeStack = badgeTop !== undefined ? [badgeTop, ...badgeRest] : [];

  // Opponents' coin totals are hidden; replace with a deterministic estimate
  // (average income) so simulated transfers stay sane.
  const estimate = 5 + 3 * (v.turn - 1);
  v.players.forEach((p, i) => {
    if (i !== playerId) p.coins = estimate;
  });

  // Future die rolls must not be predictable.
  v.rng = hashString(`visible:${playerId}:${state.actionCount}:${state.config.seed}`);

  return v;
}
