import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #425: `1774000000000-EnforceInventoryKardexRunningBalance` created
 * `enforce_inventory_kardex_running_balance()` while
 * `inventory_kardex.tenant_id` was varchar, calling `hashtext(NEW.tenant_id)`.
 * `1809070000000-RebindInventoryKardexTenantColumns` later converted the
 * column to uuid without redefining the function. PostgreSQL has no
 * `hashtext(uuid)` overload, so every INSERT reaches the BEFORE INSERT
 * trigger and fails before a row is appended.
 *
 * This migration redefines the function with `hashtext(NEW.tenant_id::text)`.
 * The body is otherwise identical to the 1774000000000 definition, and the
 * existing trigger (`trg_inventory_kardex_running_balance`) keeps pointing at
 * the same function name, so no trigger DDL is needed. `down()` restores the
 * prior (uuid-breaking) definition so the rollback boundary is exactly this
 * function body.
 */
export class FixInventoryKardexRunningBalanceTenantHash1809210000000 implements MigrationInterface {
  name = 'FixInventoryKardexRunningBalanceTenantHash1809210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_inventory_kardex_running_balance()
      RETURNS trigger
      AS $$
      DECLARE
        latest_stock_after NUMERIC(14,4);
        expected_stock_after NUMERIC(14,4);
      BEGIN
        PERFORM pg_advisory_xact_lock(
          hashtext(NEW.tenant_id::text),
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
