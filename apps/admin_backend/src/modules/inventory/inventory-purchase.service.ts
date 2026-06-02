import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { PurchaseCurrency } from './dto/purchase-document.dto';

export const CURRENCY = {
  NIO: 'NIO',
  USD: 'USD',
} as const;

type Currency = PurchaseCurrency;

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface FxRateResolver {
  resolveBcnRateByDate(invoiceDate: string): Promise<number>;
}

export const FX_RATE_RESOLVER = Symbol('FX_RATE_RESOLVER');

export interface PurchasePreview {
  invoiceDate: string;
  currency: Currency;
  bcnRate: number;
  bcnRateSource: string;
  unitCostNio: number;
  previousCppNio: number;
  projectedCppNio: number;
  previousStock: number;
  projectedStock: number;
  requiresBatchTracking: boolean;
}

@Injectable()
export class InventoryPurchaseService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(FX_RATE_RESOLVER)
    private readonly fxRateResolver: FxRateResolver,
  ) {}

  async previewPurchase(input: {
    tenantId: string;
    insumoId: string;
    quantity: number;
    unitCost: number;
    currency: Currency;
    invoiceDate: string;
  }): Promise<PurchasePreview> {
    const insumo = await this.loadInsumo(input.tenantId, input.insumoId);
    return this.buildPreview(input, insumo);
  }

  async recordPurchase(input: {
    tenantId: string;
    insumoId: string;
    quantity: number;
    unitCost: number;
    currency: Currency;
    invoiceDate: string;
    supplierName?: string;
    lotCode?: string;
    receivedDate?: string;
    expirationDate?: string;
  }) {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const insumo = await manager
        .createQueryBuilder(Insumo, 'insumo')
        .setLock('pessimistic_write')
        .where('insumo.id = :insumoId', { insumoId: input.insumoId })
        .andWhere('insumo.tenant_id = :tenantId', { tenantId: input.tenantId })
        .getOne();

      if (!insumo) {
        throw new NotFoundException(`Insumo ${input.insumoId} not found`);
      }

      const preview = await this.buildPreview(input, insumo);

      if (preview.requiresBatchTracking) {
        this.assertBatchMetadata(input);
      }

      insumo.stock = preview.projectedStock;
      insumo.existenciaActual = preview.projectedStock;
      insumo.averageCost = preview.projectedCppNio;
      const savedInsumo = await manager.save(Insumo, insumo);

      const movement = manager.create(InventoryMovement, {
        tenant_id: input.tenantId,
        insumoId: insumo.id,
        type: MovementType.PURCHASE,
        quantity: round4(input.quantity),
        previousStock: preview.previousStock,
        newStock: preview.projectedStock,
        unitCostNio: preview.unitCostNio,
        totalCostNio: round4(input.quantity * preview.unitCostNio),
        reason: input.supplierName
          ? `Purchase from ${input.supplierName}`
          : 'Purchase',
      });

      await manager.save(InventoryMovement, movement);

      if (preview.requiresBatchTracking) {
        const batch = manager.create(Batch, {
          tenant_id: input.tenantId,
          insumo_id: insumo.id,
          batch_number: input.lotCode,
          received_date: new Date(input.receivedDate!),
          expiration_date: new Date(input.expirationDate!),
          remaining_stock: round4(input.quantity),
          cost: preview.unitCostNio,
        });
        await manager.save(Batch, batch);
      }

      return {
        insumo: savedInsumo,
        preview,
      };
    });
  }

  private async buildPreview(
    input: {
      quantity: number;
      unitCost: number;
      currency: Currency;
      invoiceDate: string;
    },
    insumo: Insumo,
  ): Promise<PurchasePreview> {
    const bcnRate = await this.resolveBcnRate(input.currency, input.invoiceDate);
    const unitCostNio = round4(input.unitCost * bcnRate);
    const previousStock = round4(Number(insumo.stock));
    const previousCppNio = round4(Number(insumo.averageCost));
    const projectedStock = round4(previousStock + input.quantity);
    const projectedCppNio =
      projectedStock === 0
          ? 0
          : round4(
              ((previousStock * previousCppNio) +
                      (input.quantity * unitCostNio)) /
                  projectedStock,
            );

    return {
      invoiceDate: input.invoiceDate,
      currency: input.currency,
      bcnRate,
      bcnRateSource:
          input.currency === CURRENCY.USD ? 'BCN official rate' : 'NIO document rate',
      unitCostNio,
      previousCppNio,
      projectedCppNio,
      previousStock,
      projectedStock,
      requiresBatchTracking: Boolean(insumo.is_perishable),
    };
  }

  private async resolveBcnRate(
    currency: Currency,
    invoiceDate: string,
  ): Promise<number> {
    if (currency === CURRENCY.NIO) {
      return 1;
    }

    return round4(await this.fxRateResolver.resolveBcnRateByDate(invoiceDate));
  }

  private assertBatchMetadata(input: {
    lotCode?: string;
    receivedDate?: string;
    expirationDate?: string;
  }): void {
    if (!input.lotCode || !input.receivedDate || !input.expirationDate) {
      throw new BadRequestException(
        'Batch-managed purchases require lotCode, receivedDate, and expirationDate',
      );
    }
  }

  private async loadInsumo(
    tenantId: string,
    insumoId: string,
  ): Promise<Insumo> {
    const insumo = await this.dataSource.getRepository(Insumo).findOne({
      where: { id: insumoId, tenant_id: tenantId },
    });

    if (!insumo) {
      throw new NotFoundException(`Insumo ${insumoId} not found`);
    }

    return insumo;
  }
}
