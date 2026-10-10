import type { QueryRunner } from 'typeorm';
import { AddQuantityToInvoiceItemModifiers1809640000000 } from './1809640000000-AddQuantityToInvoiceItemModifiers';

describe('AddQuantityToInvoiceItemModifiers1809640000000', () => {
  it('adds invoice_item_modifiers.quantity as NOT NULL DEFAULT 1 on up migration', async () => {
    const query = jest.fn();
    const queryRunner = {
      query,
    } as unknown as QueryRunner;

    const migration = new AddQuantityToInvoiceItemModifiers1809640000000();
    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE invoice_item_modifiers ' +
        'ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1',
    );
  });

  it('drops invoice_item_modifiers.quantity on down migration', async () => {
    const query = jest.fn();
    const queryRunner = {
      query,
    } as unknown as QueryRunner;

    const migration = new AddQuantityToInvoiceItemModifiers1809640000000();
    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE invoice_item_modifiers DROP COLUMN IF EXISTS quantity',
    );
  });
});
