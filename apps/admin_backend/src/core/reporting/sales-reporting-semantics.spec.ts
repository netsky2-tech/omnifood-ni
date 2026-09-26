import {
  computeSalesReportingTotals,
  isCompletedSaleRow,
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
});
