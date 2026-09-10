import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .build();
  });

  tearDown(() async {
    await database.close();
  });

  test('AuthorityProjectionDao finds deterministic active version by sale time and orders components by ordinal', () async {
    final dao = database.authorityProjectionDao;

    // 1. Seed insumo
    await dao.insertInsumo(const AuthorityInsumoEntity(
      tenantId: 'tenant-1',
      id: 'insumo-1',
      name: 'Beef Patty',
      uom: 'UNIT',
    ));

    // 2. Seed an older version (V1: effective 2026-01-01 to 2026-06-01)
    await dao.insertRecipeVersion(const AuthorityRecipeVersionEntity(
      tenantId: 'tenant-1',
      id: 'ver-1',
      productId: 'prod-burger',
      versionNumber: 1,
      isActive: true,
      publicationState: 'PUBLISHED',
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveUntil: '2026-06-01T00:00:00Z',
      yieldQuantity: 1.0,
      technicalShrinkPct: 0.0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    ));

    // 3. Seed current active version (V2: effective from 2026-06-01 onwards)
    await dao.insertRecipeVersion(const AuthorityRecipeVersionEntity(
      tenantId: 'tenant-1',
      id: 'ver-2',
      productId: 'prod-burger',
      versionNumber: 2,
      isActive: true,
      publicationState: 'PUBLISHED',
      effectiveFrom: '2026-06-01T00:00:00Z',
      effectiveUntil: null,
      yieldQuantity: 1.0,
      technicalShrinkPct: 0.0,
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    ));

    // 4. Seed components for V2 with ordinals out of order
    await dao.insertComponent(const AuthorityRecipeVersionComponentEntity(
      tenantId: 'tenant-1',
      id: 'comp-2',
      versionId: 'ver-2',
      ordinal: 1,
      insumoId: 'insumo-1',
      grossQuantity: 0.25,
      technicalShrinkPct: 0.01,
      ingredientType: 'DIRECT',
      componentName: 'Sauce',
    ));

    await dao.insertComponent(const AuthorityRecipeVersionComponentEntity(
      tenantId: 'tenant-1',
      id: 'comp-1',
      versionId: 'ver-2',
      ordinal: 0,
      insumoId: 'insumo-1',
      grossQuantity: 1.0,
      technicalShrinkPct: 0.0,
      ingredientType: 'DIRECT',
      componentName: 'Patty',
    ));

    // Query active version at 2026-08-15 (should resolve V2 as primary)
    final versions = await dao.findActivePublishedVersions(
      'tenant-1',
      'prod-burger',
      '2026-08-15T12:00:00Z',
    );
    expect(versions.length, 1);
    expect(versions.first.id, 'ver-2');
    expect(versions.first.versionNumber, 2);

    // Query active version at 2026-03-15 (should resolve V1)
    final pastVersions = await dao.findActivePublishedVersions(
      'tenant-1',
      'prod-burger',
      '2026-03-15T12:00:00Z',
    );
    expect(pastVersions.length, 1);
    expect(pastVersions.first.id, 'ver-1');
    expect(pastVersions.first.versionNumber, 1);

    // Verify component ordering by ordinal ASC
    final components = await dao.findComponentsByVersion('tenant-1', 'ver-2');
    expect(components.length, 2);
    expect(components[0].ordinal, 0);
    expect(components[0].componentName, 'Patty');
    expect(components[1].ordinal, 1);
    expect(components[1].componentName, 'Sauce');

    // Verify tenant isolation (tenant-2 sees zero records)
    final otherTenantVersions = await dao.findActivePublishedVersions(
      'tenant-2',
      'prod-burger',
      '2026-08-15T12:00:00Z',
    );
    expect(otherTenantVersions, isEmpty);

    // Verify OnConflictStrategy.abort: inserting duplicate primary key throws
    expect(
      () => dao.insertRecipeVersion(const AuthorityRecipeVersionEntity(
        tenantId: 'tenant-1',
        id: 'ver-2',
        productId: 'prod-burger',
        versionNumber: 2,
        isActive: true,
        publicationState: 'PUBLISHED',
        effectiveFrom: '2026-06-01T00:00:00Z',
        effectiveUntil: null,
        yieldQuantity: 1.0,
        technicalShrinkPct: 0.0,
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
      )),
      throwsA(anything),
    );
  });
}
