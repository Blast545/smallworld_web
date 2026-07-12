// State invariants asserted at every self-play step (TEST_PLAN).

import { ALL_RACES, MARKERS, RACES } from '../engine/data';
import type { MarkerId } from '../engine/data';
import { getMap } from '../engine/setup';
import { raceTokensTotal } from '../engine/scoring';
import type { GameState } from '../engine/types';

export function checkInvariants(state: GameState): void {
  const map = getMap(state);

  // Race token conservation: tray + board + hands + pending = supply.
  for (const race of ALL_RACES) {
    const total = raceTokensTotal(state, race);
    if (total !== RACES[race].supply) {
      throw new Error(`token conservation broken for ${race}: ${total} != ${RACES[race].supply}`);
    }
  }

  // Monster conservation.
  const monsterRegions = map.regions.filter((r) => r.monsterSymbol).length;
  const onBoard = state.regions.reduce((a, r) => a + r.monsters, 0);
  if (onBoard + state.monstersDestroyed !== monsterRegions * 2) {
    throw new Error('monster conservation broken');
  }

  // Armor / hammer caps.
  const armors =
    state.regions.reduce((a, r) => a + r.armors, 0) +
    state.players.reduce((a, p) => a + p.armorHand, 0);
  if (armors > 8) throw new Error('more than 8 armors in play');
  const hammers =
    state.regions.reduce((a, r) => a + r.hammers, 0) +
    state.players.reduce((a, p) => a + (p.active?.hammerPool ?? 0), 0);
  if (hammers > 7) throw new Error('more than 7 hammers in play');

  // Coins.
  for (const p of state.players) {
    if (p.coins < 0) throw new Error('negative coins');
  }

  // Region occupancy consistency.
  state.regions.forEach((r, rid) => {
    const mr = map.regions[rid];
    if (!mr) throw new Error('region mismatch');
    if (r.owner !== null) {
      if (r.tokens < 1) throw new Error(`owned region ${rid} with no tokens`);
      if (r.race === null) throw new Error(`owned region ${rid} with no race`);
      if (mr.terrain === 'chasm') throw new Error('occupied chasm');
      const p = state.players[r.owner];
      if (!p) throw new Error('bad owner');
      if (r.inDecline) {
        if (p.declined?.race !== r.race) throw new Error(`declined race mismatch in ${rid}`);
      } else {
        if (p.active?.race !== r.race) throw new Error(`active race mismatch in ${rid}`);
      }
    } else {
      if (r.tokens !== 0) throw new Error(`unowned region ${rid} with tokens`);
      if (r.armors !== 0) throw new Error(`unowned region ${rid} with armors`);
    }
    if (r.figures.some((f) => f.kind === 'balrog') && r.owner !== null) {
      throw new Error('balrog region occupied');
    }
    if (r.blackMountain !== (mr.terrain === 'blackMountain')) {
      throw new Error('black mountain marker moved');
    }
  });

  // Each unique marker/figure at most once.
  const seenMarkers = new Set<MarkerId>();
  for (const r of state.regions) {
    for (const m of r.markers) {
      if (seenMarkers.has(m)) throw new Error(`marker ${m} duplicated`);
      seenMarkers.add(m);
    }
  }
  for (const m of state.markerDeck) {
    if (seenMarkers.has(m)) throw new Error(`marker ${m} in deck and on board`);
    seenMarkers.add(m);
  }
  for (const kind of ['balrog', 'greatAncient', 'queen', 'ghost', 'volcano']) {
    const count = state.regions.reduce(
      (a, r) => a + r.figures.filter((f) => f.kind === kind).length,
      0,
    );
    if (count > 1) throw new Error(`figure ${kind} duplicated`);
  }
  void MARKERS;

  // Market consistency: while the banner stack has cards, the column is full.
  // Exception: during the Shadow Mimes swap the picked slot is a hole — the
  // market is replenished only after the swap resolves (rulebook p.11).
  if (
    state.phase !== 'mimeSwap' &&
    state.bannerStack.length > 0 &&
    state.column.some((c) => c === null)
  ) {
    throw new Error('column has holes while banner stack is non-empty');
  }
  const bannersInUse = state.players.reduce(
    (a, p) => a + (p.active ? 1 : 0) + (p.declined ? 1 : 0),
    0,
  );
  const bannersInMarket =
    state.column.filter((c) => c !== null).length + state.bannerStack.length;
  if (bannersInUse + bannersInMarket !== 15) {
    throw new Error(`banner conservation broken: ${bannersInUse} + ${bannersInMarket} != 15`);
  }

  // River regions are empty at turn boundaries unless held by Kraken.
  if (state.phase === 'pickCombo' || state.phase === 'startTurn') {
    state.regions.forEach((r, rid) => {
      const mr = map.regions[rid];
      if (mr?.terrain === 'river' && r.tokens > 0 && r.race !== 'kraken') {
        throw new Error(`river region ${rid} occupied by ${r.race} at turn start`);
      }
    });
  }

  if (state.gameOver && state.winners.length === 0) {
    throw new Error('game over without winners');
  }
}
