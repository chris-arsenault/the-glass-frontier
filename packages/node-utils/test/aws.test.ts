import { afterEach, describe, expect, it, vi } from 'vitest';

import { isLambdaRuntime, resolveLambdaDatabaseEnvironment } from '../src/aws';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Lambda environment helpers', () => {
  it('detects the Lambda runtime marker', () => {
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'glass-frontier-gm-api');

    expect(isLambdaRuntime()).toBe(true);
  });

  it('reads the project database connection fields', () => {
    vi.stubEnv('PGDATABASE', 'glass_frontier');
    vi.stubEnv('PGHOST', 'ahara-shared.example');
    vi.stubEnv('PGPASSWORD', 'secret');
    vi.stubEnv('PGPORT', '5432');
    vi.stubEnv('PGUSER', 'glass_frontier');

    expect(resolveLambdaDatabaseEnvironment()).toEqual({
      database: 'glass_frontier',
      host: 'ahara-shared.example',
      password: 'secret',
      port: 5432,
      user: 'glass_frontier',
    });
  });

  it('rejects a missing required database field', () => {
    vi.stubEnv('PGDATABASE', 'glass_frontier');
    vi.stubEnv('PGHOST', '');
    vi.stubEnv('PGPASSWORD', 'secret');
    vi.stubEnv('PGUSER', 'glass_frontier');

    expect(() => resolveLambdaDatabaseEnvironment()).toThrow(
      'PGHOST is required in the Lambda database environment.'
    );
  });
});
