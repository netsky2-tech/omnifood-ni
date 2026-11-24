/**
 * R3-003: when PostgreSQL is unreachable, `openEntitlementsFixture` must not
 * surface TypeORM's raw driver error. The error must name the fixture, the
 * host:port/database it tried, and the env vars to set, so an e2e run fails
 * with an actionable message instead of an opaque driver error.
 *
 * The fixture builds its connection options from `process.env` at module
 * evaluation time, so the spec sets the unreachable host/port env vars BEFORE
 * dynamically importing the fixture module (`jest.resetModules()` + `await
 * import(...)`), and restores every saved variable in `finally`.
 */
describe('openEntitlementsFixture diagnostics (R3-003)', () => {
  const FIXTURE_ENV_KEYS = [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_DATABASE',
  ] as const;

  it('throws an actionable error when PostgreSQL is unreachable', async () => {
    const savedEnv = new Map<string, string | undefined>();
    for (const key of FIXTURE_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '1';
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_PASSWORD = 'postgres';
    process.env.DB_DATABASE = 'omnifood_fixture_diagnostics';

    jest.resetModules();
    try {
      const { openEntitlementsFixture } =
        await import('../../../test/support/entitlements-fixture');

      const error: unknown = await openEntitlementsFixture().then(
        () => {
          throw new Error(
            'fixture connected to the unreachable endpoint instead of failing',
          );
        },
        (thrown: unknown) => thrown,
      );

      // Duck-typed on purpose: the fixture module is imported through a
      // fresh module registry, whose `Error` realm differs from this spec's,
      // so `instanceof` is not a reliable check here. The actionable surface
      // is the message.
      const message = (error as { message?: unknown })?.message;
      expect(typeof message).toBe('string');
      expect(message).toContain('entitlements e2e fixture');
      expect(message).toContain('127.0.0.1:1');
      expect(message).toContain('DB_HOST');
    } finally {
      for (const [key, value] of savedEnv) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }, 20_000);
});
