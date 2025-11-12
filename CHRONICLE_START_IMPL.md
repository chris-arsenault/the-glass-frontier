# Chronicle Start — Implementation Guide

> Scope: Replace free‑text start with guided flow. Use existing APIs and stores. No new telemetry, security, or versioning. No error/edge‑case handling in this CR.

## 1) High‑Level Flow

**Entry points**

* **New Chronicle** button → Start wizard
* **Data Shard (kind=chronicle_hook)** card/menu → "Start Chronicle with this Shard"

**Wizard steps**

1. **Location**: pick existing **or** create child **or** create multi‑level chain
2. **Tone**: select chips and/or enter free text
3. **Seeds**: render 3 seeds, allow regenerate or write custom
4. **Create**: invoke existing Chronicle creation with selected `locationId` and `seed_text`

**One‑click Shard**

* If shard includes `locationId` and `seed_text` → call existing Chronicle create and route to chronicle view
* If shard includes location stack by names/types → auto‑create chain then create chronicle
* If multiple matches → open Wizard at **Location** with pre‑filled candidates (no additional scope beyond selection)

## 2) UI Architecture

### 2.1 Routes and Feature Flag

* Route: `/chronicles/start` (wizard)
* Route: `/chronicles/start?shard=<id>` (preload shard)
* Feature flag: `features.chronicleStartWizard` guarding new entry points; keep legacy free‑text hidden but callable for rollback

### 2.2 Page Shell

* **Header**: stepper [Location ▸ Tone ▸ Seeds ▸ Create]
* **Body**: step content
* **Footer**: primary action, secondary back, minimal helper text

### 2.3 Step 1 — Location Picker

**Layout**

* Left: **Graph Map** pane
* Right: **Inspector** pane with:

  * Breadcrumb lineage (root → … → selected)
  * Node card: name, type, tags, short summary, children list
  * Actions:

    * **Select Location**
    * **Add Sub‑location** (modal)
    * **New Multi‑Level** (drawer)

**Graph Map**

* Force‑directed graph with pan/zoom
* Search bar with typeahead; hitting Enter focuses node in graph and inspector
* Hover: mini card; Click: select node
* Keyboard fallback: list view toggle in inspector

**Add Sub‑location Modal**

* Fields: *Name* (required), *Type* (select), *Tags* (token), *Summary* (optional)
* Parent: implicit = currently selected node; on save, refresh inspector selection to new child

**New Multi‑Level Drawer**

* Repeater rows: `{ name, type, tags? }`
* Add/remove rows; top row becomes highest parent; final row becomes selected start node

**Next** is enabled when `selectedLocationId` present

### 2.4 Step 2 — Tone Control

* Chips: `gritty`, `hopeful`, `mysterious`, `urgent`, `whimsical`, `somber`, `wry`, `epic`
* Free‑text input: optional notes; helper "short phrase, 3–10 words"
* Persist to transient wizard state: `{ toneChips: string[], toneNotes: string }`

### 2.5 Step 3 — Seed Selection

* Call narrative engine to fetch 3 seeds using `{ locationId, toneChips, toneNotes }`
* Render 3 **Seed Cards**:

  * Title
  * 1–2 sentence teaser
  * Tags (small)
  * Actions: **Choose**
* Toolbar: **Regenerate 3**, **Write my own** (textarea reveals inline, with title input optional)
* Selecting a seed sets `chosenSeed = { title, teaser }` or `customSeedText`

### 2.6 Step 4 — Create

* Summary panel: Location breadcrumb, Tone preview, Selected Seed preview
* Primary action: **Create Chronicle**
* Invoke existing creation flow with:

  * `locationId: selectedLocationId`
  * `seed_text: chosenSeed.teaser || customSeedText`
  * `title: chosenSeed.title || userTitle || auto from first 6–8 words`
* On success: route to chronicle view

## 3) State Machine (Wizard)

```
IDLE
  → LOCATION_SELECTED
LOCATION_SELECTED
  → TONE_READY when tone set (chips or notes optional, proceed allowed regardless)
TONE_READY
  → SEEDS_REQUESTED on "Generate Seeds"
SEEDS_REQUESTED
  → SEEDS_READY when 3 seeds present
SEEDS_READY
  → SEED_CHOSEN on pick
  → CUSTOM_SEED on "Write my own"
CUSTOM_SEED
  → READY_TO_CREATE when textarea non‑empty
SEED_CHOSEN | READY_TO_CREATE
  → CREATING on Create
CREATING
  → DONE → route to chronicle view
```

## 4) Client State Shape (UI‑only)

```ts
// Local store (Zustand/React Context) — not persisted
interface ChronicleStartState {
  selectedLocationId: string | null
  locationBreadcrumb: { id: string; name: string; type: string }[]
  toneChips: string[]
  toneNotes: string
  seeds: { id: string; title: string; teaser: string; tags?: string[] }[]
  chosenSeedId: string | null
  customSeedText: string
  customSeedTitle: string
  ui: {
    step: 'location' | 'tone' | 'seeds' | 'create'
    listViewFallback: boolean
  }
}
```

## 5) Data Flow and Integration Points

* **Location queries**: use existing location store search, fetch node by id, fetch children, fetch lineage, create child, and create chain endpoints already in system
* **Seed generation**: use existing narrative engine call that accepts context; include `{ locationId, toneChips, toneNotes }`
* **Chronicle create**: call existing creation flow with `locationId` and `seed_text`; title optional
* **Shard entry**: resolve shard using existing data‑shard access; when possible call direct create path; otherwise open wizard with preselected candidates

## 6) Components Breakdown

* `ChronicleStartWizard` (route shell, stepper, footer)
* `LocationPicker` (graph + inspector)

  * `GraphMap` (force layout, zoom/pan, search)
  * `LocationInspector` (breadcrumb, node card, children list)
  * `AddSubLocationModal`
  * `MultiLevelCreatorDrawer`
* `ToneSelector` (chips + notes)
* `SeedSelector` (cards, regenerate, custom editor)
* `CreateSummary` (read‑only preview + Create button)

## 7) Graph Map Implementation Notes

* Use existing graph projection utilities if present; otherwise compute force layout on client with stable node ids to reduce jitter
* Keep node sizes uniform; use type‑based glyphs or badges
* Keep max edges rendered to avoid overdraw; children list in inspector handles deep trees
* Maintain selection via `selectedLocationId` with scroll/zoom to fit on selection

## 8) Accessibility

* List view toggle ensures full keyboard navigation without canvas interaction
* All primary actions are buttons with proper labels and focus order matching the stepper
* Seed cards expose title and teaser to screen readers; "Choose seed <title>" label on buttons

## 9) UX Copy (short, neutral)

* Step headers: "Choose a starting location", "Set tone (optional)", "Pick a story seed", "Create chronicle"
* Seed helper: "Seeds are concise prompts to kick off play. You can pick one or write your own."
* Tone helper: "Select tone tags or add a short note."

## 10) Acceptance Criteria

1. Wizard replaces free‑text start when `features.chronicleStartWizard=true`
2. Location can be selected from graph or list; sub‑location creation works and is immediately selectable
3. Multi‑level chain create selects the deepest node
4. Tone chips and notes are captured and sent to seed generation
5. Three seeds render; user can pick one, regenerate, or write their own
6. Chronicle is created only after seed choice or custom text
7. One‑click shard start creates chronicle when shard has both `locationId` and `seed_text`
8. Shard with location stack auto‑creates missing nodes and then creates chronicle
9. Shard with ambiguous location opens wizard at Location step pre‑populated
10. Routing to the new chronicle view occurs after creation

## 11) Minimal Dev Tasks Checklist

* [ ] Add feature flag and routes
* [ ] Build `ChronicleStartWizard` shell with stepper
* [ ] Integrate `LocationPicker` with existing location store
* [ ] Implement Sub‑location modal using existing create‑child
* [ ] Implement Multi‑level creator using existing chain create
* [ ] Add `ToneSelector` with chips and free‑text
* [ ] Wire seed generation call and render `SeedSelector`
* [ ] Add custom seed editor path
* [ ] Implement Create step that calls existing chronicle create
* [ ] Add shard entry handler with direct‑create and wizard fall‑through
* [ ] Smoke tests: location select, sub‑create, chain create, seeds, custom seed, create, shard direct, shard via wizard

---

This guide keeps within scope: reuse existing stores and APIs, no subsystem changes beyond the start flow, and no error/edge‑case handling in this CR.
