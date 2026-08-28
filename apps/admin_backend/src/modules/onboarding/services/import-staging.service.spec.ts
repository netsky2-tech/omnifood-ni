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
  CommitImportDto,
  ImportRowDto,
} from '../dto/import-staging.dto';

describe('ImportStagingService (Unit & Triangulation)', () => {
  let service: ImportStagingService;
  let stagingRepo: jest.Mocked<Repository<ImportStaging>>;
  let productRepo: jest.Mocked<Repository<Product>>;
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
    } as unknown as jest.Mocked<Repository<ImportStaging>>;

    productRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((plain: unknown) => plain as Product),
      save: jest.fn((items: unknown) => Promise.resolve(items)),
    } as unknown as jest.Mocked<Repository<Product>>;

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

    service = new ImportStagingService(stagingRepo, productRepo, dataSource);
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

      let saveCallCount = 0;
      mockManager.save.mockImplementation(
        (_entityClass: unknown, items: unknown) => {
          saveCallCount++;
          return Promise.resolve(items);
        },
      );

      const result = await service.uploadBatch(tenantId, dto);

      expect(result.totalRows).toBe(150);
      expect(result.validRows).toBe(150);
      expect(result.errorRows).toBe(0);
      expect(saveCallCount).toBe(2); // 100 rows chunk 1 + 50 rows chunk 2
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
    });

    it('handles duplicate items with REPLACE duplicateResolution (UC-03 update existing)', async () => {
      const existingProduct: Product = {
        id: 'prod-existing-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Hamburguesa Doble',
        uom: 'UN',
        sellPrice: 200,
        averageCost: 100,
        stock: 5,
        is_perishable: false,
        is_active: true,
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
      expect(existingProduct.averageCost).toBe(130);
    });

    it('handles duplicate items with SKIP duplicateResolution (UC-03 ignore duplicates)', async () => {
      const existingProduct: Product = {
        id: 'prod-existing-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Hamburguesa Doble',
        uom: 'UN',
        sellPrice: 200,
        averageCost: 100,
        stock: 5,
        is_perishable: false,
        is_active: true,
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
});
