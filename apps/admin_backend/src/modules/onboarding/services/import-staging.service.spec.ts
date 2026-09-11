import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ImportStagingService } from './import-staging.service';
import {
  ImportStaging,
  ImportStagingStatus,
} from '../entities/import-staging.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  UploadBatchDto,
  UploadRawCsvDto,
  CommitImportDto,
  ImportRowDto,
} from '../dto/import-staging.dto';
import {
  ProductImportSession,
  ProductImportSessionStatus,
} from '../entities/product-import-session.entity';
import { LegacyOnboardingMigrationReceipt } from '../entities/legacy-migration-receipt.entity';
import { CanonicalCsvParserService } from './canonical-csv-parser.service';

describe('ImportStagingService (Unit & Triangulation)', () => {
  let service: ImportStagingService;
  let stagingRepo: jest.Mocked<Repository<ImportStaging>>;
  let productRepo: jest.Mocked<Repository<Product>>;
  let sessionRepo: jest.Mocked<Repository<ProductImportSession>>;
  let receiptRepo: jest.Mocked<Repository<LegacyOnboardingMigrationReceipt>>;
  let dataSource: jest.Mocked<DataSource>;
  let mockManager: jest.Mocked<EntityManager>;

  const tenantId = 'tenant-uuid-1';
  const sessionToken = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    stagingRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((plain: unknown) => plain as ImportStaging),
      save: jest.fn((items: unknown) => Promise.resolve(items)),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Repository<ImportStaging>>;

    productRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((plain: unknown) => plain as Product),
      save: jest.fn((items: unknown) => Promise.resolve(items)),
    } as unknown as jest.Mocked<Repository<Product>>;

    sessionRepo = {
      findOne: jest.fn(),
      create: jest.fn((plain: unknown) => plain as ProductImportSession),
      save: jest.fn((item: unknown) => Promise.resolve(item)),
    } as unknown as jest.Mocked<Repository<ProductImportSession>>;

    receiptRepo = {
      create: jest.fn(
        (plain: unknown) => plain as LegacyOnboardingMigrationReceipt,
      ),
      save: jest.fn((item: unknown) => Promise.resolve(item)),
    } as unknown as jest.Mocked<Repository<LegacyOnboardingMigrationReceipt>>;

    mockManager = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(
        (_entityClass: unknown, plain: unknown) => plain as object,
      ),
      save: jest.fn((_entityClass: unknown, entities: unknown) =>
        Promise.resolve(entities),
      ),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn((cb: (mgr: EntityManager) => Promise<unknown>) =>
        cb(mockManager),
      ),
    } as unknown as jest.Mocked<DataSource>;

    service = new ImportStagingService(
      stagingRepo,
      productRepo,
      dataSource,
      sessionRepo,
      receiptRepo,
      new CanonicalCsvParserService(),
    );
  });

  describe('uploadBatch (Parsing, Sanitization & Triangulation)', () => {
    it('throws BadRequestException if tenantId is missing or empty', async () => {
      const dto: UploadBatchDto = {
        sessionToken,
        rows: [{ nombre: 'Gaseosa', precioVenta: '25' }],
      };

      await expect(service.uploadBatch('   ', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if rows array is empty', async () => {
      const dto: UploadBatchDto = {
        sessionToken,
        rows: [],
      };

      await expect(service.uploadBatch(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('processes clean valid rows in chunks (UC-01 valid case)', async () => {
      const dto: UploadBatchDto = {
        sessionToken,
        rows: [
          {
            nombre: 'Coca Cola 500ml',
            sku: 'SKU-001',
            precioVenta: '35.00',
            costoInsumo: '20.00',
            categoria: 'Bebidas',
            porcentajeIva: '15',
            uom: 'UN',
            stockInicial: '50',
          },
          {
            nombre: 'Agua 1L',
            sku: 'SKU-002',
            precioVenta: 25,
            costoInsumo: 12,
            categoria: 'Bebidas',
            porcentajeIva: 0,
            uom: 'UN',
            stockInicial: 100,
          },
        ],
      };

      mockManager.save.mockImplementation(
        (_entityClass: unknown, items: unknown) => Promise.resolve(items),
      );

      const result = await service.uploadBatch(tenantId, dto);

      expect(result).toMatchObject({
        sessionToken,
        totalRows: 2,
        validRows: 2,
        errorRows: 0,
        errors: [],
      });
    });

    it('identifies and flags formatting errors (UC-01 text price, negative cost, missing name)', async () => {
      const dto: UploadBatchDto = {
        sessionToken,
        rows: [
          {
            nombre: '', // Empty name -> ERROR
            precioVenta: '50',
          },
          {
            nombre: 'Galletas Oreo',
            precioVenta: 'Gratis', // Non numeric price -> ERROR
          },
          {
            nombre: 'Papas Tosty',
            precioVenta: '20.00',
            costoInsumo: '-5.00', // Negative cost -> ERROR
          },
          {
            nombre: 'Cerveza Toña',
            precioVenta: 'C$ 65.00', // Valid price with currency prefix
            costoInsumo: 'C$ 40.00',
            categoria: 'Bebidas',
          },
        ],
      };

      mockManager.save.mockImplementation(
        (_entityClass: unknown, items: unknown) => Promise.resolve(items),
      );

      const result = await service.uploadBatch(tenantId, dto);

      expect(result.totalRows).toBe(4);
      expect(result.validRows).toBe(1); // Only Cerveza Toña
      expect(result.errorRows).toBe(3);
      expect(result.errors).toHaveLength(3);

      expect(result.errors[0].reason).toContain('nombre');
      expect(result.errors[1].reason).toContain('precio');
      expect(result.errors[2].reason).toContain('costo');
    });

    it('chunks uploads exceeding 100 rows into multiple sequential chunks', async () => {
      const rows: ImportRowDto[] = [];
      for (let i = 1; i <= 150; i++) {
        rows.push({
          nombre: `Producto ${i}`,
          precioVenta: 100 + i,
        });
      }

      const dto: UploadBatchDto = {
        sessionToken,
        rows,
      };

      let stagingChunkCount = 0;
      mockManager.save.mockImplementation(
        (entityClass: unknown, items: unknown) => {
          if (entityClass === ImportStaging) {
            stagingChunkCount++;
          }
          return Promise.resolve(items);
        },
      );

      const result = await service.uploadBatch(tenantId, dto);

      expect(result.totalRows).toBe(150);
      expect(result.validRows).toBe(150);
      expect(result.errorRows).toBe(0);
      expect(stagingChunkCount).toBe(2); // 100 rows chunk 1 + 50 rows chunk 2
    });
  });

  describe('commitImport (Staging Injection, Idempotency & Conflict Modes)', () => {
    it('throws BadRequestException in ALL_OR_NOTHING mode when errors exist in batch', async () => {
      const stagedRows: ImportStaging[] = [
        {
          id: '1',
          tenant_id: tenantId,
          token_sesion_importacion: sessionToken,
          raw_nombre: 'Producto OK',
          raw_sku: 'SKU-1',
          raw_precio_venta: '50',
          raw_costo_insumo: '30',
          raw_categoria: 'General',
          raw_porcentaje_iva: '15',
          raw_uom: 'UN',
          raw_stock_inicial: '10',
          parsed_nombre: 'Producto OK',
          parsed_sku: 'SKU-1',
          parsed_precio_venta: 50,
          parsed_costo_insumo: 30,
          parsed_categoria: 'General',
          parsed_porcentaje_iva: 15,
          parsed_uom: 'UN',
          parsed_stock_inicial: 10,
          estado_fila: ImportStagingStatus.VALIDO,
          mensaje_error_detalle: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '2',
          tenant_id: tenantId,
          token_sesion_importacion: sessionToken,
          raw_nombre: 'Producto Malo',
          raw_sku: 'SKU-2',
          raw_precio_venta: 'Gratis',
          raw_costo_insumo: '0',
          raw_categoria: 'General',
          raw_porcentaje_iva: '0',
          raw_uom: 'UN',
          raw_stock_inicial: '0',
          parsed_nombre: null,
          parsed_sku: null,
          parsed_precio_venta: null,
          parsed_costo_insumo: null,
          parsed_categoria: null,
          parsed_porcentaje_iva: null,
          parsed_uom: null,
          parsed_stock_inicial: null,
          estado_fila: ImportStagingStatus.ERROR,
          mensaje_error_detalle: 'Precio no numérico',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockManager.find.mockImplementation((entityClass: unknown) => {
        if (entityClass === ImportStaging) return Promise.resolve(stagedRows);
        return Promise.resolve([] as unknown as never[]);
      });

      const commitDto: CommitImportDto = {
        sessionToken,
        mode: 'ALL_OR_NOTHING',
        duplicateResolution: 'REPLACE',
      };

      await expect(service.commitImport(tenantId, commitDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('injects valid staging rows into live products table in VALID_ONLY mode', async () => {
      const stagedRows: ImportStaging[] = [
        {
          id: '1',
          tenant_id: tenantId,
          token_sesion_importacion: sessionToken,
          raw_nombre: 'Hamburguesa Doble',
          raw_sku: 'HAM-01',
          raw_precio_venta: '250',
          raw_costo_insumo: '120',
          raw_categoria: 'Comida',
          raw_porcentaje_iva: '15',
          raw_uom: 'UN',
          raw_stock_inicial: '20',
          parsed_nombre: 'Hamburguesa Doble',
          parsed_sku: 'HAM-01',
          parsed_precio_venta: 250,
          parsed_costo_insumo: 120,
          parsed_categoria: 'Comida',
          parsed_porcentaje_iva: 15,
          parsed_uom: 'UN',
          parsed_stock_inicial: 20,
          estado_fila: ImportStagingStatus.VALIDO,
          mensaje_error_detalle: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockManager.find.mockImplementation((entityClass: unknown) => {
        if (entityClass === ImportStaging) return Promise.resolve(stagedRows);
        if (entityClass === Product)
          return Promise.resolve([] as unknown as never[]);
        return Promise.resolve([] as unknown as never[]);
      });

      const commitDto: CommitImportDto = {
        sessionToken,
        mode: 'VALID_ONLY',
        duplicateResolution: 'REPLACE',
      };

      const result = await service.commitImport(tenantId, commitDto);

      expect(result).toMatchObject({
        sessionToken,
        mode: 'VALID_ONLY',
        productsCreated: 1,
        productsUpdated: 0,
        productsSkipped: 0,
        totalCommitted: 1,
      });
      expect(result.committedAt).toBeInstanceOf(Date);
      expect(mockManager.create).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({
          tenant_id: tenantId,
          name: 'Hamburguesa Doble',
          sellPrice: 250,
          averageCost: 0,
          stock: 0,
        }),
      );
    });

    it('handles duplicate items with REPLACE duplicateResolution (UC-03 update existing)', async () => {
      const existingProduct: Product = {
        id: 'prod-existing-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Hamburguesa Doble',
        uom: 'UN',
        product_type: 'SIMPLE' as never,
        category_code: null,
        sellPrice: 200,
        averageCost: 100,
        stock: 5,
        is_perishable: false,
        is_active: true,
        tax_rate: 0.15,
        is_tax_exempt: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const stagedRows: ImportStaging[] = [
        {
          id: '1',
          tenant_id: tenantId,
          token_sesion_importacion: sessionToken,
          raw_nombre: 'Hamburguesa Doble',
          raw_sku: 'HAM-01',
          raw_precio_venta: '250', // Updated price
          raw_costo_insumo: '130',
          raw_categoria: 'Comida',
          raw_porcentaje_iva: '15',
          raw_uom: 'UN',
          raw_stock_inicial: '20',
          parsed_nombre: 'Hamburguesa Doble',
          parsed_sku: 'HAM-01',
          parsed_precio_venta: 250,
          parsed_costo_insumo: 130,
          parsed_categoria: 'Comida',
          parsed_porcentaje_iva: 15,
          parsed_uom: 'UN',
          parsed_stock_inicial: 20,
          estado_fila: ImportStagingStatus.VALIDO,
          mensaje_error_detalle: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockManager.find.mockImplementation((entityClass: unknown) => {
        if (entityClass === ImportStaging) return Promise.resolve(stagedRows);
        if (entityClass === Product) return Promise.resolve([existingProduct]);
        return Promise.resolve([] as unknown as never[]);
      });

      const commitDto: CommitImportDto = {
        sessionToken,
        mode: 'VALID_ONLY',
        duplicateResolution: 'REPLACE',
      };

      const result = await service.commitImport(tenantId, commitDto);

      expect(result).toMatchObject({
        sessionToken,
        mode: 'VALID_ONLY',
        productsCreated: 0,
        productsUpdated: 1,
        productsSkipped: 0,
        totalCommitted: 1,
      });
      expect(existingProduct.sellPrice).toBe(250);
      expect(existingProduct.averageCost).toBe(100);
      expect(existingProduct.stock).toBe(5);
    });

    it('handles duplicate items with SKIP duplicateResolution (UC-03 ignore duplicates)', async () => {
      const existingProduct: Product = {
        id: 'prod-existing-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Hamburguesa Doble',
        uom: 'UN',
        product_type: 'SIMPLE' as never,
        category_code: null,
        sellPrice: 200,
        averageCost: 100,
        stock: 5,
        is_perishable: false,
        is_active: true,
        tax_rate: 0.15,
        is_tax_exempt: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const stagedRows: ImportStaging[] = [
        {
          id: '1',
          tenant_id: tenantId,
          token_sesion_importacion: sessionToken,
          raw_nombre: 'Hamburguesa Doble',
          raw_sku: 'HAM-01',
          raw_precio_venta: '250',
          raw_costo_insumo: '130',
          raw_categoria: 'Comida',
          raw_porcentaje_iva: '15',
          raw_uom: 'UN',
          raw_stock_inicial: '20',
          parsed_nombre: 'Hamburguesa Doble',
          parsed_sku: 'HAM-01',
          parsed_precio_venta: 250,
          parsed_costo_insumo: 130,
          parsed_categoria: 'Comida',
          parsed_porcentaje_iva: 15,
          parsed_uom: 'UN',
          parsed_stock_inicial: 20,
          estado_fila: ImportStagingStatus.VALIDO,
          mensaje_error_detalle: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockManager.find.mockImplementation((entityClass: unknown) => {
        if (entityClass === ImportStaging) return Promise.resolve(stagedRows);
        if (entityClass === Product) return Promise.resolve([existingProduct]);
        return Promise.resolve([] as unknown as never[]);
      });

      const commitDto: CommitImportDto = {
        sessionToken,
        mode: 'VALID_ONLY',
        duplicateResolution: 'SKIP',
      };

      const result = await service.commitImport(tenantId, commitDto);

      expect(result).toMatchObject({
        sessionToken,
        mode: 'VALID_ONLY',
        productsCreated: 0,
        productsUpdated: 0,
        productsSkipped: 1,
        totalCommitted: 0,
      });
      expect(existingProduct.sellPrice).toBe(200); // Unchanged
    });
  });

  describe('getFailedRows', () => {
    it('returns error rows with human-readable diagnostics', async () => {
      const errorRows: ImportStaging[] = [
        {
          id: '1',
          tenant_id: tenantId,
          token_sesion_importacion: sessionToken,
          raw_nombre: 'Producto Roto',
          raw_sku: 'SKU-E1',
          raw_precio_venta: 'Gratis',
          raw_costo_insumo: '-10',
          raw_categoria: 'General',
          raw_porcentaje_iva: '0',
          raw_uom: 'UN',
          raw_stock_inicial: '0',
          parsed_nombre: null,
          parsed_sku: null,
          parsed_precio_venta: null,
          parsed_costo_insumo: null,
          parsed_categoria: null,
          parsed_porcentaje_iva: null,
          parsed_uom: null,
          parsed_stock_inicial: null,
          estado_fila: ImportStagingStatus.ERROR,
          mensaje_error_detalle: 'El precio de venta no es numérico',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      stagingRepo.find.mockResolvedValueOnce(errorRows);

      const result = await service.getFailedRows(tenantId, sessionToken);

      expect(result).toHaveLength(1);
      expect(result[0].rawNombre).toBe('Producto Roto');
      expect(result[0].reason).toBe('El precio de venta no es numérico');
    });

    it('throws NotFoundException when sessionToken has no staged rows', async () => {
      stagingRepo.find.mockResolvedValueOnce([]);

      await expect(
        service.getFailedRows(tenantId, 'non-existent-token'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadRawCsv (Raw CSV Parsing, Session Lifecycle & Triangulation)', () => {
    it('parses raw CSV text, stages rows with row_ordinal and creates ProductImportSession', async () => {
      productRepo.find.mockResolvedValue([]);
      sessionRepo.findOne.mockResolvedValue(null);

      const rawCsv = [
        'producto,precio,unidad_venta,codigo_barras',
        'Hamburguesa Especial,160.00,UN,743210',
        'Gaseosa en Lata,30.00,UN,112233',
      ].join('\n');

      const dto: UploadRawCsvDto = {
        sessionToken,
        csvContent: rawCsv,
        fileName: 'catalogo.csv',
      };

      const result = await service.uploadRawCsv(tenantId, dto);

      expect(result.sessionToken).toBe(sessionToken);
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(2);
      expect(result.errorRows).toBe(0);

      expect(mockManager.save).toHaveBeenCalledWith(
        ProductImportSession,
        expect.objectContaining({
          tenant_id: tenantId,
          total_rows: 2,
          valid_rows: 2,
          error_rows: 0,
        }),
      );
    });

    it('detects existing duplicates during staging and prepares matchedBy and fieldsToChange', async () => {
      const existingProduct: Product = {
        id: 'prod-dup-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Hamburguesa Especial',
        uom: 'UN',
        product_type: 'SIMPLE' as never,
        category_code: null,
        sellPrice: 140,
        averageCost: 70,
        stock: 10,
        is_perishable: false,
        is_active: true,
        tax_rate: 0.15,
        is_tax_exempt: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      productRepo.find.mockResolvedValue([existingProduct]);
      sessionRepo.findOne.mockResolvedValue(null);

      const rawCsv = [
        'nombre,precio_venta,uom',
        'Hamburguesa Especial,180.00,UN',
      ].join('\n');

      const dto: UploadRawCsvDto = {
        sessionToken,
        csvContent: rawCsv,
      };

      await service.uploadRawCsv(tenantId, dto);

      const savedBatch = mockManager.save.mock.calls[0][1] as ImportStaging[];
      expect(savedBatch[0].matched_by).toBe('NORMALIZED_NAME');
      expect(savedBatch[0].target_product_id).toBe('prod-dup-1');
      expect(savedBatch[0].fields_to_change).toContain('sellPrice');
    });
  });

  describe('getPreview (Duplicate Detection, Conflict Resolution & Preview Data)', () => {
    it('returns preview including duplicates, fieldsToChange, and unsupported headers', async () => {
      const sessionEntity: ProductImportSession = {
        id: sessionToken,
        tenant_id: tenantId,
        onboarding_session_id: null,
        status: ProductImportSessionStatus.READY,
        parser_contract_version: 'v1.0',
        source_hash: 'hash-1',
        file_name: 'test.csv',
        total_rows: 2,
        valid_rows: 2,
        error_rows: 0,
        committed_rows: 0,
        skipped_rows: 0,
        commit_mode: null,
        duplicate_policy: null,
        created_at: new Date(),
        updated_at: new Date(),
        committed_at: null,
        expires_at: null,
      };

      const stagedRow1: ImportStaging = {
        id: 'staged-1',
        tenant_id: tenantId,
        token_sesion_importacion: sessionToken,
        raw_nombre: 'Hamburguesa',
        raw_sku: null,
        raw_precio_venta: '180',
        raw_costo_insumo: null,
        raw_categoria: null,
        raw_porcentaje_iva: null,
        raw_uom: null,
        raw_stock_inicial: null,
        parsed_nombre: 'Hamburguesa',
        parsed_sku: null,
        parsed_precio_venta: 180,
        parsed_costo_insumo: null,
        parsed_categoria: 'General',
        parsed_porcentaje_iva: 0,
        parsed_uom: 'UN',
        parsed_stock_inicial: null,
        estado_fila: ImportStagingStatus.VALIDO,
        mensaje_error_detalle: null,
        row_ordinal: 1,
        matched_by: 'NORMALIZED_NAME',
        target_product_id: 'prod-1',
        fields_to_change: ['sellPrice'],
        conflict_reason: null,
        unsupported_fields: ['codigo_barras'],
        unknown_columns: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      sessionRepo.findOne.mockResolvedValue(sessionEntity);
      stagingRepo.find.mockResolvedValue([stagedRow1]);
      productRepo.findOne.mockResolvedValue({
        id: 'prod-1',
        name: 'Hamburguesa',
        sellPrice: 150,
        uom: 'UN',
      } as Product);

      const preview = await service.getPreview(tenantId, sessionToken);

      expect(preview.sessionToken).toBe(sessionToken);
      expect(preview.duplicatesCount).toBe(1);
      expect(preview.duplicates[0]).toMatchObject({
        rowOrdinal: 1,
        productName: 'Hamburguesa',
        matchedBy: 'NORMALIZED_NAME',
        targetProductId: 'prod-1',
        currentPrice: 150,
        newPrice: 180,
        fieldsToChange: ['sellPrice'],
        isConflict: false,
      });
      expect(preview.unsupportedColumns).toContain('codigo_barras');
    });
  });
});
