Yes, this structure supports an auto-generated, in-world-voice atlas very cleanly. You’re basically one layer of aggregation away from a wiki.

Here’s how I’d wire it.

1. Treat each WorldEntity as a “wiki page root”

You already have:

HardState (minimal canon facts)

LoreFragments (narrative vignettes)

WorldEvents (indexed narrative moments)

Define an atlas page model that sits on top:

type AtlasPage = {
entityId: string;
title: string;              // from HardState.name or a lore title
kind: "location" | "faction" | "npc" | "law" | "conflict";

// Generated content, in-world narrative voice:
body: string;

// Structurally meaningful sections, not just a blob:
sections: AtlasSection[];

// Graph context for navigation:
outboundLinks: AtlasLink[]; // links from this entity to others
inboundLinks: AtlasLink[];  // backrefs from others -> this entity

// Provenance:
sourceLoreIds: string[];    // LoreFragments used to generate
sourceEventIds: string[];   // WorldEvents used
generatedAt: number;
version: number;
};

type AtlasSection = {
id: string;
heading: string;
content: string;          // narrative text
};

type AtlasLink = {
targetEntityId: string;
relationship: string;     // "controls", "neighboring", "sworn_enemy", etc.
viaEdgeId?: string;       // underlying graph edge if you want it
};


This is not new data; it’s a materialized view of the graph + lore + events.

2. Generating a page from your existing structure

To build an AtlasPage for entity X:

Fetch structural context:

HardState for X.

Graph edges where X is source or target.

WorldEvents where targetId === X (and optionally where X is secondary).

Fetch narrative material:

All LoreFragments attached to X.

Optionally, nearby entities’ fragments if you want “reputation” from others’ POV.

Prompt an LLM to synthesize:

Input:

Minimal hard facts (“do not contradict these”).

A curated set of lore snippets and event summaries.

Graph edges: neighbors + relationship labels.

Desired sections schema.

Output:

body (fallback full article).

Structured sections:

e.g. for a location:

Overview

History

Notable Figures

Factions and Power

Recent Events in the Chronicles

Local Rumors

for a faction:

Origins

Structure & Doctrine

Territories & Holdings

Allies & Enemies

Deeds in Recent Chronicles

The voice: “Write as if from an in-world historian, chronicler, or gossip, not as a meta-author.”

Derive outboundLinks from:

Graph edges (HardState.links + your global graph).

Entity mentions in the assembled lore/events (LLM can extract “linked entities” and attach relationship labels).

Derive inboundLinks (backrefs) from the graph:

For entity X, inbound edges are just:

All graph edges where targetId === X.

You can also treat “appears in lore for entity Y” as a soft inbound link:

e.g. LoreFragment.entityId = Y but mentions X → inbound link from Y to X.

This gives you standard wiki behaviour:

“See also” / “Related places” = outbound.

“Mentioned in these other pages” = inbound.

3. Keeping it narrative-first and minimal-attribute

Notice what the atlas actually relies on:

HardState:

name, status, type, maybe 1–2 enums.

Graph edges:

who is related to whom, and how.

LoreFragments + WorldEvents:

the actual text you’re summarizing.

You’re not adding new permanent attribute bloat; you’re repackaging existing narrative into a more reader-friendly, wiki-style shape.

If you want to be strict:

HardState: never expand beyond a tiny set of enums and identifiers.

All rich description lives in:

LoreFragments (atomic narrative beats).

AtlasPage/sections (generated syntheses, can be rebuilt).

4. Atlas as a materialized / cached view, not ground truth

Important pattern:

AtlasPage is derived, not canonical.

Ground truth = HardState + Graph + WorldEvents + LoreFragments.

So:

You can regenerate pages periodically, or on-demand when:

New world events attached to the entity.

Enough new lore fragments exist.

Old versions of pages can be stored as snapshots for fun (“how scholars wrote about Auric Causeway in Y.238 vs Y.242”).

Because of this, atlas generation can be:

Completely read-only from the world’s standpoint.

Safe to iterate on prompts and section design without breaking canon.

5. Using graph edges as backrefs cleanly

Your existing graph naturally supports backrefs:

A graph edge store (even if it’s just arrays in JSON) gives you:

For each entity:

outgoingEdges: Edge[]

incomingEdges: Edge[]

You simply project them into wiki links:

type Edge = {
id: string;
from: string;
to: string;
kind: "adjacent" | "controls" | "member_of" | "enemy_of" | "located_in" | ...;
};

function edgeToAtlasLink(edge: Edge, currentEntityId: string): AtlasLink {
const targetEntityId = edge.from === currentEntityId ? edge.to : edge.from;
return {
targetEntityId,
relationship: edge.kind,
viaEdgeId: edge.id,
};
}


Outbound: edges where from === currentEntityId.

Inbound: edges where to === currentEntityId.

UI can show:

“Neighbouring Districts”

“Ruling Factions”

“Known Enemies”

“Places Mentioned in Stories About This One”

All using the same underlying graph structure you already planned for world state.

6. Controlling the in-world narrative voice

You can standardize tone per domain:

Locations → “Gazetteer” style, written by a city chronicler.

Factions → “Intelligence dossier” written by a spy or historian.

NPCs → “Profile” written as rumor/legend, but constrained by HardState.

Laws → “Codex excerpts” with commentary (“Scholar’s Notes”).

This is just prompt scaffolding around the same AtlasPage generator.

And because the source material is diegetic (LoreFragments, events), the atlas naturally feels like “living fiction compiled into a book”, not system docs.

7. Summary

Your current structure:

HardState + Graph edges → enforce minimal consistency and relationships.

LoreFragments + WorldEvents → rich, player/GM generated narrative.

On top of that, an AtlasPage layer:

Aggregates narrative.

Uses graph edges as links and backrefs.

Writes in in-world voice.

Is fully regenerable and not canonical state.

So yes: this structure supports an auto-generated, wiki-style world atlas extremely cleanly, without bloating your core state model or shifting focus away from “living story” as the real substance of the world.