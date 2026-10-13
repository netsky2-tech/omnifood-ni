/**
 * Full-app regression contract for the login throttlers (issue #896).
 *
 * Batch 1's unit spec exercises ThrottlerGuard.canActivate directly with
 * mocked requests; this spec boots the real AppModule so the guard runs in
 * the same module-resolution context production uses, and pins the visible
 * budget: five failed logins pass, the sixth is throttled.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../src/core/app/app.module';

describe('login throttle over the full app (issue #896)', () => {
  let app: INestApplication<App>;
  let throttlerSpy: jest.SpiedFunction<
    typeof ThrottlerGuard.prototype.canActivate
  >;

  /** Diagnostic payload for CI failures: what the guard actually resolved. */
  const throttlerDiagnostics = (): string => {
    // Bracket access through Record: the throttlers member is protected on
    // the class, and TS2445 fires on dot access in CI's TS version even
    // through a cast (issue #896).
    const guard = app.get(ThrottlerGuard, {
      strict: false,
    }) as unknown as Record<string, unknown>;
    const resolved = Array.isArray(guard['throttlers'])
      ? guard['throttlers']
      : 'none';
    // Which guard instances actually ran canActivate, and with which
    // options — the failing environments show correct module options but
    // no throttling, so the executing instance is the open question.
    const calls = throttlerSpy?.mock.calls.length ?? -1;
    const instances = (throttlerSpy?.mock.instances ?? []).map(
      (instance) =>
        (
          instance as unknown as {
            throttlers?: Array<{ name?: string }>;
          }
        ).throttlers?.map((t) => t.name) ?? 'unknown-instance',
    );
    return JSON.stringify({
      appGuardOptions: resolved,
      canActivateCalls: calls,
      canActivateInstances: instances,
    });
  };

  beforeEach(async () => {
    // A fresh app per test: the throttler storage is in-memory per instance,
    // so each test starts with empty buckets and pins one budget cleanly.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    // Record every canActivate invocation with its executing `this`, so a
    // failing run reveals whether the guard ran at all and with which
    // module's options (issue #896).
    throttlerSpy = jest.spyOn(ThrottlerGuard.prototype, 'canActivate');
  });

  it('allows five failed logins and throttles the sixth (per-IP budget)', async () => {
    const statuses: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/identity/login')
        .send({
          email: `full-app-throttle-$i@invalid.nhilos`,
          pass: 'wrongpass',
          tenantSlug: 'nonexistent-probe',
        });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    if (statuses[5] !== 429 || statuses[6] !== 429) {
      // The assertion message carries the guard's resolved throttler
      // options: the CI environment fails here while local passes, and
      // this is the only evidence channel that survives the runner.
      throw new Error(
        `login throttle budget violated (issue #896): statuses=${statuses.join(',')} diagnostics=${throttlerDiagnostics()}`,
      );
    }
  });

  it('throttles repeated failures for one account (per-account budget)', async () => {
    const statuses: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/identity/login')
        .send({
          email: 'full-app-throttle-account@invalid.nhilos',
          pass: 'wrongpass',
          tenantSlug: 'nonexistent-probe',
        });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    if (statuses[5] !== 429 || statuses[6] !== 429) {
      // The assertion message carries the guard's resolved throttler
      // options: the CI environment fails here while local passes, and
      // this is the only evidence channel that survives the runner.
      throw new Error(
        `login throttle budget violated (issue #896): statuses=${statuses.join(',')} diagnostics=${throttlerDiagnostics()}`,
      );
    }
  });

  afterEach(async () => {
    throttlerSpy?.mockRestore();
    await app?.close();
  });
});
