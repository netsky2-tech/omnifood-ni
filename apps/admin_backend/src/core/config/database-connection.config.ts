/**
 * TypeORM PostgreSQL connection resolver for the admin backend.
 *
 * Incident-hardening contract: the compiled migration runner
 * (`dist/data-source.js`) is loaded by the TypeORM CLI before Nest boots and
 * before any connection is attempted. It must never fall back to implicit
 * local defaults in production — under `NODE_ENV=production` every database
 * connection variable required by the requested role must be explicitly
 * present and valid, or resolution throws before the `DataSource` is
 * constructed. Non-production environments keep the historical local
 * defaults (127.0.0.1/postgres/omnifood).
 *
 * Role separation: the `runtime` role serves traffic under a least-privilege
 * PostgreSQL role that must be created `NOSUPERUSER NOBYPASSRLS` so tenant
 * RLS cannot be bypassed; the `migration` role owns schema objects (tables,
 * types, RLS policies) and is used only by the migration runner. In
 * production each role resolves its own credential variables and the
 * migration role never falls back to the runtime credentials.
 *
 * Configuration errors name the offending environment variables only; values
 * are never echoed, so thrown errors are safe for deploy logs.
 */

export type DatabaseConnectionEnv = Record<string, string | undefined>;

/**
 * Which credential set a connection uses. Every caller must state its role
 * explicitly so production fails closed when the credential pair for the
 * requested role is absent, and no caller can silently receive the other
 * role's credentials.
 */
export type DatabaseConnectionRole = 'runtime' | 'migration';

/** Resolved PostgreSQL connection options for the TypeORM data source. */
export interface DatabaseConnectionOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface ResolveDatabaseConnectionInput {
  /**
   * Environment variable bag to resolve from; defaults to `process.env`.
   * Tests inject this explicitly; callers pass the role they serve.
   */
  env?: DatabaseConnectionEnv | undefined;
  /** Which credential set to resolve: serving traffic or running migrations. */
  role: DatabaseConnectionRole;
}

/**
 * Raised when production database connection configuration is absent or
 * invalid. Fails closed before the `DataSource` is constructed and before
 * any connection is attempted.
 */
export class DatabaseConnectionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConnectionConfigError';
  }
}

/** Connection variables shared by every database role. */
const REQUIRED_PRODUCTION_SHARED_DB_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
] as const;

/** Credential variables owned by the serving (non-owner) runtime role. */
const REQUIRED_PRODUCTION_RUNTIME_CREDENTIAL_VARS = [
  'DB_USERNAME',
  'DB_PASSWORD',
] as const;

/** Credential variables owned by the migration (schema-owner) role. */
const REQUIRED_PRODUCTION_MIGRATION_CREDENTIAL_VARS = [
  'DB_MIGRATION_USERNAME',
  'DB_MIGRATION_PASSWORD',
] as const;

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function isProduction(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

/**
 * Resolve the TypeORM PostgreSQL connection options for the requested role.
 *
 * Production (`NODE_ENV=production`, exact match) fails closed: every
 * required variable for the role must be present and non-blank, and the
 * shared `DB_PORT` must be an integer between 1 and 65535. Values are used
 * exactly as provided (never trimmed) and never appear in error messages.
 * Non-production environments preserve the historical local defaults; the
 * migration role may fall back to `DB_USERNAME`/`DB_PASSWORD` there.
 */
export function resolveDatabaseConnection(
  input: ResolveDatabaseConnectionInput,
): DatabaseConnectionOptions {
  const env = input.env ?? process.env;
  const { role } = input;

  if (isProduction(env.NODE_ENV)) {
    const credentialVars =
      role === 'runtime'
        ? REQUIRED_PRODUCTION_RUNTIME_CREDENTIAL_VARS
        : REQUIRED_PRODUCTION_MIGRATION_CREDENTIAL_VARS;
    const requiredVars: string[] = [
      ...REQUIRED_PRODUCTION_SHARED_DB_VARS,
      ...credentialVars,
    ];

    const missing = requiredVars.filter((name) => isBlank(env[name]));
    if (missing.length > 0) {
      throw new DatabaseConnectionConfigError(
        `Refusing to construct the DataSource with implicit database configuration: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required when NODE_ENV=production for the ${role} database role. Set every required variable explicitly so connections cannot target an unintended database or use unintended privileges.`,
      );
    }

    const port = Number(env.DB_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new DatabaseConnectionConfigError(
        `Refusing to construct the DataSource with an invalid database configuration: DB_PORT must be an integer between 1 and 65535 when NODE_ENV=production for the ${role} database role.`,
      );
    }

    if (role === 'migration') {
      return {
        host: env.DB_HOST,
        port,
        username: env.DB_MIGRATION_USERNAME,
        password: env.DB_MIGRATION_PASSWORD,
        database: env.DB_DATABASE,
      };
    }

    return {
      host: env.DB_HOST,
      port,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
    };
  }

  if (role === 'migration') {
    return {
      host: env.DB_HOST ?? '127.0.0.1',
      port: Number(env.DB_PORT ?? 5432),
      username: env.DB_MIGRATION_USERNAME ?? env.DB_USERNAME ?? 'postgres',
      password: env.DB_MIGRATION_PASSWORD ?? env.DB_PASSWORD ?? 'postgres',
      database: env.DB_DATABASE ?? 'omnifood',
    };
  }

  return {
    host: env.DB_HOST ?? '127.0.0.1',
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USERNAME ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    database: env.DB_DATABASE ?? 'omnifood',
  };
}
