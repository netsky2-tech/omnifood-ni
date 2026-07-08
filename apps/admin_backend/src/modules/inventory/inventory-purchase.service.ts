import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import {
  PurchaseCurrency,
  type PurchaseFxRateMode,
  PURCHASE_FX_RATE_MODE,
  resolvePurchaseFxRateMode,
} from './dto/purchase-document.dto';
import { Supplier } from './entities/supplier.entity';
import { PurchaseDocument } from './entities/purchase-document.entity';
import { CostCalculatorService } from './cost-calculator.service';

export const CURRENCY = {
  NIO: 'NIO',
  USD: 'USD',
} as const;

type Currency = PurchaseCurrency;

const SCALE_4 = 4;
const POSTGRES_UNIQUE_VIOLATION = '23505';
const PURCHASE_CORRECTION_UNIQUE_INDEX =
  'idx_inventory_purchase_documents_one_correction_per_origin';
const PURCHASE_DOCUMENT_TYPE = {
  PURCHASE: 'PURCHASE',
  CORRECTION: 'PURCHASE_CORRECTION',
} as const;
const BCN_RATE_SOURCE = {
  NIO: 'NIO document rate',
  EXPLICIT: 'Document-provided BCN rate',
  OFFICIAL: 'Official BCN rate by invoice date',
} as const;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

interface QueryFailedDriverError {
  code?: string;
  constraint?: string;
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
    private readonly costCalculator: CostCalculatorService,
    @Inject(FX_RATE_RESOLVER)
    private readonly fxRateResolver: FxRateResolver,
  ) {}

  async previewPurchase(input: {
    id: string;
    tenantId: string;
    insumoId: string;
    supplierId: string;
    invoiceNumber: string;
    fiscalAuthorizationCode?: string;
    quantity: number;
    unitCost: number;
    currency: Currency;
    invoiceDate: string;
    entryTimestamp: string;
    fxRateMode?: PurchaseFxRateMode;
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
    fiscalAuthorizationCode?: string;
    quantity: number;
    unitCost: number;
    currency: Currency;
    invoiceDate: string;
    entryTimestamp: string;
    fxRateMode?: PurchaseFxRateMode;
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

          const preview = await this.buildPreview(input, insumo);

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
            fiscal_authorization_code:
              input.fiscalAuthorizationCode?.trim() || null,
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
            type: MovementType.ENTRADA_COMPRA,
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

  async correctPurchase(input: {
    tenantId: string;
    purchaseDocumentId: string;
    reason: string;
    actorUserId?: string;
  }) {
    const tenantId = this.requireTenantId(input.tenantId);
    const reason = this.requireCorrectionReason(input.reason);

    try {
      return await this.dataSource.transaction(
        'SERIALIZABLE',
        async (manager) => {
          await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
            tenantId,
          ]);

          const originalDocument = await manager.findOne(PurchaseDocument, {
            where: {
              id: input.purchaseDocumentId,
              tenant_id: tenantId,
            },
          });

          if (!originalDocument) {
            throw new NotFoundException(
              `Purchase document ${input.purchaseDocumentId} not found`,
            );
          }

          const existingCorrection = await manager.findOne(PurchaseDocument, {
            where: {
              tenant_id: tenantId,
              correction_for_purchase_document_id: originalDocument.id,
            },
          });

          if (existingCorrection) {
            throw new ConflictException(
              `Purchase document ${originalDocument.id} has already been corrected`,
            );
          }

          const originalMovement = await manager.findOne(InventoryMovement, {
            where: {
              tenant_id: tenantId,
              sourceDocumentId: originalDocument.id,
              sourceDocumentType: PURCHASE_DOCUMENT_TYPE.PURCHASE,
            },
          });

          if (!originalMovement) {
            throw new NotFoundException(
              `Purchase movement for document ${originalDocument.id} not found`,
            );
          }

          const insumo = await manager
            .createQueryBuilder(Insumo, 'insumo')
            .setLock('pessimistic_write')
            .where('insumo.id = :insumoId', {
              insumoId: originalDocument.insumo_id,
            })
            .andWhere('insumo.tenant_id = :tenantId', { tenantId })
            .getOne();

          if (!insumo) {
            throw new NotFoundException(
              `Insumo ${originalDocument.insumo_id} not found`,
            );
          }

          const previousStock = round4(Number(insumo.stock));
          const previousCppNio = round4(Number(insumo.averageCost));
          const correctedQuantity = round4(-Number(originalMovement.quantity));
          const correctedTotalCostNio = round4(
            -Number(originalMovement.totalCostNio),
          );
          const newStock = round4(previousStock + correctedQuantity);
          const projectedCppNio =
            newStock === 0
              ? 0
              : round4(
                  (previousStock * previousCppNio + correctedTotalCostNio) /
                    newStock,
                );

          const correctionDocumentId = randomUUID();
          const correctionDocument = manager.create(PurchaseDocument, {
            id: correctionDocumentId,
            tenant_id: tenantId,
            insumo_id: originalDocument.insumo_id,
            supplier_id: originalDocument.supplier_id,
            invoice_number: `${originalDocument.invoice_number}#CORRECTION-${correctionDocumentId}`,
            document_type: PURCHASE_DOCUMENT_TYPE.CORRECTION,
            correction_reason: reason,
            correction_for_purchase_document_id: originalDocument.id,
            fiscal_authorization_code:
              originalDocument.fiscal_authorization_code,
            invoice_date: originalDocument.invoice_date,
            entry_date: new Date(),
            entry_timestamp: new Date(),
            quantity: correctedQuantity,
            unit_cost: Number(originalDocument.unit_cost),
            currency: originalDocument.currency,
            bcn_rate: Number(originalDocument.bcn_rate),
            unit_cost_nio: Number(originalDocument.unit_cost_nio),
            projected_cpp_nio: projectedCppNio,
            lot_code: originalDocument.lot_code,
            received_date: originalDocument.received_date,
            expiration_date: originalDocument.expiration_date,
          });
          await manager.save(PurchaseDocument, correctionDocument);

          insumo.stock = newStock;
          insumo.existenciaActual = newStock;
          insumo.averageCost = projectedCppNio;
          const savedInsumo = await manager.save(Insumo, insumo);

          const compensatingMovement = manager.create(InventoryMovement, {
            tenant_id: tenantId,
            insumoId: originalMovement.insumoId,
            type: MovementType.ADJUSTMENT,
            quantity: correctedQuantity,
            previousStock,
            newStock,
            averageCostAfterNio: projectedCppNio,
            unitCostNio: Number(originalMovement.unitCostNio),
            totalCostNio: correctedTotalCostNio,
            sourceDocumentId: correctionDocument.id,
            sourceDocumentType: PURCHASE_DOCUMENT_TYPE.CORRECTION,
            compensationForKardexId: originalMovement.id,
            user_id: input.actorUserId,
          });

          const movement = await manager.save(
            InventoryMovement,
            compensatingMovement,
          );

          return {
            correctionDocument,
            movement,
            insumo: savedInsumo,
          };
        },
      );
    } catch (error) {
      if (
        this.isPostgresUniqueViolation(error, PURCHASE_CORRECTION_UNIQUE_INDEX)
      ) {
        throw new ConflictException(
          `Purchase document ${input.purchaseDocumentId} has already been corrected`,
        );
      }

      throw error;
    }
  }

  private isPostgresUniqueViolation(
    error: unknown,
    constraint?: string,
  ): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as QueryFailedDriverError | undefined;

    return (
      driverError?.code === POSTGRES_UNIQUE_VIOLATION &&
      (!constraint || driverError.constraint === constraint)
    );
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

  private requireCorrectionReason(reason: string): string {
    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      throw new BadRequestException('correction reason is required');
    }

    return normalizedReason;
  }

  private async buildPreview(
    input: {
      quantity: number;
      unitCost: number;
      currency: Currency;
      invoiceDate: string;
      fxRateMode?: PurchaseFxRateMode;
      bcnRate?: number;
    },
    insumo: Insumo,
  ): Promise<PurchasePreview> {
    const rateResolution = await this.resolveBcnRate({
      currency: input.currency,
      invoiceDate: input.invoiceDate,
      fxRateMode: input.fxRateMode,
      bcnRate: input.bcnRate,
    });
    const cpp = this.costCalculator.calculatePurchaseCpp({
      currentStock: Number(insumo.stock),
      currentCppNio: Number(insumo.averageCost),
      entryQuantity: input.quantity,
      entryUnitCost: input.unitCost,
      currency: input.currency,
      bcnRateNio: rateResolution.bcnRate,
    });

    return {
      invoiceDate: input.invoiceDate,
      currency: input.currency,
      bcnRate: rateResolution.bcnRate,
      bcnRateSource: rateResolution.bcnRateSource,
      unitCostNio: cpp.unitCostNio,
      previousCppNio: cpp.previousCppNio,
      projectedCppNio: cpp.projectedCppNio,
      previousStock: cpp.previousStock,
      projectedStock: cpp.projectedStock,
      requiresBatchTracking: Boolean(insumo.is_perishable),
    };
  }

  private async resolveBcnRate(input: {
    currency: Currency;
    invoiceDate: string;
    fxRateMode?: PurchaseFxRateMode;
    bcnRate?: number;
  }): Promise<{
    bcnRate: number;
    bcnRateSource: string;
  }> {
    if (input.currency === CURRENCY.NIO) {
      return {
        bcnRate: 1,
        bcnRateSource: BCN_RATE_SOURCE.NIO,
      };
    }

    if (
      resolvePurchaseFxRateMode(input.fxRateMode) ===
      PURCHASE_FX_RATE_MODE.OFFICIAL
    ) {
      return {
        bcnRate: round4(
          await this.fxRateResolver.resolveBcnRateByDate(
            this.normalizeOfficialFxInvoiceDate(input.invoiceDate),
          ),
        ),
        bcnRateSource: BCN_RATE_SOURCE.OFFICIAL,
      };
    }

    return {
      bcnRate: this.resolveExplicitBcnRate(input.bcnRate),
      bcnRateSource: BCN_RATE_SOURCE.EXPLICIT,
    };
  }

  private resolveExplicitBcnRate(bcnRate?: number): number {
    if (bcnRate == null || bcnRate <= 0) {
      throw new BadRequestException(
        'USD purchases require an explicit BCN exchange rate',
      );
    }

    return round4(bcnRate);
  }

  private normalizeOfficialFxInvoiceDate(invoiceDate: string): string {
    const trimmedInvoiceDate = invoiceDate.trim();
    const isoDate = trimmedInvoiceDate.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);

    return isoDate ? isoDate[1] : trimmedInvoiceDate;
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
