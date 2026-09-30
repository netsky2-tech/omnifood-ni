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
 * Read-only CPP preview for the human route `POST /inventory/purchase` (the
 * owner dashboard's live projected-cost card, SOHO purchases slice).
 *
 * The preview NEVER commits a purchase document: `InventoryPurchaseService
 * .previewPurchase` builds the CPP projection without touching kardex, the
 * unique-invoice guard or the batch metadata assertion (those belong to the
 * commit path, `recordPurchase`). Its input therefore carries no `id` and no
 * batch fields — mirroring `ManualPurchaseDto` minus exactly those fields the
 * projection never reads:
 * - `id`: the manual purchase document id is generated server-side at commit
 *   (`randomUUID` in the controller); the dashboard form never carries one.
 * - `fiscalAuthorizationCode`: consumed only by the commit path.
 * - `lotCode`/`receivedDate`/`expirationDate`: read only by
 *   `assertBatchMetadata` at commit; `buildPreview` only projects the CPP.
 *
 * Every real validation rule is kept so the preview still fails closed on
 * genuine input errors: strictly positive quantity/unitCost, NIO|USD
 * currency, ISO dates, and USD + explicit mode requires a positive bcnRate
 * (§18.4: server validation remains authority for the preview too).
 */
export class PreviewPurchaseDto {
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
    (dto: PreviewPurchaseDto) =>
      dto.bcnRate != null ||
      (dto.currency === PURCHASE_CURRENCY.USD &&
        resolvePurchaseFxRateMode(dto.fxRateMode) ===
          PURCHASE_FX_RATE_MODE.EXPLICIT),
  )
  @IsNumber()
  @Min(0.0001)
  bcnRate?: number;
}