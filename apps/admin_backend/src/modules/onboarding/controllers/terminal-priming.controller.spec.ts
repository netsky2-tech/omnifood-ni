import {
  UnauthorizedException,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { PERMISSIONS_KEY } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { TerminalPrimingController } from './terminal-priming.controller';
import { TerminalPrimingService } from '../services/terminal-priming.service';
import { TerminalPrimingQueryDto } from '../dto/terminal-priming.dto';
import {
  TerminalPrimingCatalogValueDto,
  TerminalPrimingProductDto,
  TerminalPrimingResponseDto,
} from '../services/terminal-priming.service';

describe('L1-10a: TerminalPrimingsController (Unit)', () => {
  const tenantId = 'tenant-priming-test';

  const product: TerminalPrimingProductDto = {
    id: 'product-uuid-1',
    name: 'Espresso',
    uom: 'UNIDAD',
    stock: 100,
    averageCost: 12.5,
    sellPrice: 25,
    isActive: true,
    isPerishable: false,
    warehouseId: null,
    productType: 'SIMPLE',
    mappingVersionId: null,
    insumoId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    tenantId,
  };

  const catalogValue: TerminalPrimingCatalogValueDto = {
    id: 'catalog-uuid-1',
    catalogType: 'CATEGORY',
    code: 'BEBIDAS',
    name: 'Bebidas',
    description: null,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const primingPayload: TerminalPrimingResponseDto = {
    status: 'success',
    serverTime: '2026-01-03T00:00:00.000Z',
    currentVersion: 1767400000000,
    deltas: {
      products: [product],
      catalogValues: [catalogValue],
    },
    fiscalConfig: {
      tenantId,
      businessName: 'Food Park Test',
      ruc: 'J0310000123456',
      fiscalRegime: 'CONSUMIDOR_FINAL' as never,
      taxRate: 15,
      pricesIncludeTax: true,
      configVersion: 1 as never,
      generatedAt: '2026-01-03T00:00:00.000Z',
    },
  };

  describe('Route and security contract', () => {
    let controller: TerminalPrimingController;
    let primingService: jest.Mocked<Partial<TerminalPrimingService>>;
    let reflector: Reflector;

    beforeEach(() => {
      primingService = {
        getPrimingPayload: jest.fn().mockResolvedValue(primingPayload),
      };
      controller = new TerminalPrimingController(
        primingService as unknown as TerminalPrimingService,
      );
      reflector = new Reflector();
    });

    it('gates the priming handler with ONBOARDING_ACTIVATION_MANAGE and no OWNER role hardcode', () => {
      const handler = controller.getPrimingPayload;
      expect(handler).toBeDefined();

      const requiredPermissions = reflector.get<AppPermission[]>(
        PERMISSIONS_KEY,
        handler,
      );
      expect(requiredPermissions).toContain(
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      );

      // The permission alone authorizes the call: a business may delegate
      // activation to a non-OWNER role via per-user custom permissions.
      expect(requiredPermissions).not.toBeNull();
    });

    it('protects the controller with AuthGuard and PermissionsGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        TerminalPrimingController,
      );
      expect(guards).toEqual([AuthGuard, PermissionsGuard]);
    });

    it('applies TenantInterceptor so tenant context is bound for RLS reads', () => {
      const interceptors = Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        TerminalPrimingController,
      );
      expect(interceptors).toContain(TenantInterceptor);
    });

    it('does not require any device principal, header or activation attempt to prime', () => {
      // The handler signature takes only the authenticated request: no
      // x-device-terminal-id header, no attempt id, no device credential.
      const handler = controller.getPrimingPayload;
      expect(handler).toBeDefined();
    });
  });

  describe('getPrimingPayload', () => {
    let controller: TerminalPrimingController;
    let primingService: jest.Mocked<Partial<TerminalPrimingService>>;

    beforeEach(() => {
      primingService = {
        getPrimingPayload: jest.fn().mockResolvedValue(primingPayload),
      };
      controller = new TerminalPrimingController(
        primingService as unknown as TerminalPrimingService,
      );
    });

    it('delegates using the authenticated human tenant (snake_case claim), never a client-supplied tenant', async () => {
      const req: any = {
        user: {
          id: 'human-user-1',
          tenant_id: tenantId,
          role: 'OWNER',
        },
        body: {
          // Attack: a forged tenant id in the body must be ignored.
          tenantId: 'forged-attacker-tenant',
        },
      };

      const result = await controller.getPrimingPayload(req);

      expect(primingService.getPrimingPayload).toHaveBeenCalledTimes(1);
      expect(primingService.getPrimingPayload).toHaveBeenCalledWith(
        tenantId,
        undefined,
      );
      expect(result).toEqual(primingPayload);
    });

    it('supports req.user.tenantId (camelCase) fallback', async () => {
      const req: any = {
        user: {
          id: 'human-user-1',
          tenantId,
        },
      };

      await controller.getPrimingPayload(req);

      expect(primingService.getPrimingPayload).toHaveBeenCalledWith(
        tenantId,
        undefined,
      );
    });

    it('rejects with UnauthorizedException when the human user has no tenant context', async () => {
      const req: any = {
        user: {
          id: 'human-user-1',
        },
      };

      await expect(controller.getPrimingPayload(req)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(primingService.getPrimingPayload).not.toHaveBeenCalled();
    });

    it('rejects with UnauthorizedException when there is no user at all', async () => {
      const req: any = { headers: {} };

      await expect(controller.getPrimingPayload(req)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(primingService.getPrimingPayload).not.toHaveBeenCalled();
    });
  });

  describe('G2a: optional proposedSequence query (issue #526 unit B5)', () => {
    let controller: TerminalPrimingController;
    let primingService: jest.Mocked<Partial<TerminalPrimingService>>;

    beforeEach(() => {
      primingService = {
        getPrimingPayload: jest.fn().mockResolvedValue(primingPayload),
      };
      controller = new TerminalPrimingController(
        primingService as unknown as TerminalPrimingService,
      );
    });

    it('passes a present proposedSequence through to the service', async () => {
      const req: any = { user: { tenant_id: tenantId } };

      await controller.getPrimingPayload(req, { proposedSequence: 7 });

      expect(primingService.getPrimingPayload).toHaveBeenCalledWith(
        tenantId,
        7,
      );
    });

    it('keeps legacy delegation when no query param is sent', async () => {
      const req: any = { user: { tenant_id: tenantId } };

      await controller.getPrimingPayload(req);

      expect(primingService.getPrimingPayload).toHaveBeenCalledWith(
        tenantId,
        undefined,
      );
    });

    describe('TerminalPrimingQueryDto under the production ValidationPipe config', () => {
      // Mirrors the global pipe in main.ts: whitelist, forbidNonWhitelisted,
      // transform. Query strings arrive as strings; transform converts them
      // through @Type(() => Number) before @IsInt runs.
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      const transformQuery = (raw: Record<string, unknown>) =>
        pipe.transform(raw, {
          type: 'query' as const,
          metatype: TerminalPrimingQueryDto,
        });

      it('accepts and converts a positive integer string', async () => {
        await expect(
          transformQuery({ proposedSequence: '7' }),
        ).resolves.toEqual({ proposedSequence: 7 });
      });

      it('accepts an absent proposedSequence (legacy callers stay valid)', async () => {
        await expect(transformQuery({})).resolves.toEqual({});
      });

      it('rejects zero, negatives, non-integers and non-numbers', async () => {
        await expect(transformQuery({ proposedSequence: '0' })).rejects.toThrow(
          BadRequestException,
        );
        await expect(
          transformQuery({ proposedSequence: '-2' }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          transformQuery({ proposedSequence: '1.5' }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          transformQuery({ proposedSequence: 'abc' }),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
