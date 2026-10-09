import {
  IsEnum,
  IsString,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DiscountOrigin } from '../entities/discount-origin.enum';

export class InventorySnapshotBindingDto {
  @IsNumber()
  bindingOrdinal: number;

  @IsString()
  insumoId: string;

  @IsString()
  @IsOptional()
  recipeComponentId?: string;

  @IsNumber()
  quantityPerSaleUnit: number;

  @IsString()
  saleCorrelationId: string;
}

export class InventorySnapshotDto {
  [key: string]: any;

  @IsString()
  classification: string;

  @IsString()
  disposition: string;

  @IsString()
  @IsOptional()
  reasonCode?: string | null;

  @IsString()
  catalogRevision: string;

  @IsString()
  @IsOptional()
  mappingVersionId?: string | null;

  @IsString()
  @IsOptional()
  recipeVersionId?: string | null;

  @IsString()
  @IsOptional()
  acceptedAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventorySnapshotBindingDto)
  bindings: InventorySnapshotBindingDto[];
}

export class CreateInvoiceItemDto {
  @IsString()
  id: string;

  @IsString()
  productId: string;

  @IsString()
  productName: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  originalTaxRate: number;

  @IsNumber()
  appliedTaxRate: number;

  @IsNumber()
  taxAmount: number;

  @IsNumber()
  total: number;

  @IsNumber()
  discount: number;

  @IsEnum(DiscountOrigin)
  @IsOptional()
  // D-A2: WHY this line has a discount. OPTIONAL on purpose — every deployed
  // terminal omits it today, and a payload that omits it must stay valid —
  // forbidNonWhitelisted rejects the WHOLE batch on an unknown property, so
  // the field must be whitelisted BEFORE any terminal starts sending it.
  // Absence (or null) persists as NULL: the backend never fabricates an
  // origin and there is no backfill for historical rows.
  discountOrigin?: DiscountOrigin | null;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  recipeVersionId?: string;

  @IsString()
  @IsOptional()
  // Credit notes preserve fiscal provenance by pointing each refunded line back
  // to the original invoice item; backend validation rejects invalid origins.
  originInvoiceItemId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateModifierDto)
  modifiers?: CreateModifierDto[];

  @IsString()
  @IsOptional()
  inventorySnapshotVersion?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InventorySnapshotDto)
  inventorySnapshot?: InventorySnapshotDto;
}

export const REFUND_REASON_POLICY = {
  RESTOCK_ORIGINAL_BOM: 'RESTOCK_ORIGINAL_BOM',
  FINANCIAL_ONLY: 'FINANCIAL_ONLY',
  WASTE_NO_RESTOCK: 'WASTE_NO_RESTOCK',
  MANAGER_REVIEW_HOLD: 'MANAGER_REVIEW_HOLD',
} as const;

export type RefundReasonPolicy =
  (typeof REFUND_REASON_POLICY)[keyof typeof REFUND_REASON_POLICY];

export const CREDIT_NOTE_AUTH_ROLE = {
  MANAGER: 'manager',
  OWNER: 'owner',
} as const;

export type CreditNoteAuthRole =
  (typeof CREDIT_NOTE_AUTH_ROLE)[keyof typeof CREDIT_NOTE_AUTH_ROLE];

export class CreateModifierDto {
  @IsString()
  name: string;

  @IsNumber()
  extraPrice: number;
}

export class CreatePaymentDto {
  @IsString()
  id: string;

  @IsString()
  method: string;

  @IsNumber()
  amount: number;

  @IsString()
  currency: string;

  @IsNumber()
  exchangeRate: number;

  @IsNumber()
  @IsOptional()
  amountNio?: number;

  @IsNumber()
  @IsOptional()
  changeGiven?: number;

  @IsString()
  @IsOptional()
  changeCurrency?: string;

  @IsString()
  @IsOptional()
  voucherCode?: string;

  @IsString()
  @IsOptional()
  cardBrand?: string;

  @IsString()
  @IsOptional()
  cardType?: string;

  @IsString()
  @IsOptional()
  bankPos?: string;

  @IsString()
  @IsOptional()
  reconciliationStatus?: string;

  @IsString()
  @IsOptional()
  last4?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  reconciledAt?: string;

  @IsString()
  @IsOptional()
  reconciledByUserId?: string;
}

export class SyncInvoiceDto {
  @IsString()
  id: string;

  @IsString()
  number: string;

  @IsDateString()
  createdAt: string;

  @IsString()
  userId: string;

  @IsNumber()
  subtotal: number;

  @IsNumber()
  totalTax: number;

  @IsNumber()
  total: number;

  @IsNumber()
  @IsOptional()
  bcnOfficialRate?: number;

  @IsNumber()
  @IsOptional()
  commercialRate?: number;

  @IsNumber()
  @IsOptional()
  totalUsd?: number;

  @IsString()
  @IsOptional()
  syncStatus?: string;

  @IsString()
  @IsOptional()
  terminalId?: string;

  @IsString()
  @IsOptional()
  documentType?: string;

  @IsNumber()
  @IsOptional()
  sourceSequence?: number;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  payloadHash?: string;

  @IsBoolean()
  @IsOptional()
  isCanceled?: boolean;

  @IsString()
  @IsOptional()
  voidReason?: string;

  @IsString()
  paymentStatus: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  // Remediation (ITEM 4): the customer snapshot is NORMALIZED at the
  // ingestion boundary — trimmed, and blank/whitespace-only becomes null —
  // so the anonymous-sale invariant (anonymous sales store customer_name IS
  // NULL) can never be defeated by an empty string. The payload is never
  // rejected: a fiscal sale must not be blocked over a blank optional field
  // (explicit product rule).
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsString()
  @IsOptional()
  customerName?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsString()
  @IsOptional()
  customerTaxId?: string | null;

  @IsBoolean()
  @IsOptional()
  globalTaxOverride?: boolean;

  @IsString()
  @IsOptional()
  type?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @IsOptional()
  relatedInvoiceId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @IsOptional()
  originInvoiceId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @IsOptional()
  // Audit label only. The allowed taxonomy is implementation-defined until the
  // refund reason policy is formalized in product requirements.
  refundReasonCode?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsEnum(REFUND_REASON_POLICY)
  @IsOptional()
  refundReasonPolicy?: RefundReasonPolicy;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @IsOptional()
  authorizedByUserId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsEnum(CREDIT_NOTE_AUTH_ROLE)
  @IsOptional()
  // POS metadata is not trusted by itself; CREDIT_NOTE sync also requires an
  // authenticated active same-tenant manager/owner request context.
  authorizedByRole?: CreditNoteAuthRole;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentDto)
  payments: CreatePaymentDto[];

  @IsString()
  @IsOptional()
  inventoryPolicyVersion?: string;

  @IsString()
  @IsOptional()
  inventoryOutcome?: string;

  @IsOptional()
  inventoryOutcomeReason?: Record<string, any> | string;

  @IsString()
  @IsOptional()
  // #551: cashier session UUID from the POS payload. Null travels as null
  // for invoices issued before the field existed (D-9: no backfill).
  shiftId?: string | null;

  @IsDateString()
  @IsOptional()
  // #551: local calendar date (ISO YYYY-MM-DD) fixed at issuance on-device.
  // Null travels as null for legacy invoices (D-9: no backfill).
  localIssueDate?: string | null;

  // Batch 7 Slice 1: POS-captured tips (PRD §21, Architecture Spec §25.2 /
  // §33.4, AD-10). All optional; absence (or null) means "unknown / legacy
  // pre-remediation" — the backend never fabricates a zero tip.
  @IsNumber()
  @IsOptional()
  tipAmountNio?: number;

  @IsNumber()
  @IsOptional()
  tipAmountUsd?: number;

  @IsNumber()
  @IsOptional()
  tipPercentage?: number;

  @IsNumber()
  @IsOptional()
  tipEligibleBaseNio?: number;
}
