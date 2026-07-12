# Assumptions & Rulings

Every place the manual is ambiguous, silent, self-contradictory, or not
machine-readable, with the ruling adopted. Referenced from `RULES.md` as `[A#]`.

- **[A1] Coin denominations.** The physical game has 106 coins in 1/3/5/10
  denominations and says players may make change at any time. Denominations
  therefore have no gameplay effect; the bank is modeled as unlimited integer
  value. (Total printed value is 508; game totals never approach it.)
- **[A2] Reinforcement die faces.** The die faces are shown only in artwork.
  The custom Small World reinforcement die is 3 blank faces + 1, 2, 3; adopted
  here (same publisher component; consistent with "3 or less tokens short").
- **[A3] Map geometry.** The rulebook contains only photographs of the four
  boards; region shapes/adjacency are not extractable. This implementation
  ships four original maps that follow the printed structure: 5 land terrains
  in near-equal proportion, one river crossing the board with two ends at the
  board edge, impassable chasms (≥1 with a volcano symbol), ≤7 monster-symbol
  regions (2 monsters each), ≤9 black-mountain regions, region counts scaled
  by player count (2p:22, 3p:26, 4p:30, 5p:34 land+river regions). Rule-level
  fidelity is preserved; geography is not the printed geography.
- **[A4] "Mudpool" = "Muddy Region".** Mudmen reference Mudpool Regions; the
  Muddy power references Muddy Regions; the compatibility appendix equates
  Muddy with Marsh terrain. Treated as one terrain (`mud`).
- **[A5] Turns per map.** The manual says the track ends at the 8th, 9th or
  10th turn depending on the map. The setup photo shows the 3-player map with
  a 10-spot track. Adopting the original Small World's pattern: 2p and 3p:
  10 turns, 4p: 9, 5p: 8.
- **[A6] First player.** "Most recently visited a cave or cellar" is not
  implementable. The human picks their seat; seat 0 (configurable in New
  Game via seed/seat) starts.
- **[A7] Start-of-turn effect order.** The manual doesn't order Fountain of
  Youth / Great Ancient move / Reborn. All are resolved at start of turn;
  where interactions exist the active player's action order decides.
- **[A8] Fountain of Youth is automatic.** "Receives 1 bonus Race token" is
  not phrased as optional; applied automatically when the tray has a token.
  An extra token in hand is never harmful (it can always be deployed).
- **[A9] Fountain of Youth with In-Decline occupants.** Places' powers
  "cannot be used by Races that are In Decline" (general Popular Place rule);
  the Fountain has no "works In Decline" text, so In-Decline occupants get
  nothing.
- **[A10] Reborn before picking a combo.** Reborn replaces declined tokens
  with "a single new token from your Active Race". On the turn the player
  picks a fresh combo, the pick happens first, then Reborn may fire (the new
  race is Active by then). If the player somehow has no Active race, Reborn
  does nothing. If Reborn fires before the new race has entered the board,
  the replaced regions make the race "on the map", so First Conquest entry
  rules no longer bind (conquests chain from those regions).
- **[A11] Combo coins vs. payment.** The manual says you pocket coins on the
  chosen combo and must still pay for combos above it. Pocketing happens
  first, so a 0-coin player CAN take a costed combo carrying enough coins to
  fund its own cost. (Cost of combo i is i coins; if the combo carries c
  coins, net requirement is max(0, i - c) — payment is dropped coin-by-coin
  from the pocketed pool. The manual's wording "he must still drop one of
  his own Victory coins" is read as "coins now his own", which includes
  just-pocketed ones.)
- **[A12] Shadow Mimes token count.** Mimes swap their badge "immediately"
  when picking; the tokens received are for the badge they end up with
  (banner 7 + swapped-in badge value). The rulebook doesn't state which badge
  value applies; using the final association is the natural reading of
  "picks a number of tokens equal to the sum ... of the Race banner and its
  associated Special Power badge".
- **[A13] Badge starvation.** If the badge stack AND discard pile are both
  empty (mathematically possible late game with 5 players), new combos are
  banner-only and grant banner-value tokens with no power. The manual only
  covers reshuffling the discards.
- **[A14] Ready-troops is all-or-nothing per region.** The manual lets the
  player take "all his other tokens" back in hand. Taking fewer is strictly
  dominated (free redeployment happens at end of turn anyway), so the engine
  always picks up all-but-one automatically after optional abandonments.
  This removes no strategic option.
- **[A15] Silver Hammers in conquests.** Hammers "may be used for conquests
  only, not for defense". Rulings: (a) hammers count toward paying conquest
  costs; (b) at least one real Iron Dwarf token must be part of each
  conquest — this enforces "a player must always have at least one Race
  token available to initiate a new Conquest" and guarantees the
  redeployment requirement "leave at least one Iron Dwarf token in each
  Region" is always satisfiable; (c) hammers are auto-spent before dwarf
  tokens (never worse for the player: hammers vanish from the map at
  redeployment anyway).
- **[A16] Immunity vs. own conquest.** Immunity texts say "cannot be
  conquered by an opponent". A player conquering his own In-Decline region
  protected by his own (frozen) Queen or Ghost is thus technically legal;
  allowed by the engine. The Balrog's region is immune "to all players" —
  never conquerable.
- **[A17] Lizardmen river passage.** "Pass through any River Region ...
  without having to conquer it": modeled as adjacency-transparency — regions
  bordering the river are mutually reachable along each connected stretch of
  unoccupied (or own-occupied) river; a Kraken-occupied (or any occupied)
  river region blocks the chain at that point until conquered. River regions
  themselves are also directly attackable by Lizardmen via the same
  transparency.
- **[A18] Gnome shield covers In-Decline Gnomes.** The Gnomes text says
  "Regions occupied by your Gnomes" without an Active restriction, and the
  general race-benefit rule ("no longer apply once the race is put In
  Decline") conflicts with the Vampire text, which singles out Gnomes as
  protected (Vampire targets only single tokens — typical of In-Decline
  regions). Ruling: the protection follows the tokens, Active or In Decline.
- **[A19] River cost.** "The River only costs 1 token to conquer" is read as
  base cost 1 (instead of 2) plus the usual per-occupant additions — the
  Lizardmen text confirms occupied river regions must be conquered "as
  normal", which only makes sense if occupants add to a base cost.
- **[A20] Cultists' discount adjacency.** The Great Ancient discount applies
  to regions adjacent to the GA's region, using the Cultists' effective
  adjacency (the text explicitly includes adjacency granted by powers,
  places, relics).
- **[A21] Socks "as if empty".** A region is "non-empty if and only if it
  contains at least one Monster or Race token"; Black Mountain / Armor /
  Keep / markers exist in "empty" regions. So Socks ignore Monster and race
  tokens only; static defense (+Black Mountain, +Armor?, +Keep) still counts.
  Armors, however, are deployed by a race and are removed when the region is
  conquered... The armor bonus is defense added by an occupant, but the
  manual's emptiness definition doesn't count armors as making a region
  non-empty. For Socks, ruling: ignore Monster + race tokens; keep Black
  Mountain and Keep; ALSO ignore Mushroom Armors (an "empty" copy of the
  region wouldn't have a defender's armors in it — armors exist only while
  Shield troops hold the region).
- **[A22] Flames "as if empty".** Same emptiness reading as [A21]: ignore
  Monster tokens, race tokens and Mushroom Armors; Black Mountain and Keep
  still add; Mummies' +1 and other attacker-side modifiers still apply.
- **[A23] Discount stacking.** Nothing forbids combining (e.g. Ogres +
  Vengeful + Sword). All stack; minimum cost 1 ("A minimum of 1 token is
  still required" appears in each discount's text).
- **[A24] Conquering your own In-Decline region.** The manual says "He will
  lose the tokens" — read as: the standard Enemy Losses rules apply to your
  own In-Decline race (single token discarded; multiple: 1 discarded, rest
  redeploy into that In-Decline race's remaining regions at end of turn).
- **[A25] Liches 0-coin lockout scope.** "An opponent with no coins
  remaining cannot conquer a Region occupied by your Liches" — applies to
  any Liches-occupied region (Active or In Decline), since the sentence is
  unqualified, even though the tax itself only triggers for In-Decline
  Liches regions.
- **[A26] Vampire/Orb vs. monster regions.** Monster regions never contain a
  single *race* token at setup (2 monsters, 0 race tokens) — substitution
  requires a race token, so Vampire/Orb can never take a virgin monster
  region; no marker interaction arises. If a region with a Place/Relic and a
  single race token is vampirized, control of the marker changes normally.
- **[A27] Will-o'-Wisps token deployment on a die-assisted conquest.** The
  manual doesn't say how many tokens are deployed. Ruling: max(1, cost −
  roll), mirroring the cost actually paid. (The final-conquest rule's
  "deploys his remaining tokens there" is specific to the *final* attempt.)
- **[A28] A failed Will-o'-Wisps roll ends conquests.** The Wisps' die use
  before a conquest is the Reinforcement Die mechanism; the manual only
  defines failure for the final-conquest attempt ("his conquests for the
  turn end immediately"). Wisps declaring a target they cannot afford even
  with a max roll is disallowed outright (cost − hand must be ≤ 3); a
  legal-but-unlucky roll ends the conquest phase like a failed final
  conquest. A Wisps roll that succeeds does NOT end the turn (it is "before
  any conquest", not only the last).
- **[A29] No abandoning during redeployment.** Abandonment is defined in the
  conquest part of the turn ("If a player wishes to free up some more Race
  tokens"); at redeployment every held region must keep ≥ 1 token.
- **[A30] Hammers on decline.** "Until the Dwarves go In Decline" — all
  Silver Hammers return to the supply when the Dwarves decline or are wiped
  out.
- **[A31] End-of-turn ordering.** The manual doesn't order end-of-turn
  effects, defender redeployment ("as the final action of the current
  player's turn") and scoring ("His turn now complete..."). Adopted order:
  (1) active player's end-of-turn placements (Queen, Ghost, Scepter, Ring,
  Altar), (2) defender redeployments, (3) scoring, (4) Vengeance marker
  recovery. Rationale: scoring reads the final board state; Thieving/Drow/
  Ring interact with defender positions, and scoring last avoids order
  paradoxes. "Scepter ... before scoring" is honored (placement precedes
  scoring).
- **[A32] The Bag (Magic).** "You decide which one each turn": the Bag may
  duplicate one relic per turn (chosen implicitly by using it); it can copy
  relics controlled by anyone, since it "duplicates the power of 1 Righteous
  Relic currently in play" — in play means discovered and on the board. The
  restriction "cannot duplicate a Relic's power in a region where that power
  already applies" forbids e.g. Bag-as-Scepter on a region already holding
  the Scepter, or Bag-as-Ring on the Ring's region. The Bag sits in the
  region where it was last used (like a relic), is never captured, returns
  to hand if its region is conquered/abandoned, and leaves the game when the
  Magic race declines.
- **[A33] Defenders with no regions left.** Survivor tokens with no friendly
  region: an Active race keeps them in hand and re-enters next turn as First
  Conquest (explicit in the manual). For In-Decline survivors the manual
  covers only Tomb ("permanently lost"); ruling: all In-Decline survivors
  with no regions are returned to the tray (their banner returns to the
  stack) — an In-Decline race has no mechanism to re-enter the map.
- **[A34] Defender redeploy order.** Multiple dispossessed defenders
  redeploy in seat order from the active player. They cannot interact, so
  order is cosmetic.
- **[A35] Vengeance marker timing.** Markers are handed to the attacker at
  the moment a Vengeful player's region is conquered (max 4 markers). The
  discount applies during the marked player's... — correction: the marker is
  given TO the attacker-player; during the Vengeful player's next turn he
  attacks the marked player's regions at −1. Markers return to the Vengeful
  player's supply at the end of his own next turn (after his conquests),
  whether or not used. "Next turn" is tracked per opponent from the moment
  of marking; a decline turn also counts as the next turn (markers recovered
  at its end without effect).
- **[A36] Which badges persist In Decline.** The manual: "discards the
  Special Power badge ... unless dictated otherwise (e.g. Muddy, Reborn,
  Royal, etc…)". Full list adopted (powers whose text grants In-Decline
  effects): Muddy, Reborn, Royal, Tomb, Wise. Vanishing's effect happens at
  the decline moment, then its badge is discarded (nothing persists).
  Shield's Armors persist on the map per Shield's text, but the badge is
  discarded (no new armors are gained In Decline; existing armors keep
  defending until the region is lost/abandoned — they leave when the
  regions fall, and all leave if the Shield race vanishes from the board).
  Kraken's In-Decline river scoring is a race (banner) effect, not a badge.
- **[A37] Tomb final redeployment.** "You may redeploy them one final time"
  — among the regions the Tombs occupy at decline (each keeps ≥ 1); regions
  may not be abandoned at this moment (redeployment rules, not conquest
  rules, apply).
- **[A38] Great Ancient on decline.** Cultist benefits (including the GA's
  immunity) are Active-race benefits with no "In Decline" clause, so the GA
  leaves the board when the Cultists decline or are eliminated.
- **[A39] The Volcano after Flames.** The Volcano marker has no effect
  except for Active Flames; it stays on its chasm (cosmetic) and is reused
  if Flames are picked again later (the banner can return to the market).
  When Flames are re-picked, the new player places the Volcano afresh.
- **[A40] The Bag on decline/wipe-out.** Returned to the box (no In-Decline
  clause in Magic).
- **[A41] Decline-turn end-of-turn effects.** On a decline turn the player
  may still use Altar of Souls (it works In Decline) and benefits from
  Keep/Mine/Diamond Fields In-Decline scoring. He may NOT place the Queen
  (Royal says the Queen "stays where it was" on decline), may not move the
  Ghost if his Crypt troops just declined, may not place Scepter/Ring (Active
  only).
- **[A42] Banner return position.** "Bottom of the stack of Race banners, or
  in the lowest empty slot in the banner column, if any": if fewer than 5
  column combos exist, the returning banner (with a badge drawn from the
  badge stack/discard reshuffle, if available) fills the lowest empty column
  slot; otherwise it goes under the banner stack.
- **[A43] Flocking/Quarreling connectivity metric.** "Single set of adjacent
  Regions" is evaluated with the race's own effective adjacency — the manual
  states Spiderines' chasm-spread still flocks, which is exactly Spiderine
  adjacency. Great Brass Pipe adjacency (controller only) also counts.
  Kraken-held river regions connect normally (river regions border their
  neighbors).
- **[A44] Thieving collects from opponents only.** "From each player" cannot
  sensibly include oneself (bordering yourself would tax yourself);
  opponents only. A player's own In-Decline race bordering his Thieves does
  not pay.
- **[A45] Scepter of Avarice scope.** "Double the number of Victory coins
  collected from that Region", never coins from other players. Doubled:
  the region's base 1 coin and any per-region from-the-bank bonuses
  attributable to that region (Shrooms/Mining/Muddy/Mystic/Stone terrain
  bonuses, Adventurous, Frightened, Drow's recluse bonus, Keep's +1,
  Diamond Fields' +1 for that region, Kraken river +1). Not doubled:
  set-level bonuses (Flocking, Quarreling, Fisher pairs, Wise, Altar's +3,
  Mine of the Lost Dwarf (explicitly excluded — Scepter has no effect
  there)).
- **[A46] Full tie.** Coins and token counts both tied → shared victory
  (manual silent beyond the first tiebreaker).
- **[A47] The Wickedest Pentacle's truncated text.** The printed English
  rulebook ends page 15 mid-sentence: "...does not score Victory coins for
  anyone (player who controls the". Ruling: the sentence completes as
  "player who controls the Wickedest Pentacle's Region included", and the
  Balrog, once placed, never moves for the rest of the game. Supporting
  evidence within the manual: the immunity section lists the Balrog among
  permanent immunity sources "for as long as the Balrog ... is present";
  no rule anywhere grants a Balrog move; the Gnomes' note ("the Balrog
  can't conquer a Region occupied by Gnomes") matches the single conquest at
  invocation. If the Balrog's chosen region is empty, it simply occupies it
  (no token loss). The Balrog cannot be sent to a chasm, to an immune
  region, or to a Gnome-occupied region; if every neighboring region is
  ineligible, the Balrog is not placed and the Pentacle has no further
  effect. The discovering player chooses the region.
- **[A48] Balrog "loses 2 tokens".** The displaced occupant discards 2
  tokens (or all, if fewer) to the tray and redeploys any survivors at end
  of the current player's turn like a normal dispossession. Immortal
  defenders lose 0 (their text overrides the count? No — Immortal says
  "rather than discarding 1"; the Balrog says "not 1, but 2". Ruling:
  Immortal's blanket no-discard wins its specific conflict: Immortal
  defenders keep all tokens; the Balrog clause modifies the *standard*
  1-token loss, which Immortal replaces).
- **[A49] Monster tokens are destroyed on conquest.** Monsters belong to no
  player; when their region is conquered they are removed from the game
  (nothing redeploys them; the manual gives no other handling).
- **[A50] Stonehedge power scope.** The drawn power benefits whichever
  player currently occupies the Stonehedge region, in addition to his own
  power, following the drawn power's own Active/In-Decline rules as
  described in the Stonehedge text. If the drawn power is Vampire/Vengeful
  etc., its once-per-turn limits are tracked separately from an identical
  regular badge (cannot practically co-occur since each badge is unique —
  the Stonehedge draw removes the badge from the stack, so no duplicate
  exists). Tomb-via-Stonehedge: tokens only keep the Tomb benefit while the
  player controls the Stonehedge region, except the explicit carve-out that
  losing the region does not wipe the tokens at once (they keep the "all
  tokens stay" they already received; subsequent conquests of their regions
  follow normal In-Decline rules — no further Tomb redeployment without the
  Stonehedge).
- **[A51] Stonehedge draw source.** The power is drawn "at random from the
  stack of Special Powers" — from the face-up badge stack (shuffled draw,
  not the top badge, per "at random"). If the stack is empty, the discard
  pile is reshuffled first; if both are empty the Stonehedge grants nothing.
  The visible stack-top combo keeps its badge (the draw takes a random badge
  from the remaining stack contents; the stack-top badge that is part of the
  visible 6th combo is excluded).
- **[A52] Flames volcano placement with no volcano chasm free.** Each map
  has ≥1 volcano-symbol chasm; the Volcano marker simply sits there
  (multiple Flames pickups reuse it, see [A39]). If the Flames player must
  place the Volcano and every volcano chasm... there is exactly one Volcano
  marker and ≥1 site; placement is always possible (sites are chasms, never
  occupied).
- **[A53] Flames first conquest.** "Their first conquest must be in a
  region adjacent to [the Volcano]" overrides the edge-region First
  Conquest rule (it is their entry mechanism). Regions adjacent to the
  chosen volcano chasm are their legal entries, at as-if-empty cost per
  their power.
- **[A54] Thieving/Ring/Liches payments and hidden coins.** Coin transfers
  reveal nothing numerically to opponents in the physical game beyond the
  transfer itself; the digital log records the transfer (amount 0 or 1 per
  payer for Thieving/Ring) without revealing totals.
- **[A55] Self-play "random legal actions" termination.** The redeploy/
  placement phases always terminate because every placement action strictly
  reduces hand size and hands are bounded; conquest phases terminate because
  each conquest strictly reduces hand size by ≥1 (min cost 1) and
  `endConquest` is always available; the random agent cannot loop forever.
  A hard cap of 4000 actions per game is asserted anyway.
- **[A56] Great Brass Pipe and First Conquest.** Pipe adjacency applies only
  to a player whose troops occupy the Pipe's region, so it never affects a
  race entering the map (they occupy nothing). Edge-entry rules unchanged.
- **[A57] Immunity blocks Vampire/Orb/Socks/Doormat targeting** (they are
  powers/relic effects of opponents) and also plain conquest by opponents.
  It does not block the owner himself ([A16]).
- **[A58] Queen/Ghost/GA/Balrog and scoring.** Immunity pieces don't affect
  scoring except the Balrog's region scoring for nobody. The Queen/Ghost/GA
  do not count as race tokens for any purpose (defense, Frightened's ≥3,
  tie-breaker).
- **[A59] Armors/hammers and the tie-breaker.** "Most Race tokens" counts
  race tokens only — not armors, hammers, monsters, or figures.
- **[A60] Multiple simultaneous "once per turn" relics.** Sword + Socks (+
  Doormat reach) may all boost the same single conquest if the player
  controls them; each is consumed for the turn.
