import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/services/authority_hydration_service.dart';

void main() {
  late AppDatabase database;
  late AuthorityHydrationService service;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = AuthorityHydrationService(
      database.authorityProjectionDao,
      verdictDao: database.authorityIngestionVerdictDao,
    );
  });

  tearDown(() async {
    await database.close();
  });

  test('AuthorityHydrationPayload parses valid 5B4A0c json and rejects cross-tenant records fail-closed', () {
    final validJson = {
      'insumos': [
        {
          'tenantId': 'tenant-alpha',
          'id': 'ins-1',
          'name': 'Cheese',
          'uom': 'KG',
        }
      ],
      'recipeVersions': [
        {
          'tenantId': 'tenant-alpha',
          'recipeVersionId': 'rv-1',
          'productId': 'prod-pizza',
          'versionNumber': 1,
          'isActive': true,
          'publicationState': 'PUBLISHED',
          'effectiveFrom': '2026-09-01T00:00:00Z',
          'yieldQuantity': 1.0,
          'technicalShrinkPct': 0.0,
        }
      ],
      'components': [
        {
          'tenantId': 'tenant-alpha',
          'id': 'comp-1',
          'recipeVersionId': 'rv-1',
          'ordinal': 0,
          'insumoId': 'ins-1',
          'grossQuantity': 0.2,
          'technicalShrinkPct': 0.0,
          'ingredientType': 'DIRECT',
          'componentName': 'Grated Mozzarella',
        }
      ],
    };

    // 1. Success parse
    final payload = AuthorityHydrationPayload.fromJson(
      validJson,
      expectedTenantId: 'tenant-alpha',
    );
    expect(payload.insumos.length, 1);
    expect(payload.recipeVersions.length, 1);
    expect(payload.components.length, 1);

    // 2. Reject foreign tenant insumo
    final crossTenantInsumo = {
      'insumos': [
        {
          'tenantId': 'tenant-foreign',
          'id': 'ins-1',
          'name': 'Cheese',
          'uom': 'KG',
        }
      ],
    };
    expect(
      () => AuthorityHydrationPayload.fromJson(
        crossTenantInsumo,
        expectedTenantId: 'tenant-alpha',
      ),
      throwsA(isA<FormatException>()),
    );

    // 3. Reject foreign tenant version
    final crossTenantVersion = {
      'recipeVersions': [
        {
          'tenantId': 'tenant-foreign',
          'recipeVersionId': 'rv-1',
          'productId': 'prod-pizza',
          'effectiveFrom': '2026-09-01T00:00:00Z',
        }
      ],
    };
    expect(
      () => AuthorityHydrationPayload.fromJson(
        crossTenantVersion,
        expectedTenantId: 'tenant-alpha',
      ),
      throwsA(isA<FormatException>()),
    );

    // 4. Reject foreign tenant component
    final crossTenantComp = {
      'components': [
        {
          'tenantId': 'tenant-foreign',
          'id': 'comp-1',
          'recipeVersionId': 'rv-1',
          'insumoId': 'ins-1',
        }
      ],
    };
    expect(
      () => AuthorityHydrationPayload.fromJson(
        crossTenantComp,
        expectedTenantId: 'tenant-alpha',
      ),
      throwsA(isA<FormatException>()),
    );
  });

  test('AuthorityHydrationService atomically hydrates authority tables and is idempotent on repeat', () async {
    final payload = AuthorityHydrationPayload.fromJson({
      'insumos': [
        {
          'tenantId': 'tenant-alpha',
          'id': 'ins-1',
          'name': 'Cheese',
          'uom': 'KG',
        }
      ],
      'recipeVersions': [
        {
          'tenantId': 'tenant-alpha',
          'recipeVersionId': 'rv-1',
          'productId': 'prod-pizza',
          'versionNumber': 1,
          'isActive': true,
          'publicationState': 'PUBLISHED',
          'effectiveFrom': '2026-09-01T00:00:00Z',
          'yieldQuantity': 1.0,
          'technicalShrinkPct': 0.0,
        }
      ],
      'components': [
        {
          'tenantId': 'tenant-alpha',
          'id': 'comp-1',
          'recipeVersionId': 'rv-1',
          'ordinal': 0,
          'insumoId': 'ins-1',
          'grossQuantity': 0.2,
          'technicalShrinkPct': 0.0,
          'ingredientType': 'DIRECT',
          'componentName': 'Grated Mozzarella',
        }
      ],
    }, expectedTenantId: 'tenant-alpha');

    // First hydration
    await service.hydrate(payload);

    final dao = database.authorityProjectionDao;
    final insumo = await dao.findInsumoById('tenant-alpha', 'ins-1');
    expect(insumo, isNotNull);
    expect(insumo!.name, 'Cheese');

    final versions = await dao.findActivePublishedVersions(
      'tenant-alpha',
      'prod-pizza',
      '2026-09-15T00:00:00Z',
    );
    expect(versions.length, 1);
    expect(versions.first.id, 'rv-1');

    final components = await dao.findComponentsByVersion('tenant-alpha', 'rv-1');
    expect(components.length, 1);
    expect(components.first.id, 'comp-1');

    // Replay/idempotency: hydrating the exact same payload a second time does not throw abort
    await expectLater(service.hydrate(payload), completes);

    // Verify row counts unchanged
    final componentsRepeat = await dao.findComponentsByVersion('tenant-alpha', 'rv-1');
    expect(componentsRepeat.length, 1);
  });

  group('#613 ingestion verdicts', () {
    final inertRecipes = [
      const AuthorityInertRecipe(
        recipeVersionId: 'rv-inert',
        productId: 'prod-simple',
        tenantId: 'tenant-alpha',
      ),
    ];

    test(
        'writes exactly one insert-if-absent verdict row per inert recipe '
        'and does not duplicate on replay', () async {
      final payload = AuthorityHydrationPayload.fromJson({
        'insumos': [
          {
            'tenantId': 'tenant-alpha',
            'id': 'ins-1',
            'name': 'Cheese',
            'uom': 'KG',
          }
        ],
        'recipeVersions': [
          {
            'tenantId': 'tenant-alpha',
            'recipeVersionId': 'rv-1',
            'productId': 'prod-pizza',
            'versionNumber': 1,
            'isActive': true,
            'publicationState': 'PUBLISHED',
            'effectiveFrom': '2026-09-01T00:00:00Z',
            'yieldQuantity': 1.0,
            'technicalShrinkPct': 0.0,
          }
        ],
        'components': [],
      }, expectedTenantId: 'tenant-alpha');

      await service.hydrate(payload, inertRecipes: inertRecipes);

      final dao = database.authorityIngestionVerdictDao;
      expect(await dao.countVerdicts(), 1);
      final rows = await database.database
          .rawQuery('SELECT * FROM authority_ingestion_verdicts');
      expect(rows.single['recipe_version_id'], 'rv-inert');
      expect(rows.single['code'], 'INERT_SIMPLE_PRODUCT');
      expect(rows.single['product_id'], 'prod-simple');
      expect(rows.single['tenant_id'], 'tenant-alpha');
      expect(rows.single['created_at'], isNotNull);

      // Replay: a re-pull of the same inert recipe must not add a row.
      await service.hydrate(payload, inertRecipes: inertRecipes);
      expect(await dao.countVerdicts(), 1);
    });

    test(
        'a verdict write failure degrades: hydrate still completes and the '
        'authority rows already applied stand', () async {
      // Failure injected the way production hits it: the local write itself
      // refuses (table missing). The verdict must never propagate.
      await database.database.execute(
        'DROP TABLE authority_ingestion_verdicts',
      );

      final payload = AuthorityHydrationPayload.fromJson({
        'insumos': [
          {
            'tenantId': 'tenant-alpha',
            'id': 'ins-1',
            'name': 'Cheese',
            'uom': 'KG',
          }
        ],
        'recipeVersions': [
          {
            'tenantId': 'tenant-alpha',
            'recipeVersionId': 'rv-1',
            'productId': 'prod-pizza',
            'versionNumber': 1,
            'isActive': true,
            'publicationState': 'PUBLISHED',
            'effectiveFrom': '2026-09-01T00:00:00Z',
            'yieldQuantity': 1.0,
            'technicalShrinkPct': 0.0,
          }
        ],
        'components': [],
      }, expectedTenantId: 'tenant-alpha');

      await expectLater(
        service.hydrate(payload, inertRecipes: inertRecipes),
        completes,
      );

      // The hydration outcome is unaffected by the verdict failure.
      final versions = await database.authorityProjectionDao
          .findActivePublishedVersions(
        'tenant-alpha',
        'prod-pizza',
        '2026-09-15T00:00:00Z',
      );
      expect(versions, hasLength(1));
    });
  });
}
