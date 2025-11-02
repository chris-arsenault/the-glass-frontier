# DESIGN.md

## Phase Scope

Sessions 11–20 translate the research corpus and `REQUIREMENTS.md` into actionable system design for *The Glass Frontier*. The design cycle must strictly follow the operating loop in `AGENTS.md`, with every insight reflected in the MCP backlog, handoffs, and architecture registry.

Always ground design choices in the baseline feature and technical commitments captured in `REQUIREMENTS.md`.

## MCP-Integrated Session Workflow

1. **Continuity Check**
   - Import the latest handoff via `mcp__game-mcp-server__fetch_handoff`.  
   - Enumerate design-stage workload with `mcp__game-mcp-server__search_backlog_by_tag` (`phase:design`) or `mcp__game-mcp-server__get_top_backlog_items`.
   - Re-read `REQUIREMENTS.md` to ensure the planned scope for the session aligns with user-provided requirements before drafting new artefacts.

2. **Backlog Stewardship**
   - Manage the design epic `DES-CORE` with child stories `DES-11` … `DES-20` (tags: `phase:design`, `discipline:systems/architecture`, `cycle:[#]`).  
   - Enter each session by updating the relevant story to `in-progress`, attaching acceptance criteria mirroring the Session Grid tasks.  
  - Capture diagrams, schema drafts, and API sketches as attachments or links within the backlog notes.

3. **Architecture Capturing**
   - As systems crystallize, commit decisions with `mcp__game-mcp-server__store_architecture_decision` (tags: `desert-adventure-online`, `phase:design`, `system:[name]`).  
   - Run `mcp__game-mcp-server__check_consistency` before finalizing significant updates to ensure alignment with prior decisions.  
   - When identifying reusable solution patterns (e.g., hub event dispatcher), persist them through `mcp__game-mcp-server__store_pattern`.

4. **Session Closure**
   - Move the active story to `done` once acceptance criteria are satisfied and artefacts are linked.  
   - Produce `docs/reports/autonomous-session-[N]-handoff.md` plus the matching MCP handoff entry referencing: backlog items updated, architecture decisions created, outstanding design risks.  
   - Maintain `docs/plans/backlog.md` so it mirrors the MCP backlog state.

## Session Grid

| Session | Backlog Anchor | Design Focus | Required MCP Artifacts |
|---------|----------------|--------------|------------------------|
| 11–12 | `DES-11`, `DES-12` | Global systems map (Narrative Engine, Character System, World State Pipeline, Lore/Wiki, Hub System). | Architecture decisions for system boundaries; backlog notes linking to canvas/system diagrams; consistency check results logged. |
| 13–14 | `DES-13`, `DES-14` | Narrative + rules framework (success ladders, LLM integration contracts, moderation schema). | Architecture decisions for rules enforcement + LLM hand-off; stored patterns for resolution templates; backlog tasks for rule edge cases. |
| 15–16 | `DES-15`, `DES-16` | Persistence, lore, and data pipelines (storage schemas, delta workflow, provenance rules). | Architecture decisions describing data models and cadence; stored patterns for lore publishing; backlog note of retention policy risks. |
| 17 | `DES-17` | Multiplayer hubs and real-time stack (command parser, rooms, sync). | Architecture decision for hub event flow; pattern for WebSocket/session handling; backlog follow-ups for load tests. |
| 18 | `DES-18` | Admin & moderation workflows (roles, permissions, audit trails). | Architecture decisions capturing moderation pipeline; backlog actions for tooling prototypes. |
| 19 | `DES-19` | Infrastructure & scaling (LLM orchestration, databases, networking). | Architecture decisions on orchestration topology; backlog updates for cost/risk analysis; store pattern for deployment pipeline. |
| 20 | `DES-20` | System synthesis and SDD production. | Final architecture decision summarizing target stack; backlog item pointing to `SYSTEM_DESIGN_SPEC.md`; handoff enumerating open implementation risks. |

## Artefact Expectations

Each session must create:

1. **Session Summary** — included in handoff and backlog notes.  
2. **System Artefacts** — diagrams (`docs/design/diagrams/`), schemas, pseudocode, or dataflows tied to backlog and referenced in architecture decisions.  
3. **Design Rationale** — tradeoff analysis captured in backlog notes and, when finalized, promoted into architecture decision rationale.  
4. **Dependencies & Risks** — tracked in backlog checklists and reiterated inside handoffs for continuity.

## Phase Deliverables

- Maintain versioned design assets under `docs/design/`, with filenames keyed to backlog IDs for traceability.  
- Compile `SYSTEM_DESIGN_SPEC.md` during Session 20, citing all relevant backlog stories and architecture decision IDs.  
- Ensure unresolved implementation questions roll forward as new backlog items tagged `phase:implementation` so build cycles start with a groomed queue.
