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
  invoice?: SyncInvoiceDto;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SyncMovementDeltaDto)
  @RejectAbsoluteStockFields()
  movements?: SyncMovementDeltaDto[];
}

export class SyncBatchEnvelopeDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncBatchRecordDto)
  records: SyncBatchRecordDto[];
}
