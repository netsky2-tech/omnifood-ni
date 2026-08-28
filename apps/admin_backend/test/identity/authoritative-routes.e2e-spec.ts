import {
  Controller,
  Get,
  INestApplication,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { App } from 'supertest/types';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { AuthController } from '../../src/modules/identity/controllers/auth.controller';
import { AuthService } from '../../src/modules/identity/services/auth.service';
import { UsersController } from '../../src/modules/identity/controllers/users.controller';
import { ReportsController } from '../../src/modules/sales/controllers/reports.controller';
import { InventoryMovementController } from '../../src/modules/inventory/inventory-movement.controller';
import { CatalogController } from '../../src/modules/catalog/catalog.controller';
import { FxRateResolverService } from '../../src/modules/inventory/fx-rate-resolver.service';
import { InventoryPurchaseService } from '../../src/modules/inventory/inventory-purchase.service';
import { ShrinkageService } from '../../src/modules/inventory/shrinkage.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { CountSessionService } from '../../src/modules/inventory/count-session.service';
import { ProductionService } from '../../src/modules/inventory/production.service';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../../src/modules/identity/config/identity-jwt.config';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { User } from '../../src/modules/identity/entities/user.entity';
import { DataSource } from 'typeorm';

@Controller('identity')
class SensitiveIdentityController {
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Post('users')
  write() {
    return { ok: true };
  }
  @UseGuards(AuthGuard, RolesGuard)
  @Get('users')
  read() {
    return { ok: true };
  }
}

@Controller('v1/sync')
class CreditNoteBoundaryController {
  @UseGuards(AuthGuard, RolesGuard)
  @Post('batch')
  batch() {
    return { ok: true };
  }
}

const handler = (prototype: object, name: string): object => {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name) as
    | {
        value?: unknown;
      }
    | undefined;
  const value = descriptor?.value;
  if (typeof value !== 'function') {
    throw new Error(`Missing ${name} handler`);
  }
  return value;
};

describe('authoritative identity routes (e2e)', () => {
  let app: INestApplication<App>;
  const auth = { canActivate: jest.fn() };
  const authoritative = { canActivate: jest.fn() };
  const roles = { canActivate: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SensitiveIdentityController, CreditNoteBoundaryController],
    })
      .overrideGuard(AuthGuard)
      .useValue(auth)
      .overrideGuard(AuthoritativeCurrentUserGuard)
      .useValue(authoritative)
      .overrideGuard(RolesGuard)
      .useValue(roles)
      .overrideProvider(CurrentUserAuthorizationService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    auth.canActivate.mockReset().mockResolvedValue(true);
    authoritative.canActivate.mockReset().mockResolvedValue(true);
    roles.canActivate.mockReset().mockResolvedValue(true);
  });

  it('fails a protected write before the handler when authoritative authorization rejects', async () => {
    authoritative.canActivate.mockRejectedValue(new UnauthorizedException());

    await request(app.getHttpServer()).post('/identity/users').expect(401);
    expect(auth.canActivate).toHaveBeenCalledTimes(1);
    expect(roles.canActivate).not.toHaveBeenCalled();
  });

  it('keeps the non-sensitive GET route outside authoritative enforcement', async () => {
    await request(app.getHttpServer()).get('/identity/users').expect(200);
    expect(authoritative.canActivate).not.toHaveBeenCalled();
  });

  it('keeps CREDIT_NOTE synchronization outside this 2A-E boundary', async () => {
    await request(app.getHttpServer()).post('/v1/sync/batch').expect(201);
    expect(authoritative.canActivate).not.toHaveBeenCalled();
  });

  it('declares AuthGuard, authoritative guard, then RolesGuard only on approved identity routes', () => {
    const userCreate = handler(UsersController.prototype, 'create');
    const userList = handler(UsersController.prototype, 'list');
    const getStaff = handler(AuthController.prototype, 'getStaff');

    expect(Reflect.getMetadata(GUARDS_METADATA, userCreate)).toEqual([
      AuthGuard,
      AuthoritativeCurrentUserGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, userList)).toEqual([
      AuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, getStaff)).toEqual([
      AuthGuard,
      AuthoritativeCurrentUserGuard,
      RolesGuard,
    ]);
  });

  afterAll(async () => app.close());
});

describe('authoritative remaining sensitive routes (e2e)', () => {
  const jwtEnvironment = {
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin-test',
    JWT_AUDIENCE: 'omnifood-pos-test',
    JWT_ALGORITHM: 'HS256',
  } as const;
  const jwtConfig: IdentityJwtConfig = {
    secret: jwtEnvironment.JWT_SECRET,
    issuer: jwtEnvironment.JWT_ISSUER,
    audience: jwtEnvironment.JWT_AUDIENCE,
    accessTokenTtlSeconds: 3600,
    refreshTokenTtlSeconds: 604800,
    clockToleranceSeconds: 5,
    algorithm: jwtEnvironment.JWT_ALGORITHM,
  };
  const currentUser = {
    email: 'manager@example.com',
    tenant_id: 'tenant-A',
    role: UserRole.MANAGER,
    is_active: true,
    security_version: 1,
  };
  const authorize = jest.fn((token: Record<string, unknown>) => {
    if (
      token.email !== currentUser.email ||
      token.tenant_id !== currentUser.tenant_id ||
      token.role !== currentUser.role ||
      token.is_active !== currentUser.is_active ||
      token.security_version !== currentUser.security_version
    ) {
      throw new UnauthorizedException();
    }
    return Promise.resolve(currentUser);
  });
  const purchaseService = {
    recordPurchase: jest.fn().mockResolvedValue({ id: 'purchase-1' }),
  };
  const catalogService = {
    seedDefaults: jest.fn().mockResolvedValue(1),
  };
  const loginUser = {
    id: 'user-1',
    name: 'Manager',
    email: currentUser.email,
    password_hash: '',
    role: UserRole.MANAGER,
    tenant_id: currentUser.tenant_id,
    is_active: true,
    security_version: 1,
  };
  const users = {
    findOne: jest.fn().mockResolvedValue(loginUser),
    update: jest.fn().mockResolvedValue({}),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    loginUser.password_hash = await bcrypt.hash('correct-password', 4);
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: jwtEnvironment.JWT_SECRET,
          signOptions: {
            algorithm: jwtEnvironment.JWT_ALGORITHM,
            issuer: jwtEnvironment.JWT_ISSUER,
            audience: jwtEnvironment.JWT_AUDIENCE,
          },
        }),
      ],
      controllers: [
        AuthController,
        ReportsController,
        InventoryMovementController,
        CatalogController,
      ],
      providers: [
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        AuthService,
        { provide: CurrentUserAuthorizationService, useValue: { authorize } },
        { provide: ConfigService, useValue: {} },
        { provide: IDENTITY_JWT_CONFIG, useValue: jwtConfig },
        { provide: FxRateResolverService, useValue: {} },
        { provide: InventoryPurchaseService, useValue: purchaseService },
        { provide: ShrinkageService, useValue: {} },
        { provide: InventoryService, useValue: {} },
        { provide: RecipeService, useValue: {} },
        { provide: CountSessionService, useValue: {} },
        { provide: ProductionService, useValue: {} },
        { provide: CatalogService, useValue: catalogService },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    currentUser.tenant_id = 'tenant-A';
    currentUser.role = UserRole.MANAGER;
    currentUser.is_active = true;
    currentUser.security_version = 1;
    authorize.mockClear();
    purchaseService.recordPurchase.mockClear();
    catalogService.seedDefaults.mockClear();
  });

  const tokenFor = (overrides: Record<string, unknown> = {}): string =>
    app.get(JwtService).sign({
      sub: 'user-1',
      email: currentUser.email,
      tenant_id: currentUser.tenant_id,
      role: currentUser.role,
      is_active: true,
      token_type: 'access',
      security_version: currentUser.security_version,
      ...overrides,
    });

  it('rejects stale and forged claims before owned route handlers', async () => {
    await request(app.getHttpServer())
      .get('/sales/reports/x')
      .set('Authorization', `Bearer ${tokenFor({ security_version: 2 })}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/inventory/purchases')
      .set('Authorization', `Bearer ${tokenFor({ tenant_id: 'tenant-B' })}`)
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/catalogs/seed-defaults')
      .set('Authorization', `Bearer ${tokenFor({ role: UserRole.OWNER })}`)
      .expect(401);

    expect(purchaseService.recordPurchase).not.toHaveBeenCalled();
    expect(catalogService.seedDefaults).not.toHaveBeenCalled();
  });

  it('rejects an active-looking token after the current user becomes inactive', async () => {
    currentUser.is_active = false;

    await request(app.getHttpServer())
      .get('/sales/reports/z')
      .set('Authorization', `Bearer ${tokenFor({ is_active: true })}`)
      .expect(401);
  });

  it('permits an active manager using an access token issued by login', async () => {
    const login = await request(app.getHttpServer())
      .post('/identity/login')
      .send({ email: currentUser.email, pass: 'correct-password' })
      .expect(201);
    const loginBody = login.body as { access_token: string };
    const accessToken = loginBody.access_token;

    await request(app.getHttpServer())
      .get('/sales/reports/x')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/catalogs/seed-defaults')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(catalogService.seedDefaults).toHaveBeenCalledTimes(1);
  });

  it('passes the current role to RolesGuard for an insufficient current role', async () => {
    currentUser.role = UserRole.CASHIER;

    await request(app.getHttpServer())
      .get('/sales/reports/x')
      .set('Authorization', `Bearer ${tokenFor({ role: UserRole.CASHIER })}`)
      .expect(403);
  });

  afterAll(async () => app.close());
});
