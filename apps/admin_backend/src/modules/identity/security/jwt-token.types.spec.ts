import {
  isAccessTokenPayload,
  isDeviceSyncAccessTokenPayload,
  DEVICE_SYNC_TOKEN_TYPE,
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DeviceSyncJwtAccessPayload,
} from './jwt-token.types';

describe('jwt-token.types device sync contract', () => {
  const issuer = 'omnifood-admin';
  const humanAudience = 'omnifood-pos';
  const deviceAudience = 'omnifood-device-sync';

  const validDevicePayload: DeviceSyncJwtAccessPayload = {
    sub: 'cred-123',
    principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
    token_type: DEVICE_SYNC_TOKEN_TYPE,
    tenant_id: 'tenant-abc',
    device_id: 'term-pos-01',
    scopes: ['sync:push', 'sync:pull'],
    credential_version: 1,
    jti: 'uuid-jti-123',
    iss: issuer,
    aud: deviceAudience,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  it('validates a correct device sync access token payload', () => {
    expect(
      isDeviceSyncAccessTokenPayload(
        validDevicePayload,
        issuer,
        deviceAudience,
      ),
    ).toBe(true);
  });

  it('rejects device payload if audience mismatches', () => {
    expect(
      isDeviceSyncAccessTokenPayload(validDevicePayload, issuer, humanAudience),
    ).toBe(false);
  });

  it('rejects device payload if issuer mismatches', () => {
    expect(
      isDeviceSyncAccessTokenPayload(
        validDevicePayload,
        'wrong-issuer',
        deviceAudience,
      ),
    ).toBe(false);
  });

  it('rejects device payload if required claims are missing or invalid', () => {
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, sub: '' },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, principal_type: 'human' },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, token_type: 'access' },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, tenant_id: '' },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, device_id: '' },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, scopes: [] },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, credential_version: 0 },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
    expect(
      isDeviceSyncAccessTokenPayload(
        { ...validDevicePayload, jti: '' },
        issuer,
        deviceAudience,
      ),
    ).toBe(false);
  });

  it('ensures human isAccessTokenPayload rejects device token payloads', () => {
    expect(
      isAccessTokenPayload(validDevicePayload, issuer, humanAudience),
    ).toBe(false);
    expect(
      isAccessTokenPayload(validDevicePayload, issuer, deviceAudience),
    ).toBe(false);
  });
});
