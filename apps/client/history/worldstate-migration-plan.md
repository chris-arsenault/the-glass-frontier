# Client → Worldstate v2 Migration Plan

## Goals
- Deprecate `@glass-frontier/dto` usage inside the client and rely on `@glass-frontier/worldstate` for any chronicle/character/turn/location data that crosses the wire.
- Keep existing UI behavior stable while normalizing on the shared enums and schemas exported by the new persistence layer.
- Prepare every data-fetching hook, store, and TRPC client to interoperate with worldstate-backed services (chronicle-api, location-api) without bespoke adapters.

## Migration Steps
1. **Tooling/Config**
   - Update `package.json`, `tsconfig.json`, and `vite-env.d.ts` under `apps/client` to point at `@glass-frontier/worldstate`.
   - Remove unused helpers (e.g., `createEmptyInventory`) by replacing them with lightweight local utilities.
2. **Shared State + Hooks**
   - Swap imports in `stores/`, `state/`, `hooks/`, and `lib/progressStream.ts` from `@glass-frontier/dto` to worldstate exports (`Character`, `Chronicle`, `Turn`, `Intent`, enums).
   - Normalize store snapshots to match the new schemas (inventory buckets, `Character.echoes`, `Turn.locationContext`, enums).
3. **Networking**
   - Ensure `trpcClient`, `locationClient`, and any fetch helpers type their requests/responses via worldstate DTOs.
   - For domains not yet migrated (bug reports, prompts), isolate their legacy imports so we can gradually phase them out later.
4. **UI Components**
   - Refactor chat canvas, session manager, badges, drawers, and overview widgets to accept the new intent/risk enums, transcript shapes, inventory deltas, and beat directives.
   - Update prop types and derived helpers so they read optional data defensively (GM transcript, system messages, beat deltas).
5. **Worldstate Mutations**
   - Chronicle/character/location creation + updates should call the worldstate-backed TRPC routers (`updateCharacter`, `appendLocationEvents`, `listLocationGraph`, etc.).
   - Remove legacy persistence helpers; only retain string IDs when referencing non-migrated services.
6. **Validation & Release**
   - Re-run unit + Playwright suites for the client flows touched (chronicle reader, start wizard, moderation panels).
   - Add a changelog entry describing the migration once the UI runs fully on worldstate v2.

## Testing Checklist
- `pnpm --filter @glass-frontier/client run test`
- `pnpm --filter @glass-frontier/client run build`
- Playwright journeys covering chronicle playback, start wizard, and moderation screens.

## Notes
- Keep planning docs inside `apps/client/history` per repository guardrails.
- Avoid re-introducing legacy DTO imports once a file is migrated.
