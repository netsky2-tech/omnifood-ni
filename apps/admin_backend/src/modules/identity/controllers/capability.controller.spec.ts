import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { CapabilityController } from './capability.controller';
import { TenantCapabilityService } from '../services/tenant-capability.service';
import { AuthoritativeCurrentUserGuard } from '../guards/authoritative-current-user.guard';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';

describe('CapabilityController', () => {
  const capabilityService = {
    current: jest.fn(),
    append: jest.fn(),
  };
  let controller: CapabilityController;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    capabilityService.current.mockReset();
    capabilityService.append.mockReset();
    const module = await Test.createTestingModule({
      controllers: [CapabilityController],
      providers: [
        { provide: TenantCapabilityService, useValue: capabilityService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthoritativeCurrentUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(CapabilityController);
  });

  afterEach(() => jest.useRealTimers());

  it('returns the tenant-bound implicit v2 contract with server freshness metadata', async () => {
    capabilityService.current.mockResolvedValue({
      version: 'v2',
      revision: 0,
      contractVersion: 1,
    });

    await expect(controller.getAuditCapability('tenant-A')).resolves.toEqual({
      tenant_id: 'tenant-A',
      active_version: 'v2',
      contract_version: 1,
      revision: 0,
      server_issued_at: '2026-07-23T12:00:00.000Z',
      server_fetched_at: '2026-07-23T12:00:00.000Z',
      server_expires_at: '2026-07-24T12:00:00.000Z',
    });
    expect(capabilityService.current).toHaveBeenCalledWith('tenant-A');
  });

  it('appends only the verified tenant and actor while returning the new contract', async () => {
    capabilityService.append.mockResolvedValue({
      version: 'v3-jcs-rfc8785',
      previousVersion: 'v2',
      revision: 4,
      contractVersion: 1,
    });

    await expect(
      controller.activateAuditCapability(
        'tenant-A',
        { new_version: 'v3-jcs-rfc8785', reason: 'approved rollout' },
        { user: { sub: 'owner-A' } },
      ),
    ).resolves.toMatchObject({
      tenant_id: 'tenant-A',
      active_version: 'v3-jcs-rfc8785',
      revision: 4,
      previous_version: 'v2',
    });
    expect(capabilityService.append).toHaveBeenCalledWith({
      tenantId: 'tenant-A',
      actorUserId: 'owner-A',
      version: 'v3-jcs-rfc8785',
      reason: 'approved rollout',
    });
  });

  it('fails closed when persisted capability state contains an unsupported version', async () => {
    capabilityService.current.mockResolvedValue({ version: 'v9', revision: 7 });

    await expect(controller.getAuditCapability('tenant-A')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails closed when persisted contract version is unsupported', async () => {
    capabilityService.current.mockResolvedValue({
      version: 'v2',
      revision: 7,
      contractVersion: 99,
    });

    await expect(controller.getAuditCapability('tenant-A')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
