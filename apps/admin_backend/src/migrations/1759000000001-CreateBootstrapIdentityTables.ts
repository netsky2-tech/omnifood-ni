import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap the identity tables that every later migration assumes already
 * exists.
 *
 * Why this exists: no migration ever created `tenants`, `users`, or
 * `audit_logs`. Existing environments were provisioned with TypeORM
 * `synchronize` or manual SQL before the migration history started, so the gap
 * stayed invisible until someone tried to build the schema from an empty
 * database. Without this migration the set fails at 1760000000000 with
 * `relation "users" does not exist`.
 *
 * Shape matters, and it is the *pre-migration* shape, because the later
 * migrations are the source of truth for everything else:
 * - `users.pin_hash` exists here so that 1761000000000 can drop its NOT NULL,
 *   and 1763000000000 later removes the column.
 * - `users.hashed_refresh_token` exists here because no migration ever
 *   creates it: 1783000000000 adds only `security_version`,
 *   `refresh_token_family_id`, and `refresh_token_revoked_at`, while
 *   1783000000001 merely UPDATEs `hashed_refresh_token` to NULL. Existing
 *   environments received the column from TypeORM `synchronize`, so an empty
 *   database needs it bootstrapped or that UPDATE fails.
 * - `users` deliberately omits `security_version`, `refresh_token_family_id`,
 *   and `refresh_token_revoked_at`, which 1783000000000 introduces.
 * - `users` deliberately omits `chk_users_security_version_positive`, which
 *   1783000000000 adds without `IF NOT EXISTS`; pre-creating it would break
 *   that migration.
 * - `audit_logs.id` is `bigint` here because 1793000000000 converts it to
 *   varchar and its down() converts it back with `id::bigint`.
 * - `audit_logs` omits `forensic_status`, `hash_version`, `entry_hash`,
 *   `prev_hash`, `metodo_autorizacion`, and `usuario_autorizador_id`, which
 *   later migrations add.
 *
 * Idempotency is mandatory and not optional: existing environments already
 * hold these tables without a ledger row for this timestamp, so TypeORM treats
 * this migration as pending there. Every statement is guarded, and the whole
 * `CREATE TABLE IF NOT EXISTS` body — including constraints and foreign keys —
 * is skipped when the table is already present.
 *
 * `gen_random_uuid()` is used instead of `uuid_generate_v4()` because no
 * migration in this repository creates an extension, and `gen_random_uuid()` is
 * built into PostgreSQL 13+.
 */
export class CreateBootstrapIdentityTables1759000000001
  implements MigrationInterface
{
  name = 'CreateBootstrapIdentityTables1759000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL has no `CREATE TYPE IF NOT EXISTS`, so guard on the catalog.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'users_role_enum' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE users_role_enum AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'WAITER');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        ruc varchar NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenants_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar NOT NULL,
        email varchar NULL,
        password_hash varchar NULL,
        pin_hash varchar NULL,
        hashed_refresh_token varchar NULL,
        role users_role_enum NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email),
        CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL,
        user_id uuid NOT NULL,
        action varchar NOT NULL,
        target_type varchar NULL,
        target_id varchar NULL,
        device_id varchar NOT NULL,
        "timestamp" timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NULL,
        sequence_no integer NOT NULL DEFAULT 0
      )
    `);
  }

  /**
   * Reverses only what a bootstrap could have created, and refuses to destroy
   * data: dropping an audit table that holds rows would break the DGR
   * traceability guarantee. A freshly bootstrapped database has no rows, so the
   * normal rollback path stays available.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        table_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY['audit_logs', 'users', 'tenants']
        LOOP
          IF to_regclass('public.' || table_name) IS NOT NULL THEN
            IF EXISTS (
              EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', table_name)
            ) THEN
              RAISE EXCEPTION
                'Refusing to drop table % because it holds rows; remove the data deliberately first',
                table_name;
            END IF;
          END IF;
        END LOOP;
      END
      $$;
    `);

    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
    await queryRunner.query('DROP TABLE IF EXISTS users');
    await queryRunner.query('DROP TABLE IF EXISTS tenants');
    await queryRunner.query('DROP TYPE IF EXISTS users_role_enum');
  }
}
