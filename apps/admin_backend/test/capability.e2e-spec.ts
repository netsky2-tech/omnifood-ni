import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { TenantInterceptor } from '../src/core/database/rls.interceptor';
import { CapabilityController } from '../src/modules/identity/controllers/capability.controller';
import { UserRole } from '../src/modules/identity/entities/user.entity';
import { AuthoritativeCurrentUserGuard } from '../src/modules/identity/guards/authoritative-current-user.guard';
import { AuthGuard } from '../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../src/modules/identity/services/current-user-authorization.service';
import { TenantCapabilityService } from '../src/modules/identity/services/tenant-capability.service';
import {
  createIdentityJwtConfigProvider,
  signIdentityJwtAccessToken,
} from './support/identity-jwt-test.fixture';
describe('audit capability contract (e2e)', () => {
  let app: INestApplication<App>;
  const capabilityService = { current: jest.fn(), append: jest.fn() };
  const authorize = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CapabilityController],
      providers: [
        JwtService,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        TenantInterceptor,
        createIdentityJwtConfigProvider(),
        { provide: TenantCapabilityService, useValue: capabilityService },
        { provide: CurrentUserAuthorizationService, useValue: { authorize } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  beforeEach(() => {
    capabilityService.current
      .mockReset()
      .mockResolvedValue({ version: 'v2', revision: 0, contractVersion: 1 });
    authorize
      .mockReset()
      .mockImplementation(
        (token: {
          email: string;
          tenant_id: string;
          role: UserRole;
          security_version: number;
        }) => ({
          email: token.email,
          tenant_id: token.tenant_id,
          role: token.role,
          is_active: true,
          security_version: token.security_version,
        }),
      );
  });
  const token = (security_version = 1, role = UserRole.OWNER) =>
    signIdentityJwtAccessToken(app.get(JwtService), { security_version, role });
  it('rejects missing and invalid JWTs through the real AuthGuard', async () => {
    await request(app.getHttpServer())
      .get('/identity/capabilities/audit')
      .expect(401);
    await request(app.getHttpServer())
      .get('/identity/capabilities/audit')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it('serves an active authoritative OWNER contract with the JWT tenant', async () => {
    await request(app.getHttpServer())
      .get('/identity/capabilities/audit')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200)
      .expect(
        ({ body }: { body: { tenant_id: string; contract_version: number } }) =>
          expect(body).toEqual(
            expect.objectContaining({
              tenant_id: 'tenant-e2e',
              contract_version: 1,
            }),
          ),
      );
    expect(capabilityService.current).toHaveBeenCalledWith('tenant-e2e');
  });
  it('forbids a MANAGER through real RolesGuard metadata', async () => {
    await request(app.getHttpServer())
      .post('/identity/capabilities/audit/activate')
      .set('Authorization', `Bearer ${token(1, UserRole.MANAGER)}`)
      .send({ new_version: 'v2', reason: 'revocation' })
      .expect(403);
    expect(capabilityService.append).not.toHaveBeenCalled();
  });
  it('rejects an inactive or stale user through real AuthoritativeCurrentUserGuard', async () => {
    authorize.mockImplementationOnce(({ security_version }) => {
      expect(security_version).toBe(1);
      throw new UnauthorizedException('inactive authoritative user');
    });
    await request(app.getHttpServer())
      .get('/identity/capabilities/audit')
      .set('Authorization', `Bearer ${token()}`)
      .expect(401);
    authorize.mockImplementationOnce(({ security_version }) => {
      expect(security_version).toBe(2);
      throw new UnauthorizedException('stale security version');
    });
    await request(app.getHttpServer())
      .get('/identity/capabilities/audit')
      .set('Authorization', `Bearer ${token(2)}`)
      .expect(401);
  });
  afterAll(async () => app?.close());
});
