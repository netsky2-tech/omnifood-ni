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
  COUNTING: 'counting',
  RECOUNT: 'recount',
  APPROVAL_PENDING: 'approval_pending',
  APPROVED: 'approved',
  POSTED: 'posted',
  CLOSED: 'closed',
  CANCELED: 'canceled',
} as const;

export type CountSessionStatus =
  (typeof COUNT_SESSION_STATUS)[keyof typeof COUNT_SESSION_STATUS];

export class CountLineEntryDocumentDto {
  @IsNumber()
  countedQuantity: number;

  /**
   * A-01: the LOT this observation was made in.
   *
   * The entry is the OBSERVATION ("LOTE-20261021-001: 30 ml"), so the lot
   * belongs to the entry, not to the line: one line can carry several
   * entries, one per lot.
   *
   * WHY IT MATTERS: a positive variance is stock that APPEARS. Without a lot
   * it would enter the aggregate with no lot behind it, and the next sale
   * would draw from the lots and find the aggregate and the lots
   * disagreeing — the exact divergence this system now declares. With the
   * lot, the physical truth enters ITS lot and the parity is restored.
   */
  @IsOptional()
  @IsString()
  batchId?: string;

  /** The lot's number, as it was seen on the shelf (the evidence). */
  @IsOptional()
  @IsString()
  batchNumber?: string;

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  movementReferences?: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CountSessionLineDocumentDto)
  lines: CountSessionLineDocumentDto[];
}
