import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ReportsController } from './reports.controller';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { UserRole } from '../../identity/entities/user.entity';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('ReportsController RBAC', () => {
  const jwtSecret = 'test-jwt-secret';
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [ReportsController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
        {
          provide: ConfigService,
          useValue: { get: () => jwtSecret },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (jwtService: JwtService, role: UserRole) =>
    jwtService.sign({ sub: 'user-1', role, tenant_id: 'tenant-1' });

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  it('returns 403 for CASHIER role on X report route', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/x')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
  });

  it('returns 403 for WAITER role on Z report route', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/z')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.WAITER)}`)
      .expect(403);
  });

  it('allows MANAGER on X report route', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/x')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);
  });
});
