import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportRowDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNotEmpty({ message: 'El precio de venta es obligatorio' })
  precioVenta: string | number;

  @IsOptional()
  costoInsumo?: string | number;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  porcentajeIva?: string | number;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  stockInicial?: string | number;
}

export class UploadBatchDto {
  @IsOptional()
  @IsUUID('4', { message: 'sessionToken debe ser un UUID válido' })
  sessionToken?: string;

  @IsArray({ message: 'rows debe ser un arreglo de productos' })
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows: ImportRowDto[];

  @IsOptional()
  @IsUUID('4')
  onboardingSessionId?: string;
}

export class UploadRawCsvDto {
  @IsOptional()
  @IsUUID('4', { message: 'sessionToken debe ser un UUID válido' })
  sessionToken?: string;

  @IsNotEmpty({ message: 'El contenido CSV es obligatorio' })
  @IsString()
  csvContent: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsUUID('4')
  onboardingSessionId?: string;
}

export type CommitMode = 'VALID_ONLY' | 'ALL_OR_NOTHING';
export type DuplicateResolution = 'REPLACE' | 'SKIP' | 'FAIL';

export class CommitImportDto {
  @IsUUID('4', { message: 'sessionToken debe ser un UUID válido' })
  sessionToken: string;

  @IsOptional()
  @IsIn(['VALID_ONLY', 'ALL_OR_NOTHING'], {
    message: 'mode debe ser VALID_ONLY o ALL_OR_NOTHING',
  })
  mode?: CommitMode;

  @IsOptional()
  @IsIn(['REPLACE', 'SKIP', 'FAIL'], {
    message: 'duplicateResolution debe ser REPLACE, SKIP o FAIL',
  })
  duplicateResolution?: DuplicateResolution;

  @IsOptional()
  @IsIn(['REPLACE', 'SKIP', 'FAIL'], {
    message: 'duplicatePolicy debe ser REPLACE, SKIP o FAIL',
  })
  duplicatePolicy?: DuplicateResolution;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export interface DuplicatePreviewItem {
  rowOrdinal: number;
  productName: string;
  sku: string | null;
  matchedBy: 'NORMALIZED_NAME' | 'SKU';
  targetProductId: string;
  targetProductName: string;
  currentPrice: number;
  newPrice: number;
  currentUom: string;
  newUom: string;
  fieldsToChange: string[];
  isConflict: boolean;
  conflictReason: string | null;
}

export interface ImportPreviewResponse {
  sessionToken: string;
  status: string;
  parserContractVersion: string;
  sourceHash: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicatesCount: number;
  conflictsCount: number;
  duplicates: DuplicatePreviewItem[];
  unsupportedColumns: string[];
  unknownColumns: string[];
}

export interface RowErrorDiagnostic {
  rowNumber: number;
  rawNombre?: string;
  rawSku?: string;
  reason: string;
}

export interface UploadSummaryResponse {
  sessionToken: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: RowErrorDiagnostic[];
}

export interface CommitSummaryResponse {
  sessionToken: string;
  mode: CommitMode;
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
  totalCommitted: number;
  committedAt: Date;
}
