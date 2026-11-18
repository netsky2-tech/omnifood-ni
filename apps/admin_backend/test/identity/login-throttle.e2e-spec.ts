/**
 * Full-app regression contract for the login throttlers (issue #896).
 *
 * Batch 1's unit spec exercises ThrottlerGuard.canActivate directly with
 * mocked requests; this spec boots the real AppModule so the guard runs in
 * the same module-resolution context production uses, and pins the visible
 * budget: five failed logins pass, the sixth is throttled.
 *
 * The budget exercised here is the PRODUCTION number, not the looser dev
 * default: the non-production override (`LOGIN_THROTTLE_LIMIT`) is pinned to
 * the production value below, BEFORE anything loads the throttle config — the
 * throttler options and the controller `@Throttle` metadata are evaluated
 * once, at module-decoration time, so the env var cannot be set any later.
 * The override is ignored when NODE_ENV=production, so this cannot loosen
 * real deployments; the "production budget contract" block fails hard if
 * anyone raises the production constants or renames the override.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';

// Mirror of `LOGIN_THROTTLE_LIMIT_ENV` in auth-throttle.config.ts, pinned to
// the production budget. The contract test asserts the config still exports
// that exact name, so a rename fails here instead of silently un-pinning.
process.env.LOGIN_THROTTLE_LIMIT = '5';

// Full AppModule boots (TypeORM against the local Postgres) exceed Jest's 5s
// default. This only allows the boot to finish — the throttle assertions
// below are what decide pass/fail.
jest.setTimeout(120_000);

/**
 * The throttle config must be imported dynamically: a static import would
 * evaluate it at file-load time. Here the env var above is already in force,
 * so both login budgets come back at the pinned (production) number.
 */
const loadThrottleConfig = () =>
  import('../../src/modules/identity/security/auth-throttle.config');

/**
 * AppModule must be imported dynamically: a static import would hoist above
 * the env pin above and evaluate the throttle config at its dev default.
 */
const loadAppModule = () => import('../../src/core/app/app.module');

describe('login throttle over the full app (issue #896)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // A fresh app per test: the throttler storage is in-memory per instance,
    // so each test starts with empty buckets and pins one budget cleanly.
    const { AppModule } = await loadAppModule();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  afterAll(() => {
    delete process.env.LOGIN_THROTTLE_LIMIT;
  });

  it('allows five failed logins and throttles the sixth (per-IP budget)', async () => {
    const { LOGIN_PER_IP_LIMIT, PRODUCTION_LOGIN_PER_IP_LIMIT } =
      await loadThrottleConfig();
    // The runtime budget must be the production number this contract pins.
    expect(LOGIN_PER_IP_LIMIT).toBe(PRODUCTION_LOGIN_PER_IP_LIMIT);

    const statuses: number[] = [];
    for (let i = 1; i <= LOGIN_PER_IP_LIMIT + 2; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/identity/login')
        .send({
          // A distinct identity per attempt keeps every per-account bucket
          // far from its budget, so only the shared per-IP budget can trip.
          email: `full-app-throttle-ip-${i}@invalid.nhilos`,
          pass: 'wrongpass',
          tenantSlug: 'nonexistent-probe',
        });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, LOGIN_PER_IP_LIMIT)).toEqual(
      new Array(LOGIN_PER_IP_LIMIT).fill(401),
    );
    expect(statuses[LOGIN_PER_IP_LIMIT]).toBe(429);
    expect(statuses[LOGIN_PER_IP_LIMIT + 1]).toBe(429);
  });

  it('allows five repeated failures for one account and throttles the sixth (per-account budget)', async () => {
    const { LOGIN_PER_ACCOUNT_LIMIT, PRODUCTION_LOGIN_PER_ACCOUNT_LIMIT } =
      await loadThrottleConfig();
    // The runtime budget must be the production number this contract pins.
    expect(LOGIN_PER_ACCOUNT_LIMIT).toBe(PRODUCTION_LOGIN_PER_ACCOUNT_LIMIT);

    const statuses: number[] = [];
    for (let i = 1; i <= LOGIN_PER_ACCOUNT_LIMIT + 2; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/identity/login')
        .send({
          email: 'full-app-throttle-account@invalid.nhilos',
          pass: 'wrongpass',
          tenantSlug: 'nonexistent-probe',
        });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, LOGIN_PER_ACCOUNT_LIMIT)).toEqual(
      new Array(LOGIN_PER_ACCOUNT_LIMIT).fill(401),
    );
    expect(statuses[LOGIN_PER_ACCOUNT_LIMIT]).toBe(429);
    expect(statuses[LOGIN_PER_ACCOUNT_LIMIT + 1]).toBe(429);
  });
});

describe('login throttle production budget contract (issue #896)', () => {
  it('pins the production login budget at five per IP and per account', async () => {
    const {
      LOGIN_THROTTLE_LIMIT_ENV,
      PRODUCTION_LOGIN_PER_IP_LIMIT,
      PRODUCTION_LOGIN_PER_ACCOUNT_LIMIT,
    } = await loadThrottleConfig();
    // This is the assertion that fails if anyone raises the production
    // budget to an unsafe number; the e2e tests above derive from these
    // constants, so this pin is what keeps the contract at five.
    expect(PRODUCTION_LOGIN_PER_IP_LIMIT).toBe(5);
    expect(PRODUCTION_LOGIN_PER_ACCOUNT_LIMIT).toBe(5);
    // The spec file pins this exact name; a rename would leave the e2e
    // budget unpinned, so fail here instead.
    expect(LOGIN_THROTTLE_LIMIT_ENV).toBe('LOGIN_THROTTLE_LIMIT');
  });

  it('ignores the override in production and honors it only outside production', async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    process.env.LOGIN_THROTTLE_LIMIT = '999';
    try {
      jest.resetModules();
      process.env.NODE_ENV = 'production';
      let config = await loadThrottleConfig();
      // Even with the override set, production stays at five.
      expect(config.LOGIN_PER_IP_LIMIT).toBe(5);
      expect(config.LOGIN_PER_ACCOUNT_LIMIT).toBe(5);

      jest.resetModules();
      process.env.NODE_ENV = 'test';
      config = await loadThrottleConfig();
      // Outside production the override is honored (this is how the e2e
      // tests above pin the budget without touching production).
      expect(config.LOGIN_PER_IP_LIMIT).toBe(999);
      expect(config.LOGIN_PER_ACCOUNT_LIMIT).toBe(999);

      // Ordinary local development keeps its looser default budget.
      delete process.env.LOGIN_THROTTLE_LIMIT;
      jest.resetModules();
      config = await loadThrottleConfig();
      expect(config.LOGIN_PER_IP_LIMIT).toBe(60);
      expect(config.LOGIN_PER_ACCOUNT_LIMIT).toBe(60);
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      delete process.env.LOGIN_THROTTLE_LIMIT;
    }
  });
});
