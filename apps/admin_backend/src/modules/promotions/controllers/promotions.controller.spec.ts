import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from '../services/promotions.service';
import { Promotion, PromotionType } from '../entities/promotion.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';

describe('PromotionsController', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let controller: PromotionsController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const mockPromotion = (overrides: Partial<Promotion> = {}): Promotion =>
    ({
      id: 'p-1',
      tenant_id: 'tenant-1',
      name: 'Promo Test',
      type: PromotionType.BUY_X_GET_Y_FREE,
      target_product_id: 'prod-1',
      buy_quantity: 1,
      get_quantity: 1,
      is_active: true,
      ...overrides,
    }) as Promotion;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([mockPromotion()]),
      findOne: jest.fn().mockResolvedValue(mockPromotion()),
      create: jest.fn().mockResolvedValue(mockPromotion()),
      update: jest.fn().mockResolvedValue(mockPromotion({ name: 'Actualizada' })),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [PromotionsController],
      providers: [
        Reflector,
        AuthGuard,
        RolesGuard,
        {
          provide: PromotionsService,
          useValue: service,
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'test',
            JWT_SECRET: jwtSecret,
            JWT_ISSUER: 'omnifood-admin',
            JWT_AUDIENCE: 'omnifood-pos',
            JWT_ACCESS_TTL_SECONDS: '3600',
            JWT_REFRESH_TTL_SECONDS: '604800',
            JWT_CLOCK_TOLERANCE_SECONDS: '5',
            JWT_ALGORITHM: 'HS256',
          }),
        },
      ],
    }).compile();

    controller = module.get<PromotionsController>(PromotionsController);
  });

  it('should return list of promotions for tenant', async () => {
    const list = await controller.findAll('tenant-1');
    expect(list.length).toBe(1);
    expect(service.findAll).toHaveBeenCalledWith('tenant-1');
  });

  it('should find one promotion by id', async () => {
    const promo = await controller.findOne('p-1', 'tenant-1');
    expect(promo.id).toBe('p-1');
    expect(service.findOne).toHaveBeenCalledWith('tenant-1', 'p-1');
  });

  it('should create promotion for tenant', async () => {
    const dto = {
      name: '2x1 Promo',
      type: PromotionType.BUY_X_GET_Y_FREE,
      target_product_id: 'prod-1',
      buy_quantity: 1,
      get_quantity: 1,
    };
    const created = await controller.create(dto, 'tenant-1');
    expect(created).toBeDefined();
    expect(service.create).toHaveBeenCalledWith('tenant-1', dto);
  });

  it('should update promotion', async () => {
    const dto = { name: 'Actualizada' };
    const updated = await controller.update('p-1', dto, 'tenant-1');
    expect(updated.name).toBe('Actualizada');
    expect(service.update).toHaveBeenCalledWith('tenant-1', 'p-1', dto);
  });

  it('should remove promotion', async () => {
    const res = await controller.remove('p-1', 'tenant-1');
    expect(res.success).toBe(true);
    expect(service.remove).toHaveBeenCalledWith('tenant-1', 'p-1');
  });
});
