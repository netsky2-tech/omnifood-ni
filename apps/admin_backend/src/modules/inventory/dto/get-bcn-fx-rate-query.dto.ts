import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, Matches } from 'class-validator';

export class GetBcnFxRateQueryDto {
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'invoiceDate must be in YYYY-MM-DD format',
  })
  @IsDateString({}, { message: 'invoiceDate must be a valid ISO 8601 date' })
  invoiceDate: string;
}
