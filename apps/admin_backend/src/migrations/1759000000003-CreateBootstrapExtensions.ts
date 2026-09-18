import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap the PostgreSQL extensions that the migration set assumes are
 * already installed.
 *
 * Why this exists: no migration ever installed an extension. Existing
 * environments received `uuid-ossp` through manual provisioning before the
 * migration history started, so the gap stayed invisible until someone tried
 * to build the schema from an empty database. Without this migration the set
 * fails at 1788000000000 with `function uuid_generate_v4() does not exist`:
 * that migration declares its primary key through TypeORM
 * `generationStrategy: 'uuid'`, which emits a `DEFAULT uuid_generate_v4()`
 * clause on PostgreSQL, and only the `uuid-ossp` extension provides it.
 *
 * `CREATE EXTENSION IF NOT EXISTS` is natively idempotent: existing
 * environments already hold the extension, and the statement is a no-op
 * there. Note that installing `uuid-ossp` from scratch requires superuser
 * (or an equivalent) role; when the extension is already present the
 * statement succeeds regardless of privileges.
 */
export class CreateBootstrapExtensions1759000000003
  implements MigrationInterface
{
  name = 'CreateBootstrapExtensions1759000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  }

  /**
   * Refuses to drop the extension: other objects in the database (created
   * before or after this migration) may depend on `uuid_generate_v4()`, and
   * dropping it would destroy that capability. A bootstrap migration reverses
   * only what it can reverse safely.
   */
  public async down(): Promise<void> {
    return Promise.reject(
      new Error(
        'down migration forbidden: the uuid-ossp extension may be depended on by objects outside this migration',
      ),
    );
  }
}
