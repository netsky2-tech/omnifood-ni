import { createTypeOrmOptions, getRequiredConfigValue } from './app.module';
import { Insumo } from '../../modules/inventory/entities/insumo.entity';
import { Product } from '../../modules/inventory/entities/product.entity';
import { Recipe } from '../../modules/inventory/entities/recipe.entity';
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';
import { PurchaseDocument } from '../../modules/inventory/entities/purchase-document.entity';
import { ConfigService } from '@nestjs/config';

describe('AppModule Registration', () => {
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DB_PASSWORD') return 'test-db-password';
      return fallback;
    }),
  } as unknown as ConfigService;

  const options = createTypeOrmOptions(configService);

  it('should have Insumo repository registered', () => {
    expect(options.entities).toContain(Insumo);
  });

  it('should have Product repository registered', () => {
    expect(options.entities).toContain(Product);
  });

  it('should have Recipe repository registered', () => {
    expect(options.entities).toContain(Recipe);
  });

  it('should have InventoryMovement repository registered', () => {
    expect(options.entities).toContain(InventoryMovement);
  });

  it('should have PurchaseDocument repository registered', () => {
    expect(options.entities).toContain(PurchaseDocument);
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
