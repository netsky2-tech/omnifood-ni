import { type QueryRunner } from 'typeorm';
import { EnforceInventoryKardexRunningBalance1774000000000 } from './1774000000000-EnforceInventoryKardexRunningBalance';

describe('EnforceInventoryKardexRunningBalance1774000000000 (unit)', () => {
  it('validates the existing kardex history before installing the trigger', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new EnforceInventoryKardexRunningBalance1774000000000();

    await migration.up(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'Cannot install inventory_kardex running balance invariant',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('LAG(stock_after)'),
    );
  });

  it('creates the running-balance function with per-stream serialization and installs the INSERT trigger', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new EnforceInventoryKardexRunningBalance1774000000000();

    await migration.up(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'CREATE OR REPLACE FUNCTION enforce_inventory_kardex_running_balance()',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('pg_advisory_xact_lock'),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('hashtext(NEW.tenant_id)'),
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        'DROP TRIGGER IF EXISTS trg_inventory_kardex_running_balance ON inventory_kardex',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining(
        'CREATE TRIGGER trg_inventory_kardex_running_balance',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('BEFORE INSERT ON inventory_kardex'),
    );
  });

  it('drops the running-balance trigger and function on rollback', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new EnforceInventoryKardexRunningBalance1774000000000();

    await migration.down(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'DROP TRIGGER IF EXISTS trg_inventory_kardex_running_balance ON inventory_kardex',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DROP FUNCTION IF EXISTS enforce_inventory_kardex_running_balance()',
    );
  });
});
