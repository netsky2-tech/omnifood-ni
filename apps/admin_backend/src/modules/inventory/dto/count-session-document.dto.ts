import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const COUNT_SESSION_STATUS = {
  DRAFT: 'draft',
  OPEN: 'open',
  POSTED: 'posted',
  CANCELED: 'canceled',
} as const;

export type CountSessionStatus =
  (typeof COUNT_SESSION_STATUS)[keyof typeof COUNT_SESSION_STATUS];

export class CountLineEntryDocumentDto {
  @IsNumber()
  countedQuantity: number;

  @IsOptional()
  @IsDateString()
  countedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  actorLabel?: string;

  @IsOptional()
  @IsBoolean()
  disputed?: boolean;
}

export class CountSessionLineDocumentDto {
  @IsString()
  id: string;

  @IsString()
  insumoId: string;

  @IsString()
  insumoName: string;

  @IsString()
  uom: string;

  @IsNumber()
  theoreticalQuantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  approvedEntryIndex?: number;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CountLineEntryDocumentDto)
  entries: CountLineEntryDocumentDto[];
}

export class CountSessionDocumentDto {
  @IsString()
  id: string;

  @IsString()
  warehouseId: string;

  @IsString()
  warehouseName: string;

  @IsDateString()
  cutoffAt: string;

  @IsIn(Object.values(COUNT_SESSION_STATUS))
  status: CountSessionStatus;

  @IsDateString()
  createdAt: string;

  @IsDateString()
  updatedAt: string;

  @IsOptional()
  @IsDateString()
  postedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @IsString({ each: true })
  movementReferences: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CountSessionLineDocumentDto)
  lines: CountSessionLineDocumentDto[];
}
