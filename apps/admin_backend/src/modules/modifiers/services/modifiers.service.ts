import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { ModifierGroup } from '../entities/modifier-group.entity';
import { ModifierOption } from '../entities/modifier-option.entity';
import { CategoryModifierGroup } from '../entities/category-modifier-group.entity';
import { ProductModifierGroup } from '../entities/product-modifier-group.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../../catalog/catalog-type';
import { Product } from '../../inventory/entities/product.entity';
import { CreateModifierGroupDto } from '../dto/create-modifier-group.dto';
import { UpdateModifierGroupDto } from '../dto/update-modifier-group.dto';
import { CreateModifierOptionDto } from '../dto/create-modifier-option.dto';
import { UpdateModifierOptionDto } from '../dto/update-modifier-option.dto';
import {
  AttachCategoryDto,
  AttachProductDto,
} from '../dto/attach-modifier-group.dto';

/** A uuid string only — the same shape the DTOs enforce with @IsUUID. */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Query filters for listing groups: at most one attachment filter. */
export interface ModifierGroupFilters {
  category_id?: string;
  product_id?: string;
}

/** A group enriched with its active options, the API read shape. */
export interface ModifierGroupWithOption extends ModifierGroup {
  options: ModifierOption[];
}

@Injectable()
export class ModifiersService {
  constructor(
    @InjectRepository(ModifierGroup)
    private readonly modifierGroupRepository: Repository<ModifierGroup>,
    // Manager-based access only: like promotions, every operation runs
    // inside the tenant-bound transaction, so these pooled repositories
    // stay declared for Nest DI compatibility only.
    @InjectRepository(ModifierOption)
    private readonly modifierOptionRepository: Repository<ModifierOption>,
    @InjectRepository(CategoryModifierGroup)
    private readonly categoryAttachmentRepository: Repository<CategoryModifierGroup>,
    @InjectRepository(ProductModifierGroup)
    private readonly productAttachmentRepository: Repository<ProductModifierGroup>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    tenantId: string,
    filters: ModifierGroupFilters = {},
  ): Promise<ModifierGroupWithOption[]> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.findActiveGroupsWithOptions(manager, tenantId, filters),
    );
  }

  async findOne(
    tenantId: string,
    id: string,
  ): Promise<ModifierGroupWithOption> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const group = await this.findActiveGroupById(manager, tenantId, id);
        const options = await this.findActiveOptionsOfGroups(
          manager,
          tenantId,
          [group.id],
        );
        return { ...group, options };
      },
    );
  }

  async createGroup(
    tenantId: string,
    dto: CreateModifierGroupDto,
  ): Promise<ModifierGroup> {
    // One logical unit: validation, duplicate check and create share the
    // transaction.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const name = this.requireNonBlankName(dto.name);
        const minSelected = dto.min_selected ?? 0;
        const maxSelected = dto.max_selected ?? 1;
        this.assertSelectionRange(minSelected, maxSelected);
        await this.assertGroupNameAvailable(manager, tenantId, name);
        const group = manager.getRepository(ModifierGroup).create({
          name,
          min_selected: minSelected,
          max_selected: maxSelected,
          allow_quantities: dto.allow_quantities ?? false,
          sort_order: dto.sort_order ?? 0,
          tenant_id: tenantId,
          is_active: true,
        });
        return manager.getRepository(ModifierGroup).save(group);
      },
    );
  }

  async updateGroup(
    tenantId: string,
    id: string,
    dto: UpdateModifierGroupDto,
  ): Promise<ModifierGroup> {
    // One logical unit: the read and the save share this transaction. The
    // lookup does NOT filter is_active so a soft-deleted group can be
    // reactivated by passing is_active=true.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const group = await this.findGroupById(manager, tenantId, id);
        if (dto.name !== undefined) {
          const name = this.requireNonBlankName(dto.name);
          await this.assertGroupNameAvailable(manager, tenantId, name, id);
          dto.name = name;
        }
        // Validate against the MERGED values inside the same transaction
        // that will persist them (mirrors chk_modifier_groups_max_gte_min).
        const minSelected = dto.min_selected ?? group.min_selected;
        const maxSelected = dto.max_selected ?? group.max_selected;
        this.assertSelectionRange(minSelected, maxSelected);
        Object.assign(group, dto);
        return manager.getRepository(ModifierGroup).save(group);
      },
    );
  }

  async removeGroup(tenantId: string, id: string): Promise<void> {
    // Soft delete via is_active. Attachments are intentionally left in
    // place: inactive groups stop resolving downstream (T1.3 filters
    // is_active), while the junction rows preserve history and can be
    // reattached by reactivating the group.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const group = await this.findGroupById(manager, tenantId, id);
        group.is_active = false;
        await manager.getRepository(ModifierGroup).save(group);
      },
    );
  }

  async createOption(
    tenantId: string,
    groupId: string,
    dto: CreateModifierOptionDto,
  ): Promise<ModifierOption> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const group = await this.findActiveGroupById(
          manager,
          tenantId,
          groupId,
        );
        const name = this.requireNonBlankName(dto.name);
        // Single-default invariant: when the new option is the default,
        // every sibling in the group loses its default in the SAME
        // transaction, so contradictory multi-default state cannot exist.
        if (dto.is_default) {
          await this.clearSiblingDefaults(manager, tenantId, group.id);
        }
        const option = manager.getRepository(ModifierOption).create({
          name,
          price_delta: dto.price_delta ?? 0,
          is_default: dto.is_default ?? false,
          sort_order: dto.sort_order ?? 0,
          tenant_id: tenantId,
          group_id: group.id,
          is_active: true,
        });
        return manager.getRepository(ModifierOption).save(option);
      },
    );
  }

  async updateOption(
    tenantId: string,
    groupId: string,
    optionId: string,
    dto: UpdateModifierOptionDto,
  ): Promise<ModifierOption> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        await this.findActiveGroupById(manager, tenantId, groupId);
        const option = await this.findOptionById(
          manager,
          tenantId,
          groupId,
          optionId,
        );
        if (dto.name !== undefined) {
          dto.name = this.requireNonBlankName(dto.name);
        }
        // Single-default invariant: making this option the default clears
        // every OTHER sibling (self is excluded) in the same transaction.
        if (dto.is_default) {
          await this.clearSiblingDefaults(
            manager,
            tenantId,
            groupId,
            option.id,
          );
        }
        Object.assign(option, dto);
        return manager.getRepository(ModifierOption).save(option);
      },
    );
  }

  async removeOption(
    tenantId: string,
    groupId: string,
    optionId: string,
  ): Promise<void> {
    // Soft delete via is_active, same doctrine as removeGroup.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        await this.findActiveGroupById(manager, tenantId, groupId);
        const option = await this.findOptionById(
          manager,
          tenantId,
          groupId,
          optionId,
        );
        option.is_active = false;
        await manager.getRepository(ModifierOption).save(option);
      },
    );
  }

  async attachCategory(
    tenantId: string,
    groupId: string,
    dto: AttachCategoryDto,
  ): Promise<CategoryModifierGroup> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const group = await this.findActiveGroupById(
          manager,
          tenantId,
          groupId,
        );
        // Idempotent attach: an existing junction row is returned as-is,
        // never an error.
        const existing = await manager
          .getRepository(CategoryModifierGroup)
          .findOne({
            where: {
              tenant_id: tenantId,
              group_id: group.id,
              catalog_value_id: dto.catalog_value_id,
            },
          });
        if (existing) {
          return existing;
        }
        await this.assertValidTargetCategory(
          manager,
          tenantId,
          dto.catalog_value_id,
        );
        const attachment = manager.getRepository(CategoryModifierGroup).create({
          tenant_id: tenantId,
          group_id: group.id,
          catalog_value_id: dto.catalog_value_id,
          sort_order: dto.sort_order ?? 0,
        });
        return manager.getRepository(CategoryModifierGroup).save(attachment);
      },
    );
  }

  async detachCategory(
    tenantId: string,
    groupId: string,
    catalogValueId: string,
  ): Promise<void> {
    // Hard DELETE of the junction row (it has no is_active column) and
    // idempotent: deleting zero rows is still a success.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        await manager.getRepository(CategoryModifierGroup).delete({
          tenant_id: tenantId,
          group_id: groupId,
          catalog_value_id: catalogValueId,
        });
      },
    );
  }

  async attachProduct(
    tenantId: string,
    groupId: string,
    dto: AttachProductDto,
  ): Promise<ProductModifierGroup> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const group = await this.findActiveGroupById(
          manager,
          tenantId,
          groupId,
        );
        // Idempotent attach: an existing junction row is returned as-is,
        // never an error.
        const existing = await manager
          .getRepository(ProductModifierGroup)
          .findOne({
            where: {
              tenant_id: tenantId,
              group_id: group.id,
              product_id: dto.product_id,
            },
          });
        if (existing) {
          return existing;
        }
        await this.assertValidTargetProduct(manager, tenantId, dto.product_id);
        const attachment = manager.getRepository(ProductModifierGroup).create({
          tenant_id: tenantId,
          group_id: group.id,
          product_id: dto.product_id,
          sort_order: dto.sort_order ?? 0,
        });
        return manager.getRepository(ProductModifierGroup).save(attachment);
      },
    );
  }

  async detachProduct(
    tenantId: string,
    groupId: string,
    productId: string,
  ): Promise<void> {
    // Hard DELETE of the junction row (it has no is_active column) and
    // idempotent: deleting zero rows is still a success.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        await manager.getRepository(ProductModifierGroup).delete({
          tenant_id: tenantId,
          group_id: groupId,
          product_id: productId,
        });
      },
    );
  }

  /**
   * Manager-based read used inside an already-bound transaction. Every
   * `where` keeps the explicit `tenant_id` filter: binding is additive, it
   * never replaces the per-query tenant scoping.
   */
  private async findActiveGroupsWithOptions(
    manager: EntityManager,
    tenantId: string,
    filters: ModifierGroupFilters,
  ): Promise<ModifierGroupWithOption[]> {
    let groupIds: string[] | undefined;
    if (filters.category_id !== undefined) {
      this.assertUuid(filters.category_id, 'category_id');
      const attachments = await manager
        .getRepository(CategoryModifierGroup)
        .find({
          where: {
            tenant_id: tenantId,
            catalog_value_id: filters.category_id,
          },
        });
      groupIds = attachments.map((attachment) => attachment.group_id);
    } else if (filters.product_id !== undefined) {
      this.assertUuid(filters.product_id, 'product_id');
      const attachments = await manager
        .getRepository(ProductModifierGroup)
        .find({
          where: { tenant_id: tenantId, product_id: filters.product_id },
        });
      groupIds = attachments.map((attachment) => attachment.group_id);
    }

    const groups = await manager.getRepository(ModifierGroup).find({
      where: {
        tenant_id: tenantId,
        is_active: true,
        ...(groupIds ? { id: In(groupIds) } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
    if (groups.length === 0) {
      return [];
    }
    const options = await this.findActiveOptionsOfGroups(
      manager,
      tenantId,
      groups.map((group) => group.id),
    );
    const optionsByGroup = new Map<string, ModifierOption[]>();
    for (const option of options) {
      const list = optionsByGroup.get(option.group_id) ?? [];
      list.push(option);
      optionsByGroup.set(option.group_id, list);
    }
    return groups.map((group) => ({
      ...group,
      options: optionsByGroup.get(group.id) ?? [],
    }));
  }

  private async findActiveOptionsOfGroups(
    manager: EntityManager,
    tenantId: string,
    groupIds: string[],
  ): Promise<ModifierOption[]> {
    return manager.getRepository(ModifierOption).find({
      where: { tenant_id: tenantId, is_active: true, group_id: In(groupIds) },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
  }

  private async findActiveGroupById(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<ModifierGroup> {
    const group = await manager.getRepository(ModifierGroup).findOne({
      where: { id, tenant_id: tenantId, is_active: true },
    });
    if (!group) {
      throw new NotFoundException(`Modifier group with ID ${id} not found`);
    }
    return group;
  }

  private async findGroupById(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<ModifierGroup> {
    const group = await manager.getRepository(ModifierGroup).findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!group) {
      throw new NotFoundException(`Modifier group with ID ${id} not found`);
    }
    return group;
  }

  private async findOptionById(
    manager: EntityManager,
    tenantId: string,
    groupId: string,
    optionId: string,
  ): Promise<ModifierOption> {
    const option = await manager.getRepository(ModifierOption).findOne({
      where: { id: optionId, tenant_id: tenantId, group_id: groupId },
    });
    if (!option) {
      throw new NotFoundException(
        `Modifier option with ID ${optionId} not found in group ${groupId}`,
      );
    }
    return option;
  }

  /**
   * Mirrors the DB check `chk_modifier_groups_max_gte_min` at the service
   * layer (same doctrine as the promotions guard): the migration SQL is the
   * contract, the service mirrors it so callers get a clean 400 instead of
   * a 500 from the database rejecting the write.
   */
  private assertSelectionRange(minSelected: number, maxSelected: number): void {
    if (minSelected < 0 || maxSelected < 1 || maxSelected < minSelected) {
      throw new BadRequestException(
        'min_selected must be >= 0, max_selected must be >= 1, and max_selected must be >= min_selected',
      );
    }
  }

  private requireNonBlankName(name: string): string {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BadRequestException('name must not be blank');
    }
    return trimmed;
  }

  /**
   * Pre-check for the unique (tenant_id, name) constraint so a duplicate
   * group name is a clean 4xx (ConflictException, the catalog doctrine)
   * instead of letting PostgreSQL throw 23505 → 500. On update, the id of
   * the group being renamed is excluded so renaming to the SAME name is
   * allowed.
   */
  private async assertGroupNameAvailable(
    manager: EntityManager,
    tenantId: string,
    name: string,
    excludeGroupId?: string,
  ): Promise<void> {
    const existing = await manager.getRepository(ModifierGroup).findOne({
      where: { tenant_id: tenantId, name },
    });
    if (existing && existing.id !== excludeGroupId) {
      throw new ConflictException(
        `Modifier group with name "${name}" already exists`,
      );
    }
  }

  /**
   * Single-default invariant: at most one default option per group.
   *
   * R4-001: the sibling clear is an unlocked UPDATE, so under READ
   * COMMITTED two concurrent `is_default=true` writers could each miss the
   * other's uncommitted default and both commit. To serialize them, this
   * method FIRST takes a transaction-scoped pessimistic_write lock on the
   * parent group row: the second transaction blocks until the first
   * commits, and its trailing UPDATE (per-statement snapshot) then sees
   * and clears the committed default. Only the `is_default=true` paths
   * call this, and every caller locks the group row first (group-row-first
   * lock ordering), so no deadlock is possible.
   */
  private async clearSiblingDefaults(
    manager: EntityManager,
    tenantId: string,
    groupId: string,
    excludeOptionId?: string,
  ): Promise<void> {
    // Serialize default mutations per group before touching siblings.
    await manager.getRepository(ModifierGroup).findOne({
      where: { id: groupId, tenant_id: tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    await manager.getRepository(ModifierOption).update(
      {
        tenant_id: tenantId,
        group_id: groupId,
        is_default: true,
        ...(excludeOptionId ? { id: Not(excludeOptionId) } : {}),
      },
      { is_default: false },
    );
  }

  /**
   * Same doctrine as the promotions assertValidTargetCategory: the
   * referenced catalog_values row must exist in this tenant AND have
   * catalog_type = SALES_PRODUCT_CATEGORY. Foreign-tenant ids, other
   * catalog types and nonexistent ids all fail with the SAME message — the
   * lookup is tenant-scoped, so this is never a cross-tenant existence
   * oracle.
   */
  private async assertValidTargetCategory(
    manager: EntityManager,
    tenantId: string,
    catalogValueId: string,
  ): Promise<void> {
    this.assertUuid(catalogValueId, 'catalog_value_id');
    const catalogValue = await manager.getRepository(CatalogValue).findOne({
      where: {
        id: catalogValueId,
        tenant_id: tenantId,
        catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
      },
    });
    if (!catalogValue) {
      throw new BadRequestException(
        `catalog_value_id ${catalogValueId} is not a product category of this tenant`,
      );
    }
  }

  /**
   * Same doctrine as assertValidTargetCategory: nonexistent and
   * foreign-tenant products are indistinguishable (one message, no
   * cross-tenant existence oracle).
   */
  private async assertValidTargetProduct(
    manager: EntityManager,
    tenantId: string,
    productId: string,
  ): Promise<void> {
    this.assertUuid(productId, 'product_id');
    const product = await manager.getRepository(Product).findOne({
      where: { id: productId, tenant_id: tenantId },
    });
    if (!product) {
      throw new BadRequestException(
        `product_id ${productId} is not a product of this tenant`,
      );
    }
  }

  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value ?? '')) {
      throw new BadRequestException(`${field} must be a valid UUID`);
    }
  }
}
