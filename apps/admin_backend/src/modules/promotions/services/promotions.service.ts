import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promotion } from '../entities/promotion.entity';
import { CreatePromotionDto } from '../dto/create-promotion.dto';
import { UpdatePromotionDto } from '../dto/update-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepository: Repository<Promotion>,
  ) {}

  async findAll(tenantId: string): Promise<Promotion[]> {
    return this.promotionRepository.find({
      where: { tenant_id: tenantId, is_active: true },
      order: { priority: 'DESC', created_at: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Promotion> {
    const promotion = await this.promotionRepository.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!promotion) {
      throw new NotFoundException(`Promotion with ID ${id} not found`);
    }
    return promotion;
  }

  async create(tenantId: string, dto: CreatePromotionDto): Promise<Promotion> {
    const promotion = this.promotionRepository.create({
      ...dto,
      tenant_id: tenantId,
      is_active: true,
    });
    return this.promotionRepository.save(promotion);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePromotionDto,
  ): Promise<Promotion> {
    const promotion = await this.findOne(tenantId, id);
    Object.assign(promotion, dto);
    return this.promotionRepository.save(promotion);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const promotion = await this.findOne(tenantId, id);
    promotion.is_active = false;
    await this.promotionRepository.save(promotion);
  }
}
