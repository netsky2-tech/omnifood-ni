import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { LoyaltyService } from '../services/loyalty.service';
import { LoyaltyProfitAwareService } from '../services/loyalty-profit-aware.service';
import { CreateLoyaltyProgramDto } from '../dto/loyalty-program.dto';
import { UpdateLoyaltyProgramDto } from '../dto/loyalty-program.dto';
import { CreateRewardDefinitionDto } from '../dto/reward-definition.dto';
import { UpdateRewardDefinitionDto } from '../dto/reward-definition.dto';
import {
  LoyaltyTicketSnapshotDto,
  ClassifyLegacyDto,
} from '../dto/loyalty-ticket.dto';
import { TicketPaidHandler } from '../services/ticket-paid.handler';
import { LegacyClassificationService } from '../services/legacy-classification.service';
import { RedemptionService } from '../services/redemption.service';
import { LoyaltyLedgerService } from '../services/loyalty-ledger.service';
import {
  CreateRedemptionIntentDto,
  ConsolidateRedemptionDto,
  ReverseTicketLoyaltyDto,
  ManualLoyaltyAdjustmentDto,
} from '../dto/redemption.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { LoyaltyProgramStatus } from '../entities/loyalty-program.entity';

const LOYALTY_PROGRAM_STATUSES: readonly string[] =
  Object.values(LoyaltyProgramStatus);

function isLoyaltyProgramStatus(value: string): value is LoyaltyProgramStatus {
  return LOYALTY_PROGRAM_STATUSES.includes(value);
}

function parseLoyaltyProgramStatus(
  status?: string,
): LoyaltyProgramStatus | undefined {
  if (status === undefined) {
    return undefined;
  }
  if (isLoyaltyProgramStatus(status)) {
    return status;
  }
  throw new BadRequestException(`Invalid loyalty program status: ${status}`);
}

@Controller('loyalty')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class LoyaltyController {
  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly ticketPaidHandler: TicketPaidHandler,
    private readonly legacyClassificationService: LegacyClassificationService,
    private readonly profitAwareService: LoyaltyProfitAwareService,
    private readonly redemptionService: RedemptionService,
    private readonly ledgerService: LoyaltyLedgerService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  // --- Programs ---

  @Get('programs')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async findAllPrograms(
    @Query('status') status?: string,
    @Query('program_type') programType?: string,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenant = this.requireTenant(tenantId);
    const programStatus = parseLoyaltyProgramStatus(status);
    return this.loyaltyService.findAllPrograms(validTenant, {
      status: programStatus,
      program_type: programType,
    });
  }

  @Get('programs/:programId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async findOneProgram(
    @Param('programId') programId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.findOneProgram(
      this.requireTenant(tenantId),
      programId,
    );
  }

  @Post('programs')
  @Roles(UserRole.OWNER)
  async createProgram(
    @Body() dto: CreateLoyaltyProgramDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.createProgram(this.requireTenant(tenantId), dto);
  }

  @Patch('programs/:programId')
  @Roles(UserRole.OWNER)
  async updateProgram(
    @Param('programId') programId: string,
    @Body() dto: UpdateLoyaltyProgramDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.updateProgram(
      this.requireTenant(tenantId),
      programId,
      dto,
    );
  }

  @Post('programs/:programId/activate')
  @Roles(UserRole.OWNER)
  async activateProgram(
    @Param('programId') programId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.activateProgram(
      this.requireTenant(tenantId),
      programId,
    );
  }

  @Post('programs/:programId/deactivate')
  @Roles(UserRole.OWNER)
  async deactivateProgram(
    @Param('programId') programId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.deactivateProgram(
      this.requireTenant(tenantId),
      programId,
    );
  }

  // --- Rewards ---

  @Get('programs/:programId/rewards')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async findRewardsByProgram(
    @Param('programId') programId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.findRewardsByProgram(
      this.requireTenant(tenantId),
      programId,
    );
  }

  @Get('rewards/:rewardId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async findOneReward(
    @Param('rewardId') rewardId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.findOneReward(
      this.requireTenant(tenantId),
      rewardId,
    );
  }

  @Post('programs/:programId/rewards')
  @Roles(UserRole.OWNER)
  async createReward(
    @Param('programId') programId: string,
    @Body() dto: CreateRewardDefinitionDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.createReward(
      this.requireTenant(tenantId),
      programId,
      dto,
    );
  }

  @Patch('rewards/:rewardId')
  @Roles(UserRole.OWNER)
  async updateReward(
    @Param('rewardId') rewardId: string,
    @Body() dto: UpdateRewardDefinitionDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.updateReward(
      this.requireTenant(tenantId),
      rewardId,
      dto,
    );
  }

  @Post('rewards/:rewardId/activate')
  @Roles(UserRole.OWNER)
  async activateReward(
    @Param('rewardId') rewardId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.activateReward(
      this.requireTenant(tenantId),
      rewardId,
    );
  }

  @Post('rewards/:rewardId/deactivate')
  @Roles(UserRole.OWNER)
  async deactivateReward(
    @Param('rewardId') rewardId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.deactivateReward(
      this.requireTenant(tenantId),
      rewardId,
    );
  }

  // --- Profit-aware Reward Metrics (LV1.6) ---

  @Get('rewards/:rewardId/profit-aware')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getRewardProfitAwareMetrics(
    @Param('rewardId') rewardId: string,
    @Query('as_of') asOf?: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.profitAwareService.getRewardProfitAwareMetrics(
      this.requireTenant(tenantId),
      rewardId,
      asOf,
    );
  }

  // --- Customer Loyalty ---

  @Get('customers/:customerId/balance')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getCustomerBalance(
    @Param('customerId') customerId: string,
    @Query('program_id') programId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.getCustomerBalance(
      this.requireTenant(tenantId),
      customerId,
      programId,
    );
  }

  @Get('customers/:customerId/accounts')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getCustomerAccounts(
    @Param('customerId') customerId: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.getCustomerLoyaltyAccounts(
      this.requireTenant(tenantId),
      customerId,
    );
  }

  @Get('customers/:customerId/transactions')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getCustomerTransactions(
    @Param('customerId') customerId: string,
    @Query('program_id') programId?: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.loyaltyService.getCustomerTransactions(
      this.requireTenant(tenantId),
      customerId,
      programId,
    );
  }

  // --- Earning ---

  @Post('earning')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async processTicketEarning(
    @Body() dto: LoyaltyTicketSnapshotDto,
    @GetTenantId() tenantId?: string,
  ) {
    this.requireTenant(tenantId);
    const snapshot = { ...dto, tenantId: tenantId };
    const results = await this.ticketPaidHandler.handle(snapshot);
    return { processed: results.length, results };
  }

  // --- Legacy Classification ---

  @Post('classify-legacy')
  @Roles(UserRole.OWNER)
  async classifyLegacy(
    @Body() dto: ClassifyLegacyDto,
    @GetTenantId() tenantId?: string,
  ) {
    this.requireTenant(tenantId);
    const result =
      await this.legacyClassificationService.classifyLegacyTransactions(
        this.requireTenant(tenantId),
        dto.batchSize,
      );
    return result;
  }

  // --- Redemptions (LV1.3 / LV1.7) ---

  @Post('redemptions/intent')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async createRedemptionIntent(
    @Body() dto: CreateRedemptionIntentDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.redemptionService.createRedemptionIntent({
      tenantId: this.requireTenant(tenantId),
      customerId: dto.customerId,
      ticketId: dto.ticketId,
      loyaltyProgramId: dto.loyaltyProgramId,
      rewardId: dto.rewardId,
    });
  }

  @Post('redemptions/consolidate')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async consolidateRedemption(
    @Body() dto: ConsolidateRedemptionDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenant = this.requireTenant(tenantId);
    const snapshot = {
      ...dto.snapshot,
      tenantId: validTenant,
    };
    return this.redemptionService.consolidateRedemption(
      validTenant,
      dto.intentId,
      snapshot,
    );
  }

  @Post('redemptions/:intentId/void')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async voidRedemptionIntent(
    @Param('intentId') intentId: string,
    @GetTenantId() tenantId?: string,
  ) {
    await this.redemptionService.voidIntent(
      this.requireTenant(tenantId),
      intentId,
    );
    return { success: true, intentId, status: 'VOIDED' };
  }

  // --- Reversals (LV1.3 / LV1.7) ---

  @Post('reversals')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async reverseTicketLoyalty(
    @Body() dto: ReverseTicketLoyaltyDto,
    @GetTenantId() tenantId?: string,
  ) {
    const reversals = await this.redemptionService.reverseTicketLoyalty(
      this.requireTenant(tenantId),
      dto.ticketId,
      dto.customerId,
    );
    return { processed: reversals.length, reversals };
  }

  // --- V1 Manual Adjustment (AV-10, LV1.7A) ---

  @Post('customers/:customerId/adjust')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async adjustCustomerLoyalty(
    @Param('customerId') customerId: string,
    @Body() dto: ManualLoyaltyAdjustmentDto,
    @GetTenantId() tenantId?: string,
    @CurrentUser('sub') actorUserId?: string,
  ) {
    const validTenant = this.requireTenant(tenantId);
    const idempotencyKey = `loyalty:adjust:${validTenant}:${customerId}:${Date.now()}`;
    const tx = await this.ledgerService.appendTransaction({
      tenantId: validTenant,
      customerId,
      loyaltyProgramId: dto.loyaltyProgramId,
      ticketId: dto.ticketId,
      transactionType: 'ADJUST',
      units: dto.units,
      reason: dto.reason,
      actorUserId: actorUserId ?? undefined,
      origin: 'CLOUD',
      idempotencyKey,
      occurredAt: new Date(),
    });
    return { success: true, transaction: tx };
  }
}
