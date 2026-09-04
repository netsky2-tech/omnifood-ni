import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { ImportStaging, ImportStagingStatus } from '../../src/modules/onboarding/entities/import-staging.entity';
import { ProductImportSession, ProductImportSessionStatus } from '../../src/modules/onboarding/entities/product-import-session.entity';
import { LegacyImportIntegrityReport, LegacyImportIntegrityStatus } from '../../src/modules/onboarding/entities/legacy-import-integrity-report.entity';
import { LegacyOnboardingMigrationReceipt, LegacyMigrationDecision } from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { OnboardingSession } from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { ImportStagingController } from '../../src/modules/onboarding/controllers/import-staging.controller';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import { CanonicalCsvParserService } from '../../src/modules/onboarding/services/canonical-csv-parser.service';
import { LegacyImportIntegrityReportService } from '../../src/modules/onboarding/services/legacy-import-integrity-report.service';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withImportCutoverIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantAId: string;
    tenantBId: string;
    ownerTokenA: string;
    ownerTokenB: string;
    schema: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let app: INestApplication | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        SystemParametersConfig,
        Product,
        Insumo,
        UomConversion,
        ImportStaging,
        ProductImportSession,
        LegacyImportIntegrityReport,
        LegacyOnboardingMigrationReceipt,
        OnboardingSession,
        OnboardingIdempotencyRecord,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    // Seed Two Tenants: Tenant A and Tenant B
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();

    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantAId, 'Tenant A — Taquería Central'],
    );
    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantBId, 'Tenant B — Repostería Bella'],
    );

    // Seed existing product in Tenant A for duplicate preview testing
    await dataSource.query(
      `INSERT INTO products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active, is_perishable, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, now(), now())`,
      [randomUUID(), tenantAId, 'Tacos al Pastor', 'ORDEN', 120.0, 60.0, 25.0],
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [ImportStagingController],
      providers: [
        ImportStagingService,
        CanonicalCsvParserService,
        LegacyImportIntegrityReportService,
        Reflector,
        AuthGuard,
        RolesGuard,
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: 'ImportStagingRepository',
          useValue: dataSource.getRepository(ImportStaging),
        },
        {
          provide: 'ProductRepository',
          useValue: dataSource.getRepository(Product),
        },
        {
          provide: 'ProductImportSessionRepository',
          useValue: dataSource.getRepository(ProductImportSession),
        },
        {
          provide: 'LegacyImportIntegrityReportRepository',
          useValue: dataSource.getRepository(LegacyImportIntegrityReport),
        },
        {
          provide: 'LegacyOnboardingMigrationReceiptRepository',
          useValue: dataSource.getRepository(LegacyOnboardingMigrationReceipt),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const jwtService = moduleRef.get<JwtService>(JwtService);
    const ownerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'owner@tenantA.com',
      role: UserRole.OWNER,
      tenant_id: tenantAId,
    });
    const ownerTokenB = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'owner@tenantB.com',
      role: UserRole.OWNER,
      tenant_id: tenantBId,
    });

    await assertion({
      app,
      dataSource,
      jwtService,
      tenantAId,
      tenantBId,
      ownerTokenA,
      ownerTokenB,
      schema,
    });
  } finally {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('ONB1.4 Product Import Safe Cutover (Real PostgreSQL E2E / Zero Mocks)', () => {
  it('exposes canonical template matching parser contract version v1.0 (AC-22)', async () => {
    await withImportCutoverIsolatedSchema('onb14_template', async ({ app, ownerTokenA }) => {
      const response = await request(app.getHttpServer())
        .get('/api/onboarding/import/template')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .expect(200);

      expect(response.body).toMatchObject({
        version: 'v1.0',
        encoding: 'UTF-8',
        columns: ['nombre', 'precio_venta', 'unidad_venta', 'sku', 'categoria', 'porcentaje_iva'],
        requiredColumns: ['nombre', 'precio_venta'],
      });
      expect(response.body.templateCsv).toContain('nombre,precio_venta,unidad_venta,sku');
      expect(response.body.templateCsv).not.toContain('stock_inicial');
      expect(response.body.templateCsv).not.toContain('costo_insumo');
    });
  });

  it('verifies backend guard neutralizes direct stock/cost writes and prevents barcode->sku alias in real PostgreSQL (AC-24, AC-51, AC-52)', async () => {
    await withImportCutoverIsolatedSchema('onb14_guard', async ({ app, dataSource, tenantAId, ownerTokenA }) => {
      const rawCsv = [
        'producto,precio,unidad_venta,codigo_barras,stock_inicial,costo_insumo',
        'Gringas de Res,140.00,ORDEN,7432109876,50,75.00',
        'Horchata 500ml,30.00,VASO,1122334455,100,10.00',
      ].join('\n');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/upload-csv')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ csvContent: rawCsv, fileName: 'menu.csv' })
        .expect(201);

      const sessionToken = uploadRes.body.sessionToken;
      expect(sessionToken).toBeDefined();
      expect(uploadRes.body.validRows).toBe(2);

      // Verify staging table in PostgreSQL has ordinals and isolated barcode
      const stagedRows = await dataSource.query(
        `SELECT row_ordinal, raw_nombre, parsed_nombre, parsed_sku, parsed_stock_inicial, parsed_costo_insumo, unsupported_fields
         FROM staging_importacion_productos WHERE tenant_id = $1 AND token_sesion_importacion = $2 ORDER BY row_ordinal ASC`,
        [tenantAId, sessionToken],
      );
      expect(stagedRows).toHaveLength(2);
      expect(stagedRows[0].row_ordinal).toBe(1);
      // AC-51: barcode is strictly excluded from SKU
      expect(stagedRows[0].parsed_sku).toBeNull();
      // Unsupported columns recorded
      expect(stagedRows[0].unsupported_fields).toContain('codigo_barras');
      expect(stagedRows[0].unsupported_fields).toContain('stock_inicial');

      // Now commit via VALID_ONLY
      const commitRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/commit')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ sessionToken, mode: 'VALID_ONLY', duplicatePolicy: 'REPLACE' })
        .expect(201);

      expect(commitRes.body.productsCreated).toBe(2);

      // Verify real PostgreSQL products: stock and averageCost MUST be 0!
      const createdProducts = await dataSource.query(
        `SELECT name, "sellPrice", "averageCost", stock, uom FROM products WHERE tenant_id = $1 AND name IN ('Gringas de Res', 'Horchata 500ml')`,
        [tenantAId],
      );
      expect(createdProducts).toHaveLength(2);
      for (const prod of createdProducts) {
        // AC-24: stock/cost writes neutralized
        expect(Number(prod.stock)).toBe(0);
        expect(Number(prod.averageCost)).toBe(0);
      }

      // Verify IMPORT_COMMIT receipt was persisted in PostgreSQL
      const receipts = await dataSource.query(
        `SELECT receipt_type, decision, reason, evidence_json FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1 AND receipt_type = 'IMPORT_COMMIT'`,
        [tenantAId],
      );
      expect(receipts).toHaveLength(1);
      expect(receipts[0].decision).toBe('IMPORT_COMMITTED');
      expect(receipts[0].evidence_json.productsCreated).toBe(2);
    });
  });

  it('verifies duplicate preview, conflict detection, and REPLACE protection on existing products (AC-23, AC-52)', async () => {
    await withImportCutoverIsolatedSchema('onb14_preview', async ({ app, dataSource, tenantAId, ownerTokenA }) => {
      // Existing product 'Tacos al Pastor' has sellPrice 120, averageCost 60, stock 25.
      const rawCsv = [
        'nombre,precio_venta,uom,stock_inicial,costo_insumo',
        'Tacos al Pastor,150.00,ORDEN,999,999.00', // Update price to 150, attempts stock 999
      ].join('\n');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/upload-csv')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ csvContent: rawCsv })
        .expect(201);

      const sessionToken = uploadRes.body.sessionToken;

      // GET Preview
      const previewRes = await request(app.getHttpServer())
        .get(`/api/onboarding/import/preview/${sessionToken}`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .expect(200);

      expect(previewRes.body.duplicatesCount).toBe(1);
      expect(previewRes.body.duplicates[0]).toMatchObject({
        productName: 'Tacos al Pastor',
        matchedBy: 'NORMALIZED_NAME',
        currentPrice: 120,
        newPrice: 150,
        fieldsToChange: ['sellPrice'],
        isConflict: false,
      });

      // Commit with REPLACE
      await request(app.getHttpServer())
        .post('/api/onboarding/import/commit')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ sessionToken, mode: 'VALID_ONLY', duplicatePolicy: 'REPLACE' })
        .expect(201);

      // Verify in PostgreSQL: sellPrice updated to 150, but stock and averageCost remain unchanged!
      const updatedProduct = (
        await dataSource.query(
          `SELECT name, "sellPrice", "averageCost", stock FROM products WHERE tenant_id = $1 AND name = 'Tacos al Pastor'`,
          [tenantAId],
        )
      )[0];

      expect(Number(updatedProduct.sellPrice)).toBe(150);
      // AC-52: REPLACE does not touch stock or averageCost!
      expect(Number(updatedProduct.averageCost)).toBe(60);
      expect(Number(updatedProduct.stock)).toBe(25);
    });
  });

  it('verifies ALL_OR_NOTHING aborts cleanly with zero DB writes when batch has errors (AC-20)', async () => {
    await withImportCutoverIsolatedSchema('onb14_all_or_nothing', async ({ app, dataSource, tenantAId, ownerTokenA }) => {
      const rawCsv = [
        'nombre,precio_venta',
        'Válido 1,100',
        ',Invalido', // Row error: missing name and invalid price
      ].join('\n');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/upload-csv')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ csvContent: rawCsv })
        .expect(201);

      const sessionToken = uploadRes.body.sessionToken;

      // Commit in ALL_OR_NOTHING -> must throw 400 Bad Request
      const commitRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/commit')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ sessionToken, mode: 'ALL_OR_NOTHING' })
        .expect(400);

      expect(commitRes.body.message).toContain('ALL_OR_NOTHING');

      // Verify zero products were committed in PostgreSQL
      const products = await dataSource.query(
        `SELECT id FROM products WHERE tenant_id = $1 AND name = 'Válido 1'`,
        [tenantAId],
      );
      expect(products).toHaveLength(0);

      // Error export endpoint can export the diagnostic file (AC-21)
      const errorExportRes = await request(app.getHttpServer())
        .get(`/api/onboarding/import/errors/${sessionToken}/csv`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .expect(200);

      expect(errorExportRes.text).toContain('fila,nombre_suministrado,sku_suministrado,motivo_error');
    });
  });

  it('verifies LegacyImportIntegrityReport and legacy staging expiry on real PostgreSQL (ONB1.4H)', async () => {
    await withImportCutoverIsolatedSchema('onb14_integrity', async ({ app, dataSource, tenantAId, ownerTokenA }) => {
      const legacyToken = randomUUID();

      // Seed an uncommitted legacy staging row with stock/cost
      await dataSource.query(
        `INSERT INTO staging_importacion_productos (id, tenant_id, token_sesion_importacion, raw_nombre, parsed_nombre, raw_stock_inicial, parsed_stock_inicial, raw_costo_insumo, parsed_costo_insumo, estado_fila, row_ordinal, created_at, updated_at)
         VALUES ($1, $2, $3, 'Legacy Insumo', 'Legacy Insumo', '100', 100, '50', 50, 'PENDIENTE', 1, now(), now())`,
        [randomUUID(), tenantAId, legacyToken],
      );

      // Expire legacy staging
      const expireRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/expire-legacy-staging')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .expect(201);

      expect(expireRes.body.expiredSessions).toContain(legacyToken);
      expect(expireRes.body.expiredRowsCount).toBe(1);

      // Verify in PostgreSQL that row was marked ERROR and receipt issued
      const expiredRows = await dataSource.query(
        `SELECT estado_fila, mensaje_error_detalle FROM staging_importacion_productos WHERE tenant_id = $1 AND token_sesion_importacion = $2`,
        [tenantAId, legacyToken],
      );
      expect(expiredRows[0].estado_fila).toBe(ImportStagingStatus.ERROR);
      expect(expiredRows[0].mensaje_error_detalle).toContain('Legacy staging incompatible');

      const expiryReceipts = await dataSource.query(
        `SELECT receipt_type, decision FROM legacy_onboarding_migration_receipts WHERE tenant_id = $1 AND receipt_type = 'LEGACY_STAGING_EXPIRY'`,
        [tenantAId],
      );
      expect(expiryReceipts).toHaveLength(1);
      expect(expiryReceipts[0].decision).toBe('EXPIRED_REJECTED');

      // Now run integrity scan
      const scanRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/integrity-scan')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .expect(201);

      expect(scanRes.body.id).toBeDefined();
      expect(scanRes.body.status).toBe('CLEAN'); // Because the pending row was not committed
    });
  });

  it('enforces two-tenant isolation: Tenant B cannot access or commit Tenant A import sessions (AC-38)', async () => {
    await withImportCutoverIsolatedSchema('onb14_isolation', async ({ app, tenantAId, ownerTokenA, ownerTokenB }) => {
      const rawCsv = ['nombre,precio_venta', 'Producto Secreto A,200'].join('\n');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/onboarding/import/upload-csv')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ csvContent: rawCsv })
        .expect(201);

      const sessionTokenA = uploadRes.body.sessionToken;

      // Tenant B tries to view preview of Tenant A session -> 404 Not Found
      await request(app.getHttpServer())
        .get(`/api/onboarding/import/preview/${sessionTokenA}`)
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .expect(404);

      // Tenant B tries to commit Tenant A session -> 404 Not Found
      await request(app.getHttpServer())
        .post('/api/onboarding/import/commit')
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .send({ sessionToken: sessionTokenA, mode: 'VALID_ONLY' })
        .expect(404);
    });
  });
});
