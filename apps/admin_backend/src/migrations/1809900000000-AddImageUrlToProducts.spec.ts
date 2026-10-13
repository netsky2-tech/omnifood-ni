import type { QueryRunner } from 'typeorm';
import { AddImageUrlToProducts1809900000000 } from './1809900000000-AddImageUrlToProducts';

describe('AddImageUrlToProducts1809900000000', () => {
  it('adds products.image_url as nullable text on up migration', async () => {
    const query = jest.fn();
    const queryRunner = {
      query,
    } as unknown as QueryRunner;

    const migration = new AddImageUrlToProducts1809900000000();
    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text NULL',
    );
  });

  it('drops products.image_url on down migration', async () => {
    const query = jest.fn();
    const queryRunner = {
      query,
    } as unknown as QueryRunner;

    const migration = new AddImageUrlToProducts1809900000000();
    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE products DROP COLUMN IF EXISTS image_url',
    );
  });
});
