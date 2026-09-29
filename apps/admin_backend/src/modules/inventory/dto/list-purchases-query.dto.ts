import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query filters for the owner-dashboard purchase history read
 * (`GET /inventory/purchases`). All filters are optional; the date range
 * filters on `invoice_date` (fiscal date of the purchase document).
 */
export class ListPurchasesQueryDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  insumoId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
