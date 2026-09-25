import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { Promotion } from '../entities/promotion.entity';
import { CreatePromotionDto } from '../dto/create-promotion.dto';
import { UpdatePromotionDto } from '../dto/update-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepository: Repository<Promotion>,
    // Issue #512 slice 6: the promotions table is tenant-RLS protected, so
    // the tenant-bound transaction manager is the only access path to it;
    // the pooled repository above stays declared for Nest DI compatibility
    // only.
    private readonly dataSource: DataSource,
  ) {}

  async findAll(tenantId: string): Promise<Promotion[]> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.findActiveByTenant(manager, tenantId),
    );
  }

  async findOne(tenantId: string, id: string): Promise<Promotion> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.findPromotionById(manager, tenantId, id),
    );
  }

  async create(tenantId: string, dto: CreatePromotionDto): Promise<Promotion> {
    // One logical unit: the create and the save share this transaction.
    return runInTenantTransaction(this.dataSource, tenantId, (manager) => {
      const promotion = manager.getRepository(Promotion).create({
        ...dto,
        tenant_id: tenantId,
        is_active: true,
      });
      return manager.getRepository(Promotion).save(promotion);
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePromotionDto,
  ): Promise<Promotion> {
    // One logical unit: the read and the save share this transaction. The
    // lookup uses the manager-based helper directly, never the public read
    // method, because a tenant-bound transaction is never nested inside
    // another one.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const promotion = await this.findPromotionById(manager, tenantId, id);
        Object.assign(promotion, dto);
        return manager.getRepository(Promotion).save(promotion);
      },
    );
  }

  async remove(tenantId: string, id: string): Promise<void> {
    // Soft delete via is_active: the read and the save share this
    // transaction, same manager-based helper as update.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const promotion = await this.findPromotionById(manager, tenantId, id);
        promotion.is_active = false;
        await manager.getRepository(Promotion).save(promotion);
      },
    );
  }

  /**
   * Manager-based read used inside an already-bound transaction. Every
   * `where` keeps the explicit `tenant_id` filter: binding is additive, it
   * never replaces the per-query tenant scoping.
   */
  private async findActiveByTenant(
    manager: EntityManager,
    tenantId: string,
  ): Promise<Promotion[]> {
    return manager.getRepository(Promotion).find({
      where: { tenant_id: tenantId, is_active: true },
      order: { priority: 'DESC', created_at: 'DESC' },
    });
  }

  private async findPromotionById(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<Promotion> {
    const promotion = await manager.getRepository(Promotion).findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!promotion) {
      throw new NotFoundException(`Promotion with ID ${id} not found`);
    }
    return promotion;
  }
}
