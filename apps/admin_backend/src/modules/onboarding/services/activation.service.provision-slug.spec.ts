import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ActivationService } from './activation.service';
import {
  ActivationAttemptStatus,
} from '../entities/activation-attempt.entity';
import type {
  DeviceSyncCredentialService,
} from '../../identity/services/device-sync-credential.service';

/**
 * Unit contract for the OD-03 provisioning response (issue #556 slice 11):
 * the device-sync-credential provisioning/confirm responses expose the
 * PERSISTED tenant slug (key `slug`) so the POS can store it as
 * TenantConfig.tenantSlug for the stage-2 cloud login context.
 */

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const passingAttempt = {
  id: 'attempt-1',
  tenantId: TENANT_ID,
  status: ActivationAttemptStatus.PASS,
  trustedTerminalId: 'Q802024120001',
  candidateTerminalId: 'Q802024120001',
};

const credentialResult = {
  credential: {
    id: 'credential-1',
    tenantId: TENANT_ID,
    scopes: ['device.sync.v1'],
    version: 1,
    expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'PENDING',
  },
  renewalSecret: 'renewal-secret',
};

const buildService = (options: {
  tenantSlugRows: unknown;
  attempt?: typeof passingAttempt | null;
}) => {
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest
        .fn()
        .mockResolvedValue(options.attempt === undefined ? passingAttempt : options.attempt),
    }),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((callback: (manager: EntityManager) => unknown) =>
      callback(manager),
    ),
    query: jest.fn().mockResolvedValue(options.tenantSlugRows),
  };
  const deviceSyncCredentialService = {
    provisionCredential: jest.fn().mockResolvedValue(credentialResult),
    confirmCredential: jest.fn().mockResolvedValue(credentialResult.credential),
  };

  const service = new ActivationService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
    undefined,
    deviceSyncCredentialService as unknown as DeviceSyncCredentialService,
    undefined,
  );

  return { service, dataSource, deviceSyncCredentialService };
};

describe('ActivationService provisioning slug exposure (issue #556 slice 11)', () => {
  it('includes the persisted slug in the provision response', async () => {
    const { service, dataSource } = buildService({
      tenantSlugRows: [{ slug: 'provisioned-slug' }],
    });

    const result = await service.provisionDeviceCredential(
      TENANT_ID,
      'attempt-1',
    );

    expect(result.slug).toBe('provisioned-slug');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM tenants'),
      [TENANT_ID],
    );
  });

  it('includes the persisted slug in the confirm response', async () => {
    const { service } = buildService({
      tenantSlugRows: [{ slug: 'provisioned-slug' }],
    });

    const result = await service.confirmDeviceCredential(TENANT_ID, 'attempt-1', {
      credentialId: 'credential-1',
      deviceId: 'Q802024120001',
      credentialVersion: 1,
      renewalSecret: 'renewal-secret',
    });

    expect(result.slug).toBe('provisioned-slug');
  });

  it('fails closed when the tenant has no persisted slug', async () => {
    const { service } = buildService({ tenantSlugRows: [] });

    await expect(
      service.provisionDeviceCredential(TENANT_ID, 'attempt-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
