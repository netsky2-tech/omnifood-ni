import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/inventory/authority_hydration_status.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/domain/usecases/inventory/checkout_inventory_preparation_service.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';

// Reuses the generated repository mocks from the existing SalesRepositoryImpl
// harness (numbering service, audit repository, legacy inventory use cases).
// The frozen SALE_TIME_V1 path under test here only invokes the numbering
// service and the audit log; the other mocks exist to satisfy the constructor.
import '../data/repositories/sales/sales_repository_impl_test.mocks.dart'
    as repo_mocks;

/// #519 U6 — the integration fence.
///
/// Every test that stayed green through #519 seeds the recipe-authority
/// projections by inserting entities directly, or builds fakes — so none of
/// them straddles the actual gap: a migrated, production-style database where
/// authority rows arrive ONLY through the sync pull (`pullInboundDeltas`),
/// get hydrated into the projections, and must then make a real checkout
/// deduct kardex movements.
///
/// This file plants data exclusively through the inbound delta path. If the
/// pull ever stops producing authority rows, the assertions below fail —
/// including the counter-case, which pins #519's signature from the correct
/// side of the gap (no `recipeVersions` key => sale stays pending with ZERO
/// movement rows).
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  /// Production-parity construction (same shape as
  /// `test/data/database/ohac_delivery_install_parity_test.dart`): in-memory
  /// Floor builder with the real migrations and the append-only callback.
  /// NOT a `synchronize: true` fixture. Closed in a tear-down, never as the
  /// last statement of a test: sqflite caches an opened in-memory database by
  /// its `:memory:` path, so a close skipped by a failed assertion would let
  /// the next test reuse a foreign schema.
  Future<AppDatabase> buildProductionStyleDatabase() async {
    final database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addMigrations(allMigrations)
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    addTearDown(database.close);
    return database;
  }

  Future<void> bindTenant(AppDatabase database, String tenantId) async {
    // `tenant_id` is the same `local_configs` key the hydration classifier
    // (U5) and the checkout bind to.
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tenant_id', value: tenantId),
    );
    // The REAL `executeSaleWithDgiTransaction` reads its folio sequence from
    // `local_configs` (DTI 09-2007 sequential numbering) — the mocked
    // numbering service does not cover this, so a live sequence is required
    // for the movement write to commit.
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_current_number', value: '1'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'),
    );
  }

  SyncService buildSyncService(AppDatabase database, Dio dio) {
    final auditRepo = _MockAuditRepository();
    final salesRepo = _MockSalesRepository();
    final inventoryRepo = _MockInventoryRepository();
    return SyncService(
      auditRepo,
      salesRepo,
      inventoryRepo,
      dio,
      database: database,
    );
  }

  SalesRepositoryImpl buildSalesRepository(
    AppDatabase database,
    String nextNumber,
  ) {
    final numbering = repo_mocks.MockDgiNumberingService();
    when(numbering.getNextNumber()).thenAnswer((_) async => nextNumber);
    final audit = repo_mocks.MockAuditRepository();
    // `saveSale` always writes a SALE_CREATED audit entry; without this stub
    // mockito would throw after the DGI transaction already committed.
    when(
      audit.log(any, metadata: anyNamed('metadata')),
    ).thenAnswer((_) async {});
    return SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: numbering,
      movementEngine: repo_mocks.MockMovementEngine(),
      auditRepository: audit,
      processInventoryUseCase: repo_mocks.MockProcessSaleInventoryUseCase(),
      reverseInventoryUseCase: repo_mocks.MockReverseSaleInventoryUseCase(),
      inventoryRepository: repo_mocks.MockInventoryRepository(),
    );
  }

  void stubDeltas(Dio dio, Map<String, dynamic> deltas) {
    when(dio.get(
      '/v1/sync/inbound/deltas',
      queryParameters: anyNamed('queryParameters'),
    )).thenAnswer((_) async => Response<Map<String, dynamic>>(
          requestOptions: RequestOptions(path: '/v1/sync/inbound/deltas'),
          statusCode: 200,
          data: {
            'deltas': deltas,
            'currentVersion': 'v-test-1',
            'serverTime': '2026-09-25T12:00:00Z',
          },
        ));
  }

  /// The checkout call shape used by `sale_view_model.dart` (~line 1273):
  /// preparation runs against the same database, with a tenant-bound user and
  /// a terminal id.
  Future<PreparedSaleInventoryResult> runCheckout(
    AppDatabase database, {
    required String invoiceId,
    required double quantity,
  }) async {
    // The checkout binds to the SAME `tenant_id` config the classifier reads;
    // read it back instead of hardcoding it so a broken binding fails here.
    final tenantId =
        (await database.localConfigDao.getConfigByKey('tenant_id'))?.value;
    final now = DateTime.parse('2026-09-01T10:00:00Z');
    final invoice = Invoice(
      id: invoiceId,
      number: 'UNASSIGNED',
      createdAt: now,
      userId: 'user-cashier-1',
      subtotal: 100.0,
      totalTax: 15.0,
      total: 115.0,
      terminalId: 'TERM-01',
    );
    final items = [
      InvoiceItem(
        id: 'item-1',
        invoiceId: invoiceId,
        productId: 'prod-pizza',
        productName: 'Pizza',
        quantity: quantity,
        unitPrice: 100.0,
        originalTaxRate: 15.0,
        appliedTaxRate: 15.0,
        taxAmount: 15.0,
        total: 115.0,
      ),
    ];
    return CheckoutInventoryPreparationService(database).prepare(
      invoice: invoice,
      items: items,
      offlineUserId: 'user-cashier-1',
      tenantId: tenantId ?? '',
      terminalId: 'TERM-01',
    );
  }

  AuthorityHydrationStatus hydrationStatus(AppDatabase database) =>
      AuthorityHydrationStatus(
        readConfig: (key) async =>
            (await database.localConfigDao.getConfigByKey(key))?.value,
        countAuthorityInsumos:
            database.authorityProjectionDao.countInsumosByTenant,
      );

  Future<List<MovementEntity>> kardexRows(
    AppDatabase database,
    String saleId,
  ) =>
      database.salesTransactionDao.getMovementsBySaleId(saleId);

  test(
      'authority hydrated ONLY via the sync pull drives an APPLIED checkout with kardex rows',
      () async {
    final database = await buildProductionStyleDatabase();
    await bindTenant(database, 'tenant-alpha');

    final dio = _MockDio();
    stubDeltas(dio, {
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
          'sellPrice': 100.0,
          'isActive': true,
        }
      ],
      // The incremental insumos delta delivers the OPERATIONAL catalog row
      // (`insumos` table — the one the DGI transaction deducts stock from);
      // it carries no authority data. The AUTHORITY insumo (`authority_insumos`)
      // travels only inside the version closure (U1): if hydration ever
      // regresses to requiring a hand-seeded row, the assertions below fail.
      'insumos': [
        {'id': 'ins-1', 'name': 'Mozzarella', 'consumptionUom': 'KG', 'stock': 10.0},
      ],
      'recipeVersions': [
        _wireVersion(
          insumos: [_wireClosureInsumo()],
          components: [_wireComponent()],
        ),
      ],
    });

    final syncService = buildSyncService(database, dio);
    final result = await syncService.pullInboundDeltas();

    // The pull itself hydrated the projections (additive outcome, no failure).
    expect(result, isNotNull);
    expect(result!.authorityHydrationFailed, isFalse);
    expect(result.authorityVersionsCount, 1);
    expect(result.authorityInsumosCount, 1);
    expect(result.authorityComponentsCount, 1);

    // The authority tables hold real rows — reached through the pull, never
    // by hand insertion.
    final dao = database.authorityProjectionDao;
    expect(await dao.countInsumosByTenant('tenant-alpha'), greaterThan(0));
    final versions = await dao.findActivePublishedVersions(
      'tenant-alpha',
      'prod-pizza',
      '2026-09-01T10:00:00.000Z',
    );
    expect(versions, hasLength(1));
    expect(versions.single.publicationState, 'PUBLISHED');
    expect(versions.single.id, 'rv-1');
    final components = await dao.findComponentsByVersion(
      'tenant-alpha',
      'rv-1',
    );
    expect(components, hasLength(1));
    expect(components.single.insumoId, 'ins-1');

    // U4/U5 tie-in: the three-state classifier reads the same tenant binding
    // and reports hydrated from row presence.
    expect(
      await hydrationStatus(database).classify(),
      AuthorityHydrationState.hydrated,
    );

    // Real checkout authority path over the hydrated projections.
    final prep = await runCheckout(
      database,
      invoiceId: 'inv-kardex-1',
      quantity: 2.0,
    );
    expect(prep.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
    expect(prep.invoice.inventoryOutcome, 'APPLIED');
    expect(prep.invoice.inventoryOutcomeReason, isNull);
    expect(prep.items.single.inventorySnapshotVersion, 'SALE_TIME_V1');
    final snapshot = prep.items.single.inventorySnapshot!;
    expect(snapshot.disposition, SaleInventoryDisposition.recipe);
    expect(snapshot.classification, SaleInventoryClassification.prepared);
    expect(snapshot.recipeVersionId, 'rv-1');
    expect(snapshot.bindings, isNotEmpty);
    expect(snapshot.bindings.single.insumoId, 'ins-1');
    expect(snapshot.bindings.single.recipeComponentId, 'comp-1');
    expect(snapshot.bindings.single.quantityPerSaleUnit, 0.2);

    // The frozen movement boundary inside the real repository save converts
    // the sale-time bindings into kardex rows.
    final repository = buildSalesRepository(database, '001-001-01-00000001');
    await repository.saveSale(
      invoice: prep.invoice,
      items: prep.items,
      payments: [
        Payment(
          id: 'pay-1',
          invoiceId: 'inv-kardex-1',
          amount: 115.0,
          method: PaymentMethod.cash,
        ),
      ],
    );

    final movements = await kardexRows(database, 'inv-kardex-1');
    expect(movements, hasLength(1));
    final movement = movements.single;
    expect(movement.insumoId, 'ins-1');
    expect(movement.type, 'sale');
    // Negative: a sale deducts from the kardex. The binding carries the
    // component's grossQuantity (0.2), which is what the preparation service
    // freezes as the binding's per-sale-unit quantity.
    expect(movement.quantity, -(2.0 * 0.2));
    expect(movement.saleCorrelationId, snapshot.bindings.single.saleCorrelationId);
    expect(movement.sourceDocumentType, 'SALE');
    expect(movement.sourceDocumentId, 'inv-kardex-1');
    expect(movement.deliveryState, MovementDeliveryState.localApplied);
    // previousStock/newStock are deliberately NOT asserted to be non-zero:
    // the frozen path hardcodes 0 there today — that fence belongs to
    // issue #524, not this one.
  });

  test(
      'COUNTER-CASE: same pull WITHOUT the recipeVersions key leaves the sale pending with zero kardex rows (#519 signature)',
      () async {
    final database = await buildProductionStyleDatabase();
    await bindTenant(database, 'tenant-alpha');

    final dio = _MockDio();
    // Identical checkout inputs — but the inbound response carries NO
    // recipeVersions key. This is the exact wire shape that produced #519.
    stubDeltas(dio, {
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
          'sellPrice': 100.0,
          'isActive': true,
        }
      ],
      'insumos': [
        {'id': 'ins-1', 'name': 'Mozzarella', 'consumptionUom': 'KG', 'stock': 10.0},
      ],
    });

    final syncService = buildSyncService(database, dio);
    final result = await syncService.pullInboundDeltas();

    expect(result, isNotNull);
    expect(result!.authorityHydrationFailed, isFalse);
    expect(result.authorityVersionsCount, 0);
    expect(result.authorityInsumosCount, 0);
    expect(result.authorityComponentsCount, 0);
    expect(await database.authorityProjectionDao.countInsumosByTenant(
      'tenant-alpha',
    ), 0);
    // A legacy response (no recipeVersions key) must leave the verdict keys
    // completely untouched: stamping them here would let a terminal that has
    // NEVER hydrated classify as hydratedEmpty instead of notHydrated, which
    // is the exact ambiguity that hid #519.
    for (final key in [
      AuthorityHydrationStatus.lastAtKey,
      AuthorityHydrationStatus.resultKey,
      AuthorityHydrationStatus.reasonKey,
      AuthorityHydrationStatus.appliedAtKey,
    ]) {
      expect(
        await database.localConfigDao.getConfigByKey(key),
        isNull,
        reason: 'legacy pull must not stamp $key',
      );
    }
    // The classifier must call this out: rows == 0 and hydration has never
    // completed => notHydrated, never folded into hydratedEmpty.
    expect(
      await hydrationStatus(database).classify(),
      AuthorityHydrationState.notHydrated,
    );

    // Same checkout, correct side of the gap: no published recipe authority
    // => the sale resolves pending, not applied.
    final prep = await runCheckout(
      database,
      invoiceId: 'inv-pending-1',
      quantity: 2.0,
    );
    expect(prep.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
    expect(prep.invoice.inventoryOutcome, 'APPLIED_INVENTORY_PENDING');
    expect(prep.invoice.inventoryOutcomeReason, 'MISSING_PUBLISHED_RECIPE');
    final snapshot = prep.items.single.inventorySnapshot!;
    expect(snapshot.disposition, SaleInventoryDisposition.pendingRecipe);
    expect(snapshot.bindings, isEmpty);

    final repository = buildSalesRepository(database, '001-001-01-00000001');
    await repository.saveSale(
      invoice: prep.invoice,
      items: prep.items,
      payments: [
        Payment(
          id: 'pay-1',
          invoiceId: 'inv-pending-1',
          amount: 115.0,
          method: PaymentMethod.cash,
        ),
      ],
    );

    // ZERO movement rows: the suppressed boundary produces no kardex. If this
    // counter-case ever passes while hydration is broken (e.g. because the
    // main case was weakened to match), this file is worthless — the pair is
    // the pin, not either half alone.
    expect(await kardexRows(database, 'inv-pending-1'), isEmpty);
  });
}

// ---------------------------------------------------------------------------
// Sync-side mocks, mirroring `sync_service_authority_hydration_test.dart`.
// The inbound pull is stubbed at the HTTP boundary only; every downstream
// write (products, hydration, DGI transaction) runs for real.
// ---------------------------------------------------------------------------

class _MockAuditRepository extends Mock implements AuditRepository {
  @override
  Future<AuditSyncOutcome> syncLogs() => super.noSuchMethod(
        Invocation.method(#syncLogs, []),
        returnValue: Future.value(const AuditSyncOutcome.complete()),
        returnValueForMissingStub:
            Future.value(const AuditSyncOutcome.complete()),
      );

  @override
  String get deviceId => 'test-device-1';
}

class _MockSalesRepository extends Mock implements SalesRepository {
  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedAggregates, []),
        returnValue: Future.value(<Map<String, dynamic>>[]),
        returnValueForMissingStub: Future.value(<Map<String, dynamic>>[]),
      );
}

class _MockInventoryRepository extends Mock implements InventoryRepository {
  @override
  Future<List<Purchase>> getUnsyncedPurchases() => super.noSuchMethod(
        Invocation.method(#getUnsyncedPurchases, []),
        returnValue: Future.value(<Purchase>[]),
        returnValueForMissingStub: Future.value(<Purchase>[]),
      );

  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedRecipeVersionDocuments, []),
        returnValue: Future.value(<RecipeVersionDocument>[]),
        returnValueForMissingStub: Future.value(<RecipeVersionDocument>[]),
      );

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedProductionOrders, []),
        returnValue: Future.value(<ProductionOrderDocument>[]),
        returnValueForMissingStub: Future.value(<ProductionOrderDocument>[]),
      );

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedCountSessionDocuments, []),
        returnValue: Future.value(<CountSessionDocument>[]),
        returnValueForMissingStub: Future.value(<CountSessionDocument>[]),
      );

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() => super.noSuchMethod(
        Invocation.method(#getUnsyncedForensicAlerts, []),
        returnValue: Future.value(<ForensicAlert>[]),
        returnValueForMissingStub: Future.value(<ForensicAlert>[]),
      );

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() => super.noSuchMethod(
        Invocation.method(#getUnsyncedMovements, []),
        returnValue: Future.value(<InventoryMovement>[]),
        returnValueForMissingStub: Future.value(<InventoryMovement>[]),
      );
}

class _MockDio extends Mock implements Dio {
  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) =>
      super.noSuchMethod(
        Invocation.method(#get, [path], {
          #data: data,
          #queryParameters: queryParameters,
          #options: options,
          #cancelToken: cancelToken,
          #onReceiveProgress: onReceiveProgress,
        }),
        returnValue: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'deltas': <String, dynamic>{}} as dynamic,
        )),
        returnValueForMissingStub: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'deltas': <String, dynamic>{}} as dynamic,
        )),
      );
}

/// Realistic nested wire payloads mirroring the backend delta shape
/// (`InboundSyncRecipeVersionDto`, #519 U1): nested components plus the
/// per-version insumo authority closure.
Map<String, dynamic> _wireVersion({
  String id = 'rv-1',
  String tenantId = 'tenant-alpha',
  String productId = 'prod-pizza',
  List<Map<String, dynamic>> components = const [],
  List<Map<String, dynamic>> insumos = const [],
}) {
  return {
    'id': id,
    'recipeVersionId': id,
    'tenantId': tenantId,
    'productId': productId,
    'recipeDocumentId': null,
    'productName': 'Pizza',
    'versionNumber': 1,
    'isActive': true,
    'publicationState': 'PUBLISHED',
    'effectiveAt': '2026-09-01T00:00:00Z',
    'effectiveUntil': null,
    'yieldQuantity': 1.0,
    'technicalShrinkPct': 0.0,
    'versionNote': null,
    'publishedAt': null,
    'posCreatedAt': null,
    'origin': 'BACKOFFICE',
    'suggestionState': 'NONE',
    'createdAt': '2026-08-30T00:00:00Z',
    'components': components,
    'insumos': insumos,
  };
}

Map<String, dynamic> _wireComponent({
  String id = 'comp-1',
  String tenantId = 'tenant-alpha',
  String versionId = 'rv-1',
  String insumoId = 'ins-1',
}) {
  return {
    'id': id,
    'tenantId': tenantId,
    'recipeVersionId': versionId,
    'componentOrdinal': 0,
    'insumoId': insumoId,
    'quantityPerSaleUnit': 0.25,
    'grossQuantity': 0.2,
    'technicalShrinkPct': 0.0,
    'ingredientName': 'Mozzarella',
    'ingredientType': 'DIRECT',
    'componentUom': 'KG',
    'referenceVersionId': null,
  };
}

Map<String, dynamic> _wireClosureInsumo({
  String id = 'ins-1',
  String tenantId = 'tenant-alpha',
}) {
  return {'id': id, 'tenantId': tenantId, 'name': 'Mozzarella', 'uom': 'KG'};
}
