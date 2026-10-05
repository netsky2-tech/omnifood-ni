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

/** One option in an effective-group response (T1.3). */
export interface EffectiveModifierOption {
  id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
}

/**
 * One effective modifier group for a product (T1.3). Position in the
 * response array IS the deterministic order — there is deliberately no
 * group-level sort_order field; only options carry their own sort_order.
 */
export interface EffectiveModifierGroup {
  group_id: string;
  name: string;
  min_selected: number;
  max_selected: number;
  allow_quantities: boolean;
  source: 'category' | 'product';
  options: EffectiveModifierOption[];
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
   * T1.3: effective modifier-group resolution for a product — the union of
   * the groups inherited through the product's category (catalog_values
   * SALES_PRODUCT_CATEGORY via category_modifier_groups) and the explicit
   * per-product exceptions (product_modifier_groups).
   *
   * Resolution rules (fixed by the ODD task):
   * 1. Category side: products.category_code → the tenant's catalog row of
   *    type SALES_PRODUCT_CATEGORY with that code → its attachments. No
   *    category_code or no matching catalog row (legacy orphan) means an
   *    EMPTY inherited set — resolution never fails for that reason.
   * 2. Product side: product_modifier_groups rows for the product.
   * 3. Union with override: deduplicated by group_id; a group attached at
   *    BOTH levels appears ONCE with source 'product' (the explicit
   *    exception wins over inheritance).
   * 4. Ordering is deterministic: the source 'category' block first, then
   *    the 'product' block; each block ordered by its attachment's
   *    sort_order, then the group name, then the group id.
   * 5. Fail-closed filtering: only is_active groups and is_active options
   *    resolve; an inactive attached group simply drops out. OPTIONS carry
   *    no source and keep their own sort_order in the payload — position
   *    in the array IS the order, so the response has no separate sort
   *    field for the groups (their position encodes it).
   */
  async getEffectiveGroups(
    tenantId: string,
    productId: string,
  ): Promise<EffectiveModifierGroup[]> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.resolveEffectiveGroups(manager, tenantId, productId),
    );
  }

  /**
   * Manager-based read used inside an already-bound transaction. Every
   * `where` keeps the explicit `tenant_id` filter: binding is additive, it
   * never replaces the per-query tenant scoping. Group and option loads
   * are batched with `In(...)` — two queries total, never a loop per row.
   */
  private async resolveEffectiveGroups(
    manager: EntityManager,
    tenantId: string,
    productId: string,
  ): Promise<EffectiveModifierGroup[]> {
    this.assertUuid(productId, 'product_id');
    const product = await manager.getRepository(Product).findOne({
      where: { id: productId, tenant_id: tenantId },
    });
    // Same doctrine as the T1.2 guards: nonexistent and foreign-tenant
    // products are indistinguishable — one message, no existence oracle.
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Category side (inherited). A legacy orphan category_code resolves an
    // empty inherited set instead of failing the whole read.
    let categoryAttachments: CategoryModifierGroup[] = [];
    if (product.category_code) {
      const catalogValue = await manager.getRepository(CatalogValue).findOne({
        where: {
          tenant_id: tenantId,
          code: product.category_code,
          catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
        },
      });
      if (catalogValue) {
        categoryAttachments = await manager
          .getRepository(CategoryModifierGroup)
          .find({
            where: {
              tenant_id: tenantId,
              catalog_value_id: catalogValue.id,
            },
          });
      }
    }

    // Product side (explicit exceptions).
    const productAttachments = await manager
      .getRepository(ProductModifierGroup)
      .find({ where: { tenant_id: tenantId, product_id: productId } });

    // Override rule: a group attached at BOTH levels resolves through the
    // product side only, so it is dropped from the inherited block.
    const productGroupIds = new Set(
      productAttachments.map((attachment) => attachment.group_id),
    );
    const inheritedAttachments = categoryAttachments.filter(
      (attachment) => !productGroupIds.has(attachment.group_id),
    );

    const effectiveAttachments = [
      ...inheritedAttachments,
      ...productAttachments,
    ];
    if (effectiveAttachments.length === 0) {
      return [];
    }
    const groupIds = [
      ...new Set(effectiveAttachments.map((attachment) => attachment.group_id)),
    ];

    // Fail-closed: the is_active filter drops inactive groups here, before
    // any ordering, so an inactive attached group resolves to nothing.
    const groups = await manager.getRepository(ModifierGroup).find({
      where: { tenant_id: tenantId, is_active: true, id: In(groupIds) },
    });
    const groupById = new Map(groups.map((group) => [group.id, group]));

    // Fail-closed for options too, batched in one In(...) query.
    const options = await manager.getRepository(ModifierOption).find({
      where: { tenant_id: tenantId, is_active: true, group_id: In(groupIds) },
      order: { sort_order: 'ASC', name: 'ASC', id: 'ASC' },
    });
    const optionsByGroup = new Map<string, ModifierOption[]>();
    for (const option of options) {
      const list = optionsByGroup.get(option.group_id) ?? [];
      list.push(option);
      optionsByGroup.set(option.group_id, list);
    }

    // Block ordering: attachment sort_order, then group name, then group
    // id. Attachments whose group did not survive the is_active filter
    // drop out here (fail-closed), never throw.
    const buildBlock = (
      attachments: CategoryModifierGroup[] | ProductModifierGroup[],
      source: EffectiveModifierGroup['source'],
    ): EffectiveModifierGroup[] =>
      attachments
        .filter((attachment) => groupById.has(attachment.group_id))
        .sort((a, b) => {
          const groupA = groupById.get(a.group_id);
          const groupB = groupById.get(b.group_id);
          const bySortOrder = a.sort_order - b.sort_order;
          if (bySortOrder !== 0) {
            return bySortOrder;
          }
          const byName = (groupA?.name ?? '').localeCompare(groupB?.name ?? '');
          if (byName !== 0) {
            return byName;
          }
          return (groupA?.id ?? '').localeCompare(groupB?.id ?? '');
        })
        .map((attachment) => {
          const resolved = groupById.get(attachment.group_id);
          if (!resolved) {
            // Unreachable after the filter above; keeps the types honest
            // without non-null assertions.
            throw new NotFoundException(
              `Modifier group with ID ${attachment.group_id} not found`,
            );
          }
          return {
            group_id: resolved.id,
            name: resolved.name,
            min_selected: resolved.min_selected,
            max_selected: resolved.max_selected,
            allow_quantities: resolved.allow_quantities,
            source,
            options: (optionsByGroup.get(resolved.id) ?? []).map(
              (option): EffectiveModifierOption => ({
                id: option.id,
                name: option.name,
                price_delta: option.price_delta,
                is_default: option.is_default,
                sort_order: option.sort_order,
              }),
            ),
          };
        });

    return [
      ...buildBlock(inheritedAttachments, 'category'),
      ...buildBlock(productAttachments, 'product'),
    ];
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
