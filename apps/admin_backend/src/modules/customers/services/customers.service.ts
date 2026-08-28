import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../entities/customer-point-transaction.entity';
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
  ): Promise<{ customer: Customer; transaction: CustomerPointTransaction }> {
    const customer = await this.findOne(tenantId, customerId);
    const currentBalance = Number(customer.points_balance) || 0.0;
    const newBalance = Math.max(0.0, currentBalance + dto.points_delta);

    const transaction = this.pointTransactionRepository.create({
      tenant_id: tenantId,
      customer_id: customerId,
      invoice_id: dto.invoice_id,
      type: PointTransactionType.ADJUST,
      points: dto.points_delta,
      balance_after: newBalance,
      conversion_rate: 0.1,
      reason: dto.reason,
    });

    const savedTx = await this.pointTransactionRepository.save(transaction);
    customer.points_balance = newBalance;
    const savedCust = await this.customerRepository.save(customer);

    return { customer: savedCust, transaction: savedTx };
  }
}
