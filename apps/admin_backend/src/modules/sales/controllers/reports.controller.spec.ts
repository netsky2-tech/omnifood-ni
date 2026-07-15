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
  const jwtConfig = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin-backend',
    JWT_AUDIENCE: 'omnifood-pos',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256' as const,
  };
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: jwtConfig.JWT_SECRET,
          signOptions: {
            algorithm: jwtConfig.JWT_ALGORITHM,
            audience: jwtConfig.JWT_AUDIENCE,
            expiresIn: 3600,
            issuer: jwtConfig.JWT_ISSUER,
          },
        }),
      ],
      controllers: [ReportsController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => jwtConfig[key as keyof typeof jwtConfig],
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (jwtService: JwtService, role: UserRole): string =>
    jwtService.sign({
      sub: 'user-1',
      email: 'manager@omnifood.test',
      tenant_id: 'tenant-1',
      role,
      is_active: true,
      token_type: 'access',
      security_version: 1,
    });

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
