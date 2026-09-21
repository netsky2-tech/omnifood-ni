import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
} from '../../../core/database/tenant-transaction';
import { InboundSyncService } from '../../sales/services/inbound-sync.service';
import type { InboundSyncResponseDto } from '../../sales/dto/inbound-sync.dto';
import {
  TERMINAL_PRIMING_REQUESTED_TYPES,
  TerminalPrimingService,
} from './terminal-priming.service';

const tenantId = 'tenant-priming-test';
const otherTenantId = 'tenant-priming-other';

function buildEnvelope(overrides: {
  tenantId: string;
  productName: string;
  fiscalBusinessName: string;
}): InboundSyncResponseDto {
  return {
    status: 'success',
    serverTime: '2026-01-03T00:00:00.000Z',
    currentVersion: 1767400000000,
    deltas: {
      products: [
        {
          id: 'product-uuid-1',
          name: overrides.productName,
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
          tenantId: overrides.tenantId,
        },
      ],
      catalogValues: [
        {
          id: 'catalog-uuid-1',
          catalogType: 'CATEGORY',
          code: 'BEBIDAS',
          name: 'Bebidas',
          description: null,
          isActive: true,
          sortOrder: 1,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      insumos: [],
      recipes: [],
      recipeVersions: [],
      // The inbound envelope carries users with security profiles that
      // include PIN material. Priming must never forward them.
      users: [
        {
          id: 'user-uuid-1',
          name: 'Encargado',
          email: 'encargado@tenant.test',
          role: 'ENCARGADO',
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          securityProfile: {
            isPinEnabled: true,
            isTotpEnabled: false,
            pinHash: 'bcrypt-hash-must-never-leave-the-server',
          },
        },
      ],
      fiscalConfig: {
        tenantId: overrides.tenantId,
        businessName: overrides.fiscalBusinessName,
        ruc: 'J0310000123456',
        fiscalRegime: 'CONSUMIDOR_FINAL' as never,
        taxRate: 15,
        pricesIncludeTax: true,
        configVersion: 1 as never,
        generatedAt: '2026-01-03T00:00:00.000Z',
      },
    },
    fiscalConfig: {
      tenantId: overrides.tenantId,
      businessName: overrides.fiscalBusinessName,
      ruc: 'J0310000123456',
      fiscalRegime: 'CONSUMIDOR_FINAL' as never,
      taxRate: 15,
      pricesIncludeTax: true,
      configVersion: 1 as never,
      generatedAt: '2026-01-03T00:00:00.000Z',
    },
    humanAuthorization: {
      status: 'DELIVER',
      epoch: { sequence: '1' },
      sequence: '1',
      digest: 'digest',
    },
  };
}

describe('L1-10a: TerminalPrimingService (Unit)', () => {
  let service: TerminalPrimingService;
  let inboundSyncService: { getInboundDeltas: jest.Mock };
  let transactionManager: { query: jest.Mock };
  let dataSource: DataSource;

  beforeEach(() => {
    inboundSyncService = {
      getInboundDeltas: jest.fn().mockResolvedValue(
        buildEnvelope({
          tenantId,
          productName: 'Espresso',
          fiscalBusinessName: 'Food Park Test',
        }),
      ),
    };
    transactionManager = {
      query: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
        cb(transactionManager),
      ),
    } as unknown as DataSource;

    service = new TerminalPrimingService(
      inboundSyncService as unknown as InboundSyncService,
      dataSource,
    );
  });

  describe('tenant-bound transaction', () => {
    it('wraps the inbound read in a transaction bound to the authenticated tenant', async () => {
      await service.getPrimingPayload(tenantId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // RLS reads must never happen before the transaction-local tenant
      // context is bound with set_config.
      expect(transactionManager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [tenantId],
      );
      expect(
        (transactionManager.query as jest.Mock).mock.invocationCallOrder[0],
      ).toBeLessThan(
        (inboundSyncService.getInboundDeltas as jest.Mock).mock
          .invocationCallOrder[0],
      );
    });

    it('passes the transaction-bound manager to the inbound read', async () => {
      await service.getPrimingPayload(tenantId);

      // The manager the transaction bound with set_config is the same one the
      // inbound read receives, so its RLS-forced queries run on that
      // connection instead of borrowing a pooled one.
      expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ types: TERMINAL_PRIMING_REQUESTED_TYPES }),
        undefined,
        transactionManager,
      );
    });

    it('rejects a blank tenant id before borrowing a connection', async () => {
      await expect(service.getPrimingPayload('   ')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(inboundSyncService.getInboundDeltas).not.toHaveBeenCalled();
    });
  });

  describe('inbound envelope reuse', () => {
    it('requests only the priming types (products, catalog values, fiscal config) from InboundSyncService', async () => {
      await service.getPrimingPayload(tenantId);

      expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ types: TERMINAL_PRIMING_REQUESTED_TYPES }),
        undefined,
        transactionManager,
      );
    });

    it('returns the same envelope shape the POS projection consumes for catalog and fiscal', async () => {
      const result = await service.getPrimingPayload(tenantId);

      expect(result.status).toBe('success');
      expect(result.serverTime).toBe('2026-01-03T00:00:00.000Z');
      expect(result.currentVersion).toBe(1767400000000);
      expect(result.deltas.products).toHaveLength(1);
      expect(result.deltas.products[0]).toMatchObject({
        id: 'product-uuid-1',
        name: 'Espresso',
        sellPrice: 25,
        tenantId,
      });
      expect(result.deltas.catalogValues).toHaveLength(1);
      expect(result.deltas.catalogValues[0]).toMatchObject({
        id: 'catalog-uuid-1',
        catalogType: 'CATEGORY',
        code: 'BEBIDAS',
      });
      expect(result.deltas.fiscalConfig).toMatchObject({
        tenantId,
        businessName: 'Food Park Test',
        ruc: 'J0310000123456',
      });
      expect(result.fiscalConfig).toMatchObject({
        tenantId,
        businessName: 'Food Park Test',
      });
    });
  });

  describe('security: no user or PIN material in the priming response', () => {
    it('never returns the user list, security profiles or pinHash', async () => {
      const result = await service.getPrimingPayload(tenantId);

      expect(result.deltas).not.toHaveProperty('users');
      expect(result).not.toHaveProperty('humanAuthorization');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('pinHash');
      expect(serialized).not.toContain('bcrypt-hash-must-never-leave-the-server');
      expect(serialized).not.toContain('securityProfile');
      expect(serialized).not.toContain('Encargado');
    });

    it('stays clean even if the inbound service ever returned users for the requested types', async () => {
      // Defense in depth: the mapping is an explicit allowlist, so a leak in
      // the requested-types negotiation must not surface users.
      inboundSyncService.getInboundDeltas.mockResolvedValue(
        buildEnvelope({
          tenantId,
          productName: 'Espresso',
          fiscalBusinessName: 'Food Park Test',
        }),
      );

      const result = await service.getPrimingPayload(tenantId);
      expect(Object.keys(result.deltas).sort()).toEqual([
        'catalogValues',
        'fiscalConfig',
        'products',
      ]);
    });
  });

  describe('tenant isolation', () => {
    it('maps each tenant exclusively from its own tenant-scoped envelope', async () => {
      // InboundSyncService scopes every query by the tenantId it receives and
      // reads RLS-forced tables inside the tenant-bound transaction; the
      // priming service must pass the authenticated tenant through untouched
      // and expose only that tenant's deltas.
      const tenantAEnvelope = buildEnvelope({
        tenantId,
        productName: 'Espresso Tenant A',
        fiscalBusinessName: 'Food Park A',
      });
      const tenantBEnvelope = buildEnvelope({
        tenantId: otherTenantId,
        productName: 'Nacatamal Tenant B',
        fiscalBusinessName: 'Food Park B',
      });
      inboundSyncService.getInboundDeltas.mockImplementation(
        async (requestedTenantId: string) =>
          requestedTenantId === tenantId ? tenantAEnvelope : tenantBEnvelope,
      );

      const resultA = await service.getPrimingPayload(tenantId);
      const resultB = await service.getPrimingPayload(otherTenantId);

      expect(inboundSyncService.getInboundDeltas).toHaveBeenNthCalledWith(
        1,
        tenantId,
        expect.objectContaining({ types: TERMINAL_PRIMING_REQUESTED_TYPES }),
        undefined,
        transactionManager,
      );
      expect(inboundSyncService.getInboundDeltas).toHaveBeenNthCalledWith(
        2,
        otherTenantId,
        expect.objectContaining({ types: TERMINAL_PRIMING_REQUESTED_TYPES }),
        undefined,
        transactionManager,
      );

      expect(resultA.deltas.products[0].tenantId).toBe(tenantId);
      expect(resultA.deltas.products[0].name).toBe('Espresso Tenant A');
      expect(resultA.fiscalConfig?.businessName).toBe('Food Park A');
      expect(JSON.stringify(resultA)).not.toContain('Tenant B');

      expect(resultB.deltas.products[0].tenantId).toBe(otherTenantId);
      expect(resultB.deltas.products[0].name).toBe('Nacatamal Tenant B');
      expect(resultB.fiscalConfig?.businessName).toBe('Food Park B');
      expect(JSON.stringify(resultB)).not.toContain('Tenant A');
    });
  });
});
