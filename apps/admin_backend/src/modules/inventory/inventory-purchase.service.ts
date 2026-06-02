import { Inject, Injectable } from '@nestjs/common';
import { InventoryMovementService } from './inventory-movement.service';

const CURRENCY = {
  NIO: 'NIO',
  USD: 'USD',
} as const;

type Currency = (typeof CURRENCY)[keyof typeof CURRENCY];

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface FxRateResolver {
  resolveBcnRateByDate(invoiceDate: string): Promise<number>;
}

export const FX_RATE_RESOLVER = Symbol('FX_RATE_RESOLVER');

@Injectable()
export class InventoryPurchaseService {
  constructor(
    private readonly movementService: InventoryMovementService,
    @Inject(FX_RATE_RESOLVER)
    private readonly fxRateResolver: FxRateResolver,
  ) {}

  async recordPurchase(input: {
    tenantId: string;
    insumoId: string;
    quantity: number;
    unitCost: number;
    currency: Currency;
    invoiceDate: string;
    supplierName?: string;
  }) {
    const unitCostNio = await this.resolveCostNio(
      input.unitCost,
      input.currency,
      input.invoiceDate,
    );

    return this.movementService.postPurchaseMovement({
      tenantId: input.tenantId,
      insumoId: input.insumoId,
      quantity: input.quantity,
      unitCostNio,
      reason: input.supplierName
        ? `Purchase from ${input.supplierName}`
        : 'Purchase',
    });
  }

  private async resolveCostNio(
    unitCost: number,
    currency: Currency,
    invoiceDate: string,
  ): Promise<number> {
    if (currency === CURRENCY.NIO) {
      return round4(unitCost);
    }

    const bcnRate = await this.fxRateResolver.resolveBcnRateByDate(invoiceDate);
    return round4(unitCost * bcnRate);
  }
}
