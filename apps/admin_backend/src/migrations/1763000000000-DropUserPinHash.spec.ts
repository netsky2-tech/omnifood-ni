import type { QueryRunner } from 'typeorm';
import { DropUserPinHash1763000000000 } from './1763000000000-DropUserPinHash';

describe('DropUserPinHash1763000000000', () => {
  it('drops users.pin_hash on up migration', async () => {
    const query = jest.fn();
    const queryRunner = {
      query,
    } as unknown as QueryRunner;

    const migration = new DropUserPinHash1763000000000();
    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE users DROP COLUMN IF EXISTS pin_hash',
    );
  });

  it('restores users.pin_hash as nullable varchar on down migration', async () => {
    const query = jest.fn();
    const queryRunner = {
      query,
    } as unknown as QueryRunner;

    const migration = new DropUserPinHash1763000000000();
    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash varchar NULL',
    );
  });
});
