import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../../customers/entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';

interface TotalUnitsQueryResult {
  total?: string | number | null;
}

function toLegacyPointTransactionType(
  raw?: string | null,
): PointTransactionType {
  const normalized = raw?.toLowerCase();
  switch (normalized) {
    case 'redeem':
      return PointTransactionType.REDEEM;
    case 'adjust':
      return PointTransactionType.ADJUST;
    case 'reversal':
      return PointTransactionType.REVERSAL;
    case 'earn':
    default:
      return PointTransactionType.EARN;
  }
}

export interface AppendLoyaltyTxDto {
  tenantId: string;
  customerId: string;
  loyaltyProgramId: string;
  ticketId?: string;
  rewardId?: string;
  transactionType: string;
  units: number;
  reversalOfTransactionId?: string;
  idempotencyKey?: string;
  sourceEventId?: string;
  actorUserId?: string;
  branchId?: string;
  terminalId?: string;
  programVersion?: number;
  rewardVersion?: number;
  commercialSnapshot?: Record<string, unknown>;
  origin?: string;
  occurredAt?: Date;
  reason?: string;
}

@Injectable()
export class LoyaltyLedgerService {
  constructor(
    @InjectRepository(CustomerPointTransaction)
    private readonly txRepo: Repository<CustomerPointTransaction>,
    @InjectRepository(CustomerLoyaltyAccountProjection)
    private readonly projectionRepo: Repository<CustomerLoyaltyAccountProjection>,
    // Issue #512 slice 4: the tenant-bound transaction manager is the only
    // access path to the customers/loyalty tables; the pooled repositories
    // above stay declared for Nest DI compatibility only.
    private readonly dataSource: DataSource,
  ) {}

  async appendTransaction(
    dto: AppendLoyaltyTxDto,
  ): Promise<CustomerPointTransaction> {
    return runInTenantTransaction(
      this.dataSource,
      dto.tenantId,
      async (manager) => {
        const txRepo = manager.getRepository(CustomerPointTransaction);

        if (dto.idempotencyKey) {
          const existing = await txRepo.findOne({
            where: {
              idempotency_key: dto.idempotencyKey,
              tenant_id: dto.tenantId,
            },
          });
          if (existing) {
            const matchesCustomer =
              !dto.customerId || existing.customer_id === dto.customerId;
            const matchesProgram =
              !dto.loyaltyProgramId ||
              existing.loyalty_program_id === dto.loyaltyProgramId;
            const matchesUnits =
              dto.units === undefined ||
              Number(existing.units) === Number(dto.units);
            const existingType = (
              existing.transaction_type ?? existing.type
            )?.toLowerCase();
            const incomingType = dto.transactionType?.toLowerCase();
            const matchesType = !incomingType || existingType === incomingType;

            if (
              !matchesCustomer ||
              !matchesProgram ||
              !matchesUnits ||
              !matchesType
            ) {
              throw new ConflictException(
                `Integrity conflict: idempotency key '${dto.idempotencyKey}' already used with different payload`,
              );
            }
            return existing;
          }
        }

        const now = new Date();
        const tx = txRepo.create({
          tenant_id: dto.tenantId,
          customer_id: dto.customerId,
          loyalty_program_id: dto.loyaltyProgramId,
          ticket_id: dto.ticketId ?? null,
          reward_id: dto.rewardId ?? null,
          transaction_type: toLegacyPointTransactionType(dto.transactionType),
          type: toLegacyPointTransactionType(dto.transactionType),
          units: dto.units,
          points: dto.units ?? 0,
          reason: dto.reason ?? null,
          reversal_of_transaction_id: dto.reversalOfTransactionId ?? null,
          idempotency_key: dto.idempotencyKey ?? null,
          source_event_id: dto.sourceEventId ?? null,
          actor_user_id: dto.actorUserId ?? null,
          branch_id: dto.branchId ?? null,
          terminal_id: dto.terminalId ?? null,
          program_version: dto.programVersion ?? null,
          reward_version: dto.rewardVersion ?? null,
          commercial_snapshot: dto.commercialSnapshot ?? null,
          origin: dto.origin ?? null,
          occurred_at: dto.occurredAt ?? now,
          recorded_at: now,
          legacy_imported: false,
        } as Partial<CustomerPointTransaction>);

        const savedTx = await txRepo.save(tx);

        await this.updateProjection(
          manager,
          dto.tenantId,
          dto.customerId,
          dto.loyaltyProgramId,
          savedTx.id,
        );

        return savedTx;
      },
    );
  }

  async rebuildProjection(
    tenantId: string,
    customerId: string,
    loyaltyProgramId: string,
  ): Promise<CustomerLoyaltyAccountProjection> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const txRepo = manager.getRepository(CustomerPointTransaction);
        const projectionRepo = manager.getRepository(
          CustomerLoyaltyAccountProjection,
        );

        const result = await txRepo
          .createQueryBuilder('tx')
          .select('COALESCE(SUM(tx.units), 0)', 'total')
          .where('tx.tenant_id = :tenantId', { tenantId })
          .andWhere('tx.customer_id = :customerId', { customerId })
          .andWhere('tx.loyalty_program_id = :programId', {
            programId: loyaltyProgramId,
          })
          .getRawOne<TotalUnitsQueryResult>();

        const totalUnits = Number(result?.total ?? 0);

        let projection = await projectionRepo.findOne({
          where: {
            tenant_id: tenantId,
            customer_id: customerId,
            loyalty_program_id: loyaltyProgramId,
          },
        });

        if (projection) {
          projection.balance_units = totalUnits;
          projection.projection_version = projection.projection_version + 1;
          projection.recomputed_at = new Date();
        } else {
          projection = projectionRepo.create({
            tenant_id: tenantId,
            customer_id: customerId,
            loyalty_program_id: loyaltyProgramId,
            balance_units: totalUnits,
            projection_version: 1,
            recomputed_at: new Date(),
          });
        }

        return projectionRepo.save(projection);
      },
    );
  }

  // Issue #512 slice 4: never opens its own transaction — it always runs on
  // the caller's tenant-bound manager (inside appendTransaction's unit).
  private async updateProjection(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    loyaltyProgramId: string,
    lastTransactionId: string,
  ): Promise<void> {
    const txRepo = manager.getRepository(CustomerPointTransaction);
    const projectionRepo = manager.getRepository(
      CustomerLoyaltyAccountProjection,
    );

    const result = await txRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.units), 0)', 'total')
      .where('tx.tenant_id = :tenantId', { tenantId })
      .andWhere('tx.customer_id = :customerId', { customerId })
      .andWhere('tx.loyalty_program_id = :programId', {
        programId: loyaltyProgramId,
      })
      .getRawOne<TotalUnitsQueryResult>();

    const totalUnits = Number(result?.total ?? 0);

    let projection = await projectionRepo.findOne({
      where: {
        tenant_id: tenantId,
        customer_id: customerId,
        loyalty_program_id: loyaltyProgramId,
      },
    });

    if (projection) {
      projection.balance_units = totalUnits;
      projection.projection_version = projection.projection_version + 1;
      projection.last_transaction_id = lastTransactionId;
      projection.recomputed_at = new Date();
    } else {
      projection = projectionRepo.create({
        tenant_id: tenantId,
        customer_id: customerId,
        loyalty_program_id: loyaltyProgramId,
        balance_units: totalUnits,
        last_transaction_id: lastTransactionId,
        projection_version: 1,
        recomputed_at: new Date(),
      });
    }

    await projectionRepo.save(projection);
  }
}
