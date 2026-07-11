import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  registerDecorator,
  IsString,
  ValidationArguments,
  ValidationOptions,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SyncInvoiceDto } from './sync-invoice.dto';

const SYNC_DOCUMENT_TYPE = {
  SALE: 'SALE',
  SALE_CANCEL: 'SALE_CANCEL',
  CREDIT_NOTE: 'CREDIT_NOTE',
  PURCHASE: 'PURCHASE',
  SHRINKAGE: 'SHRINKAGE',
  PRODUCTION: 'PRODUCTION',
} as const;

export type SyncDocumentType =
  (typeof SYNC_DOCUMENT_TYPE)[keyof typeof SYNC_DOCUMENT_TYPE];

const SYNC_FLOW_TYPE = {
  INVENTORY: 'inventory',
  SALES: 'sales',
} as const;

export type SyncFlowType = (typeof SYNC_FLOW_TYPE)[keyof typeof SYNC_FLOW_TYPE];

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
              invoice.refundReasonPolicy &&
              invoice.items?.length &&
              invoice.items?.every((item) => item.originInvoiceItemId),
          );
        },
        defaultMessage() {
          return 'CREDIT_NOTE invoice requires originInvoiceId, refundReasonPolicy, at least one item, and originInvoiceItemId on every item';
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

function RejectCreditNoteMovementDeltas(
  validationOptions?: ValidationOptions,
) {
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
  documentType: SyncDocumentType;

  @IsString()
  @IsOptional()
  recipeVersionId?: string;

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
}

export class SyncBatchEnvelopeDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncBatchRecordDto)
  records: SyncBatchRecordDto[];
}
