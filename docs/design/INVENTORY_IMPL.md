GLASS FRONTIER — INVENTORY SYSTEM SPEC (for Codex implementation)
1. Core Categories
Category	Purpose	Rules
Gear	Equippable technology, armor, weapons, and tools.	One per slot: outfit, headgear, armament, module.
Relic	Persistent narrative influence; ancient or alien tech.	Can have unknown_usage tag.
Imbued Item	Item with defined mechanical modifiers.	Pulled from central registry.
Data-Shard	Narrative payloads. Subtypes:
• chronicle_active – used to unlock terminals, doors, or events.
• chronicle_hook – used to seed a new chronicle.	Consumed when activated.
Consumable	Single-use chemical, gadget, or supply.	Decrements on use.
Supplies	General items, salvage, or materials.	No explicit mechanics.
2. Inventory Data Model
type Slot = "outfit" | "headgear" | "armament" | "module";

interface GearItem {
  id: string;
  name: string;
  slug: string;
  slot: Slot;
}

interface Relic {
  id: string;
  name: string;
  slug: string;
  hook: string;
  unknown_usage?: boolean;
}

interface ImbuedItem {
  id: string;
  name: string;
  slug: string;
  registry_key: string; // lookup from IMBUED_REGISTRY
}

type DataShard =
  | { kind: "chronicle_active"; id: string; name: string; slug: string; purpose: string }
  | { kind: "chronicle_hook"; id: string; name: string; slug: string; seed: string };

interface Consumable {
  id: string;
  name: string;
  slug: string;
  count: number;
}

interface SuppliesItem {
  id: string;
  name: string;
  slug: string;
}

interface Inventory {
  revision: number;
  gear: Partial<Record<Slot, GearItem>>;
  relics: Relic[];
  imbued_items: ImbuedItem[];
  data_shards: DataShard[];
  consumables: Consumable[];
  supplies: SuppliesItem[];
}


Registry example

export const IMBUED_REGISTRY = {
  "neural-filament-band": { attribute: "focus", bonus: 1 },
  "kinetic-damping-frame": { attribute: "resolve", bonus: 2 },
};

3. Deterministic Delta Model
type DeltaOp =
  | { op: "equip"; slot: Slot; itemId: string }
  | { op: "unequip"; slot: Slot }
  | { op: "add"; bucket: keyof Inventory; item: any }
  | { op: "remove"; bucket: keyof Inventory; itemId: string }
  | { op: "consume"; itemId: string; amount: number }
  | { op: "spend_shard"; itemId: string }
  | { op: "transform"; fromId: string; to: any };

interface InventoryDelta {
  ops: DeltaOp[];
  prevRevision: number;
  nextRevision: number;
}


Conflict rule: reject if prevRevision ≠ current inventory revision.

4. UI Integration

The UI can equip/unequip Gear independently of narration.

These changes are queued as pendingEquip entries and not applied immediately.

On the next narrative turn, include the pendingEquip array in the outgoing payload:

type PendingEquip = { slot: Slot; itemId: string } | { slot: Slot; unequip: true };


The equip delta is then applied by the Inventory LLM in sequence with other changes.

5. Narrative Flow
Player Intent
    ↓
GM LLM (Narration)
  - Uses current inventory context
  - No mutations
    ↓
Inventory LLM (Arbiter)
  - Receives prev inventory, intent summary, GM narration, and pending equips
  - Produces deterministic InventoryDelta
    ↓
Server Validation & Commit
  - Apply delta atomically
  - Increment inventory.revision
  - Return narration + delta + new inventory

6. Prompt Roles

GM Narration Prompt

Input: intent summary, scene state, inventory snapshot.

Instruction: “Describe inventory only; do not modify, equip, or remove items.”

Inventory Arbiter Prompt

Input: previous inventory JSON, intent summary, GM narration, pending equip queue, registry, context flags.

Instruction:

Apply pending equips first.

Mutate deterministically.

Only spend chronicle_active shards if used to unlock or resolve an event.

Only spend chronicle_hook shards if a new chronicle begins.

Return empty ops if uncertain.

Output schema

{
  "ops": [
    { "op": "equip", "slot": "module", "itemId": "..." },
    { "op": "spend_shard", "itemId": "..." }
  ],
  "prevRevision": 12,
  "nextRevision": 13
}

7. Server Endpoints

POST /narrate — body: { intent, pendingEquip?, characterId }

Runs GM LLM → Inventory LLM

Returns { narration, delta, newInventory }

Optional: POST /equip — queues pending equip client-side.

8. Data-Shard Rules
Subtype	Trigger	Result
chronicle_active	Used in narration to unlock, bypass, or activate a system.	spend_shard op deletes it.
chronicle_hook	Used to start a new chronicle.	spend_shard op deletes it.
9. Supplies Rules

Non-mechanical items.

GM LLM interprets usage contextually.

Can be upgraded or transformed into Gear, Relic, or Imbued Item through a transform delta.

This spec defines all data types, LLM orchestration order, deterministic update logic, and UI integration points needed for implementation within The Glass Frontier engine.