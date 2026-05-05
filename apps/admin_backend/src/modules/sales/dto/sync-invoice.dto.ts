import {
  IsString,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsArray,
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

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateModifierDto)
  modifiers?: CreateModifierDto[];
}

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentDto)
  payments: CreatePaymentDto[];
}
