import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoyaltyV1ColumnsToCustomerPointTransactions1795000000000 implements MigrationInterface {
  name = 'AddLoyaltyV1ColumnsToCustomerPointTransactions1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_point_transactions
        ADD COLUMN IF NOT EXISTS loyalty_program_id uuid,
        ADD COLUMN IF NOT EXISTS ticket_id varchar,
        ADD COLUMN IF NOT EXISTS reward_id uuid,
        ADD COLUMN IF NOT EXISTS transaction_type varchar,
        ADD COLUMN IF NOT EXISTS units int,
        ADD COLUMN IF NOT EXISTS reversal_of_transaction_id uuid,
        ADD COLUMN IF NOT EXISTS idempotency_key varchar,
        ADD COLUMN IF NOT EXISTS source_event_id varchar,
        ADD COLUMN IF NOT EXISTS actor_user_id uuid,
        ADD COLUMN IF NOT EXISTS branch_id varchar,
        ADD COLUMN IF NOT EXISTS terminal_id varchar,
        ADD COLUMN IF NOT EXISTS program_version int,
        ADD COLUMN IF NOT EXISTS reward_version int,
        ADD COLUMN IF NOT EXISTS commercial_snapshot jsonb,
        ADD COLUMN IF NOT EXISTS origin varchar,
        ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
        ADD COLUMN IF NOT EXISTS recorded_at timestamptz,
        ADD COLUMN IF NOT EXISTS legacy_imported boolean DEFAULT false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_loyalty_tx_tenant_program
        ON customer_point_transactions (tenant_id, loyalty_program_id)
        WHERE loyalty_program_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_point_transactions
        DROP COLUMN IF EXISTS loyalty_program_id,
        DROP COLUMN IF EXISTS ticket_id,
        DROP COLUMN IF EXISTS reward_id,
        DROP COLUMN IF EXISTS transaction_type,
        DROP COLUMN IF EXISTS units,
        DROP COLUMN IF EXISTS reversal_of_transaction_id,
        DROP COLUMN IF EXISTS idempotency_key,
        DROP COLUMN IF EXISTS source_event_id,
        DROP COLUMN IF EXISTS actor_user_id,
        DROP COLUMN IF EXISTS branch_id,
        DROP COLUMN IF EXISTS terminal_id,
        DROP COLUMN IF EXISTS program_version,
        DROP COLUMN IF EXISTS reward_version,
        DROP COLUMN IF EXISTS commercial_snapshot,
        DROP COLUMN IF EXISTS origin,
        DROP COLUMN IF EXISTS occurred_at,
        DROP COLUMN IF EXISTS recorded_at,
        DROP COLUMN IF EXISTS legacy_imported;
    `);
  }
}
