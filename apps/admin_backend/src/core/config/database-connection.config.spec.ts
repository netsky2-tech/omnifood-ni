import {
  DatabaseConnectionConfigError,
  resolveDatabaseConnection,
} from './database-connection.config';

/**
 * Fixture credentials below are deliberately credential-shaped, and that is not
 * an accident: the resolver is asserted to return the real development default
 * outside production, so the fixture has to hold it. A secret scanner cannot
 * tell such a value apart from a leaked credential.
 *
 * The exclusion lives in the GitGuardian workspace dashboard, not in this
 * repository's `.gitguardian.yaml`, because the GitHub App reads its filepath
 * exclusions from workspace settings while that file only configures the
 * ggshield CLI. Rewriting these values to dodge the detector was tried and made
 * things worse: the detector matches the shape of the assignment rather than
 * the value.
 */
const VALID_PRODUCTION_RUNTIME_ENV = {
  NODE_ENV: 'production',
  DB_HOST: 'db-staging.example.internal',
  DB_PORT: '6543',
  DB_USERNAME: 'staging_role',
  DB_PASSWORD: 'staging-password',
  DB_DATABASE: 'staging_db',
} as const;

const VALID_PRODUCTION_MIGRATION_ENV = {
  NODE_ENV: 'production',
  DB_HOST: 'db-staging.example.internal',
  DB_PORT: '6543',
  DB_MIGRATION_USERNAME: 'staging_migrator',
  DB_MIGRATION_PASSWORD: 'staging-migrator-password',
  DB_DATABASE: 'staging_db',
} as const;

const RUNTIME_DB_VAR_NAMES = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
] as const;

const MIGRATION_DB_VAR_NAMES = [
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
  'DB_MIGRATION_USERNAME',
  'DB_MIGRATION_PASSWORD',
] as const;

/** Historical local defaults that must keep applying outside production. */
const DEV_DEFAULTS = {
  host: '127.0.0.1',
  port: 5432,
  username: 'postgres',
  password: 'postgres',
  database: 'omnifood',
};

function caughtMessage(calling: () => unknown): string {
  try {
    calling();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

describe('resolveDatabaseConnection', () => {
  describe('production runtime fail-closed contract', () => {
    it('resolves explicit valid production variables without defaults', () => {
      const connection = resolveDatabaseConnection({
        env: { ...VALID_PRODUCTION_RUNTIME_ENV },
        role: 'runtime',
      });

      expect(connection).toEqual({
        host: 'db-staging.example.internal',
        port: 6543,
        username: 'staging_role',
        password: 'staging-password',
        database: 'staging_db',
      });
      expect(typeof connection.port).toBe('number');
    });

    it.each(RUNTIME_DB_VAR_NAMES)('rejects a missing %s', (name) => {
      const env: Record<string, string> = { ...VALID_PRODUCTION_RUNTIME_ENV };
      delete env[name];

      expect(() => resolveDatabaseConnection({ env, role: 'runtime' })).toThrow(
        DatabaseConnectionConfigError,
      );
    });

    it.each(RUNTIME_DB_VAR_NAMES)('treats a blank %s as missing', (name) => {
      expect(() =>
        resolveDatabaseConnection({
          env: { ...VALID_PRODUCTION_RUNTIME_ENV, [name]: '   ' },
          role: 'runtime',
        }),
      ).toThrow(DatabaseConnectionConfigError);
    });

    it('names every missing variable without echoing any value', () => {
      const message = caughtMessage(() =>
        resolveDatabaseConnection({
          env: {
            NODE_ENV: 'production',
            DB_HOST: 'secret-host-value',
            DB_PASSWORD: 'secret-password-value',
          },
          role: 'runtime',
        }),
      );

      expect(message).toContain('DB_PORT');
      expect(message).toContain('DB_USERNAME');
      expect(message).toContain('DB_DATABASE');
      expect(message).not.toContain('secret-host-value');
      expect(message).not.toContain('secret-password-value');
    });

    it('uses production values exactly as provided without trimming', () => {
      const connection = resolveDatabaseConnection({
        env: {
          ...VALID_PRODUCTION_RUNTIME_ENV,
          DB_HOST: ' db-staging.example.internal ',
        },
        role: 'runtime',
      });

      expect(connection.host).toBe(' db-staging.example.internal ');
    });

    it('never reads migration-owner credentials for the runtime role', () => {
      const connection = resolveDatabaseConnection({
        env: {
          ...VALID_PRODUCTION_RUNTIME_ENV,
          DB_MIGRATION_USERNAME: 'ignored_migrator',
          DB_MIGRATION_PASSWORD: 'ignored-migrator-password',
        },
        role: 'runtime',
      });

      expect(connection.username).toBe('staging_role');
      expect(connection.password).toBe('staging-password');
    });
  });

  describe('production migration fail-closed contract', () => {
    it('resolves shared connection variables plus dedicated migration-owner credentials', () => {
      const connection = resolveDatabaseConnection({
        env: {
          ...VALID_PRODUCTION_MIGRATION_ENV,
          DB_USERNAME: 'staging_role',
          DB_PASSWORD: 'staging-password',
        },
        role: 'migration',
      });

      expect(connection).toEqual({
        host: 'db-staging.example.internal',
        port: 6543,
        username: 'staging_migrator',
        password: 'staging-migrator-password',
        database: 'staging_db',
      });
    });

    it.each(MIGRATION_DB_VAR_NAMES)(
      'rejects a missing %s for the migration role',
      (name) => {
        const env: Record<string, string> = {
          ...VALID_PRODUCTION_MIGRATION_ENV,
        };
        delete env[name];

        expect(() =>
          resolveDatabaseConnection({ env, role: 'migration' }),
        ).toThrow(DatabaseConnectionConfigError);
      },
    );

    it('refuses to fall back to DB_USERNAME/DB_PASSWORD for migrations in production', () => {
      const message = caughtMessage(() =>
        resolveDatabaseConnection({
          env: {
            NODE_ENV: 'production',
            DB_HOST: 'db-staging.example.internal',
            DB_PORT: '6543',
            DB_DATABASE: 'staging_db',
            DB_USERNAME: 'staging_role',
            DB_PASSWORD: 'staging-password',
          },
          role: 'migration',
        }),
      );

      expect(message).toContain('DB_MIGRATION_USERNAME');
      expect(message).toContain('DB_MIGRATION_PASSWORD');
      expect(message).not.toContain('staging_role');
      expect(message).not.toContain('staging-password');
    });

    it('validates DB_PORT for the migration role', () => {
      const message = caughtMessage(() =>
        resolveDatabaseConnection({
          env: { ...VALID_PRODUCTION_MIGRATION_ENV, DB_PORT: '70000' },
          role: 'migration',
        }),
      );

      expect(message).toContain('DB_PORT');
      expect(message).toContain('integer between 1 and 65535');
      expect(message).not.toContain('70000');
    });
  });

  describe('production DB_PORT validation', () => {
    it.each(['1', '5432', '65535'])('accepts DB_PORT %s', (port) => {
      const connection = resolveDatabaseConnection({
        env: { ...VALID_PRODUCTION_RUNTIME_ENV, DB_PORT: port },
        role: 'runtime',
      });

      expect(connection.port).toBe(Number(port));
    });

    it.each(['0', '-1', '65536', '99999', '12.5', 'not-a-number', 'Infinity'])(
      'rejects DB_PORT %s',
      (port) => {
        const message = caughtMessage(() =>
          resolveDatabaseConnection({
            env: { ...VALID_PRODUCTION_RUNTIME_ENV, DB_PORT: port },
            role: 'runtime',
          }),
        );

        expect(message).toContain('DB_PORT');
        expect(message).toContain('integer between 1 and 65535');
        expect(message).not.toContain(port);
      },
    );
  });

  describe('non-production defaults', () => {
    it('preserves the historical local defaults when every variable is unset', () => {
      expect(resolveDatabaseConnection({ env: {}, role: 'runtime' })).toEqual(
        DEV_DEFAULTS,
      );
    });

    it('preserves the historical local defaults for development', () => {
      expect(
        resolveDatabaseConnection({
          env: { NODE_ENV: 'development' },
          role: 'runtime',
        }),
      ).toEqual(DEV_DEFAULTS);
    });

    it('preserves the historical local defaults for test runs', () => {
      expect(
        resolveDatabaseConnection({
          env: { NODE_ENV: 'test' },
          role: 'runtime',
        }),
      ).toEqual(DEV_DEFAULTS);
    });

    it('activates the production contract only for the exact NODE_ENV value', () => {
      expect(
        resolveDatabaseConnection({
          env: { NODE_ENV: 'Production' },
          role: 'runtime',
        }),
      ).toEqual(DEV_DEFAULTS);
    });

    it('keeps explicit overrides in development', () => {
      expect(
        resolveDatabaseConnection({
          env: {
            NODE_ENV: 'development',
            DB_HOST: 'localhost',
            DB_PORT: '6543',
            DB_USERNAME: 'dev_role',
            DB_PASSWORD: 'dev-password',
            DB_DATABASE: 'dev_db',
          },
          role: 'runtime',
        }),
      ).toEqual({
        host: 'localhost',
        port: 6543,
        username: 'dev_role',
        password: 'dev-password',
        database: 'dev_db',
      });
    });

    it('falls back to historical postgres defaults for migrations outside production', () => {
      expect(resolveDatabaseConnection({ env: {}, role: 'migration' })).toEqual(
        DEV_DEFAULTS,
      );
    });

    it('falls back to DB_USERNAME/DB_PASSWORD for migrations outside production', () => {
      expect(
        resolveDatabaseConnection({
          env: {
            NODE_ENV: 'development',
            DB_USERNAME: 'dev_role',
            DB_PASSWORD: 'dev-password',
          },
          role: 'migration',
        }),
      ).toEqual({
        ...DEV_DEFAULTS,
        username: 'dev_role',
        password: 'dev-password',
      });
    });

    it('prefers DB_MIGRATION_USERNAME/DB_MIGRATION_PASSWORD over DB_USERNAME/DB_PASSWORD outside production', () => {
      expect(
        resolveDatabaseConnection({
          env: {
            NODE_ENV: 'development',
            DB_MIGRATION_USERNAME: 'migrator_role',
            DB_MIGRATION_PASSWORD: 'migrator-password',
            DB_USERNAME: 'dev_role',
            DB_PASSWORD: 'dev-password',
          },
          role: 'migration',
        }),
      ).toEqual({
        ...DEV_DEFAULTS,
        username: 'migrator_role',
        password: 'migrator-password',
      });
    });
  });

  describe('process.env default', () => {
    const MANAGED_KEYS = ['NODE_ENV', ...RUNTIME_DB_VAR_NAMES];
    const ORIGINAL_ENV: Record<string, string | undefined> = {};
    for (const key of MANAGED_KEYS) {
      ORIGINAL_ENV[key] = process.env[key];
    }

    afterEach(() => {
      for (const key of MANAGED_KEYS) {
        const original = ORIGINAL_ENV[key];
        if (original === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original;
        }
      }
    });

    it('reads process.env when no environment bag is provided', () => {
      for (const key of MANAGED_KEYS) {
        delete process.env[key];
      }
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'from-process-env.example.internal';
      process.env.DB_PORT = '6544';
      process.env.DB_USERNAME = 'env_role';
      process.env.DB_PASSWORD = 'env-password';
      process.env.DB_DATABASE = 'env_db';

      expect(resolveDatabaseConnection({ role: 'runtime' })).toEqual({
        host: 'from-process-env.example.internal',
        port: 6544,
        username: 'env_role',
        password: 'env-password',
        database: 'env_db',
      });
    });
  });
});
