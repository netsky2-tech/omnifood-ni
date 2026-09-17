export const DEVICE_SYNC_PRINCIPAL_TYPE = 'DEVICE_SYNC' as const;

export interface DeviceSyncPrincipal {
  readonly principalType: typeof DEVICE_SYNC_PRINCIPAL_TYPE;
  readonly credentialId: string;
  readonly tenantId: string;
  readonly deviceId: string;
  readonly scopes: readonly string[];
  readonly credentialVersion: number;
}

export const createDeviceSyncPrincipal = (params: {
  credentialId: string;
  tenantId: string;
  deviceId: string;
  scopes: readonly string[];
  credentialVersion: number;
}): DeviceSyncPrincipal => {
  return Object.freeze({
    principalType: DEVICE_SYNC_PRINCIPAL_TYPE,
    credentialId: params.credentialId,
    tenantId: params.tenantId,
    deviceId: params.deviceId,
    scopes: Object.freeze([...params.scopes]),
    credentialVersion: params.credentialVersion,
  });
};

export const isDeviceSyncPrincipal = (
  value: unknown,
): value is DeviceSyncPrincipal => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.principalType === DEVICE_SYNC_PRINCIPAL_TYPE &&
    typeof candidate.credentialId === 'string' &&
    candidate.credentialId.trim().length > 0 &&
    typeof candidate.tenantId === 'string' &&
    candidate.tenantId.trim().length > 0 &&
    typeof candidate.deviceId === 'string' &&
    candidate.deviceId.trim().length > 0 &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.length > 0 &&
    candidate.scopes.every((scope) => typeof scope === 'string') &&
    Number.isInteger(candidate.credentialVersion) &&
    (candidate.credentialVersion as number) >= 1
  );
};
