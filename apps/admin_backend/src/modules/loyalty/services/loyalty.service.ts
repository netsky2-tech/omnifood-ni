import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
} from '../entities/loyalty-program.entity';
import {
  RewardDefinition,
  RewardStatus,
} from '../entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { CreateLoyaltyProgramDto } from '../dto/loyalty-program.dto';
import { UpdateLoyaltyProgramDto } from '../dto/loyalty-program.dto';
import { CreateRewardDefinitionDto } from '../dto/reward-definition.dto';
import { UpdateRewardDefinitionDto } from '../dto/reward-definition.dto';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(LoyaltyProgram)
    private readonly programRepository: Repository<LoyaltyProgram>,
    @InjectRepository(RewardDefinition)
    private readonly rewardRepository: Repository<RewardDefinition>,
    @InjectRepository(CustomerLoyaltyAccountProjection)
    private readonly projectionRepository: Repository<CustomerLoyaltyAccountProjection>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  // --- Programs ---

  async findAllPrograms(
    tenantId: string,
    filters?: { status?: LoyaltyProgramStatus; program_type?: string },
  ): Promise<LoyaltyProgram[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.program_type) where.program_type = filters.program_type;

    return this.programRepository.find({
      where,
      order: { created_at: 'DESC' },
    });
  }

  async findOneProgram(
    tenantId: string,
    id: string,
  ): Promise<LoyaltyProgram> {
    const program = await this.programRepository.findOne({
      where: { id, tenant_id: tenantId },
      relations: ['rewards'],
    });
    if (!program) {
      throw new NotFoundException(`Loyalty program ${id} not found`);
    }
    return program;
  }

  async createProgram(
    tenantId: string,
    dto: CreateLoyaltyProgramDto,
  ): Promise<LoyaltyProgram> {
    if (dto.starts_at && dto.ends_at) {
      if (new Date(dto.starts_at) >= new Date(dto.ends_at)) {
        throw new BadRequestException(
          'starts_at must be before ends_at',
        );
      }
    }

    const program = this.programRepository.create({
      name: dto.name,
      program_type: dto.program_type,
      tenant_id: tenantId,
      status: LoyaltyProgramStatus.DRAFT,
      config_version: 1,
      earning_rule: dto.earning_rule as unknown as Record<string, unknown>,
      eligibility_rule: dto.eligibility_rule as unknown as Record<string, unknown>,
      starts_at: dto.starts_at ? new Date(dto.starts_at) : undefined,
      ends_at: dto.ends_at ? new Date(dto.ends_at) : undefined,
    });
    return this.programRepository.save(program);
  }

  async updateProgram(
    tenantId: string,
    id: string,
    dto: UpdateLoyaltyProgramDto,
  ): Promise<LoyaltyProgram> {
    const program = await this.findOneProgram(tenantId, id);

    if (
      program.status === LoyaltyProgramStatus.ACTIVE &&
      program.config_version > 1
    ) {
      // Allow edits to ACTIVE programs but bump config version
    }

    if (dto.starts_at && dto.ends_at) {
      if (new Date(dto.starts_at) >= new Date(dto.ends_at)) {
        throw new BadRequestException(
          'starts_at must be before ends_at',
        );
      }
    }

    Object.assign(program, {
      ...dto,
      starts_at: dto.starts_at ? new Date(dto.starts_at) : program.starts_at,
      ends_at: dto.ends_at ? new Date(dto.ends_at) : program.ends_at,
      config_version: program.config_version + 1,
    });
    return this.programRepository.save(program);
  }

  async activateProgram(
    tenantId: string,
    id: string,
  ): Promise<LoyaltyProgram> {
    const program = await this.findOneProgram(tenantId, id);
    if (program.status === LoyaltyProgramStatus.ACTIVE) {
      throw new ConflictException('Program is already active');
    }
    program.status = LoyaltyProgramStatus.ACTIVE;
    program.config_version = program.config_version + 1;
    return this.programRepository.save(program);
  }

  async deactivateProgram(
    tenantId: string,
    id: string,
  ): Promise<LoyaltyProgram> {
    const program = await this.findOneProgram(tenantId, id);
    if (program.status === LoyaltyProgramStatus.INACTIVE) {
      throw new ConflictException('Program is already inactive');
    }
    program.status = LoyaltyProgramStatus.INACTIVE;
    program.config_version = program.config_version + 1;
    return this.programRepository.save(program);
  }

  // --- Rewards ---

  async findRewardsByProgram(
    tenantId: string,
    programId: string,
  ): Promise<RewardDefinition[]> {
    await this.findOneProgram(tenantId, programId);
    return this.rewardRepository.find({
      where: { tenant_id: tenantId, loyalty_program_id: programId },
      order: { presentation_order: 'ASC', created_at: 'DESC' },
    });
  }

  async findOneReward(
    tenantId: string,
    rewardId: string,
  ): Promise<RewardDefinition> {
    const reward = await this.rewardRepository.findOne({
      where: { id: rewardId, tenant_id: tenantId },
    });
    if (!reward) {
      throw new NotFoundException(`Reward ${rewardId} not found`);
    }
    return reward;
  }

  async createReward(
    tenantId: string,
    programId: string,
    dto: CreateRewardDefinitionDto,
  ): Promise<RewardDefinition> {
    const program = await this.findOneProgram(tenantId, programId);

    if (
      dto.reward_type === 'DISCOUNT_AMOUNT' &&
      (!dto.benefit_config?.amountNio ||
        dto.benefit_config.amountNio <= 0)
    ) {
      throw new BadRequestException(
        'DISCOUNT_AMOUNT requires amountNio > 0 in benefit_config',
      );
    }

    if (
      dto.reward_type === 'FREE_PRODUCT' &&
      !dto.benefit_config?.productId
    ) {
      throw new BadRequestException(
        'FREE_PRODUCT requires productId in benefit_config',
      );
    }

    const reward = this.rewardRepository.create({
      name: dto.name,
      description: dto.description,
      reward_type: dto.reward_type,
      cost_units: dto.cost_units,
      benefit_config: dto.benefit_config as unknown as Record<string, unknown>,
      presentation_order: dto.presentation_order ?? 0,
      tenant_id: tenantId,
      loyalty_program_id: programId,
      status: RewardStatus.INACTIVE,
      config_version: 1,
      starts_at: dto.starts_at ? new Date(dto.starts_at) : undefined,
      ends_at: dto.ends_at ? new Date(dto.ends_at) : undefined,
    });

    const saved = await this.rewardRepository.save(reward);

    // Bump program config version (use increment to avoid cascade on rewards relation)
    await this.programRepository.increment(
      { id: programId, tenant_id: tenantId },
      'config_version',
      1,
    );

    return saved;
  }

  async updateReward(
    tenantId: string,
    rewardId: string,
    dto: UpdateRewardDefinitionDto,
  ): Promise<RewardDefinition> {
    const reward = await this.findOneReward(tenantId, rewardId);

    Object.assign(reward, {
      ...dto,
      starts_at: dto.starts_at ? new Date(dto.starts_at) : reward.starts_at,
      ends_at: dto.ends_at ? new Date(dto.ends_at) : reward.ends_at,
      benefit_config: dto.benefit_config
        ? (dto.benefit_config as Record<string, unknown>)
        : reward.benefit_config,
      config_version: reward.config_version + 1,
    });

    const saved = await this.rewardRepository.save(reward);

    // Bump program config version
    const program = await this.findOneProgram(
      tenantId,
      reward.loyalty_program_id,
    );
    program.config_version = program.config_version + 1;
    await this.programRepository.save(program);

    return saved;
  }

  async activateReward(
    tenantId: string,
    rewardId: string,
  ): Promise<RewardDefinition> {
    const reward = await this.findOneReward(tenantId, rewardId);
    if (reward.status === RewardStatus.ACTIVE) {
      throw new ConflictException('Reward is already active');
    }
    reward.status = RewardStatus.ACTIVE;
    reward.config_version = reward.config_version + 1;
    return this.rewardRepository.save(reward);
  }

  async deactivateReward(
    tenantId: string,
    rewardId: string,
  ): Promise<RewardDefinition> {
    const reward = await this.findOneReward(tenantId, rewardId);
    if (reward.status === RewardStatus.INACTIVE) {
      throw new ConflictException('Reward is already inactive');
    }
    reward.status = RewardStatus.INACTIVE;
    reward.config_version = reward.config_version + 1;
    return this.rewardRepository.save(reward);
  }

  // --- Customer Loyalty Accounts ---

  async getCustomerBalance(
    tenantId: string,
    customerId: string,
    loyaltyProgramId: string,
  ): Promise<{ balanceUnits: number; source: 'projection' | 'legacy' }> {
    const projection = await this.projectionRepository.findOne({
      where: { tenant_id: tenantId, customer_id: customerId, loyalty_program_id: loyaltyProgramId },
    });

    if (projection && projection.projection_version > 0) {
      return { balanceUnits: projection.balance_units, source: 'projection' };
    }

    const customer = await this.customerRepository.findOne({
      where: { id: customerId, tenant_id: tenantId },
    });

    if (!customer) {
      return { balanceUnits: 0, source: 'legacy' };
    }

    return { balanceUnits: Math.floor(Number(customer.points_balance)), source: 'legacy' };
  }

  async getCustomerLoyaltyAccounts(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerLoyaltyAccountProjection[]> {
    return this.projectionRepository.find({
      where: { tenant_id: tenantId, customer_id: customerId },
      relations: ['loyalty_program'],
    });
  }

  async getCustomerTransactions(
    tenantId: string,
    customerId: string,
    programId?: string,
  ) {
    const qb = this.projectionRepository.manager
      .createQueryBuilder(CustomerPointTransaction, 't')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.customer_id = :customerId', { customerId })
      .andWhere('t.legacy_imported = :legacy', { legacy: false });

    if (programId) {
      qb.andWhere('t.loyalty_program_id = :programId', { programId });
    }

    qb.orderBy('t.occurred_at', 'DESC').addOrderBy('t.id', 'DESC');

    return qb.getMany();
  }
}
