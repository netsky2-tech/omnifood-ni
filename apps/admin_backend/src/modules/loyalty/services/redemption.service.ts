import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
} from '../entities/loyalty-program.entity';
import {
  RewardDefinition,
  RewardStatus,
} from '../entities/reward-definition.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyTicketSnapshot } from '../domain/loyalty-ticket-snapshot';
import {
  RedemptionIntent,
  RewardApplication,
} from '../domain/redemption-intent';

@Injectable()
export class RedemptionService {
  private readonly intents = new Map<string, RedemptionIntent>();

  constructor(
    @InjectRepository(LoyaltyProgram)
    private readonly programRepo: Repository<LoyaltyProgram>,
    @InjectRepository(RewardDefinition)
    private readonly rewardRepo: Repository<RewardDefinition>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerPointTransaction)
    private readonly txRepo: Repository<CustomerPointTransaction>,
    private readonly ledgerService: LoyaltyLedgerService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async createRedemptionIntent(params: {
    tenantId: string;
    customerId: string;
    ticketId: string;
    loyaltyProgramId: string;
    rewardId: string;
  }): Promise<RedemptionIntent> {
    const { tenantId, customerId, ticketId, loyaltyProgramId, rewardId } =
      params;

    // 1. Customer must exist and be active
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, tenant_id: tenantId },
    });
    if (!customer || !customer.is_active) {
      throw new NotFoundException('Customer not found or inactive');
    }

    // 2. Program must be ACTIVE
    const program = await this.programRepo.findOne({
      where: { id: loyaltyProgramId, tenant_id: tenantId },
    });
    if (!program) {
      throw new NotFoundException('Loyalty program not found');
    }
    if (program.status !== LoyaltyProgramStatus.ACTIVE) {
      throw new BadRequestException(
        `Program is ${program.status.toLowerCase()}, not active`,
      );
    }

    // 3. Reward must be ACTIVE and within its window
    const reward = await this.rewardRepo.findOne({
      where: {
        id: rewardId,
        tenant_id: tenantId,
        loyalty_program_id: loyaltyProgramId,
      },
    });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }
    if (reward.status !== RewardStatus.ACTIVE) {
      throw new BadRequestException('Reward is inactive');
    }

    const now = new Date();
    if (reward.starts_at && now < reward.starts_at) {
      throw new BadRequestException(
        'Reward is not yet available (not within window)',
      );
    }
    if (reward.ends_at && now >= reward.ends_at) {
      throw new BadRequestException('Reward has expired');
    }

    // 4. Balance must be sufficient
    const balance = await this.loyaltyService.getCustomerBalance(
      tenantId,
      customerId,
      loyaltyProgramId,
    );
    if (balance.balanceUnits < reward.cost_units) {
      throw new BadRequestException(
        `Insufficient balance: have ${balance.balanceUnits}, need ${reward.cost_units}`,
      );
    }

    // 5. One redemption per ticket constraint
    for (const intent of this.intents.values()) {
      if (
        intent.tenantId === tenantId &&
        intent.ticketId === ticketId &&
        intent.status !== 'VOIDED'
      ) {
        throw new ConflictException(
          'A redemption intent already exists for this ticket',
        );
      }
    }

    // 6. Build application
    const application: RewardApplication = {
      rewardId: reward.id,
      rewardType: reward.reward_type,
      benefitConfig: { ...reward.benefit_config },
      costUnits: reward.cost_units,
    };

    // 7. Create intent (DOES NOT consume balance)
    const intent: RedemptionIntent = {
      id: randomUUID(),
      tenantId,
      customerId,
      ticketId,
      loyaltyProgramId,
      rewardId: reward.id,
      rewardVersion: reward.config_version,
      application,
      status: 'PENDING',
      createdAt: now,
    };

    this.intents.set(intent.id, intent);
    return intent;
  }

  async consolidateRedemption(
    tenantId: string,
    intentId: string,
    snapshot: LoyaltyTicketSnapshot,
  ): Promise<{
    redeemTransaction: CustomerPointTransaction;
    alreadyConsolidated: boolean;
  }> {
    const intent = this.intents.get(intentId);
    if (!intent || intent.tenantId !== tenantId) {
      throw new NotFoundException('Redemption intent not found');
    }

    if (intent.status === 'CONSUMED') {
      return { redeemTransaction: null, alreadyConsolidated: true };
    }

    if (intent.status === 'VOIDED') {
      throw new BadRequestException('Intent has been voided');
    }

    if (intent.status !== 'PENDING' && intent.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Cannot consolidate intent in current status',
      );
    }

    // Create REDEEM transaction with idempotency key
    const idempotencyKey = `loyalty:redeem:${tenantId}:${intent.ticketId}`;

    const benefitConfig = intent.application.benefitConfig;
    const rewardType = intent.application.rewardType;
    const commercialSnapshot: Record<string, unknown> = {
      rewardType,
      benefitConfig: intent.application.benefitConfig,
      costUnits: intent.application.costUnits,
    };

    if (rewardType === 'DISCOUNT_AMOUNT') {
      commercialSnapshot.appliedBenefitNio = Number(
        benefitConfig?.amountNio ?? 0,
      );
    } else if (rewardType === 'FREE_PRODUCT') {
      commercialSnapshot.rewardProductId = benefitConfig?.productId;
      commercialSnapshot.rewardVariantId = benefitConfig?.variantId;
      commercialSnapshot.rewardQuantity = Number(benefitConfig?.quantity ?? 1);
    }

    const redeemTx = await this.ledgerService.appendTransaction({
      tenantId,
      customerId: intent.customerId,
      loyaltyProgramId: intent.loyaltyProgramId,
      ticketId: intent.ticketId,
      rewardId: intent.rewardId,
      transactionType: 'REDEEM',
      units: -intent.application.costUnits,
      idempotencyKey,
      sourceEventId: intent.ticketId,
      branchId: snapshot.branchId,
      terminalId: snapshot.terminalId,
      rewardVersion: intent.rewardVersion,
      commercialSnapshot,
      origin: 'POS',
      occurredAt: snapshot.paidAt,
    });

    // Mark intent as consumed
    intent.status = 'CONSUMED';
    this.intents.set(intentId, intent);

    return { redeemTransaction: redeemTx, alreadyConsolidated: false };
  }

  voidIntent(tenantId: string, intentId: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (!intent || intent.tenantId !== tenantId) {
      return Promise.reject(
        new NotFoundException('Redemption intent not found'),
      );
    }

    if (intent.status === 'CONSUMED') {
      return Promise.reject(
        new BadRequestException('Cannot void a consumed intent'),
      );
    }

    intent.status = 'VOIDED';
    this.intents.set(intentId, intent);
    return Promise.resolve();
  }

  getIntent(tenantId: string, intentId: string): Promise<RedemptionIntent> {
    const intent = this.intents.get(intentId);
    if (!intent || intent.tenantId !== tenantId) {
      return Promise.reject(
        new NotFoundException('Redemption intent not found'),
      );
    }
    return Promise.resolve(intent);
  }

  async reverseTicketLoyalty(
    tenantId: string,
    ticketId: string,
    customerId: string,
  ): Promise<CustomerPointTransaction[]> {
    // Find all non-reversed EARN and REDEEM transactions for this ticket
    const movements = await this.txRepo.find({
      where: {
        tenant_id: tenantId,
        ticket_id: ticketId,
        customer_id: customerId,
      },
    });

    // Filter to EARN and REDEEM, exclude already-reversed
    const reversible = movements.filter((m) => {
      const txType = (m.transaction_type as string)?.toLowerCase();
      return (
        (txType === 'earn' || txType === 'redeem') &&
        !movements.some(
          (r) =>
            (r.transaction_type as string)?.toLowerCase() === 'reversal' &&
            r.reversal_of_transaction_id === m.id,
        )
      );
    });

    if (reversible.length === 0) return [];

    const reversals: CustomerPointTransaction[] = [];

    for (const movement of reversible) {
      const idempotencyKey = `loyalty:reversal:${tenantId}:${movement.id}`;

      // Check if already reversed (idempotency)
      const existing = await this.txRepo.findOne({
        where: { idempotency_key: idempotencyKey, tenant_id: tenantId },
      });
      if (existing) continue;

      const reversal = await this.ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: movement.loyalty_program_id,
        ticketId,
        transactionType: 'REVERSAL',
        units: -Number(movement.units ?? 0),
        reversalOfTransactionId: movement.id,
        idempotencyKey,
        sourceEventId: ticketId,
        branchId: movement.branch_id ?? undefined,
        terminalId: movement.terminal_id ?? undefined,
        programVersion: movement.program_version ?? undefined,
        rewardVersion: movement.reward_version ?? undefined,
        commercialSnapshot: {
          reversedFrom: movement.transaction_type,
          originalUnits: movement.units,
        },
        origin: 'POS',
        occurredAt: new Date(),
      });

      reversals.push(reversal);
    }

    return reversals;
  }
}
