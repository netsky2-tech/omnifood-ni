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

  it('maps additive security and session-family state without exposing it by default', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === User,
    );

    const securityVersion = columns.find(
      (column) => column.propertyName === 'security_version',
    );
    const refreshTokenFamilyId = columns.find(
      (column) => column.propertyName === 'refresh_token_family_id',
    );
    const refreshTokenRevokedAt = columns.find(
      (column) => column.propertyName === 'refresh_token_revoked_at',
    );
    const hashedRefreshToken = columns.find(
      (column) => column.propertyName === 'hashed_refresh_token',
    );

    expect(securityVersion?.options).toMatchObject({
      default: 1,
      select: false,
    });
    expect(refreshTokenFamilyId?.options).toMatchObject({
      type: 'uuid',
      nullable: true,
      select: false,
    });
    expect(refreshTokenRevokedAt?.options).toMatchObject({
      type: 'timestamptz',
      nullable: true,
      select: false,
    });
    expect(hashedRefreshToken?.options).toMatchObject({
      nullable: true,
      select: false,
    });
  });
});
