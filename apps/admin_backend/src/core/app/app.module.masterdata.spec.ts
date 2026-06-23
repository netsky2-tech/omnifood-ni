import { ConfigService } from '@nestjs/config';
import { createTypeOrmOptions } from './app.module';
import { Supplier } from '../../modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../modules/inventory/entities/warehouse.entity';

describe('AppModule Master Data Registration', () => {
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DB_PASSWORD') return 'test-db-password';
      return fallback;
    }),
  } as unknown as ConfigService;

  const options = createTypeOrmOptions(configService);

  it('should have Supplier repository registered', () => {
    expect(options.entities).toContain(Supplier);
  });

  it('should have Warehouse repository registered', () => {
    expect(options.entities).toContain(Warehouse);
  });
});
