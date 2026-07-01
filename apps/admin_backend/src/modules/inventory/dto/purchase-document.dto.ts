import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export const PURCHASE_CURRENCY = {
  NIO: 'NIO',
  USD: 'USD',
} as const;

export type PurchaseCurrency =
  (typeof PURCHASE_CURRENCY)[keyof typeof PURCHASE_CURRENCY];

export class PurchaseDocumentDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  id: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  insumoId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  supplierId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  invoiceNumber: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsNumber()
  @Min(0.0001)
  unitCost: number;

  @IsIn(Object.values(PURCHASE_CURRENCY))
  currency: PurchaseCurrency;

  @IsDateString()
  invoiceDate: string;

  @IsDateString()
  entryTimestamp: string;

  @ValidateIf(
    (dto: PurchaseDocumentDto) =>
      dto.currency === PURCHASE_CURRENCY.USD || dto.bcnRate != null,
  )
  @IsNumber()
  @Min(0.0001)
  bcnRate?: number;

  @ValidateIf((dto: PurchaseDocumentDto) => dto.lotCode != null)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  lotCode?: string;

  @ValidateIf((dto: PurchaseDocumentDto) => dto.receivedDate != null)
  @IsDateString()
  receivedDate?: string;

  @ValidateIf((dto: PurchaseDocumentDto) => dto.expirationDate != null)
  @IsDateString()
  expirationDate?: string;
}
