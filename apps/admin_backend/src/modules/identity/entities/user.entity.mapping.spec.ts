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

  it('maps attempt_reset_generation as a plain non-null bigint defaulting to 0 without the OHAC transformer', () => {
    const column = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === User &&
        column.propertyName === 'attempt_reset_generation',
    );

    expect(column).toBeDefined();
    // The column name is carried by the snake_case property name, matching
    // the migration's `attempt_reset_generation bigint NOT NULL DEFAULT 0`.
    expect(column?.options.name ?? column?.propertyName).toBe(
      'attempt_reset_generation',
    );
    // TypeORM leaves nullable undefined when it is the default false, so the
    // nullability is asserted on the normalized value, as the OHAC spec does.
    expect(column?.options.type).toBe('bigint');
    expect(column?.options.nullable ?? false).toBe(false);
    expect(column?.options.default).toBe(0);
    // Non-OHAC entities deliberately do not use the OHAC BIGINT_STRING
    // transformer; the non-negative CHECK stays migration-owned.
    expect(column?.options.transformer).toBeUndefined();
  });
});
