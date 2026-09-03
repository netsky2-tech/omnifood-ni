import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
  LoyaltyTransactionOrigin,
} from '../entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../../loyalty/entities/customer-loyalty-account-projection.entity';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { CustomerQueryDto } from '../dto/customer-query.dto';
import { AdjustPointsDto } from '../dto/adjust-points.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerPointTransaction)
    private readonly pointTransactionRepository: Repository<CustomerPointTransaction>,
  ) {}

  async findAll(
    tenantId: string,
    query: CustomerQueryDto,
  ): Promise<{ data: Customer[]; total: number }> {
    const qb = this.customerRepository
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.is_active = true');

    if (query.search && query.search.trim().length > 0) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(c.name) LIKE :s OR LOWER(c.tax_id) LIKE :s OR LOWER(c.phone) LIKE :s)',
        { s },
      );
    }

    qb.orderBy('c.name', 'ASC')
      .take(query.limit ?? 20)
      .skip(query.offset ?? 0);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  async findByTaxId(tenantId: string, taxId: string): Promise<Customer | null> {
    return this.customerRepository.findOne({
      where: { tenant_id: tenantId, tax_id: taxId },
    });
  }

  async create(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    const customer = this.customerRepository.create({
      ...dto,
      tenant_id: tenantId,
      points_balance: 0.0,
      is_active: true,
    });
    return this.customerRepository.save(customer);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.findOne(tenantId, id);
    Object.assign(customer, dto);
    return this.customerRepository.save(customer);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const customer = await this.findOne(tenantId, id);
    customer.is_active = false;
    await this.customerRepository.save(customer);
  }

  async getPointTransactions(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerPointTransaction[]> {
    await this.findOne(tenantId, customerId); // Ensure customer exists
    return this.pointTransactionRepository.find({
      where: { tenant_id: tenantId, customer_id: customerId },
      order: { created_at: 'DESC' },
    });
  }

  async adjustPoints(
    tenantId: string,
    customerId: string,
    dto: AdjustPointsDto,
    actorUserId?: string,
  ): Promise<{ customer: Customer; transaction: CustomerPointTransaction }> {
    const customer = await this.findOne(tenantId, customerId);
    const currentBalance = Number(customer.points_balance) || 0.0;
    // LV1.7 / M7: Adjustments can leave negative balance (AV-10, AV-41)
    const newBalance = currentBalance + dto.points_delta;
    const now = new Date();

    const transaction = this.pointTransactionRepository.create({
      tenant_id: tenantId,
      customer_id: customerId,
      invoice_id: dto.invoice_id,
      loyalty_program_id: dto.loyalty_program_id ?? null,
      type: PointTransactionType.ADJUST,
      transaction_type: PointTransactionType.ADJUST,
      points: dto.points_delta,
      units: Math.round(dto.points_delta),
      balance_after: newBalance,
      conversion_rate: 0.1,
      reason: dto.reason,
      actor_user_id: actorUserId ?? null,
      origin: LoyaltyTransactionOrigin.CLOUD,
      occurred_at: now,
      recorded_at: now,
      legacy_imported: false,
    });

    const savedTx = await this.pointTransactionRepository.save(transaction);
    customer.points_balance = newBalance;
    const savedCust = await this.customerRepository.save(customer);

    if (dto.loyalty_program_id) {
      try {
        const projRepo = this.pointTransactionRepository.manager.getRepository(
          CustomerLoyaltyAccountProjection,
        );
        const sumResult = await this.pointTransactionRepository
          .createQueryBuilder('tx')
          .select('COALESCE(SUM(tx.units), 0)', 'total')
          .where('tx.tenant_id = :tenantId', { tenantId })
          .andWhere('tx.customer_id = :customerId', { customerId })
          .andWhere('tx.loyalty_program_id = :programId', {
            programId: dto.loyalty_program_id,
          })
          .getRawOne();
        const totalUnits = Number(sumResult?.total ?? 0);

        let projection = await projRepo.findOne({
          where: {
            tenant_id: tenantId,
            customer_id: customerId,
            loyalty_program_id: dto.loyalty_program_id,
          },
        });

        if (projection) {
          projection.balance_units = totalUnits;
          projection.projection_version = projection.projection_version + 1;
          projection.last_transaction_id = savedTx.id;
          projection.recomputed_at = now;
          await projRepo.save(projection);
        } else {
          projection = projRepo.create({
            tenant_id: tenantId,
            customer_id: customerId,
            loyalty_program_id: dto.loyalty_program_id,
            balance_units: totalUnits,
            last_transaction_id: savedTx.id,
            projection_version: 1,
            recomputed_at: now,
          });
          await projRepo.save(projection);
        }
      } catch {
        // Safe fallback if projection table not wired in current context
      }
    }

    return { customer: savedCust, transaction: savedTx };
  }
}
