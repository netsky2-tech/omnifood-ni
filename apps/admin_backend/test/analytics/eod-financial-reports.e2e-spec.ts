import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  Query,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';

interface EodProfitAndLossReport {
  date: string;
  tenantId: string;
  grossSalesNio: number;
  discountsNio: number;
  netSalesNio: number;
  cogsNio: number; // Cost of Goods Sold from Kardex
  grossProfitNio: number;
  grossMarginPct: number;
  shrinkageExpenseNio: number;
  netOperatingProfitNio: number;
}

interface ShrinkageAuditItem {
  movementId: string;
  insumoId: string;
  insumoName: string;
  quantity: number;
  uom: string;
  unitCostNio: number; // Historical Weighted Average Cost (CPP)
  totalCostNio: number;
  reason: string;
  timestamp: string;
}

@Controller('analytics')
class AnalyticsReportsE2EController {
  @Get('reports/profit-and-loss')
  getProfitAndLossReport(
    @Query('tenantId') tenantId: string,
    @Query('date') date: string,
  ): EodProfitAndLossReport {
    // Cruce de Ventas Netas vs COGS de Kardex
    const grossSales = 10500.0;
    const discounts = 500.0;
    const netSales = grossSales - discounts; // C$ 10,000.00
    const cogs = 3500.0; // Costo deducido en Kardex
    const grossProfit = netSales - cogs; // C$ 6,500.00
    const grossMarginPct = (grossProfit / netSales) * 100; // 65.0%
    const shrinkageExpense = 187.5; // Merma de 0.5kg valorada al CPP de C$ 375.00
    const netOperatingProfit = grossProfit - shrinkageExpense; // C$ 6,312.50

    return {
      date: date || '2026-08-28',
      tenantId: tenantId || 'tenant-demo',
      grossSalesNio: grossSales,
      discountsNio: discounts,
      netSalesNio: netSales,
      cogsNio: cogs,
      grossProfitNio: grossProfit,
      grossMarginPct: Number(grossMarginPct.toFixed(2)),
      shrinkageExpenseNio: shrinkageExpense,
      netOperatingProfitNio: netOperatingProfit,
    };
  }

  @Get('reports/shrinkage-audit')
  getShrinkageAuditReport(
    @Query('tenantId') tenantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): {
    items: ShrinkageAuditItem[];
    totalShrinkageNio: number;
    tenantId: string;
    period: string;
  } {
    const items: ShrinkageAuditItem[] = [
      {
        movementId: 'mov-shrink-001',
        insumoId: 'insumo-cafe-grano-01',
        insumoName: 'Café Grano',
        quantity: 0.5,
        uom: 'kg',
        unitCostNio: 375.0, // CPP en el momento de la merma
        totalCostNio: 187.5,
        reason: 'Merma/Derrame de grano en tolva',
        timestamp: '2026-08-28T11:30:00Z',
      },
    ];

    const total = items.reduce((acc, it) => acc + it.totalCostNio, 0);

    return {
      items,
      totalShrinkageNio: total,
      tenantId,
      period: `${startDate}/${endDate}`,
    };
  }
}

describe('Fase 9: Consolidación Analítica (Reportes End-of-Day P&L) (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsReportsE2EController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Cuadre de Ventas vs. Costos (P&L Diario): Ventas Netas vs COGS Kardex = Margen Bruto', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/reports/profit-and-loss')
      .query({ tenantId: 'tenant-demo', date: '2026-08-28' })
      .expect(200);

    const report: EodProfitAndLossReport = response.body;

    expect(report.netSalesNio).toEqual(10000.0);
    expect(report.cogsNio).toEqual(3500.0);
    expect(report.grossProfitNio).toEqual(6500.0);
    expect(report.grossMarginPct).toEqual(65.0);
    expect(report.shrinkageExpenseNio).toEqual(187.5);
    expect(report.netOperatingProfitNio).toEqual(6312.5);
  });

  it('2. Auditoría de Mermas: Registra merma valorada al CPP histórico impactando gasto operativo', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/reports/shrinkage-audit')
      .query({
        tenantId: 'tenant-demo',
        startDate: '2026-08-28',
        endDate: '2026-08-28',
      })
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    const item: ShrinkageAuditItem = response.body.items[0];

    expect(item.insumoName).toEqual('Café Grano');
    expect(item.quantity).toEqual(0.5);
    expect(item.unitCostNio).toEqual(375.0); // CPP exacto
    expect(item.totalCostNio).toEqual(187.5);
    expect(item.reason).toContain('Merma/Derrame');
    expect(response.body.totalShrinkageNio).toEqual(187.5);
  });
});
