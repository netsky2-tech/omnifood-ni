import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
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

export class SyncBatchRecordDto {
  @IsString()
  idempotencyKey: string;

  @IsString()
  sourceDeviceId: string;

  @IsNumber()
  sourceSequence: number;

  @IsEnum(SYNC_DOCUMENT_TYPE)
  documentType: SyncDocumentType;

  @IsString()
  @IsOptional()
  recipeVersionId?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SyncInvoiceDto)
  invoice?: SyncInvoiceDto;

  @IsArray()
  movements?: Array<{
    insumoId: string;
    quantity: number;
    unitCostNio?: number;
    recipeVersionId?: string;
  }>;
}

export class SyncBatchEnvelopeDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncBatchRecordDto)
  records: SyncBatchRecordDto[];
}
