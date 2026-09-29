import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { MenuImportService } from './menu-import.service';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';

const TENANT = 'tenant-uuid-1';

type SheetFixture = {
  name: string;
  rows: (string | number | null)[][];
};

/**
 * Builds a real multi-sheet .xlsx workbook fully in memory with exceljs and
 * returns it as the base64 payload the controller transport would post.
 */
const buildWorkbookBase64 = async (
  sheets: SheetFixture[],
): Promise<string> => {
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
  };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let idSequence: number;

  beforeEach(() => {
    idSequence = 0;
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
    };
    dataSource = {
      transaction: jest.fn(
        (cb: (mgr: unknown) => Promise<unknown>) => cb(mockManager),
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
  }) => {
    mockManager.find.mockImplementation((entity: unknown) => {
      if (entity === Insumo) return Promise.resolve(overrides?.insumos ?? []);
      if (entity === Product) return Promise.resolve(overrides?.products ?? []);
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
      const slice = productCreates.find(
        (p) => p.name === 'Tres Leches Slice',
      );
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
        ([entity]) =>
          entity === RecipeVersion || entity === RecipeDetail,
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
          rows: [['Nombre', 'Costo'], ['Espresso', 45]],
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
      const payload = await buildWorkbookBase64([
        { name: 'VACÍA', rows: [] },
      ]);

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
      await expect(
        service.commit('', { fileBase64: payload }),
      ).rejects.toThrow('TENANT_CONTEXT_REQUIRED');

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
      const firstSaveOrder =
        mockManager.save.mock.invocationCallOrder[0];
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
      const fileBase64 = Buffer.from(
        buffer as unknown as ArrayBuffer,
      ).toString('base64');

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
