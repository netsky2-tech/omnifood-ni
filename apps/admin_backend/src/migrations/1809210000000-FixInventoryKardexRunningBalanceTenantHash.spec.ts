import { type QueryRunner } from 'typeorm';
import { FixInventoryKardexRunningBalanceTenantHash1809210000000 } from './1809210000000-FixInventoryKardexRunningBalanceTenantHash';

describe('FixInventoryKardexRunningBalanceTenantHash1809210000000 (unit)', () => {
  const migration =
    new FixInventoryKardexRunningBalanceTenantHash1809210000000();

  it('reports the migration name required by the migrations ledger', () => {
    expect(migration.name).toBe(
      'FixInventoryKardexRunningBalanceTenantHash1809210000000',
    );
  });

  it('redefines the running-balance function hashing the tenant_id as text', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledTimes(1);

    const sql = query.mock.calls[0][0] as string;

    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION enforce_inventory_kardex_running_balance()',
    );
    expect(sql).toContain('RETURNS trigger');
    expect(sql).toContain('hashtext(NEW.tenant_id::text)');
    // No occurrence of the uuid-breaking bare form may survive in up().
    expect(sql).not.toMatch(/hashtext\(NEW\.tenant_id\)/);
    expect(sql).toContain('hashtext(NEW.insumo_id::text)');
    expect(sql).toContain('pg_advisory_xact_lock');
  });

  it('keeps the running-balance enforcement body identical to the 1774000000000 definition', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls[0][0] as string;

    expect(sql).toContain(
      'inventory_kardex balance invariant violated: stock_before % does not match latest stock_after % for tenant % insumo %',
    );
    expect(sql).toContain(
      'inventory_kardex balance invariant violated: stock_after % does not match running balance % for tenant % insumo %',
    );
    expect(sql).toContain(
      'WHERE tenant_id = NEW.tenant_id\n          AND insumo_id = NEW.insumo_id\n          ORDER BY id DESC\n          LIMIT 1',
    );
    expect(sql).toContain(
      'latest_stock_after := ROUND(COALESCE(latest_stock_after, 0.0000), 4);',
    );
    expect(sql).toContain(
      'expected_stock_after := ROUND(latest_stock_after + NEW.quantity, 4);',
    );
    expect(sql).toContain('$$ LANGUAGE plpgsql');
  });

  it('does not touch the trigger: the existing trigger keeps the same function', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls[0][0] as string;

    expect(sql).not.toContain('DROP TRIGGER');
    expect(sql).not.toContain('CREATE TRIGGER');
  });

  it('restores the prior uuid-breaking body on rollback', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledTimes(1);

    const sql = query.mock.calls[0][0] as string;

    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION enforce_inventory_kardex_running_balance()',
    );
    // The prior 1774000000000 body hashes the raw column value, which is the
    // exact statement that fails on a uuid column after the rebind.
    expect(sql).toMatch(/hashtext\(NEW\.tenant_id\)(?!\s*::)/);
    expect(sql).not.toContain('hashtext(NEW.tenant_id::text)');
    expect(sql).toContain('$$ LANGUAGE plpgsql');
  });
});
