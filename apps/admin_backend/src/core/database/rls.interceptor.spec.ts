import {
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { TenantInterceptor } from './rls.interceptor';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;

  beforeEach(() => {
    interceptor = new TenantInterceptor();
  });

  const createMockContext = (
    request: Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  const mockCallHandler: CallHandler = {
    handle: jest.fn().mockReturnValue(of('response')),
  };

  it('allows request when user.tenant_id is present', (done) => {
    const ctx = createMockContext({ user: { tenant_id: 'tenant-user-1' } });
    interceptor.intercept(ctx, mockCallHandler).subscribe({
      next: (val) => {
        expect(val).toBe('response');
        done();
      },
    });
  });

  it('allows request when devicePrincipal.tenantId is present', (done) => {
    const ctx = createMockContext({
      devicePrincipal: { tenantId: 'tenant-device-1' },
    });
    interceptor.intercept(ctx, mockCallHandler).subscribe({
      next: (val) => {
        expect(val).toBe('response');
        done();
      },
    });
  });

  it('throws UnauthorizedException when neither is present', () => {
    const ctx = createMockContext({});
    expect(() => interceptor.intercept(ctx, mockCallHandler)).toThrow(
      UnauthorizedException,
    );
  });
});
