import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap migration: creates the `cashier_sessions` table that the POS app
 * (Floor/SQLite) syncs to the backend.  The 1760000000000 migration expects
 * this table to already exist so it can ADD COLUMN tipo_modelo.
 *
 * Columns match the POS Floor entity definition.
 */
export class CreateBaseCashierSessions1759000000000
  implements MigrationInterface
{
  name = 'CreateBaseCashierSessions1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cashier_sessions (
        id varchar PRIMARY KEY,
        user_id varchar NOT NULL,
        terminal_id varchar NOT NULL,
        opened_at timestamptz NOT NULL,
        tipo_modelo varchar NOT NULL DEFAULT '',
        closed_at timestamptz,
        opening_balance_nio numeric(14,4) NOT NULL DEFAULT 0,
        opening_balance_usd numeric(14,4) NOT NULL DEFAULT 0,
        closing_counted_nio numeric(14,4),
        closing_counted_usd numeric(14,4),
        expected_nio numeric(14,4) NOT NULL DEFAULT 0,
        expected_usd numeric(14,4) NOT NULL DEFAULT 0,
        difference_nio numeric(14,4),
        difference_usd numeric(14,4),
        z_report_sequence integer,
        is_closed boolean NOT NULL DEFAULT false,
        supervisor_id varchar,
        notes text,
        sync_status varchar NOT NULL DEFAULT 'SYNCED',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS cashier_sessions');
  }
}
