import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { SyncInvoiceDto } from './sync-invoice.dto';

const SYNC_DOCUMENT_TYPE = {
  SALE: 'SALE',
  SALE_CANCEL: 'SALE_CANCEL',
  CREDIT_NOTE: 'CREDIT_NOTE',
  PURCHASE: 'PURCHASE',
  SHRINKAGE: 'SHRINKAGE',
  PRODUCTION: 'PRODUCTION',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
  FULFILLMENT: 'FULFILLMENT',
  LOYALTY_LEDGER: 'LOYALTY_LEDGER',
} as const;

export type SyncDocumentType =
  (typeof SYNC_DOCUMENT_TYPE)[keyof typeof SYNC_DOCUMENT_TYPE];

const SYNC_FLOW_TYPE = {
  INVENTORY: 'inventory',
  SALES: 'sales',
  FULFILLMENT: 'fulfillment',
  LOYALTY_LEDGER: 'LOYALTY_LEDGER',
} as const;

export type SyncFlowType = (typeof SYNC_FLOW_TYPE)[keyof typeof SYNC_FLOW_TYPE];

/**
 * Arch §2.3 canonical LoyaltyTransaction movement types. REVERSAL is part of
 * the contract from day one (§4.3 per-movement reversals) even before the POS
 * emits it, so the transport never becomes the reason the reversal contract
 * cannot land.
 */
const LOYALTY_TRANSACTION_TYPES = ['EARN', 'REDEEM', 'ADJUST', 'REVERSAL'];

const ABSOLUTE_STOCK_FIELDS = new Set([
  'stock',
  'newStock',
  'absoluteStock',
  'existenciaActual',
  'snapshot',
  'stockSnapshot',
]);

function containsAbsoluteStockField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsAbsoluteStockField(item));
  }
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nestedValue]) =>
      ABSOLUTE_STOCK_FIELDS.has(key) || containsAbsoluteStockField(nestedValue),
  );
}

function RejectAbsoluteStockFields(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'rejectAbsoluteStockFields',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return !containsAbsoluteStockField(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must contain delta-only movement payloads; absolute stock fields are not accepted`;
        },
      },
    });
  };
}

function CreditNoteInvoiceProvenanceComplete(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'creditNoteInvoiceProvenanceComplete',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const record = args.object as SyncBatchRecordDto;
          if (typeof value !== 'object' || value === null) {
            return record.documentType !== SYNC_DOCUMENT_TYPE.CREDIT_NOTE;
          }

          const invoice = value as SyncInvoiceDto;
          const requiresCreditNoteProvenance =
            record.documentType === SYNC_DOCUMENT_TYPE.CREDIT_NOTE ||
            invoice.type === 'creditNote';
          if (!requiresCreditNoteProvenance) return true;

          return Boolean(
            invoice.originInvoiceId &&
            invoice.refundReasonCode?.trim() &&
            invoice.refundReasonPolicy &&
            invoice.authorizedByUserId?.trim() &&
            (invoice.authorizedByRole === 'manager' ||
              invoice.authorizedByRole === 'owner') &&
            invoice.items?.length &&
            invoice.items?.every((item) => item.originInvoiceItemId),
          );
        },
        defaultMessage() {
          return 'CREDIT_NOTE invoice requires originInvoiceId, refundReasonCode, refundReasonPolicy, manager/owner authorization metadata, at least one item, and originInvoiceItemId on every item';
        },
      },
    });
  };
}

function CreditNoteDocumentTypeMatchesInvoiceType(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'creditNoteDocumentTypeMatchesInvoiceType',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const record = args.object as SyncBatchRecordDto;
          if (typeof value !== 'object' || value === null) {
            return record.documentType !== SYNC_DOCUMENT_TYPE.CREDIT_NOTE;
          }

          const invoice = value as SyncInvoiceDto;
          if (record.documentType === SYNC_DOCUMENT_TYPE.CREDIT_NOTE) {
            return invoice.type === 'creditNote';
          }
          return invoice.type !== 'creditNote';
        },
        defaultMessage(args: ValidationArguments) {
          const record = args.object as SyncBatchRecordDto;
          if (record.documentType === SYNC_DOCUMENT_TYPE.CREDIT_NOTE) {
            return 'CREDIT_NOTE documentType requires invoice.type=creditNote';
          }
          return 'creditNote invoice type is only valid with CREDIT_NOTE documentType';
        },
      },
    });
  };
}

function RejectCreditNoteMovementDeltas(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'rejectCreditNoteMovementDeltas',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const record = args.object as SyncBatchRecordDto;
          return !(
            record.documentType === SYNC_DOCUMENT_TYPE.CREDIT_NOTE &&
            Array.isArray(value) &&
            value.length > 0
          );
        },
        defaultMessage() {
          return 'CREDIT_NOTE inventory movement deltas are not supported until backend Kardex replay is implemented';
        },
      },
    });
  };
}

/**
 * Arch §13.4 cross-field contract for the LOYALTY_LEDGER flow, riding the
 * EXISTING sync/batch envelope (no parallel transport):
 *  - documentType LOYALTY_LEDGER requires the matching deterministic
 *    flowType (same rule CREDIT_NOTE has);
 *  - the record carries the documented events[] payload and no invoice /
 *    movements / fulfillment payload;
 *  - no other document type may carry events[].
 */
function LoyaltyLedgerDocumentContract(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'loyaltyLedgerDocumentContract',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const record = args.object as SyncBatchRecordDto;
          if (value !== SYNC_DOCUMENT_TYPE.LOYALTY_LEDGER) {
            return record.events === undefined;
          }
          if (record.flowType !== 'LOYALTY_LEDGER' as SyncFlowType) {
            return false;
          }
          if (!Array.isArray(record.events) || record.events.length === 0) {
            return false;
          }
          return !record.invoice &&
            !(record.movements && record.movements.length > 0) &&
            !record.fulfillment;
        },
        defaultMessage(args: ValidationArguments) {
          const record = args.object as SyncBatchRecordDto;
          if (record.documentType === SYNC_DOCUMENT_TYPE.LOYALTY_LEDGER) {
            if (record.flowType !== 'LOYALTY_LEDGER') {
              return 'LOYALTY_LEDGER documentType requires flowType LOYALTY_LEDGER';
            }
            if (!Array.isArray(record.events) || record.events.length === 0) {
              return 'LOYALTY_LEDGER records require at least one ledger event';
            }
            return 'LOYALTY_LEDGER records carry only the events[] payload: invoice, movements, and fulfillment are not accepted';
          }
          return 'events[] is only valid on LOYALTY_LEDGER records';
        },
      },
    });
  };
}

export class SyncMovementDeltaDto {
  @IsString()
  insumoId: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  @IsOptional()
  unitCostNio?: number;

  @IsString()
  @IsOptional()
  recipeVersionId?: string;

  @IsString()
  @IsOptional()
  originMovementId?: string;

  @IsString()
  @IsOptional()
  originInvoiceItemId?: string;

  @IsString()
  @IsOptional()
  refundReasonPolicy?: string;

  @IsString()
  @IsOptional()
  sourceDocumentType?: string;

  @IsString()
  @IsOptional()
  sourceDocumentId?: string;
}

export class SyncFulfillmentDto {
  @IsString()
  id: string;

  @IsString()
  @IsOptional()
  saleId?: string;

  @IsString()
  @IsOptional()
  topologySnapshotId?: string;

  @IsNumber()
  @IsOptional()
  topologyRevision?: number;

  @IsString()
  channel: string;

  @IsString()
  routeState: string;

  @IsString()
  @IsOptional()
  deliveryState?: string;

  @IsString()
  @IsOptional()
  linesPayload?: string;

  @IsArray()
  @IsOptional()
  lines?: Array<Record<string, unknown>>;
}

/**
 * One ledger event of a LOYALTY_LEDGER sync-batch record (arch §13.4 exact
 * wire shape): snake_case event identity keys, plus the canonical
 * LoyaltyTransaction state (§2.3) the ledger append consumes.
 */
export class SyncLoyaltyLedgerTransactionDto {
  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  loyaltyProgramId?: string | null;

  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  ticketId?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsIn(LOYALTY_TRANSACTION_TYPES)
  transactionType: string;

  @IsNumber()
  units: number;

  @IsString()
  origin: string;

  @IsString()
  occurredAt: string;

  /** Canonical §2.3 context (T6 sender contract): every optional field the
   * ledger row carries and the §9.3 identities and audit trail consume.
   * `reversalOfTransactionId` is what makes a REVERSAL a REVERSAL (§4.3
   * per-movement reversals + uq_loyalty_reversal_original). */
  @IsOptional()
  @IsString()
  rewardId?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  reversalOfTransactionId?: string | null;

  @IsOptional()
  @IsString()
  sourceEventId?: string | null;

  @IsOptional()
  @IsString()
  actorUserId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  terminalId?: string | null;

  @IsOptional()
  @IsNumber()
  programVersion?: number | null;

  @IsOptional()
  @IsNumber()
  rewardVersion?: number | null;

  @IsOptional()
  @IsObject()
  commercialSnapshot?: Record<string, unknown> | null;
}

export class SyncLoyaltyLedgerEventDto {
  @IsString()
  event_id: string;

  @IsString()
  idempotency_key: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SyncLoyaltyLedgerTransactionDto)
  transaction: SyncLoyaltyLedgerTransactionDto;
}

export class SyncBatchRecordDto {
  @IsString()
  idempotencyKey: string;

  @IsString()
  sourceDeviceId: string;

  @IsNumber()
  sourceSequence: number;

  @IsEnum(SYNC_FLOW_TYPE)
  @IsOptional()
  flowType?: SyncFlowType;

  @IsEnum(SYNC_DOCUMENT_TYPE)
  @LoyaltyLedgerDocumentContract()
  documentType: SyncDocumentType;

  @IsString()
  @IsOptional()
  invoiceId?: string;

  @IsString()
  @IsOptional()
  terminalId?: string;

  @IsString()
  @IsOptional()
  recipeVersionId?: string;

  @IsString()
  @IsOptional()
  aggregateType?: string;

  @IsString()
  @IsOptional()
  aggregateId?: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsNumber()
  @IsOptional()
  topologyRevision?: number;

  @IsString()
  @IsOptional()
  payloadHash?: string;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncInvoiceDto)
  @CreditNoteDocumentTypeMatchesInvoiceType()
  @CreditNoteInvoiceProvenanceComplete()
  invoice?: SyncInvoiceDto;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SyncMovementDeltaDto)
  @RejectAbsoluteStockFields()
  @RejectCreditNoteMovementDeltas()
  movements?: SyncMovementDeltaDto[];

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncFulfillmentDto)
  fulfillment?: SyncFulfillmentDto;

  @IsArray()
  @ArrayMaxSize(500)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SyncLoyaltyLedgerEventDto)
  events?: SyncLoyaltyLedgerEventDto[];
}

export class SyncBatchEnvelopeDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncBatchRecordDto)
  records: SyncBatchRecordDto[];
}
