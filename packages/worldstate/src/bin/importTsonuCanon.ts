import { log } from '@glass-frontier/utils';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateProposal } from '../canonValidation';
import { buildTsonuProposal, type TsonuBundle } from '../tsonuBundle';

const BIN_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_BUNDLE_PATH = resolve(
  BIN_DIR,
  '../../../../../tsonu-canon/build/site-internal/worlds/glass-frontier.json'
);
const ARTIFACT_PATH = resolve(BIN_DIR, '../canon/tsonuCanonProposal.json');

/**
 * Regenerates the checked-in canon artifact from tsonu-canon's internal site
 * bundle (`make site-data` in that repo produces it). The proposal is validated
 * against the world vocabulary here, at generation time, so a vocabulary drift
 * fails this command instead of a later seed.
 */
const main = async (): Promise<void> => {
  const bundlePath = process.argv[2] ?? DEFAULT_BUNDLE_PATH;
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as TsonuBundle;
  const proposal = buildTsonuProposal(bundle);

  const { violations } = validateProposal(proposal, new Map());
  if (violations.length > 0) {
    for (const violation of violations) {
      log('error', 'worldstate.tsonu-import-violation', violation);
    }
    throw new Error(`Proposal rejected with ${violations.length} violation(s); artifact not written`);
  }

  await writeFile(ARTIFACT_PATH, `${JSON.stringify(proposal, null, 2)}\n`);
  const outgoingEdges = Object.values(bundle.entries)
    .flatMap(({ entry }) => entry.connections)
    .filter((connection) => connection.direction === 'outgoing').length;
  log('info', 'worldstate.tsonu-artifact-written', {
    entities: proposal.entities.length,
    lore: proposal.lore.length,
    relationships: proposal.relationships.length,
    skippedStructuralEdges: outgoingEdges - proposal.relationships.length,
    sourceId: proposal.sourceId ?? '',
  });
};

main().catch((error: unknown) => {
  log('error', 'worldstate.tsonu-import-failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
