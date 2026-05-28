import { getMetadataArgsStorage } from 'typeorm';
import { User, UserRole } from './user.entity';

describe('User Entity Mapping', () => {
  it('declares role enum values expected by auth scope checks', () => {
    expect(Object.values(UserRole)).toEqual(
      expect.arrayContaining(['OWNER', 'MANAGER', 'CASHIER', 'WAITER']),
    );
  });

  it('does not map legacy pin_hash column in user entity anymore', () => {
    const columns = getMetadataArgsStorage().columns;
    const pinHashColumn = columns.find(
      (column) => column.target === User && column.propertyName === 'pin_hash',
    );

    expect(pinHashColumn).toBeUndefined();
  });
});
