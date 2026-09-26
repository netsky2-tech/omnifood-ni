import {
  computeDailySalesSeries,
  computeSalesReportingTotals,
  isCompletedSaleRow,
  resolveInvoiceLocalDayBucket,
  SalesReportingInvoiceRow,
  salesRowDiscounts,
  salesRowNetSales,
} from './sales-reporting-semantics';

/**
 * Known-fixture reconciliation (PRD AC-03 / spec §7.1):
 *
 * inv-1  regular sale:      subtotal 1000, tax 150, item discount  50
 * inv-2  regular sale:      subtotal 2000, tax 300, item discount 100
 * inv-3  regular sale:      subtotal  730, tax 109.5, no items
 *
 * Expected (historical semantics, tax excluded):
 *   netSales            = 3730
 *   preDiscountSales    = netSales + discounts = 3730 + 150 = 3880
 *   tickets             = 3
 *   averageTicket       = 3730 / 3 = 1243.33
 *   taxTotal            = 559.5
 *   discountTotal       = 150
 */
const KNOWN_FIXTURE: SalesReportingInvoiceRow[] = [
  {
    isCanceled: false,
    subtotal: 1000,
    totalTax: 150,
    items: [{ discount: 50 }],
  },
  {
    isCanceled: false,
    subtotal: 2000,
    totalTax: 300,
    items: [{ discount: 100 }],
  },
  {
    isCanceled: false,
    subtotal: 730,
    totalTax: 109.5,
    items: [],
  },
];

describe('SalesReportingSemantics (spec §7.1)', () => {
  describe('isCompletedSaleRow', () => {
    it('mirrors the current report queries: not canceled is completed', () => {
      expect(isCompletedSaleRow({ isCanceled: false, subtotal: 100 })).toBe(
        true,
      );
      expect(isCompletedSaleRow({ isCanceled: true, subtotal: 100 })).toBe(
        false,
      );
    });
  });

  describe('salesRowNetSales', () => {
    it('uses the historical persisted subtotal, never catalog values', () => {
      expect(salesRowNetSales({ isCanceled: false, subtotal: '123.45' })).toBe(
        123.45,
      );
      expect(salesRowNetSales({ isCanceled: false, subtotal: null })).toBe(0);
    });

    it('nets negative-subtotal credit-note documents as persisted (approved historical semantics)', () => {
      // Credit notes are NOT excluded by a type filter anywhere in the current
      // reporting queries; they enter every total exactly as persisted.
      expect(salesRowNetSales({ isCanceled: false, subtotal: -800 })).toBe(
        -800,
      );
    });
  });

  describe('salesRowDiscounts', () => {
    it('sums line-item discounts from historical persisted rows', () => {
      expect(
        salesRowDiscounts({
          isCanceled: false,
          subtotal: 1000,
          items: [{ discount: 30 }, { discount: 20 }],
        }),
      ).toBe(50);
    });

    it('treats missing items or discounts as zero', () => {
      expect(salesRowDiscounts({ isCanceled: false, subtotal: 100 })).toBe(0);
      expect(
        salesRowDiscounts({
          isCanceled: false,
          subtotal: 100,
          items: [{ discount: null }],
        }),
      ).toBe(0);
    });
  });

  describe('computeSalesReportingTotals', () => {
    it('reconciles the known fixture (PRD AC-03)', () => {
      expect(computeSalesReportingTotals(KNOWN_FIXTURE)).toEqual({
        netSalesNio: 3730,
        preDiscountSalesNio: 3880,
        completedTicketCount: 3,
        averageTicketNetNio: 1243.33,
        totalTaxNio: 559.5,
        totalDiscountsNio: 150,
      });
    });

    it('excludes canceled/void documents from every total and from the ticket count', () => {
      const rows: SalesReportingInvoiceRow[] = [
        ...KNOWN_FIXTURE,
        {
          isCanceled: true,
          subtotal: 99999,
          totalTax: 1,
          items: [{ discount: 999 }],
        },
      ];

      const totals = computeSalesReportingTotals(rows);
      expect(totals.completedTicketCount).toBe(3);
      expect(totals.netSalesNio).toBe(3730);
      expect(totals.totalTaxNio).toBe(559.5);
      expect(totals.totalDiscountsNio).toBe(150);
    });

    it('returns averageTicketNetNio null when there are no completed tickets (PRD §7.5)', () => {
      const totals = computeSalesReportingTotals([
        { isCanceled: true, subtotal: 500, totalTax: 75, items: [] },
      ]);

      expect(totals.completedTicketCount).toBe(0);
      expect(totals.netSalesNio).toBe(0);
      expect(totals.averageTicketNetNio).toBeNull();
      expect(totals.averageTicketNetNio).not.toBe(0);
    });

    it('nets credit notes into sales totals as persisted (documented historical semantics)', () => {
      // A credit note is persisted with a negative subtotal (see
      // invoices.service.db.spec.ts fixtures): it nets into Net Sales.
      const rows: SalesReportingInvoiceRow[] = [
        { isCanceled: false, subtotal: 2000, totalTax: 300, items: [] },
        { isCanceled: false, subtotal: -500, totalTax: -75, items: [] },
      ];

      const totals = computeSalesReportingTotals(rows);
      expect(totals.netSalesNio).toBe(1500);
      expect(totals.completedTicketCount).toBe(2);
      expect(totals.averageTicketNetNio).toBe(750);
    });

    it('returns zero totals for an empty invoice set', () => {
      expect(computeSalesReportingTotals([])).toEqual({
        netSalesNio: 0,
        preDiscountSalesNio: 0,
        completedTicketCount: 0,
        averageTicketNetNio: null,
        totalTaxNio: 0,
        totalDiscountsNio: 0,
      });
    });

    it('derives preDiscountSales as netSales + discounts (PRD §7.3)', () => {
      const totals = computeSalesReportingTotals([
        {
          isCanceled: false,
          subtotal: 637.2,
          totalTax: 95.58,
          items: [{ discount: 62.8 }],
        },
      ]);

      expect(totals.netSalesNio).toBe(637.2);
      expect(totals.totalDiscountsNio).toBe(62.8);
      expect(totals.preDiscountSalesNio).toBe(700);
    });
  });

  describe('resolveInvoiceLocalDayBucket (Batch 5a daily bucketing)', () => {
    it('prefers the on-device localIssueDate when present and valid', () => {
      expect(
        resolveInvoiceLocalDayBucket({
          isCanceled: false,
          subtotal: 100,
          localIssueDate: '2026-06-10',
          created_at: new Date('2026-06-11T04:30:00.000Z'),
        }),
      ).toBe('2026-06-10');
    });

    it('falls back to created_at rendered in America/Managua for legacy rows', () => {
      // 2026-06-11T04:30Z == 2026-06-10 22:30 Managua -> previous local day.
      expect(
        resolveInvoiceLocalDayBucket({
          isCanceled: false,
          subtotal: 100,
          created_at: new Date('2026-06-11T04:30:00.000Z'),
        }),
      ).toBe('2026-06-10');
      // 2026-06-10T18:00Z == 2026-06-10 12:00 Managua -> same local day.
      expect(
        resolveInvoiceLocalDayBucket({
          isCanceled: false,
          subtotal: 100,
          created_at: new Date('2026-06-10T18:00:00.000Z'),
        }),
      ).toBe('2026-06-10');
    });

    it('ignores a malformed localIssueDate and uses the created_at fallback', () => {
      expect(
        resolveInvoiceLocalDayBucket({
          isCanceled: false,
          subtotal: 100,
          localIssueDate: 'not-a-date',
          created_at: new Date('2026-06-10T18:00:00.000Z'),
        }),
      ).toBe('2026-06-10');
    });

    it('returns null only when neither bucket source is usable', () => {
      expect(
        resolveInvoiceLocalDayBucket({ isCanceled: false, subtotal: 100 }),
      ).toBeNull();
    });
  });

  describe('computeDailySalesSeries (PRD §14, spec §7.2 invariant)', () => {
    it('emits every calendar day in order, with zero-sales gap days present', () => {
      const days = computeDailySalesSeries('2026-06-10', '2026-06-13', [
        {
          isCanceled: false,
          subtotal: 500,
          localIssueDate: '2026-06-10',
        },
        {
          isCanceled: false,
          subtotal: 300,
          localIssueDate: '2026-06-13',
        },
      ]);

      expect(days.map((d) => d.date)).toEqual([
        '2026-06-10',
        '2026-06-11',
        '2026-06-12',
        '2026-06-13',
      ]);
      expect(days[0]).toEqual({
        date: '2026-06-10',
        netSalesNio: 500,
        completedTicketCount: 1,
        averageTicketNetNio: 500,
      });
      // Gap days: zero sales, null average (PRD §7.5: "—", never C$0.00).
      expect(days[1]).toEqual({
        date: '2026-06-11',
        netSalesNio: 0,
        completedTicketCount: 0,
        averageTicketNetNio: null,
      });
      expect(days[2]).toEqual({
        date: '2026-06-12',
        netSalesNio: 0,
        completedTicketCount: 0,
        averageTicketNetNio: null,
      });
      expect(days[3]).toEqual({
        date: '2026-06-13',
        netSalesNio: 300,
        completedTicketCount: 1,
        averageTicketNetNio: 300,
      });
    });

    it('uses the same completed-sale predicate: canceled rows are excluded', () => {
      const days = computeDailySalesSeries('2026-06-10', '2026-06-10', [
        { isCanceled: true, subtotal: 999, localIssueDate: '2026-06-10' },
      ]);

      expect(days[0]).toEqual({
        date: '2026-06-10',
        netSalesNio: 0,
        completedTicketCount: 0,
        averageTicketNetNio: null,
      });
    });

    it('keeps the §7.2 parity invariant even when a bucket falls outside the range', () => {
      // A row whose on-device localIssueDate precedes the range start (issued
      // 23:59, synced after midnight) must still land in exactly one day
      // bucket so Σ days.netSalesNio always reconciles with the KPI total.
      const rows: SalesReportingInvoiceRow[] = [
        {
          isCanceled: false,
          subtotal: 400,
          localIssueDate: '2026-06-09',
          created_at: new Date('2026-06-10T02:00:00.000Z'),
        },
        {
          isCanceled: false,
          subtotal: 250.5,
          localIssueDate: '2026-06-11',
        },
        {
          isCanceled: false,
          subtotal: -300,
          localIssueDate: '2026-06-12',
        },
      ];

      const days = computeDailySalesSeries('2026-06-10', '2026-06-12', rows);
      const seriesNet = days.reduce((sum, d) => sum + d.netSalesNio, 0);

      expect(seriesNet).toBe(computeSalesReportingTotals(rows).netSalesNio);
      // Clamped to the first range day, not silently dropped.
      expect(days[0].netSalesNio).toBe(400);
      expect(days[1].netSalesNio).toBe(250.5);
      expect(days[2].netSalesNio).toBe(-300);
    });
  });
});
