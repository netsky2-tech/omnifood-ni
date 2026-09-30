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
import {
  PURCHASE_CURRENCY,
  PURCHASE_FX_RATE_MODE,
  resolvePurchaseFxRateMode,
} from './purchase-document.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Human manual purchase entry (owner dashboard, SOHO purchases slice).
 *
 * This DTO is the strict validation wall in FRONT of
 * `InventoryPurchaseService.recordPurchase` — it duplicates none of the
 * SERIALIZABLE/kardex/CPP/unique-invoice logic; it only adapts the web form
 * payload to the same input contract the POS device transport uses
 * (`PurchaseDocumentDto` rules), with two human-route differences:
 * - `id` is generated server-side (randomUUID) — the human form does not
 *   carry a POS document id.
 * - Validation errors are rejected before the service call (§18.4: server
 *   validation remains the authority; this DTO is that authority for the
 *   human transport).
 *
 * Mirrors the backend rules exactly: quantity and unitCost are strictly
 * positive (> 0, @Min(0.0001)), currency is NIO|USD, dates are ISO, and USD
 * purchases with the explicit fx mode require a positive bcnRate.
 */
export class ManualPurchaseDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  insumoId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  supplierId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  invoiceNumber: string;

  @ValidateIf((dto: ManualPurchaseDto) => dto.fiscalAuthorizationCode != null)
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  fiscalAuthorizationCode?: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsNumber()
  @Min(0.0001)
  unitCost: number;

  @IsIn(Object.values(PURCHASE_CURRENCY))
  currency: 'NIO' | 'USD';

  @IsDateString()
  invoiceDate: string;

  @IsDateString()
  entryTimestamp: string;

  @IsOptional()
  @IsIn(Object.values(PURCHASE_FX_RATE_MODE))
  fxRateMode?: 'explicit' | 'official';

  @ValidateIf(
    (dto: ManualPurchaseDto) =>
      dto.bcnRate != null ||
      (dto.currency === PURCHASE_CURRENCY.USD &&
        resolvePurchaseFxRateMode(dto.fxRateMode) ===
          PURCHASE_FX_RATE_MODE.EXPLICIT),
  )
  @IsNumber()
  @Min(0.0001)
  bcnRate?: number;

  @ValidateIf((dto: ManualPurchaseDto) => dto.lotCode != null)
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  lotCode?: string;

  @ValidateIf((dto: ManualPurchaseDto) => dto.receivedDate != null)
  @IsDateString()
  receivedDate?: string;

  @ValidateIf((dto: ManualPurchaseDto) => dto.expirationDate != null)
  @IsDateString()
  expirationDate?: string;
}
