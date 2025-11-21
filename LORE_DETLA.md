The trick is to make the deltas primarily drive new narrative, not just tweak attributes, and to treat attributes as guardrails for that narrative.

Here’s a concrete way to do it.

1. Split “hard state” from “lore state”

For every world domain object (location, faction, NPC, law, conflict), keep two layers:

type HardState = {
id: string;
kind: enum;
name: string;
description: string; //1-2 sentance overview
// minimal consistency fields only:
status?: enum;
// relational graph:
links: edge[]; // edge of relationships
// maybe 1–2 domain enums, nothing more
};

type LoreFragment = {
id: string;
entityId: string;
source?: {
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
