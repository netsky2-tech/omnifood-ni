import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardDefinition, RewardType } from '../entities/reward-definition.entity';
import { LoyaltyProgram } from '../entities/loyalty-program.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../../customers/entities/customer-point-transaction.entity';
import {
  INVENTORY_COST_QUERY_PORT,
  InventoryCostQueryPort,
} from '../domain/inventory-cost-query.port';
import {
  computeProfitAwareWindow,
  calculateRewardCostMetrics,
  calculateQualifiedSales,
  calculateEstimatedIncentiveCostInWindow,
  calculateEffectiveIncentiveRate,
  RewardProfitAwareView,
  EarnTransactionRecord,
  RedeemTransactionRecord,
} from '../domain/profit-aware-metrics';

@Injectable()
export class LoyaltyProfitAwareService {
  constructor(
    @InjectRepository(RewardDefinition)
    private readonly rewardRepo: Repository<RewardDefinition>,
    @InjectRepository(LoyaltyProgram)
    private readonly programRepo: Repository<LoyaltyProgram>,
    @InjectRepository(CustomerPointTransaction)
    private readonly txRepo: Repository<CustomerPointTransaction>,
    @Inject(INVENTORY_COST_QUERY_PORT)
    private readonly costQueryPort: InventoryCostQueryPort,
  ) {}

  async getRewardProfitAwareMetrics(
    tenantId: string,
    rewardId: string,
    asOfInput?: Date | string,
  ): Promise<RewardProfitAwareView> {
    const reward = await this.rewardRepo.findOne({
      where: { id: rewardId, tenant_id: tenantId },
    });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    const program = await this.programRepo.findOne({
      where: { id: reward.loyalty_program_id, tenant_id: tenantId },
    });
    if (!program) {
      throw new NotFoundException('Loyalty program not found');
    }

    const asOfUtc = asOfInput ? new Date(asOfInput) : new Date();
    const window = computeProfitAwareWindow(asOfUtc);

    // 1. Resolve product cost and price for FREE_PRODUCT
    let canonicalBasePrice: number | null | undefined = null;
    let estimatedCpp: number | null | undefined = null;

    if (reward.reward_type === RewardType.FREE_PRODUCT) {
      const benefit = reward.benefit_config as Record<string, unknown>;
      const productId = benefit?.productId as string;
      const variantId = benefit?.variantId as string | undefined;

      if (productId) {
        const costRes = await this.costQueryPort.getCurrentEstimatedCostAndPrice(
          tenantId,
          productId,
          variantId,
        );
        canonicalBasePrice = costRes.canonicalBasePriceNio ?? null;
        estimatedCpp = costRes.status === 'AVAILABLE' ? (costRes.estimatedCppNio ?? null) : null;
      }
    }

    const costMetrics = calculateRewardCostMetrics({
      rewardType: reward.reward_type,
      benefitConfig: reward.benefit_config,
      canonicalBasePrice,
      estimatedCpp,
      asOfUtc,
    });

    // 2. Query program transactions for qualified sales
    const programTxs = await this.txRepo.find({
      where: {
        tenant_id: tenantId,
        loyalty_program_id: program.id,
      },
    });

    // Identify reversals that occurred on or before asOfUtc
    const reversedTxIds = new Set<string>();
    for (const tx of programTxs) {
      const type = (tx.transaction_type as string)?.toLowerCase();
      const occurred = tx.occurred_at ?? tx.created_at;
      if (
        type === 'reversal' &&
        tx.reversal_of_transaction_id &&
        occurred <= asOfUtc
      ) {
        reversedTxIds.add(tx.reversal_of_transaction_id);
      }
    }

    const earnRecords: EarnTransactionRecord[] = [];
    for (const tx of programTxs) {
      const type = (tx.transaction_type as string)?.toLowerCase();
      if (type === 'earn') {
        const snapshot = tx.commercial_snapshot as Record<string, unknown> | null;
        const earningBase =
          snapshot?.earningBaseNio != null
            ? Number(snapshot.earningBaseNio)
            : snapshot?.eligibleSpendNio != null
              ? Number(snapshot.eligibleSpendNio)
              : null;

        earnRecords.push({
          id: tx.id,
          programId: program.id,
          units: tx.units ?? 0,
          occurredAt: tx.occurred_at ?? tx.created_at,
          earningBaseNio: earningBase,
          isReversed: reversedTxIds.has(tx.id),
        });
      }
    }

    const qualifiedSalesNio = calculateQualifiedSales(earnRecords, window, asOfUtc);

    // 3. Query reward transactions for incentive cost
    const rewardTxs = await this.txRepo.find({
      where: {
        tenant_id: tenantId,
        reward_id: reward.id,
      },
    });

    const redeemRecords: RedeemTransactionRecord[] = [];
    for (const tx of rewardTxs) {
      const type = (tx.transaction_type as string)?.toLowerCase();
      if (type === 'redeem') {
        const snapshot = tx.commercial_snapshot as Record<string, unknown> | null;
        const rType =
          (snapshot?.rewardType as string) ?? reward.reward_type;

        let appliedBenefitNio: number | null = null;
        let estimatedRedemptionCostNio: number | null = null;
        let costStatus: string | null = 'AVAILABLE';

        if (rType === RewardType.DISCOUNT_AMOUNT) {
          appliedBenefitNio =
            snapshot?.appliedBenefitNio != null
              ? Number(snapshot.appliedBenefitNio)
              : (snapshot?.benefitConfig as any)?.amountNio != null
                ? Number((snapshot?.benefitConfig as any).amountNio)
                : null;
        } else {
          // FREE_PRODUCT
          const rewardQty = Number(
            snapshot?.rewardQuantity ?? (snapshot?.benefitConfig as any)?.quantity ?? 1,
          );
          if (snapshot?.estimatedRedemptionCostNio != null) {
            estimatedRedemptionCostNio = Number(snapshot.estimatedRedemptionCostNio);
          } else if (snapshot?.estimatedUnitCostNioAtRedemption != null) {
            estimatedRedemptionCostNio =
              Number(snapshot.estimatedUnitCostNioAtRedemption) * rewardQty;
          } else if (estimatedCpp !== null && estimatedCpp !== undefined) {
            // Fallback to current estimated CPP if available
            estimatedRedemptionCostNio = estimatedCpp * rewardQty;
          } else {
            costStatus = 'NOT_AVAILABLE';
          }
        }

        redeemRecords.push({
          id: tx.id,
          rewardId: reward.id,
          rewardType: rType as any,
          occurredAt: tx.occurred_at ?? tx.created_at,
          appliedBenefitNio,
          estimatedRedemptionCostNio,
          costStatus,
          isReversed: reversedTxIds.has(tx.id),
        });
      }
    }

    const estimatedIncentiveCostInWindowNio = calculateEstimatedIncentiveCostInWindow(
      redeemRecords,
      window,
      asOfUtc,
    );

    const effectiveIncentiveRatePct = calculateEffectiveIncentiveRate(
      estimatedIncentiveCostInWindowNio,
      qualifiedSalesNio,
      asOfUtc,
    );

    return {
      rewardId: reward.id,
      programId: program.id,
      asOfUtc: asOfUtc.toISOString(),
      window,
      retailPriceNio: costMetrics.retailPriceNio,
      estimatedCppNio: costMetrics.estimatedCppNio,
      estimatedRewardCostNio: costMetrics.estimatedRewardCostNio,
      qualifiedSalesNio,
      estimatedIncentiveCostInWindowNio,
      effectiveIncentiveRatePct,
    };
  }
}
