import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import { resolveReportingBounds } from '../../core/reporting/reporting-period';
import { AuditLog } from '../identity/entities/audit-log.entity';
import { User } from '../identity/entities/user.entity';
import { classifyAuditSeverity } from './audit-risk-classifier';
import {
  isSelfAuthorizedAction,
  SUPERVISION_FLOW,
  SUPERVISION_FLOW_BY_ACTION,
  SUPERVISION_REVIEW_ACTIONS,
  type SupervisionFlow,
} from '../supervision/contracts/supervision-policy.contract';
import {
  SupervisionReviewClassCountDto,
  SupervisionReviewEntryDto,
  SupervisionReviewResponseDto,
} from './supervision-review.dto';

/**
 * The owner's REVIEW QUEUE for the tenant's supervision policy.
 *
 * The policy says who may sign a sensitive operation and which flows accept
 * the operator's own signature. THIS is where the owner reads what actually
 * happened: who operated, who signed, with which credential, and whether a
 * supervisor was involved.
 *
 * It is a READ over the same append-only `audit_logs` store the POS feeds
 * (POST /identity/audit). It never writes, never mutates and never
 * duplicates rows.
 *
 * THE DISCIPLINE (inherited from the ledger):
 * - it NEVER exposes the metadata blob. The flow and the self-authorization
 *   are DERIVED from the action code — the code is what the terminal wrote
 *   at the moment of the operation, and the metadata is a payload this
 *   surface does not expose;
 * - it NEVER exposes the hash-chain columns;
 * - every read rides the tenant-bound transaction path (issue #512) with an
 *   explicit `tenant_id` predicate;
 * - the page cap is bounded and the response is honest about truncation.
 */
@Injectable()
export class SupervisionReviewService {
  /** Page size contract for GET /operations/audit/supervision-review. */
  static readonly DEFAULT_REVIEW_LIMIT = 50;
  static readonly MAX_REVIEW_LIMIT = 100;

  constructor(
    @InjectRepository(AuditLog)
    // RLS debt table (#512): read only through the tenant-bound transaction
    // manager below; this pooled repository stays declared for Nest DI
    // compatibility only.
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  async getReview(
    tenantId: string,
    filter: { startDate?: string; endDate?: string; limitInput?: number },
    generatedAt: Date = new Date(),
  ): Promise<SupervisionReviewResponseDto> {
    const bounds = resolveReportingBounds(filter.startDate, filter.endDate);
    const startInclusiveUtc = bounds.startInclusiveUtc ?? null;
    const endExclusiveUtc = bounds.endExclusiveUtc ?? null;

    const limit =
      filter.limitInput === undefined || filter.limitInput === null
        ? SupervisionReviewService.DEFAULT_REVIEW_LIMIT
        : Math.min(
            Math.trunc(filter.limitInput),
            SupervisionReviewService.MAX_REVIEW_LIMIT,
          );

    // TWO reads, on purpose: the COUNTS cover the whole period (the owner
    // reads "3 cierres, 1 descuento") while the ROWS are page-capped. One
    // unbounded read would drag the whole period into memory; a capped read
    // alone could not report an honest total.
    const { rows, counts } = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (bound) => {
        const applyScope = (qb: SelectQueryBuilder<AuditLog>) => {
          qb.where('audit.tenant_id = :tenantId', { tenantId });
          qb.andWhere('audit.action IN (:...actions)', {
            actions: SUPERVISION_REVIEW_ACTIONS,
          });
          if (startInclusiveUtc) {
            qb.andWhere('audit.timestamp >= :startInclusiveUtc', {
              startInclusiveUtc,
            });
          }
          if (endExclusiveUtc) {
            qb.andWhere('audit.timestamp < :endExclusiveUtc', {
              endExclusiveUtc,
            });
          }
          return qb;
        };

        const countQb = applyScope(
          bound.getRepository(AuditLog).createQueryBuilder('audit'),
        );
        countQb
          .select('audit.action', 'action')
          .addSelect('COUNT(*)', 'count')
          .groupBy('audit.action');
        const counts = await countQb.getRawMany();

        const pageQb = applyScope(
          bound.getRepository(AuditLog).createQueryBuilder('audit'),
        );
        // The actor: who was at the till.
        pageQb
          .leftJoinAndSelect('audit.user', 'actor')
          .orderBy('audit.timestamp', 'DESC')
          .addOrderBy('audit.id', 'DESC')
          // One probe row beyond the cap so `truncated` is provable.
          .take(limit + 1);
        const rows = await pageQb.getMany();

        return { rows, counts };
      },
    );

    const total = counts.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
    const truncated = total > limit;
    const page = truncated ? rows.slice(0, limit) : rows;

    // The authorizer identities (who SIGNED it) are resolved in their own
    // read: `audit_logs` carries the id in `usuario_autorizador_id` and the
    // entity declares a single `user` relation (the actor), so aliasing the
    // same relation twice is not an option — and the emails are reference
    // data, never rendered raw.
    const authorizerIds = Array.from(
      new Set(
        page
          .map((row) => row.usuario_autorizador_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const authorizerEmails = new Map<string, string>();
    if (authorizerIds.length > 0) {
      const authors = await runInTenantTransaction(
        this.dataSource,
        tenantId,
        async (bound) =>
          bound.getRepository(User).find({
            where: { id: In(authorizerIds) },
            select: ['id', 'email'],
          }),
      );
      for (const author of authors) {
        if (author.email) {
          authorizerEmails.set(author.id, author.email);
        }
      }
    }

    const entries: SupervisionReviewEntryDto[] = page.map((row) => {
      const flow: SupervisionFlow =
        SUPERVISION_FLOW_BY_ACTION[row.action] ?? SUPERVISION_FLOW.CLOSE_BOX;
      const authorizerId = row.usuario_autorizador_id ?? null;
      return {
        occurredAt: row.timestamp.toISOString(),
        actorEmail: row.user?.email ?? null,
        authorizerEmail: authorizerId
          ? authorizerEmails.get(authorizerId) ?? null
          : null,
        hadSupervisor: !isSelfAuthorizedAction(row.action),
        method: row.metodo_autorizacion ?? null,
        flow,
        action: row.action,
        severity: classifyAuditSeverity(row.action),
        deviceId: row.device_id,
      };
    });

    // The counts the owner reads first: per flow, split by who signed.
    const byClass = new Map<SupervisionFlow, SupervisionReviewClassCountDto>();
    let selfAuthorizedTotal = 0;
    for (const row of counts) {
      const action = String(row.action ?? '');
      const flow = SUPERVISION_FLOW_BY_ACTION[action];
      if (!flow) continue;
      const amount = Number(row.count ?? 0);
      const count = byClass.get(flow) ?? {
        flow,
        supervised: 0,
        selfAuthorized: 0,
      };
      if (isSelfAuthorizedAction(action)) {
        count.selfAuthorized += amount;
        selfAuthorizedTotal += amount;
      } else {
        count.supervised += amount;
      }
      byClass.set(flow, count);
    }

    return {
      startDate: bounds.localStartDate ?? filter.startDate ?? null,
      endDate: bounds.localEndDate ?? filter.endDate ?? null,
      total,
      selfAuthorizedTotal,
      byClass: Array.from(byClass.values()),
      entries,
      limit,
      truncated,
      generatedAt: generatedAt.toISOString(),
    };
  }
}
