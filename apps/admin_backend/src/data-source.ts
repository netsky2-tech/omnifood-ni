import 'dotenv/config';
import { DataSource } from 'typeorm';
import { resolve } from 'path';
import { resolveDatabaseConnection } from './core/config/database-connection.config';

/**
 * Connection options are resolved before the DataSource is constructed so a
 * production run with missing or invalid database variables fails closed at
 * module load — never connecting with implicit local defaults.
 *
 * The TypeORM CLI uses this data source exclusively for migrations, so it
 * explicitly resolves the migration (schema-owner) credentials: in production
 * those are `DB_MIGRATION_USERNAME`/`DB_MIGRATION_PASSWORD` plus the shared
 * `DB_HOST`, `DB_PORT`, and `DB_DATABASE`. Migrations run as the schema owner
 * while the serving API runs under the separate non-owner runtime role.
 */
const connection = resolveDatabaseConnection({ role: 'migration' });

export default new DataSource({
  type: 'postgres',
  host: connection.host,
  port: connection.port,
  username: connection.username,
  password: connection.password,
  database: connection.database,
  synchronize: false,
  migrations: [resolve(__dirname, 'migrations', '!(*.spec).{ts,js}')],
});
