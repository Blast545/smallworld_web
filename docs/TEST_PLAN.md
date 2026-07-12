# Test Plan

Rule-level invariants and scenarios asserted by the automated suite.
Unit tests live in `src/test/rules/` (one file per cluster below); the
self-play harness is `src/test/selfplay.ts`; E2E in `src/test/e2e/`.

## Cluster: setup (`setup.test.ts`)
- For each player count 2–5: correct map chosen; turn track length 10/10/9/8;
  marker at 1; 6 visible combos (5 column + stack top); banner stack has
  15 − 6 = 9 banners hidden below top... precisely: 5 column + 10 stack (top
  visible); badges: 5 column + 16 stack; every combo has a badge.
- Monster regions each hold exactly 2 monsters; total monsters on board =
  2 × monsterRegions ≤ 14.
- Place/Relic deck size = number of monster regions; contents drawn from the
  15 unique markers, no duplicates.
- Every black-mountain region has a marker; ≤ 9.
- Every player starts with 5 coins, no races, empty hand.
- Same seed ⇒ identical initial state (deep equality); different seeds ⇒
  different shuffles (statistically).
- Map integrity (per map): adjacency symmetric & irreflexive; every
  non-chasm region reachable from an edge region; river forms ≥1 connected
  stretch with ≥2 end regions on the board edge; ≥1 volcano chasm; every
  terrain present; no monster symbol on river/chasm; edge flags consistent
  with geometry (cell-grid derivation).

## Cluster: combo market (`combos.test.ts`)
- Picking combo i costs i coins, dropped one per combo above; picking with
  exactly i coins allowed; with fewer, action not in legal set (unless the
  combo carries coins covering the difference — [A11] case asserted).
- Coins on a picked combo are pocketed.
- Column slides up; a new combo is revealed; 6 combos visible again.
- Race tokens received = banner + badge values (spot-checked for several
  pairs).
- Shadow Mimes swap: legal targets are the other 5 visible combos; token
  count uses swapped badge [A12]; coins do not move.
- Badge stack exhaustion: discard pile reshuffles; banner-only combos when
  both empty [A13].

## Cluster: conquest core (`conquest.test.ts`)
- First Conquest only into edge regions (river ends count); non-edge target
  not in legal actions.
- Base cost 2; +1 per monster, per race token, per Black Mountain marker,
  per armor, +1 Keep; river base 1 [A19]; minimum 1.
- Exactly `cost` tokens deployed; hand decremented; cannot initiate with 0
  tokens in hand; a conquest costing more than hand is not in legal actions
  (except die-roll paths).
- Adjacency: conquests after the first must be adjacent to own active
  regions; chasms never targetable; chasm never grants adjacency.
- Defender losses: multi-token → 1 discarded to tray + survivors pending
  redeploy at end of attacker's turn; single token → destroyed; own
  In-Decline race conquered [A24].
- Monster region conquest: monsters removed from game; top marker drawn and
  placed; discovery effects fire (Stonehedge, Pentacle).
- Full-turn flow: ready troops picks up all-but-one; abandoning region
  frees all tokens; abandoning all regions ⇒ next conquest is First
  Conquest.
- Final conquest die: only when short by 1–3; success deploys all remaining
  tokens; failure redeploys into own region; either way conquest phase ends.
  Die faces 0,0,0,1,2,3 [A2] — deterministic under seed.
- Redeployment: river regions force-emptied (non-Kraken); each region keeps
  ≥1; tokens in hand with no regions persist to next turn.

## Cluster: decline (`decline.test.ts`)
- Decline turn: no conquests; 1 token per region flipped, rest to tray;
  badge discarded (except persisting list [A36]); banner flipped.
- Second decline removes first In-Decline race entirely; banner returns to
  stack bottom / lowest empty slot [A42].
- Scoring on decline turn: 1/region (+Muddy/Wise/Kraken/Keep etc. per
  RULES §5).
- Wipe-out of last In-Decline token returns banner immediately.
- Player with no active race must pick combo next turn; First Conquest
  entry applies.
- Vanishing: all tokens removed, 2 coins per region; Tomb: all tokens kept
  + final redeploy among tomb regions; Wise +2 including decline turn.

## Cluster: races (`races.test.ts`)
One scenario per race asserting its exact effect:
- Cultists: GA placed on first conquered region; region immune to opponents;
  −1 cost adjacent to GA (min 1); GA moves at start of turn; GA leaves on
  decline [A38].
- Drow: recluse bonus counts only regions with no neighboring race tokens /
  monsters.
- Flames: volcano placement on volcano chasm at pick; entry adjacent to
  volcano [A53]; as-if-empty cost for volcano-adjacent and flame-linked
  regions [A22]; chain broken ⇒ normal cost.
- Gnomes: opponent cannot use Doormat/Pipe/Spiderine adjacency, Sword/Socks/
  Ogre/Cultist discounts, Vampire/Orb, or Balrog against Gnome regions;
  plain adjacent conquest at full cost works; Mummies +1 still applies;
  Gnomes' own turn unaffected; In-Decline Gnomes still protected [A18].
- Iron Dwarves: +1 hammer per mine region at end of redeploy (cap 7);
  hammers usable to pay conquests (spent first, ≥1 dwarf per conquest
  [A15]); hammers never defend (not counted in region defense); hammers
  removed from map after redeploy; lost on decline [A30].
- Kraken: may keep river regions at redeploy; river regions score, even In
  Decline; Kraken-held river blocks Lizardmen passage.
- Liches: attacker pays 1 coin to owner on conquering In-Decline Liches
  region; 0-coin attacker cannot target any Liches region [A25].
- Lizardmen: river transparency for adjacency [A17]; occupied river blocks;
  may conquer river region then must empty it at redeploy.
- Mudmen: +1 token per mud region at redeploy, tray-limited.
- Mummies: every conquest +1 (still +1 vs Gnomes).
- Ogres: −1 (min 1).
- Shadow Mimes: swap tested in combos cluster.
- Shrooms: +1 per mushroom region at scoring.
- Spiderines: chasm-border adjacency for conquest & entry.
- Will-o'-Wisps: die before conquest of crystal/adjacent-to-own-crystal
  region; must conquer if affordable after roll [A27]; failed roll ends
  conquests [A28].

## Cluster: powers (`powers.test.ts`)
One scenario per power:
- Adventurous (+1/place region), Fisher (pairs of coastal), Flocking
  (single connected set, Spiderine adjacency case), Frightened (≥3 tokens),
  Immortal (no discard on loss; vampirized Immortal still lost), Magic (bag
  duplicates each relic type; not where power already applies; bag returns
  to hand on region loss; leaves game on decline [A40]), Martyr (+1 per
  conquered region), Mining/Muddy/Mystic/Stone (terrain bonuses; Muddy
  persists In Decline), Quarreling (per disconnected group), Reborn
  (In-Decline replacement 1–2 regions at start of turn; from tray else
  hand), Royal (queen placement, immunity, frozen on decline), Shield
  (armor gain per mushroom region, +1 defense each, discard on
  conquest/abandon, persists In Decline), Thieving (steals 1 from bordering
  opponents, capped by their coins), Tomb (kept tokens, final redeploy,
  excess redeploy on loss, permanent loss with no regions), Vampire (once
  per turn per opponent, single-token targets, Gnome immunity, tray-else-
  hand token, substituted token to tray), Vanishing (2/region), Vengeful
  (marker handout on being attacked, −1 next turn vs that player, markers
  recovered), Wise (+2 while In Decline on board).

## Cluster: relics & places (`markers.test.ts`)
- Doormat: non-adjacent conquest once/turn; moves on success; stays on
  failed final-conquest attempt.
- Ring: end-of-turn placement; collects 1 from each bordering-active
  opponent, capped by their coins.
- Socks: as-if-empty cost [A21]; dispossessed defender redeploys ALL tokens
  (no discard).
- Scepter: doubles per-region bank coins [A45]; no effect on Mine of Lost
  Dwarf; never doubles player-to-player transfers.
- Orb: single-token substitution, once/turn, Vampire "single" definition.
- Sword: −2 once/turn (min 1).
- Altar: discard 1 In-Decline token → +3; works In Decline.
- Crypt: ghost placement (not on Crypt region), immunity, frozen when
  occupant In Decline, transfers when Crypt conquered.
- Diamond Fields: +1 for region & same-terrain occupied regions; In Decline
  too.
- Brass Pipe: same-terrain adjacency for controller [A56].
- Fountain: +1 token at start of turn (tray-limited; Active only [A9]).
- Keep: +1 coin & +1 defense; persists In Decline.
- Mine of Lost Dwarf: +2, In Decline too.
- Stonehedge: random badge from stack [A51]; occupant gains its power
  [A50].
- Pentacle: Balrog into chosen neighbor; 2-token loss [A48]; region immune
  to all & scores for nobody [A47]; Gnome/immune/chasm regions ineligible.
- General: markers never add defense (Keep excepted); relic capture changes
  control; place/relic left behind on abandon; power usable immediately on
  discovery.

## Cluster: scoring & endgame (`scoring.test.ts`)
- +1 per active region, +1 per In-Decline region; river only for Kraken.
- Each bonus from RULES §5 has a positive and a zero case.
- Balrog region scores for nobody.
- Game ends after final round; winner = most coins; tie → most tokens on
  board; double tie → shared [A46].
- Scores from getScores match the sum of all logged coin movements
  (conservation of coins: bank Δ + transfers).

## Cluster: hidden info & determinism (`visibility.test.ts`)
- getVisibleState hides deck order/contents, opponents' coin totals, stack
  order below visible tops; own coins visible; board fully visible.
- Bots receive only visible state (type-level: bot module imports no raw
  state accessor; runtime: choosing on a state with masked values works).
- Determinism: same (config, seed, action list) ⇒ byte-identical JSON state
  at every step; die rolls come from state RNG.

## Self-play harness (`selfplay.ts`, run via `npm run verify`)
- 2000 games random-legal-agent (500 per player count) + 500 games
  all-heuristic-bots (125 per player count).
- Asserted at every step: no exception; getLegalActions non-empty unless
  terminal; chosen action ∈ legal set; token conservation per race
  (tray+hands+board+pending = supply); monsters board+destroyed = 14;
  armors ≤ 8, hammers ≤ 7 conserved; coins ≥ 0; every occupied region ≥ 1
  token; ≤ 1 In-Decline race per player; river empty at end of non-Kraken
  turns; 6 combos visible when supply allows; game ends within action cap
  (4000) and within the map's turn count; final scores valid & winner
  determined; full replay of (seed, action log) reproduces byte-identical
  final state.
- On failure: seed + action log dumped to `selfplay-failures/` for
  deterministic replay; each fixed bug gets a regression test.

## E2E (`e2e/game.spec.ts`, Playwright, iPhone 12 viewport 390×844)
- Launch built app; new game vs 4 bots (max players); play a complete game
  through the real UI to a declared winner (human moves chosen by a simple
  scripted policy driving the same buttons a person would tap).
- Assert: no console errors; no horizontal page scroll; all interactive
  targets ≥ 44×44; game log visible and growing; winner banner appears.
- Offline: after first load, service worker serves the app shell with
  network disabled (context.setOffline) and a new game still starts.
- Resume: reload mid-game restores identical state from localStorage.
