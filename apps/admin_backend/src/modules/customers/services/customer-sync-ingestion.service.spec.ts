import { DataSource } from 'typeorm';
import { CustomerSyncIngestionService } from './customer-sync-ingestion.service';
import { Customer } from '../entities/customer.entity';
import type { CustomerSyncItemDto } from '../dto/customer-sync.dto';

interface RepoStub {
  findOne: jest.Mock;
  upsert: jest.Mock;
  save: jest.Mock;
}

function repoStub(): RepoStub {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue({}),
  };
}

function makeDataSource(customersRepo: RepoStub): {
  dataSource: DataSource;
  manager: { query: jest.Mock; getRepository: (entity: unknown) => unknown };
} {
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: (entity: unknown) => {
      if (entity === Customer) return customersRepo;
      return undefined;
    },
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
      cb(manager),
    ),
  } as unknown as DataSource;
  return { dataSource, manager };
}

function sampleCustomer(overrides: Partial<CustomerSyncItemDto> = {}): CustomerSyncItemDto {
  return {
    id: 'cust-uuid-1',
    name: 'Juan Perez',
    taxId: '001-120590-0001A',
    phone: '8888-8888',
    email: 'juan@example.com',
    address: 'Managua, Nicaragua',
    createdAt: '2026-10-09T14:30:00.000Z',
    updatedAt: '2026-10-09T14:30:00.000Z',
    ...overrides,
  };
}

describe('CustomerSyncIngestionService', () => {
  let customers: RepoStub;
  let dataSource: DataSource;
  let service: CustomerSyncIngestionService;

  beforeEach(() => {
    customers = repoStub();
    ({ dataSource } = makeDataSource(customers));
    service = new CustomerSyncIngestionService(dataSource);
  });

  it('accepts and upserts a new customer bound to the caller tenant', async () => {
    const item = sampleCustomer();
    const result = await service.ingestCustomerBatch('tenant-1', {
      customers: [item],
    });

    expect(result.results).toEqual([
      { id: 'cust-uuid-1', status: 'ACCEPTED' },
    ]);
    expect(customers.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cust-uuid-1',
        tenant_id: 'tenant-1',
        name: 'Juan Perez',
        tax_id: '001-120590-0001A',
        phone: '8888-8888',
        email: 'juan@example.com',
        address: 'Managua, Nicaragua',
        is_active: true,
      }),
      ['id'],
    );
  });

  it('rejects a customer colliding with a different tenant without mutating', async () => {
    customers.findOne.mockResolvedValueOnce({
      id: 'cust-uuid-1',
      tenant_id: 'tenant-OTHER',
    });

    const result = await service.ingestCustomerBatch('tenant-1', {
      customers: [sampleCustomer()],
    });

    expect(result.results).toEqual([
      {
        id: 'cust-uuid-1',
        status: 'FAILED',
        code: 'TENANT_IDENTITY_CONFLICT',
        message: expect.stringContaining('already belongs to another tenant'),
      },
    ]);
    expect(customers.upsert).not.toHaveBeenCalled();
  });

  it('rejects an item with an empty name', async () => {
    const result = await service.ingestCustomerBatch('tenant-1', {
      customers: [sampleCustomer({ name: '   ' })],
    });

    expect(result.results).toEqual([
      {
        id: 'cust-uuid-1',
        status: 'FAILED',
        code: 'INVALID_PAYLOAD',
        message: expect.stringContaining('Name cannot be empty'),
      },
    ]);
    expect(customers.upsert).not.toHaveBeenCalled();
  });

  it('normalizes timestamps to UTC Date without 6h drift', async () => {
    const item = sampleCustomer({
      createdAt: '2026-10-09T14:30:00.000', // legacy local time without Z
    });

    await service.ingestCustomerBatch('tenant-1', {
      customers: [item],
    });

    expect(customers.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cust-uuid-1',
        created_at: new Date('2026-10-09T20:30:00.000Z'),
      }),
      ['id'],
    );
  });
});
