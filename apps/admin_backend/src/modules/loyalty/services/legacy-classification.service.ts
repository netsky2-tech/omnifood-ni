import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../entities/loyalty-program.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { Customer } from '../../customers/entities/customer.entity';

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
  ) {}

  async ensureLegacyProgram(tenantId: string): Promise<LoyaltyProgram> {
    const existing = await this.programRepo.findOne({
      where: {
        tenant_id: tenantId,
        name: LegacyClassificationService.LEGACY_PROGRAM_NAME,
      },
    });
    if (existing) return existing;

    const program = this.programRepo.create({
      tenant_id: tenantId,
      name: LegacyClassificationService.LEGACY_PROGRAM_NAME,
      program_type: LoyaltyProgramType.SPEND_POINTS,
      status: LoyaltyProgramStatus.ACTIVE,
      earning_rule: { legacyImport: true },
      eligibility_rule: { legacyOnly: true },
      config_version: 1,
    });
    return this.programRepo.save(program);
  }

  async classifyLegacyTransactions(
    tenantId: string,
    batchSize?: number,
  ): Promise<{ classified: number }> {
    const program = await this.ensureLegacyProgram(tenantId);

    const result = await this.txRepo
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
  }

  async reconcileProjection(
    tenantId: string,
    customerId: string,
    loyaltyProgramId: string,
  ): Promise<CustomerLoyaltyAccountProjection> {
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.units), 0)', 'total')
      .where('tx.tenant_id = :tenantId', { tenantId })
      .andWhere('tx.customer_id = :customerId', { customerId })
      .andWhere('tx.loyalty_program_id = :programId', {
        programId: loyaltyProgramId,
      })
      .getRawOne();

    const totalUnits = Number(result?.total ?? 0);

    let projection = await this.projectionRepo.findOne({
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
      projection = this.projectionRepo.create({
        tenant_id: tenantId,
        customer_id: customerId,
        loyalty_program_id: loyaltyProgramId,
        balance_units: totalUnits,
        projection_version: 1,
        recomputed_at: new Date(),
      });
    }

    return this.projectionRepo.save(projection);
  }
}
