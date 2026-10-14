import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { toCalendarDay } from '../../../core/database/calendar-day';
import {
  CompanyIdentity,
  CompanyIdentityService,
} from '../../tenant/services/company-identity.service';
import { CountSession } from '../entities/count-session.entity';
import { CountSessionEntry } from '../entities/count-session-entry.entity';
import {
  CountSessionPrintDocument,
  CountSessionPrintEntry,
  RenderCountSessionPdfOptions,
  renderCountSessionPdf,
} from './count-session-pdf.renderer';

export interface CountSessionPrintableList {
  readonly buffer: Buffer;
  readonly contentType: string;
  readonly filename: string;
}

const toCalendarDayOrNull = (value: Date | null): string | null =>
  value ? toCalendarDay(value.toISOString()) : null;

/** Content-Disposition-safe file name: the session id may carry any text. */
const buildFilename = (sessionId: string): string => {
  const sanitized = sessionId
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `conteo-fisico-${sanitized || 'sesion'}.pdf`;
};

/**
 * R19 T3 (S10) — builds the printable, signable count list as a server-side
 * PDF, following the sales export precedent for the pdfkit plumbing while
 * adding what R-05 demands and the precedent lacks: a formal header, per-page
 * signature space and repeated document identity, and S15 absence discipline.
 *
 * S4: the company identity is RESOLVED here through CompanyIdentityService
 * (the tenant-side owner of that data) — this service never queries the
 * tenant row itself and never decides whether an identity field exists.
 */
@Injectable()
export class CountSessionPrintableService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly companyIdentityService: CompanyIdentityService,
  ) {}

  async buildPrintableCountList(
    tenantId: string,
    sessionId: string,
    rendererOptions: RenderCountSessionPdfOptions = {},
  ): Promise<CountSessionPrintableList> {
    const id = sessionId?.trim();
    if (!id) {
      throw new NotFoundException(
        `Count session '${sessionId ?? ''}' not found`,
      );
    }

    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        // RLS-bound read: the session and its entries resolve inside the
        // tenant's row-security context, so another tenant's session is
        // indistinguishable from a missing one.
        const session = await manager.getRepository(CountSession).findOne({
          where: { tenant_id: tenantId.trim(), id },
        });
        if (!session) {
          throw new NotFoundException(`Count session '${id}' not found`);
        }

        const entries = await manager.getRepository(CountSessionEntry).find({
          where: { tenant_id: tenantId.trim(), session_id: id },
          order: { line_index: 'ASC', entry_index: 'ASC' },
        });

        // S4: one resolved identity, absence declared inside it (S15).
        const identity: CompanyIdentity =
          await this.companyIdentityService.resolveWithinManager(
            manager,
            tenantId,
          );

        const buffer = await renderCountSessionPdf(
          this.toPrintDocument(session, entries),
          identity,
          rendererOptions,
        );

        return {
          buffer,
          contentType: 'application/pdf',
          filename: buildFilename(id),
        };
      },
    );
  }

  /**
   * Maps the persisted rows onto the print shape. The frozen fields (S12)
   * are printed from the ROWS — never re-read from the catalog — so the
   * sheet reprints identical years later.
   */
  private toPrintDocument(
    session: CountSession,
    entries: CountSessionEntry[],
  ): CountSessionPrintDocument {
    const printEntries: CountSessionPrintEntry[] = entries.map(
      (entry, index) => ({
        position: index + 1,
        insumoName: entry.insumo_name,
        uom: entry.uom,
        theoreticalQuantity: Number(entry.theoretical_quantity),
        countedQuantity: Number(entry.counted_quantity),
        countedAtIso: entry.counted_at ? entry.counted_at.toISOString() : null,
        actorLabel: entry.actor_label,
        notes: entry.notes,
        isDisputed: entry.is_disputed,
        isApproved: entry.is_approved,
      }),
    );

    return {
      sessionId: session.id,
      warehouseName: session.warehouse_name,
      status: session.status,
      cutoffDay: toCalendarDay(session.cutoff_at.toISOString()),
      postedDay: toCalendarDayOrNull(session.posted_at),
      notes: session.notes,
      totalEntries: printEntries.length,
      entries: printEntries,
      generatedAtIso: new Date().toISOString(),
    };
  }
}
