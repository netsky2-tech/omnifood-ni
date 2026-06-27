import { type QueryRunner } from 'typeorm';
import { EnforceInventoryKardexImmutability1773000000000 } from './1773000000000-EnforceInventoryKardexImmutability';

describe('EnforceInventoryKardexImmutability1773000000000 (unit)', () => {
  it('creates the immutability function and trigger on inventory_kardex', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new EnforceInventoryKardexImmutability1773000000000();

    await migration.up(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'CREATE OR REPLACE FUNCTION reject_inventory_kardex_mutation()',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'DROP TRIGGER IF EXISTS trg_inventory_kardex_immutable ON inventory_kardex',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('CREATE TRIGGER trg_inventory_kardex_immutable'),
    );
  });

  it('drops trigger and function on rollback', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new EnforceInventoryKardexImmutability1773000000000();

    await migration.down(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'DROP TRIGGER IF EXISTS trg_inventory_kardex_immutable ON inventory_kardex',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DROP FUNCTION IF EXISTS reject_inventory_kardex_mutation()',
    );
  });
});
