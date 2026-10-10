import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  EntityManager,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  DataSource,
  Repository,
} from 'typeorm';
import * as ExcelJS from 'exceljs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { salesRowDiscountOrigins } from '../../../core/reporting/sales-reporting-semantics';
import { FiscalSetupService } from '../../onboarding/services/fiscal-setup.service';
import { Customer } from '../../customers/entities/customer.entity';
import { Invoice } from '../entities/invoice.entity';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import { CashMovement } from '../entities/cash-movement.entity';
import {
  ExportFormat,
  ExportResult,
  ExportSalesBookQueryDto,
  ExportZReportsQueryDto,
  SalesBookExportDto,
  SalesBookRowDto,
  ZReportRowDto,
  ZReportsExportDto,
} from '../dto/sales-export.dto';
import {
  XReportDto,
  XReportQueryDto,
  XReportShiftDto,
  ZReportDto,
  ZReportRecordDto,
  ZReportQueryDto,
} from '../dto/fiscal-reports.dto';

/**
 * G1 (issue #522 Finding 1): bounds for the shared Corte Z aggregation.
 * RULING: aggregation is keyed on the SHIFT (cash_shift_sessions) — never
 * on a "fiscal day" (the product has no fiscal-day concept, open question
 * P8 in docs/operations/preguntas-contadora-round-2.md); a date range
 * filters `opened_at` and an optional shiftId narrows to one shift.
 */
export interface ZReportRowBounds {
  start?: Date;
  end?: Date;
  shiftId?: string;
}

/** Rows plus the underlying shift entities, so enriching layers (the Z
 *  report's supervisor, status filtering) never re-read the shifts. */
export interface ZReportRowsResult {
  records: ZReportRowDto[];
  shifts: CashShiftSession[];
}

const round2 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

/**
 * DEC-04 card-voucher method set — mirrors the card-reconciliation SQL in
 * sync-health (CARD/TARJETA/BAC/BANPRO), so the Z report's blocker signal
 * counts exactly the payments that reconcile as card vouchers.
 */
const isCardPaymentMethod = (method?: string): boolean => {
  const normalized = (method ?? '').trim().toUpperCase();
  return ['CARD', 'TARJETA', 'BAC', 'BANPRO'].includes(normalized);
};

const escapeCsv = (
  field: string | number | boolean | null | undefined,
): string => {
  if (field === null || field === undefined) return '""';
  const str = typeof field === 'string' ? field : String(field);
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Post-review remediation (ITEM 3): conservative fixed chunk size for the
 * legacy customer-id catalog read. Postgres' bind-parameter ceiling is
 * 65535; a wide date range over high-rotation retail data can produce far
 * more distinct legacy ids than one statement may bind, so the list is read
 * in bounded chunks and merged.
 */
export const CUSTOMER_ID_CHUNK_SIZE = 1000;

/**
 * Post-review remediation (ITEM 2): the savepoint that isolates the catalog
 * resolution inside the export transaction. A statement error (missing
 * table/grant, RLS policy error) aborts the surrounding transaction, so a
 * plain try/catch cannot degrade safely — the failure must be rolled back
 * to this savepoint before the export continues.
 */
export const CUSTOMER_SNAPSHOT_RESOLUTION_SAVEPOINT =
  'customer_snapshot_resolution';

const buildPdfBuffer = (doc: PDFKit.PDFDocument): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

@Injectable()
export class SalesExportService {
  private readonly logger = new Logger(SalesExportService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(CashShiftSession)
    private readonly shiftRepo: Repository<CashShiftSession>,
    // Issue #512 slice 5: cash_shift_sessions is tenant-RLS protected, so its
    // read must run inside the tenant-bound transaction manager; the pooled
    // repositories stay declared for Nest DI compatibility only.
    private readonly dataSource: DataSource,
    // B2e U3 (D-3): the sales book IVA labels derive from the tenant's
    // effective fiscal configuration — the regime is the single source of
    // IVA treatment, so no export header may hardcode a percentage.
    private readonly fiscalSetupService: FiscalSetupService,
  ) {}

  /**
   * B2e U3 (D-3): regime-aware IVA column labels for the DGI sales book.
   *
   * The percentage is derived from the tenant's configured `taxRateIva`
   * (Regimen General → e.g. 'IVA 15%'). When the effective rate is 0 (Cuota
   * Fija) the labels stay plain ('IVA' / 'Gravado'): the book collects no
   * IVA, so no percentage is printed — and never an invented 15%. If the
   * fiscal setup cannot be read, the labels degrade to the plain form too:
   * fail closed, never fall back to a fabricated rate.
   */
  private async resolveIvaLabels(tenantId: string): Promise<{
    ivaLabel: string;
    gravadoLabel: string;
  }> {
    try {
      const setup = await this.fiscalSetupService.getFiscalSetup(tenantId);
      const pct = Math.round(Number(setup.taxRateIva ?? 0) * 100);
      if (pct > 0) {
        return { ivaLabel: `IVA ${pct}%`, gravadoLabel: `Gravado ${pct}%` };
      }
    } catch {
      // Fail closed: plain labels, never a hardcoded percentage.
    }
    return { ivaLabel: 'IVA', gravadoLabel: 'Gravado' };
  }

  async exportSalesBook(
    tenantId: string,
    query?: ExportSalesBookQueryDto,
  ): Promise<ExportResult<SalesBookExportDto>> {
    const format: ExportFormat = query?.format ?? 'json';
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );

    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    // Issue #581 WU1: invoices is a direct:SIUD RLS-forced table — the
    // pooled find silently returned zero rows under the production
    // NOBYPASSRLS role. Bound read, identical query semantics (mirrors
    // exportZReports' binding pattern).
    //
    // Post-review fix (HIGH): the read ALSO resolves legacy display names
    // inside the SAME tenant transaction — invoices migrated with a NULL
    // customer_name snapshot must never surface the opaque internal
    // customerId UUID in the DGI sales book ("Cliente" column).
    const { invoices, customerNamesById } = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const readInvoices = await manager.getRepository(Invoice).find({
          where: whereClause,
          relations: ['items'],
          order: { created_at: 'ASC' },
        });
        // Distinct, non-blank customerIds of invoices whose trimmed
        // customerName snapshot is empty — the only rows needing a
        // catalog lookup.
        const unresolvedIds = [
          ...new Set(
            readInvoices
              .filter(
                (inv) =>
                  !(inv.customerName ?? '').trim() &&
                  !!(inv.customerId ?? '').trim(),
              )
              .map((inv) => (inv.customerId ?? '').trim()),
          ),
        ];

        const customerNamesById = new Map<string, string>();
        if (unresolvedIds.length > 0) {
          await this.resolveLegacyCustomerNames(
            manager,
            tenantId,
            unresolvedIds,
            customerNamesById,
          );
        }

        return { invoices: readInvoices, customerNamesById };
      },
    );

    let totalGrossNio = 0;
    let totalTaxNio = 0;
    let totalExemptNio = 0;

    const records: SalesBookRowDto[] = invoices.map((inv) => {
      const isCanceled = inv.isCanceled ?? false;
      const isCreditNote = inv.type === 'creditNote';
      const docType = isCanceled
        ? 'ANULADA'
        : isCreditNote
          ? 'NOTA_CREDITO'
          : 'FACTURA';
      const status = isCanceled ? 'ANULADA' : 'VALIDA';

      let discountNio = 0;
      let taxableSubtotalNio = 0;
      let exemptSubtotalNio = 0;

      if (inv.items && inv.items.length > 0) {
        for (const item of inv.items) {
          discountNio = round2(discountNio + Number(item.discount ?? 0));
          const taxRate = Number(
            item.appliedTaxRate ?? item.originalTaxRate ?? 0,
          );
          const taxAmount = Number(item.taxAmount ?? 0);
          const itemBase = round2(
            Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0) -
              Number(item.discount ?? 0),
          );

          if (taxRate > 0 || taxAmount > 0) {
            taxableSubtotalNio = round2(taxableSubtotalNio + itemBase);
          } else {
            exemptSubtotalNio = round2(exemptSubtotalNio + itemBase);
          }
        }
      } else {
        const invTax = Number(inv.totalTax ?? 0);
        const invSubtotal = Number(inv.subtotal ?? 0);
        if (invTax > 0) {
          taxableSubtotalNio = invSubtotal;
        } else {
          exemptSubtotalNio = invSubtotal;
        }
      }

      const totalNio = Number(inv.total ?? 0);
      const totalTax = Number(inv.totalTax ?? 0);
      const totalUsd = Number(inv.totalUsd ?? 0);

      // S1c-3c: per-origin discount attribution, computed in THIS SAME
      // per-invoice loop that produced discountNio above, via the ONE
      // extracted rule the dashboard's period fold also uses
      // (salesRowDiscountOrigins) — so the per-row identity
      // manual + promotion + loyalty + unattributed === discountNio holds by
      // construction and the book can never disagree with the dashboard.
      const discountOrigins = salesRowDiscountOrigins(inv);

      if (!isCanceled) {
        totalGrossNio = round2(totalGrossNio + totalNio);
        totalTaxNio = round2(totalTaxNio + totalTax);
        totalExemptNio = round2(totalExemptNio + exemptSubtotalNio);
      }

      const dateStr = inv.created_at
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Managua',
          }).format(new Date(inv.created_at))
        : new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Managua',
          }).format(new Date());

      return {
        date: dateStr,
        invoiceNumber: inv.number || 'N/A',
        documentType: docType,
        customerName: this.resolveCustomerDisplayName(inv, customerNamesById),
        exemptSubtotalNio: round2(exemptSubtotalNio),
        taxableSubtotalNio: round2(taxableSubtotalNio),
        taxAmountNio: round2(totalTax),
        discountNio: round2(discountNio),
        manualDiscountNio: discountOrigins.manual,
        promotionDiscountNio: discountOrigins.promotion,
        loyaltyDiscountNio: discountOrigins.loyalty,
        discountOriginUnattributedNio: discountOrigins.unattributed,
        totalNio: round2(totalNio),
        totalUsd: round2(totalUsd),
        status,
        isCanceled,
      };
    });

    const exportData: SalesBookExportDto = {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      totalGrossNio: round2(totalGrossNio),
      totalTaxNio: round2(totalTaxNio),
      totalExemptNio: round2(totalExemptNio),
      records,
    };

    const datePrefix =
      query?.startDate ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua' }).format(
        new Date(),
      );

    // B2e U3 (D-3): labels resolve once per export from the fiscal config.
    const { ivaLabel, gravadoLabel } = await this.resolveIvaLabels(tenantId);

    if (format === 'csv') {
      return {
        format: 'csv',
        filename: `libro-ventas-dgi-${datePrefix}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: this.generateSalesBookCsv(records, ivaLabel, gravadoLabel),
        data: exportData,
      };
    }

    if (format === 'xlsx') {
      const buffer = await this.generateSalesBookXlsx(
        exportData,
        ivaLabel,
        gravadoLabel,
      );
      return {
        format: 'xlsx',
        filename: `libro-ventas-dgi-${datePrefix}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
        data: exportData,
      };
    }

    if (format === 'pdf') {
      const buffer = await this.generateSalesBookPdf(exportData, ivaLabel);
      return {
        format: 'pdf',
        filename: `libro-ventas-dgi-${datePrefix}.pdf`,
        contentType: 'application/pdf',
        buffer,
        data: exportData,
      };
    }

    return {
      format: 'json',
      filename: `libro-ventas-dgi-${datePrefix}.json`,
      contentType: 'application/json',
      data: exportData,
    };
  }

  /**
   * Post-review remediation (ITEMs 1–3): legacy customer-name resolution.
   *
   * ITEM 1 — TEXT comparison: `customers.id` is a uuid primary key while
   * `invoices.customer_id` is a plain varchar with NO foreign key and NO
   * validation, so a repository `In([...])` on the uuid column forces
   * Postgres to cast every literal to uuid and ANY legacy or manually-
   * inserted non-UUID id raises 22P02 (invalid input syntax for type uuid),
   * aborting the WHOLE DGI sales-book export. Comparing `id::text` never
   * attempts the cast, so a legacy id can only miss — never throw. The
   * explicit `tenant_id` predicate stays: binding is additive, never a
   * replacement, and this must not become a cross-tenant read.
   *
   * ITEM 2 — SAVEPOINT degradation: the catalog read is a NON-ESSENTIAL
   * enrichment inside the SAME tenant transaction. Postgres aborts the
   * surrounding transaction after a statement error, so a plain try/catch
   * cannot degrade safely; the resolution runs inside a savepoint that is
   * rolled back to on failure (and released), letting the export survive
   * and degrade unresolved rows to 'CONSUMIDOR FINAL'. The degradation is
   * logged with a stable code — observable, never silent.
   *
   * ITEM 3 — bounded chunks: the distinct id list is read in fixed-size
   * chunks so a wide date range cannot exceed Postgres' 65535 bind-parameter
   * ceiling; chunk results merge into one map.
   */
  private async resolveLegacyCustomerNames(
    manager: EntityManager,
    tenantId: string,
    unresolvedIds: string[],
    customerNamesById: Map<string, string>,
  ): Promise<void> {
    const savepoint = CUSTOMER_SNAPSHOT_RESOLUTION_SAVEPOINT;
    await manager.query(`SAVEPOINT ${savepoint}`);
    try {
      for (
        let offset = 0;
        offset < unresolvedIds.length;
        offset += CUSTOMER_ID_CHUNK_SIZE
      ) {
        const chunk = unresolvedIds.slice(offset, offset + CUSTOMER_ID_CHUNK_SIZE);
        const customers = await manager
          .getRepository(Customer)
          .createQueryBuilder('customer')
          .select(['customer.id', 'customer.name'])
          .where('customer.tenant_id = :tenantId', { tenantId })
          .andWhere('customer.id::text IN (:...ids)', { ids: chunk })
          .getMany();
        for (const customer of customers) {
          const name = (customer.name ?? '').trim();
          if (name) {
            customerNamesById.set(customer.id, name);
          }
        }
      }
      await manager.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (error) {
      // Postgres aborted the surrounding transaction on the statement
      // error: roll back to the savepoint (then release it) so the export
      // transaction stays usable and the read degrades gracefully.
      await manager.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await manager.query(`RELEASE SAVEPOINT ${savepoint}`);
      this.logger.warn(
        `CUSTOMER_SNAPSHOT_RESOLUTION_DEGRADED: legacy customer-name catalog read failed; affected sales-book rows export as 'CONSUMIDOR FINAL' (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  }

  /**
   * Post-review fix (HIGH): DGI sales book "Cliente" resolution. Fiscal
   * precedence:
   *   a. the invoice's customerName snapshot taken at sale time always wins —
   *      the catalog must never be applied retroactively to a fiscal document;
   *   b. else the current catalog name resolved from the internal customerId
   *      (legacy rows whose migration left customer_name NULL);
   *   c. else the literal 'CONSUMIDOR FINAL'.
   * The opaque internal customerId UUID must NEVER appear in the returned
   * value, and the fallback is never an empty string.
   */
  private resolveCustomerDisplayName(
    inv: Invoice,
    namesById: Map<string, string>,
  ): string {
    const snapshot = (inv.customerName ?? '').trim();
    if (snapshot) {
      return snapshot;
    }
    const catalogName = inv.customerId
      ? namesById.get(inv.customerId.trim())
      : undefined;
    if (catalogName) {
      return catalogName;
    }
    return 'CONSUMIDOR FINAL';
  }

  async exportZReports(
    tenantId: string,
    query?: ExportZReportsQueryDto,
  ): Promise<ExportResult<ZReportsExportDto>> {
    const format: ExportFormat = query?.format ?? 'json';
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );

    // G1 (issue #522 Finding 1): the shift read + row mapping moved into
    // the shared getZReportRows aggregation so the export and the /z
    // fiscal report can never drift apart. Behavior is byte-identical:
    // same where clause, same ordering, same mapping.
    const { records } = await this.getZReportRows(tenantId, { start, end });

    const exportData: ZReportsExportDto = {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      records,
    };

    const datePrefix =
      query?.startDate ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua' }).format(
        new Date(),
      );

    if (format === 'csv') {
      return {
        format: 'csv',
        filename: `resumen-cortes-z-${datePrefix}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: this.generateZReportsCsv(records),
        data: exportData,
      };
    }

    if (format === 'xlsx') {
      const buffer = await this.generateZReportsXlsx(exportData);
      return {
        format: 'xlsx',
        filename: `resumen-cortes-z-${datePrefix}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
        data: exportData,
      };
    }

    if (format === 'pdf') {
      const buffer = await this.generateZReportsPdf(exportData);
      return {
        format: 'pdf',
        filename: `resumen-cortes-z-${datePrefix}.pdf`,
        contentType: 'application/pdf',
        buffer,
        data: exportData,
      };
    }

    return {
      format: 'json',
      filename: `resumen-cortes-z-${datePrefix}.json`,
      contentType: 'application/json',
      data: exportData,
    };
  }

  /**
   * G1 (issue #522 Finding 1): the ONE Corte Z aggregation path.
   *
   * Reads the tenant's cash shifts (date range over `opened_at`, optional
   * shiftId) inside a tenant-bound transaction and maps them to the
   * existing Z row shape. Both `exportZReports` and `getZReport` call
   * this method — there is exactly one shift read + row mapping in the
   * codebase, so the export and the fiscal report can never disagree.
   */
  async getZReportRows(
    tenantId: string,
    bounds?: ZReportRowBounds,
  ): Promise<ZReportRowsResult> {
    const whereClause: FindOptionsWhere<CashShiftSession> = {
      tenant_id: tenantId,
    };

    if (bounds?.shiftId) {
      whereClause.id = bounds.shiftId;
    }

    if (bounds?.start && bounds?.end) {
      whereClause.opened_at = Between(bounds.start, bounds.end);
    } else if (bounds?.start) {
      whereClause.opened_at = MoreThanOrEqual(bounds.start);
    } else if (bounds?.end) {
      whereClause.opened_at = LessThanOrEqual(bounds.end);
    }

    // The only cash-shift access in this service: one read-only logical unit
    // inside its own tenant-bound transaction. The explicit tenant_id filter
    // stays in the where clause — binding is additive, never a replacement.
    // The invoice read in exportSalesBook is bound the same way (issue #581 WU1).
    const shifts = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(CashShiftSession).find({
          where: whereClause,
          order: { opened_at: 'ASC' },
        }),
    );

    const records: ZReportRowDto[] = shifts.map((s) => ({
      shiftId: s.id,
      closedAt: s.closed_at ? new Date(s.closed_at).toISOString() : 'ABIERTO',
      openedAt: new Date(s.opened_at).toISOString(),
      terminalId: s.terminal_id,
      zSequence: s.z_report_sequence ?? null,
      cashierName: s.cashier_name,
      initialFloatNio: round2(Number(s.initial_float_nio ?? 0)),
      initialFloatUsd: round2(Number(s.initial_float_usd ?? 0)),
      expectedCashNio: round2(Number(s.expected_cash_nio ?? 0)),
      expectedCashUsd: round2(Number(s.expected_cash_usd ?? 0)),
      finalCountedNio:
        s.final_counted_nio != null
          ? round2(Number(s.final_counted_nio))
          : null,
      finalCountedUsd:
        s.final_counted_usd != null
          ? round2(Number(s.final_counted_usd))
          : null,
      differenceNio:
        s.difference_nio != null ? round2(Number(s.difference_nio)) : null,
      differenceUsd:
        s.difference_usd != null ? round2(Number(s.difference_usd)) : null,
      status: s.status,
      notes: s.notes ?? null,
    }));

    return { records, shifts };
  }

  /**
   * G1 (issue #522 Finding 1): Corte X — partial reading of an OPEN shift.
   *
   * RULINGS (sales_cash_roadmap.md D3 :16, AC4 :102; POS precedent
   * x_report_dialog.dart / formatCorteXText "AUDITORIA INTERNA - NO
   * FISCAL"):
   *   - Aggregation is keyed on the SHIFT, never on a fiscal day (open
   *     question P8, docs/operations/preguntas-contadora-round-2.md).
   *   - X is a PARTIAL reading and NEVER closes the shift: the response
   *     carries `closesShift: false` at the top level and per shift. The
   *     close action (with its variance checks) lives in
   *     CashShiftService.closeShiftWithZReport and is out of G1 scope.
   *   - DEC-03's manager-PIN-on-variance (>C$100 / >$5 at Z) is a
   *     CLOSE-flow concern, NOT part of this reporting endpoint.
   *   - With no shiftId the tenant's OPEN shift(s) are returned,
   *     optionally narrowed by terminalId; a shiftId that is not the
   *     tenant's simply matches nothing (deny/empty — never leak).
   *
   * Every read runs inside ONE tenant-bound transaction; sales-by-method
   * totals exclude canceled invoices and net over-tender change like the
   * dashboard's AG-08 reporting net.
   */
  async getXReport(
    tenantId: string,
    query?: XReportQueryDto,
  ): Promise<XReportDto> {
    const whereClause: FindOptionsWhere<CashShiftSession> = {
      tenant_id: tenantId,
      status: CashShiftStatus.OPEN,
    };
    if (query?.shiftId) {
      whereClause.id = query.shiftId;
    }
    if (query?.terminalId) {
      whereClause.terminal_id = query.terminalId;
    }

    const { shifts, movements, invoices } = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const openShifts = await manager.getRepository(CashShiftSession).find({
          where: whereClause,
          order: { opened_at: 'ASC' },
        });
        if (openShifts.length === 0) {
          return { shifts: openShifts, movements: [], invoices: [] };
        }
        const shiftIds = openShifts.map((s) => s.id);
        const boundMovements = await manager.getRepository(CashMovement).find({
          where: { tenant_id: tenantId, shift_id: In(shiftIds) },
        });
        const boundInvoices = await manager.getRepository(Invoice).find({
          where: {
            tenant_id: tenantId,
            shiftId: In(shiftIds),
            isCanceled: false,
          },
          relations: ['payments'],
          order: { created_at: 'ASC' },
        });
        return {
          shifts: openShifts,
          movements: boundMovements,
          invoices: boundInvoices,
        };
      },
    );

    const movementsByShift = new Map<string, CashMovement[]>();
    for (const m of movements) {
      const list = movementsByShift.get(m.shift_id) ?? [];
      list.push(m);
      movementsByShift.set(m.shift_id, list);
    }
    const invoicesByShift = new Map<string, Invoice[]>();
    for (const inv of invoices) {
      if (!inv.shiftId) continue;
      const list = invoicesByShift.get(inv.shiftId) ?? [];
      list.push(inv);
      invoicesByShift.set(inv.shiftId, list);
    }

    const reportShifts: XReportShiftDto[] = shifts.map((s) => {
      const cashMovements: XReportShiftDto['cashMovements'] = {
        CASH_IN: { nio: 0, usd: 0, count: 0 },
        CASH_OUT: { nio: 0, usd: 0, count: 0 },
        PETTY_CASH: { nio: 0, usd: 0, count: 0 },
        SAFE_DROP: { nio: 0, usd: 0, count: 0 },
      };
      for (const m of movementsByShift.get(s.id) ?? []) {
        const bucket = cashMovements[m.type];
        if (!bucket) continue;
        bucket.nio = round2(bucket.nio + Number(m.amount_nio ?? 0));
        bucket.usd = round2(bucket.usd + Number(m.amount_usd ?? 0));
        bucket.count += 1;
      }

      const salesByMethod: XReportShiftDto['salesByMethod'] = {
        cashNio: 0,
        cardNio: 0,
        qrNio: 0,
        pointsNio: 0,
        otherNio: 0,
      };
      for (const inv of invoicesByShift.get(s.id) ?? []) {
        // In-memory guard alongside the isCanceled:false where clause:
        // canceled invoices (DGI voids) contribute to no method bucket.
        if (inv.isCanceled) continue;
        for (const p of inv.payments ?? []) {
          this.addPaymentToSalesByMethod(salesByMethod, p);
        }
      }

      return {
        shiftId: s.id,
        terminalId: s.terminal_id,
        cashier: s.cashier_name,
        openedAt: new Date(s.opened_at).toISOString(),
        status: s.status,
        closesShift: false,
        initialFloatNio: round2(Number(s.initial_float_nio ?? 0)),
        initialFloatUsd: round2(Number(s.initial_float_usd ?? 0)),
        cashMovements,
        salesByMethod,
        expectedCashNio: round2(Number(s.expected_cash_nio ?? 0)),
        expectedCashUsd: round2(Number(s.expected_cash_usd ?? 0)),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      closesShift: false,
      shifts: reportShifts,
    };
  }

  /**
   * G1 (issue #522 Finding 1): Corte Z — definitive close view for CLOSED
   * shifts.
   *
   * RULINGS (sales_cash_roadmap.md D3 :16, AC5 :103, D4/DEC-04 :17/:28;
   * POS precedent z_report_dialog.dart / formatCorteZText "CIERRE FISCAL
   * (CORTE Z)", "SECUENCIA Z: #N"):
   *   - Rows come from the ONE shared aggregation path (getZReportRows,
   *     the same one export/z-reports uses); OPEN shifts in the range are
   *     filtered out — Z is the close view.
   *   - DEC-04: unreconciled card vouchers (invoice_payments
   *     reconciliation_status = 'PENDIENTE', card methods only, canceled
   *     invoices excluded) raise a per-shift BLOCKER SIGNAL
   *     (blockedByUnreconciledPayments + count). Reporting NEVER hard-
   *     fails here: the hard block belongs to the close action
   *     (CashShiftService.closeShiftWithZReport), out of G1 scope.
   *   - DEC-03's manager-PIN-on-variance is a CLOSE-flow concern, not G1.
   */
  async getZReport(
    tenantId: string,
    query?: ZReportQueryDto,
  ): Promise<ZReportDto> {
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );
    const { records, shifts } = await this.getZReportRows(tenantId, {
      start,
      end,
      shiftId: query?.shiftId,
    });

    const shiftById = new Map(shifts.map((s) => [s.id, s]));
    const closedShifts = shifts.filter(
      (s) => s.status === CashShiftStatus.CLOSED,
    );
    const closedShiftIds = closedShifts.map((s) => s.id);

    const invoicesByShift = new Map<string, Invoice[]>();
    if (closedShiftIds.length > 0) {
      // One bound read for every closed shift's invoices (items for the
      // taxable/exempt split, payments for the DEC-04 blocker signal).
      const closedInvoices = await runInTenantTransaction(
        this.dataSource,
        tenantId,
        (manager) =>
          manager.getRepository(Invoice).find({
            where: {
              tenant_id: tenantId,
              shiftId: In(closedShiftIds),
            },
            relations: ['items', 'payments'],
            order: { created_at: 'ASC' },
          }),
      );
      for (const inv of closedInvoices) {
        if (!inv.shiftId) continue;
        const list = invoicesByShift.get(inv.shiftId) ?? [];
        list.push(inv);
        invoicesByShift.set(inv.shiftId, list);
      }
    }

    const zRecords: ZReportRecordDto[] = records.flatMap((row) => {
      const shift = shiftById.get(row.shiftId);
      if (!shift || shift.status !== CashShiftStatus.CLOSED) return [];

      let totalGrossNio = 0;
      let totalTaxableNio = 0;
      let totalExemptNio = 0;
      let totalTaxNio = 0;
      let unreconciledPaymentCount = 0;

      for (const inv of invoicesByShift.get(row.shiftId) ?? []) {
        // DGI DT 09-2007: canceled invoices are fiscal voids, not sales —
        // they must contribute to no fiscal total and their stale
        // PENDING vouchers raise no blocker.
        if (inv.isCanceled) continue;

        totalGrossNio = round2(totalGrossNio + Number(inv.total ?? 0));
        totalTaxNio = round2(totalTaxNio + Number(inv.totalTax ?? 0));

        if (inv.items && inv.items.length > 0) {
          for (const item of inv.items) {
            const itemTaxRate = Number(
              item.appliedTaxRate ?? item.originalTaxRate ?? 0,
            );
            const itemTaxAmount = Number(item.taxAmount ?? 0);
            const itemDiscount = Number(item.discount ?? 0);
            const itemBase = round2(
              Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0) -
                itemDiscount,
            );
            if (itemTaxRate > 0 || itemTaxAmount > 0) {
              totalTaxableNio = round2(totalTaxableNio + itemBase);
            } else {
              totalExemptNio = round2(totalExemptNio + itemBase);
            }
          }
        } else {
          const invTax = Number(inv.totalTax ?? 0);
          const invSubtotal = Number(inv.subtotal ?? 0);
          if (invTax > 0) {
            totalTaxableNio = round2(totalTaxableNio + invSubtotal);
          } else {
            totalExemptNio = round2(totalExemptNio + invSubtotal);
          }
        }

        for (const p of inv.payments ?? []) {
          if (
            isCardPaymentMethod(p.method) &&
            p.reconciliationStatus === 'PENDIENTE'
          ) {
            unreconciledPaymentCount += 1;
          }
        }
      }

      return [
        {
          ...row,
          supervisorId: shift.supervisor_id ?? null,
          fiscalTotals: {
            totalGrossNio,
            totalTaxableNio,
            totalExemptNio,
            totalTaxNio,
          },
          blockedByUnreconciledPayments: unreconciledPaymentCount > 0,
          unreconciledPaymentCount,
        },
      ];
    });

    return {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      totalRecords: zRecords.length,
      records: zRecords,
    };
  }

  /**
   * AG-08 reporting net: tendered amounts include over-tender change which
   * must not count as collected money. The net matches the dashboard's
   * AG-08 net BY CONSTRUCTION (sales-reports.service.ts:145-159): change
   * given in USD is converted with the payment's exchangeRate BEFORE
   * subtracting — never a naive `amountNio - changeGiven`.
   * Canceled invoices never reach this helper (their reads filter
   * isCanceled), so their payments leak into no method bucket.
   */
  private addPaymentToSalesByMethod(
    bucket: {
      cashNio: number;
      cardNio: number;
      qrNio: number;
      pointsNio: number;
      otherNio: number;
    },
    payment: {
      method?: string;
      amountNio?: number;
      changeGiven?: number;
      changeCurrency?: string;
      exchangeRate?: number;
    },
  ): void {
    const method = (payment.method ?? '').trim().toUpperCase();
    const amountNio = Number(payment.amountNio ?? 0);
    // AG-08 net (sales-reports.service.ts:145-159): `changeGiven` defaults
    // to 0; change in USD converts at the payment's exchangeRate.
    const changeRaw = Number(payment.changeGiven ?? 0);
    const changeCurrency = (payment.changeCurrency ?? 'NIO')
      .trim()
      .toUpperCase();
    const changeNio =
      changeRaw > 0
        ? changeCurrency === 'USD'
          ? round2(changeRaw * Number(payment.exchangeRate ?? 1.0))
          : changeRaw
        : 0;
    const effectiveNio = round2(amountNio - changeNio);
    if (method === 'CASH' || method === 'EFECTIVO') {
      bucket.cashNio = round2(bucket.cashNio + effectiveNio);
    } else if (isCardPaymentMethod(method)) {
      bucket.cardNio = round2(bucket.cardNio + effectiveNio);
    } else if (method === 'QR') {
      bucket.qrNio = round2(bucket.qrNio + effectiveNio);
    } else if (method === 'POINTS' || method === 'PUNTOS') {
      bucket.pointsNio = round2(bucket.pointsNio + effectiveNio);
    } else {
      bucket.otherNio = round2(bucket.otherNio + effectiveNio);
    }
  }

  private generateSalesBookCsv(
    records: SalesBookRowDto[],
    ivaLabel: string,
    gravadoLabel: string,
  ): string {
    const headers = [
      'Fecha',
      'Numero Factura',
      'Tipo Documento',
      'Cliente',
      'Subtotal Exento (NIO)',
      `Subtotal ${gravadoLabel} (NIO)`,
      `${ivaLabel} (NIO)`,
      'Descuento (NIO)',
      'Descuento Manual (NIO)',
      'Descuento Promoción (NIO)',
      'Descuento Lealtad (NIO)',
      'Descuento Sin Origen (NIO)',
      'Total (NIO)',
      'Total (USD)',
      'Estado',
    ];

    const lines = [headers.map(escapeCsv).join(',')];

    for (const r of records) {
      lines.push(
        [
          escapeCsv(r.date),
          escapeCsv(r.invoiceNumber),
          escapeCsv(r.documentType),
          escapeCsv(r.customerName),
          r.exemptSubtotalNio.toFixed(2),
          r.taxableSubtotalNio.toFixed(2),
          r.taxAmountNio.toFixed(2),
          r.discountNio.toFixed(2),
          r.manualDiscountNio.toFixed(2),
          r.promotionDiscountNio.toFixed(2),
          r.loyaltyDiscountNio.toFixed(2),
          r.discountOriginUnattributedNio.toFixed(2),
          r.totalNio.toFixed(2),
          r.totalUsd.toFixed(2),
          escapeCsv(r.status),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  private generateZReportsCsv(records: ZReportRowDto[]): string {
    const headers = [
      'ID Turno',
      'Fecha Apertura',
      'Fecha Cierre',
      'Terminal',
      'Secuencia Z',
      'Cajero',
      'Fondo Inicial (NIO)',
      'Fondo Inicial (USD)',
      'Esperado (NIO)',
      'Esperado (USD)',
      'Contado (NIO)',
      'Contado (USD)',
      'Diferencia (NIO)',
      'Diferencia (USD)',
      'Estado',
    ];

    const lines = [headers.map(escapeCsv).join(',')];

    for (const r of records) {
      lines.push(
        [
          escapeCsv(r.shiftId),
          escapeCsv(r.openedAt),
          escapeCsv(r.closedAt),
          escapeCsv(r.terminalId),
          r.zSequence != null ? String(r.zSequence) : '""',
          escapeCsv(r.cashierName),
          r.initialFloatNio.toFixed(2),
          r.initialFloatUsd.toFixed(2),
          r.expectedCashNio.toFixed(2),
          r.expectedCashUsd.toFixed(2),
          r.finalCountedNio != null ? r.finalCountedNio.toFixed(2) : '""',
          r.finalCountedUsd != null ? r.finalCountedUsd.toFixed(2) : '""',
          r.differenceNio != null ? r.differenceNio.toFixed(2) : '""',
          r.differenceUsd != null ? r.differenceUsd.toFixed(2) : '""',
          escapeCsv(r.status),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  private async generateSalesBookXlsx(
    data: SalesBookExportDto,
    ivaLabel: string,
    gravadoLabel: string,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OmniFood NI';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Libro de Ventas DGI');

    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Número Factura', key: 'invoiceNumber', width: 24 },
      { header: 'Tipo Documento', key: 'documentType', width: 16 },
      { header: 'Cliente / RUC', key: 'customerName', width: 22 },
      { header: 'Exento (NIO)', key: 'exemptSubtotalNio', width: 16 },
      { header: `${gravadoLabel} (NIO)`, key: 'taxableSubtotalNio', width: 18 },
      { header: `${ivaLabel} (NIO)`, key: 'taxAmountNio', width: 16 },
      { header: 'Descuento (NIO)', key: 'discountNio', width: 16 },
      { header: 'Descuento Manual (NIO)', key: 'manualDiscountNio', width: 18 },
      {
        header: 'Descuento Promoción (NIO)',
        key: 'promotionDiscountNio',
        width: 20,
      },
      {
        header: 'Descuento Lealtad (NIO)',
        key: 'loyaltyDiscountNio',
        width: 18,
      },
      {
        header: 'Descuento Sin Origen (NIO)',
        key: 'discountOriginUnattributedNio',
        width: 20,
      },
      { header: 'Total (NIO)', key: 'totalNio', width: 16 },
      { header: 'Total (USD)', key: 'totalUsd', width: 16 },
      { header: 'Estado', key: 'status', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const r of data.records) {
      sheet.addRow({
        date: r.date,
        invoiceNumber: r.invoiceNumber,
        documentType: r.documentType,
        customerName: r.customerName,
        exemptSubtotalNio: r.exemptSubtotalNio,
        taxableSubtotalNio: r.taxableSubtotalNio,
        taxAmountNio: r.taxAmountNio,
        discountNio: r.discountNio,
        manualDiscountNio: r.manualDiscountNio,
        promotionDiscountNio: r.promotionDiscountNio,
        loyaltyDiscountNio: r.loyaltyDiscountNio,
        discountOriginUnattributedNio: r.discountOriginUnattributedNio,
        totalNio: r.totalNio,
        totalUsd: r.totalUsd,
        status: r.status,
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  private async generateZReportsXlsx(data: ZReportsExportDto): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OmniFood NI';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Resumen Cortes Z');

    sheet.columns = [
      { header: 'ID Turno', key: 'shiftId', width: 38 },
      { header: 'Apertura', key: 'openedAt', width: 22 },
      { header: 'Cierre', key: 'closedAt', width: 22 },
      { header: 'Terminal', key: 'terminalId', width: 16 },
      { header: 'Secuencia Z', key: 'zSequence', width: 14 },
      { header: 'Cajero', key: 'cashierName', width: 22 },
      { header: 'Fondo Inicial (NIO)', key: 'initialFloatNio', width: 18 },
      { header: 'Fondo Inicial (USD)', key: 'initialFloatUsd', width: 18 },
      { header: 'Esperado (NIO)', key: 'expectedCashNio', width: 18 },
      { header: 'Esperado (USD)', key: 'expectedCashUsd', width: 18 },
      { header: 'Contado (NIO)', key: 'finalCountedNio', width: 18 },
      { header: 'Contado (USD)', key: 'finalCountedUsd', width: 18 },
      { header: 'Diferencia (NIO)', key: 'differenceNio', width: 18 },
      { header: 'Diferencia (USD)', key: 'differenceUsd', width: 18 },
      { header: 'Estado', key: 'status', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const r of data.records) {
      sheet.addRow({
        shiftId: r.shiftId,
        openedAt: r.openedAt,
        closedAt: r.closedAt,
        terminalId: r.terminalId,
        zSequence: r.zSequence ?? 'N/A',
        cashierName: r.cashierName,
        initialFloatNio: r.initialFloatNio,
        initialFloatUsd: r.initialFloatUsd,
        expectedCashNio: r.expectedCashNio,
        expectedCashUsd: r.expectedCashUsd,
        finalCountedNio: r.finalCountedNio ?? 0,
        finalCountedUsd: r.finalCountedUsd ?? 0,
        differenceNio: r.differenceNio ?? 0,
        differenceUsd: r.differenceUsd ?? 0,
        status: r.status,
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  private async generateSalesBookPdf(
    data: SalesBookExportDto,
    ivaLabel: string,
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margin: 30,
    });

    doc
      .fontSize(16)
      .fillColor('#1E3A8A')
      .text('OMNIFOOD NI — LIBRO DE VENTAS DGI (DT 09-2007)', {
        align: 'center',
      });
    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#333333')
      .text(
        `Período: ${data.startDate || 'Inicio'} a ${
          data.endDate || 'Actualidad'
        } | Generado: ${new Date(data.generatedAt).toLocaleString()}`,
        { align: 'center' },
      );
    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#000000')
      .text(
        `Total Registros: ${data.totalRecords} | Ventas Brutas: C$ ${data.totalGrossNio.toFixed(
          2,
        )} | ${ivaLabel}: C$ ${data.totalTaxNio.toFixed(
          2,
        )} | Exento: C$ ${data.totalExemptNio.toFixed(2)}`,
        { align: 'center' },
      );
    doc.moveDown(1);

    // Table Header
    doc
      .fontSize(9)
      .fillColor('#1E3A8A')
      .text(
        'Fecha        Número Factura          Tipo            Cliente               Gravado (NIO)    IVA (NIO)     Total (NIO)     Estado',
      );
    doc.moveTo(30, doc.y).lineTo(760, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(8).fillColor('#222222');
    for (const r of data.records.slice(0, 45)) {
      const line = `${r.date.padEnd(12)} ${r.invoiceNumber.padEnd(22)} ${r.documentType.padEnd(14)} ${r.customerName.slice(0, 18).padEnd(20)} ${r.taxableSubtotalNio.toFixed(2).padStart(12)} ${r.taxAmountNio.toFixed(2).padStart(12)} ${r.totalNio.toFixed(2).padStart(14)} ${r.status.padStart(10)}`;
      doc.text(line);
    }

    if (data.records.length > 45) {
      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(`... y ${data.records.length - 45} registros adicionales.`);
    }

    doc.end();
    return buildPdfBuffer(doc);
  }

  private async generateZReportsPdf(data: ZReportsExportDto): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margin: 30,
    });

    doc
      .fontSize(16)
      .fillColor('#1E3A8A')
      .text('OMNIFOOD NI — RESUMEN DE CORTES DE CAJA (CORTE Z)', {
        align: 'center',
      });
    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#333333')
      .text(
        `Período: ${data.startDate || 'Inicio'} a ${
          data.endDate || 'Actualidad'
        } | Total Cortes: ${data.totalRecords} | Generado: ${new Date(
          data.generatedAt,
        ).toLocaleString()}`,
        { align: 'center' },
      );
    doc.moveDown(1);

    doc
      .fontSize(9)
      .fillColor('#1E3A8A')
      .text(
        'Terminal     Secuencia Z    Cajero              Apertura             Cierre               Esperado (NIO)  Contado (NIO)   Diferencia (NIO)  Estado',
      );
    doc.moveTo(30, doc.y).lineTo(760, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(8).fillColor('#222222');
    for (const r of data.records.slice(0, 45)) {
      const zSeqStr = r.zSequence != null ? String(r.zSequence) : 'N/A';
      const line = `${r.terminalId.padEnd(12)} ${zSeqStr.padEnd(14)} ${r.cashierName.slice(0, 16).padEnd(18)} ${r.openedAt.slice(0, 16).padEnd(20)} ${r.closedAt.slice(0, 16).padEnd(20)} ${r.expectedCashNio.toFixed(2).padStart(12)} ${(r.finalCountedNio ?? 0).toFixed(2).padStart(14)} ${(r.differenceNio ?? 0).toFixed(2).padStart(16)} ${r.status.padStart(10)}`;
      doc.text(line);
    }

    if (data.records.length > 45) {
      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(`... y ${data.records.length - 45} cortes adicionales.`);
    }

    doc.end();
    return buildPdfBuffer(doc);
  }

  private parseDateBounds(
    startDateStr?: string,
    endDateStr?: string,
  ): { start?: Date; end?: Date } {
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
        start = new Date(`${startDateStr}T00:00:00.000-06:00`);
      } else {
        start = new Date(startDateStr);
      }
    }

    if (endDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
        end = new Date(`${endDateStr}T23:59:59.999-06:00`);
      } else {
        end = new Date(endDateStr);
      }
    }

    return { start, end };
  }
}
