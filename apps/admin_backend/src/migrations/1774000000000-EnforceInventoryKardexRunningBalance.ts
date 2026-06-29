import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceInventoryKardexRunningBalance1774000000000 implements MigrationInterface {
  name = 'EnforceInventoryKardexRunningBalance1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        invalid_row RECORD;
      BEGIN
        WITH ordered_kardex AS (
          SELECT
            id,
            tenant_id,
            insumo_id,
            quantity,
            ROUND(stock_before::numeric, 4) AS stock_before,
            ROUND(stock_after::numeric, 4) AS stock_after,
            COALESCE(
              LAG(stock_after) OVER (
                PARTITION BY tenant_id, insumo_id
                ORDER BY id
              ),
              0.0000
            ) AS expected_stock_before
          FROM inventory_kardex
        )
        SELECT
          id,
          tenant_id,
          insumo_id,
          stock_before,
          expected_stock_before,
          stock_after,
          ROUND(expected_stock_before + quantity, 4) AS expected_stock_after
        INTO invalid_row
        FROM ordered_kardex
        WHERE stock_before <> expected_stock_before
          OR stock_after <> ROUND(expected_stock_before + quantity, 4)
        ORDER BY tenant_id, insumo_id, id
        LIMIT 1;

        IF invalid_row IS NOT NULL THEN
          RAISE EXCEPTION
            'Cannot install inventory_kardex running balance invariant: existing history is corrupt for tenant % insumo % kardex id % (stock_before %, expected %, stock_after %, expected %)',
            invalid_row.tenant_id,
            invalid_row.insumo_id,
            invalid_row.id,
            invalid_row.stock_before,
            invalid_row.expected_stock_before,
            invalid_row.stock_after,
            invalid_row.expected_stock_after;
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_inventory_kardex_running_balance()
      RETURNS trigger
      AS $$
      DECLARE
        latest_stock_after NUMERIC(14,4);
        expected_stock_after NUMERIC(14,4);
      BEGIN
        PERFORM pg_advisory_xact_lock(
          hashtext(NEW.tenant_id),
          hashtext(NEW.insumo_id::text)
        );

        SELECT stock_after
        INTO latest_stock_after
        FROM inventory_kardex
        WHERE tenant_id = NEW.tenant_id
          AND insumo_id = NEW.insumo_id
          ORDER BY id DESC
          LIMIT 1;

        latest_stock_after := ROUND(COALESCE(latest_stock_after, 0.0000), 4);
        expected_stock_after := ROUND(latest_stock_after + NEW.quantity, 4);

        IF ROUND(NEW.stock_before::numeric, 4) <> latest_stock_after THEN
          RAISE EXCEPTION
            'inventory_kardex balance invariant violated: stock_before % does not match latest stock_after % for tenant % insumo %',
            NEW.stock_before,
            latest_stock_after,
            NEW.tenant_id,
            NEW.insumo_id;
        END IF;

        IF ROUND(NEW.stock_after::numeric, 4) <> expected_stock_after THEN
          RAISE EXCEPTION
            'inventory_kardex balance invariant violated: stock_after % does not match running balance % for tenant % insumo %',
            NEW.stock_after,
            expected_stock_after,
            NEW.tenant_id,
            NEW.insumo_id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_inventory_kardex_running_balance ON inventory_kardex
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_inventory_kardex_running_balance
      BEFORE INSERT ON inventory_kardex
      FOR EACH ROW
      EXECUTE FUNCTION enforce_inventory_kardex_running_balance()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_inventory_kardex_running_balance ON inventory_kardex',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS enforce_inventory_kardex_running_balance()',
    );
  }
}
