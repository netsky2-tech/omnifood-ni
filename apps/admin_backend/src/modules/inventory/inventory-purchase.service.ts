import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { PurchaseCurrency } from './dto/purchase-document.dto';
import { Supplier } from './entities/supplier.entity';
import { PurchaseDocument } from './entities/purchase-document.entity';

export const CURRENCY = {
  NIO: 'NIO',
  USD: 'USD',
} as const;

type Currency = PurchaseCurrency;

const SCALE_4 = 4;
const POSTGRES_UNIQUE_VIOLATION = '23505';
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

interface QueryFailedDriverError {
  code?: string;
}

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
    id: string;
    tenantId: string;
    insumoId: string;
    supplierId: string;
    invoiceNumber: string;
    quantity: number;
    unitCost: number;
    currency: Currency;
    invoiceDate: string;
    entryTimestamp: string;
    bcnRate?: number;
  }): Promise<PurchasePreview> {
    const tenantId = this.requireTenantId(input.tenantId);
    this.requireInvoiceNumber(input.invoiceNumber);

    const insumo = await this.loadInsumo(tenantId, input.insumoId);
    return this.buildPreview(input, insumo);
  }

  async recordPurchase(input: {
    id: string;
    tenantId: string;
    insumoId: string;
    supplierId: string;
    invoiceNumber: string;
    quantity: number;
    unitCost: number;
    currency: Currency;
    invoiceDate: string;
    entryTimestamp: string;
    bcnRate?: number;
    lotCode?: string;
    receivedDate?: string;
    expirationDate?: string;
  }) {
    const tenantId = this.requireTenantId(input.tenantId);
    const invoiceNumber = this.requireInvoiceNumber(input.invoiceNumber);

    try {
      return await this.dataSource.transaction(
        'SERIALIZABLE',
        async (manager) => {
          await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
            tenantId,
          ]);

          const insumo = await manager
            .createQueryBuilder(Insumo, 'insumo')
            .setLock('pessimistic_write')
            .where('insumo.id = :insumoId', { insumoId: input.insumoId })
            .andWhere('insumo.tenant_id = :tenantId', { tenantId })
            .getOne();

          if (!insumo) {
            throw new NotFoundException(`Insumo ${input.insumoId} not found`);
          }

          const supplier = await manager.findOne(Supplier, {
            where: {
              id: input.supplierId,
              tenant_id: tenantId,
            },
          });

          if (!supplier) {
            throw new NotFoundException(
              `Supplier ${input.supplierId} not found`,
            );
          }

          const existingDocument = await manager.findOne(PurchaseDocument, {
            where: {
              tenant_id: tenantId,
              supplier_id: input.supplierId,
              invoice_number: invoiceNumber,
            },
          });

          if (existingDocument) {
            throw new ConflictException(
              `Purchase invoice ${invoiceNumber} is already registered for supplier ${input.supplierId}`,
            );
          }

          const preview = this.buildPreview(input, insumo);

          if (preview.requiresBatchTracking) {
            this.assertBatchMetadata(input);
          }

          const entryTimestamp = new Date(input.entryTimestamp);
          const entryDate = new Date(input.entryTimestamp.split('T')[0]);
          const purchaseDocument = manager.create(PurchaseDocument, {
            id: input.id,
            tenant_id: tenantId,
            insumo_id: input.insumoId,
            supplier_id: input.supplierId,
            invoice_number: invoiceNumber,
            invoice_date: new Date(input.invoiceDate),
            entry_date: entryDate,
            entry_timestamp: entryTimestamp,
            quantity: round4(input.quantity),
            unit_cost: round4(input.unitCost),
            currency: input.currency,
            bcn_rate: preview.bcnRate,
            unit_cost_nio: preview.unitCostNio,
            projected_cpp_nio: preview.projectedCppNio,
            lot_code: input.lotCode ?? null,
            received_date: input.receivedDate
              ? new Date(input.receivedDate)
              : null,
            expiration_date: input.expirationDate
              ? new Date(input.expirationDate)
              : null,
          });
          await manager.save(PurchaseDocument, purchaseDocument);

          insumo.stock = preview.projectedStock;
          insumo.existenciaActual = preview.projectedStock;
          insumo.averageCost = preview.projectedCppNio;
          const savedInsumo = await manager.save(Insumo, insumo);

          const movement = manager.create(InventoryMovement, {
            tenant_id: tenantId,
            insumoId: insumo.id,
            type: MovementType.PURCHASE,
            quantity: round4(input.quantity),
            previousStock: preview.previousStock,
            newStock: preview.projectedStock,
            averageCostAfterNio: preview.projectedCppNio,
            unitCostNio: preview.unitCostNio,
            totalCostNio: round4(input.quantity * preview.unitCostNio),
            sourceDocumentId: purchaseDocument.id,
            sourceDocumentType: 'PURCHASE',
          });

          await manager.save(InventoryMovement, movement);

          if (preview.requiresBatchTracking) {
            const batch = manager.create(Batch, {
              tenant_id: tenantId,
              insumo_id: insumo.id,
              batch_number: input.lotCode,
              received_date: new Date(input.receivedDate),
              expiration_date: new Date(input.expirationDate),
              remaining_stock: round4(input.quantity),
              cost: preview.unitCostNio,
            });
            await manager.save(Batch, batch);
          }

          return {
            purchaseDocument,
            insumo: savedInsumo,
            preview,
          };
        },
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as QueryFailedDriverError | undefined)?.code ===
          POSTGRES_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          `Purchase invoice ${invoiceNumber} is already registered for supplier ${input.supplierId}`,
        );
      }

      throw error;
    }
  }

  private requireTenantId(tenantId: string): string {
    const normalizedTenantId = tenantId.trim();

    if (!normalizedTenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return normalizedTenantId;
  }

  private requireInvoiceNumber(invoiceNumber: string): string {
    const normalizedInvoiceNumber = invoiceNumber.trim();

    if (!normalizedInvoiceNumber) {
      throw new BadRequestException('invoiceNumber is required');
    }

    return normalizedInvoiceNumber;
  }

  private buildPreview(
    input: {
      quantity: number;
      unitCost: number;
      currency: Currency;
      invoiceDate: string;
      bcnRate?: number;
    },
    insumo: Insumo,
  ): PurchasePreview {
    const bcnRate = this.resolveBcnRate(input.currency, input.bcnRate);
    const unitCostNio = round4(input.unitCost * bcnRate);
    const previousStock = round4(Number(insumo.stock));
    const previousCppNio = round4(Number(insumo.averageCost));
    const projectedStock = round4(previousStock + input.quantity);
    const projectedCppNio =
      projectedStock === 0
        ? 0
        : round4(
            (previousStock * previousCppNio + input.quantity * unitCostNio) /
              projectedStock,
          );

    return {
      invoiceDate: input.invoiceDate,
      currency: input.currency,
      bcnRate,
      bcnRateSource:
        input.currency === CURRENCY.USD
          ? 'Document-provided BCN rate'
          : 'NIO document rate',
      unitCostNio,
      previousCppNio,
      projectedCppNio,
      previousStock,
      projectedStock,
      requiresBatchTracking: Boolean(insumo.is_perishable),
    };
  }

  private resolveBcnRate(currency: Currency, bcnRate?: number): number {
    if (currency === CURRENCY.NIO) {
      return 1;
    }

    if (bcnRate == null || bcnRate <= 0) {
      throw new BadRequestException(
        'USD purchases require an explicit BCN exchange rate',
      );
    }

    return round4(bcnRate);
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
