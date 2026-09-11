import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { ProductInventoryMappingVersion } from '../entities/product-inventory-mapping-version.entity';

export interface SupersedeProductInventoryMapping {
  tenantId: string;
  productId: string;
  insumoId: string;
  effectiveAt: Date;
}

@Injectable()
export class ProductInventoryMappingService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Look up the effective mapping version for a given product at a specific timestamp.
   * Prohibits productId == insumoId inference: mappings must explicitly exist.
   */
  async findEffective(tenantId: string, productId: string, effectiveAt: Date): Promise<ProductInventoryMappingVersion | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const repository = queryRunner.manager.getRepository(ProductInventoryMappingVersion);
      const mapping = await repository.createQueryBuilder('mapping')
        .where('mapping.tenant_id = :tenantId', { tenantId })
        .andWhere('mapping.product_id = :productId', { productId })
        .andWhere('mapping.effective_at <= :effectiveAt', { effectiveAt })
        .andWhere('(mapping.superseded_at IS NULL OR mapping.superseded_at > :effectiveAt)', { effectiveAt })
        .orderBy('mapping.effective_at', 'DESC')
        .getOne();
      return mapping;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Atomically supersede the active mapping version for a product.
   * Uses advisory xact lock to serialize concurrent first-write creation,
   * closes any active version with superseded_at, and retains all history.
   */
  async supersede(command: SupersedeProductInventoryMapping): Promise<ProductInventoryMappingVersion> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [command.tenantId]);
      // Advisory transaction lock prevents concurrent first-mapping races
      await queryRunner.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        command.tenantId,
        command.productId,
      ]);

      const repository = queryRunner.manager.getRepository(ProductInventoryMappingVersion);
      const active = await repository.findOne({
        where: { tenant_id: command.tenantId, product_id: command.productId, superseded_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      if (active && command.effectiveAt <= active.effective_at) {
        throw new Error('Mapping effectiveAt must be after the active mapping');
      }

      if (active) {
        active.superseded_at = command.effectiveAt;
        await repository.save(active);
      }

      const newVersion = repository.create({
        tenant_id: command.tenantId,
        product_id: command.productId,
        insumo_id: command.insumoId,
        effective_at: command.effectiveAt,
        superseded_at: null,
      });

      const saved = await repository.save(newVersion);
      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
