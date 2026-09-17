import {
  createDeviceSyncPrincipal,
  DEVICE_SYNC_PRINCIPAL_TYPE,
  DeviceSyncPrincipal,
  isDeviceSyncPrincipal,
} from './device-sync-principal';

describe('DeviceSyncPrincipal', () => {
  it('creates an immutable DeviceSyncPrincipal with required contract', () => {
    const principal = createDeviceSyncPrincipal({
      credentialId: 'cred-123',
      tenantId: 'tenant-abc',
      deviceId: 'term-pos-01',
      scopes: ['sync:push', 'sync:pull'],
      credentialVersion: 1,
    });

    expect(principal.principalType).toBe(DEVICE_SYNC_PRINCIPAL_TYPE);
    expect(principal.principalType).toBe('DEVICE_SYNC');
    expect(principal.credentialId).toBe('cred-123');
    expect(principal.tenantId).toBe('tenant-abc');
    expect(principal.deviceId).toBe('term-pos-01');
    expect(principal.scopes).toEqual(['sync:push', 'sync:pull']);
    expect(principal.credentialVersion).toBe(1);
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.isFrozen(principal.scopes)).toBe(true);
  });

  it('validates principal structure and rejects non-principal objects', () => {
    const valid = createDeviceSyncPrincipal({
      credentialId: 'cred-123',
      tenantId: 'tenant-abc',
      deviceId: 'term-pos-01',
      scopes: ['sync:push'],
      credentialVersion: 1,
    });

    expect(isDeviceSyncPrincipal(valid)).toBe(true);
    expect(isDeviceSyncPrincipal(null)).toBe(false);
    expect(isDeviceSyncPrincipal({})).toBe(false);
    expect(isDeviceSyncPrincipal({ ...valid, principalType: 'HUMAN' })).toBe(
      false,
    );
    expect(isDeviceSyncPrincipal({ ...valid, credentialVersion: 0 })).toBe(
      false,
    );
  });

  it('does NOT contain UserRole, permissions, cashier, branch, impersonation or human fields', () => {
    const principal: DeviceSyncPrincipal = createDeviceSyncPrincipal({
      credentialId: 'cred-123',
      tenantId: 'tenant-abc',
      deviceId: 'term-pos-01',
      scopes: ['sync:push', 'sync:pull'],
      credentialVersion: 1,
    });

    const forbiddenKeys = [
      'role',
      'roles',
      'userRole',
      'user_role',
      'permissions',
      'permission',
      'cashier',
      'cashierId',
      'branch',
      'branchId',
      'impersonation',
      'impersonatedBy',
      'userId',
      'user_id',
      'email',
    ];

    for (const key of forbiddenKeys) {
      expect(
        (principal as unknown as Record<string, unknown>)[key],
      ).toBeUndefined();
      expect(key in principal).toBe(false);
    }

    const principalKeys = Object.keys(principal).sort();
    expect(principalKeys).toEqual([
      'credentialId',
      'credentialVersion',
      'deviceId',
      'principalType',
      'scopes',
      'tenantId',
    ]);
  });
});
