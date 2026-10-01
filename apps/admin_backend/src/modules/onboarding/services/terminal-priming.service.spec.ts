import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { InboundSyncService } from '../../sales/services/inbound-sync.service';
import type { InboundSyncResponseDto } from '../../sales/dto/inbound-sync.dto';
import { FiscalSequenceRecoveryRequiredException } from '../exceptions/fiscal-sequence-recovery-required.exception';
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
      // Slice 5d delta keys are required on InboundSyncDeltasDto; the
      // priming scenario carries no loyalty/promotion/customer data.
      loyaltyPrograms: [],
      promotions: [],
      customers: [],
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
  let transactionManager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: DataSource;
  // Cloud MAX(invoice sequence) the mocked invoices read returns for the
  // authenticated tenant. A foreign tenant (see tripwire isolation tests)
  // always holds a HIGHER max so any influence from it is a defect.
  let cloudMaxSequence: string;

  beforeEach(() => {
    cloudMaxSequence = '0';
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
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT MAX')) {
          // Model reality: without the tenant_id predicate the MAX read spans
          // every tenant and sees the foreign tenant's higher folio (50).
          if (/tenant_id\s*=\s*\$1/.test(sql)) {
            return Promise.resolve([{ maxSeq: cloudMaxSequence }]);
          }
          return Promise.resolve([{ maxSeq: '50' }]);
        }
        return Promise.resolve(undefined);
      }),
      // Structural no-write guard: ANY repository access through the
      // transaction manager fails loudly. The priming path is read-only and
      // speaks raw SQL only, so if future code ever reaches the repository
      // API (save/insert/update/delete/createQueryBuilder/…), the proxy
      // throws instead of silently satisfying the mock.
      getRepository: jest.fn(
        () =>
          new Proxy(
            {},
            {
              get: (_target, prop) => {
                throw new Error(
                  `UNEXPECTED REPOSITORY ACCESS: ${String(prop)} — the priming path must not touch the repository API`,
                );
              },
            },
          ),
      ),
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
      expect(transactionManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        inboundSyncService.getInboundDeltas.mock.invocationCallOrder[0],
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
      expect(serialized).not.toContain(
        'bcrypt-hash-must-never-leave-the-server',
      );
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

  describe('G2a fiscal sequence tripwire (issue #526 unit B5)', () => {
    it('refuses with 409 and FISCAL_SEQUENCE_RECOVERY_REQUIRED when the proposed sequence equals the cloud max', async () => {
      cloudMaxSequence = '5';

      const error = await service.getPrimingPayload(tenantId, 5).then(
        () => null,
        (e) => e,
      );
      expect(error).toBeInstanceOf(FiscalSequenceRecoveryRequiredException);
      expect(error.status).toBe(409);
      expect(error.code).toBe('FISCAL_SEQUENCE_RECOVERY_REQUIRED');
      // The body names the conflicting number so the POS can render the
      // AC-2 Spanish message without guessing it.
      expect(error.getResponse()).toMatchObject({
        statusCode: 409,
        error: 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
        code: 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
        highestSequenceNumber: 5,
        proposedSequence: 5,
      });
      expect(error.getResponse().message).toContain('sequence 5');
    });

    it('refuses when the proposed sequence is below the cloud max', async () => {
      cloudMaxSequence = '5';

      const error = await service.getPrimingPayload(tenantId, 4).then(
        () => null,
        (e) => e,
      );
      expect(error.getResponse()).toMatchObject({
        code: 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
        highestSequenceNumber: 5,
        proposedSequence: 4,
      });
    });

    it('passes through when the proposed sequence is cloud max + 1 and reports the cloud max for seeding above', async () => {
      cloudMaxSequence = '5';

      const payload = await service.getPrimingPayload(tenantId, 6);
      expect(payload.highestSequenceNumber).toBe(5);
      expect(payload.status).toBe('success');
    });

    it('passes through when the tenant holds no cloud invoices (N == 0)', async () => {
      cloudMaxSequence = '0';

      const payload = await service.getPrimingPayload(tenantId, 1);
      expect(payload.highestSequenceNumber).toBe(0);
      expect(payload.status).toBe('success');
    });

    it('keeps legacy behavior byte-identical when no proposed sequence is sent', async () => {
      cloudMaxSequence = '5';

      // The POS today sends no params: same one-argument call, same response
      // shape, no tripwire engagement.
      const payload = await service.getPrimingPayload(tenantId);
      expect(Object.keys(payload).sort()).toEqual([
        'currentVersion',
        'deltas',
        'fiscalConfig',
        'highestSequenceNumber',
        'serverTime',
        'status',
      ]);
      expect(payload.highestSequenceNumber).toBe(5);
      expect(payload.status).toBe('success');
    });

    it('issues no write on the refusal path (AC-3 backend half)', async () => {
      cloudMaxSequence = '5';

      await expect(service.getPrimingPayload(tenantId, 5)).rejects.toThrow();

      // The refusal must stop, not correct: the only SQL issued is the
      // transaction-local tenant binding and the MAX read.
      const sqlCalls = transactionManager.query.mock.calls.map(
        (call) => call[0] as string,
      );
      expect(sqlCalls).toHaveLength(2);
      expect(sqlCalls[0]).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
      expect(sqlCalls[1]).toContain('SELECT MAX');
      expect(sqlCalls.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
      // The repository write surface is structurally unreachable: the mocked
      // manager's getRepository hands out a proxy that throws on ANY member
      // access, so a future write through save/insert/update/delete/
      // createQueryBuilder cannot pass this test silently.
      expect(transactionManager.getRepository).not.toHaveBeenCalled();
    });

    it('fails closed with 409 FISCAL_SEQUENCE_RECOVERY_REQUIRED when the cloud MAX read errors and a sequence was proposed', async () => {
      transactionManager.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT MAX')) {
          return Promise.reject(new Error('invoices read failed'));
        }
        return Promise.resolve(undefined);
      });

      // A replay tripwire must never silently pass on an unreadable MAX: the
      // device cannot be allowed to sell when its proposal is unverifiable.
      const error = await service.getPrimingPayload(tenantId, 6).then(
        () => null,
        (e) => e,
      );
      expect(error.status).toBe(409);
      expect(error.getResponse()).toMatchObject({
        statusCode: 409,
        error: 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
        code: 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
        proposedSequence: 6,
      });
      // The body names the failure instead of inventing a sequence number
      // the read could not compute.
      expect(error.getResponse().message).toContain('MAX read failed');
      expect(error.getResponse().highestSequenceNumber).toBeNull();
    });

    it('keeps the legacy fail-safe to 0 on a MAX read error when no sequence was proposed', async () => {
      transactionManager.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT MAX')) {
          return Promise.reject(new Error('invoices read failed'));
        }
        return Promise.resolve(undefined);
      });

      // Byte-identical legacy behavior for callers that send no proposed
      // sequence (also the isolated-scratch-schema path): no new failure
      // mode is introduced for them.
      const payload = await service.getPrimingPayload(tenantId);
      expect(payload.highestSequenceNumber).toBe(0);
      expect(payload.status).toBe('success');
    });

    it('scopes the MAX read to the tenant predicate, ignoring a foreign tenant with a higher max', async () => {
      cloudMaxSequence = '5';

      // Pass-through at max + 1 must succeed even though the foreign tenant
      // holds sequence 50.
      const passing = await service.getPrimingPayload(tenantId, 6);
      expect(passing.highestSequenceNumber).toBe(5);

      // The refusal boundary is the tenant's own max (5), never the foreign
      // tenant's (50).
      const refusal = await service.getPrimingPayload(tenantId, 5).then(
        () => null,
        (e) => e,
      );
      expect(refusal.getResponse()).toMatchObject({
        code: 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
        highestSequenceNumber: 5,
      });

      const maxCall = transactionManager.query.mock.calls.find((call) =>
        (call[0] as string).includes('SELECT MAX'),
      );
      expect(maxCall?.[0] as string).toContain('tenant_id = $1');
      expect(maxCall?.[1]).toEqual([tenantId]);
    });

    it('extracts the trailing digit run of the folio, not a concatenation of the DGI prefix digits', async () => {
      cloudMaxSequence = '5';

      await service.getPrimingPayload(tenantId, 6);

      // Production folios are prefixed (`001-001-01-00000005`); the MAX must
      // read the trailing consecutivo run the POS's own extraction reads,
      // never a strip of all non-digits (which would concatenate the prefix
      // digits and compute 10010100000005 for that folio).
      const maxSql = transactionManager.query.mock.calls.find((call) =>
        (call[0] as string).includes('SELECT MAX'),
      )?.[0] as string;
      expect(maxSql).toContain("substring(invoice_number from '([0-9]+)$')");
      expect(maxSql).not.toContain("regexp_replace(invoice_number, '[^0-9]'");
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
