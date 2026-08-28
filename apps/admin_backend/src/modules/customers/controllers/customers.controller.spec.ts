import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CustomersController } from './customers.controller';
import { CustomersService } from '../services/customers.service';
import { Customer } from '../entities/customer.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../entities/customer-point-transaction.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';

describe('CustomersController', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let controller: CustomersController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    getPointTransactions: jest.Mock;
    adjustPoints: jest.Mock;
  };

  const mockCustomer = (overrides: Partial<Customer> = {}): Customer =>
    ({
      id: 'c-1',
      tenant_id: 'tenant-1',
      name: 'Cliente Test',
      tax_id: '001-120590-0001A',
      phone: '8888-1111',
      points_balance: 50,
      is_active: true,
      ...overrides,
    }) as Customer;

  const mockTx: CustomerPointTransaction = {
    id: 'pt-1',
    tenant_id: 'tenant-1',
    customer_id: 'c-1',
    type: PointTransactionType.ADJUST,
    points: 30,
    balance_after: 80,
    conversion_rate: 0.1,
    reason: 'Ajuste manual',
    created_at: new Date(),
  } as CustomerPointTransaction;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({ data: [mockCustomer()], total: 1 }),
      findOne: jest.fn().mockResolvedValue(mockCustomer()),
      create: jest.fn().mockResolvedValue(mockCustomer()),
      update: jest.fn().mockResolvedValue(mockCustomer({ name: 'Actualizado' })),
      remove: jest.fn().mockResolvedValue(undefined),
      getPointTransactions: jest.fn().mockResolvedValue([mockTx]),
      adjustPoints: jest.fn().mockResolvedValue({ customer: mockCustomer({ points_balance: 80 }), transaction: mockTx }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [CustomersController],
      providers: [
        Reflector,
        {
          provide: CustomersService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CustomersController>(CustomersController);
  });

  it('should return list of customers for tenant', async () => {
    const res = await controller.findAll({}, 'tenant-1');
    expect(res.total).toBe(1);
    expect(service.findAll).toHaveBeenCalledWith('tenant-1', {});
  });

  it('should find one customer by ID', async () => {
    const res = await controller.findOne('c-1', 'tenant-1');
    expect(res.id).toBe('c-1');
    expect(service.findOne).toHaveBeenCalledWith('tenant-1', 'c-1');
  });

  it('should get point transactions history', async () => {
    const res = await controller.getPointTransactions('c-1', 'tenant-1');
    expect(res.length).toBe(1);
    expect(service.getPointTransactions).toHaveBeenCalledWith('tenant-1', 'c-1');
  });

  it('should adjust customer points', async () => {
    const dto = { points_delta: 30, reason: 'Ajuste manual' };
    const res = await controller.adjustPoints('c-1', dto, 'tenant-1');
    expect(res.customer.points_balance).toBe(80);
    expect(service.adjustPoints).toHaveBeenCalledWith('tenant-1', 'c-1', dto);
  });

  it('should create customer', async () => {
    const dto = { name: 'Cliente Nuevo', tax_id: 'J0310000000001' };
    const res = await controller.create(dto, 'tenant-1');
    expect(res).toBeDefined();
    expect(service.create).toHaveBeenCalledWith('tenant-1', dto);
  });

  it('should update customer', async () => {
    const dto = { name: 'Actualizado' };
    const res = await controller.update('c-1', dto, 'tenant-1');
    expect(res.name).toBe('Actualizado');
    expect(service.update).toHaveBeenCalledWith('tenant-1', 'c-1', dto);
  });

  it('should delete customer', async () => {
    const res = await controller.remove('c-1', 'tenant-1');
    expect(res.success).toBe(true);
    expect(service.remove).toHaveBeenCalledWith('tenant-1', 'c-1');
  });
});
