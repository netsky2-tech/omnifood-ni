import { Injectable } from '@nestjs/common';

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface BatchCandidate {
  batchId: string;
  insumoId: string;
  remainingStock: number;
  unitCostNio: number;
  expirationDate?: Date;
}

export interface BatchConsumptionTrace {
  batchId: string;
  consumedQuantity: number;
  unitCostNio: number;
  totalCostNio: number;
  isSoftExpired: boolean;
}

@Injectable()
export class BatchCostingService {
  buildValuationTrace(input: {
    requiredQuantity: number;
    candidates: BatchCandidate[];
    operationDate: Date;
  }): BatchConsumptionTrace[] {
    let remaining = round4(input.requiredQuantity);
    const traces: BatchConsumptionTrace[] = [];

    const ranked = [...input.candidates].sort((left, right) => {
      const leftExpired = this.isSoftExpired(
        left.expirationDate,
        input.operationDate,
      );
      const rightExpired = this.isSoftExpired(
        right.expirationDate,
        input.operationDate,
      );

      if (leftExpired !== rightExpired) {
        return leftExpired ? 1 : -1;
      }

      return left.batchId.localeCompare(right.batchId);
    });

    for (const candidate of ranked) {
      if (remaining <= 0) break;

      const available = round4(candidate.remainingStock);
      const consumedQuantity = round4(Math.min(available, remaining));

      if (consumedQuantity <= 0) continue;

      traces.push({
        batchId: candidate.batchId,
        consumedQuantity,
        unitCostNio: round4(candidate.unitCostNio),
        totalCostNio: round4(consumedQuantity * candidate.unitCostNio),
        isSoftExpired: this.isSoftExpired(
          candidate.expirationDate,
          input.operationDate,
        ),
      });

      remaining = round4(remaining - consumedQuantity);
    }

    return traces;
  }

  private isSoftExpired(
    expirationDate: Date | undefined,
    operationDate: Date,
  ): boolean {
    if (!expirationDate) {
      return false;
    }

    return expirationDate.getTime() < operationDate.getTime();
  }
}
