import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { Promotion, PromotionType } from '../entities/promotion.entity';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const mockPromotion = (overrides: Partial<Promotion> = {}): Promotion =>
    ({
      id: 'promo-uuid-1',
      tenant_id: 'tenant-1',
      name: '2x1 Cerveza Toña',
      type: PromotionType.BUY_X_GET_Y_FREE,
      target_product_id: 'prod-beer',
      buy_quantity: 1,
      get_quantity: 1,
      discount_value: 0,
      min_order_amount: 0,
      priority: 10,
      is_stackable: true,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }) as Promotion;

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([mockPromotion()]),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as Promotion),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionsService,
        {
          provide: getRepositoryToken(Promotion),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get<PromotionsService>(PromotionsService);
  });

  it('should find all active promotions for a tenant', async () => {
    const list = await service.findAll('tenant-1');
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('2x1 Cerveza Toña');
    expect(repo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', is_active: true },
      order: { priority: 'DESC', created_at: 'DESC' },
    });
  });

  it('should find promotion by id and tenant', async () => {
    repo.findOne.mockResolvedValue(mockPromotion());
    const promo = await service.findOne('tenant-1', 'promo-uuid-1');
    expect(promo.id).toBe('promo-uuid-1');
  });

  it('should throw NotFoundException when promotion not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('tenant-1', 'non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should create new promotion with tenant context', async () => {
    const dto = {
      name: '15% Descuento Bebidas',
      type: PromotionType.PERCENTAGE_DISCOUNT,
      target_category_id: 'Bebidas',
      discount_value: 15,
      priority: 5,
    };
    const created = await service.create('tenant-1', dto);
    expect(created.name).toBe('15% Descuento Bebidas');
    expect(created.tenant_id).toBe('tenant-1');
    expect(created.is_active).toBe(true);
  });

  it('should update promotion', async () => {
    repo.findOne.mockResolvedValue(mockPromotion());
    const updated = await service.update('tenant-1', 'promo-uuid-1', {
      priority: 20,
    });
    expect(updated.priority).toBe(20);
  });

  it('should soft delete promotion (is_active = false)', async () => {
    const promo = mockPromotion();
    repo.findOne.mockResolvedValue(promo);
    await service.remove('tenant-1', 'promo-uuid-1');
    expect(promo.is_active).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(promo);
  });
});
