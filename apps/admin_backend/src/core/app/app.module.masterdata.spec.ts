import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from '../../modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../modules/inventory/entities/warehouse.entity';

describe('AppModule Master Data Registration', () => {
  let module: TestingModule;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.DB_PASSWORD = 'test-db-password';

    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  }, 30000);

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should have Supplier repository registered', () => {
    const repository = module.get<Repository<Supplier>>(
      getRepositoryToken(Supplier),
    );
    expect(repository.metadata.targetName).toBe('Supplier');
  });

  it('should have Warehouse repository registered', () => {
    const repository = module.get<Repository<Warehouse>>(
      getRepositoryToken(Warehouse),
    );
    expect(repository.metadata.targetName).toBe('Warehouse');
  });
});
