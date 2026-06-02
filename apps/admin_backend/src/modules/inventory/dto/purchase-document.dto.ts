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
  insumoId: string;

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

  @IsOptional()
  @IsString()
  supplierName?: string;

  @ValidateIf((dto: PurchaseDocumentDto) => dto.lotCode != null)
  @IsString()
  @IsNotEmpty()
  lotCode?: string;

  @ValidateIf((dto: PurchaseDocumentDto) => dto.receivedDate != null)
  @IsDateString()
  receivedDate?: string;

  @ValidateIf((dto: PurchaseDocumentDto) => dto.expirationDate != null)
  @IsDateString()
  expirationDate?: string;
}
