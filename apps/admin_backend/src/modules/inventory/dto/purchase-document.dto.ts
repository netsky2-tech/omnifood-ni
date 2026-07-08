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

export const PURCHASE_FX_RATE_MODE = {
  EXPLICIT: 'explicit',
  OFFICIAL: 'official',
} as const;

export type PurchaseFxRateMode =
  (typeof PURCHASE_FX_RATE_MODE)[keyof typeof PURCHASE_FX_RATE_MODE];

export const DEFAULT_PURCHASE_FX_RATE_MODE = PURCHASE_FX_RATE_MODE.EXPLICIT;

export const resolvePurchaseFxRateMode = (
  fxRateMode?: PurchaseFxRateMode,
): PurchaseFxRateMode => fxRateMode ?? DEFAULT_PURCHASE_FX_RATE_MODE;

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

  @ValidateIf((dto: PurchaseDocumentDto) => dto.fiscalAuthorizationCode != null)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fiscalAuthorizationCode?: string;

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

  @IsOptional()
  @IsIn(Object.values(PURCHASE_FX_RATE_MODE))
  fxRateMode?: PurchaseFxRateMode;

  @ValidateIf(
    (dto: PurchaseDocumentDto) =>
      dto.bcnRate != null ||
      (dto.currency === PURCHASE_CURRENCY.USD &&
        resolvePurchaseFxRateMode(dto.fxRateMode) ===
          PURCHASE_FX_RATE_MODE.EXPLICIT),
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

export class PurchaseCorrectionDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  reason: string;
}
