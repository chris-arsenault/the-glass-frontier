import { log } from '@glass-frontier/utils';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateProposal } from '../canonValidation';
import { buildTsonuSnapshot, parseTsonuBundle } from '../tsonuBundle';

const BIN_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_BUNDLE_PATH = resolve(
  BIN_DIR,
  '../../../../../tsonu-canon/build/site-internal/worlds/glass-frontier.json'
);
const ARTIFACT_PATH = resolve(BIN_DIR, '../canon/tsonuCanonSnapshot.json');

/**
 * Regenerates the checked-in canon artifact from tsonu-canon's internal site
 * bundle (`make site-data` in that repo produces it). The proposal is validated
 * against the world vocabulary here, at generation time, so a vocabulary drift
 * fails this command instead of a later seed.
 */
const main = async (): Promise<void> => {
  const bundlePath = process.argv[2] ?? DEFAULT_BUNDLE_PATH;
  const bundle = parseTsonuBundle(JSON.parse(await readFile(bundlePath, 'utf8')));
  const snapshot = buildTsonuSnapshot(bundle);

  const { violations } = validateProposal(snapshot.atlas, new Map());
  if (violations.length > 0) {
    for (const violation of violations) {
      log('error', 'worldstate.tsonu-import-violation', violation);
    }
    throw new Error(`Proposal rejected with ${violations.length} violation(s); artifact not written`);
  }

  await writeFile(ARTIFACT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  const outgoingEdges = Object.values(bundle.entries)
    .flatMap(({ entry }) => entry.connections)
    .filter((connection) => connection.direction === 'outgoing').length;
  log('info', 'worldstate.tsonu-artifact-written', {
    classifications: snapshot.classifications.length,
    contextTags: snapshot.contextTags.length,
    encyclopedia: snapshot.encyclopedia.length,
    entities: snapshot.atlas.entities.length,
    lore: snapshot.atlas.lore.length,
    relationships: snapshot.atlas.relationships.length,
    skippedStructuralEdges: outgoingEdges - snapshot.atlas.relationships.length,
    sourceId: snapshot.sourceId,
  });
};

main().catch((error: unknown) => {
  log('error', 'worldstate.tsonu-import-failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
