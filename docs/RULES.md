# Small World Underground — Implementation Rules Specification

This is the implementation-ready restatement of the rules from `docs/rulebook.txt`.
Every ruling that goes beyond the literal manual text is cross-referenced in
`docs/ASSUMPTIONS.md` as `[A#]`.

## 1. Components and supply limits

| Component | Quantity | Notes |
|---|---|---|
| Race banners | 15 | one per race |
| Special Power badges | 21 | unique |
| Race tokens | see below | hard supply limits |
| Monster tokens | 14 | placed 2 per Monster-symbol region at setup |
| Black Mountain markers | 9 | one per mountain-symbol region |
| Popular Places | 9 | unique markers |
| Righteous Relics | 6 | unique markers |
| Volcano | 1 | used by Flames |
| Great Ancient | 1 | Cultists |
| Balrog | 1 | Wickedest Pentacle |
| Tomb-raider's Ghost | 1 | Crypt of the Tomb-raider |
| Queen | 1 | Royal |
| Mushroom Armors | 8 | Shield |
| Vengeance markers | 4 | Vengeful |
| Silver Hammers | 7 | Iron Dwarves |
| Bag-o'-Many-Things | 1 | Magic |
| Victory coins | effectively unlimited value [A1] | players start with 5 each |
| Reinforcement die | 1 | faces 0,0,0,1,2,3 [A2] |
| Game turn marker | 1 | |

Race token supplies (hard caps; a race can never have more tokens in
play + hand + tray than this):

| Race | Banner value | Token supply |
|---|---|---|
| Cultists | 5 | 10 |
| Drow | 4 | 9 |
| Flames | 4 | 9 |
| Gnomes | 6 | 11 |
| Iron Dwarves | 7 | 12 |
| Kraken | 5 | 10 |
| Liches | 5 | 10 |
| Lizardmen | 7 | 12 |
| Mudmen | 5 | 12 |
| Mummies | 10 | 15 |
| Ogres | 5 | 10 |
| Shadow Mimes | 7 | 12 |
| Shrooms | 5 | 10 |
| Spiderines | 7 | 12 |
| Will-o'-Wisps | 6 | 11 |

Special Power badge values (bonus race tokens granted):

| Power | Value | Power | Value | Power | Value |
|---|---|---|---|---|---|
| Adventurous | 5 | Mining | 4 | Stone | 4 |
| Fisher | 4 | Muddy | 3 | Thieving | 4 |
| Flocking | 5 | Mystic | 4 | Tomb | 5 |
| Frightened | 4 | Quarreling | 3 | Vampire | 5 |
| Immortal | 4 | Reborn | 5 | Vanishing | 5 |
| Magic | 5 | Royal | 5 | Vengeful | 4 |
| Martyr | 4 | Shield | 3 | Wise | 4 |

## 2. The maps

Four maps, one per player count (2, 3, 4, 5). The physical maps' exact
geometry is not machine-readable from the rulebook; this implementation ships
its own four maps that follow the printed maps' structure [A3]. Every map has:

- **Regions** with exactly one terrain each: `mine`, `mushroom` (Mushroom
  Forest), `crystal` (Mystic Crystal), `mud` (Mudpool / "Muddy Region" [A4]),
  `blackMountain`, `river`, or `chasm` (Abysmal Chasm).
- **Edge regions**: regions bordering the board edge, usable for First
  Conquest. The two River end regions touch the edge and count.
- **Monster-symbol regions** (≤ 7 per map since only 14 Monster tokens
  exist): each starts with 2 Monster tokens. Never on river or chasm.
- **Black-mountain-symbol regions**: exactly the `blackMountain` terrain
  regions (≤ 9); each starts with a Black Mountain marker.
- **Volcano-symbol chasms**: at least one chasm per map carries the volcano
  symbol (Flames' volcano can only be placed there).
- **Turn counts**: 2p → 10, 3p → 10, 4p → 9, 5p → 8 turns [A5].

Chasms are impassable: they can never be conquered or occupied and never
count as adjacent for movement/conquest (except Spiderines' special
adjacency, which treats regions *bordering* a chasm as adjacent to their
regions — chasms themselves remain unenterable).

Adjacency is symmetric and derived from shared borders on the map.

## 3. Setup

1. Select the map for the player count; game turn marker on spot 1.
2. Shuffle the 15 race banners; deal 5 face-up into column slots 0–4
   (slot 0 = top). Remaining banners form a face-up stack; its top banner is
   visible. Shuffle the 21 badges; attach one to each of the 5 column banners;
   remaining badges form a stack whose top badge pairs with the banner stack's
   top banner. There are always 6 visible combos: column slots 0–4 plus the
   stack-top combo (slot 5).
3. Place 2 Monster tokens on each monster-symbol region.
4. Shuffle the 15 Place/Relic markers together, draw as many as there are
   monster regions, stack face down (hidden from everyone). Remove the rest
   from the game unseen.
5. Black Mountain marker on each black-mountain region.
6. Each player receives 5 victory coins (value 5).
7. Seat order is play order; seat 0 is the first player [A6].

## 4. Turn structure

Play proceeds clockwise from the first player. A **round** = every player
taking one turn. At the start of each round after the first, the game turn
marker advances. The game ends after the round in which the marker sits on
the final spot; then scores are revealed.

A player's turn:

### 4.1 Start of turn

- **If the player has no Active race** (game start, or the turn after going
  In Decline): he MUST pick a Race + Special Power combo (see 4.2).
- **Else**: he chooses to either go **In Decline** (see 4.7) — which is his
  entire turn except scoring — or proceed with conquests.
- Start-of-turn effects, in the active player's chosen order [A7]:
  - **Fountain of Youth**: if his troops occupy its region, he automatically
    receives 1 bonus race token of his active race from the tray (if any
    remain) [A8]. Applies only to an Active race [A9].
  - **Cultists**: may move the Great Ancient to any region his Cultists
    occupy.
  - **Reborn (In Decline)**: may empty 1 or 2 regions of his In-Decline
    Reborn race, replacing the tokens in each with exactly 1 Active-race
    token (from tray, else from hand). Requires an Active race [A10].
  - **Vengeful**: discounts from Vengeance markers handed out last turn
    apply during this turn's conquests; at end of this turn, markers return.

### 4.2 Picking a combo

- Choose any of the 6 visible combos. Combo at position `i` (0-based from
  top; position 5 = stack top) costs `i` coins: drop 1 coin on each combo
  above it. A player cannot pick a combo he cannot pay for.
- Collect any coins already sitting on the chosen combo (before paying [A11]).
- Receive race tokens = banner value + badge value into hand.
- **Shadow Mimes**: immediately after picking, may swap their badge with the
  badge of any of the other 5 visible combos (coins stay put). Token count is
  computed **after** the swap [A12].
- Slide combos up to fill the gap (coins ride along); reveal the next
  banner + badge from the stacks so 6 combos are visible again (when supply
  allows). If the badge stack is empty, reshuffle the badge discard pile into
  a new stack; if still none, combos may be banner-only [A13] (value counts as
  banner only).

### 4.3 Ready troops / abandoning

(Skipped on the turn a race first enters the map.)

- The player may abandon any number of regions entirely (all tokens to hand).
  Abandoning all regions means his next conquest follows First Conquest rules.
- Then all Active tokens except one per still-held region are automatically
  taken into hand [A14].
- Iron Dwarves: Silver Hammers collected at the end of last turn's
  redeployment are in hand and usable for conquest.

### 4.4 Conquest phase

Repeatable while the player has ≥ 1 Active race token in hand (Silver
Hammers alone do not satisfy this [A15]).

**Target legality.** A region can be targeted if all of:
- Not a chasm; not immune (Balrog / Great Ancient / Queen / Ghost — immunity
  blocks opponents only; a player may target a region made immune by his own
  piece only where the manual says so — in practice immune regions are his
  own, so conquering them is pointless but legal for own In-Decline regions
  is NOT allowed when protected by own Queen/Ghost/GA? Immunity says "cannot
  be conquered by an opponent"; own conquest remains legal [A16]).
- Not already occupied by the player's own Active race.
- Occupied by own In-Decline race is allowed.
- Adjacent to a region the player's Active race occupies, OR the player's
  race is entering the map (First Conquest: target must be an edge region —
  including river-end regions), OR extended adjacency applies:
  - Spiderines: all regions bordering any chasm are adjacent to them (and are
    legal First-Conquest entries).
  - Lizardmen: river regions act as passable connectors — a region adjacent
    to a river region is reachable if the player occupies (or can chain
    through) river regions [A17]: precisely, Lizardmen treat the connected
    component of river regions as transparent: any region bordering a river
    region is adjacent to any other region bordering a river region of the
    same connected river component — but a river region **occupied by
    another player (e.g. Kraken) blocks passage** until conquered.
  - Flames: any region adjacent to the Volcano, or connected to the Volcano
    through a chain of Flames-occupied regions, is attackable (at
    empty-region cost, see below). Flames' first conquest must be adjacent to
    the Volcano (placed when picked, on a volcano-symbol chasm).
  - Great Brass Pipe: for its controller, all regions of the Pipe's terrain
    are mutually adjacent.
  - Cultists' Great Ancient: regions adjacent to the GA's region are
    attackable (the GA's own region is one of theirs already).
  - Flying Doormat (or Bag as Doormat): once per turn, any region regardless
    of adjacency.
  - **Gnome shield**: a region occupied by Gnome tokens (Active or In
    Decline [A18]) can only be targeted through plain adjacency and plain
    cost — attacker's racial powers, special powers, and place/relic effects
    cannot be used on that conquest (no Doormat/Pipe/Spiderine/Flames-chain
    reach; no Ogre/Cultist/Vengeful/Sword/Socks discounts; no
    Vampire/Orb substitution; no Balrog). Mummies' +1 penalty still applies.
    Gnomes' own turn is unaffected.

**Cost.** Base 2, or 1 if the target is a river region [A19]. Add:
- +1 per Monster token in the region;
- +1 per race token in the region (any player, Active or In Decline);
- +1 per Black Mountain marker;
- +1 per Mushroom Armor;
- +1 if the Keep on the Motherland is there;
- +1 if the attacker is Mummies;
- −1 if the attacker is Ogres;
- −1 if the attacker is Cultists and the target is adjacent to the Great
  Ancient's region (in the attacker's effective adjacency [A20]);
- −1 if the attacker holds a Vengeance-marker grudge: the defender was given
  a Vengeance marker by this attacker's Vengeful power last turn (applies to
  that player's Active or In-Decline regions);
- −2 if the attacker uses the Sword of the Killer Rabbit this conquest
  (once per turn; relic then moves to the target region on success);
- Stinky Troll's Socks (once per turn): treat the region as empty — ignore
  Monster and race tokens (markers like Black Mountain / Armor / Keep still
  count [A21]).
- Flames: if the target is adjacent to the Volcano or linked to it through
  Flames-occupied regions, ignore Monster/race tokens/armor etc.? No — cost
  "as if the region was empty": ignore +1s from Monster tokens and race
  tokens and Mushroom Armors? The manual says "attacked at the same Flames
  token cost as if the region was empty". Ruling: ignore all occupant-derived
  additions (monsters, race tokens, armors) but keep static markers (Black
  Mountain, Keep) since those are part of the "empty" region [A22].
- Minimum cost is always 1.

Discount stacking: all applicable discounts stack, minimum 1 [A23].

**Paying.** The player must have `cost` tokens available in hand (Active race
tokens + Silver Hammers for Iron Dwarves). Exactly `cost` tokens are deployed
into the region; hammers are spent before dwarves but at least 1 real dwarf
token must be part of every conquest [A15].

**Effects of a successful conquest.**
1. Monster tokens there are removed from the game.
2. Defender (if any):
   - Single defending token → discarded to tray (In-Decline single tokens die
     this way). "Single" counts race tokens only.
   - Multiple tokens → defender takes all back in hand, permanently discards
     1 to the tray, and will redeploy the rest into his remaining regions at
     the end of the current player's turn (see 4.6). **Immortal**: no token
     is discarded. **In-Decline Tomb**: same keep-1-discard rule, and the
     excess redeploys at end of the attacker's turn into remaining Tomb
     regions; if none remain, all are lost.
   - Own In-Decline tokens conquered by yourself: same rules; they are your
     "earlier race" and simply get discarded (single) or lose 1 and redeploy
     into remaining regions of that In-Decline race [A24].
   - **Martyr** (defender, Active): +1 coin from bank per region conquered by
     an opponent.
   - **Liches (In Decline)**: attacker pays 1 coin to the Liches' owner when
     conquering an In-Decline Liches region. An attacker with 0 coins cannot
     conquer **any** region occupied by Liches tokens [A25].
   - Mushroom Armors in the region are discarded to the tray.
   - Defender's Queen/Ghost cannot be in a conquered region (immune);
     Great Ancient likewise.
3. If the region held Monster tokens at the moment of conquest: draw the top
   Place/Relic marker, place it in the region, and resolve its
   discovery effect immediately (Stonehedge draw, Wickedest Pentacle Balrog).
4. Black Mountain marker stays (defends the new occupant). Places stay.
   Relics stay and change ownership (except the Bag, which is the Magic
   player's and never captured).
5. Vampire / Shiny Orb substitution conquests place exactly 1 bonus token
   (from tray, else hand) instead of paying cost; usable once per turn per
   opponent (Vampire) / once per turn (Orb); target must contain exactly one
   race token, Active, of an opponent (never Gnomes; not immune regions; Orb
   per its own text mirrors the Vampire "single token" definition). The
   substituted token goes to the tray. These are conquests: Liches tax,
   Martyr, place/relic discovery [A26] and defender-elimination rules apply
   (single token → discarded — it IS discarded by substitution; Immortal
   token is lost too, per Vampire text).

**Will-o'-Wisps die.** Before any conquest of a Mystic Crystal region or a
region adjacent to a Mystic-Crystal region they occupy: declare the target,
roll the die (0,0,0,1,2,3), then if hand tokens ≥ cost − roll the conquest
MUST proceed, deploying max(1, cost − roll) tokens [A27]. If hand tokens are
insufficient even with the roll, the attempt fails and the turn's conquests
end (this counts as the final-conquest attempt) [A28].

**Final conquest / reinforcement die.** As his last conquest of the turn, a
player with ≥ 1 token in hand may declare a target he is short on by ≤ 3
tokens (cost − hand ∈ 1..3), roll the die once: if hand + roll ≥ cost, he
conquers, deploying **all** remaining hand tokens there; otherwise his
conquests end (tokens stay in hand for redeployment). Either way conquest
phase ends immediately.

**Flying Doormat "attempt fails"**: the Doormat moves only on success; a
failed final-conquest roll with Doormat leaves it where it was.

### 4.5 Redeployment

- Start: **Lizardmen / any race** — river regions the player occupies are
  force-emptied into hand (Kraken exempt).
- **Mudmen**: +1 token from tray per Mudpool region occupied (into hand,
  limited by tray).
- **Shield**: +1 Mushroom Armor from tray (max 8 in existence) per Mushroom
  Forest region occupied at end of conquest phase, into hand; deploy any
  number into occupied regions during redeployment.
- Redeployment is a FULL reorganization of every token on the board: the
  player "may freely redeploy the Race tokens he has on the board", each
  region keeping ≥ 1. The engine models this with two symmetric actions:
  `deploy` places hand tokens into an occupied region, `withdraw` lifts any
  token above a region's last one back into hand (bounded per turn purely
  for termination, [A64]) — so garrisons stay where the conquests put them
  and any legal final distribution is reachable. He may not abandon regions
  now [A29]; if he has tokens in hand but occupies no regions, tokens stay
  in hand (re-entry next turn as First Conquest).
- **Iron Dwarves**: at end of redeployment, take 1 Silver Hammer from the
  supply per Mine region occupied (max 7 total in existence), then all
  hammers on the map return to the player's hammer pool; every region must
  retain ≥ 1 real dwarf token (guaranteed by [A15]). Hammers are lost when
  the Dwarves go In Decline [A30].

### 4.6 End of turn

In order [A31]:
1. **End-of-turn placements** (each optional, active player's choice):
   - Royal (Active): place/move Queen to a region his Royal tokens occupy →
     immune.
   - Crypt of the Tomb-raider (controller, Active troops): place/move the
     Ghost to any region except the Crypt's → immune. (In-Decline occupant:
     Ghost frozen but immunity persists.)
   - Scepter of Avarice (controller, Active): place it in an occupied region
     (no effect in the Mine of the Lost Dwarf region).
   - Froggy's Ring (controller, Active): place it in an occupied region.
   - Altar of Souls (controller, Active or In Decline): discard 1 of his
     In-Decline tokens anywhere on the board → +3 coins this scoring.
   - Magic bag: any of the relic placements above can be made with the Bag
     duplicating that relic (not in a region where the real relic's power
     applies) [A32].
2. **Defender redeployments**: every player who lost multi-token regions
   this turn redeploys his in-hand survivors into regions his race still
   occupies (In-Decline Tomb redeploys into Tomb regions). If none, tokens
   go back in hand only for Active races (First-Conquest re-entry next
   turn); In-Decline survivors with no regions are lost to the tray [A33].
   Defenders act in seat order [A34].
3. **Scoring** (see §5).
4. Vengeful: take handed-out Vengeance markers back. If any opponent
   conquered this player's regions this turn and this player has Active
   Vengeful troops, that opponent receives a Vengeance marker (max 4) —
   actually markers are handed out during the attacker's turn in which the
   attack happened, and recovered at the end of the Vengeful player's own
   next turn [A35].
5. Turn passes; if the round is complete, advance the marker or end the game.

### 4.7 Going In Decline

Only if the player has an Active race; replaces his whole turn (no conquests,
no redeployment except Tomb):

1. If he already has an In-Decline race on the map, remove all its tokens to
   the tray immediately (its banner goes to the bottom of the banner stack /
   lowest empty column slot).
2. Flip the Active banner to its In-Decline side. Discard the badge to the
   badge discard pile, **unless** the power has In-Decline effects (Muddy,
   Reborn, Royal, Tomb, Wise — kept next to the banner and still in
   force; Vanishing is applied at this moment; all other badges are
   discarded) [A36].
3. Tokens: keep exactly 1 token (flipped) in each occupied region; the rest
   go to the tray. Exceptions:
   - **Tomb**: keep ALL tokens; may freely redeploy them among the occupied
     Tomb regions now (≥1 each; may not abandon [A37]).
   - **Vanishing**: remove ALL tokens from the map; score 2 coins per region
     they occupied instead of 1 (via scoring below).
4. Iron Dwarves' hammers return to the supply; Cultists' Great Ancient is
   removed from the board [A38]; Flames' Volcano stays (inert) [A39]; the
   Queen stays and keeps its region immune (frozen); Mushroom Armors stay
   (Shield persists In Decline); the Bag returns to the box (Magic has no
   In-Decline effect) [A40].
5. Scoring: 1 coin per region occupied by the newly declined race (2 if
   Vanishing, whose regions are now empty but still score), plus any benefits
   that explicitly work In Decline (Muddy, Wise +2, Kraken river regions
   count as occupied regions, Keep/Mine of the Lost Dwarf/Diamond
   Fields/Altar). No other race/power bonuses. Regions of the *older*
   removed race score nothing. End-of-turn placements for In-Decline-capable
   powers still occur (Altar; Crypt ghost is frozen) [A41].
6. Next turn he must pick a new combo.

Special case: a player whose race is wiped off the board entirely and whose
In-Decline race is also gone simply picks a new combo on his next turn (his
first conquest follows First Conquest rules). A player is never eliminated.

**Banner recycling**: when the last In-Decline token of a race leaves the map
(conquest, Reborn replacement, Altar discard, decline of the newer race), its
banner immediately returns to the bottom of the banner stack or the lowest
empty column slot [A42]. Badges of vanished races go to the badge discard.

## 5. Scoring (end of every turn)

The active player collects from the bank:
- +1 per region occupied by his Active race (river regions only if Kraken);
- +1 per region occupied by his In-Decline race (Kraken river regions
  included even In Decline);
- Race bonuses (Active only):
  - Drow: +1 per Drow region whose neighbors contain no other race's tokens,
    no other own race, and no Monsters (Places/markers don't matter).
  - Shrooms: +1 per Mushroom Forest region occupied.
- Power bonuses (Active only unless noted):
  - Adventurous: +1 per occupied region containing a Popular Place.
  - Fisher: +1 per complete pair of occupied Coastal regions (regions
    sharing a border with a river region; river regions excluded):
    floor(coastalCount / 2).
  - Flocking: +2 if ≥1 region and all occupied regions form one connected
    set (using the race's effective adjacency, e.g. Spiderines' chasm
    adjacency, Brass Pipe if controlled [A43]).
  - Frightened: +1 per occupied region holding ≥ 3 of his race tokens.
  - Mining: +1 per Mine region occupied.
  - Muddy: +1 per Mudpool region occupied — also while In Decline.
  - Mystic: +1 per Mystic Crystal region occupied.
  - Quarreling: +1 per connected group of occupied regions (effective
    adjacency [A43]).
  - Stone: +1 per Black Mountain region occupied.
  - Thieving: take 1 coin from each opponent [A44] who has ≥ 1 Active token
    in a region bordering any of the Thieves' regions (opponent pays only
    what he has).
  - Wise: +2 if the Wise race is In Decline and occupies ≥1 region
    (including the decline turn).
- Places/Relics (by current control of the region; "controller" = occupant):
  - Keep on the Motherland: +1 (works In Decline).
  - Mine of the Lost Dwarf: +2 (works In Decline; Scepter can't double it).
  - Diamond Fields: +1 for its region and +1 per other occupied same-terrain
    region occupied by the same race (works In Decline).
  - Altar of Souls: +3 if its option was exercised this turn (works In
    Decline).
  - Froggy's Ring (placed this turn, Active only): take 1 coin from each
    player with ≥1 Active token bordering the Ring's region (only what they
    have).
  - Scepter of Avarice (placed this turn, Active only): double the
    from-the-bank coins attributable to the Scepter's region: the region's
    base +1 and per-region bonuses tied to that specific region (terrain
    bonuses, Adventurous, Frightened, Stone, Keep, Diamond-Fields'
    contribution for that region, Shrooms, Drow, Kraken-river) — never coins
    taken from players, and set-based bonuses (Flocking, Quarreling, Fisher,
    Wise, Altar) are not per-region and are not doubled [A45].
- Balrog's region scores for nobody.
- Liches / Martyr / Vengeful marker handouts happen during conquests, not at
  scoring.

Coins never go negative. Payments between players are capped by what the
payer holds.

## 6. End of game and winner

After the last player's turn of the final round, all coin stacks are
revealed. Highest total wins. Tie-breaker: most race tokens on the board
(Active + In Decline; hammers/armors don't count). Still tied → shared
victory [A46].

## 7. Hidden information & randomness

Hidden from all players: the face-down Place/Relic stack order and contents;
the banner/badge stack order below the visible top combo.
Hidden from opponents: each player's coin total (a player always knows his
own). Everything else is public.

Randomness: initial shuffles (banners, badges, places/relics), Stonehedge
power draw, and Reinforcement-die rolls. All randomness flows through one
seeded PRNG in the game state; a game is a pure function of
(config, seed, action sequence).

Bots and the UI consume `getVisibleState(state, playerId)`, which masks the
hidden zones above.

## 8. Edge cases (explicit)

- **Supply exhaustion**: bonus-token grants (Mudmen, Fountain, Vampire/Orb
  substitution) are limited by tray + (where stated) hand; if neither has a
  token, the grant is skipped (Vampire/Orb conquest then impossible).
  Armors capped at 8, hammers at 7, vengeance markers at 4 (a 5th handout is
  impossible — with ≤4 opponents it never comes up).
- **Badge stack empty**: reshuffle discards; if still empty, banner-only
  combos [A13].
- **Banner stack empty**: fewer than 6 visible combos is legal; players pick
  among what exists (at most 5 players hold ≤ 10 banners, 15 exist, so ≥ 1
  combo is always available).
- **Place/Relic stack empty**: conquering a monster region yields no marker
  (cannot happen: markers drawn = monster regions) — asserted, not handled.
- **No legal conquest targets**: the conquest phase can always be ended
  (`endConquest` is always legal); a turn can always be completed. A player
  with no active race and no affordable combo: the top combo (slot 0) is
  always free, so picking is always possible.
- **0-coin players**: can still pick the free combo; cannot conquer
  Liches-occupied regions; pay nothing to Thieving/Froggy's Ring.
- **Deadlock freedom**: every phase always has ≥1 legal action (proven by
  self-play).
