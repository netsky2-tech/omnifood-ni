import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { GetDevicePrincipal } from './device-principal.decorator';
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

describe('GetDevicePrincipal decorator', () => {
  const factory = getParamDecoratorFactory(GetDevicePrincipal);

  const createMockContext = (
    request: Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  it('returns a valid frozen device principal', () => {
    const principal = createDeviceSyncPrincipal({
      credentialId: 'cred-1',
      tenantId: 'tenant-1',
      deviceId: 'pos-1',
      scopes: ['sync:push'],
      credentialVersion: 1,
    });
    const ctx = createMockContext({ devicePrincipal: principal });

    const resolved = factory(null, ctx);

    expect(resolved).toBe(principal);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it('throws UnauthorizedException when the principal is absent', () => {
    const ctx = createMockContext({});

    expect(() => factory(null, ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when principalType is not DEVICE_SYNC', () => {
    const ctx = createMockContext({
      devicePrincipal: {
        principalType: 'HUMAN',
        credentialId: 'cred-1',
        tenantId: 'tenant-1',
        deviceId: 'pos-1',
        scopes: ['sync:push'],
        credentialVersion: 1,
      },
    });

    expect(() => factory(null, ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when isDeviceSyncPrincipal rejects a malformed principal', () => {
    const ctx = createMockContext({
      devicePrincipal: {
        principalType: 'DEVICE_SYNC',
        credentialId: 'cred-1',
        tenantId: 'tenant-1',
        // missing deviceId and scopes
        credentialVersion: 1,
      },
    });

    expect(() => factory(null, ctx)).toThrow(UnauthorizedException);
  });
});
