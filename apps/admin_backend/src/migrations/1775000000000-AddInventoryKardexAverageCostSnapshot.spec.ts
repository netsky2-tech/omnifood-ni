import { AddInventoryKardexAverageCostSnapshot1775000000000 } from './1775000000000-AddInventoryKardexAverageCostSnapshot';

describe('AddInventoryKardexAverageCostSnapshot1775000000000', () => {
  it('adds and removes the average_cost_after_nio snapshot column', async () => {
    const migration = new AddInventoryKardexAverageCostSnapshot1775000000000();
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };

    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'ADD COLUMN IF NOT EXISTS average_cost_after_nio NUMERIC(14,4)',
      ),
    );

    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'ALTER TABLE inventory_kardex DROP COLUMN IF EXISTS average_cost_after_nio',
    );
  });
});
