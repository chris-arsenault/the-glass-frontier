# Items and signature moves

Plan for making equipment matter during play and adding signature moves as a
real system, not a creation-time flourish.

## Where the code is today

**Items exist but cannot affect anything.** `InventoryEntry` carries
`{id, name, kind, description, effect?, quantity}` across four kinds — `gear`,
`relic`, `consumable`, `supplies`. Items are written in exactly one place: the
`inventory-delta` LLM node runs after narration and its ops are applied by
`apps/gm-api/src/updaters/inventoryUpdater.ts`. They are read in two places: the
`inventory-detail` fragment, which reaches six narration templates, and the
character drawer.

The gap is at `templateFragmentMapping` in
`apps/gm-api/src/prompts/chronicleFragments.ts`. `check-planner` receives
`recent-events`, `intent`, `character`, `location` — no inventory. The planner
decides `advantage` and `riskLevel`, so as the wiring stands an item can be
described in prose and can never change a roll. Characters also start with an
empty pack: `buildCharacter` in `apps/chronicle-api/src/router.ts` sets
`inventory: []`.

**Signature moves do not exist.** No DTO, no column, no prompt fragment.

**The closer already reads inventory.** `summaryHelpers.ts` feeds
`inventoryHighlights` into both the chronicle-story and the character-bio
prompt.

## What agents-of-glass does

Refreshed from `templates/how-to/skills-and-signature-moves.md`,
`templates/how-to/useful-inventory.md`, and `src/cli/commands/character.py`.

- A signature move has a fixed four-part shape: **name, look, usual use,
  tell/cost** (`_signature_move_body`). That shape is what lets a narrator use a
  move consistently without re-inventing it every scene.
- Slots grow with level: 1 at level 1, one more at 3, 5, 7 and 9
  (`_signature_move_slots`). Adding past the cap is a hard error.
- Starting inventory is exactly 3 items, one of which must be usable when
  violence starts, marked with an effect tag beginning `weapon:`.
- **Neither items nor moves touch the dice.** `glass roll` takes skill,
  attribute and risk, and nothing else. Effect tags are affordance labels the
  DM reads; the move is a thing the fiction can do, not a modifier.

That last point is the design lesson worth taking. The value of both systems is
that the narrator has specific, stable material to reach for. Building a
modifier engine on top would be the gold plating.

Glass Frontier has no character levels, so the slot ladder does not port. Skill
tiers and momentum are the progression axes.

## Design

### Signature moves

```ts
SignatureMove = { id, name, look, use, cost }   // four short strings
Character.signatureMoves: SignatureMove[]        // 0-3
```

Same four fields agents-of-glass settled on. Stored on the character, mirrored
to a `signature_moves jsonb` column, carried by `formatCharacter` so every
template that already requests the `character` fragment gets them.

Authored at creation (an optional step, like Nature) and edited from the
character sheet between chronicles. Never authored during a chronicle — play
stays free text.

### The single mechanical hook

`check-planner` already emits `advantage`, and `CheckRunnerNode.ts:34` turns it
into a die flag. That is the whole hook, and it is enough.

1. Add `signature-moves` and `inventory-detail` to `check-planner`'s fragment
   list.
2. Extend `SkillCheckPlan` with `invoked: { kind: 'move' | 'item', id, why } | null`.
3. Instruct the planner: when the player's message describes using a declared
   move or a carried item, name it in `invoked` and set `advantage` accordingly.

The player types prose. The planner recognises what they reached for. The roll
gets advantage, the badge shows which move or item did it, and the turn record
keeps it. No new dice maths, no new resource, no UI affordance during play.

This costs a larger prompt on a node that runs every turn. `check-planner` runs
on the classification model, so watch the token delta after phase 2 — the
lighter `inventory` fragment (name, kind, quantity) is the fallback if
`inventory-detail` proves too heavy, at the cost of the planner not seeing
`effect`.

### Items

Two changes, both small.

**Consumables deplete deterministically.** If a check invoked an item of kind
`consumable`, `inventoryUpdater` decrements it by one and drops it at zero. This
belongs in the updater rather than the delta LLM: it is a rule, not a judgement.

**Characters start with a kit.** Each archetype preset carries three fixed
starting items, one of them usable when a scene turns violent — the
agents-of-glass rule, ported as curated data rather than as validation. The
player picks a preset and gets the kit; no free-text item authoring at creation,
so there is nothing to validate. Items gained in play keep coming from the
delta node, which is where free text belongs.

## Phases

| # | Work | Depends on | Size |
|---|---|---|---|
| 1 | `SignatureMove` DTO, `Character.signatureMoves`, migration 005, `formatCharacter`, creation step, sheet display | — | M |
| 2 | Fragments to `check-planner`, `SkillCheckPlan.invoked`, planner prompt, badge, turn record | 1 | M |
| 3 | Consumable depletion in `inventoryUpdater` | 2 | S |
| 4 | Starting kits on the archetype presets | — | S |
| 5 | Signature moves into the closure prompts | 1 | S |

Phases 1 and 4 are independent and can land in either order. Phase 2 is where
the system starts paying off; phases 1 and 4 on their own only give the narrator
better material, which is worth something but is not the point.

## Deliberately not doing

- No per-move cooldowns, uses-per-scene, charges, or resource pools.
- No numeric modifiers, damage values, armour ratings, or item tiers. Advantage
  is the only mechanical output.
- No slot ladder tied to level. Glass Frontier has no levels; the cap is 3.
- No equip/unequip, encumbrance, durability, repair, or crafting.
- No "use item" or "activate move" control in the chat UI. Play stays free text;
  the sheet is read-only during a chronicle.
- No separate move-resolution node. The existing check pipeline covers it.

## Open decisions

1. **How move slots 2 and 3 open.** Free to author at any time outside an
   active chronicle is the cheapest and hardest to get wrong. The alternative —
   granted at chronicle close when the closer judges a move was central — is a
   nicer progression beat and a whole earning mechanic. Recommend free; revisit
   if moves end up feeling weightless.
2. **Whether `effect` becomes required on `InventoryEntry`.** It is the line the
   planner and narrator read to judge what an item can do. Requiring it makes
   the delta node's job stricter and the sheet more useful. Recommend yes.
3. **Whether the closer promotes a play-earned relic into canon.** The closure
   pipeline already writes play-born entities as canon `artifact` rows, so a
   named relic is a natural candidate. Genuinely optional and easy to add later.
