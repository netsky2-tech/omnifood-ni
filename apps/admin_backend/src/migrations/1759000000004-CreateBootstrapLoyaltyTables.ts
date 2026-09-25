import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap the loyalty tables that exist only as TypeORM entity
 * declarations and that no migration in the history ever creates.
 *
 * Why this exists: `loyalty_programs`, `loyalty_rewards`, and
 * `customer_loyalty_account_projection` were provisioned in existing
 * environments with TypeORM `synchronize` before the migration history
 * started. Building the schema from an empty database left those tables
 * missing, so the schema build never matched the entity declarations.
 *
 * The shape mirrors the entity declarations:
 * - Enum types follow the TypeORM PostgreSQL convention
 *   `<table>_<column>_enum`, matching what `synchronize` produced.
 * - `loyalty_rewards.loyalty_program_id` and the projection's
 *   `loyalty_program_id` reference `loyalty_programs(id)`, and the tenant
 *   columns reference `tenants(id)` (created by 1759000000001).
 * - The projection's `customer_id` deliberately carries NO foreign key:
 *   `customers` is only created much later by 1789000000000, so a
 *   bootstrap-time FK would fail. Environments provisioned through
 *   synchronize may hold that FK; adding it here is impossible without
 *   modifying that later migration.
 *
 * Idempotency is mandatory and not optional: existing environments already
 * hold these tables without a ledger row for this timestamp, so TypeORM
 * treats this migration as pending there. Every `CREATE TABLE` uses
 * `IF NOT EXISTS` (its body, including the named foreign keys, is skipped
 * when the table is already present), every index uses `IF NOT EXISTS`, and
 * enum creation is guarded on the catalog.
 */
export class CreateBootstrapLoyaltyTables1759000000004 implements MigrationInterface {
  name = 'CreateBootstrapLoyaltyTables1759000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL has no `CREATE TYPE IF NOT EXISTS`, so guard on the catalog.
    for (const [typeName, values] of [
      [
        'loyalty_programs_program_type_enum',
        'SPEND_POINTS, PRODUCT_STAMPS, VISIT_STAMPS',
      ],
      ['loyalty_programs_status_enum', 'DRAFT, ACTIVE, INACTIVE'],
      ['loyalty_rewards_reward_type_enum', 'DISCOUNT_AMOUNT, FREE_PRODUCT'],
      ['loyalty_rewards_status_enum', 'ACTIVE, INACTIVE'],
    ] as Array<[string, string]>) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = '${typeName}' AND n.nspname = 'public'
          ) THEN
            CREATE TYPE ${typeName} AS ENUM (${values
              .split(',')
              .map((value) => `'${value.trim()}'`)
              .join(', ')});
          END IF;
        END
        $$;
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS loyalty_programs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(160) NOT NULL,
        program_type loyalty_programs_program_type_enum NOT NULL,
        status loyalty_programs_status_enum NOT NULL DEFAULT 'DRAFT',
        starts_at timestamptz,
        ends_at timestamptz,
        earning_rule jsonb NOT NULL,
        eligibility_rule jsonb NOT NULL,
        config_version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_loyalty_programs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_loyalty_programs_tenant_status ON loyalty_programs (tenant_id, status)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        loyalty_program_id uuid NOT NULL,
        name varchar(160) NOT NULL,
        description text,
        reward_type loyalty_rewards_reward_type_enum NOT NULL,
        cost_units integer NOT NULL,
        benefit_config jsonb NOT NULL,
        status loyalty_rewards_status_enum NOT NULL DEFAULT 'INACTIVE',
        starts_at timestamptz,
        ends_at timestamptz,
        presentation_order integer NOT NULL DEFAULT 0,
        config_version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_loyalty_rewards_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        CONSTRAINT fk_loyalty_rewards_program FOREIGN KEY (loyalty_program_id) REFERENCES loyalty_programs(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_program_status ON loyalty_rewards (tenant_id, loyalty_program_id, status, presentation_order)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customer_loyalty_account_projection (
        tenant_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        loyalty_program_id uuid NOT NULL,
        balance_units integer NOT NULL DEFAULT 0,
        last_transaction_id uuid,
        projection_version integer NOT NULL DEFAULT 0,
        recomputed_at timestamptz NOT NULL,
        CONSTRAINT pk_customer_loyalty_account_projection
          PRIMARY KEY (tenant_id, customer_id, loyalty_program_id),
        CONSTRAINT fk_clap_program FOREIGN KEY (loyalty_program_id) REFERENCES loyalty_programs(id)
      )
    `);
  }

  /**
   * Reverses only what a bootstrap could have created, and refuses to destroy
   * data: loyalty balances are customer-facing state that must never be
   * dropped silently. A freshly bootstrapped database has no rows, so the
   * normal rollback path stays available.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        table_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[
          'customer_loyalty_account_projection', 'loyalty_rewards', 'loyalty_programs'
        ]
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

    await queryRunner.query(
      'DROP TABLE IF EXISTS customer_loyalty_account_projection',
    );
    await queryRunner.query('DROP TABLE IF EXISTS loyalty_rewards');
    await queryRunner.query('DROP TABLE IF EXISTS loyalty_programs');

    await queryRunner.query('DROP TYPE IF EXISTS loyalty_rewards_status_enum');
    await queryRunner.query(
      'DROP TYPE IF EXISTS loyalty_rewards_reward_type_enum',
    );
    await queryRunner.query('DROP TYPE IF EXISTS loyalty_programs_status_enum');
    await queryRunner.query(
      'DROP TYPE IF EXISTS loyalty_programs_program_type_enum',
    );
  }
}
