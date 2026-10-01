import {
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InboundSyncService } from '../../sales/services/inbound-sync.service';
import type { InboundSyncResponseDto } from '../../sales/dto/inbound-sync.dto';
import type { FiscalConfigSnapshot } from '../dto/fiscal-config-version.dto';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { FiscalSequenceRecoveryRequiredException } from '../exceptions/fiscal-sequence-recovery-required.exception';

/**
 * Delta types requested from the inbound-sync service for priming.
 *
 * Priming must never pull the user list: the inbound envelope's user deltas
 * carry security profiles that include PIN material (`pinHash`), which has no
 * place on a human-authenticated catalog pull. Restricting the requested
 * types is the first layer; the response mapping below is the second.
 */
export const TERMINAL_PRIMING_REQUESTED_TYPES = 'products,catalogvalues,fiscal';

export interface TerminalPrimingProductDto {
  id: string;
  name: string;
  uom: string;
  stock: number;
  averageCost: number;
  sellPrice: number;
  isActive: boolean;
  isPerishable: boolean;
  warehouseId?: string | null;
  productType?: string;
  mappingVersionId?: string | null;
  insumoId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenantId?: string;
}

export interface TerminalPrimingCatalogValueDto {
  id: string;
  catalogType: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TerminalPrimingDeltasDto {
  products: TerminalPrimingProductDto[];
  catalogValues: TerminalPrimingCatalogValueDto[];
  fiscalConfig?: FiscalConfigSnapshot | null;
}

export interface TerminalPrimingResponseDto {
  status: 'success';
  serverTime: string;
  currentVersion: number;
  highestSequenceNumber?: number;
  deltas: TerminalPrimingDeltasDto;
  fiscalConfig?: FiscalConfigSnapshot | null;
}

/**
 * L1-10a: primes a fresh terminal before activation.
 *
 * A pilot POS starts empty, but catalog and fiscal config normally reach a
 * terminal only over device-credential-gated `/v1/sync/inbound/*` routes, and
 * the device credential requires a finalized activation attempt — a closed
 * bootstrap cycle (issue #469). This service breaks the cycle by reusing the
 * exported `InboundSyncService` behind a human-authenticated, permission-
 * gated read. It creates no device credential, touches no guard, scope or
 * credential service, and requires no existing activation attempt.
 *
 * `InboundSyncService` reads RLS-forced tables through global repositories,
 * so the read runs inside a transaction whose manager is bound to the
 * authenticated tenant (`runInTenantTransaction`); the transaction-local
 * `app.tenant_id` setting is what authorizes the row-level policies.
 */
@Injectable()
export class TerminalPrimingService {
  constructor(
    @Inject(forwardRef(() => InboundSyncService))
    private readonly inboundSyncService: InboundSyncService,
    private readonly dataSource: DataSource,
  ) {}

  async getPrimingPayload(
    tenantId: string,
    proposedSequence?: number,
  ): Promise<TerminalPrimingResponseDto> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new UnauthorizedException('Tenant context not found in request');
    }

    return runInTenantTransaction(
      this.dataSource,
      trimmedTenantId,
      async (manager) => {
        // The bound manager makes every RLS-forced read below run on the
        // transaction's own connection, where the transaction-local
        // `app.tenant_id` binding authorizes the row-level policies. No
        // device principal is passed: the human-authenticated priming path
        // never negotiates OHAC delivery.
        const envelope = await this.inboundSyncService.getInboundDeltas(
          trimmedTenantId,
          { types: TERMINAL_PRIMING_REQUESTED_TYPES },
          undefined,
          manager,
        );

        // D-6: query the highest invoice sequence already issued in cloud for
        // this tenant. A reinstalled terminal or replacement device must seed
        // its sequence after this value so the verification sale and subsequent
        // sales never collide with already-issued folios.
        //
        // The sequence is the TRAILING digit run of the folio, matching the
        // POS's own extraction (DgiNumberingServiceImpl._extractSequenceNumber
        // takes `RegExp(r'(\d+)$')`): production folios carry the DGI prefix
        // (`001-001-01-00000005`), so stripping non-digits would concatenate
        // the prefix digits with the consecutivo and compute a wrong MAX that
        // refuses the legitimate next folio. `substring ... '([0-9]+)$'`
        // returns NULL when there is no trailing digit run, so folios like
        // `INV-828db0f9-…` (which would also overflow bigint) are ignored by
        // MAX instead of poisoning it.
        let highestSequenceNumber = 0;
        try {
          const rows: Array<{ maxSeq?: string | number | null }> =
            await manager.query(
              `SELECT MAX(CAST(NULLIF(substring(invoice_number from '([0-9]+)$'), '') AS bigint)) AS "maxSeq"
             FROM invoices
             WHERE tenant_id = $1`,
              [trimmedTenantId],
            );
          highestSequenceNumber = rows?.[0]?.maxSeq
            ? Number(rows[0].maxSeq)
            : 0;
        } catch {
          // The two failure modes are split by whether the device proposed a
          // sequence:
          //
          // - PROPOSED → fail CLOSED. A replay tripwire must never silently
          //   pass on an unreadable MAX: an unverifiable proposal is the
          //   named recovery state, not a green light. The 409 carries the
          //   same FISCAL_SEQUENCE_RECOVERY_REQUIRED shape the POS consumes,
          //   but names the MAX-read failure in the message and leaves
          //   highestSequenceNumber null instead of inventing a number the
          //   read could not compute (rows like `INV-828db0f9-…` already
          //   exist that could not be sequenced safely).
          // - ABSENT → keep the historical fail-safe to 0 exactly: legacy
          //   byte-identical behavior for existing callers, including the
          //   isolated scratch test schemas that hold no invoices table.
          if (proposedSequence !== undefined) {
            throw new FiscalSequenceRecoveryRequiredException({
              proposedSequence,
              highestSequenceNumber: null,
            });
          }
          // Legacy absent-param path: fail safe to sequence 0 (also covers
          // isolated scratch test schemas without an invoices table).
          highestSequenceNumber = 0;
        }

        // G2a fiscal sequence tripwire (issue #526 unit B5). Rulings:
        // 1. The cursor is an OPTIONAL inbound proposal; absent means
        //    byte-identical legacy behavior. Present means the device
        //    proposes to start selling at `proposedSequence`.
        // 2. If the cloud already holds sequence N > 0 for this tenant and
        //    the proposal is <= N, refuse with 409
        //    FISCAL_SEQUENCE_RECOVERY_REQUIRED naming the conflicting
        //    number, so the POS can render the recovery message.
        // 3. No silent correction, ever: this branch performs no write on
        //    either path — the endpoint stays read-only, and the service
        //    never clamps, bumps or persists anything. A proposal above N,
        //    or N == 0 (no cloud invoices), passes through and still
        //    receives `highestSequenceNumber` to seed above.
        // 6. The MAX read stays inside the tenant transaction with the
        //    explicit tenant_id predicate; the tripwire only compares the
        //    value it produced.
        if (
          proposedSequence !== undefined &&
          highestSequenceNumber > 0 &&
          proposedSequence <= highestSequenceNumber
        ) {
          throw new FiscalSequenceRecoveryRequiredException({
            highestSequenceNumber,
            proposedSequence,
          });
        }

        return this.toPrimingResponse(envelope, highestSequenceNumber);
      },
    );
  }

  /**
   * Explicit allowlist mapping. The inbound envelope also carries user
   * deltas (with `pinHash`-bearing security profiles), OHAC authorization
   * epochs, and recipe/insumo projections; none of those belong on the
   * priming surface, so they are dropped here regardless of what the
   * requested-types negotiation returns.
   */
  private toPrimingResponse(
    envelope: InboundSyncResponseDto,
    highestSequenceNumber = 0,
  ): TerminalPrimingResponseDto {
    return {
      status: envelope.status,
      serverTime: envelope.serverTime,
      currentVersion: envelope.currentVersion,
      highestSequenceNumber,
      deltas: {
        products: envelope.deltas.products,
        catalogValues: envelope.deltas.catalogValues,
        fiscalConfig: envelope.deltas.fiscalConfig ?? null,
      },
      fiscalConfig: envelope.fiscalConfig ?? null,
    };
  }
}
