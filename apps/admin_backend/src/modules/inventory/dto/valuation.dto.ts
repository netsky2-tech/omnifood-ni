import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * R12 (R-01, Ley 822 art. 44): the client's own market price for an insumo,
 * with the date it is in force. `InventoryValuationService.setMarketPrice`
 * upserts by (tenant, insumo, effectiveDate), so re-declaring a day replaces
 * that day's price without an audit-losing delete.
 */
export class SetMarketPriceDto {
  @IsUUID()
  insumoId: string;

  @IsNumber()
  @Min(0)
  marketPriceNio: number;

  @IsDateString()
  effectiveDate: string;

  @IsOptional()
  @IsString()
  sourceNote?: string;
}

/**
 * R12: run the lower-of-cost-or-market writedown as of a closing day.
 * Idempotent per (closing date, insumo): valuing the same period twice does
 * not lose value twice.
 */
export class ApplyValuationWritedownDto {
  @IsDateString()
  asOfDate: string;
}
