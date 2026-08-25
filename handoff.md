# GM Prose Retrieval Handoff

## Problem

The GM API primarily uses one-shot model calls. That remains appropriate for classification and other bounded judgments, but GM prose generation must choose what world and chronicle information it needs before the model sees the turn.

The current prose context is assembled from a predicted entity set, selected entity details and lore, and a fixed recent-history window. Anything omitted during that assembly cannot influence the narration. This creates several related problems:

- An entity outside the predicted set cannot be discovered during prose generation.
- The GM cannot follow a relevant relationship to another entity when the turn makes that relationship important.
- Entity lore and descriptive identity contain multiple independent facets, such as appearance, behavior, access, hazards, methods, and disposition. Code assembling the prompt cannot reliably know which facet the prose model will need.
- Relationships now have their own descriptive material, such as terms, basis, conduct, dependence, and cost. Relevance belongs to the specific situation, not merely to whether both endpoint entities were selected in advance.
- Events outside the normal recent-turn window are unavailable even when the player refers to them or current continuity depends on them.
- Supplying all potentially relevant material up front would increase context size and noise without solving entity discovery.

## New retrieval substrate

The uncommitted work substantially expands the canon available to a GM:

- 237 entities now have descriptive identity material, up from 74.
- 109 relationships now have descriptive identity material, up from 2.
- Entity identities contain 795 fields across 30 field names.
- Relationship identities contain 199 fields across 14 field names.
- Worldstate now has a batched read model for live relationships among a selected entity set.

This material is structured enough to retrieve at the level of an individual entity field, relationship field, or lore fragment. The central question is how the prose model can selectively discover and read it without receiving the whole corpus.

## Desired scope

Design an agentic subsystem specifically for GM prose turns and integrate it cleanly into the existing GM pipeline.

The surrounding pipeline represents substantial existing behavior that should remain in scope and be preserved unless the prose-retrieval design makes a particular entity-specific component redundant. This includes intent classification, scene-subject handling, check planning and resolution, inventory processing, beat tracking, scene transitions, scene-ledger updates, location updates, chronicle closure, and turn persistence.

The design should be broader than adding tools inside the current prose node. It must cover the complete prose-retrieval boundary:

- How world material is indexed and addressed.
- How full chronicle history is searched and read.
- Which retrieval operations the prose model controls.
- What compact information the prose model receives before retrieval.
- How retrieval rounds, context size, visibility, and cost are bounded.
- What the prose subsystem returns to the existing downstream pipeline.
- Which current entity-selection, reference-resolution, roster, usage, and focus responsibilities remain necessary once the prose model can discover entities itself.
- How provider support, telemetry, replay evaluation, latency, and monetary cost affect feasibility.

The retrieval decision must remain model-directed. A hard-coded traversal that selects more material and appends it to the prompt does not solve the relevance problem. The prose model must be able to decide that a particular identity field, relationship, lore fragment, neighboring entity, or older turn matters to the response, then request that material selectively.

## Evaluation questions

The proposal should answer:

1. Would model-directed retrieval materially improve GM prose quality and continuity with the expanded canon?
2. What should the agentic prose subsystem own, and what should remain the responsibility of existing stages before and after prose generation?
3. Which current entity-pipeline functions remain independently necessary, rather than being retained or removed as a group?
4. What additional model calls, tokens, latency, embedding work, and storage queries would typical turns require?
5. Can the design work consistently across the repository's OpenAI and Bedrock providers?
6. How should it be evaluated against the current one-shot prose system before implementation or cutover?
