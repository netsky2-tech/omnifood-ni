import { ConfigService } from '@nestjs/config';
import { createTypeOrmOptions } from './app.module';
import { Supplier } from '../../modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../modules/inventory/entities/warehouse.entity';
import { IndustryTemplate } from '../../modules/onboarding/entities/industry-template.entity';
import { ImportStaging } from '../../modules/onboarding/entities/import-staging.entity';
import { RecipeVersion } from '../../modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../modules/inventory/entities/recipe-detail.entity';

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

  it('should have IndustryTemplate repository registered', () => {
    expect(options.entities).toContain(IndustryTemplate);
  });

  it('should have ImportStaging repository registered', () => {
    expect(options.entities).toContain(ImportStaging);
  });

  it('should have RecipeVersion and RecipeDetail registered for sync deltas', () => {
    expect(options.entities).toContain(RecipeVersion);
    expect(options.entities).toContain(RecipeDetail);
  });
});
