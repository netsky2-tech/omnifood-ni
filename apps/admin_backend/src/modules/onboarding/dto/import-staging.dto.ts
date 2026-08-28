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
