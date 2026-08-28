import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SalesDashboardQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class HourlySalesQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

export class TopProductsQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class CashierPerformanceQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export interface PaymentMethodsBreakdownDto {
  cashNio: number;
  cashUsd: number;
  cardNio: number;
  cardUsd: number;
  other: number;
  totalNio: number;
}

export interface SalesDashboardReportDto {
  grossSales: number;
  netTaxableSales: number;
  totalTax: number;
  totalDiscounts: number;
  invoiceCount: number;
  ticketAverage: number;
  paymentMethodsBreakdown: PaymentMethodsBreakdownDto;
  startDate?: string;
  endDate?: string;
  generatedAt: string;
}

export interface HourlySalesBucketDto {
  hour: number;
  invoiceCount: number;
  totalSales: number;
}

export interface HourlySalesReportDto {
  date: string;
  totalSales: number;
  totalInvoices: number;
  generatedAt: string;
  hourly: HourlySalesBucketDto[];
}

export interface TopProductItemDto {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface TopProductsReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  products: TopProductItemDto[];
}

export interface CashierPerformanceItemDto {
  userId: string;
  cashierName: string;
  invoiceCount: number;
  totalSales: number;
  ticketAverage: number;
}

export interface CashierPerformanceReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  cashiers: CashierPerformanceItemDto[];
}
