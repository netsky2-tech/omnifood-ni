import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DataSource, EntityManager } from 'typeorm';
import {
  MenuImportInsumoToCreate,
  MenuImportRequestDto,
  MenuImportRowIssue,
  MenuImportSummary,
} from '../dto/menu-import.dto';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../../catalog/catalog-type';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import {
  resolveTenantContextId,
  runInTenantTransaction,
} from '../../../core/database/tenant-transaction';

/**
 * Base64 payload cap (~5 MB of base64 characters, roughly 3.6 MB of binary
 * workbook). Menu workbooks for a food park are a few KB; anything beyond
 * this cap is a mistake or abuse and is rejected before ExcelJS parses it.
 */
const MAX_BASE64_LENGTH = 5 * 1024 * 1024;

const ROUND_4 = 4;
const ROUND_PRICE = 2;

/**
 * First worksheet of the downloadable template: plain-Spanish instructions.
 * The import parser ignores this sheet (accent/case/space tolerant match) so
 * the template can be uploaded back as-is without deleting the guide.
 */
export const TEMPLATE_GUIDE_SHEET_NAME = 'CÓMO LLENARLA';

/** SOHO-style menu categories pre-created as worksheets in the template. */
export const TEMPLATE_CATEGORIES = [
  'CAFÉ CALIENTE',
  'CAFÉ HELADO',
  'DESAYUNOS',
  'BATIDOS',
  'BEBIDAS',
  'POSTRES',
] as const;

/** One fully filled example row shipped on every data sheet. */
const TEMPLATE_EXAMPLE_ROW = [
  'Cappuccino 8oz',
  110,
  'Café molido',
  18,
  'g',
] as const;

const TEMPLATE_INSTRUCTIONS = [
  'CÓMO LLENAR LA PLANTILLA DE MENÚ',
  '1. Cada pestaña de este archivo corresponde a una categoría del menú (CAFÉ CALIENTE, CAFÉ HELADO, DESAYUNOS, BATIDOS, BEBIDAS, POSTRES). Puedes renombrarlas o agregar más pestañas: cada pestaña se importa como una categoría.',
  '2. En cada pestaña usa exactamente estos encabezados (no los borres ni los renombres): producto | precio | insumo | cantidad | unidad.',
  '3. Escribe una fila por ingrediente: repite el producto y su precio en cada fila de ingrediente. Si un producto no lleva receta, deja insumo, cantidad y unidad vacíos.',
  '4. Ejemplo (ya cargado en cada pestaña): Cappuccino 8oz | 110 | Café molido | 18 | g. Usa unidades consistentes (g, ml, UN, L, KG).',
  '5. No modifiques la pestaña CÓMO LLENARLA: el sistema la ignora al importar. Guarda el archivo como .xlsx y súbelo desde Configuración → Importar menú.',
] as const;

const round4 = (value: number): number => Number(value.toFixed(ROUND_4));
const roundPrice = (value: number): number =>
  Number(value.toFixed(ROUND_PRICE));

/** The five BOM columns every sheet must declare (accent/case tolerant). */
const MENU_COLUMNS = [
  'producto',
  'precio',
  'insumo',
  'cantidad',
  'unidad',
] as const;
type MenuColumn = (typeof MENU_COLUMNS)[number];

/**
 * Spanish-tolerant header normalization for the five menu-import columns:
 * trims, lowercases, strips accents, and collapses whitespace. Mirrors the
 * intent of `normalizeHeaderName` in import-contract-version.ts, restricted
 * to exactly these columns.
 */
function normalizeMenuHeader(raw: string): MenuColumn | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return (MENU_COLUMNS as readonly string[]).includes(cleaned)
    ? (cleaned as MenuColumn)
    : null;
}

/**
 * Case-insensitive, trimmed name key. Mirrors the idempotency matching of
 * industry-template.service.ts (insumos and products are matched by
 * trimmed lowercased name within the tenant).
 */
const nameKey = (raw: string): string => raw.trim().toLowerCase();

/**
 * Canonical catalog code for a worksheet-derived menu category: trim,
 * collapse internal whitespace to `_`, strip accents/diacritics, uppercase,
 * then drop every character that is not A-Z, 0-9 or `_`. The result is the
 * stable `catalog_values.code` key (unique per tenant and catalog type) that
 * the POS uses to reference a `SALES_PRODUCT_CATEGORY` value. Pure and
 * deterministic so the same sheet name always yields the same code.
 */
export function canonicalCategoryCode(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
}

/** One raw Excel data row (defensively extracted from the sheet). */
interface ParsedMenuRow {
  sheet: string;
  rowNumber: number;
  productName: string;
  price: number | null;
  ingredientName: string;
  quantity: number | null;
  unit: string;
}

interface ParsedSheet {
  name: string;
  rows: ParsedMenuRow[];
}

/** One ingredient line of a product's BOM. */
interface MenuIngredient {
  name: string;
  quantity: number;
  unit: string;
}

/**
 * A product assembled from its repeated BOM rows. Grouping is tenant-wide by
 * product name (first-seen sheet wins as category), matching the idempotency
 * rule: the same product name anywhere in the workbook is one product.
 */
interface ProductGroup {
  name: string;
  category: string;
  price: number;
  priceAssigned: boolean;
  ingredients: MenuIngredient[];
}

interface AssembledWorkbook {
  categories: number;
  groups: ProductGroup[];
  errors: MenuImportRowIssue[];
  warnings: MenuImportRowIssue[];
}

@Injectable()
export class MenuImportService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Dry run: parse the workbook and compute the exact plan commit would
   * execute. No writes; runs inside a tenant-bound transaction so the
   * existing-state reads (insumos, products, recipe versions) respect RLS.
   */
  async preview(
    tenantId: string,
    payload: MenuImportRequestDto,
  ): Promise<MenuImportSummary> {
    const trimmedTenant = resolveTenantContextId(tenantId);
    const parsed = await this.parseWorkbook(payload.fileBase64);
    return runInTenantTransaction(this.dataSource, trimmedTenant, (manager) =>
      this.process(manager, trimmedTenant, parsed, 'preview'),
    );
  }

  /**
   * Commit: re-parses and re-validates the same payload (no server-side
   * staging), fails closed on any row error, then performs all writes inside
   * one tenant-bound transaction.
   */
  async commit(
    tenantId: string,
    payload: MenuImportRequestDto,
  ): Promise<MenuImportSummary> {
    const trimmedTenant = resolveTenantContextId(tenantId);
    const parsed = await this.parseWorkbook(payload.fileBase64);
    return runInTenantTransaction(this.dataSource, trimmedTenant, (manager) =>
      this.process(manager, trimmedTenant, parsed, 'commit'),
    );
  }

  // ---------------------------------------------------------------------------
  // Workbook parsing
  // ---------------------------------------------------------------------------

  private async parseWorkbook(base64: string): Promise<ParsedSheet[]> {
    const trimmed = base64?.trim();
    if (!trimmed) {
      throw new BadRequestException(
        'fileBase64 is required: send the .xlsx workbook encoded as base64',
      );
    }
    if (trimmed.length > MAX_BASE64_LENGTH) {
      throw new BadRequestException(
        'Workbook payload too large: base64 exceeds the 5 MB limit',
      );
    }
    const buffer = Buffer.from(trimmed, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException(
        'fileBase64 is not valid base64 workbook data',
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'Uploaded file is not a readable .xlsx workbook',
      );
    }

    const sheets: ParsedSheet[] = [];
    for (const sheet of workbook.worksheets) {
      if (this.isGuideSheet(sheet.name)) continue;
      sheets.push(this.parseSheet(sheet));
    }
    return sheets;
  }

  /**
   * Accent/case/space-tolerant match of the template's instruction sheet so
   * the downloaded template can be uploaded back without manual deletion.
   */
  private isGuideSheet(name: string | undefined): boolean {
    const normalized = (name ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
    return normalized === 'como llenarla';
  }

  // ---------------------------------------------------------------------------
  // Template generation (GET /onboarding/menu-import/template)
  // ---------------------------------------------------------------------------

  /**
   * Builds the ready-to-fill .xlsx template fully in memory with exceljs:
   * a first instruction sheet plus one pre-created sheet per SOHO category,
   * each with the bold BOM header row and one filled example row.
   */
  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    const guide = workbook.addWorksheet(TEMPLATE_GUIDE_SHEET_NAME);
    guide.getColumn(1).width = 110;
    for (const line of TEMPLATE_INSTRUCTIONS) {
      guide.addRow([line]);
    }
    // The title line stands out; instruction lines stay plain.
    guide.getRow(1).font = { bold: true, size: 12 };

    for (const category of TEMPLATE_CATEGORIES) {
      const sheet = workbook.addWorksheet(category);
      sheet.columns = [
        { width: 30 },
        { width: 12 },
        { width: 30 },
        { width: 12 },
        { width: 10 },
      ];
      const headerRow = sheet.addRow([...MENU_COLUMNS]);
      headerRow.font = { bold: true };
      sheet.addRow([...TEMPLATE_EXAMPLE_ROW]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as unknown as ArrayBuffer);
  }

  private parseSheet(sheet: ExcelJS.Worksheet): ParsedSheet {
    const sheetName = sheet.name?.trim() ? sheet.name.trim() : sheet.name;

    const headerMap = new Map<MenuColumn, number>();
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const normalized = normalizeMenuHeader(this.cellText(cell.value));
      if (normalized && !headerMap.has(normalized)) {
        headerMap.set(normalized, colNumber);
      }
    });

    const missing = MENU_COLUMNS.filter((column) => !headerMap.has(column));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Sheet '${sheet.name}' is missing required column(s): ${missing.join(', ')}. ` +
          `Expected headers: ${MENU_COLUMNS.join(', ')}`,
      );
    }

    const rows: ParsedMenuRow[] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const productName = this.cellText(
        row.getCell(headerMap.get('producto') as number).value,
      ).trim();
      const priceText = this.cellText(
        row.getCell(headerMap.get('precio') as number).value,
      );
      const ingredientName = this.cellText(
        row.getCell(headerMap.get('insumo') as number).value,
      ).trim();
      const quantityText = this.cellText(
        row.getCell(headerMap.get('cantidad') as number).value,
      );
      const unit = this.cellText(
        row.getCell(headerMap.get('unidad') as number).value,
      ).trim();

      // Skip fully blank rows silently.
      if (
        !productName &&
        !priceText &&
        !ingredientName &&
        !quantityText &&
        !unit
      ) {
        return;
      }

      rows.push({
        sheet: sheetName,
        rowNumber,
        productName,
        price: this.parseFlexibleNumber(priceText),
        ingredientName,
        quantity: this.parseFlexibleNumber(quantityText),
        unit,
      });
    });

    return { name: sheetName, rows };
  }

  /**
   * Defensive cell → text extraction. ExcelJS cells may carry rich text,
   * formula results, hyperlinks, dates or plain values; only plain strings
   * and numbers are meaningful for these five columns.
   */
  private cellText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const record = value as unknown as Record<string, unknown>;
      if (Array.isArray(record.richText)) {
        return record.richText
          .map((segment) =>
            this.cellText(
              ((segment as { text?: unknown } | null)?.text ??
                '') as ExcelJS.CellValue,
            ),
          )
          .join('');
      }
      if ('result' in record)
        return this.cellText(record.result as ExcelJS.CellValue);
      if ('text' in record)
        return this.cellText(record.text as ExcelJS.CellValue);
    }
    return '';
  }

  /**
   * Number cleaning for `precio` and `cantidad`, mirroring the canonical CSV
   * parser approach: strip currency tokens (C$, $, NIO) and percent signs,
   * then handle thousands separators. Extends it only for the documented
   * decimal-comma case: a comma used as decimal separator with dot thousands
   * ("1.234,56" or "25,5") converts to a dot; otherwise commas are treated
   * as thousands separators and stripped, exactly like the CSV parser.
   */
  private parseFlexibleNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      return Number.isNaN(value) ? null : value;
    }
    if (typeof value !== 'string') return null;

    let cleaned = value
      .replace(/C\$/gi, '')
      .replace(/\$/g, '')
      .replace(/NIO/gi, '')
      .replace(/%/g, '')
      .trim();
    if (!cleaned) return null;

    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
      // Decimal-comma format: dots are thousands separators.
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }

    if (!cleaned || cleaned === '-') return null;
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  }

  // ---------------------------------------------------------------------------
  // Plan assembly (shared by preview and commit)
  // ---------------------------------------------------------------------------

  private assemble(sheets: ParsedSheet[]): AssembledWorkbook {
    const errors: MenuImportRowIssue[] = [];
    const warnings: MenuImportRowIssue[] = [];
    const groups = new Map<string, ProductGroup>();

    for (const sheet of sheets) {
      // Fail closed before any write: a worksheet whose name normalizes to
      // an empty canonical code would otherwise create a `category_code
      // = ''` catalog row (a brand-new orphan) and stamp it on every
      // product from that sheet.
      if (!canonicalCategoryCode(sheet.name)) {
        errors.push({
          sheet: sheet.name,
          row: 1,
          message:
            `Sheet name '${sheet.name}' produces an empty category code: ` +
            `rename the worksheet so its name contains letters or numbers (e.g. 'BEBIDAS')`,
        });
      }
      if (sheet.rows.length === 0) {
        warnings.push({
          sheet: sheet.name,
          row: 1,
          message: `Sheet '${sheet.name}' has no data rows`,
        });
      }

      for (const row of sheet.rows) {
        if (!row.productName) {
          errors.push({
            sheet: row.sheet,
            row: row.rowNumber,
            message: `Row is missing 'producto'`,
          });
          continue;
        }

        const key = nameKey(row.productName);
        let group = groups.get(key);
        if (!group) {
          group = {
            name: row.productName,
            category: row.sheet,
            price: 0,
            priceAssigned: false,
            ingredients: [],
          };
          groups.set(key, group);
        }

        if (row.price === null) {
          errors.push({
            sheet: row.sheet,
            row: row.rowNumber,
            message: `'precio' for product '${group.name}' is missing or not numeric`,
          });
        } else if (!group.priceAssigned) {
          group.price = row.price;
          group.priceAssigned = true;
        } else if (roundPrice(row.price) !== roundPrice(group.price)) {
          // First-seen price wins, but the conflict is always flagged: the
          // owner must fix the workbook before a commit can succeed.
          errors.push({
            sheet: row.sheet,
            row: row.rowNumber,
            message: `Conflicting precio ${row.price} for product '${group.name}' (first-seen price ${group.price})`,
          });
        }

        if (row.ingredientName) {
          if (row.quantity === null) {
            errors.push({
              sheet: row.sheet,
              row: row.rowNumber,
              message: `'cantidad' for ingredient '${row.ingredientName}' is missing or not numeric`,
            });
          }
          if (!row.unit) {
            errors.push({
              sheet: row.sheet,
              row: row.rowNumber,
              message: `'unidad' for ingredient '${row.ingredientName}' is missing`,
            });
          }
          if (row.quantity !== null && row.unit) {
            group.ingredients.push({
              name: row.ingredientName,
              quantity: row.quantity,
              unit: row.unit,
            });
          }
        }
      }
    }

    return {
      categories: sheets.length,
      groups: [...groups.values()],
      errors,
      warnings,
    };
  }

  /**
   * Core plan computation and (for commit) execution. Preview computes the
   * identical counts without a single write; commit executes exactly the
   * planned writes inside the same tenant-bound transaction.
   */
  private async process(
    manager: EntityManager,
    tenantId: string,
    sheets: ParsedSheet[],
    mode: 'preview' | 'commit',
  ): Promise<MenuImportSummary> {
    const { categories, groups, errors, warnings } = this.assemble(sheets);

    // Fail closed: a commit with any row error writes nothing.
    if (mode === 'commit' && errors.length > 0) {
      throw new BadRequestException(
        `Menu import failed closed: ${errors.length} row error(s) must be fixed before committing. ` +
          `First error (sheet '${errors[0].sheet}', row ${errors[0].row}): ${errors[0].message}`,
      );
    }

    // Existing state, read from the tenant-bound manager (RLS-safe).
    const insumoMap = new Map<string, Insumo>();
    for (const insumo of await manager.find(Insumo, {
      where: { tenant_id: tenantId },
    })) {
      insumoMap.set(nameKey(insumo.name), insumo);
    }
    const productMap = new Map<string, Product>();
    for (const product of await manager.find(Product, {
      where: { tenant_id: tenantId },
    })) {
      productMap.set(nameKey(product.name), product);
    }

    // Missing insumos, deduplicated tenant-wide. Never blocks: they are
    // created with stock 0 / averageCost 0 and flagged for review.
    const missingInsumos = new Map<string, { name: string; unit: string }>();
    for (const group of groups) {
      for (const ingredient of group.ingredients) {
        const key = nameKey(ingredient.name);
        if (!insumoMap.has(key) && !missingInsumos.has(key)) {
          missingInsumos.set(key, {
            name: ingredient.name,
            unit: ingredient.unit,
          });
        }
      }
    }
    const insumosToCreate: MenuImportInsumoToCreate[] = [
      ...missingInsumos.values(),
    ].map((plan) => ({
      name: plan.name,
      purchaseUom: plan.unit,
      consumptionUom: plan.unit,
      review: true,
    }));

    const summary: MenuImportSummary = {
      categories,
      productsToCreate: 0,
      productsToUpdate: 0,
      recipesToCreate: 0,
      recipesSkipped: [],
      insumosToCreate,
      errors,
      warnings,
    };

    // 1. Create missing insumos.
    for (const [key, plan] of missingInsumos) {
      let insumo = insumoMap.get(key);
      if (!insumo && mode === 'commit') {
        insumo = await manager.save(
          Insumo,
          manager.create(Insumo, {
            tenant_id: tenantId,
            name: plan.name,
            purchaseUom: plan.unit,
            consumptionUom: plan.unit,
            conversionFactor: 1,
            stock: 0,
            existenciaActual: 0,
            averageCost: 0,
            is_active: true,
          }),
        );
        insumoMap.set(key, insumo);
      }
    }

    // 1b. Resolve every worksheet-derived category to a canonical
    //     SALES_PRODUCT_CATEGORY code. First-seen sheet order wins
    //     (matching the idempotency rule above MENU_COLUMNS); only
    //     categories actually referenced by a product group become catalog
    //     rows. Existing rows are reused by their derived `code` — never
    //     fuzzy-matched by label — so the import cannot silently merge
    //     distinct categories the owner already administered in /catalogs.
    const categoryLabels: string[] = [];
    for (const group of groups) {
      if (!categoryLabels.includes(group.category)) {
        categoryLabels.push(group.category);
      }
    }
    const existingCategories = await manager.find(CatalogValue, {
      where: {
        tenant_id: tenantId,
        catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
      },
    });
    const categoriesByCode = new Map<string, CatalogValue>();
    for (const row of existingCategories) {
      categoriesByCode.set(row.code, row);
    }
    // New rows continue after the highest existing sort_order so the
    // first-seen sheet order stays stable and deterministic across runs.
    let nextSortOrder =
      existingCategories.reduce(
        (max, row) => Math.max(max, row.sort_order ?? 0),
        -1,
      ) + 1;
    const categoryCodeByLabel = new Map<string, string>();
    for (const label of categoryLabels) {
      const code = canonicalCategoryCode(label);
      categoryCodeByLabel.set(label, code);
      if (categoriesByCode.has(code)) continue;
      if (mode === 'commit') {
        // Single-statement race handling: `ON CONFLICT DO NOTHING` cannot
        // abort the surrounding transaction. A try/catch around save()
        // is unrecoverable here — after one failed statement inside a
        // PostgreSQL transaction every subsequent statement errors with
        // 25P02 — so recovery must never rely on a caught error.
        const values = {
          tenant_id: tenantId,
          catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
          code,
          // The label keeps the owner's worksheet wording (accents
          // and case preserved), e.g. 'Café caliente'.
          name: label,
          is_active: true,
          sort_order: nextSortOrder++,
        };
        const result = await manager
          .createQueryBuilder()
          .insert()
          .into(CatalogValue)
          .values(values)
          .orIgnore()
          .execute();
        const inserted = (result?.identifiers?.length ?? 0) > 0;
        if (inserted) {
          // This import created the row; tell the owner what it added.
          categoriesByCode.set(code, manager.create(CatalogValue, values));
          warnings.push({
            sheet: label,
            row: 1,
            message: `Created new category '${label}' (code '${code}') in /catalogs`,
          });
        } else {
          // The insert was ignored: a concurrent transaction committed the
          // same (tenant_id, catalog_type, code) after the read above. No
          // statement failed, so this read-back on the same tenant-bound
          // manager is safe.
          const raced = await manager.findOne(CatalogValue, {
            where: {
              tenant_id: tenantId,
              catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
              code,
            },
          });
          if (!raced) {
            throw new BadRequestException(
              `Category '${label}' (code '${code}') could not be created or found in /catalogs`,
            );
          }
          categoriesByCode.set(code, raced);
        }
      }
    }

    // 2. Create or price-update products.
    for (const group of groups) {
      const existing = productMap.get(nameKey(group.name));
      if (existing) {
        if (
          roundPrice(Number(existing.sellPrice)) !== roundPrice(group.price)
        ) {
          summary.productsToUpdate++;
          if (mode === 'commit') {
            // Price-only update: never touch name, recipe, or type.
            await manager.save(Product, {
              ...existing,
              sellPrice: roundPrice(group.price),
            });
          }
        }
        continue;
      }
      summary.productsToCreate++;
      if (mode === 'commit') {
        const created = await manager.save(
          Product,
          manager.create(Product, {
            tenant_id: tenantId,
            name: group.name,
            uom: 'UN',
            sellPrice: roundPrice(group.price),
            averageCost: 0,
            stock: 0,
            is_active: true,
            // COMPOUND when the workbook declares at least one ingredient
            // row, SIMPLE otherwise (mirrors resolveTemplateProductType).
            product_type: group.ingredients.length
              ? ProductType.COMPOUND
              : ProductType.SIMPLE,
            // Canonical catalog code derived from the worksheet name.
            category_code: categoryCodeByLabel.get(group.category),
          }),
        );
        productMap.set(nameKey(group.name), created);
      }
    }

    // 3. Create recipe drafts, skipping products that already own a
    //    RecipeVersion (existing tenant recipes are authoritative).
    for (const group of groups) {
      if (group.ingredients.length === 0) continue;

      const existing = productMap.get(nameKey(group.name));
      const existingVersion = existing
        ? await manager.findOne(RecipeVersion, {
            where: { tenant_id: tenantId, product_id: existing.id },
          })
        : null;
      if (existingVersion) {
        summary.recipesSkipped.push({
          productName: group.name,
          reason: 'VERSION_ALREADY_EXISTS',
          existingState: existingVersion.publication_state,
        });
        continue;
      }

      summary.recipesToCreate++;
      if (mode !== 'commit') continue;

      const productId = (existing ?? productMap.get(nameKey(group.name))).id;
      const version = await manager.save(
        RecipeVersion,
        manager.create(RecipeVersion, {
          tenant_id: tenantId,
          product_id: productId,
          version_number: 1,
          is_active: false,
          fecha_inicio_vigencia: null,
          product_name: group.name,
          yield_quantity: 1,
          technical_shrink_pct: 0,
          origin: RecipeOrigin.IMPORT,
          publication_state: RecipePublicationState.DRAFT,
          suggestion_state: RecipeSuggestionState.SUGGESTED,
        }),
      );
      for (const ingredient of group.ingredients) {
        const insumo = insumoMap.get(nameKey(ingredient.name));
        if (!insumo) {
          // Unreachable in commit: every ingredient was either matched or
          // created in step 1. Guarded so a future refactor fails loudly.
          throw new BadRequestException(
            `Ingredient '${ingredient.name}' was not resolved for product '${group.name}'`,
          );
        }
        await manager.save(
          RecipeDetail,
          manager.create(RecipeDetail, {
            tenant_id: tenantId,
            recipe_version_id: version.id,
            insumo_id: insumo.id,
            gross_quantity: round4(ingredient.quantity),
            technical_shrink_pct: 0,
            // Shrink is 0, so net quantity equals gross quantity.
            quantity: round4(ingredient.quantity),
            ingredient_name: insumo.name,
            ingredient_type: 'INSUMO',
            component_uom: ingredient.unit,
          }),
        );
      }
    }

    return summary;
  }
}
