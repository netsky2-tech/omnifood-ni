import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Insumo } from '../../modules/inventory/entities/insumo.entity';
import { Product } from '../../modules/inventory/entities/product.entity';
import { Recipe } from '../../modules/inventory/entities/recipe.entity';
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';

describe('AppModule Registration', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  }, 15000);

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
