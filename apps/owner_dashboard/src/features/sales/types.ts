export interface PaymentMethodsBreakdown {
  cashNio: number;
  cashUsd: number;
  cardNio: number;
  cardUsd: number;
  other: number;
  totalNio: number;
}

export interface SalesDashboardReport {
  grossSales: number;
  netTaxableSales: number;
  totalTax: number;
  totalDiscounts: number;
  invoiceCount: number;
  ticketAverage: number;
  paymentMethodsBreakdown: PaymentMethodsBreakdown;
  startDate?: string;
  endDate?: string;
  generatedAt: string;
}

export interface HourlySalesBucket {
  hour: number;
  invoiceCount: number;
  totalSales: number;
}

export interface HourlySalesReport {
  date: string;
  totalSales: number;
  totalInvoices: number;
  generatedAt: string;
  hourly: HourlySalesBucket[];
}

export interface TopProductItem {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface TopProductsReport {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  products: TopProductItem[];
}

export interface CashierPerformanceItem {
  userId: string;
  cashierName: string;
  invoiceCount: number;
  totalSales: number;
  ticketAverage: number;
}

export interface CashierPerformanceReport {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  cashiers: CashierPerformanceItem[];
}

export interface DateRange {
  startDate: string;
  endDate: string;
}
