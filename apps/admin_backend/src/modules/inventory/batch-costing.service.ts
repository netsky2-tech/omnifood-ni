import { Injectable } from '@nestjs/common';

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface BatchCandidate {
  batchId: string;
  insumoId: string;
  remainingStock: number;
  unitCostNio: number;
  /** ISO calendar day (`YYYY-MM-DD`) from a PostgreSQL `date` column. */
  expirationDate?: string;
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
    /** ISO calendar day (`YYYY-MM-DD`), compared against `expirationDate`. */
    operationDate: string;
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

      // FEFO: soonest expiry first, so the batch closest to spoiling leaves the
      // shelf first. This is what the POS already does (`batch_dao.dart` orders
      // by `expiration_date ASC`), and matching it is what makes the cloud and
      // the terminal value the same consumption identically — the order decides
      // the consumed cost, and therefore the produced unit cost, COGS and
      // margin.
      //
      // This used to sort by `batchId.localeCompare`, an order arbitrary with
      // respect to time. Measured against a migration-built schema, that
      // consumed the later-expiring expensive batch (200 NIO) instead of the
      // earlier-expiring cheap one (100 NIO) and DOUBLED the cost of the
      // produced item.
      const leftExpiry = left.expirationDate ?? '';
      const rightExpiry = right.expirationDate ?? '';

      if (leftExpiry !== rightExpiry) {
        // A batch with no recorded expiry has unknown exposure, so it goes
        // LAST, never first. Sorting it as an empty string would put it at the
        // front, which is the opposite of prudent.
        if (!leftExpiry) return 1;
        if (!rightExpiry) return -1;

        // ISO calendar days compare chronologically as plain strings.
        return leftExpiry < rightExpiry ? -1 : 1;
      }

      // Identical (or absent) expiries keep a stable, deterministic order.
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
    expirationDate: string | undefined,
    operationDate: string,
  ): boolean {
    if (!expirationDate) {
      return false;
    }

    // ISO calendar days compare chronologically as plain strings, so this
    // needs no `Date` and no timezone. It previously called `.getTime()` on
    // the value, which threw `expirationDate.getTime is not a function` when
    // the driver handed back a string for a `date` column — the live
    // production close returned HTTP 500 on every perishable component.
    return expirationDate < operationDate;
  }
}
