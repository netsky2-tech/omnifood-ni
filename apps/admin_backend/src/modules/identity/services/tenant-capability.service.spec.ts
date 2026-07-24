import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TenantCapabilityService } from './tenant-capability.service';

describe('TenantCapabilityService', () => {
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
  };
  let service: TenantCapabilityService;

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const method of [
      'connect',
      'startTransaction',
      'commitTransaction',
      'rollbackTransaction',
      'release',
    ] as const)
      runner[method].mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        TenantCapabilityService,
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn(() => runner) },
        },
      ],
    }).compile();
    service = module.get(TenantCapabilityService);
  });

  it('defaults to v2 without history and appends the next tenant-local revision for an OWNER', async () => {
    let reads = 0;
    runner.query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.startsWith('SELECT new_version')
          ? reads++ === 0
            ? []
            : [{ version: 'v2', revision: 1 }]
          : sql.startsWith('SELECT id FROM users')
            ? [{ id: 'owner-a' }]
            : undefined,
      ),
    );
    await expect(service.current('tenant-a')).resolves.toEqual({
      version: 'v2',
      revision: 0,
    });
    await expect(
      service.append({
        tenantId: 'tenant-a',
        actorUserId: 'owner-a',
        version: 'v3-jcs-rfc8785',
        reason: 'approved rollout',
      }),
    ).resolves.toMatchObject({ revision: 2, previousVersion: 'v2' });
    expect(runner.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-a'],
    );
    expect(runner.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['tenant-a'],
    );
    const calls = runner.query.mock.calls.map(([sql]) => String(sql));
    expect(
      calls.indexOf('SELECT pg_advisory_xact_lock(hashtext($1))'),
    ).toBeLessThan(
      calls.lastIndexOf(
        'SELECT new_version AS version, revision FROM tenant_capability_event ORDER BY revision DESC LIMIT 1',
      ),
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_capability_event'),
      ['tenant-a', 'owner-a', 'v2', 'v3-jcs-rfc8785', 'approved rollout', 2],
    );
  });

  it('rejects an actor absent from the authoritative tenant-OWNER query', async () => {
    runner.query.mockResolvedValue([]);
    await expect(
      service.append({
        tenantId: 'tenant-a',
        actorUserId: 'manager-a',
        version: 'v2',
        reason: 'no authority',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM users'),
      ['manager-a', 'tenant-a', 'OWNER'],
    );
  });

  it('releases without rolling back when transaction start fails', async () => {
    runner.startTransaction.mockRejectedValueOnce(new Error('start failed'));
    await expect(service.current('tenant-a')).rejects.toThrow('start failed');
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
});
