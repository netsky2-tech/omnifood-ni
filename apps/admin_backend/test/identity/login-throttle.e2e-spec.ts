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

  beforeEach(async () => {
    // A fresh app per test: the throttler storage is in-memory per instance,
    // so each test starts with empty buckets and pins one budget cleanly.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
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
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
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
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
  });

  afterEach(async () => {
    await app?.close();
  });
});
