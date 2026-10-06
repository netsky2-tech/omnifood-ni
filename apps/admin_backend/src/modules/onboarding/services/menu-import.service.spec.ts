import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import {
  canonicalCategoryCode,
  MenuImportService,
} from './menu-import.service';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';

const TENANT = 'tenant-uuid-1';

type SheetFixture = {
  name: string;
  rows: (string | number | null)[][];
};

/** One recorded query-builder insert call (the orIgnore category path). */
type InsertCall = {
  into: unknown;
  values: unknown;
  orIgnoreCalled: boolean;
  execute: jest.Mock;
};

/**
 * Builds a real multi-sheet .xlsx workbook fully in memory with exceljs and
 * returns it as the base64 payload the controller transport would post.
 */
const buildWorkbookBase64 = async (sheets: SheetFixture[]): Promise<string> => {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      ws.addRow(row);
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as unknown as ArrayBuffer).toString('base64');
};

const MENU_HEADERS = ['Producto', 'Precio', 'Insumo', 'Cantidad', 'Unidad'];

describe('MenuImportService (Unit)', () => {
  let service: MenuImportService;
  let mockManager: {
    query: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let idSequence: number;
  let insertCalls: InsertCall[];

  /**
   * Builds a chainable insert query builder that records every call so
   * tests can assert the category write path structurally (into / values /
   * orIgnore) instead of inferring it from manager.save calls. An optional
   * executeImpl replaces the resolved result (used to simulate conflict
   * outcomes or commit rows into a fake persistent store).
   */
  const insertBuilder = (
    result: unknown,
    executeImpl?: (call: InsertCall) => Promise<unknown>,
  ) => {
    const call: InsertCall = {
      into: undefined,
      values: undefined,
      orIgnoreCalled: false,
      execute: jest.fn(),
    };
    call.execute.mockImplementation(() =>
      executeImpl ? executeImpl(call) : Promise.resolve(result),
    );
    insertCalls.push(call);
    const builder = {
      insert: () => builder,
      into: (target: unknown) => {
        call.into = target;
        return builder;
      },
      values: (values: unknown) => {
        call.values = values;
        return builder;
      },
      orIgnore: () => {
        call.orIgnoreCalled = true;
        return builder;
      },
      execute: () => call.execute(),
    };
    return builder;
  };

  beforeEach(() => {
    idSequence = 0;
    insertCalls = [];
    mockManager = {
      // The production binding SQL: runInTenantTransaction issues exactly
      // this parameterised set_config on the transaction's manager before
      // any protected access.
      query: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entityClass: unknown, plain: unknown) => plain),
      save: jest.fn(async (_entityClass: unknown, value: unknown) => {
        // Simulate generated primary keys so recipe details can reference
        // the insumo/version created earlier in the same transaction.
        if (
          value &&
          typeof value === 'object' &&
          !(value as { id?: string }).id
        ) {
          idSequence += 1;
          return { ...(value as object), id: `generated-${idSequence}` };
        }
        return value;
      }),
      createQueryBuilder: jest.fn(() =>
        insertBuilder({ identifiers: [{}], raw: [{}] }),
      ),
    };
    dataSource = {
      transaction: jest.fn((cb: (mgr: unknown) => Promise<unknown>) =>
        cb(mockManager),
      ),
      // The pooled repository path must stay unused by this service.
      getRepository: jest.fn(),
    };
    service = new MenuImportService(dataSource as unknown as DataSource);
  });

  const twoSheetPayload = () =>
    buildWorkbookBase64([
      {
        name: 'CAFÉ CALIENTE',
        rows: [
          MENU_HEADERS,
          ['Espresso', 'C$45', 'Café Molido', '0,018', 'KG'],
        ],
      },
      {
        name: 'BATIDOS',
        rows: [
          MENU_HEADERS,
          ['Malteada', 80, 'Leche', '0,25', 'L'],
          ['Malteada', 80, 'Fresa', '30', 'G'],
        ],
      },
    ]);

  const seedExisting = (overrides?: {
    insumos?: Partial<Insumo>[];
    products?: Partial<Product>[];
    recipeVersionFor?: string;
    catalogValues?: Partial<CatalogValue>[];
  }) => {
    mockManager.find.mockImplementation((entity: unknown) => {
      if (entity === Insumo) return Promise.resolve(overrides?.insumos ?? []);
      if (entity === Product) return Promise.resolve(overrides?.products ?? []);
      if (entity === CatalogValue) {
        return Promise.resolve(overrides?.catalogValues ?? []);
      }
      return Promise.resolve([]);
    });
    mockManager.findOne.mockImplementation((entity: unknown) => {
      if (
        entity === RecipeVersion &&
        overrides?.recipeVersionFor !== undefined
      ) {
        return Promise.resolve({
          id: 'existing-version-1',
          tenant_id: TENANT,
          product_id: overrides.recipeVersionFor,
          publication_state: 'PUBLISHED',
        });
      }
      return Promise.resolve(null);
    });
  };

  describe('workbook parsing (2-sheet fixture)', () => {
    it('maps sheet names to categories, groups repeated BOM rows, and cleans numbers', async () => {
      seedExisting();
      const payload = await twoSheetPayload();

      const summary = await service.preview(TENANT, { fileBase64: payload });

      expect(summary.categories).toBe(2);
      expect(summary.errors).toEqual([]);
      expect(summary.productsToCreate).toBe(2);
      expect(summary.productsToUpdate).toBe(0);
      expect(summary.recipesToCreate).toBe(2);
      // Missing insumos across both sheets, deduplicated.
      expect(summary.insumosToCreate.map((i) => i.name).sort()).toEqual([
        'Café Molido',
        'Fresa',
        'Leche',
      ]);
      expect(summary.insumosToCreate.every((i) => i.review === true)).toBe(
        true,
      );
    });

    it('cleans currency tokens, thousands separators and decimal commas', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'DESAYUNOS',
          rows: [
            MENU_HEADERS,
            ['Gallo Pinto', 'C$ 1,250.50', 'Arroz', '1,5', 'KG'],
          ],
        },
      ]);

      const summary = await service.preview(TENANT, { fileBase64: payload });

      expect(summary.errors).toEqual([]);
    });

    it('creates missing insumos with consumption UOM = purchase UOM = unidad on commit', async () => {
      seedExisting();
      const payload = await twoSheetPayload();

      await service.commit(TENANT, { fileBase64: payload });

      const insumoCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === Insumo)
        .map(([, plain]) => plain as Record<string, unknown>);
      expect(insumoCreates).toHaveLength(3);
      expect(insumoCreates[0]).toMatchObject({
        tenant_id: TENANT,
        name: 'Café Molido',
        purchaseUom: 'KG',
        consumptionUom: 'KG',
        conversionFactor: 1,
        stock: 0,
        existenciaActual: 0,
        averageCost: 0,
        is_active: true,
      });
    });

    it('creates COMPOUND products for ingredient rows and SIMPLE products for blank-insumo rows', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'POSTRES',
          rows: [
            MENU_HEADERS,
            ['Flan', 60, 'Leche', '0,5', 'L'],
            // Blank insumo: product with no recipe yet, still imported.
            ['Tres Leches Slice', 90, '', '', ''],
          ],
        },
      ]);

      await service.commit(TENANT, { fileBase64: payload });

      const productCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === Product)
        .map(([, plain]) => plain as Record<string, unknown>);
      expect(productCreates).toHaveLength(2);
      const flan = productCreates.find((p) => p.name === 'Flan');
      const slice = productCreates.find((p) => p.name === 'Tres Leches Slice');
      expect(flan).toMatchObject({
        tenant_id: TENANT,
        product_type: 'COMPOUND',
        category_code: 'POSTRES',
        sellPrice: 60,
        uom: 'UN',
      });
      expect(slice).toMatchObject({
        product_type: 'SIMPLE',
        category_code: 'POSTRES',
        sellPrice: 90,
      });
    });

    it('creates recipe versions as unpublished DRAFT suggestions with per-row details', async () => {
      seedExisting();
      const payload = await twoSheetPayload();

      await service.commit(TENANT, { fileBase64: payload });

      const versionCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === RecipeVersion)
        .map(([, plain]) => plain as Record<string, unknown>);
      expect(versionCreates).toHaveLength(2);
      expect(versionCreates[0]).toMatchObject({
        tenant_id: TENANT,
        version_number: 1,
        is_active: false,
        yield_quantity: 1,
        technical_shrink_pct: 0,
        publication_state: 'DRAFT',
        suggestion_state: 'SUGGESTED',
      });

      const detailCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === RecipeDetail)
        .map(([, plain]) => plain as Record<string, unknown>);
      // Espresso (1) + Malteada (2)
      expect(detailCreates).toHaveLength(3);
      expect(detailCreates[0]).toMatchObject({
        gross_quantity: 0.018,
        quantity: 0.018,
        technical_shrink_pct: 0,
        ingredient_type: 'INSUMO',
        component_uom: 'KG',
      });
    });
  });

  describe('idempotent commit', () => {
    const existingInsumo = {
      id: 'insumo-1',
      tenant_id: TENANT,
      name: 'Leche',
      purchaseUom: 'L',
      consumptionUom: 'L',
      is_active: true,
    };
    const existingProduct = {
      id: 'product-1',
      tenant_id: TENANT,
      name: 'Latte',
      uom: 'UN',
      product_type: ProductType.COMPOUND,
      sellPrice: 50,
      is_active: true,
    };

    it('updates only the price of an existing product and never recreates it', async () => {
      seedExisting({
        insumos: [existingInsumo],
        products: [existingProduct],
        recipeVersionFor: 'product-1',
      });
      const payload = await buildWorkbookBase64([
        {
          name: 'CAFÉ CALIENTE',
          rows: [MENU_HEADERS, ['Latte', 60, 'Leche', '0,2', 'L']],
        },
      ]);

      const summary = await service.commit(TENANT, { fileBase64: payload });

      expect(summary.productsToCreate).toBe(0);
      expect(summary.productsToUpdate).toBe(1);
      expect(summary.recipesToCreate).toBe(0);
      expect(summary.insumosToCreate).toEqual([]);

      const productCreates = mockManager.create.mock.calls.filter(
        ([entity]) => entity === Product,
      );
      expect(productCreates).toHaveLength(0);
      const productSaves = mockManager.save.mock.calls.filter(
        ([entity]) => entity === Product,
      );
      expect(productSaves).toHaveLength(1);
      expect(productSaves[0][1]).toMatchObject({
        id: 'product-1',
        sellPrice: 60,
        name: 'Latte',
      });
    });

    it('reports recipesSkipped with VERSION_ALREADY_EXISTS and creates no recipe', async () => {
      seedExisting({
        insumos: [existingInsumo],
        products: [existingProduct],
        recipeVersionFor: 'product-1',
      });
      const payload = await buildWorkbookBase64([
        {
          name: 'CAFÉ CALIENTE',
          rows: [MENU_HEADERS, ['Latte', 60, 'Leche', '0,2', 'L']],
        },
      ]);

      const summary = await service.commit(TENANT, { fileBase64: payload });

      expect(summary.recipesSkipped).toEqual([
        {
          productName: 'Latte',
          reason: 'VERSION_ALREADY_EXISTS',
          existingState: 'PUBLISHED',
        },
      ]);
      const recipeSaves = mockManager.save.mock.calls.filter(
        ([entity]) => entity === RecipeVersion || entity === RecipeDetail,
      );
      expect(recipeSaves).toHaveLength(0);
    });

    it('is safe to re-run: a second commit against the same state recreates nothing', async () => {
      seedExisting({
        insumos: [existingInsumo],
        products: [existingProduct],
        recipeVersionFor: 'product-1',
      });
      const payload = await buildWorkbookBase64([
        {
          name: 'CAFÉ CALIENTE',
          rows: [MENU_HEADERS, ['Latte', 60, 'Leche', '0,2', 'L']],
        },
      ]);

      const first = await service.commit(TENANT, { fileBase64: payload });
      const second = await service.commit(TENANT, { fileBase64: payload });

      expect(second).toEqual(first);
      const productCreates = mockManager.create.mock.calls.filter(
        ([entity]) => entity === Product,
      );
      const recipeSaves = mockManager.save.mock.calls.filter(
        ([entity]) => entity === RecipeVersion,
      );
      const insumoSaves = mockManager.save.mock.calls.filter(
        ([entity]) => entity === Insumo,
      );
      expect(productCreates).toHaveLength(0);
      expect(recipeSaves).toHaveLength(0);
      expect(insumoSaves).toHaveLength(0);
    });
  });

  describe('canonical category codes (worksheet → catalog_values.code)', () => {
    const catalogCreates = () =>
      insertCalls
        .filter((call) => call.into === CatalogValue)
        .map((call) => call.values as Record<string, unknown>);
    const catalogSaves = () =>
      mockManager.save.mock.calls.filter(([entity]) => entity === CatalogValue);

    /**
     * Makes committed CatalogValue rows visible to the transaction's find,
     * so a second import sees the rows the first import created. Category
     * rows are committed through the orIgnore insert path, so persistence
     * hooks the recorded insert calls instead of manager.save.
     */
    const simulateCatalogPersistence = () => {
      const committed: Record<string, unknown>[] = [];
      const baseFind = mockManager.find.getMockImplementation();
      mockManager.find.mockImplementation((entity: unknown) => {
        if (entity === CatalogValue) {
          return Promise.resolve(committed.map((row) => ({ ...row })));
        }
        return (baseFind as (e: unknown) => Promise<unknown>)(entity);
      });
      mockManager.createQueryBuilder.mockImplementation(() =>
        insertBuilder(undefined, (call) => {
          committed.push({
            ...(call.values as object),
            id: `cv-${committed.length + 1}`,
          });
          return Promise.resolve({ identifiers: [{}], raw: [{}] });
        }),
      );
      return committed;
    };

    describe('canonicalCategoryCode (pure function)', () => {
      it('derives the canonical code for the SOHO worksheet names', () => {
        expect(canonicalCategoryCode('Café caliente')).toBe('CAFE_CALIENTE');
        expect(canonicalCategoryCode('Bebidas')).toBe('BEBIDAS');
        expect(canonicalCategoryCode('Café helado')).toBe('CAFE_HELADO');
        expect(canonicalCategoryCode('Postres')).toBe('POSTRES');
      });

      it('trims, collapses internal whitespace and strips punctuation', () => {
        expect(canonicalCategoryCode('  Café   caliente (frío)  ')).toBe(
          'CAFE_CALIENTE_FRIO',
        );
        expect(canonicalCategoryCode('Bebidas')).toBe(
          canonicalCategoryCode(' BEBIDAS '),
        );
      });
    });

    it('creates the derived code and never reuses a similar existing label row', async () => {
      seedExisting({
        catalogValues: [
          {
            id: 'cv-1',
            tenant_id: TENANT,
            catalog_type: 'SALES_PRODUCT_CATEGORY' as const,
            code: 'BEBIDA_CALIENTE',
            name: 'Bebida caliente',
            is_active: true,
            sort_order: 0,
          },
        ],
      });
      const payload = await buildWorkbookBase64([
        {
          name: 'Café caliente',
          rows: [MENU_HEADERS, ['Espresso', 45, '', '', '']],
        },
      ]);

      const summary = await service.commit(TENANT, { fileBase64: payload });

      const creates = catalogCreates();
      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({
        tenant_id: TENANT,
        catalog_type: 'SALES_PRODUCT_CATEGORY',
        code: 'CAFE_CALIENTE',
        name: 'Café caliente',
        is_active: true,
      });
      expect(creates[0].code).not.toBe('BEBIDA_CALIENTE');
      const productCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === Product)
        .map(([, plain]) => plain as Record<string, unknown>);
      expect(productCreates[0].category_code).toBe('CAFE_CALIENTE');
      // The owner sees what the import added to /catalogs.
      expect(
        summary.warnings.some((w) => w.message.includes('CAFE_CALIENTE')),
      ).toBe(true);
    });

    it('reuses an existing catalog row with the same code: no insert, label untouched', async () => {
      const existing = {
        id: 'cv-9',
        tenant_id: TENANT,
        catalog_type: 'SALES_PRODUCT_CATEGORY' as const,
        code: 'CAFE_CALIENTE',
        name: 'Café de la casa',
        is_active: true,
        sort_order: 3,
      };
      seedExisting({ catalogValues: [existing] });
      const payload = await buildWorkbookBase64([
        {
          name: 'CAFÉ CALIENTE',
          rows: [MENU_HEADERS, ['Espresso', 45, '', '', '']],
        },
      ]);

      const summary = await service.commit(TENANT, { fileBase64: payload });

      expect(catalogCreates()).toHaveLength(0);
      expect(catalogSaves()).toHaveLength(0);
      expect(existing.name).toBe('Café de la casa');
      const productCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === Product)
        .map(([, plain]) => plain as Record<string, unknown>);
      expect(productCreates[0].category_code).toBe('CAFE_CALIENTE');
      expect(summary.warnings.some((w) => w.sheet === 'CAFÉ CALIENTE')).toBe(
        false,
      );
    });

    it('merges sheets that normalize to the same code into one category row', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'Café caliente',
          rows: [MENU_HEADERS, ['Espresso', 45, '', '', '']],
        },
        {
          name: 'Cafe caliente',
          rows: [MENU_HEADERS, ['Americano', 40, '', '', '']],
        },
      ]);

      await service.commit(TENANT, { fileBase64: payload });

      const creates = catalogCreates();
      expect(creates).toHaveLength(1);
      expect(creates[0].code).toBe('CAFE_CALIENTE');
      const productCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === Product)
        .map(([, plain]) => plain as Record<string, unknown>);
      expect(productCreates).toHaveLength(2);
      expect(
        productCreates.every((p) => p.category_code === 'CAFE_CALIENTE'),
      ).toBe(true);
    });

    it('is idempotent for categories: importing the same workbook twice creates no duplicate category rows', async () => {
      seedExisting();
      const committed = simulateCatalogPersistence();
      const payload = await buildWorkbookBase64([
        {
          name: 'Café caliente',
          rows: [MENU_HEADERS, ['Espresso', 45, '', '', '']],
        },
      ]);

      await service.commit(TENANT, { fileBase64: payload });
      const createsAfterFirst = catalogCreates().length;
      expect(createsAfterFirst).toBe(1);

      await service.commit(TENANT, { fileBase64: payload });

      expect(catalogCreates()).toHaveLength(createsAfterFirst);
      expect(committed).toHaveLength(1);
      expect(committed[0].code).toBe('CAFE_CALIENTE');
    });

    it('leaves no orphan category references: every product category_code is a known catalog code', async () => {
      seedExisting({
        catalogValues: [
          {
            id: 'cv-2',
            tenant_id: TENANT,
            catalog_type: 'SALES_PRODUCT_CATEGORY' as const,
            code: 'BEBIDAS',
            name: 'Bebidas',
            is_active: true,
            sort_order: 0,
          },
        ],
      });
      const committed = simulateCatalogPersistence();
      const payload = await buildWorkbookBase64([
        {
          name: 'Bebidas',
          rows: [MENU_HEADERS, ['Limonada', 35, '', '', '']],
        },
        {
          name: 'Postres',
          rows: [MENU_HEADERS, ['Flan', 60, '', '', '']],
        },
      ]);

      await service.commit(TENANT, { fileBase64: payload });

      const knownCodes = new Set([
        'BEBIDAS',
        ...committed.map((row) => row.code as string),
      ]);
      const productCreates = mockManager.create.mock.calls
        .filter(([entity]) => entity === Product)
        .map(([, plain]) => plain as Record<string, unknown>);
      expect(productCreates.length).toBeGreaterThan(0);
      for (const product of productCreates) {
        expect(knownCodes.has(product.category_code as string)).toBe(true);
      }
    });
  });

  describe('concurrent category creation (orIgnore, never try/catch recovery)', () => {
    const productCreates = () =>
      mockManager.create.mock.calls
        .filter(([entity]) => entity === Product)
        .map(([, plain]) => plain as Record<string, unknown>);

    it('writes the category with a single ON CONFLICT DO NOTHING insert, not catch + re-read', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'BATIDOS',
          rows: [MENU_HEADERS, ['Malteada', 80, '', '', '']],
        },
      ]);

      await service.commit(TENANT, { fileBase64: payload });

      // Structural assertion: exactly one insert statement targeted
      // CatalogValue with orIgnore enabled. A try/catch around save()
      // cannot work here — once a statement fails inside a PostgreSQL
      // transaction, every later statement aborts with 25P02 — so the
      // only recoverable design is an insert that cannot fail.
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0].into).toBe(CatalogValue);
      expect(insertCalls[0].orIgnoreCalled).toBe(true);
      expect(insertCalls[0].values).toMatchObject({
        tenant_id: TENANT,
        catalog_type: 'SALES_PRODUCT_CATEGORY',
        code: 'BATIDOS',
        name: 'BATIDOS',
      });
      // No save-based fallback and no post-failure re-read of CatalogValue.
      expect(
        mockManager.save.mock.calls.filter(
          ([entity]) => entity === CatalogValue,
        ),
      ).toHaveLength(0);
      expect(
        mockManager.findOne.mock.calls.filter(
          ([entity]) => entity === CatalogValue,
        ),
      ).toHaveLength(0);
      expect(productCreates()[0].category_code).toBe('BATIDOS');
    });

    it('reuses the raced row via a safe read-back when the ignored insert affects 0 rows', async () => {
      seedExisting();
      const raced = {
        id: 'cv-raced',
        tenant_id: TENANT,
        catalog_type: 'SALES_PRODUCT_CATEGORY' as const,
        code: 'BATIDOS',
        name: 'BATIDOS (otra importación)',
        is_active: true,
        sort_order: 7,
      };
      // Empty identifiers = the insert was ignored (the concurrent
      // transaction committed the same code first). No statement failed,
      // so the read-back is safe and must reuse the raced row.
      mockManager.createQueryBuilder.mockImplementation(() =>
        insertBuilder({ identifiers: [], raw: [] }),
      );
      mockManager.findOne.mockImplementation((entity: unknown) => {
        if (entity === CatalogValue) return Promise.resolve(raced);
        return Promise.resolve(null);
      });
      const payload = await buildWorkbookBase64([
        {
          name: 'BATIDOS',
          rows: [MENU_HEADERS, ['Malteada', 80, '', '', '']],
        },
      ]);

      const summary = await service.commit(TENANT, { fileBase64: payload });

      expect(productCreates()[0].category_code).toBe('BATIDOS');
      // Honest warning semantics: this import created nothing, so it must
      // not claim "Created new category" for a row another import made.
      expect(
        summary.warnings.some((w) =>
          w.message.includes('Created new category'),
        ),
      ).toBe(false);
      expect(raced.name).toBe('BATIDOS (otra importación)');
    });

    it('fails closed when an ignored insert is followed by no readable row', async () => {
      seedExisting();
      mockManager.createQueryBuilder.mockImplementation(() =>
        insertBuilder({ identifiers: [], raw: [] }),
      );
      // findOne resolves null for CatalogValue (seedExisting default).
      const payload = await buildWorkbookBase64([
        {
          name: 'BATIDOS',
          rows: [MENU_HEADERS, ['Malteada', 80, '', '', '']],
        },
      ]);

      await expect(
        service.commit(TENANT, { fileBase64: payload }),
      ).rejects.toThrow(/BATIDOS/);
      expect(productCreates()).toHaveLength(0);
    });
  });

  describe('empty canonical code (fail closed)', () => {
    const starSheetPayload = async () =>
      buildWorkbookBase64([
        {
          name: '★',
          rows: [MENU_HEADERS, ['Estrella', 50, '', '', '']],
        },
      ]);

    it('flags a worksheet whose name normalizes to an empty category code', async () => {
      seedExisting();
      const payload = await starSheetPayload();

      const summary = await service.preview(TENANT, { fileBase64: payload });

      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]).toMatchObject({ sheet: '★', row: 1 });
      expect(summary.errors[0].message).toContain('★');
      expect(summary.errors[0].message).toMatch(/category code/i);
    });

    it('fails a commit closed for an empty-code sheet, writing no product or catalog row', async () => {
      seedExisting();
      const payload = await starSheetPayload();

      await expect(
        service.commit(TENANT, { fileBase64: payload }),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(insertCalls).toHaveLength(0);
      expect(
        mockManager.create.mock.calls.filter(
          ([entity]) => entity === Product || entity === CatalogValue,
        ),
      ).toHaveLength(0);
    });
  });

  describe('row errors (fail closed)', () => {
    it('flags conflicting prices for the same product as a row error keeping the first-seen price', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'CAFÉ HELADO',
          rows: [
            MENU_HEADERS,
            ['Frappé', 95, 'Café Molido', '0,02', 'KG'],
            ['Frappé', 100, 'Leche', '0,2', 'L'],
          ],
        },
      ]);

      const summary = await service.preview(TENANT, { fileBase64: payload });

      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]).toMatchObject({
        sheet: 'CAFÉ HELADO',
        row: 3,
      });
      expect(summary.errors[0].message).toContain('Conflicting precio');
    });

    it('fails a commit closed when any row error exists, writing nothing', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'CAFÉ HELADO',
          rows: [
            MENU_HEADERS,
            ['Frappé', 95, 'Café Molido', '0,02', 'KG'],
            ['Frappé', 100, 'Leche', '0,2', 'L'],
          ],
        },
      ]);

      await expect(
        service.commit(TENANT, { fileBase64: payload }),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('reports missing producto and invalid numbers as per-row errors', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'POSTRES',
          rows: [
            MENU_HEADERS,
            ['', 10, 'Leche', '1', 'L'],
            ['Flan', 'no-es-precio', '', '', ''],
          ],
        },
      ]);

      const summary = await service.preview(TENANT, { fileBase64: payload });

      expect(summary.errors).toHaveLength(2);
      expect(summary.errors[0].row).toBe(2);
      expect(summary.errors[0].message).toContain('producto');
      expect(summary.errors[1].row).toBe(3);
      expect(summary.errors[1].message).toContain('precio');
    });

    it('warns for sheets with no data rows', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        { name: 'VACÍA', rows: [MENU_HEADERS] },
      ]);

      const summary = await service.preview(TENANT, { fileBase64: payload });

      expect(summary.errors).toEqual([]);
      expect(summary.warnings).toHaveLength(1);
      expect(summary.warnings[0].sheet).toBe('VACÍA');
    });
  });

  describe('malformed workbooks (fail closed)', () => {
    it('rejects a sheet with wrong columns with a clear message', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([
        {
          name: 'CAFÉ',
          rows: [
            ['Nombre', 'Costo'],
            ['Espresso', 45],
          ],
        },
      ]);

      await expect(
        service.preview(TENANT, { fileBase64: payload }),
      ).rejects.toThrow(
        /Sheet 'CAFÉ' is missing required column\(s\).*producto.*insumo.*cantidad.*unidad/,
      );
    });

    it('rejects a sheet with no header row at all', async () => {
      seedExisting();
      const payload = await buildWorkbookBase64([{ name: 'VACÍA', rows: [] }]);

      await expect(
        service.preview(TENANT, { fileBase64: payload }),
      ).rejects.toThrow(/missing required column/);
    });

    it('rejects invalid base64 and non-workbook payloads', async () => {
      seedExisting();

      await expect(
        service.preview(TENANT, { fileBase64: '!!!not-base64!!!' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.preview(TENANT, {
          fileBase64: Buffer.from('not an xlsx').toString('base64'),
        }),
      ).rejects.toThrow(/not a readable .xlsx workbook/);
    });

    it('rejects payloads above the ~5 MB base64 cap with a clear message', async () => {
      seedExisting();
      const oversized = 'a'.repeat(5 * 1024 * 1024 + 1);

      await expect(
        service.preview(TENANT, { fileBase64: oversized }),
      ).rejects.toThrow(/base64 exceeds the 5 MB limit/);
    });
  });

  describe('tenant binding', () => {
    it('rejects a blank tenant before any transaction or parsing', async () => {
      const payload = await twoSheetPayload();

      await expect(
        service.preview('   ', { fileBase64: payload }),
      ).rejects.toThrow('TENANT_CONTEXT_REQUIRED');
      await expect(service.commit('', { fileBase64: payload })).rejects.toThrow(
        'TENANT_CONTEXT_REQUIRED',
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.query).not.toHaveBeenCalled();
    });

    it('rides runInTenantTransaction: binds app.tenant_id on the manager before the first write', async () => {
      seedExisting();
      const payload = await twoSheetPayload();

      await service.commit(TENANT, { fileBase64: payload });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [TENANT],
      );
      // Binding order: transaction-local set_config first, then the first
      // save, all on the same tenant-bound manager.
      const firstSaveOrder = mockManager.save.mock.invocationCallOrder[0];
      expect(mockManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        firstSaveOrder,
      );
      // No pooled repository access: every read/write resolves from the
      // tenant-bound manager.
      expect(dataSource.getRepository).not.toHaveBeenCalled();
    });

    it('preview never writes, commit writes through the same manager', async () => {
      seedExisting();
      const payload = await twoSheetPayload();

      await service.preview(TENANT, { fileBase64: payload });
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(mockManager.create).not.toHaveBeenCalled();

      mockManager.find.mockClear();
      mockManager.create.mockClear();
      mockManager.save.mockClear();

      await service.commit(TENANT, { fileBase64: payload });
      expect(mockManager.save).toHaveBeenCalled();
    });
  });

  describe('template generation (GET /template)', () => {
    const EXPECTED_TEMPLATE_SHEETS = [
      'CÓMO LLENARLA',
      'CAFÉ CALIENTE',
      'CAFÉ HELADO',
      'DESAYUNOS',
      'BATIDOS',
      'BEBIDAS',
      'POSTRES',
    ];

    const loadTemplate = async (): Promise<ExcelJS.Workbook> => {
      const buffer = await service.buildTemplate();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      return workbook;
    };

    it('builds a real .xlsx with the guide sheet first and one sheet per SOHO category', async () => {
      const workbook = await loadTemplate();
      expect(workbook.worksheets.map((ws) => ws.name)).toEqual(
        EXPECTED_TEMPLATE_SHEETS,
      );
    });

    it('declares the five BOM headers (bold) on every data sheet', async () => {
      const workbook = await loadTemplate();
      for (const name of EXPECTED_TEMPLATE_SHEETS.slice(1)) {
        const sheet = workbook.getWorksheet(name);
        expect(sheet).toBeDefined();
        const headerRow = sheet!.getRow(1);
        expect(headerRow.getCell(1).value).toBe('producto');
        expect(headerRow.getCell(2).value).toBe('precio');
        expect(headerRow.getCell(3).value).toBe('insumo');
        expect(headerRow.getCell(4).value).toBe('cantidad');
        expect(headerRow.getCell(5).value).toBe('unidad');
        expect(headerRow.getCell(1).font?.bold).toBe(true);
        expect(headerRow.getCell(5).font?.bold).toBe(true);
      }
    });

    it('ships one fully filled example row per data sheet', async () => {
      const workbook = await loadTemplate();
      for (const name of EXPECTED_TEMPLATE_SHEETS.slice(1)) {
        const sheet = workbook.getWorksheet(name);
        expect(sheet).toBeDefined();
        const row = sheet!.getRow(2);
        expect(row.getCell(1).value).toBe('Cappuccino 8oz');
        expect(row.getCell(2).value).toBe(110);
        expect(row.getCell(3).value).toBe('Café molido');
        expect(row.getCell(4).value).toBe(18);
        expect(row.getCell(5).value).toBe('g');
      }
    });

    it('contains plain-Spanish instructions on the guide sheet', async () => {
      const workbook = await loadTemplate();
      const guide = workbook.getWorksheet('CÓMO LLENARLA');
      expect(guide).toBeDefined();
      const lines: string[] = [];
      guide!.eachRow((row) => {
        const text = row.getCell(1).value;
        if (typeof text === 'string' && text.trim()) lines.push(text);
      });
      expect(lines.length).toBeGreaterThanOrEqual(3);
      const joined = lines.join(' ');
      expect(joined).toContain('producto');
      expect(joined).toContain('categoría');
    });

    it('round-trips: the generated template passes preview with no errors (guide sheet ignored)', async () => {
      seedExisting();
      const buffer = await service.buildTemplate();
      const fileBase64 = Buffer.from(buffer as unknown as ArrayBuffer).toString(
        'base64',
      );

      const summary = await service.preview(TENANT, { fileBase64 });

      // The guide sheet is not a category and produces no error or warning.
      expect(summary.errors).toEqual([]);
      expect(summary.warnings).toEqual([]);
      expect(summary.categories).toBe(6);
      // The same example product repeated across all six sheets is ONE product.
      expect(summary.productsToCreate).toBe(1);
      expect(summary.recipesToCreate).toBe(1);
      expect(summary.insumosToCreate.map((i) => i.name)).toEqual([
        'Café molido',
      ]);
    });
  });
});
