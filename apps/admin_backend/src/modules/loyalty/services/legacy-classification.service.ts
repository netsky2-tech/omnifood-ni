import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../entities/loyalty-program.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { Customer } from '../../customers/entities/customer.entity';

interface TotalUnitsQueryResult {
  total?: string | number | null;
}

@Injectable()
export class LegacyClassificationService {
  private static readonly LEGACY_PROGRAM_NAME = 'Puntos Legacy';

  constructor(
    @InjectRepository(LoyaltyProgram)
    private readonly programRepo: Repository<LoyaltyProgram>,
    @InjectRepository(CustomerPointTransaction)
    private readonly txRepo: Repository<CustomerPointTransaction>,
    @InjectRepository(CustomerLoyaltyAccountProjection)
    private readonly projectionRepo: Repository<CustomerLoyaltyAccountProjection>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    // Issue #512 slice 4: the tenant-bound transaction manager is the only
    // access path to the customers/loyalty tables; the pooled repositories
    // above stay declared for Nest DI compatibility only.
    private readonly dataSource: DataSource,
  ) {}

  async ensureLegacyProgram(tenantId: string): Promise<LoyaltyProgram> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.ensureLegacyProgramIn(manager, tenantId),
    );
  }

  async classifyLegacyTransactions(
    tenantId: string,
    batchSize?: number,
  ): Promise<{ classified: number }> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const program = await this.ensureLegacyProgramIn(manager, tenantId);

        const result = await manager
          .createQueryBuilder()
          .update(CustomerPointTransaction)
          .set({
            loyalty_program_id: program.id,
            legacy_imported: true,
          })
          .where('tenant_id = :tenantId', { tenantId })
          .andWhere('loyalty_program_id IS NULL')
          .limit(batchSize)
          .execute();

        return { classified: result.affected ?? 0 };
      },
    );
  }

  async reconcileProjection(
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

  /**
   * Manager-taking helper (issue #512 slice 4): the legacy-program read/save
   * always runs on the caller's tenant-bound manager — never on its own
   * transaction — so `classifyLegacyTransactions` can include it in its unit.
   */
  private async ensureLegacyProgramIn(
    manager: EntityManager,
    tenantId: string,
  ): Promise<LoyaltyProgram> {
    const programRepo = manager.getRepository(LoyaltyProgram);
    const existing = await programRepo.findOne({
      where: {
        tenant_id: tenantId,
        name: LegacyClassificationService.LEGACY_PROGRAM_NAME,
      },
    });
    if (existing) return existing;

    const program = programRepo.create({
      tenant_id: tenantId,
      name: LegacyClassificationService.LEGACY_PROGRAM_NAME,
      program_type: LoyaltyProgramType.SPEND_POINTS,
      status: LoyaltyProgramStatus.ACTIVE,
      earning_rule: { legacyImport: true },
      eligibility_rule: { legacyOnly: true },
      config_version: 1,
    });
    return programRepo.save(program);
  }
}
