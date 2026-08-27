import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { InboundSyncController } from './inbound-sync.controller';
import { InboundSyncService } from '../services/inbound-sync.service';
import { InboundSyncResponseDto } from '../dto/inbound-sync.dto';

describe('InboundSyncController', () => {
  let controller: InboundSyncController;
  const inboundSyncService = {
    getInboundDeltas: jest.fn(),
  };

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
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<InboundSyncController>(InboundSyncController);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException if tenantId is missing', async () => {
    await expect(controller.getDeltas(undefined, {})).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(controller.getDeltas('', {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('delegates deltas query to InboundSyncService', async () => {
    inboundSyncService.getInboundDeltas.mockResolvedValue(mockResponse);

    const query = { sinceVersion: '100', terminalId: 'term-1' };
    const result = await controller.getDeltas('tenant-123', query);

    expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
      'tenant-123',
      query,
    );
    expect(result).toEqual(mockResponse);
  });

  it('delegates catalog query to InboundSyncService', async () => {
    inboundSyncService.getInboundDeltas.mockResolvedValue(mockResponse);

    const query = { types: 'products,catalogValues' };
    const result = await controller.getCatalog('tenant-123', query);

    expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
      'tenant-123',
      query,
    );
    expect(result).toEqual(mockResponse);
  });

  it('delegates root inbound query to InboundSyncService', async () => {
    inboundSyncService.getInboundDeltas.mockResolvedValue(mockResponse);

    const result = await controller.getRootInbound('tenant-123', {});

    expect(inboundSyncService.getInboundDeltas).toHaveBeenCalledWith(
      'tenant-123',
      {},
    );
    expect(result).toEqual(mockResponse);
  });
});
