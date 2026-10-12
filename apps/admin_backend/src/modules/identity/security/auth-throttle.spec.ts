import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { AuthController } from '../controllers/auth.controller';
import {
  LOGIN_PER_ACCOUNT_LIMIT,
  REFRESH_PER_IP_LIMIT,
  accountTracker,
  authThrottlers,
} from './auth-throttle.config';

const CALLER = 'ThrottlerException: Too Many Requests';

function loginContext(ip: string, email: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        method: 'POST',
        path: '/api/identity/login',
        body: email === undefined ? {} : { email, pass: 'irrelevant', tenantSlug: 'acme' },
      }),
      getResponse: () => ({}),
    }),
    getClass: () => AuthController,
    getHandler: () => AuthController.prototype.login,
  } as unknown as ExecutionContext;
}

function refreshContext(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        method: 'POST',
        path: '/api/identity/refresh',
        body: { userId: 'u', refreshToken: 'r', tenantSlug: 'acme' },
      }),
      getResponse: () => ({}),
    }),
    getClass: () => AuthController,
    getHandler: () => AuthController.prototype.refresh,
  } as unknown as ExecutionContext;
}

async function buildGuard() {
  // AuthController is deliberately NOT registered as a controller here: its
  // own guards (AuthGuard/RolesGuard) would demand JwtService wiring. The
  // ThrottlerGuard only needs the @Throttle metadata, which Reflector reads
  // statically from the real decorated class and method below.
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot(authThrottlers())],
    providers: [ThrottlerGuard],
  }).compile();

  const guard = await moduleRef.resolve(ThrottlerGuard);
  // Outside a running app the lifecycle hook that loads the named throttlers
  // never fires; invoke it explicitly so the guard is fully initialized.
  await guard.onModuleInit();
  return { guard, moduleRef };
}

async function expectThrottled(
  guard: ThrottlerGuard,
  context: ExecutionContext,
  allowedCalls: number,
) {
  for (let i = 0; i < allowedCalls; i++) {
    await expect(guard.canActivate(context)).resolves.toBe(true);
  }
  await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);
  await expect(guard.canActivate(context)).rejects.toThrow(CALLER);
}

describe('accountTracker', () => {
  it('keys on tenant slug and lowercased email', () => {
    expect(
      accountTracker({
        body: { email: '  Owner@Example.COM ', tenantSlug: ' Acme ' },
      }),
    ).toBe('acme|owner@example.com');
  });

  it('never includes the password in the tracker key', () => {
    const key = accountTracker({
      body: { email: 'a@b.com', tenantSlug: 't', pass: 'secret-value' },
    });
    expect(key).not.toContain('secret-value');
  });

  it('falls back to the client IP when the body carries no identity', () => {
    expect(accountTracker({ ip: '10.0.0.1', body: {} })).toBe('10.0.0.1');
    expect(accountTracker({ ip: '10.0.0.1', body: undefined })).toBe(
      '10.0.0.1',
    );
  });
});

describe('auth throttle limits (ThrottlerGuard over real route metadata)', () => {
  it(`allows ${LOGIN_PER_ACCOUNT_LIMIT} logins then throttles the same account across rotating IPs`, async () => {
    const { guard } = await buildGuard();
    for (let i = 0; i < LOGIN_PER_ACCOUNT_LIMIT; i++) {
      const ctx = loginContext(`10.0.0.${i + 1}`, 'owner@example.com');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
    // Same account, yet another fresh IP: the account bucket must trip.
    const next = loginContext('10.0.0.99', 'owner@example.com');
    await expect(guard.canActivate(next)).rejects.toThrow(ThrottlerException);
  });

  it('keeps per-account buckets isolated for different emails behind one IP', async () => {
    const { guard } = await buildGuard();
    // Two distinct accounts, 2 calls each: neither bucket trips.
    await expect(
      guard.canActivate(loginContext('10.0.0.1', 'a@example.com')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(loginContext('10.0.0.1', 'a@example.com')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(loginContext('10.0.0.1', 'b@example.com')),
    ).resolves.toBe(true);
  });

  it('throttles logins from one IP after the per-IP budget is spent', async () => {
    const { guard } = await buildGuard();
    await expectThrottled(
      guard,
      loginContext('10.1.0.1', 'a@example.com'),
      LOGIN_PER_ACCOUNT_LIMIT,
    );
  });

  it(`allows ${REFRESH_PER_IP_LIMIT} refreshes per IP then throttles`, async () => {
    const { guard } = await buildGuard();
    await expectThrottled(
      guard,
      refreshContext('10.2.0.1'),
      REFRESH_PER_IP_LIMIT,
    );
  });
});
