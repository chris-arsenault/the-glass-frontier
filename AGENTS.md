# Agent Guardrails

- Never revert user-authored tweaks unless explicitly asked; prefer additive fixes.  When a diff results in unexpected diffs assume the user made them. Flag in output but do not adjust code.
- Ignore the `archive/` directory unless the user explicitly requests changes there; it’s only for historical snapshots.
- Ignore the `docs/` directory unless the user explicitly requests updates; treat it as reference material.
- Preserve the current lint-clean state: do not introduce ESLint errors or warnings, and fix any that appear before handing off.

## General Implementation Guidelines

- Preserve existing code style and do not overcomplicate code.
- Do not introduce options or polymorphism unless required.
- Choose sane defaults instead of configuration.
- Skip feature flags/feature gating for prototype apps; ship the single canonical behavior unless explicitly asked otherwise.
- Only add new environment variables when a value truly needs to be surfaced from Terraform; prefer hardcoded defaults in code for everything else.
- Use the existing layers: persistence-related functionality belongs in `packages/persistence`, shared DTOs or over-the-wire contracts belong in `packages/dto`, and avoid scattering domain logic into app folders when a shared module already exists.
- Use declarative programing for sequenced events.

## Changelog Workflow

- All user-facing work must update the bundled changelog stored at `apps/client/src/data/changelog.json`; this file ships with the UI and powers the account-bar modal.
- Each entry is a JSON object with the shape `{ "id": string, "releasedAt": "YYYY-MM-DD", "summary": string, "details": string, "type": "feature" | "improvement" | "bugfix" }`.
- Add a new entry when completing standalone work. If you are extending previously tracked work, edit the existing entry instead of creating a duplicate.
- Keep the records sorted by `releasedAt` (newest dates at the end of the file) so the UI can sort deterministically.
- The initial entry documents the creation of the changelog itself—preserve it for historical context.

## Subproject Overview

### Apps
- `apps/client`: Vite/React front-end that renders the Glass Frontier player experience and talks to the narrative services through tRPC and shared DTOs.
- `apps/llm-proxy`: Node-based proxy (deployment targets: local or AWS Lambda) that standardizes OpenAI/LLM calls and exposes them to the rest of the stack.
- `apps/chronicle-api`: Chronicle engine service that runs storytelling logic, handles skill checks, and ships as an AWS Lambda with supporting build scripts.
- `apps/webservice`: WebSocket-facing webservice that brokers progress updates (Step Functions → SQS → API Gateway) and manages connection/job subscriptions.

### Packages
- `packages/dto`: Shared Zod DTO/type definitions consumed by the client, narrative engine, and proxy for consistent contracts.
- `packages/skill-check-resolver`: Domain module that encapsulates skill-check math/rules used during narrative resolution.
- `packages/utils`: Common utility helpers that the other workspaces depend on.
- `packages/persistence`: Shared world-state persistence layer (in-memory + S3 implementations plus factory) consumed by narrative services, now including the location graph store/index for cross-chronicle navigation state.

### Infrastructure
- `infrastructure/terraform`: Terraform project that provisions the AWS footprint (API Gateway, Cognito, Lambda builds, S3/CloudFront, etc.) and wires in workspace build artifacts.

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:
- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**
- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**
```
# AI planning documents (ephemeral)
history/
```

**Benefits:**
- ✅ Clean repository root
- ✅ Clear separation between ephemeral and permanent documentation
- ✅ Easy to exclude from version control if desired
- ✅ Preserves planning history for archeological research
- ✅ Reduces noise when browsing the project

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic bd commands
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI planning docs in `history/` directory
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems
- ❌ Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.
