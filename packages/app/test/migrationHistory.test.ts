import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertMigrationHistory } from '../../../scripts/check-migration-history';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const git = vi.mocked(execFileSync);
const REVIEWED_BASE = 'reviewed-base';

beforeEach(() => git.mockReset());

describe('migration immutability gate', () => {
  it.each(['db/migrations/001_initial.sql', 'db/migrations/rollback/005_scene_context.sql'])(
    'rejects modification, deletion, or rename of %s', (path) => {
      git.mockReturnValueOnce('base').mockReturnValueOnce(`${path}\0`);
      expect(() => assertMigrationHistory(REVIEWED_BASE)).toThrow('Applied migration history changed');
      expect(git.mock.calls[1]?.[1]).toContain('--no-renames');
      expect(git.mock.calls[1]?.[1]).toContain('--diff-filter=DMRTUXB');
    }
  );

  it('allows new migrations and regenerated seed content', () => {
    git.mockReturnValueOnce('base').mockReturnValueOnce('db/migrations/seed/002_prompt_templates.sql\0');
    expect(() => assertMigrationHistory(REVIEWED_BASE)).not.toThrow();
    expect(git.mock.calls[1]?.[1]).toContain(REVIEWED_BASE);
  });

  it('fails closed when the comparison revision is unavailable', () => {
    git.mockImplementationOnce(() => { throw new Error('unknown revision'); });
    expect(() => assertMigrationHistory('missing-base')).toThrow('unknown revision');
    expect(git).toHaveBeenCalledTimes(1);
  });
});
