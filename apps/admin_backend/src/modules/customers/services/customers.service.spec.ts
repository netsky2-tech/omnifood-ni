import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { CustomersService } from './customers.service';
import { Customer } from '../entities/customer.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../../loyalty/entities/customer-loyalty-account-projection.entity';

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

  // Issue #512 slice 4: the tenant-bound transaction manager is the only
  // permitted access path, so the binding guard keeps manager-scoped repo
  // mocks distinct from the pooled ones to prove the pooled path is unused.
  const mgrCustomerRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mgrPointTxRepo = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mgrProjectionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const managerGetRepository = jest.fn((entity: unknown) => {
    if (entity === Customer) return mgrCustomerRepo;
    if (entity === CustomerPointTransaction) return mgrPointTxRepo;
    if (entity === CustomerLoyaltyAccountProjection) return mgrProjectionRepo;
    return null;
  });
  const manager = {
    getRepository: managerGetRepository,
    query: jest.fn(),
    transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) =>
      cb({ getRepository: managerGetRepository, query: manager.query }),
    ),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    getRepository: jest.fn(),
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

    mgrCustomerRepo.createQueryBuilder.mockReturnValue(qb);
    mgrCustomerRepo.findOne.mockReset();
    mgrCustomerRepo.create
      .mockReset()
      .mockImplementation((data: unknown) => data as Customer);
    mgrCustomerRepo.save
      .mockReset()
      .mockImplementation((entity: unknown) => Promise.resolve(entity));
    mgrPointTxRepo.find.mockReset();
    mgrPointTxRepo.create
      .mockReset()
      .mockImplementation((data: unknown) => data as CustomerPointTransaction);
    mgrPointTxRepo.save
      .mockReset()
      .mockImplementation((entity: unknown) => Promise.resolve(entity));

    repo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as Customer),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };

    pointTxRepo = {
      find: jest.fn(),
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
        { provide: DataSource, useValue: dataSource },
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
    mgrCustomerRepo.findOne.mockResolvedValue(mockCustomer());
    const customer = await service.findOne('tenant-1', 'cust-uuid-1');
    expect(customer.id).toBe('cust-uuid-1');
    expect(customer.tenant_id).toBe('tenant-1');
  });

  it('should throw NotFoundException when customer does not exist', async () => {
    mgrCustomerRepo.findOne.mockResolvedValue(null);
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
    mgrCustomerRepo.findOne.mockResolvedValue(mockCustomer());
    const updated = await service.update('tenant-1', 'cust-uuid-1', {
      phone: '8777-6655',
    });
    expect(updated.phone).toBe('8777-6655');
  });

  it('should soft delete customer by setting is_active to false', async () => {
    const customer = mockCustomer();
    mgrCustomerRepo.findOne.mockResolvedValue(customer);
    await service.remove('tenant-1', 'cust-uuid-1');
    expect(customer.is_active).toBe(false);
    expect(mgrCustomerRepo.save).toHaveBeenCalledWith(customer);
  });

  it('should get point transactions history for customer', async () => {
    mgrCustomerRepo.findOne.mockResolvedValue(mockCustomer());
    mgrPointTxRepo.find.mockResolvedValue([mockPointTx()]);
    const txs = await service.getPointTransactions('tenant-1', 'cust-uuid-1');
    expect(txs.length).toBe(1);
    expect(txs[0].points).toBe(20);
    expect(mgrPointTxRepo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', customer_id: 'cust-uuid-1' },
      order: { created_at: 'DESC' },
    });
  });

  it('should adjust customer points and save transaction in ledger', async () => {
    const customer = mockCustomer({ points_balance: 100 });
    mgrCustomerRepo.findOne.mockResolvedValue(customer);

    const result = await service.adjustPoints('tenant-1', 'cust-uuid-1', {
      points_delta: 50,
      reason: 'Bono de fidelidad por aniversario',
    });

    expect(result.customer.points_balance).toBe(150);
    expect(result.transaction.points).toBe(50);
    expect(result.transaction.balance_after).toBe(150);
    expect(result.transaction.reason).toBe('Bono de fidelidad por aniversario');
    expect(mgrPointTxRepo.save).toHaveBeenCalled();
    expect(mgrCustomerRepo.save).toHaveBeenCalledWith(customer);
  });

  it('binds the findOne access through the tenant transaction (issue #512 slice 4)', async () => {
    // Reset call history so the pooled-unused assertion is meaningful.
    repo.findOne.mockClear();
    mgrCustomerRepo.findOne.mockClear();
    mgrCustomerRepo.findOne.mockResolvedValue(mockCustomer());
    managerGetRepository.mockClear();
    manager.query.mockClear();
    dataSource.transaction.mockClear();

    const customer = await service.findOne('tenant-a', 'cust-uuid-1');

    expect(customer.id).toBe('cust-uuid-1');
    // A tenant transaction must be opened for the access...
    expect(dataSource.transaction).toHaveBeenCalled();
    // ...and the transaction-local binding SQL must be issued on the unit
    // manager with the trimmed tenant id before any protected access.
    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-a',
    ]);
    // The protected access must resolve its repository from the bound manager.
    expect(managerGetRepository).toHaveBeenCalledWith(Customer);
    // The pooled repository property must not be used.
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
