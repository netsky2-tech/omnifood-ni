import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, Not } from 'typeorm';
import {
  bindTenantContext,
  resolveTenantContextId,
  runInTenantTransaction,
} from '../../../core/database/tenant-transaction';
import { createHash } from 'crypto';
import {
  KardexRecalculateQueue,
  KardexQueueStatus,
} from '../entities/kardex-recalculate-queue.entity';
import { KardexCorrection } from '../entities/kardex-correction.entity';
import { InventoryMovement } from '../entities/inventory-movement.entity';
import { Insumo } from '../entities/insumo.entity';
import { GovernanceApprovalService } from './governance-approval.service';
import { KardexPendingQueueItemResponseDto } from '../dto/kardex-pending-queue-response.dto';

export interface ApproveRegularizationInput {
  queueId: string;
  approvedByUserId: string;
  role: string;
  authMethod: string;
}

@Injectable()
export class KardexRegularizationService {
  constructor(
    @InjectRepository(KardexRecalculateQueue)
    private readonly queueRepository: Repository<KardexRecalculateQueue>,
    @InjectRepository(KardexCorrection)
    private readonly correctionRepository: Repository<KardexCorrection>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepository: Repository<InventoryMovement>,
    private readonly governanceApprovalService: GovernanceApprovalService,
    private readonly dataSource: DataSource,
  ) {}

  async getPendingQueue(
    tenantId: string,
  ): Promise<KardexPendingQueueItemResponseDto[]> {
    // HR-01 (issue #486): the human pending route reads kardex_recalculate_queue,
    // which carries a FORCED tenant RLS policy. The read must run inside one
    // transaction whose app.tenant_id is bound before the first query, using a
    // repository scoped to that transaction's manager — never a global one.
    // A blank tenant id fails here, before a connection is borrowed or any
    // SQL is issued.
    const tenant = resolveTenantContextId(tenantId);
    return runInTenantTransaction(this.dataSource, tenant, async (manager) => {
      // Slice 6c (finding H7): COMPLETED rows are already-regularized cost
      // history — the approve handler rejects them, so exposing them in the
      // pending route would only invite a doomed re-approval. The dashboard
      // queue is the actionable set: PENDING / PROCESSING / BLOCKED / FAILED.
      const rows = await manager.getRepository(KardexRecalculateQueue).find({
        where: {
          tenant_id: tenant,
          status: Not(KardexQueueStatus.COMPLETED),
        },
        order: {
          createdAt: 'ASC',
        },
      });

      if (rows.length === 0) {
        return [];
      }

      // Enrichment stays inside the same tenant-bound transaction (HR-01):
      // every read goes through the manager-scoped repositories, never a
      // global one, so the RLS app.tenant_id applies to movements and
      // insumos too.
      const movementIds = [
        ...new Set(
          rows.flatMap((row) => [row.originMovementId, row.triggerMovementId]),
        ),
      ];
      const movements = await manager
        .getRepository(InventoryMovement)
        .find({ where: { id: In(movementIds), tenant_id: tenant } });
      const movementById = new Map(
        movements.map((m) => [m.id, m] as const),
      );

      const insumoIds = [...new Set(rows.map((row) => row.insumoId))];
      const insumos = await manager.getRepository(Insumo).find({
        where: { id: In(insumoIds), tenant_id: tenant },
      });
      const insumoNameById = new Map(insumos.map((i) => [i.id, i.name]));

      return rows.map((row) => {
        const origin = movementById.get(row.originMovementId);
        const trigger = movementById.get(row.triggerMovementId);

        // Same derivation the approval transaction applies, so the page
        // previews exactly what approving will record. A dangling movement
        // stays null (unknown on the wire, "—" in the UI) instead of 0.
        let previousUnitCostNio: number | null = null;
        let recalculatedUnitCostNio: number | null = null;
        let deltaUnitCostNio: number | null = null;
        let totalDeltaCostNio: number | null = null;
        let affectedQuantity: number | null = null;

        if (origin && trigger) {
          const prevCost = Number(origin.unitCostNio || 0);
          const newCost = Number(trigger.unitCostNio || prevCost);
          const deltaUnit = newCost - prevCost;
          const affectedQty = Math.abs(Number(origin.quantity || 0));
          previousUnitCostNio = prevCost;
          recalculatedUnitCostNio = newCost;
          deltaUnitCostNio = deltaUnit;
          affectedQuantity = affectedQty;
          totalDeltaCostNio = Math.abs(deltaUnit * affectedQty);
        }

        return {
          queueId: row.id,
          status: row.status,
          insumoId: row.insumoId,
          insumoName: insumoNameById.get(row.insumoId) ?? null,
          previousUnitCostNio,
          recalculatedUnitCostNio,
          deltaUnitCostNio,
          totalDeltaCostNio,
          affectedQuantity,
          triggerMovementType: trigger?.type ?? null,
          detectedAt: row.createdAt.toISOString(),
        };
      });
    });
  }

  async approveRegularization(
    tenantId: string,
    input: ApproveRegularizationInput,
  ): Promise<KardexCorrection> {
    return this.dataSource.transaction(async (manager) => {
      // HR-01 (issue #486): binding is the first SQL operation of this
      // transaction. The queue table's tenant predicate casts the setting to
      // uuid, so without this binding the first protected query either hides
      // the tenant's rows or fails the empty-string cast on a cleared pooled
      // connection.
      await bindTenantContext(manager, tenantId);

      const queueRepo = manager.getRepository(KardexRecalculateQueue);
      const correctionRepo = manager.getRepository(KardexCorrection);
      const movementRepo = manager.getRepository(InventoryMovement);

      const queueItem = await queueRepo.findOne({
        where: { id: input.queueId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!queueItem) {
        throw new NotFoundException(
          `Elemento de cola ${input.queueId} no encontrado.`,
        );
      }

      if (queueItem.status === KardexQueueStatus.COMPLETED) {
        throw new BadRequestException(
          `El elemento ${input.queueId} ya fue regularizado.`,
        );
      }

      const origin = await movementRepo.findOne({
        where: { id: queueItem.originMovementId, tenant_id: tenantId },
      });
      const trigger = await movementRepo.findOne({
        where: { id: queueItem.triggerMovementId, tenant_id: tenantId },
      });

      if (!origin || !trigger) {
        throw new NotFoundException(
          'Movimiento de origen o disparador no encontrado para regularización.',
        );
      }

      const prevCost = Number(origin.unitCostNio || 0);
      const newCost = Number(trigger.unitCostNio || prevCost);
      const affectedQty = Math.abs(Number(origin.quantity || 0));
      const deltaUnit = newCost - prevCost;
      const totalDelta = Math.abs(deltaUnit * affectedQty);

      // Validate governance approval rules
      this.governanceApprovalService.assertAuthorized({
        totalDeltaNio: totalDelta,
        isClosedPeriod: false,
        role: input.role,
      });

      const hashInput = `${origin.id}:${trigger.id}:${deltaUnit.toFixed(4)}:${affectedQty.toFixed(4)}`;
      const lineageHash = createHash('sha256').update(hashInput).digest('hex');

      const correction = correctionRepo.create({
        tenant_id: tenantId,
        insumoId: queueItem.insumoId,
        originMovementId: origin.id,
        triggerMovementId: trigger.id,
        previousUnitCostNio: Number(prevCost.toFixed(4)),
        recalculatedUnitCostNio: Number(newCost.toFixed(4)),
        deltaUnitCostNio: Number(deltaUnit.toFixed(4)),
        totalDeltaCostNio: Number(totalDelta.toFixed(4)),
        affectedQuantity: Number(affectedQty.toFixed(4)),
        lineageHash,
        authorizedByUserId: input.approvedByUserId,
        authorizedByRole: input.role,
        authorizationMethod: input.authMethod,
      });

      await correctionRepo.save(correction);

      queueItem.status = KardexQueueStatus.COMPLETED;
      queueItem.updatedAt = new Date();
      await queueRepo.save(queueItem);

      origin.estadoCosteo = 30; // REGULARIZED
      origin.unitCostNio = Number(newCost.toFixed(4));
      origin.autorizadoPorUsuarioId = input.approvedByUserId;
      origin.fechaAutorizacion = new Date();
      await movementRepo.save(origin);

      return correction;
    });
  }

  async syncCorrections(
    tenantId: string,
    corrections: Array<{
      id: string;
      insumoId: string;
      originMovementId: string;
      triggerMovementId: string;
      previousUnitCostNio: number;
      recalculatedUnitCostNio: number;
      deltaUnitCostNio: number;
      totalDeltaCostNio: number;
      affectedQuantity: number;
      lineageHash: string;
      authorizedByUserId?: string;
      authorizedByRole?: string;
      authorizationMethod?: string;
      createdAt: string;
    }>,
  ): Promise<{ syncedCount: number; duplicatesCount: number }> {
    let syncedCount = 0;
    let duplicatesCount = 0;

    // ST-06 (L1-11): kardex_correction and inventory_kardex carry tenant RLS
    // policies, so every read and write must run inside a transaction whose
    // app.tenant_id is bound before the first query. All repository access
    // below is manager-scoped; no global repository is used in the sync path.
    return this.dataSource.transaction(async (manager: EntityManager) => {
      await bindTenantContext(manager, tenantId);

      const correctionRepo = manager.getRepository(KardexCorrection);
      const movementRepo = manager.getRepository(InventoryMovement);

      for (const item of corrections) {
        const existing = await correctionRepo.findOne({
          where: { tenant_id: tenantId, lineageHash: item.lineageHash },
        });

        if (existing) {
          duplicatesCount++;
          continue;
        }

        const entity = correctionRepo.create({
          id: item.id,
          tenant_id: tenantId,
          insumoId: item.insumoId,
          originMovementId: item.originMovementId,
          triggerMovementId: item.triggerMovementId,
          previousUnitCostNio: item.previousUnitCostNio,
          recalculatedUnitCostNio: item.recalculatedUnitCostNio,
          deltaUnitCostNio: item.deltaUnitCostNio,
          totalDeltaCostNio: item.totalDeltaCostNio,
          affectedQuantity: item.affectedQuantity,
          lineageHash: item.lineageHash,
          // DSI-6 dependency: actor fields are self-reported by the POS at
          // authoring time and are not attested yet. Present values are
          // recorded exactly as sent; legitimate absence stays null — the
          // sync path never fabricates identity or privilege.
          authorizedByUserId: item.authorizedByUserId,
          authorizedByRole: item.authorizedByRole,
          authorizationMethod: item.authorizationMethod,
          createdAt: new Date(item.createdAt),
        });

        await correctionRepo.save(entity);

        // Update movement costing state
        const movement = await movementRepo.findOne({
          where: { id: item.originMovementId, tenant_id: tenantId },
        });
        if (movement) {
          movement.estadoCosteo = 30; // REGULARIZED
          movement.unitCostNio = item.recalculatedUnitCostNio;
          await movementRepo.save(movement);
        }

        syncedCount++;
      }

      return { syncedCount, duplicatesCount };
    });
  }
}
