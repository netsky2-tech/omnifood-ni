import {
  IsEnum,
  IsString,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsArray,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  @IsBoolean()
  @IsOptional()
  globalTaxOverride?: boolean;

  @IsString()
  @IsOptional()
  type?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @IsOptional()
  relatedInvoiceId?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @IsOptional()
  originInvoiceId?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @IsOptional()
  // Audit label only. The allowed taxonomy is implementation-defined until the
  // refund reason policy is formalized in product requirements.
  refundReasonCode?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsEnum(REFUND_REASON_POLICY)
  @IsOptional()
  refundReasonPolicy?: RefundReasonPolicy;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @IsOptional()
  authorizedByUserId?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
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
}
