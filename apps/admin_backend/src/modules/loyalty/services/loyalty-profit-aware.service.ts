import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RewardDefinition,
  RewardType,
} from '../entities/reward-definition.entity';
import { LoyaltyProgram } from '../entities/loyalty-program.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
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

interface BenefitConfigSnapshot {
  amountNio?: number;
  productId?: string;
  variantId?: string;
  quantity?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRewardType(raw: unknown, fallback: RewardType): RewardType {
  if (raw === RewardType.DISCOUNT_AMOUNT) {
    return RewardType.DISCOUNT_AMOUNT;
  }
  if (raw === RewardType.FREE_PRODUCT) {
    return RewardType.FREE_PRODUCT;
  }
  return fallback;
}

function getBenefitConfigSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): BenefitConfigSnapshot | null {
  if (!snapshot || !isRecord(snapshot.benefitConfig)) {
    return null;
  }
  const config = snapshot.benefitConfig;
  return {
    amountNio:
      typeof config.amountNio === 'number' ? config.amountNio : undefined,
    productId:
      typeof config.productId === 'string' ? config.productId : undefined,
    variantId:
      typeof config.variantId === 'string' ? config.variantId : undefined,
    quantity: typeof config.quantity === 'number' ? config.quantity : undefined,
  };
}

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
      const benefit = isRecord(reward.benefit_config)
        ? reward.benefit_config
        : null;
      const productId =
        typeof benefit?.productId === 'string' ? benefit.productId : undefined;
      const variantId =
        typeof benefit?.variantId === 'string' ? benefit.variantId : undefined;

      if (productId) {
        const costRes =
          await this.costQueryPort.getCurrentEstimatedCostAndPrice(
            tenantId,
            productId,
            variantId,
          );
        canonicalBasePrice = costRes.canonicalBasePriceNio ?? null;
        estimatedCpp =
          costRes.status === 'AVAILABLE'
            ? (costRes.estimatedCppNio ?? null)
            : null;
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
        const snapshot = tx.commercial_snapshot;
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

    const qualifiedSalesNio = calculateQualifiedSales(
      earnRecords,
      window,
      asOfUtc,
    );

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
        const snapshot = isRecord(tx.commercial_snapshot)
          ? tx.commercial_snapshot
          : null;
        const benefitConfig = getBenefitConfigSnapshot(snapshot);
        const rType = parseRewardType(snapshot?.rewardType, reward.reward_type);

        let appliedBenefitNio: number | null = null;
        let estimatedRedemptionCostNio: number | null = null;
        let costStatus: string | null = 'AVAILABLE';

        if (rType === RewardType.DISCOUNT_AMOUNT) {
          const snapshotBenefit =
            typeof snapshot?.appliedBenefitNio === 'number'
              ? snapshot.appliedBenefitNio
              : null;
          const configBenefit =
            typeof benefitConfig?.amountNio === 'number'
              ? benefitConfig.amountNio
              : null;
          appliedBenefitNio = snapshotBenefit ?? configBenefit;
        } else {
          // FREE_PRODUCT
          const snapshotQty =
            typeof snapshot?.rewardQuantity === 'number'
              ? snapshot.rewardQuantity
              : null;
          const configQty =
            typeof benefitConfig?.quantity === 'number'
              ? benefitConfig.quantity
              : null;
          const rewardQty = snapshotQty ?? configQty ?? 1;

          const snapshotRedemptionCost =
            typeof snapshot?.estimatedRedemptionCostNio === 'number'
              ? snapshot.estimatedRedemptionCostNio
              : null;
          const snapshotUnitCost =
            typeof snapshot?.estimatedUnitCostNioAtRedemption === 'number'
              ? snapshot.estimatedUnitCostNioAtRedemption
              : null;

          if (snapshotRedemptionCost !== null) {
            estimatedRedemptionCostNio = snapshotRedemptionCost;
          } else if (snapshotUnitCost !== null) {
            estimatedRedemptionCostNio = snapshotUnitCost * rewardQty;
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
          rewardType: rType,
          occurredAt: tx.occurred_at ?? tx.created_at,
          appliedBenefitNio,
          estimatedRedemptionCostNio,
          costStatus,
          isReversed: reversedTxIds.has(tx.id),
        });
      }
    }

    const estimatedIncentiveCostInWindowNio =
      calculateEstimatedIncentiveCostInWindow(redeemRecords, window, asOfUtc);

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
