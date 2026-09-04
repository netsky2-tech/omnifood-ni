import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
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
  ProductImportSession,
  ProductImportSessionStatus,
} from '../entities/product-import-session.entity';
import {
  LegacyMigrationDecision,
  LegacyOnboardingMigrationReceipt,
} from '../entities/legacy-migration-receipt.entity';
import { CanonicalCsvParserService } from './canonical-csv-parser.service';
import {
  CommitImportDto,
  CommitMode,
  CommitSummaryResponse,
  DuplicatePreviewItem,
  DuplicateResolution,
  ImportPreviewResponse,
  ImportRowDto,
  RowErrorDiagnostic,
  UploadBatchDto,
  UploadRawCsvDto,
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
  private readonly canonicalParser: CanonicalCsvParserService;

  constructor(
    @InjectRepository(ImportStaging)
    private readonly stagingRepo: Repository<ImportStaging>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
    @Optional()
    @InjectRepository(ProductImportSession)
    private readonly sessionRepo?: Repository<ProductImportSession>,
    @Optional()
    @InjectRepository(LegacyOnboardingMigrationReceipt)
    private readonly receiptRepo?: Repository<LegacyOnboardingMigrationReceipt>,
    @Optional()
    canonicalParser?: CanonicalCsvParserService,
  ) {
    this.canonicalParser = canonicalParser || new CanonicalCsvParserService();
  }

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

  /**
   * Upload and stage raw CSV content (file upload or textarea fallback).
   */
  async uploadRawCsv(
    tenantId: string,
    dto: UploadRawCsvDto,
  ): Promise<UploadSummaryResponse> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    const parsedResult = this.canonicalParser.parseRawCsv(dto.csvContent);
    if (parsedResult.totalRows === 0) {
      throw new BadRequestException(
        'El archivo CSV debe contener al menos una fila para procesar',
      );
    }

    const sessionToken = dto.sessionToken || randomUUID();

    // Check existing products for duplicate detection
    const existingProducts =
      (await this.productRepo.find({
        where: { tenant_id: trimmedTenant },
      })) || [];

    const stagedEntities: ImportStaging[] = [];
    const errors: RowErrorDiagnostic[] = [];

    for (const row of parsedResult.rows) {
      const entity = new ImportStaging();
      entity.tenant_id = trimmedTenant;
      entity.token_sesion_importacion = sessionToken;
      entity.row_ordinal = row.rowOrdinal;
      entity.raw_nombre = row.rawValues['nombre'] || row.rawValues['producto'] || row.normalizedValues.nombre;
      entity.raw_sku = row.normalizedValues.sku;
      entity.raw_precio_venta = String(row.normalizedValues.precioVenta);
      entity.raw_costo_insumo = null;
      entity.raw_categoria = row.normalizedValues.categoria;
      entity.raw_porcentaje_iva = String(row.normalizedValues.porcentajeIva);
      entity.raw_uom = row.normalizedValues.uom;
      entity.raw_stock_inicial = null;

      entity.parsed_nombre = row.normalizedValues.nombre;
      entity.parsed_sku = row.normalizedValues.sku;
      entity.parsed_precio_venta = row.normalizedValues.precioVenta;
      entity.parsed_costo_insumo = 0;
      entity.parsed_categoria = row.normalizedValues.categoria;
      entity.parsed_porcentaje_iva = row.normalizedValues.porcentajeIva;
      entity.parsed_uom = row.normalizedValues.uom;
      entity.parsed_stock_inicial = 0;

      entity.unsupported_fields = row.unsupportedFieldsDetected.length > 0 ? row.unsupportedFieldsDetected : null;
      entity.unknown_columns = row.unknownColumns.length > 0 ? row.unknownColumns : null;

      if (!row.isValid) {
        entity.estado_fila = ImportStagingStatus.ERROR;
        entity.mensaje_error_detalle = row.errors.join('; ');
        errors.push({
          rowNumber: row.rowOrdinal,
          rawNombre: entity.raw_nombre || undefined,
          rawSku: entity.raw_sku || undefined,
          reason: entity.mensaje_error_detalle,
        });
      } else {
        entity.estado_fila = ImportStagingStatus.VALIDO;
        entity.mensaje_error_detalle = null;

        // Duplicate preview matching
        const matchingProduct = existingProducts.find(
          (p) => p.name.trim().toLowerCase() === row.normalizedValues.nombre.toLowerCase(),
        );

        if (matchingProduct) {
          entity.matched_by = 'NORMALIZED_NAME';
          entity.target_product_id = matchingProduct.id;

          const fieldsToChange: string[] = [];
          if (Number(matchingProduct.sellPrice) !== row.normalizedValues.precioVenta) {
            fieldsToChange.push('sellPrice');
          }
          if (matchingProduct.uom !== row.normalizedValues.uom) {
            fieldsToChange.push('uom');
          }
          entity.fields_to_change = fieldsToChange;
        }
      }

      stagedEntities.push(entity);
    }

    // Save in chunks
    await this.dataSource.transaction(async (manager: EntityManager) => {
      for (let i = 0; i < stagedEntities.length; i += CHUNK_SIZE) {
        const chunk = stagedEntities.slice(i, i + CHUNK_SIZE);
        await manager.save(ImportStaging, chunk);
      }

      if (this.sessionRepo) {
        const session = this.sessionRepo.create({
          id: sessionToken,
          tenant_id: trimmedTenant,
          onboarding_session_id: dto.onboardingSessionId || null,
          status:
            parsedResult.validRows > 0
              ? ProductImportSessionStatus.READY
              : ProductImportSessionStatus.FAILED,
          parser_contract_version: parsedResult.contractVersion,
          source_hash: parsedResult.sourceHash,
          file_name: dto.fileName || null,
          total_rows: parsedResult.totalRows,
          valid_rows: parsedResult.validRows,
          error_rows: parsedResult.errorRows,
        });
        await manager.save(ProductImportSession, session);
      }
    });

    return {
      sessionToken,
      totalRows: parsedResult.totalRows,
      validRows: parsedResult.validRows,
      errorRows: parsedResult.errorRows,
      errors,
    };
  }

  /**
   * Returns preview with duplicate matching, target product details, and field diffs.
   */
  async getPreview(
    tenantId: string,
    sessionToken: string,
  ): Promise<ImportPreviewResponse> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    const stagedRows = await this.stagingRepo.find({
      where: {
        tenant_id: trimmedTenant,
        token_sesion_importacion: sessionToken,
      },
      order: { row_ordinal: 'ASC' },
    });

    if (!stagedRows || stagedRows.length === 0) {
      throw new NotFoundException(
        `No se encontraron filas en staging para la sesión ${sessionToken}`,
      );
    }

    let session: ProductImportSession | null = null;
    if (this.sessionRepo) {
      session = await this.sessionRepo.findOne({
        where: { tenant_id: trimmedTenant, id: sessionToken },
      });
    }

    const duplicateRows = stagedRows.filter((r) => r.matched_by !== null);
    const duplicates: DuplicatePreviewItem[] = [];

    const unsupportedHeadersSet = new Set<string>();
    const unknownHeadersSet = new Set<string>();

    for (const r of stagedRows) {
      if (r.unsupported_fields) {
        r.unsupported_fields.forEach((f) => unsupportedHeadersSet.add(f));
      }
      if (r.unknown_columns) {
        r.unknown_columns.forEach((c) => unknownHeadersSet.add(c));
      }
    }

    for (const r of duplicateRows) {
      let currentPrice = 0;
      let currentUom = 'UN';
      let targetProductName = r.parsed_nombre || '';

      if (r.target_product_id) {
        const prod = await this.productRepo.findOne({
          where: { tenant_id: trimmedTenant, id: r.target_product_id },
        });
        if (prod) {
          currentPrice = Number(prod.sellPrice) || 0;
          currentUom = prod.uom || 'UN';
          targetProductName = prod.name;
        }
      }

      duplicates.push({
        rowOrdinal: r.row_ordinal,
        productName: r.parsed_nombre || '',
        sku: r.parsed_sku,
        matchedBy: (r.matched_by as 'NORMALIZED_NAME' | 'SKU') || 'NORMALIZED_NAME',
        targetProductId: r.target_product_id || '',
        targetProductName,
        currentPrice,
        newPrice: Number(r.parsed_precio_venta) || 0,
        currentUom,
        newUom: r.parsed_uom || 'UN',
        fieldsToChange: r.fields_to_change || [],
        isConflict: !!r.conflict_reason,
        conflictReason: r.conflict_reason || null,
      });
    }

    const validRows = stagedRows.filter((r) => r.estado_fila === ImportStagingStatus.VALIDO).length;
    const errorRows = stagedRows.filter((r) => r.estado_fila === ImportStagingStatus.ERROR).length;
    const conflictsCount = duplicates.filter((d) => d.isConflict).length;

    return {
      sessionToken,
      status: session?.status || 'READY',
      parserContractVersion: session?.parser_contract_version || 'v1.0',
      sourceHash: session?.source_hash || '',
      totalRows: stagedRows.length,
      validRows,
      errorRows,
      duplicatesCount: duplicates.length,
      conflictsCount,
      duplicates,
      unsupportedColumns: Array.from(unsupportedHeadersSet),
      unknownColumns: Array.from(unknownHeadersSet),
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

    const existingProducts =
      (await this.productRepo.find({
        where: { tenant_id: trimmedTenant },
      })) || [];

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
      entity.row_ordinal = index + 1;
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
      entity.parsed_costo_insumo = 0; // AC-24: stock/cost writes neutralized
      entity.parsed_categoria = validation.parsedCategoria;
      entity.parsed_porcentaje_iva = validation.parsedPorcentajeIva;
      entity.parsed_uom = validation.parsedUom;
      entity.parsed_stock_inicial = 0; // AC-24: stock/cost writes neutralized

      entity.estado_fila = validation.status;
      entity.mensaje_error_detalle = validation.errorMessage;

      if (validation.status === ImportStagingStatus.VALIDO && validation.parsedNombre) {
        const matching = existingProducts.find(
          (p) => p.name.trim().toLowerCase() === validation.parsedNombre!.trim().toLowerCase(),
        );
        if (matching) {
          entity.matched_by = 'NORMALIZED_NAME';
          entity.target_product_id = matching.id;
          const fieldsToChange: string[] = [];
          if (Number(matching.sellPrice) !== validation.parsedPrecioVenta) {
            fieldsToChange.push('sellPrice');
          }
          if (matching.uom !== validation.parsedUom) {
            fieldsToChange.push('uom');
          }
          entity.fields_to_change = fieldsToChange;
        }
      }

      stagedEntities.push(entity);
    }

    // Process chunked storage (CHUNK_SIZE <= 100)
    await this.dataSource.transaction(async (manager: EntityManager) => {
      for (let i = 0; i < stagedEntities.length; i += CHUNK_SIZE) {
        const chunk = stagedEntities.slice(i, i + CHUNK_SIZE);
        await manager.save(ImportStaging, chunk);
      }

      if (this.sessionRepo) {
        const session = this.sessionRepo.create({
          id: sessionToken,
          tenant_id: trimmedTenant,
          onboarding_session_id: dto.onboardingSessionId || null,
          status:
            validCount > 0
              ? ProductImportSessionStatus.READY
              : ProductImportSessionStatus.FAILED,
          parser_contract_version: 'v1.0',
          source_hash: 'batch-json-' + randomUUID(),
          file_name: null,
          total_rows: dto.rows.length,
          valid_rows: validCount,
          error_rows: errorCount,
        });
        await manager.save(ProductImportSession, session);
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
      dto.duplicatePolicy || dto.duplicateResolution || 'REPLACE';

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const stagedRows = await manager.find(ImportStaging, {
        where: {
          tenant_id: trimmedTenant,
          token_sesion_importacion: dto.sessionToken,
        },
        order: { row_ordinal: 'ASC' },
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
            // REPLACE - Update Product Master fields ONLY.
            // AC-24, AC-52: Denylist: stock, averageCost, Kardex, inventory movements.
            existing.sellPrice = row.parsed_precio_venta ?? existing.sellPrice;
            existing.uom = row.parsed_uom || existing.uom;
            await manager.save(Product, existing);
            productsUpdated++;
            row.estado_fila = ImportStagingStatus.COMMITTED;
          }
        } else {
          // CREATE NEW PRODUCT - Product Master only.
          // AC-24: stock and averageCost must be 0 outside of Kardex.
          const newProduct = manager.create(Product, {
            tenant_id: trimmedTenant,
            name: productName,
            sellPrice: row.parsed_precio_venta ?? 0,
            averageCost: 0,
            uom: row.parsed_uom || 'UN',
            stock: 0,
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

      // Update session lifecycle if repository available
      if (this.sessionRepo) {
        const session = await manager.findOne(ProductImportSession, {
          where: { tenant_id: trimmedTenant, id: dto.sessionToken },
        });
        if (session) {
          session.status = hasErrors
            ? ProductImportSessionStatus.PARTIALLY_COMMITTED
            : ProductImportSessionStatus.COMMITTED;
          session.commit_mode = mode;
          session.duplicate_policy = duplicateResolution;
          session.committed_rows = productsCreated + productsUpdated;
          session.skipped_rows = productsSkipped;
          session.committed_at = new Date();
          await manager.save(ProductImportSession, session);
        }
      }

      // Emit Audit Trail receipt for material catalog commit (ONB1.4I)
      if (this.receiptRepo) {
        const receipt = this.receiptRepo.create({
          tenant_id: trimmedTenant,
          receipt_type: 'IMPORT_COMMIT',
          target_entity_type: 'PRODUCT_IMPORT_SESSION',
          target_entity_id: dto.sessionToken,
          decision: LegacyMigrationDecision.IMPORT_COMMITTED,
          reason: `Import committed with mode ${mode} and duplicate policy ${duplicateResolution}. Created: ${productsCreated}, Updated: ${productsUpdated}, Skipped: ${productsSkipped}.`,
          evidence_json: {
            sessionToken: dto.sessionToken,
            mode,
            duplicatePolicy: duplicateResolution,
            productsCreated,
            productsUpdated,
            productsSkipped,
            totalCommitted: productsCreated + productsUpdated,
            idempotencyKey: dto.idempotencyKey || null,
          },
          executed_by: 'SYSTEM',
        });
        await manager.save(LegacyOnboardingMigrationReceipt, receipt);
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
      order: { row_ordinal: 'ASC' },
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
      rowNumber: r.row_ordinal || idx + 1,
      rawNombre: r.raw_nombre || undefined,
      rawSku: r.raw_sku || undefined,
      reason: r.mensaje_error_detalle || 'Error no especificado',
    }));
  }
}
