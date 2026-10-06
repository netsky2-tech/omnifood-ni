import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';

/// Issue #506 regression proof.
///
/// The activation verification-sale payload and the normal sales push record
/// are built for the SAME persisted invoice and MUST be byte-identical:
/// the backend derives a payload hash over the record fields, and a shape
/// divergence under the same idempotencyKey (historically the activation
/// path's extra `movements: []` key) makes the backend answer
/// IDEMPOTENCY_MISMATCH / CRITICAL_PAYLOAD_MISMATCH with retryable:false,
/// leaving the ticket pending forever.
class _MockAlertService extends Mock implements AlertService {
  @override
  Future<void> createStockAlert(dynamic insumo, double? currentStock) =>
      Future<void>.value();
}

class _MockDio extends Mock implements Dio {}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late AppDatabase database;
  late SalesRepositoryImpl salesRepo;
  late ActivationControlledSaleRunner saleRunner;

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    final mockAlertService = _MockAlertService();

    final capabilityCache = TenantCapabilityCache(
      configDao: database.localConfigDao,
      clock: StopwatchMonotonicClock(),
      bootSessionId: 'test-session-parity',
      nowUtc: () => DateTime.now().toUtc(),
    );

    final authRepo = AuthRepositoryImpl(
      database.userDao,
      database.securityProfileDao,
      LocalAuthService(),
      _MockDio(),
      capabilityCache: capabilityCache,
    );

    final auditRepo = AuditRepositoryImpl(
      database.auditDao,
      authRepo,
      _MockDio(),
      'pos-terminal-founder-01',
      capabilityCache: capabilityCache,
      forensicAlertDao: database.forensicAlertDao,
    );

    final inventoryRepo = InventoryRepositoryImpl(
      insumoDao: database.insumoDao,
      recipeDao: database.recipeDao,
      movementDao: database.movementDao,
      movementSyncStateDao: database.movementSyncStateDao,
      supplierDao: database.supplierDao,
      warehouseDao: database.warehouseDao,
      countSessionDao: database.countSessionDao,
      countLineDao: database.countLineDao,
      forensicAlertDao: database.forensicAlertDao,
      uomConversionDao: database.uomConversionDao,
      batchDao: database.batchDao,
      purchaseDao: database.purchaseDao,
      recipeVersionDocumentDao: database.recipeVersionDocumentDao,
      productionOrderDocumentDao: database.productionOrderDocumentDao,
      dio: _MockDio(),
      database: database,
    );

    final movementEngine = MovementEngineImpl(inventoryRepo, mockAlertService);
    final numberingService = DgiNumberingServiceImpl(database.localConfigDao);

    salesRepo = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: numberingService,
      movementEngine: movementEngine,
      auditRepository: auditRepo,
      processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
      reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
      inventoryRepository: inventoryRepo,
    );

    saleRunner = ActivationControlledSaleRunner(
      database: database,
      salesRepository: salesRepo,
      printerPort: MockPrinterAdapter(),
    );
  });

  tearDown(() async {
    await database.close();
  });

  Future<void> seedPrerequisites() async {
    const tenantId = 'tenant-founder-01';
    const verificationProductId = 'prod-pin-001';

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_current_number', value: '1'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_range_end', value: '1000'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'REGIMEN_GENERAL'),
    );

    await database.userDao.insertUsers([
      UserEntity(
        id: 'cashier-off-01',
        name: 'Cajero Offline',
        role: 'CASHIER',
        pinHash: '',
        isActive: true,
        tenantId: tenantId,
      ),
    ]);
    await database.securityProfileDao.insertProfiles([
      SecurityProfileEntity(
        userId: 'cashier-off-01',
        pinHash: LocalAuthService().hashPin('123456'),
        isPinEnabled: true,
        isTotpEnabled: false,
      ),
    ]);

    await database.productDao.insertProducts([
      ProductEntity(
        id: verificationProductId,
        name: 'Café de Prueba Activación',
        sellPrice: 50.0,
        averageCost: 15.0,
        stock: 100.0,
        uom: 'CUP',
        barcode: 'PROD-ACT-001',
        isActive: true,
        isPrepared: false,
        tenantId: tenantId,
      ),
    ]);

    await database.activationAttemptLocalDao.saveAttempt(
      ActivationAttemptLocalEntity(
        attemptId: 'attempt-parity-uuid-1',
        tenantId: tenantId,
        candidateTerminalId: 'pos-terminal-founder-01',
        localStatus: 'RUNNING',
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: 'fiscal-fp-123',
        verificationProductId: verificationProductId,
        assignedAt: '2026-09-04T12:00:00.000Z',
        updatedAt: '2026-09-04T12:00:00.000Z',
      ),
    );
  }

  test(
    'activation verification-sale record is deep-equal to the push mapper record for the same invoice',
    () async {
      await seedPrerequisites();

      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: 'tenant-founder-01',
          attemptId: 'attempt-parity-uuid-1',
          cashierUserId: 'cashier-off-01',
        ),
      );
      expect(result.isSuccess, isTrue);
      final ticketId = result.verificationTicketId!;

      // Activation runner path: the VERIFICATION_SALE envelope carries the
      // exact record the activation outbox will push.
      final verificationEnvelope = result.outboxEnvelopes.singleWhere(
        (envelope) => envelope.eventType == 'VERIFICATION_SALE',
      );
      final activationRecord =
          jsonDecode(verificationEnvelope.payloadJson) as Map<String, dynamic>;

      // Push mapper path: the same persisted invoice through the normal
      // sales push pipeline (getUnsyncedAggregates -> _buildSalesRecord).
      final aggregates = await salesRepo.getUnsyncedAggregates();
      final aggregate = aggregates.singleWhere((a) => a['id'] == ticketId);
      final pushRecord = SyncService.buildSalesSyncRecord(aggregate);

      expect(
        activationRecord.keys.toSet(),
        equals(pushRecord.keys.toSet()),
        reason:
            'record key sets must match; the backend payload hash covers '
            'exactly these fields (issue #506)',
      );
      expect(activationRecord, equals(pushRecord));
    },
  );
}
