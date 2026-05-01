import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Supplier } from '../../modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../modules/inventory/entities/warehouse.entity';

describe('AppModule Master Data Registration', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  }, 15000); // Increased timeout

  it('should have Supplier repository registered', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repository = module.get(getRepositoryToken(Supplier));
    expect(repository).toBeDefined();
  });

  it('should have Warehouse repository registered', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repository = module.get(getRepositoryToken(Warehouse));
    expect(repository).toBeDefined();
  });
});
