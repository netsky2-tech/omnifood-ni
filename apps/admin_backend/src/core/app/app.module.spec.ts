import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { createTypeOrmOptions } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Insumo } from '../../modules/inventory/entities/insumo.entity';
import { Product } from '../../modules/inventory/entities/product.entity';
import { Recipe } from '../../modules/inventory/entities/recipe.entity';
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';
import { ConfigService } from '@nestjs/config';

describe('AppModule Registration', () => {
  let module: TestingModule;

  beforeAll(async () => {
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
    get: jest.fn((key: string, fallback?: unknown) => fallback),
  } as unknown as ConfigService;

  it('disables synchronize in test environment', () => {
    const options = createTypeOrmOptions(configService, 'test');

    expect(options.synchronize).toBe(false);
  });

  it('enables synchronize outside test environment', () => {
    const options = createTypeOrmOptions(configService, 'development');

    expect(options.synchronize).toBe(true);
  });
});
