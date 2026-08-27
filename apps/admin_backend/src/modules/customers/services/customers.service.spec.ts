import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from '../entities/customer.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../entities/customer-point-transaction.entity';

describe('CustomersService', () => {
  let service: CustomersService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let pointTxRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const mockCustomer = (overrides: Partial<Customer> = {}): Customer =>
    ({
      id: 'cust-uuid-1',
      tenant_id: 'tenant-1',
      name: 'Distribuidora San José',
      tax_id: 'J0310000000123',
      phone: '2222-3333',
      email: 'contacto@sanjose.ni',
      address: 'Managua',
      points_balance: 100,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }) as Customer;

  const mockPointTx = (
    overrides: Partial<CustomerPointTransaction> = {},
  ): CustomerPointTransaction =>
    ({
      id: 'pt-1',
      tenant_id: 'tenant-1',
      customer_id: 'cust-uuid-1',
      type: PointTransactionType.EARN,
      points: 20,
      balance_after: 120,
      conversion_rate: 0.1,
      reason: 'Compra factura #001',
      created_at: new Date(),
      ...overrides,
    }) as CustomerPointTransaction;

  beforeEach(async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockCustomer()], 1]),
    };

    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as Customer),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };

    pointTxRepo = {
      find: jest.fn().mockResolvedValue([mockPointTx()]),
      create: jest.fn((data: unknown) => data as CustomerPointTransaction),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: getRepositoryToken(Customer),
          useValue: repo,
        },
        {
          provide: getRepositoryToken(CustomerPointTransaction),
          useValue: pointTxRepo,
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('should find all active customers for a tenant with pagination', async () => {
    const result = await service.findAll('tenant-1', { limit: 10, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('Distribuidora San José');
  });

  it('should find customer by id and tenant', async () => {
    repo.findOne.mockResolvedValue(mockCustomer());
    const customer = await service.findOne('tenant-1', 'cust-uuid-1');
    expect(customer.id).toBe('cust-uuid-1');
    expect(customer.tenant_id).toBe('tenant-1');
  });

  it('should throw NotFoundException when customer does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('tenant-1', 'non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should create customer with initial points balance of 0', async () => {
    const dto = {
      name: 'Comercial Nueva',
      tax_id: '001-120590-0001A',
      phone: '8888-9999',
    };
    const created = await service.create('tenant-1', dto);
    expect(created.name).toBe('Comercial Nueva');
    expect(created.tenant_id).toBe('tenant-1');
    expect(created.points_balance).toBe(0.0);
    expect(created.is_active).toBe(true);
  });

  it('should update customer details', async () => {
    repo.findOne.mockResolvedValue(mockCustomer());
    const updated = await service.update('tenant-1', 'cust-uuid-1', {
      phone: '8777-6655',
    });
    expect(updated.phone).toBe('8777-6655');
  });

  it('should soft delete customer by setting is_active to false', async () => {
    const customer = mockCustomer();
    repo.findOne.mockResolvedValue(customer);
    await service.remove('tenant-1', 'cust-uuid-1');
    expect(customer.is_active).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(customer);
  });

  it('should get point transactions history for customer', async () => {
    repo.findOne.mockResolvedValue(mockCustomer());
    const txs = await service.getPointTransactions('tenant-1', 'cust-uuid-1');
    expect(txs.length).toBe(1);
    expect(txs[0].points).toBe(20);
    expect(pointTxRepo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', customer_id: 'cust-uuid-1' },
      order: { created_at: 'DESC' },
    });
  });

  it('should adjust customer points and save transaction in ledger', async () => {
    const customer = mockCustomer({ points_balance: 100 });
    repo.findOne.mockResolvedValue(customer);

    const result = await service.adjustPoints('tenant-1', 'cust-uuid-1', {
      points_delta: 50,
      reason: 'Bono de fidelidad por aniversario',
    });

    expect(result.customer.points_balance).toBe(150);
    expect(result.transaction.points).toBe(50);
    expect(result.transaction.balance_after).toBe(150);
    expect(result.transaction.reason).toBe('Bono de fidelidad por aniversario');
    expect(pointTxRepo.save).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(customer);
  });
});
