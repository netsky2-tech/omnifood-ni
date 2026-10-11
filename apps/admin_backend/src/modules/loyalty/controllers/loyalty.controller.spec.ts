import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from '../services/loyalty.service';
import { TicketPaidHandler } from '../services/ticket-paid.handler';
import { LegacyClassificationService } from '../services/legacy-classification.service';
import { LoyaltyProgramBackfillService } from '../services/loyalty-program-backfill.service';
import { LoyaltyProfitAwareService } from '../services/loyalty-profit-aware.service';
import { RedemptionService } from '../services/redemption.service';
import { LoyaltyLedgerService } from '../services/loyalty-ledger.service';
import { UserRole } from '../../identity/entities/user.entity';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../entities/loyalty-program.entity';

function createMockProgram(
  id: string,
  tenantId: string,
  status: LoyaltyProgramStatus,
): LoyaltyProgram {
  const program = new LoyaltyProgram();
  program.id = id;
  program.tenant_id = tenantId;
  program.name = 'Test Loyalty Program';
  program.program_type = LoyaltyProgramType.SPEND_POINTS;
  program.status = status;
  program.earning_rule = {};
  program.eligibility_rule = {};
  program.config_version = 1;
  program.rewards = [];
  program.created_at = new Date('2025-01-01T00:00:00.000Z');
  program.updated_at = new Date('2025-01-01T00:00:00.000Z');
  return program;
}

describe('LoyaltyController', () => {
  let controller: LoyaltyController;
  let loyaltyService: jest.Mocked<Pick<LoyaltyService, 'findAllPrograms'>>;
  let programBackfillService: jest.Mocked<
    Pick<LoyaltyProgramBackfillService, 'previewBackfill' | 'commitBackfill'>
  >;

  beforeEach(() => {
    loyaltyService = {
      findAllPrograms: jest.fn(),
    };

    programBackfillService = {
      previewBackfill: jest.fn(),
      commitBackfill: jest.fn(),
    };

    const ticketPaidHandler = {} as unknown as TicketPaidHandler;
    const legacyClassificationService =
      {} as unknown as LegacyClassificationService;
    const profitAwareService = {} as unknown as LoyaltyProfitAwareService;
    const redemptionService = {} as unknown as RedemptionService;
    const ledgerService = {} as unknown as LoyaltyLedgerService;

    controller = new LoyaltyController(
      loyaltyService as unknown as LoyaltyService,
      ticketPaidHandler,
      legacyClassificationService,
      profitAwareService,
      redemptionService,
      ledgerService,
      programBackfillService as unknown as LoyaltyProgramBackfillService,
    );
  });

  describe('findAllPrograms - status query parameter and tenant isolation', () => {
    const tenantId = 'tenant-uuid-1';

    it('allows absent status (undefined) and leaves status undefined without broadening', async () => {
      const expectedPrograms: LoyaltyProgram[] = [
        createMockProgram('p-1', tenantId, LoyaltyProgramStatus.ACTIVE),
        createMockProgram('p-2', tenantId, LoyaltyProgramStatus.DRAFT),
      ];
      loyaltyService.findAllPrograms.mockResolvedValueOnce(expectedPrograms);

      const result = await controller.findAllPrograms(
        undefined,
        undefined,
        tenantId,
      );

      expect(result).toEqual(expectedPrograms);
      expect(loyaltyService.findAllPrograms).toHaveBeenCalledTimes(1);
      expect(loyaltyService.findAllPrograms).toHaveBeenCalledWith(tenantId, {
        status: undefined,
        program_type: undefined,
      });
    });

    it.each([
      LoyaltyProgramStatus.ACTIVE,
      LoyaltyProgramStatus.DRAFT,
      LoyaltyProgramStatus.INACTIVE,
    ])('passes valid enum status unchanged: %s', async (validStatus) => {
      const expectedPrograms: LoyaltyProgram[] = [
        createMockProgram('p-1', tenantId, validStatus),
      ];
      loyaltyService.findAllPrograms.mockResolvedValueOnce(expectedPrograms);

      const result = await controller.findAllPrograms(
        validStatus,
        'SPEND_POINTS',
        tenantId,
      );

      expect(result).toEqual(expectedPrograms);
      expect(loyaltyService.findAllPrograms).toHaveBeenCalledTimes(1);
      expect(loyaltyService.findAllPrograms).toHaveBeenCalledWith(tenantId, {
        status: validStatus,
        program_type: 'SPEND_POINTS',
      });
    });

    it('rejects invalid nonempty status with BadRequestException and does not query service', async () => {
      await expect(
        controller.findAllPrograms('INVALID_STATUS', undefined, tenantId),
      ).rejects.toThrow(BadRequestException);

      expect(loyaltyService.findAllPrograms).not.toHaveBeenCalled();
    });

    it('rejects empty string status with BadRequestException and does not query service', async () => {
      await expect(
        controller.findAllPrograms('', undefined, tenantId),
      ).rejects.toThrow(BadRequestException);

      expect(loyaltyService.findAllPrograms).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when tenantId is missing', async () => {
      await expect(
        controller.findAllPrograms(
          LoyaltyProgramStatus.ACTIVE,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(loyaltyService.findAllPrograms).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when tenantId is empty string', async () => {
      await expect(
        controller.findAllPrograms(undefined, undefined, ''),
      ).rejects.toThrow(UnauthorizedException);

      expect(loyaltyService.findAllPrograms).not.toHaveBeenCalled();
    });

    it('enforces tenant isolation by passing isolated tenantId to the service', async () => {
      const tenantAlpha = 'tenant-alpha';
      const tenantBeta = 'tenant-beta';

      loyaltyService.findAllPrograms.mockResolvedValue([]);

      await controller.findAllPrograms(
        LoyaltyProgramStatus.ACTIVE,
        undefined,
        tenantAlpha,
      );
      expect(loyaltyService.findAllPrograms).toHaveBeenLastCalledWith(
        tenantAlpha,
        {
          status: LoyaltyProgramStatus.ACTIVE,
          program_type: undefined,
        },
      );

      await controller.findAllPrograms(
        LoyaltyProgramStatus.ACTIVE,
        undefined,
        tenantBeta,
      );
      expect(loyaltyService.findAllPrograms).toHaveBeenLastCalledWith(
        tenantBeta,
        {
          status: LoyaltyProgramStatus.ACTIVE,
          program_type: undefined,
        },
      );

      expect(loyaltyService.findAllPrograms).toHaveBeenCalledTimes(2);
    });
  });

  describe('backfill-unassigned routes (B1b)', () => {
    const tenantId = 'tenant-uuid-1';

    it('wires the preview route to the backfill service with the tenant and batch size', async () => {
      programBackfillService.previewBackfill.mockResolvedValueOnce({
        customersScanned: 0,
        transactionsAttributed: 0,
        customersAttributed: 0,
        unresolved: [],
        dryRun: true,
      });

      await controller.previewBackfillUnassigned({ batchSize: 50 }, tenantId);

      expect(programBackfillService.previewBackfill).toHaveBeenCalledTimes(1);
      expect(programBackfillService.previewBackfill).toHaveBeenCalledWith(
        tenantId,
        50,
      );
    });

    it('wires the commit route to the backfill service with tenant, batch size and actor', async () => {
      programBackfillService.commitBackfill.mockResolvedValueOnce({
        customersScanned: 0,
        transactionsAttributed: 0,
        customersAttributed: 0,
        unresolved: [],
        dryRun: false,
      });

      await controller.commitBackfillUnassigned(
        { batchSize: 25 },
        tenantId,
        'actor-1',
      );

      expect(programBackfillService.commitBackfill).toHaveBeenCalledTimes(1);
      expect(programBackfillService.commitBackfill).toHaveBeenCalledWith(
        tenantId,
        25,
        'actor-1',
      );
    });

    it('rejects preview without tenant context before hitting the service', async () => {
      await expect(
        controller.previewBackfillUnassigned({ batchSize: 50 }, undefined),
      ).rejects.toThrow(UnauthorizedException);
      expect(programBackfillService.previewBackfill).not.toHaveBeenCalled();
    });

    it('rejects commit without tenant context before hitting the service', async () => {
      await expect(
        controller.commitBackfillUnassigned(
          { batchSize: 50 },
          undefined,
          'actor-1',
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(programBackfillService.commitBackfill).not.toHaveBeenCalled();
    });

    it('restricts both backfill routes to OWNER', () => {
      const previewRoles = Reflect.getMetadata(
        ROLES_KEY,
        LoyaltyController.prototype.previewBackfillUnassigned,
      );
      const commitRoles = Reflect.getMetadata(
        ROLES_KEY,
        LoyaltyController.prototype.commitBackfillUnassigned,
      );

      expect(previewRoles).toEqual([UserRole.OWNER]);
      expect(commitRoles).toEqual([UserRole.OWNER]);
    });
  });
});
