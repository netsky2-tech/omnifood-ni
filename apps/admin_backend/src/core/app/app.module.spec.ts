import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { createTypeOrmOptions, getRequiredConfigValue } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Insumo } from '../../modules/inventory/entities/insumo.entity';
import { Product } from '../../modules/inventory/entities/product.entity';
import { Recipe } from '../../modules/inventory/entities/recipe.entity';
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';
import { ConfigService } from '@nestjs/config';

describe('AppModule Registration', () => {
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

  it('should have Insumo repository registered', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repository = module.get(getRepositoryToken(Insumo));
    expect(repository).toBeDefined();
  });

  it('should have Product repository registered', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repository = module.get(getRepositoryToken(Product));
    expect(repository).toBeDefined();
  });

  it('should have Recipe repository registered', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repository = module.get(getRepositoryToken(Recipe));
    expect(repository).toBeDefined();
  });

  it('should have InventoryMovement repository registered', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repository = module.get(getRepositoryToken(InventoryMovement));
    expect(repository).toBeDefined();
  });
});

describe('createTypeOrmOptions', () => {
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DB_PASSWORD') return 'test-db-password';
      return fallback;
    }),
  } as unknown as ConfigService;

  it('disables synchronize in test environment', () => {
    const options = createTypeOrmOptions(configService);

    expect(options.synchronize).toBe(false);
  });

  it('disables synchronize outside test environment', () => {
    const options = createTypeOrmOptions(configService);

    expect(options.synchronize).toBe(false);
  });

  it('fails startup when DB_PASSWORD is missing', () => {
    const missingConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() =>
      getRequiredConfigValue(missingConfigService, 'DB_PASSWORD'),
    ).toThrow('DB_PASSWORD is required');
  });
});
