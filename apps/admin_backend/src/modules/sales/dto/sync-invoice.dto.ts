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
import { Type } from 'class-transformer';

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

  @IsString()
  @IsOptional()
  relatedInvoiceId?: string;

  @IsString()
  @IsOptional()
  originInvoiceId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  refundReasonCode?: string;

  @IsEnum(REFUND_REASON_POLICY)
  @IsOptional()
  refundReasonPolicy?: RefundReasonPolicy;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  authorizedByUserId?: string;

  @IsEnum(CREDIT_NOTE_AUTH_ROLE)
  @IsOptional()
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
