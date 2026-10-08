import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for the paginated reconciliation drill-down list
 * (GET /sales/reports/reconciliations) consumed by the dashboard attention
 * band's reconciliation tab.
 *
 * All filters are optional; pagination defaults to page 1 / limit 25 with a
 * hard ceiling of 200 rows per page so a dashboard widget can never pull an
 * unbounded result set. `status` filters the free-form
 * invoice_payments.reconciliation_status varchar (e.g. 'PENDIENTE',
 * 'MANUAL_OVERRIDE', 'CONCILIADO'); `startDate`/`endDate` bound the
 * reconciliation date (p.reconciled_at), with the end bound inclusive of the
 * full end day.
 */
export class ReconciliationListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
