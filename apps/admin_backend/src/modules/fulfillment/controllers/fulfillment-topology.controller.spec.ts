import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../identity/services/current-user-authorization.service';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../../identity/config/identity-jwt.config';
import { TopologyRevisionConflictError } from '../domain/topology-revision-conflict.error';
import { TenantTopologyRevisionService } from '../services/tenant-topology-revision.service';
import { FulfillmentTopologyController } from './fulfillment-topology.controller';
import { CreateTenantTopologyRevisionDto } from '../dto/create-tenant-topology-revision.dto';

const jwtEnvironment = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  JWT_ISSUER: 'omnifood-admin-test',
  JWT_AUDIENCE: 'omnifood-pos-test',
  JWT_ACCESS_TTL_SECONDS: '3600',
  JWT_REFRESH_TTL_SECONDS: '604800',
  JWT_CLOCK_TOLERANCE_SECONDS: '5',
  JWT_ALGORITHM: 'HS256' as const,
};

const createIdentityJwtConfig = (): IdentityJwtConfig => ({
  secret: jwtEnvironment.JWT_SECRET,
  issuer: jwtEnvironment.JWT_ISSUER,
  audience: jwtEnvironment.JWT_AUDIENCE,
  accessTokenTtlSeconds: Number(jwtEnvironment.JWT_ACCESS_TTL_SECONDS),
  refreshTokenTtlSeconds: Number(jwtEnvironment.JWT_REFRESH_TTL_SECONDS),
  clockToleranceSeconds: Number(jwtEnvironment.JWT_CLOCK_TOLERANCE_SECONDS),
  algorithm: jwtEnvironment.JWT_ALGORITHM,
});

describe('FulfillmentTopologyController', () => {
  let controller: FulfillmentTopologyController;
  let service: jest.Mocked<TenantTopologyRevisionService>;
  let reflector: Reflector;

  beforeEach(async () => {
    const mockService = {
      current: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<TenantTopologyRevisionService>;

    const module: TestingModule = await Test.createTestingModule({
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
      controllers: [FulfillmentTopologyController],
      providers: [
        Reflector,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        {
          provide: TenantTopologyRevisionService,
          useValue: mockService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof typeof jwtEnvironment) => jwtEnvironment[key],
          },
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: createIdentityJwtConfig(),
        },
      ],
    }).compile();

    controller = module.get<FulfillmentTopologyController>(
      FulfillmentTopologyController,
    );
    service = module.get(TenantTopologyRevisionService);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('guards and metadata', () => {
    it('requires OWNER role on create revision endpoint', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.createRevision,
      );
      expect(roles).toEqual([UserRole.OWNER]);
    });

    it('allows read access to all tenant staff roles on current endpoint', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.getCurrent);
      expect(roles).toEqual([
        UserRole.OWNER,
        UserRole.MANAGER,
        UserRole.CASHIER,
        UserRole.WAITER,
      ]);
    });
  });

  describe('getCurrent', () => {
    it('throws UnauthorizedException when tenant context is missing', async () => {
      await expect(controller.getCurrent(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns unprovisioned state for brand new tenant', async () => {
      service.current.mockResolvedValueOnce({
        provisioned: false,
        revision: 0,
      });

      const result = await controller.getCurrent('tenant-123');
      expect(result).toEqual({ provisioned: false, revision: 0 });
      expect(service.current).toHaveBeenCalledWith('tenant-123');
    });

    it('returns active revision when provisioned', async () => {
      service.current.mockResolvedValueOnce({
        provisioned: true,
        tenantId: 'tenant-123',
        contractVersion: 1,
        revision: 3,
        topology: { operationMode: 'FOOD_PARK' },
        hash: 'hash-abc',
      });

      const result = await controller.getCurrent('tenant-123');
      expect(result).toMatchObject({
        provisioned: true,
        revision: 3,
        hash: 'hash-abc',
      });
    });
  });

  describe('createRevision', () => {
    const dto: CreateTenantTopologyRevisionDto = {
      baseRevision: 0,
      contractVersion: 1,
      topology: {
        operationMode: 'FOOD_PARK',
        channels: ['KDS_AND_PRINT'],
        devices: [
          {
            deviceId: 'pos-1',
            roles: ['CASHIER'],
            capabilities: ['PRINT'],
          },
        ],
      },
      hash: 'sha256-hash-123',
    };

    it('throws UnauthorizedException when tenant context is missing', async () => {
      await expect(controller.createRevision(dto, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('successfully provisions new revision and returns 201 state', async () => {
      service.create.mockResolvedValueOnce({
        provisioned: true,
        tenantId: 'tenant-123',
        contractVersion: 1,
        revision: 1,
        topology: dto.topology,
        hash: dto.hash,
      });

      const result = await controller.createRevision(dto, 'tenant-123');
      expect(result).toEqual({
        provisioned: true,
        tenantId: 'tenant-123',
        contractVersion: 1,
        revision: 1,
        topology: dto.topology,
        hash: dto.hash,
      });
      expect(service.create).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        baseRevision: 0,
        contractVersion: 1,
        topology: dto.topology,
        hash: dto.hash,
      });
    });

    it('translates TopologyRevisionConflictError into HTTP 409 Conflict', async () => {
      service.create.mockRejectedValueOnce(
        new TopologyRevisionConflictError(0, 1),
      );

      await expect(
        controller.createRevision(dto, 'tenant-123'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
