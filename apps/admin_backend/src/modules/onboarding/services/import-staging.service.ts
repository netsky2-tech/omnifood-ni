import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  ImportStaging,
  ImportStagingStatus,
} from '../entities/import-staging.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  CommitImportDto,
  CommitMode,
  CommitSummaryResponse,
  DuplicateResolution,
  ImportRowDto,
  RowErrorDiagnostic,
  UploadBatchDto,
  UploadSummaryResponse,
} from '../dto/import-staging.dto';

const CHUNK_SIZE = 100;

interface ValidationResult {
  status: ImportStagingStatus;
  errorMessage: string | null;
  parsedNombre: string | null;
  parsedSku: string | null;
  parsedPrecioVenta: number | null;
  parsedCostoInsumo: number | null;
  parsedCategoria: string | null;
  parsedPorcentajeIva: number | null;
  parsedUom: string | null;
  parsedStockInicial: number | null;
}

@Injectable()
export class ImportStagingService {
  constructor(
    @InjectRepository(ImportStaging)
    private readonly stagingRepo: Repository<ImportStaging>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  private cleanAndParseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }
    if (typeof value !== 'string') {
      return null;
    }

    // Clean currency and special symbols
    const cleaned = value
      .replace(/C\$/gi, '')
      .replace(/\$/g, '')
      .replace(/NIO/gi, '')
      .replace(/%/g, '')
      .replace(/,/g, '')
      .trim();

    if (!cleaned) return null;

    const parsed = Number(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  private validateRow(row: ImportRowDto): ValidationResult {
    const rawNombre =
      typeof row.nombre === 'string'
        ? row.nombre.trim()
        : String(row.nombre ?? '').trim();
    if (!rawNombre) {
      return {
        status: ImportStagingStatus.ERROR,
        errorMessage: 'El nombre del producto es obligatorio',
        parsedNombre: null,
        parsedSku: null,
        parsedPrecioVenta: null,
        parsedCostoInsumo: null,
        parsedCategoria: null,
        parsedPorcentajeIva: null,
        parsedUom: null,
        parsedStockInicial: null,
      };
    }

    const parsedPrecio = this.cleanAndParseNumber(row.precioVenta);
    if (parsedPrecio === null) {
      return {
        status: ImportStagingStatus.ERROR,
        errorMessage: `El precio de venta '${String(row.precioVenta)}' no es numérico`,
        parsedNombre: null,
        parsedSku: null,
        parsedPrecioVenta: null,
        parsedCostoInsumo: null,
        parsedCategoria: null,
        parsedPorcentajeIva: null,
        parsedUom: null,
        parsedStockInicial: null,
      };
    }
    if (parsedPrecio < 0) {
      return {
        status: ImportStagingStatus.ERROR,
        errorMessage: 'El precio de venta no puede ser negativo',
        parsedNombre: null,
        parsedSku: null,
        parsedPrecioVenta: null,
        parsedCostoInsumo: null,
        parsedCategoria: null,
        parsedPorcentajeIva: null,
        parsedUom: null,
        parsedStockInicial: null,
      };
    }

    let parsedCosto = 0;
    if (
      row.costoInsumo !== undefined &&
      row.costoInsumo !== null &&
      row.costoInsumo !== ''
    ) {
      const parsed = this.cleanAndParseNumber(row.costoInsumo);
      if (parsed === null) {
        return {
          status: ImportStagingStatus.ERROR,
          errorMessage: `El costo inicial '${String(row.costoInsumo)}' no es numérico`,
          parsedNombre: null,
          parsedSku: null,
          parsedPrecioVenta: null,
          parsedCostoInsumo: null,
          parsedCategoria: null,
          parsedPorcentajeIva: null,
          parsedUom: null,
          parsedStockInicial: null,
        };
      }
      if (parsed < 0) {
        return {
          status: ImportStagingStatus.ERROR,
          errorMessage: 'El costo inicial no puede ser negativo',
          parsedNombre: null,
          parsedSku: null,
          parsedPrecioVenta: null,
          parsedCostoInsumo: null,
          parsedCategoria: null,
          parsedPorcentajeIva: null,
          parsedUom: null,
          parsedStockInicial: null,
        };
      }
      parsedCosto = parsed;
    }

    let parsedStock = 0;
    if (
      row.stockInicial !== undefined &&
      row.stockInicial !== null &&
      row.stockInicial !== ''
    ) {
      const parsed = this.cleanAndParseNumber(row.stockInicial);
      if (parsed === null) {
        return {
          status: ImportStagingStatus.ERROR,
          errorMessage: `El stock inicial '${String(row.stockInicial)}' no es numérico`,
          parsedNombre: null,
          parsedSku: null,
          parsedPrecioVenta: null,
          parsedCostoInsumo: null,
          parsedCategoria: null,
          parsedPorcentajeIva: null,
          parsedUom: null,
          parsedStockInicial: null,
        };
      }
      if (parsed < 0) {
        return {
          status: ImportStagingStatus.ERROR,
          errorMessage: 'El stock inicial no puede ser negativo',
          parsedNombre: null,
          parsedSku: null,
          parsedPrecioVenta: null,
          parsedCostoInsumo: null,
          parsedCategoria: null,
          parsedPorcentajeIva: null,
          parsedUom: null,
          parsedStockInicial: null,
        };
      }
      parsedStock = parsed;
    }

    let parsedIva = 0;
    if (
      row.porcentajeIva !== undefined &&
      row.porcentajeIva !== null &&
      row.porcentajeIva !== ''
    ) {
      const parsed = this.cleanAndParseNumber(row.porcentajeIva);
      if (parsed !== null && parsed >= 0 && parsed <= 100) {
        parsedIva = parsed;
      }
    }

    const parsedSku = row.sku ? String(row.sku).trim() || null : null;
    const parsedCategoria = row.categoria
      ? String(row.categoria).trim() || 'General'
      : 'General';
    const parsedUom = row.uom ? String(row.uom).trim() || 'UN' : 'UN';

    return {
      status: ImportStagingStatus.VALIDO,
      errorMessage: null,
      parsedNombre: rawNombre,
      parsedSku,
      parsedPrecioVenta: parsedPrecio,
      parsedCostoInsumo: parsedCosto,
      parsedCategoria,
      parsedPorcentajeIva: parsedIva,
      parsedUom,
      parsedStockInicial: parsedStock,
    };
  }

  async uploadBatch(
    tenantId: string,
    dto: UploadBatchDto,
  ): Promise<UploadSummaryResponse> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    if (!dto.rows || !Array.isArray(dto.rows) || dto.rows.length === 0) {
      throw new BadRequestException(
        'El lote debe contener al menos una fila para procesar',
      );
    }

    const sessionToken = dto.sessionToken || randomUUID();
    const errors: RowErrorDiagnostic[] = [];
    let validCount = 0;
    let errorCount = 0;

    const stagedEntities: ImportStaging[] = [];

    for (let index = 0; index < dto.rows.length; index++) {
      const row = dto.rows[index];
      const validation = this.validateRow(row);

      if (validation.status === ImportStagingStatus.VALIDO) {
        validCount++;
      } else {
        errorCount++;
        errors.push({
          rowNumber: index + 1,
          rawNombre: row.nombre,
          rawSku: row.sku,
          reason: validation.errorMessage || 'Error desconocido de formato',
        });
      }

      const entity = new ImportStaging();
      entity.tenant_id = trimmedTenant;
      entity.token_sesion_importacion = sessionToken;
      entity.raw_nombre = row.nombre !== undefined ? String(row.nombre) : null;
      entity.raw_sku = row.sku !== undefined ? String(row.sku) : null;
      entity.raw_precio_venta =
        row.precioVenta !== undefined ? String(row.precioVenta) : null;
      entity.raw_costo_insumo =
        row.costoInsumo !== undefined ? String(row.costoInsumo) : null;
      entity.raw_categoria =
        row.categoria !== undefined ? String(row.categoria) : null;
      entity.raw_porcentaje_iva =
        row.porcentajeIva !== undefined ? String(row.porcentajeIva) : null;
      entity.raw_uom = row.uom !== undefined ? String(row.uom) : null;
      entity.raw_stock_inicial =
        row.stockInicial !== undefined ? String(row.stockInicial) : null;

      entity.parsed_nombre = validation.parsedNombre;
      entity.parsed_sku = validation.parsedSku;
      entity.parsed_precio_venta = validation.parsedPrecioVenta;
      entity.parsed_costo_insumo = validation.parsedCostoInsumo;
      entity.parsed_categoria = validation.parsedCategoria;
      entity.parsed_porcentaje_iva = validation.parsedPorcentajeIva;
      entity.parsed_uom = validation.parsedUom;
      entity.parsed_stock_inicial = validation.parsedStockInicial;

      entity.estado_fila = validation.status;
      entity.mensaje_error_detalle = validation.errorMessage;

      stagedEntities.push(entity);
    }

    // Process chunked storage (CHUNK_SIZE <= 100)
    await this.dataSource.transaction(async (manager: EntityManager) => {
      for (let i = 0; i < stagedEntities.length; i += CHUNK_SIZE) {
        const chunk = stagedEntities.slice(i, i + CHUNK_SIZE);
        await manager.save(ImportStaging, chunk);
      }
    });

    return {
      sessionToken,
      totalRows: dto.rows.length,
      validRows: validCount,
      errorRows: errorCount,
      errors,
    };
  }

  async commitImport(
    tenantId: string,
    dto: CommitImportDto,
  ): Promise<CommitSummaryResponse> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    const mode: CommitMode = dto.mode || 'VALID_ONLY';
    const duplicateResolution: DuplicateResolution =
      dto.duplicateResolution || 'REPLACE';

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const stagedRows = await manager.find(ImportStaging, {
        where: {
          tenant_id: trimmedTenant,
          token_sesion_importacion: dto.sessionToken,
        },
        order: { created_at: 'ASC' },
      });

      if (!stagedRows || stagedRows.length === 0) {
        throw new NotFoundException(
          `No se encontraron filas en staging para la sesión ${dto.sessionToken}`,
        );
      }

      const hasErrors = stagedRows.some(
        (r) => r.estado_fila === ImportStagingStatus.ERROR,
      );
      if (mode === 'ALL_OR_NOTHING' && hasErrors) {
        throw new BadRequestException(
          'El lote de importación contiene errores y el modo es ALL_OR_NOTHING',
        );
      }

      const validRows = stagedRows.filter(
        (r) => r.estado_fila === ImportStagingStatus.VALIDO,
      );

      let productsCreated = 0;
      let productsUpdated = 0;
      let productsSkipped = 0;

      const existingProducts = await manager.find(Product, {
        where: { tenant_id: trimmedTenant },
      });

      for (const row of validRows) {
        const productName = (row.parsed_nombre || '').trim();
        const existing = existingProducts.find(
          (p) => p.name.trim().toLowerCase() === productName.toLowerCase(),
        );

        if (existing) {
          if (duplicateResolution === 'FAIL') {
            throw new BadRequestException(
              `Producto duplicado detectado: '${productName}'`,
            );
          } else if (duplicateResolution === 'SKIP') {
            productsSkipped++;
            row.estado_fila = ImportStagingStatus.COMMITTED;
            continue;
          } else {
            // REPLACE
            existing.sellPrice = row.parsed_precio_venta ?? existing.sellPrice;
            existing.averageCost =
              row.parsed_costo_insumo ?? existing.averageCost;
            existing.uom = row.parsed_uom || existing.uom;
            if (
              row.parsed_stock_inicial !== null &&
              row.parsed_stock_inicial > 0
            ) {
              existing.stock = row.parsed_stock_inicial;
            }
            await manager.save(Product, existing);
            productsUpdated++;
            row.estado_fila = ImportStagingStatus.COMMITTED;
          }
        } else {
          // CREATE NEW PRODUCT
          const newProduct = manager.create(Product, {
            tenant_id: trimmedTenant,
            name: productName,
            sellPrice: row.parsed_precio_venta ?? 0,
            averageCost: row.parsed_costo_insumo ?? 0,
            uom: row.parsed_uom || 'UN',
            stock: row.parsed_stock_inicial ?? 0,
            is_perishable: false,
            is_active: true,
          });
          const savedProduct = await manager.save(Product, newProduct);
          existingProducts.push(savedProduct);
          productsCreated++;
          row.estado_fila = ImportStagingStatus.COMMITTED;
        }
      }

      // Update staging rows status
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + CHUNK_SIZE);
        await manager.save(ImportStaging, chunk);
      }

      return {
        sessionToken: dto.sessionToken,
        mode,
        productsCreated,
        productsUpdated,
        productsSkipped,
        totalCommitted: productsCreated + productsUpdated,
        committedAt: new Date(),
      };
    });
  }

  async getFailedRows(
    tenantId: string,
    sessionToken: string,
  ): Promise<RowErrorDiagnostic[]> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    const rows = await this.stagingRepo.find({
      where: {
        tenant_id: trimmedTenant,
        token_sesion_importacion: sessionToken,
      },
      order: { created_at: 'ASC' },
    });

    if (!rows || rows.length === 0) {
      throw new NotFoundException(
        `No se encontraron filas para la sesión de importación '${sessionToken}'`,
      );
    }

    const failedRows = rows.filter(
      (r) => r.estado_fila === ImportStagingStatus.ERROR,
    );

    return failedRows.map((r, idx) => ({
      rowNumber: idx + 1,
      rawNombre: r.raw_nombre || undefined,
      rawSku: r.raw_sku || undefined,
      reason: r.mensaje_error_detalle || 'Error no especificado',
    }));
  }
}
