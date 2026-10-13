/**
 * THROWAWAY diagnostic (not for commit): does the login route in the full
 * app throttle at the AUTH limits (429 at #6) or at the SALES report limits
 * (429 at #31 — wrong ThrottlerModule instance winning resolution)?
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/core/app/app.module';

describe('diagnostic: which throttle budget guards login', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('probes 35 logins to reveal the effective limit', async () => {
    const statuses: number[] = [];
    for (let i = 1; i <= 35; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/identity/login')
        .send({
          email: `budget-$i@invalid.nhilos`,
          pass: 'wrongpass',
          tenantSlug: 'nonexistent-probe',
        });
      statuses.push(res.status);
    }
    // eslint-disable-next-line no-console
    console.log('STATUS SEQUENCE:', statuses.join(','));
    const first429 = statuses.indexOf(429);
    // eslint-disable-next-line no-console
    console.log(`FIRST 429 AT REQUEST: ${first429 + 1}`);
  });

  afterAll(async () => {
    await app?.close();
  });
});
