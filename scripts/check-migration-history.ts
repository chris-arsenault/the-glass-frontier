import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Compare to the reviewed base, including staged and unstaged edits; new migrations are allowed. */
export const assertMigrationHistory = (base: string): void => {
  execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { stdio: 'pipe' });
  const changed = execFileSync('git', [
    'diff', '--name-only', '-z', '--no-renames', '--diff-filter=DMRTUXB', base, '--', 'db/migrations',
  ], { encoding: 'utf8' }).split('\0').filter((path) =>
    /^db\/migrations\/(?:rollback\/)?\d[^/]*\.sql$/u.test(path)
  );
  if (changed.length > 0) {
    throw new Error(`Applied migration history changed: ${changed.join(', ')}. Restore it and add a new migration.`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] ?? 'HEAD';
  assertMigrationHistory(base);
  console.log(`Migration history matches ${base}.`);
}
