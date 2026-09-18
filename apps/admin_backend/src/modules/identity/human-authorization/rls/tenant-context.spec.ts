import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { bindRlsTenantContext, requireTenantId } from './tenant-context';

describe('bindRlsTenantContext', () => {
  let query: jest.Mock<Promise<unknown>, unknown[]>;
  let manager: EntityManager;

  beforeEach(() => {
    query = jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue([]);
    manager = { query } as unknown as EntityManager;
  });

  it('issues the exact set_config statement with the tenant bound as a parameter', async () => {
    await bindRlsTenantContext(manager, 'tenant-1');

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-1'],
    );
  });

  it('binds the trimmed tenant value and never interpolates it', async () => {
    const hostileTenant = "  t'; DROP TABLE users; --  ";

    await bindRlsTenantContext(manager, hostileTenant);

    const [statement, params] = query.mock.calls[0];
    expect(statement).toBe("SELECT set_config('app.tenant_id', $1, true)");
    expect(statement).not.toContain(hostileTenant.trim());
    expect(params).toEqual([hostileTenant.trim()]);
  });

  it.each([undefined, null, '', '   ', 42])(
    'rejects tenant id %p without issuing any statement',
    async (badTenant) => {
      await expect(bindRlsTenantContext(manager, badTenant)).rejects.toThrow(
        BadRequestException,
      );
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('propagates a binding failure instead of swallowing it', async () => {
    query.mockRejectedValue(new Error('set_config failed'));

    await expect(bindRlsTenantContext(manager, 'tenant-1')).rejects.toThrow(
      'set_config failed',
    );
  });

  it('exposes the same validation the binding uses, trimmed on success', () => {
    expect(() => requireTenantId('   ')).toThrow(BadRequestException);
    expect(requireTenantId('  tenant-1  ')).toBe('tenant-1');
  });
});
