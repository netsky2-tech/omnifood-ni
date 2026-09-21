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
        return this.toPrimingResponse(envelope);
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
  ): TerminalPrimingResponseDto {
    return {
      status: envelope.status,
      serverTime: envelope.serverTime,
      currentVersion: envelope.currentVersion,
      deltas: {
        products: envelope.deltas.products,
        catalogValues: envelope.deltas.catalogValues,
        fiscalConfig: envelope.deltas.fiscalConfig ?? null,
      },
      fiscalConfig: envelope.fiscalConfig ?? null,
    };
  }
}
