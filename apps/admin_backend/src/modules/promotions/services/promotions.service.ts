import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { Promotion, PromotionType } from '../entities/promotion.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../../catalog/catalog-type';
import { Customer } from '../../customers/entities/customer.entity';
import { CreatePromotionDto } from '../dto/create-promotion.dto';
import { UpdatePromotionDto } from '../dto/update-promotion.dto';

/** A uuid string only — the same shape the DTOs enforce with @IsUUID. */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
    // One logical unit: the validation, the create and the save share this
    // transaction.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        await this.assertValidTargetCategory(manager, tenantId, dto);
        await this.assertValidTargetCustomer(manager, tenantId, dto);
        await this.assertUniqueCode(manager, tenantId, dto);
        this.assertConvenioRequiresCustomer(dto);
        const promotion = manager.getRepository(Promotion).create({
          ...dto,
          tenant_id: tenantId,
          is_active: true,
        });
        return manager.getRepository(Promotion).save(promotion);
      },
    );
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
        // Validated against the CURRENT dto value, inside the same
        // transaction that will persist it.
        await this.assertValidTargetCategory(manager, tenantId, dto);
        await this.assertValidTargetCustomer(manager, tenantId, dto);
        await this.assertUniqueCode(manager, tenantId, dto, id);
        this.assertConvenioRequiresCustomer(dto);
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
   * T0.5'a: target_category_id is a uuid FK to catalog_values(tenant_id,
   * id). The composite FK alone does NOT restrict the catalog type —
   * catalog_values is shared by four catalog types — so this guard enforces
   * the SALES_PRODUCT_CATEGORY restriction at the service layer, inside the
   * same tenant-bound transaction that persists the promotion.
   *
   * Rejections are 4xx, never a silent ignore, and a foreign tenant's id,
   * another catalog type's id and a nonexistent id all fail with the SAME
   * message: the lookup is tenant-scoped, so nothing here reveals whether a
   * uuid exists under a different tenant (no cross-tenant existence
   * oracle).
   */
  private async assertValidTargetCategory(
    manager: EntityManager,
    tenantId: string,
    dto: CreatePromotionDto | UpdatePromotionDto,
  ): Promise<void> {
    const targetCategoryId = dto.target_category_id;
    // T0.5'd: an explicit null means "no category target" exactly like
    // undefined — global on create, clear on update — and skips the guard.
    // An empty string is still rejected below: it is the blank-target trap
    // T0.5'a protects against, never a valid target.
    if (targetCategoryId === undefined || targetCategoryId === null) {
      return;
    }
    if (!UUID_PATTERN.test(targetCategoryId)) {
      throw new BadRequestException(
        'target_category_id must be a UUID referencing a product category',
      );
    }
    const catalogValue = await manager.getRepository(CatalogValue).findOne({
      where: {
        id: targetCategoryId,
        tenant_id: tenantId,
        catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
      },
    });
    if (!catalogValue) {
      throw new BadRequestException(
        `target_category_id ${targetCategoryId} is not a product category of this tenant`,
      );
    }
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

  /**
   * Valida que, si se asigna un target_customer_id, exista un Customer activo
   * en el mismo tenant. El lookup es tenant-scoped: nunca revela si un uuid
   * pertenece a otro tenant.
   */
  private async assertValidTargetCustomer(
    manager: EntityManager,
    tenantId: string,
    dto: CreatePromotionDto | UpdatePromotionDto,
  ): Promise<void> {
    const customerId = dto.target_customer_id;
    if (customerId === undefined || customerId === null) {
      return;
    }
    if (!UUID_PATTERN.test(customerId)) {
      throw new BadRequestException(
        'target_customer_id must be a UUID referencing a customer',
      );
    }
    const customer = await manager.getRepository(Customer).findOne({
      where: {
        id: customerId,
        tenant_id: tenantId,
        is_active: true,
      },
    });
    if (!customer) {
      throw new BadRequestException(
        `target_customer_id ${customerId} is not an active customer of this tenant`,
      );
    }
  }

  /**
   * Valida que el código (`code`) sea único dentro del tenant. En update se
   * excluye la propia promoción (`excludeId`) para permitir re-guardar sin
   * cambios.
   */
  private async assertUniqueCode(
    manager: EntityManager,
    tenantId: string,
    dto: CreatePromotionDto | UpdatePromotionDto,
    excludeId?: string,
  ): Promise<void> {
    const code = dto.code;
    if (code === undefined || code === null || code === '') {
      return;
    }
    const where: Record<string, unknown> = { tenant_id: tenantId, code };
    if (excludeId) {
      // typeorm no soporta "id != excludeId" directamente en where simple;
      // consultamos y descartamos la propia fila.
    }
    const existing = await manager.getRepository(Promotion).findOne({
      where,
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(
        `The code "${code}" is already used by another promotion in this tenant`,
      );
    }
  }

  /**
   * Cuando el tipo es CONVENIO o restriction_type es 'customer', se requiere
   * un target_customer_id. Sin él la promoción no sabe a quién aplicar el
   * descuento del convenio.
   */
  private assertConvenioRequiresCustomer(
    dto: CreatePromotionDto | UpdatePromotionDto,
  ): void {
    const isConvenio = dto.type === PromotionType.CONVENIO;
    const isCustomerRestricted = dto.restriction_type === 'customer';
    if (isConvenio || isCustomerRestricted) {
      if (!dto.target_customer_id) {
        throw new BadRequestException(
          'A convenio/customer-restricted promotion requires a target_customer_id',
        );
      }
    }
  }
}
