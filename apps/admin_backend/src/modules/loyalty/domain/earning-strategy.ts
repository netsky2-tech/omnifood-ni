import { LoyaltyTicketSnapshot, LoyaltyTicketLine, EarningResult } from './loyalty-ticket-snapshot';
import { LoyaltyProgram } from '../entities/loyalty-program.entity';

export interface EarningStrategy {
  evaluate(snapshot: LoyaltyTicketSnapshot, program: LoyaltyProgram): EarningResult | null;
}

export class SpendPointsStrategy implements EarningStrategy {
  evaluate(snapshot: LoyaltyTicketSnapshot, program: LoyaltyProgram): EarningResult | null {
    const rule = program.earning_rule as Record<string, unknown>;
    const spendBlockNio = Number(rule.spendBlockNio ?? 10);
    const pointsPerBlock = Number(rule.pointsPerBlock ?? 1);

    const eligibleSpend = snapshot.lines
      .filter((l) => l.source === 'NORMAL')
      .reduce((sum, l) => sum + l.merchandiseNetNioAfterAllBenefits, 0);

    if (eligibleSpend <= 0) return null;

    const earned = Math.floor(eligibleSpend / spendBlockNio) * pointsPerBlock;
    if (earned <= 0) return null;

    return {
      programId: program.id,
      programVersion: program.config_version,
      units: earned,
      strategy: 'SPEND_POINTS',
      commercialSnapshot: {
        earningBaseNio: eligibleSpend,
        eligibleSpendNio: eligibleSpend,
        spendBlockNio,
        pointsPerBlock,
      },
    };
  }
}

export class ProductStampsStrategy implements EarningStrategy {
  evaluate(snapshot: LoyaltyTicketSnapshot, program: LoyaltyProgram): EarningResult | null {
    const rule = program.earning_rule as Record<string, unknown>;
    const eligibleProductIds = (rule.eligibleProductIds as string[]) ?? [];
    const eligibleCategoryIds = (rule.eligibleCategoryIds as string[]) ?? [];
    const unitsPerPurchasedUnit = Number(rule.unitsPerPurchasedUnit ?? 1);

    const eligibleLines = snapshot.lines.filter((l) => {
      if (l.source === 'LOYALTY_REWARD') return false;
      if (!Number.isInteger(l.quantity)) return false;
      if (eligibleProductIds.length > 0 && eligibleProductIds.includes(l.productId)) return true;
      if (eligibleCategoryIds.length > 0 && l.categoryId && eligibleCategoryIds.includes(l.categoryId)) return true;
      return false;
    });

    if (eligibleLines.length === 0) return null;

    const totalQuantity = eligibleLines.reduce((sum, l) => sum + l.quantity, 0);
    const earned = totalQuantity * unitsPerPurchasedUnit;
    if (earned <= 0) return null;

    const earningBaseNio = eligibleLines.reduce(
      (sum, l) => sum + l.merchandiseNetNioAfterAllBenefits,
      0,
    );

    return {
      programId: program.id,
      programVersion: program.config_version,
      units: earned,
      strategy: 'PRODUCT_STAMPS',
      commercialSnapshot: {
        earningBaseNio,
        eligibleLines: eligibleLines.length,
        totalQuantity,
        unitsPerPurchasedUnit,
      },
    };
  }
}

export class VisitStampsStrategy implements EarningStrategy {
  evaluate(snapshot: LoyaltyTicketSnapshot, program: LoyaltyProgram): EarningResult | null {
    const rule = program.earning_rule as Record<string, unknown>;
    const unitsPerVisit = Number(rule.unitsPerVisit ?? 1);
    const minimumSpendNio = Number(rule.minimumSpendNio ?? 0);

    const eligibleSpend = snapshot.lines
      .filter((l) => l.source === 'NORMAL')
      .reduce((sum, l) => sum + l.merchandiseNetNioAfterAllBenefits, 0);

    if (minimumSpendNio > 0) {
      if (eligibleSpend < minimumSpendNio) return null;
    }

    return {
      programId: program.id,
      programVersion: program.config_version,
      units: unitsPerVisit,
      strategy: 'VISIT_STAMPS',
      commercialSnapshot: {
        earningBaseNio: eligibleSpend,
        unitsPerVisit,
        minimumSpendNio,
      },
    };
  }
}

export function createStrategy(programType: string): EarningStrategy {
  switch (programType) {
    case 'SPEND_POINTS':
      return new SpendPointsStrategy();
    case 'PRODUCT_STAMPS':
      return new ProductStampsStrategy();
    case 'VISIT_STAMPS':
      return new VisitStampsStrategy();
    default:
      throw new Error(`Unknown program type: ${programType}`);
  }
}
