import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { KardexRecalculateQueue, KardexQueueStatus } from '../entities/kardex-recalculate-queue.entity';
import { KardexCorrection } from '../entities/kardex-correction.entity';
import { InventoryMovement } from '../entities/inventory-movement.entity';
import { GovernanceApprovalService } from './governance-approval.service';

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

  async getPendingQueue(tenantId: string): Promise<KardexRecalculateQueue[]> {
    return this.queueRepository.find({
      where: {
        tenant_id: tenantId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async approveRegularization(
    tenantId: string,
    input: ApproveRegularizationInput,
  ): Promise<KardexCorrection> {
    return this.dataSource.transaction(async (manager) => {
      const queueRepo = manager.getRepository(KardexRecalculateQueue);
      const correctionRepo = manager.getRepository(KardexCorrection);
      const movementRepo = manager.getRepository(InventoryMovement);

      const queueItem = await queueRepo.findOne({
        where: { id: input.queueId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!queueItem) {
        throw new NotFoundException(`Elemento de cola ${input.queueId} no encontrado.`);
      }

      if (queueItem.status === KardexQueueStatus.COMPLETED) {
        throw new BadRequestException(`El elemento ${input.queueId} ya fue regularizado.`);
      }

      const origin = await movementRepo.findOne({
        where: { id: queueItem.originMovementId, tenant_id: tenantId },
      });
      const trigger = await movementRepo.findOne({
        where: { id: queueItem.triggerMovementId, tenant_id: tenantId },
      });

      if (!origin || !trigger) {
        throw new NotFoundException('Movimiento de origen o disparador no encontrado para regularización.');
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

    for (const item of corrections) {
      const existing = await this.correctionRepository.findOne({
        where: { tenant_id: tenantId, lineageHash: item.lineageHash },
      });

      if (existing) {
        duplicatesCount++;
        continue;
      }

      const entity = this.correctionRepository.create({
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
        authorizedByUserId: item.authorizedByUserId,
        authorizedByRole: item.authorizedByRole,
        authorizationMethod: item.authorizationMethod,
        createdAt: new Date(item.createdAt),
      });

      await this.correctionRepository.save(entity);

      // Update movement costing state
      const movement = await this.movementRepository.findOne({
        where: { id: item.originMovementId, tenant_id: tenantId },
      });
      if (movement) {
        movement.estadoCosteo = 30; // REGULARIZED
        movement.unitCostNio = item.recalculatedUnitCostNio;
        await this.movementRepository.save(movement);
      }

      syncedCount++;
    }

    return { syncedCount, duplicatesCount };
  }
}
