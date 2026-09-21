import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { InboundSyncController } from './inbound-sync.controller';
import { InboundSyncService } from '../services/inbound-sync.service';
import { InboundSyncResponseDto } from '../dto/inbound-sync.dto';

/**
 * The controller reads the authenticated device principal the transport guard
 * attached, so every direct call has to supply a request. Each test here
 * exercises tenant validation and delegation, not OHAC negotiation, so the
 * principal is omitted and the negotiation member stays absent.
 */
const deviceRequest = (withPrincipal = false) =>
  (withPrincipal
    ? { devicePrincipal: { deviceId: 'pos-terminal-01' } }
    : {}) as never;

const ackDto = {
  schema: 'ohac.staff-policy-epoch.v1',
  sequence: '1',
  digest: 'sha256:' + 'a'.repeat(64),
  previousSequence: '0',
  previousDigest: 'GENESIS',
  posBuild: 'pos-build-1',
  assertionSchema: 'ohac.assertion.v1',
  idempotencyKey: 'idem-1',
};

describe('InboundSyncController', () => {
  let controller: InboundSyncController;
  const inboundSyncService = {
    getInboundDeltas: jest.fn(),
    acknowledgeStaffPolicyEpoch: jest.fn(),
  };

  // The GET handlers must route the service reads through a tenant-bound
  // transaction manager (issue #470): the guard's binding commits before the
  // handler runs, so only this manager's connection sees `app.tenant_id`.
  const boundManager = {
    // runInTenantTransaction binds `app.tenant_id` through the manager's own
    // parameterised query before running the work callback.
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn(),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      async (work: (manager: EntityManager) => Promise<unknown>) =>
        work(boundManager),
    ),
  } as unknown as DataSource;

  const mockResponse: InboundSyncResponseDto = {
    status: 'success',
    serverTime: '2026-08-26T12:00:00.000Z',
    currentVersion: 1787745600000,
    deltas: {
      products: [],
      catalogValues: [],
      insumos: [],
      recipes: [],
      recipeVersions: [],
      users: [],
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundSyncController],
      providers: [
        { provide: InboundSyncService, useValue: inboundSyncService },
        { provide: DataSource, useValue: dataSource },
      ],
    })
      .overrideGuard(SyncTransportGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<InboundSyncController>(InboundSyncController);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException if tenantId is missing', async () => {
    await expect(
      controller.getDeltas(deviceRequest(), undefined, {}),
    ).rejects.toThrow(UnauthorizedException);
    await expect(controller.getDeltas(deviceRequest(), '', {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('delegates deltas query to InboundSyncService', async () => {
    inboundSyncService.getInboundDeltas.mockResolvedValue(mockResponse);

    const query = { sinceVersion: '100', terminalId: 'term-1' };
    const result = await controller.getDeltas(
      deviceRequest(),
      'tenant-123',
      query,
    );

    expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
      'tenant-123',
      query,
      undefined,
      boundManager,
    );
    expect(result).toEqual(mockResponse);
  });

  it('delegates catalog query to InboundSyncService', async () => {
    inboundSyncService.getInboundDeltas.mockResolvedValue(mockResponse);

    const query = { types: 'products,catalogValues' };
    const result = await controller.getCatalog(
      deviceRequest(),
      'tenant-123',
      query,
    );

    expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
      'tenant-123',
      query,
      undefined,
      boundManager,
    );
    expect(result).toEqual(mockResponse);
  });

  it('delegates root inbound query to InboundSyncService', async () => {
    inboundSyncService.getInboundDeltas.mockResolvedValue(mockResponse);

    const result = await controller.getRootInbound(
      deviceRequest(),
      'tenant-123',
      {},
    );

    expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
      'tenant-123',
      {},
      undefined,
      boundManager,
    );
    expect(result).toEqual(mockResponse);
  });

  it('binds the tenant context transaction with the authenticated tenant', async () => {
    inboundSyncService.getInboundDeltas.mockResolvedValue(mockResponse);

    await controller.getCatalog(deviceRequest(), 'tenant-123', {});

    // The transaction must be opened on the controller's own DataSource and
    // bound to the authenticated tenant, never to a query/body value.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses a blank tenant before opening any transaction', async () => {
    await expect(
      controller.getCatalog(deviceRequest(), '   ', {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(inboundSyncService.getInboundDeltas).not.toHaveBeenCalled();
  });

  it('delegates fiscal ACK to InboundSyncService', async () => {
    const ackPayload = {
      tenantId: 'tenant-123',
      terminalId: 'term-1',
      revision: 1,
      fingerprint: 'sha-hash',
      appliedAt: '2026-03-30T12:00:00Z',
    };
    const ackResponse = {
      status: 'success',
      acknowledgedRevision: 1,
      acknowledgedFingerprint: 'sha-hash',
    };
    (inboundSyncService as any).recordFiscalAck = jest
      .fn()
      .mockResolvedValue(ackResponse);

    const result = await controller.acknowledgeFiscalConfig(
      'tenant-123',
      ackPayload,
    );

    expect((inboundSyncService as any).recordFiscalAck).toHaveBeenCalledWith(
      'tenant-123',
      ackPayload,
    );
    expect(result).toEqual(ackResponse);
  });
  it('delegates the epoch acknowledgement with the authenticated principal', async () => {
    const expected = {
      status: 'ACCEPTED' as const,
      receiptId: 'receipt-1',
      sequence: '1',
      digest: 'sha256:' + 'a'.repeat(64),
      floorSequence: '1',
    };
    inboundSyncService.acknowledgeStaffPolicyEpoch.mockResolvedValue(expected);

    const result = await controller.acknowledgeStaffPolicyEpoch(
      deviceRequest(true),
      'tenant-123',
      ackDto,
    );

    expect(result).toEqual(expected);
    expect(inboundSyncService.acknowledgeStaffPolicyEpoch).toHaveBeenCalledWith(
      'tenant-123',
      expect.objectContaining({ deviceId: 'pos-terminal-01' }),
      ackDto,
    );
  });

  it('refuses an acknowledgement without an authenticated device principal', async () => {
    // Acknowledging for a terminal that did not authenticate is exactly the
    // forgery the principal exists to prevent.
    await expect(
      controller.acknowledgeStaffPolicyEpoch(
        deviceRequest(false),
        'tenant-123',
        ackDto,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(
      inboundSyncService.acknowledgeStaffPolicyEpoch,
    ).not.toHaveBeenCalled();
  });
});
