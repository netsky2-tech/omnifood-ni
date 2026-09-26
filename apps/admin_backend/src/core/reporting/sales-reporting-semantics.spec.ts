import {
  allocateInvoiceLineNetSales,
  computeDailySalesSeries,
  computeSalesReportingTipsSummary,
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

  describe('computeSalesReportingTipsSummary (PRD §21, Batch 7)', () => {
    it('aggregates tip metrics over a mixed recorded/zero/legacy/canceled fixture', () => {
      const rows: SalesReportingInvoiceRow[] = [
        // Tipped sale: tip 50 on a 500 base (numeric columns arrive as
        // strings over the wire — same coercion as the other aggregates).
        {
          isCanceled: false,
          subtotal: 500,
          tipAmountNio: '50.00',
          tipEligibleBaseNio: '500.00',
        },
        // Tipped sale on a USD-style smaller base.
        {
          isCanceled: false,
          subtotal: 800,
          tipAmountNio: 80,
          tipEligibleBaseNio: 800,
        },
        // Genuine zero-tip sale: recorded, declined (PRD §21.1 vs AD-10).
        {
          isCanceled: false,
          subtotal: 300,
          tipAmountNio: 0,
          tipEligibleBaseNio: 300,
        },
        // Legacy pre-remediation row: NULL tip, never backfilled (AD-10).
        { isCanceled: false, subtotal: 200, tipAmountNio: null },
        // Canceled sale with a tip: never reported.
        {
          isCanceled: true,
          subtotal: 999,
          tipAmountNio: 999,
          tipEligibleBaseNio: 999,
        },
      ];

      expect(computeSalesReportingTipsSummary(rows)).toEqual({
        totalTipsNio: 130,
        tippedTicketCount: 2,
        tipEligibleBaseNio: 1600,
        averageTipNio: 65,
        tipRate: 8.13,
        tipCoverage: {
          recordedInvoicesCount: 3,
          totalInvoicesCount: 4,
          coverageRatio: 0.75,
        },
      });
    });

    it('preserves nulls on all-legacy NULL rows instead of reporting zeros (AD-10)', () => {
      const rows: SalesReportingInvoiceRow[] = [
        { isCanceled: false, subtotal: 500, tipAmountNio: null },
        { isCanceled: false, subtotal: 300 },
      ];

      const summary = computeSalesReportingTipsSummary(rows);
      expect(summary.totalTipsNio).toBeNull();
      expect(summary.tipEligibleBaseNio).toBeNull();
      expect(summary.tipRate).toBeNull();
      expect(summary.averageTipNio).toBeNull();
      expect(summary.tippedTicketCount).toBe(0);
      expect(summary.tipCoverage).toEqual({
        recordedInvoicesCount: 0,
        totalInvoicesCount: 2,
        coverageRatio: 0,
      });
    });

    it('keeps recorded zero-tip sales distinct from legacy NULLs (full coverage, zero tips)', () => {
      const summary = computeSalesReportingTipsSummary([
        {
          isCanceled: false,
          subtotal: 500,
          tipAmountNio: 0,
          tipEligibleBaseNio: 500,
        },
      ]);

      expect(summary.totalTipsNio).toBe(0);
      expect(summary.tippedTicketCount).toBe(0);
      expect(summary.tipEligibleBaseNio).toBe(500);
      expect(summary.averageTipNio).toBeNull();
      expect(summary.tipRate).toBe(0);
      expect(summary.tipCoverage.coverageRatio).toBe(1);
    });

    it('returns null rates and averages when the period has no completed invoices', () => {
      const summary = computeSalesReportingTipsSummary([
        { isCanceled: true, subtotal: 500, tipAmountNio: 50 },
      ]);

      expect(summary.totalTipsNio).toBeNull();
      expect(summary.tippedTicketCount).toBe(0);
      expect(summary.averageTipNio).toBeNull();
      expect(summary.tipRate).toBeNull();
      expect(summary.tipCoverage).toEqual({
        recordedInvoicesCount: 0,
        totalInvoicesCount: 0,
        coverageRatio: null,
      });
    });

    it('never lets tips leak into Net Sales or any sales total (PRD §21.3)', () => {
      const rows: SalesReportingInvoiceRow[] = [
        {
          isCanceled: false,
          subtotal: 1000,
          totalTax: 150,
          tipAmountNio: 100,
          tipEligibleBaseNio: 1000,
        },
      ];

      const totals = computeSalesReportingTotals(rows);
      // Net Sales is Σ subtotal only: the tip stays out (PRD §21.3).
      expect(totals.netSalesNio).toBe(1000);
      expect(totals.preDiscountSalesNio).toBe(1000);
      expect(totals.totalTaxNio).toBe(150);
      // The same rows do produce the tip totals alongside.
      expect(computeSalesReportingTipsSummary(rows).totalTipsNio).toBe(100);
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

  /**
   * Line-level decomposition (FR-PRODUCT-01 / Batch 5c-backend):
   *
   * A persisted invoice line carries `total` (tax-INCLUSIVE) and
   * `taxAmount`, so its Net Sales (post-discount, pre-tax) contribution is
   * `total - taxAmount`. The invoices service derives the persisted invoice
   * `subtotal` exactly this way (subtotal = Σ line totals - Σ line
   * taxAmount, invoices.service.ts credit-note path), so per invoice:
   *
   *   Σ allocateInvoiceLineNetSales(row) === salesRowNetSales(row)
   *
   * must hold EXACTLY. When the persisted line cents and the persisted
   * invoice subtotal disagree by a rounding residue (both are scale-2
   * decimals written from scale-4 arithmetic), the residue is allocated
   * deterministically by largest remainder (weighted by absolute raw line
   * net, ties broken by descending weight then line order) so the identity
   * always holds.
   */
  describe('allocateInvoiceLineNetSales (Batch 5c line decomposition)', () => {
    it('decomposes a clean single-line invoice exactly (total - taxAmount)', () => {
      const nets = allocateInvoiceLineNetSales({
        subtotal: 1000,
        items: [{ total: 1150, taxAmount: 150 }],
      });

      expect(nets).toEqual([1000]);
      expect(nets.reduce((a, b) => a + b, 0)).toBe(1000);
    });

    it('decomposes a clean multi-line invoice; Σ line nets == invoice.subtotal', () => {
      const nets = allocateInvoiceLineNetSales({
        subtotal: 3350,
        items: [
          { total: 1150, taxAmount: 150 },
          { total: 2300, taxAmount: 300 },
          { total: 402.5, taxAmount: 52.5 },
        ],
      });

      expect(nets).toEqual([1000, 2000, 350]);
      expect(nets.reduce((a, b) => a + b, 0)).toBe(3350);
    });

    it('nets credit-note lines as persisted (negative totals and tax)', () => {
      // Credit-note lines persist total = -origin.total * ratio and
      // taxAmount = -origin.taxAmount * ratio (invoices.service.ts); the
      // invoice subtotal is round(total - totalTax).
      const row: SalesReportingInvoiceRow = {
        isCanceled: false,
        subtotal: -1400,
        items: [
          { total: -1150, taxAmount: -150 },
          { total: -460, taxAmount: -60 },
        ],
      };

      const nets = allocateInvoiceLineNetSales(row);
      expect(nets).toEqual([-1000, -400]);
      expect(nets.reduce((a, b) => a + b, 0)).toBe(-1400);
      expect(nets.reduce((a, b) => a + b, 0)).toBe(salesRowNetSales(row));
    });

    it('allocates a negative rounding residue by largest remainder (28.34+28.34 vs subtotal 56.67)', () => {
      // Persisted line cents round UP both lines (33.34 - 5.00 = 28.34),
      // while the persisted scale-4 subtotal rounds DOWN to 56.67: residue
      // -0.01 must be absorbed so Σ line nets == subtotal exactly.
      const nets = allocateInvoiceLineNetSales({
        subtotal: 56.67,
        items: [
          { total: 33.34, taxAmount: 5 },
          { total: 33.34, taxAmount: 5 },
        ],
      });

      expect(nets).toEqual([28.33, 28.34]);
      expect(nets.reduce((a, b) => a + b, 0)).toBe(56.67);
    });

    it('allocates a positive rounding residue on credit-note lines (−28.34−28.34 vs subtotal −56.67)', () => {
      const nets = allocateInvoiceLineNetSales({
        subtotal: -56.67,
        items: [
          { total: -33.34, taxAmount: -5 },
          { total: -33.34, taxAmount: -5 },
        ],
      });

      expect(nets).toEqual([-28.33, -28.34]);
      expect(nets.reduce((a, b) => a + b, 0)).toBe(-56.67);
    });

    it('sends the whole residue to the first line when every raw net is zero', () => {
      const nets = allocateInvoiceLineNetSales({
        subtotal: 0.02,
        items: [
          { total: 0, taxAmount: 0 },
          { total: 0, taxAmount: 0 },
        ],
      });

      expect(nets).toEqual([0.02, 0]);
    });

    it('treats a row without items as an empty decomposition', () => {
      expect(allocateInvoiceLineNetSales({ subtotal: 730, items: [] })).toEqual(
        [],
      );
      expect(allocateInvoiceLineNetSales({ subtotal: 730 })).toEqual([]);
    });

    it('holds the decomposition identity over every deterministic residue case', () => {
      // Sweep persisted-cent combinations so any future allocation change
      // keeps Σ line nets === round2(subtotal) exactly, including credit
      // notes (negative lines) and zero-net lines.
      for (let subtotalCents = -300; subtotalCents <= 300; subtotalCents += 7) {
        for (let aCents = -200; aCents <= 200; aCents += 13) {
          for (let bCents = -150; bCents <= 150; bCents += 11) {
            const row: SalesReportingInvoiceRow = {
              isCanceled: false,
              subtotal: subtotalCents / 100,
              items: [
                { total: aCents / 100, taxAmount: 0 },
                { total: bCents / 100, taxAmount: 0 },
              ],
            };
            const nets = allocateInvoiceLineNetSales(row);
            const sum = nets.reduce((acc, n) => acc + n, 0);
            expect(Math.round(sum * 100)).toBe(subtotalCents);
          }
        }
      }
    });
  });
});
