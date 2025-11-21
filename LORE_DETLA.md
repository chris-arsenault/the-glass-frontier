The trick is to make the deltas primarily drive new narrative, not just tweak attributes, and to treat attributes as guardrails for that narrative.

Here’s a concrete way to do it.

1. Split “hard state” from “lore state”

For every world domain object (location, faction, NPC, law, conflict), keep two layers:

type HardState = {
id: string;
kind: "location" | "faction" | "npc" | "law" | "conflict";
name: string;
// minimal consistency fields only:
status?: "active" | "destroyed" | "missing" | "dissolved";
alignment?: "ally" | "enemy" | "neutral";
// relational graph:
links: string[]; // ids of related entities
// maybe 1–2 domain enums, nothing more
};

type LoreFragment = {
id: string;
entityId: string;
source: {
chronicleId: string;
beatId?: string;
turnRange?: [number, number];
};
title: string;
prose: string;        // the actual “living story”
tags: string[];       // motifs, themes, era, etc.
timestamp: number;
};


World state is then:

type WorldEntity = {
hard: HardState;
lore: LoreFragmentRef[]; // just IDs or pointers
};


The stories are the LoreFragments; the attributes are just coarse guardrails.

2. Make world deltas narrative-first

Instead of deltas only saying “faction.rep += 5”, have them explicitly point to narrative updates:

type WorldDelta = {
entityId: string;
hardStatePatch?: Partial<HardState>;
lore?: {
createFragments?: {
title: string;
// short “seed” or bullet list, not final prose
narrativeSeed: string;
toneHints?: string[];
tags?: string[];
}[];
};
};


Pipeline when applying a delta:

Apply hardStatePatch (if present).

For each createFragments entry:

Call an LLM to turn narrativeSeed + context into a short lore vignette (prose).

Store it as a LoreFragment attached to the entity.

You’ve now made “updating the world” primarily “creating or extending narrative documents”, with the hard state just tracking things like “this NPC is dead” so the GM doesn’t resurrect them by accident.

3. Treat the epilogue as a lore generator, not a state oracle

You can keep the epilogue handler, but reframe what it does:

On chronicle close:

Generate the short story epilogue (for the player).

Separately, generate a structured outcome (as in the previous message) that identifies:

Which entities were meaningfully affected.

What kind of narrative beats happened to them (rise, fall, betrayal, discovery, etc.).

From that structured outcome, create WorldDeltas with narrativeSeeds:

Example for a faction:

{
entityId: "faction:glass-wardens",
hardStatePatch: { status: "active" }, // maybe unchanged
lore: {
createFragments: [
{
title: "The Night the Wardens Took the Wall",
narrativeSeed: "Describe how the Glass Wardens’ surprise assault on the Prism Walk gate overturned a months-long stalemate. Focus on how locals now tell the story.",
tags: ["battle", "turning_point", "urban_legend"]
}
]
}
}


The epilogue itself never has to be the world’s “source of truth”. It’s just one story. The world updater uses it as input to generate lore fragments that become part of canon.

4. Narrative retrieval as the primary “state”

When the GM writes new prose, don’t feed it a big attribute blob. Instead:

Given the current scene (location, NPCs, factions, conflicts in play), fetch:

The relevant HardState (tiny).

The top N LoreFragments per entity by semantic search and recency.

Prompt the GM model with:

“Here is the bare factual canon (do not contradict these).”

“Here are some excerpts from prior stories about these entities—draw on them for tone, continuity, and callbacks.”

That makes the narrative corpus the real “living world,” while HardState just enforces consistency:

Don’t contradict alive/dead.

Don’t contradict allegiance.

Don’t contradict major world facts (city destroyed, law repealed, etc.).

5. Use events as narrative indexes, not attribute edits

Instead of thinking of WorldEvent as “faction reputation changed”, think of it as a narrative index:

type WorldEvent = {
id: string;
domain: "faction" | "npc" | "location" | "law" | "conflict";
targetId: string;
kind: "battle" | "treaty" | "betrayal" | "discovery" | "law_passed" | ...;
summary: string;              // 1–2 sentence narrative
loreFragmentIds: string[];    // points to the actual prose
hardImplications?: HardStatePatch;
sourceChronicleId: string;
timestamp: number;
};


Queries like “what’s going on with House Meridian?” are answered by:

Fetching WorldEvents targeting that faction.

Pulling their associated LoreFragments.

Optionally summarizing them on the fly for UI or short GM context.

So the primary world update is: “we add new events and associated prose.” Hard attributes are derived as needed.

6. Minimal hard-state rule of thumb

If you want “just enough to enforce consistency,” a practical checklist:

Per entity, ask:

If this changed, would contradicting it later feel like a lore bug rather than a twist?

If yes → store it in HardState (enum/boolean/id).

If it can be retconned in the fiction (“rumors were wrong,” “history was misrecorded”), keep it as narrative only (in LoreFragments), not HardState.

Never store detailed personality, appearance, or backstory in HardState—those are purely narrative and live in lore.

For example, for an NPC:

HardState:

alive/dead/missing

current affiliation

current known location

Everything else (motives, scars, relationships, famous deeds) = LoreFragments + WorldEvents.

7. How this plugs into your existing pipeline

Given what you already have:

Turn system with mechanical deltas.

Beats.

Chronicle epilogue handler.

You can wire it like this:

Per turn:

Mechanical deltas for character/inventory/location (unchanged).

Optional small WorldDelta candidates with narrativeSeeds (for world-facing beats only).

On beat close or chronicle close:

Consolidate candidate WorldDeltas.

Generate WorldEvents + LoreFragments for the impacted entities.

Apply minimal HardState patches.

On future turns:

GM prompt pulls HardState + relevant LoreFragments/WorldEvents as context.

The story the GM and player write extends those lore streams.

Net effect: the “real” world is the evolving corpus of short stories and vignettes attached to entities and events. The database just knows enough to keep you from contradicting yourself and to help the GM find the right bits of story to build on.