import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { User } from '../../identity/entities/user.entity';
import {
  CashierPerformanceItemDto,
  CashierPerformanceQueryDto,
  CashierPerformanceReportDto,
  HourlySalesBucketDto,
  HourlySalesQueryDto,
  HourlySalesReportDto,
  PaymentMethodsBreakdownDto,
  SalesDashboardQueryDto,
  SalesDashboardReportDto,
  TopProductItemDto,
  TopProductsQueryDto,
  TopProductsReportDto,
} from '../dto/sales-reports.dto';

const round2 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

const round4 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4));

@Injectable()
export class SalesReportsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly itemRepo: Repository<InvoiceItem>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getDashboard(
    tenantId: string,
    query?: SalesDashboardQueryDto,
  ): Promise<SalesDashboardReportDto> {
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );
    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
      isCanceled: false,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    const invoices = await this.invoiceRepo.find({
      where: whereClause,
      relations: ['items', 'payments'],
      order: { created_at: 'DESC' },
    });

    let grossSales = 0;
    let netTaxableSales = 0;
    let totalTax = 0;
    let totalDiscounts = 0;

    let cashNio = 0;
    let cashUsd = 0;
    let cardNio = 0;
    let cardUsd = 0;
    let otherPaymentsNio = 0;
    let totalPaymentsNio = 0;

    for (const inv of invoices) {
      grossSales = round2(grossSales + Number(inv.total ?? 0));
      netTaxableSales = round2(netTaxableSales + Number(inv.subtotal ?? 0));
      totalTax = round2(totalTax + Number(inv.totalTax ?? 0));

      if (inv.items && inv.items.length > 0) {
        for (const item of inv.items) {
          totalDiscounts = round2(totalDiscounts + Number(item.discount ?? 0));
        }
      }

      if (inv.payments && inv.payments.length > 0) {
        for (const p of inv.payments) {
          const method = (p.method ?? '').trim().toUpperCase();
          const currency = (p.currency ?? 'NIO').trim().toUpperCase();
          const amount = Number(p.amount ?? 0);
          const exchangeRate = Number(p.exchangeRate ?? 1.0);
          const amountNio =
            Number(p.amountNio ?? 0) > 0
              ? Number(p.amountNio)
              : currency === 'USD'
                ? round2(amount * exchangeRate)
                : amount;

          totalPaymentsNio = round2(totalPaymentsNio + amountNio);

          if (method === 'CASH' || method === 'EFECTIVO') {
            if (currency === 'USD') {
              cashUsd = round2(cashUsd + amount);
            } else {
              cashNio = round2(cashNio + amountNio);
            }
          } else if (
            method === 'CARD' ||
            method === 'TARJETA' ||
            method === 'BAC' ||
            method === 'BANPRO'
          ) {
            if (currency === 'USD') {
              cardUsd = round2(cardUsd + amount);
            } else {
              cardNio = round2(cardNio + amountNio);
            }
          } else {
            otherPaymentsNio = round2(otherPaymentsNio + amountNio);
          }
        }
      }
    }

    const invoiceCount = invoices.length;
    const ticketAverage =
      invoiceCount > 0 ? round2(grossSales / invoiceCount) : 0;

    const paymentMethodsBreakdown: PaymentMethodsBreakdownDto = {
      cashNio: round2(cashNio),
      cashUsd: round2(cashUsd),
      cardNio: round2(cardNio),
      cardUsd: round2(cardUsd),
      other: round2(otherPaymentsNio),
      totalNio: round2(totalPaymentsNio),
    };

    return {
      grossSales: round2(grossSales),
      netTaxableSales: round2(netTaxableSales),
      totalTax: round2(totalTax),
      totalDiscounts: round2(totalDiscounts),
      invoiceCount,
      ticketAverage,
      paymentMethodsBreakdown,
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
    };
  }

  async getHourlySales(
    tenantId: string,
    query?: HourlySalesQueryDto,
  ): Promise<HourlySalesReportDto> {
    const { dateStr, start, end } = this.parseDayRange(query?.date);

    const invoices = await this.invoiceRepo.find({
      where: {
        tenant_id: tenantId,
        isCanceled: false,
        created_at: Between(start, end),
      },
      order: { created_at: 'ASC' },
    });

    const hourlyBuckets: HourlySalesBucketDto[] = Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        invoiceCount: 0,
        totalSales: 0,
      }),
    );

    let totalSales = 0;
    let totalInvoices = 0;

    for (const inv of invoices) {
      const invDate = new Date(inv.created_at);
      const hour = invDate.getUTCHours();
      if (hour >= 0 && hour < 24) {
        const amount = Number(inv.total ?? 0);
        hourlyBuckets[hour].invoiceCount += 1;
        hourlyBuckets[hour].totalSales = round2(
          hourlyBuckets[hour].totalSales + amount,
        );
        totalSales = round2(totalSales + amount);
        totalInvoices += 1;
      }
    }

    return {
      date: dateStr,
      totalSales: round2(totalSales),
      totalInvoices,
      generatedAt: new Date().toISOString(),
      hourly: hourlyBuckets,
    };
  }

  async getTopProducts(
    tenantId: string,
    query?: TopProductsQueryDto,
  ): Promise<TopProductsReportDto> {
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );
    const limit = query?.limit != null && query.limit > 0 ? query.limit : 10;

    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
      isCanceled: false,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    const invoices = await this.invoiceRepo.find({
      where: whereClause,
      relations: ['items'],
    });

    const productAggregates = new Map<
      string,
      {
        productId: string;
        productName: string;
        totalQuantity: number;
        totalRevenue: number;
      }
    >();

    for (const inv of invoices) {
      if (inv.items && inv.items.length > 0) {
        for (const item of inv.items) {
          const key = item.productId || item.productName || 'unknown';
          const existing = productAggregates.get(key);
          const qty = Number(item.quantity ?? 0);
          const revenue = Number(item.total ?? 0);

          if (existing) {
            existing.totalQuantity = round4(existing.totalQuantity + qty);
            existing.totalRevenue = round2(existing.totalRevenue + revenue);
          } else {
            productAggregates.set(key, {
              productId: item.productId,
              productName: item.productName || 'Producto sin nombre',
              totalQuantity: round4(qty),
              totalRevenue: round2(revenue),
            });
          }
        }
      }
    }

    const sortedProducts: TopProductItemDto[] = Array.from(
      productAggregates.values(),
    )
      .sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) {
          return b.totalQuantity - a.totalQuantity;
        }
        return b.totalRevenue - a.totalRevenue;
      })
      .slice(0, limit);

    return {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      products: sortedProducts,
    };
  }

  async getCashierPerformance(
    tenantId: string,
    query?: CashierPerformanceQueryDto,
  ): Promise<CashierPerformanceReportDto> {
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );
    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
      isCanceled: false,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    const invoices = await this.invoiceRepo.find({
      where: whereClause,
    });

    const users = await this.userRepo.find({
      where: { tenant_id: tenantId },
    });
    const userMap = new Map<string, string>();
    for (const u of users) {
      userMap.set(u.id, u.name);
    }

    const cashierAggregates = new Map<
      string,
      {
        userId: string;
        cashierName: string;
        invoiceCount: number;
        totalSales: number;
      }
    >();

    for (const inv of invoices) {
      const userId = inv.userId || 'unknown';
      const existing = cashierAggregates.get(userId);
      const total = Number(inv.total ?? 0);

      if (existing) {
        existing.invoiceCount += 1;
        existing.totalSales = round2(existing.totalSales + total);
      } else {
        const cashierName =
          userMap.get(userId) ||
          (userId !== 'unknown' ? userId : 'Desconocido');
        cashierAggregates.set(userId, {
          userId,
          cashierName,
          invoiceCount: 1,
          totalSales: round2(total),
        });
      }
    }

    const cashiers: CashierPerformanceItemDto[] = Array.from(
      cashierAggregates.values(),
    )
      .map((c) => ({
        ...c,
        ticketAverage:
          c.invoiceCount > 0 ? round2(c.totalSales / c.invoiceCount) : 0,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    return {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      cashiers,
    };
  }

  private parseDateBounds(
    startDateStr?: string,
    endDateStr?: string,
  ): { start?: Date; end?: Date } {
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
        start = new Date(`${startDateStr}T00:00:00.000Z`);
      } else {
        start = new Date(startDateStr);
      }
    }

    if (endDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
        end = new Date(`${endDateStr}T23:59:59.999Z`);
      } else {
        end = new Date(endDateStr);
      }
    }

    return { start, end };
  }

  private parseDayRange(dateStr?: string): {
    dateStr: string;
    start: Date;
    end: Date;
  } {
    let target = dateStr;
    if (!target) {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, '0');
      const d = String(now.getUTCDate()).padStart(2, '0');
      target = `${y}-${m}-${d}`;
    }

    const cleanDate = target.split('T')[0];
    const parts = cleanDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

    return {
      dateStr: cleanDate,
      start,
      end,
    };
  }
}
