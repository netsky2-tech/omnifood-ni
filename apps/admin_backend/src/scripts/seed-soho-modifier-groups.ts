import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../core/app/app.module';
import { runInTenantTransaction } from '../core/database/tenant-transaction';
import { CatalogValue } from '../modules/catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../modules/catalog/catalog-type';
import { Product } from '../modules/inventory/entities/product.entity';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { ModifierGroup } from '../modules/modifiers/entities/modifier-group.entity';
import { ModifierOption } from '../modules/modifiers/entities/modifier-option.entity';
import { CategoryModifierGroup } from '../modules/modifiers/entities/category-modifier-group.entity';

/**
 * SOHO hot-coffee modifier-group seeder (ODD task T4.3a).
 *
 * Data source of truth: ODD plan task T4.3 — exactly three modifier groups
 * (Leche, Endulzante, Extras) attached, in this order, to the tenant's
 * hot-coffee category. `price_delta` values are córdobas exactly as written
 * in the plan; nothing else is invented here.
 *
 * Design decisions fixed by the plan:
 * - No `is_default` anywhere. Required groups (Leche, min 1 / max 1) make the
 *   operator choose explicitly at the POS; options are never preselected
 *   silently. Rows are persisted with the schema default `is_default=false`.
 * - Fail-closed resolution: tenant (env `SEED_SOHO_TENANT_SLUG`, else tenant
 *   name `SOHO`) and category (env `SEED_SOHO_CATEGORY_CODE`, else candidate
 *   `CAFE_CALIENTE`, resolved through the tenant's `catalog_values` rows of
 *   type `SALES_PRODUCT_CATEGORY`) abort with a clear, exhaustive message on
 *   any ambiguity. The orchestrator re-runs with the right code; nothing is
 *   ever guessed between CAFE_CALIENTE/BEBIDAS/etc.
 * - Idempotent (relies on T1.1's UNIQUE(tenant_id, name)): inside the single
 *   tenant transaction, groups and options are matched by name; existing rows
 *   are reused, never duplicated and never silently overwritten — a fixture
 *   vs. existing conflict (min/max/allow_quantities for groups, price_delta
 *   for options) aborts the whole run listing every conflict so a human
 *   decides.
 * - Dry run by default: nothing is written unless `--apply` (argv) or
 *   `SEED_SOHO_APPLY=1` (env) is supplied. The dry run prints the same JSON
 *   contract describing what WOULD be created vs reused.
 *
 * Usage:
 *   npm run seed:soho-modifier-groups            (dry run, read-only)
 *   npm run seed:soho-modifier-groups -- --apply (write, inside one tenant transaction)
 */

export const SOHO_TENANT_NAME = 'SOHO';
export const DEFAULT_CATEGORY_CODE = 'CAFE_CALIENTE';

type FixtureEnvironment = Record<string, string | undefined>;

export interface SohoModifierOptionSeed {
  name: string;
  /** Delta in córdobas added to the product base price. */
  priceDelta: number;
  sortOrder: number;
}

export interface SohoModifierGroupSeed {
  name: string;
  minSelected: number;
  maxSelected: number;
  allowQuantities: boolean;
  sortOrder: number;
  options: SohoModifierOptionSeed[];
}

/**
 * Attachment order is the array order: Leche (1) → Endulzante (2) → Extras (3).
 */
export interface SohoModifierPlan {
  groups: SohoModifierGroupSeed[];
}

/**
 * The exact T4.3 plan. Deliberately a pure fixture so the spec file asserts
 * it against literals: this builder IS the plan transcription.
 */
export function buildSohoModifierPlan(): SohoModifierPlan {
  const groups: SohoModifierGroupSeed[] = [
    {
      name: 'Leche',
      minSelected: 1,
      maxSelected: 1,
      allowQuantities: false,
      sortOrder: 1,
      options: [
        { name: 'Entera', priceDelta: 0, sortOrder: 1 },
        { name: 'Descremada', priceDelta: 0, sortOrder: 2 },
        { name: 'Almendras', priceDelta: 20, sortOrder: 3 },
        { name: 'Soya', priceDelta: 20, sortOrder: 4 },
      ],
    },
    {
      name: 'Endulzante',
      minSelected: 0,
      maxSelected: 2,
      allowQuantities: false,
      sortOrder: 2,
      options: [
        { name: 'Normal', priceDelta: 0, sortOrder: 1 },
        { name: 'Sin azúcar', priceDelta: 0, sortOrder: 2 },
        { name: 'Stevia', priceDelta: 0, sortOrder: 3 },
      ],
    },
    {
      name: 'Extras',
      minSelected: 0,
      maxSelected: 3,
      allowQuantities: true,
      sortOrder: 3,
      options: [
        { name: 'Extra shot', priceDelta: 15, sortOrder: 1 },
        { name: 'Leche extra', priceDelta: 10, sortOrder: 2 },
        { name: 'Vainilla', priceDelta: 15, sortOrder: 3 },
        { name: 'Canela', priceDelta: 5, sortOrder: 4 },
      ],
    },
  ];
  return { groups };
}

/**
 * Writing requires an explicit opt-in: `--apply` as argv (the documented
 * flag) or `SEED_SOHO_APPLY=1` in the environment. Anything else is a
 * read-only dry run.
 */
export function parseApplyArg(
  argv: string[],
  env: FixtureEnvironment = process.env,
): boolean {
  if (argv.includes('--apply')) {
    return true;
  }
  return env.SEED_SOHO_APPLY === '1';
}

// ---- Fail-closed resolution (pure, unit-tested) --------------------------

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resolves the target tenant from loaded `tenants` rows (non-RLS public
 * table). Env `SEED_SOHO_TENANT_SLUG` wins; otherwise the tenant named
 * `SOHO`. Zero matches aborts listing what exists; more than one match
 * aborts listing the ambiguity — never guess.
 */
export function resolveTenantFromRows(
  rows: TenantRow[],
  env: FixtureEnvironment,
): TenantRow {
  const available = rows.map((row) => `${row.name} (${row.slug})`).join(', ');
  const slugOverride = env.SEED_SOHO_TENANT_SLUG?.trim();
  if (slugOverride) {
    const matches = rows.filter((row) => row.slug === slugOverride);
    if (matches.length === 0) {
      throw new Error(
        `SEED_SOHO_TENANT_SLUG '${slugOverride}' matches no tenant. ` +
          `Available tenants: ${available || '(none)'}`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `SEED_SOHO_TENANT_SLUG '${slugOverride}' is ambiguous ` +
          `(${matches.length} matches). Set the slug to a unique value. ` +
          `Matching: ${matches.map((row) => `${row.name} (${row.slug})`).join(', ')}`,
      );
    }
    return matches[0];
  }
  const sohoMatches = rows.filter(
    (row) => row.name.trim() === SOHO_TENANT_NAME,
  );
  if (sohoMatches.length === 0) {
    throw new Error(
      `No tenant named '${SOHO_TENANT_NAME}' found. ` +
        `Available tenants: ${available || '(none)'}. ` +
        `Use SEED_SOHO_TENANT_SLUG to target a different tenant explicitly.`,
    );
  }
  if (sohoMatches.length > 1) {
    throw new Error(
      `Tenant name '${SOHO_TENANT_NAME}' is ambiguous ` +
        `(${sohoMatches.length} matches): ` +
        `${sohoMatches.map((row) => `${row.name} (${row.slug})`).join(', ')}. ` +
        `Set SEED_SOHO_TENANT_SLUG to pick one explicitly.`,
    );
  }
  return sohoMatches[0];
}

export interface CategoryRow {
  id: string;
  code: string;
  name: string;
}

/**
 * Resolves the attachment category from the tenant's `catalog_values` rows
 * of type SALES_PRODUCT_CATEGORY (the authority). An unknown candidate code
 * aborts listing every available code — the orchestrator re-runs with the
 * right one; never guess between CAFE_CALIENTE/BEBIDAS/etc.
 */
export function resolveCategoryFromRows(
  rows: CategoryRow[],
  candidateCode: string,
): CategoryRow {
  const candidate = candidateCode.trim();
  const match = rows.find((row) => row.code === candidate);
  if (match) {
    return match;
  }
  const available = rows.map((row) => row.code).join(', ');
  throw new Error(
    `Category code '${candidate}' does not exist in the tenant's ` +
      `SALES_PRODUCT_CATEGORY catalog values. ` +
      `Available codes: ${available || '(none)'}. ` +
      `Re-run with SEED_SOHO_CATEGORY_CODE set to the right code.`,
  );
}

// ---- Idempotency decision function (pure, unit-tested) --------------------

export interface ExistingModifierGroupRow {
  id: string;
  name: string;
  min_selected: number;
  max_selected: number;
  allow_quantities: boolean;
}

export interface ExistingModifierOptionRow {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
}

export interface ExistingAttachmentRow {
  id: string;
  catalog_value_id: string;
  group_id: string;
}

export interface ModifierSeedComputeInput {
  plan: SohoModifierPlan;
  existingGroups: ExistingModifierGroupRow[];
  existingOptions: ExistingModifierOptionRow[];
  existingAttachments: ExistingAttachmentRow[];
  catalogValueId: string;
}

export interface ModifierSeedActions {
  groupsToCreate: SohoModifierGroupSeed[];
  reusedGroups: { name: string; id: string }[];
  optionsToCreate: { groupName: string; option: SohoModifierOptionSeed }[];
  reusedOptions: { groupName: string; optionName: string }[];
  attachmentsToCreate: {
    groupName: string;
    catalogValueId: string;
    sortOrder: number;
  }[];
  attachmentsSkipped: number;
  /** Non-empty means the run must abort so a human resolves the conflict. */
  conflicts: string[];
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

/**
 * Pure idempotency decision for the seed. Groups and options are matched by
 * trimmed case-insensitive name (mirrors seed-soho-catalog). Existing rows
 * are reused, never duplicated and never silently overwritten: a fixture vs
 * existing disagreement on group min/max/allow_quantities or option
 * price_delta is recorded as a conflict so the caller can abort.
 */
export function computeModifierSeedActions(
  input: ModifierSeedComputeInput,
): ModifierSeedActions {
  const { plan, existingGroups, existingOptions, existingAttachments } = input;
  const conflicts: string[] = [];
  const groupsToCreate: SohoModifierGroupSeed[] = [];
  const reusedGroups: { name: string; id: string }[] = [];
  const optionsToCreate: {
    groupName: string;
    option: SohoModifierOptionSeed;
  }[] = [];
  const reusedOptions: { groupName: string; optionName: string }[] = [];
  const attachmentsToCreate: {
    groupName: string;
    catalogValueId: string;
    sortOrder: number;
  }[] = [];
  let attachmentsSkipped = 0;

  const existingByName = new Map<string, ExistingModifierGroupRow>();
  for (const row of existingGroups) {
    existingByName.set(normalizeName(row.name), row);
  }
  const optionsByGroup = new Map<string, ExistingModifierOptionRow[]>();
  for (const row of existingOptions) {
    const list = optionsByGroup.get(row.group_id) ?? [];
    list.push(row);
    optionsByGroup.set(row.group_id, list);
  }

  const groupIds = new Map<string, string>();
  for (const group of plan.groups) {
    const existing = existingByName.get(normalizeName(group.name));
    if (!existing) {
      groupsToCreate.push(group);
      continue;
    }
    // Reuse, but never silently accept a drifted group: the fixture is the
    // plan, so a differing rule is a human decision, not an overwrite.
    if (existing.min_selected !== group.minSelected) {
      conflicts.push(
        `Modifier group '${group.name}' already exists with ` +
          `min_selected=${existing.min_selected}, but the fixture defines ` +
          `min_selected=${group.minSelected}`,
      );
    }
    if (existing.max_selected !== group.maxSelected) {
      conflicts.push(
        `Modifier group '${group.name}' already exists with ` +
          `max_selected=${existing.max_selected}, but the fixture defines ` +
          `max_selected=${group.maxSelected}`,
      );
    }
    if (existing.allow_quantities !== group.allowQuantities) {
      conflicts.push(
        `Modifier group '${group.name}' already exists with ` +
          `allow_quantities=${existing.allow_quantities}, but the fixture ` +
          `defines allow_quantities=${group.allowQuantities}`,
      );
    }
    reusedGroups.push({ name: group.name, id: existing.id });
    groupIds.set(group.name, existing.id);
  }

  for (const group of plan.groups) {
    const groupId = groupIds.get(group.name);
    if (groupId) {
      const existingForGroup = optionsByGroup.get(groupId) ?? [];
      const existingOptionByName = new Map(
        existingForGroup.map((row) => [normalizeName(row.name), row]),
      );
      for (const option of group.options) {
        const existingOption = existingOptionByName.get(
          normalizeName(option.name),
        );
        if (!existingOption) {
          optionsToCreate.push({ groupName: group.name, option });
          continue;
        }
        if (Number(existingOption.price_delta) !== option.priceDelta) {
          conflicts.push(
            `Option '${option.name}' in group '${group.name}' already exists ` +
              `with price_delta=${existingOption.price_delta}, but the ` +
              `fixture defines price_delta=${option.priceDelta}`,
          );
        }
        reusedOptions.push({
          groupName: group.name,
          optionName: option.name,
        });
      }
    } else {
      for (const option of group.options) {
        optionsToCreate.push({ groupName: group.name, option });
      }
    }

    const hasAttachment = existingAttachments.some(
      (row) =>
        row.catalog_value_id === input.catalogValueId &&
        groupIds.get(group.name) === row.group_id,
    );
    if (hasAttachment) {
      attachmentsSkipped++;
    } else {
      attachmentsToCreate.push({
        groupName: group.name,
        catalogValueId: input.catalogValueId,
        sortOrder: group.sortOrder,
      });
    }
  }

  return {
    groupsToCreate,
    reusedGroups,
    optionsToCreate,
    reusedOptions,
    attachmentsToCreate,
    attachmentsSkipped,
    conflicts,
  };
}

// ---- Orchestration --------------------------------------------------------

export interface SohoModifierSeedResult {
  kind: 'SOHO_MODIFIER_SEED';
  mode: 'dry-run' | 'applied';
  tenant: { id: string; name: string };
  category: { id: string; code: string };
  created: { groups: number; options: number; attachments: number };
  reused: { groups: number; options: number; attachments: number };
  conflicts: string[];
  warnings: string[];
}

export interface SeedSohoModifierGroupsOptions {
  apply: boolean;
  env?: FixtureEnvironment;
  plan?: SohoModifierPlan;
}

/**
 * Seeds the SOHO hot-coffee modifier groups for one tenant. All reads and
 * writes for the tenant happen inside ONE `runInTenantTransaction` (RLS-safe,
 * same binding discipline as the precedent seeders); only the non-RLS
 * `tenants` lookup runs before the transaction opens, because the wrapper
 * needs the tenant id to bind.
 *
 * Default is a dry run: the transaction is read-only and nothing persists.
 * With `apply`, any fixture conflict aborts the transaction before the first
 * write, so a conflicting run leaves the database untouched.
 */
export async function seedSohoModifierGroups(
  dataSource: DataSource,
  options: SeedSohoModifierGroupsOptions,
): Promise<SohoModifierSeedResult> {
  const env = options.env ?? process.env;
  const plan = options.plan ?? buildSohoModifierPlan();

  // `tenants` is a public (non-RLS) table; the tenant id must be known before
  // the transaction opens because runInTenantTransaction binds from it.
  const tenantRows: TenantRow[] = await dataSource.manager.find(Tenant);
  const tenant = resolveTenantFromRows(tenantRows, env);

  const { category, actions, warnings } = await runInTenantTransaction(
    dataSource,
    tenant.id,
    async (manager) => {
      const candidateCode =
        env.SEED_SOHO_CATEGORY_CODE?.trim() || DEFAULT_CATEGORY_CODE;
      const categoryRows: CategoryRow[] = await manager.find(CatalogValue, {
        where: {
          tenant_id: tenant.id,
          catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
        },
      });
      const category = resolveCategoryFromRows(categoryRows, candidateCode);

      const warnings: string[] = [];
      const productCount = await manager.count(Product, {
        where: {
          tenant_id: tenant.id,
          category_code: category.code,
        },
      });
      if (productCount === 0) {
        warnings.push(
          `No product uses category '${category.code}': the modifier groups ` +
            `will be attached to an empty category. Verify the code or the catalog.`,
        );
      }

      const existingGroups: ExistingModifierGroupRow[] = await manager.find(
        ModifierGroup,
        { where: { tenant_id: tenant.id } },
      );
      const existingOptions: ExistingModifierOptionRow[] = await manager.find(
        ModifierOption,
        { where: { tenant_id: tenant.id } },
      );
      const existingAttachments: ExistingAttachmentRow[] = await manager.find(
        CategoryModifierGroup,
        { where: { tenant_id: tenant.id } },
      );

      const actions = computeModifierSeedActions({
        plan,
        existingGroups,
        existingOptions,
        existingAttachments,
        catalogValueId: category.id,
      });

      if (!options.apply) {
        return { category, actions, warnings };
      }

      // Group name -> id for every group touched this run (reused or just
      // created); options and attachments resolve their parent through it.
      const groupIdsByName = new Map<string, string>();

      // Fail closed before the first write: one conflicting row aborts the
      // whole run inside the transaction so nothing partial persists.
      if (actions.conflicts.length > 0) {
        throw new Error(
          `SOHO modifier seed aborted: ${actions.conflicts.length} conflict(s) ` +
            `between the fixture and existing rows (nothing was written):\n` +
            actions.conflicts.map((line) => ` - ${line}`).join('\n'),
        );
      }

      for (const group of actions.groupsToCreate) {
        const saved = await manager.save(
          ModifierGroup,
          manager.create(ModifierGroup, {
            tenant_id: tenant.id,
            name: group.name,
            min_selected: group.minSelected,
            max_selected: group.maxSelected,
            allow_quantities: group.allowQuantities,
            sort_order: group.sortOrder,
            is_active: true,
          }),
        );
        groupIdsByName.set(group.name, saved.id);
      }
      for (const reused of actions.reusedGroups) {
        groupIdsByName.set(reused.name, reused.id);
      }
      for (const entry of actions.optionsToCreate) {
        const groupId = groupIdsByName.get(entry.groupName);
        if (!groupId) {
          // Unreachable by construction: every option's group was created or
          // reused above. Kept as a fail-closed guard.
          throw new Error(
            `Plan integrity error: option '${entry.option.name}' references ` +
              `unresolved group '${entry.groupName}'`,
          );
        }
        await manager.save(
          ModifierOption,
          manager.create(ModifierOption, {
            tenant_id: tenant.id,
            group_id: groupId,
            name: entry.option.name,
            price_delta: entry.option.priceDelta,
            // Plan decision: no is_default anywhere — required groups force
            // an explicit operator choice; never preselect silently.
            is_default: false,
            sort_order: entry.option.sortOrder,
            is_active: true,
          }),
        );
      }
      for (const attachment of actions.attachmentsToCreate) {
        const groupId = groupIdsByName.get(attachment.groupName);
        if (!groupId) {
          throw new Error(
            `Plan integrity error: attachment references unresolved group ` +
              `'${attachment.groupName}'`,
          );
        }
        await manager.save(
          CategoryModifierGroup,
          manager.create(CategoryModifierGroup, {
            tenant_id: tenant.id,
            catalog_value_id: attachment.catalogValueId,
            group_id: groupId,
            sort_order: attachment.sortOrder,
          }),
        );
      }

      return { category, actions, warnings };
    },
  );

  return {
    kind: 'SOHO_MODIFIER_SEED',
    mode: options.apply ? 'applied' : 'dry-run',
    tenant: { id: tenant.id, name: tenant.name },
    category: { id: category.id, code: category.code },
    created: {
      groups: actions.groupsToCreate.length,
      options: actions.optionsToCreate.length,
      attachments: actions.attachmentsToCreate.length,
    },
    reused: {
      groups: actions.reusedGroups.length,
      options: actions.reusedOptions.length,
      attachments: actions.attachmentsSkipped,
    },
    conflicts: actions.conflicts,
    warnings,
  };
}

export async function main(
  argv: string[] = process.argv.slice(2),
  env: FixtureEnvironment = process.env,
): Promise<void> {
  const apply = parseApplyArg(argv, env);
  const plan = buildSohoModifierPlan();

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const dataSource = app.get(DataSource);
    const result = await seedSohoModifierGroups(dataSource, {
      apply,
      env,
      plan,
    });
    // This is intentionally the only output: a machine-readable contract for
    // the orchestrator (dry run first, then re-run with --apply).
    console.log(JSON.stringify(result, null, 2));
    if (result.conflicts.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
