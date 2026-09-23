# The Glass Frontier

The Glass Frontier is a browser-based narrative game. Players create a character
and play a Chronicle through freeform conversation with an AI GM. The GM combines
skill checks, searchable world canon, and the Chronicle's recorded history.
The World Guide presents named Atlas entities alongside reusable Encyclopedia
material such as creatures, cultures, abilities, and technologies.

## Development

Use Node from [`.node-version`](.node-version) and pnpm 10.23.0.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm lint:css
```

`make ci` is the complete repository gate: migration history, lint, selected
format checks, typecheck, tests, builds, and Terraform validation. Database tests
require PostgreSQL with pgvector and a dedicated `WORLDSTATE_TEST_DATABASE_URL`;
never point that variable at production. GitHub Actions provisions its own test
database.

For an explicitly requested local stack, `pnpm local` starts the Docker-backed
test services and development apps. It uses mock OpenAI responses and seeds local
fixtures; it is not a live-model quality evaluation. See
[the launcher](scripts/run-local-stack.ts) for ports and lifecycle behavior.

Secret-backed commands in Sulion use `with-cred --`; other installations supply
the required environment variables through their normal secret management.

## Repository map

| Location                                  | Responsibility                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/client`                             | React/Vite player UI, World Guide, and audit surfaces                         |
| `apps/gm-api`                             | Turn graph, retrieval, narration, and advisory state updates                  |
| `apps/chronicle-api`                      | Characters, Chronicle creation, seeds, settings, and player APIs              |
| `apps/chronicle-closer`                   | Queued summaries and canon proposals at Chronicle closure                     |
| `apps/atlas-api`, `apps/world-schema-api` | World catalog and vocabulary APIs                                             |
| `apps/canon-seed`                         | Private deployment Lambda for canon import and embeddings                     |
| `apps/progress-api`, `apps/prompt-api`    | Turn progress, prompt management, and audit APIs                              |
| `packages/dto`                            | Shared validated contracts                                                    |
| `packages/worldstate`                     | PostgreSQL canon, Encyclopedia, character, Chronicle, and turn storage        |
| `packages/app`, `packages/llm-client`     | Prompt views and templates, configuration, provider calls, budgets, and audit |
| `packages/skill-check-resolver`           | Skill-check resolution                                                        |
| `db/migrations`                           | The single schema history and application seed SQL                            |
| `infrastructure/terraform`                | Project resources attached to the shared Ahara platform                       |

## Canon and deployment

Authored canon lives in the neighboring `tsonu-canon` repository. Generate its
internal bundle there, then regenerate the checked-in Glass snapshot with
`pnpm --filter @glass-frontier/worldstate import:tsonu`. The
[canon pipeline guide](docs/canon-pipeline.md) gives the exact sequence,
reconciliation rules, and verification requirements.

Pushes to `main` run verification and deployment through
[the existing workflow](.github/workflows/ci.yml). Deployment applies migrations,
application seeds, Terraform, and the private canon-seed Lambda, which finishes
both embedding backfills before returning success. Routine canon updates use
this pipeline and preserve Chronicle records; the original Encyclopedia reset
was a one-time cutover.

## Documentation

- [Architecture and data ownership](docs/architecture.md)
- [GM retrieval, threads, and bounded scenes](docs/design/gm-runtime.md)
- [Encyclopedia contract](docs/design/encyclopedia-reference-catalog.md)
- [Architecture decisions](docs/adr/README.md)
- [Deployment and canon maintenance](docs/canon-pipeline.md)
- [Worldstate persistence](packages/worldstate/ARCHITECTURE.md)
- [Infrastructure](infrastructure/terraform/README.md)
- [Remaining work](BACKLOG.md)
- [Bundled changelog](apps/client/src/data/changelog.json)
- [September feature closeout and verification](docs/reports/2026-09-21-feature-closeout.md)

The [documentation index](docs/README.md) distinguishes current documentation
from historical designs. Original product requirements remain preserved as
design intent, including systems that are not implemented in the current app.
