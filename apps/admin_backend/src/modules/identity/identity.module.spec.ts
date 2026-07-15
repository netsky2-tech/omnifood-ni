import {
  ExecutionContext,
  Global,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { AuditIntegrityAlert } from './entities/audit-integrity-alert.entity';
import { AuditLog } from './entities/audit-log.entity';
import { SecurityProfile } from './entities/security-profile.entity';
import { AuthGuard } from './guards/auth.guard';
import { IdentityModule } from './identity.module';
import { AuthService } from './services/auth.service';

interface LoginPayload {
  sub: string;
  email: string;
  tenant_id: string;
  role: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
  token_type: 'access';
  is_active: boolean;
  security_version: number;
}

interface GuardRequest {
  headers: { authorization?: string };
  user?: unknown;
}

const jwtEnvironment: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  JWT_ISSUER: 'omnifood-admin-test',
  JWT_AUDIENCE: 'omnifood-pos-test',
  JWT_ACCESS_TTL_SECONDS: '3600',
  JWT_REFRESH_TTL_SECONDS: '604800',
  JWT_CLOCK_TOLERANCE_SECONDS: '5',
  JWT_ALGORITHM: 'HS256',
};

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class TestDatabaseModule {}

const createContext = (request: GuardRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
    }),
  }) as unknown as ExecutionContext;

describe('IdentityModule typed issuance with legacy AuthGuard', () => {
  let module: TestingModule;
  let authService: AuthService;
  let authGuard: AuthGuard;
  let jwtService: JwtService;
  let userRepository: Pick<Repository<User>, 'findOne' | 'update'>;

  beforeAll(async () => {
    Object.assign(process.env, jwtEnvironment);
    userRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        TestDatabaseModule,
        IdentityModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepository)
      .overrideProvider(getRepositoryToken(AuditLog))
      .useValue({})
      .overrideProvider(getRepositoryToken(SecurityProfile))
      .useValue({})
      .overrideProvider(getRepositoryToken(AuditIntegrityAlert))
      .useValue({})
      .compile();

    authService = module.get(AuthService);
    authGuard = module.get(AuthGuard);
    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await module.close();
  });

  it('authenticates the real login access token through the unchanged legacy guard', async () => {
    const user = Object.assign(new User(), {
      id: 'legacy-user-id',
      name: 'Legacy User',
      email: 'legacy@example.com',
      password_hash: await bcrypt.hash('password', 10),
      role: UserRole.MANAGER,
      tenant_id: 'legacy-tenant-id',
      is_active: true,
    });
    jest.mocked(userRepository.findOne).mockResolvedValue(user);
    jest.mocked(userRepository.update).mockResolvedValue({
      affected: 1,
      generatedMaps: [],
      raw: {},
    });

    const login = await authService.login('legacy@example.com', 'password');
    const request: GuardRequest = {
      headers: { authorization: `Bearer ${login.access_token}` },
    };

    await expect(authGuard.canActivate(createContext(request))).resolves.toBe(
      true,
    );

    const payload = request.user as LoginPayload;
    expect(payload).toMatchObject({
      sub: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      role: user.role,
    });
    expect(payload).toMatchObject({
      iss: jwtEnvironment.JWT_ISSUER,
      aud: jwtEnvironment.JWT_AUDIENCE,
      token_type: 'access',
      is_active: true,
      security_version: 1,
    });
    expect(payload.exp - payload.iat).toBe(60 * 60);
  });

  it('keeps the production JwtModule legacy default expiry close to one day', async () => {
    const token = await jwtService.signAsync({ sub: 'legacy-default-expiry' });
    const payload = await jwtService.verifyAsync<LoginPayload>(token);

    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(24 * 60 * 60 - 1);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(24 * 60 * 60 + 1);
  });

  it('continues accepting a previously issued typeless access token', async () => {
    const token = await jwtService.signAsync({
      sub: 'legacy-access-user',
      email: 'legacy-access@example.com',
      tenant_id: 'legacy-tenant-id',
      role: UserRole.MANAGER,
    });
    const request: GuardRequest = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(authGuard.canActivate(createContext(request))).resolves.toBe(
      true,
    );
    expect(request.user).toMatchObject({
      sub: 'legacy-access-user',
      tenant_id: 'legacy-tenant-id',
    });
  });

  it('rejects invalid-signature and expired legacy tokens without token-type rules', async () => {
    const validToken = await jwtService.signAsync({ sub: 'legacy-negative' });
    const expiredToken = await jwtService.signAsync(
      { sub: 'legacy-expired' },
      { expiresIn: -1 },
    );

    const invalidSignatureRequest: GuardRequest = {
      headers: { authorization: `Bearer ${validToken}x` },
    };
    const expiredRequest: GuardRequest = {
      headers: { authorization: `Bearer ${expiredToken}` },
    };

    await expect(
      authGuard.canActivate(createContext(invalidSignatureRequest)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      authGuard.canActivate(createContext(expiredRequest)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
