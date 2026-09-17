import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { GetTenantId } from './tenant.decorator';
import { createDeviceSyncPrincipal } from '../../modules/identity/security/device-sync-principal';

function getParamDecoratorFactory(
  decorator: (...args: unknown[]) => ParameterDecorator,
) {
  class TestClass {
    testMethod(@decorator() _value: unknown) {
      return _value;
    }
  }
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestClass,
    'testMethod',
  ) as Record<string, { factory: (...args: unknown[]) => unknown }>;
  const key = Object.keys(metadata)[0];
  return metadata[key].factory;
}

describe('GetTenantId decorator', () => {
  const factory = getParamDecoratorFactory(GetTenantId);

  const createMockContext = (
    request: Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  it('extracts tenantId from devicePrincipal when request is authenticated via device sync', () => {
    const principal = createDeviceSyncPrincipal({
      credentialId: 'cred-1',
      tenantId: 'tenant-from-device',
      deviceId: 'pos-1',
      scopes: ['sync:push'],
      credentialVersion: 1,
    });
    const ctx = createMockContext({ devicePrincipal: principal });
    const tenantId = factory(null, ctx);
    expect(tenantId).toBe('tenant-from-device');
  });

  it('extracts tenant_id from user when request is authenticated via human AuthGuard', () => {
    const ctx = createMockContext({
      user: {
        tenant_id: 'tenant-from-user',
        sub: 'user-1',
        email: 'user@test.com',
        role: 'admin',
      },
    });
    const tenantId = factory(null, ctx);
    expect(tenantId).toBe('tenant-from-user');
  });

  it('returns undefined when neither devicePrincipal nor user is present', () => {
    const ctx = createMockContext({});
    const tenantId = factory(null, ctx);
    expect(tenantId).toBeUndefined();
  });
});
