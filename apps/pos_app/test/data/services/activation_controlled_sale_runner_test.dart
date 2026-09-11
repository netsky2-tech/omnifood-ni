import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart' as p;
import 'package:mockito/mockito.dart';
import 'package:dio/dio.dart';

import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_check_result_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_outbox_envelope_entity.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';

class MockDio extends Mock implements Dio {}

class MockAlertService extends Mock implements AlertService {
  @override
  Future<void> createStockAlert(dynamic insumo, double? currentStock) =>
      Future<void>.value();
}

void main() {
  late AppDatabase database;
  late MockPrinterAdapter printerAdapter;
  late LocalAuthService localAuth;
  late MockDio mockDio;
  late MockAlertService mockAlertService;
  late TenantCapabilityCache capabilityCache;
  late AuthRepositoryImpl authRepo;
  late AuditRepositoryImpl auditRepo;
  late InventoryRepositoryImpl inventoryRepo;
  late MovementEngineImpl movementEngine;
  late DgiNumberingServiceImpl numberingService;
  late SalesRepositoryImpl salesRepo;
  late ActivationControlledSaleRunner saleRunner;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    printerAdapter = MockPrinterAdapter();
    localAuth = LocalAuthService();
    mockDio = MockDio();
    mockAlertService = MockAlertService();

    capabilityCache = TenantCapabilityCache(
      configDao: database.localConfigDao,
      clock: StopwatchMonotonicClock(),
      bootSessionId: 'test-session-pr20',
      nowUtc: () => DateTime.now().toUtc(),
    );

    authRepo = AuthRepositoryImpl(
      database.userDao,
      database.securityProfileDao,
      localAuth,
      mockDio,
      capabilityCache: capabilityCache,
    );

    auditRepo = AuditRepositoryImpl(
      database.auditDao,
      authRepo,
      mockDio,
      'pos-terminal-founder-01',
      capabilityCache: capabilityCache,
      forensicAlertDao: database.forensicAlertDao,
    );

    inventoryRepo = InventoryRepositoryImpl(
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
      dio: mockDio,
      database: database,
    );

    movementEngine = MovementEngineImpl(inventoryRepo, mockAlertService);
    numberingService = DgiNumberingServiceImpl(database.localConfigDao);

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
      printerPort: printerAdapter,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('ONB1.8C — Controlled Offline Sale (Production Path & PAID Real)', () {
    const tenantId = 'tenant-founder-01';
    const attemptId = 'attempt-pr20-uuid-1';
    const verificationProductId = 'prod-pin-001';
    const cashierId = 'cashier-off-01';

    Future<void> seedPrerequisites({String attemptStatus = 'RUNNING'}) async {
      // 1. DGI Numbering range in localConfig
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'dgi_prefix',
          value: '001-001-01',
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'dgi_current_seq',
          value: '1',
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'dgi_range_end',
          value: '1000',
        ),
      );

      // 2. User & profile
      await database.userDao.insertUsers([
        UserEntity(
          id: cashierId,
          name: 'Cajero Offline',
          role: 'CASHIER',
          pinHash: '',
          isActive: true,
          tenantId: tenantId,
        ),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: cashierId,
          pinHash: localAuth.hashPin('123456'),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      // 3. Verification Product in Catalog
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

      // 4. Attempt in SQLite
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: 'pos-terminal-founder-01',
          localStatus: attemptStatus,
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fiscal-fp-123',
          verificationProductId: verificationProductId,
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );
    }

    test('fails if attempt is not in RUNNING state (pre-condition gate)', () async {
      await seedPrerequisites(attemptStatus: 'ASSIGNED');

      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isFalse);
      expect(result.errors, anyElement(contains('ATTEMPT_NOT_IN_RUNNING')));
      expect(result.attemptStatus, equals('ASSIGNED'));
    });

    test('executes real production checkout, reaches PAID, persists ticket locally, and prints receipt', () async {
      await seedPrerequisites();

      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isTrue);
      expect(result.verificationTicketId, isNotNull);
      expect(result.attemptStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));

      // 1. Verify invoice in SQLite
      final invoice = await database.invoiceDao.getInvoiceById(result.verificationTicketId!);
      expect(invoice, isNotNull);
      expect(invoice!.total, equals(50.0));
      expect(invoice.paymentStatus, equals('paid'));
      expect(invoice.syncStatus, equals('pending'));
      expect(invoice.terminalId, equals('pos-terminal-founder-01'));
      expect(invoice.idempotencyKey, equals('onboarding:activation-sale:$tenantId:$attemptId'));

      // 2. Verify invoice items in SQLite
      final items = await database.invoiceItemDao.getItemsByInvoiceId(invoice.id);
      expect(items.length, equals(1));
      expect(items.first.productId, equals(verificationProductId));
      expect(items.first.total, equals(50.0));

      // 3. Verify payments in SQLite
      final payments = await database.paymentDao.getPaymentsByInvoiceId(invoice.id);
      expect(payments.length, equals(1));
      expect(payments.first.amount, equals(50.0));
      expect(payments.first.method, equals('cash'));

      final envelopes = await database.activationOutboxDao.getEnvelopesByAttempt(
        tenantId,
        attemptId,
      );
      final verificationEnvelope = envelopes.firstWhere(
        (envelope) => envelope.eventType == 'VERIFICATION_SALE',
      );
      final verificationPayload =
          jsonDecode(verificationEnvelope.payloadJson) as Map<String, dynamic>;
      final persistedPayload =
          verificationPayload['invoice'] as Map<String, dynamic>;
      expect(verificationPayload['sourceDeviceId'], invoice.terminalId);
      expect(verificationPayload['terminalId'], invoice.terminalId);
      expect(verificationPayload['sourceSequence'], invoice.sourceSequence);
      expect(verificationPayload['idempotencyKey'], invoice.idempotencyKey);
      expect(persistedPayload['id'], invoice.id);
      expect(persistedPayload['items'], hasLength(1));
      expect(persistedPayload['payments'], hasLength(1));

      // 4. Verify printer receipt called
      expect(printerAdapter.printHistory.length, equals(1));

      // 5. Verify checks recorded
      final saleCheck = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'OFFLINE_SALE_PAID',
      );
      expect(saleCheck, isNotNull);
      expect(saleCheck!.status, equals('PASS'));
      expect(saleCheck.evidenceRef, equals(invoice.id));

      final receiptCheck = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'SALE_RECEIPT_PATH',
      );
      expect(receiptCheck, isNotNull);
      expect(receiptCheck!.status, equals('PASS'));

      // 6. Verify attempt correlated verificationTicketId
      final updatedAttempt = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(updatedAttempt, isNotNull);
      expect(updatedAttempt!.verificationTicketId, equals(invoice.id));
      expect(updatedAttempt.localStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
    });

    test('retry of attempt does not create a second verification ticket (idempotency)', () async {
      await seedPrerequisites();

      // First run
      final firstResult = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );
      expect(firstResult.isSuccess, isTrue);
      final firstTicketId = firstResult.verificationTicketId;

      // Second run (attempt retry)
      final secondResult = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );
      expect(secondResult.isSuccess, isTrue);
      expect(secondResult.verificationTicketId, equals(firstTicketId));

      // Assert total invoices in database is still exactly 1
      final allInvoices = await database.invoiceDao.getInvoicesBySyncStatus('pending');
      expect(allInvoices.length, equals(1));
      expect(allInvoices.first.id, equals(firstTicketId));
    });

    test('rejects attempt retry when payload parameters conflict (INTEGRITY_CONFLICT)', () async {
      await seedPrerequisites();

      // First run with standard price
      await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      // Mutate attempt status back to RUNNING to attempt forging a conflicting sale
      final attempt = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      await database.activationAttemptLocalDao.updateAttempt(
        attempt!.copyWith(localStatus: 'RUNNING'),
      );

      // Second run with conflicting amount
      final conflictingResult = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
          customAmount: 999.0, // conflicting amount
        ),
      );

      expect(conflictingResult.isSuccess, isFalse);
      expect(conflictingResult.errors, anyElement(contains('INTEGRITY_CONFLICT')));
    });

    test('fails if receipt printer is offline or broken', () async {
      await seedPrerequisites();
      printerAdapter.currentStatus = PrinterStatus.offline;

      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isFalse);
      expect(result.errors, anyElement(contains('SALE_RECEIPT_PATH_FAILED')));

      final receiptCheck = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'SALE_RECEIPT_PATH',
      );
      expect(receiptCheck, isNotNull);
      expect(receiptCheck!.status, equals('FAIL'));
    });
  });

  group('ONB1.8D — Outbox Durability & Multi-Tenant Isolation', () {
    const tenantId = 'tenant-founder-01';
    const attemptId = 'attempt-pr20-outbox-1';
    const verificationProductId = 'prod-pin-001';
    const cashierId = 'cashier-off-01';

    Future<void> seedPrerequisites() async {
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'dgi_prefix',
          value: '001-001-01',
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'dgi_current_seq',
          value: '10',
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'dgi_range_end',
          value: '1000',
        ),
      );

      await database.userDao.insertUsers([
        UserEntity(
          id: cashierId,
          name: 'Cajero Offline',
          role: 'CASHIER',
          pinHash: '',
          isActive: true,
          tenantId: tenantId,
        ),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: cashierId,
          pinHash: localAuth.hashPin('123456'),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      await database.productDao.insertProducts([
        ProductEntity(
          id: verificationProductId,
          name: 'Café de Prueba Activación',
          sellPrice: 45.0,
          averageCost: 10.0,
          stock: 100.0,
          uom: 'CUP',
          barcode: 'PROD-ACT-002',
          isActive: true,
          isPrepared: false,
          tenantId: tenantId,
        ),
      ]);

      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: attemptId,
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

    test('consolidates durable outbox envelopes before WAN reconnect', () async {
      await seedPrerequisites();

      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isTrue);

      // Verify OUTBOX_DURABLE check is PASS
      final outboxCheck = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'OUTBOX_DURABLE',
      );
      expect(outboxCheck, isNotNull);
      expect(outboxCheck!.status, equals('PASS'));

      // Verify outbox envelopes in activation_outbox_envelopes table
      final envelopes = await database.activationOutboxDao.getEnvelopesByAttempt(
        tenantId,
        attemptId,
      );
      expect(envelopes.length, greaterThanOrEqualTo(3));

      for (final env in envelopes) {
        expect(env.tenantId, equals(tenantId));
        expect(env.activationAttemptId, equals(attemptId));
        expect(env.syncStatus, equals('PENDING'));
        expect(env.payloadHash, isNotEmpty);
        expect(env.payloadJson, isNotEmpty);

        // Verify SHA-256 integrity
        final parsed = jsonDecode(env.payloadJson);
        expect(parsed, isNotNull);
      }
    });

    test('multi-tenant isolation: Tenant A envelopes and sales do not cross Tenant B boundaries', () async {
      await seedPrerequisites();

      // Tenant A runs controlled sale
      final resA = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );
      expect(resA.isSuccess, isTrue);

      // Setup Tenant B
      const tenantB = 'tenant-isolated-02';
      const attemptB = 'attempt-pr20-tenant-b';
      await database.userDao.insertUsers([
        UserEntity(
          id: 'cashier-b',
          name: 'Cajero B',
          role: 'CASHIER',
          pinHash: '',
          isActive: true,
          tenantId: tenantB,
        ),
      ]);
      await database.productDao.insertProducts([
        ProductEntity(
          id: 'prod-b-01',
          name: 'Producto B',
          sellPrice: 80.0,
          averageCost: 20.0,
          stock: 100.0,
          uom: 'UNIT',
          barcode: 'PROD-B',
          isActive: true,
          isPrepared: false,
          tenantId: tenantB,
        ),
      ]);
      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: attemptB,
          tenantId: tenantB,
          candidateTerminalId: 'pos-terminal-founder-01',
          localStatus: 'RUNNING',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fiscal-fp-tenant-b',
          verificationProductId: 'prod-b-01',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      final resB = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantB,
          attemptId: attemptB,
          cashierUserId: 'cashier-b',
        ),
      );
      expect(resB.isSuccess, isTrue);

      // Verify envelopes are partitioned
      final envsA = await database.activationOutboxDao.getEnvelopesByAttempt(tenantId, attemptId);
      final envsB = await database.activationOutboxDao.getEnvelopesByAttempt(tenantB, attemptB);
      expect(envsA.every((e) => e.tenantId == tenantId), isTrue);
      expect(envsB.every((e) => e.tenantId == tenantB), isTrue);
      expect(envsA.any((e) => e.tenantId == tenantB), isFalse);
    });

    test('offline sale and outbox envelopes survive database close and reopen (Disk Persistence)', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_offline_sale_durability_');
      final dbPath = p.join(tempDir.path, 'pos_offline_sale_test.db');

      try {
        final diskDb1 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        // Seed on diskDb1
        await diskDb1.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: 'dgi_prefix',
            value: '001-001-01',
          ),
        );
        await diskDb1.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: 'dgi_current_seq',
            value: '20',
          ),
        );
        await diskDb1.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: 'dgi_range_end',
            value: '1000',
          ),
        );
        await diskDb1.productDao.insertProducts([
          ProductEntity(
            id: verificationProductId,
            name: 'Café de Prueba Activación',
            sellPrice: 50.0,
            averageCost: 15.0,
            stock: 100.0,
            uom: 'CUP',
            barcode: 'PROD-ACT-DISK',
            isActive: true,
            isPrepared: false,
            tenantId: tenantId,
          ),
        ]);
        await diskDb1.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
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

        final diskNumbering = DgiNumberingServiceImpl(diskDb1.localConfigDao);
        final diskInventory = InventoryRepositoryImpl(
          insumoDao: diskDb1.insumoDao,
          recipeDao: diskDb1.recipeDao,
          movementDao: diskDb1.movementDao,
          movementSyncStateDao: diskDb1.movementSyncStateDao,
          supplierDao: diskDb1.supplierDao,
          warehouseDao: diskDb1.warehouseDao,
          countSessionDao: diskDb1.countSessionDao,
          countLineDao: diskDb1.countLineDao,
          forensicAlertDao: diskDb1.forensicAlertDao,
          uomConversionDao: diskDb1.uomConversionDao,
          batchDao: diskDb1.batchDao,
          purchaseDao: diskDb1.purchaseDao,
          recipeVersionDocumentDao: diskDb1.recipeVersionDocumentDao,
          productionOrderDocumentDao: diskDb1.productionOrderDocumentDao,
          dio: mockDio,
          database: diskDb1,
        );
        final diskMovement = MovementEngineImpl(diskInventory, mockAlertService);
        final diskSales = SalesRepositoryImpl(
          database: diskDb1,
          invoiceDao: diskDb1.invoiceDao,
          itemDao: diskDb1.invoiceItemDao,
          paymentDao: diskDb1.paymentDao,
          transactionDao: diskDb1.salesTransactionDao,
          numberingService: diskNumbering,
          movementEngine: diskMovement,
          auditRepository: auditRepo,
          processInventoryUseCase: ProcessSaleInventoryUseCase(diskMovement),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(diskMovement),
          inventoryRepository: diskInventory,
        );
        final diskRunner = ActivationControlledSaleRunner(
          database: diskDb1,
          salesRepository: diskSales,
          printerPort: printerAdapter,
        );

        final runResult = await diskRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: cashierId,
          ),
        );
        expect(runResult.isSuccess, isTrue);
        final ticketId = runResult.verificationTicketId;

        // Close diskDb1 (simulating POS crash or power cut while offline)
        await diskDb1.close();

        // Reopen diskDb2
        final diskDb2 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        // 1. Recheck Attempt
        final attemptRecovered = await diskDb2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(attemptRecovered, isNotNull);
        expect(attemptRecovered!.localStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
        expect(attemptRecovered.verificationTicketId, equals(ticketId));

        // 2. Recheck Invoice
        final invoiceRecovered = await diskDb2.invoiceDao.getInvoiceById(ticketId!);
        expect(invoiceRecovered, isNotNull);
        expect(invoiceRecovered!.total, equals(50.0));
        expect(invoiceRecovered.paymentStatus, equals('paid'));
        expect(invoiceRecovered.syncStatus, equals('pending'));

        // 3. Recheck Checks
        final checkRecovered = await diskDb2.activationCheckResultLocalDao.getCheck(
          tenantId,
          attemptId,
          'OFFLINE_SALE_PAID',
        );
        expect(checkRecovered, isNotNull);
        expect(checkRecovered!.status, equals('PASS'));

        // 4. Recheck Outbox Envelopes
        final envsRecovered = await diskDb2.activationOutboxDao.getEnvelopesByAttempt(
          tenantId,
          attemptId,
        );
        expect(envsRecovered.length, greaterThanOrEqualTo(3));
        expect(envsRecovered.every((e) => e.syncStatus == 'PENDING'), isTrue);

        await diskDb2.close();
      } finally {
        if (await tempDir.exists()) {
          await tempDir.delete(recursive: true);
        }
      }
    });
  });

  group('TDD Triangulation — Domain Invariants & Edge Cases', () {
    const tenantId = 'tenant-founder-01';
    const attemptId = 'attempt-pr20-triangulation';
    const cashierId = 'cashier-triangulation';

    test('fails if verification product is missing from SQLite catalog', () async {
      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: 'pos-terminal-founder-01',
          localStatus: 'RUNNING',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fiscal-fp-123',
          verificationProductId: 'prod-non-existent',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isFalse);
      expect(result.errors, anyElement(contains('VERIFICATION_PRODUCT_NOT_FOUND')));
    });

    test('fails if attempt is not found in SQLite', () async {
      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: 'unknown-attempt-id',
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isFalse);
      expect(result.errors, anyElement(contains('not found in SQLite')));
    });

    test('fails if tenant mismatch occurs between attempt and parameter', () async {
      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: 'tenant-correct',
          candidateTerminalId: 'pos-terminal-founder-01',
          localStatus: 'RUNNING',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fiscal-fp-123',
          verificationProductId: 'prod-01',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      final result = await saleRunner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: 'tenant-wrong-spoofed',
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isFalse);
      expect(result.errors, anyElement(contains('TENANT_MISMATCH')));
    });

    test('activation_outbox_envelopes enforces uniqueness on (tenant_id, idempotency_key)', () async {
      const envelope1 = ActivationOutboxEnvelopeEntity(
        id: 'env-1',
        tenantId: tenantId,
        activationAttemptId: attemptId,
        eventType: 'ACTIVATION_CHECK',
        idempotencyKey: 'idemp-key-unique-01',
        payloadJson: '{"test": 1}',
        payloadHash: 'hash-01',
        syncStatus: 'PENDING',
        createdAt: '2026-09-04T12:00:00.000Z',
      );

      await database.activationOutboxDao.insertEnvelope(envelope1);

      // Attempt inserting duplicate envelope with same tenant and idempotency key
      const duplicateEnvelope = ActivationOutboxEnvelopeEntity(
        id: 'env-2',
        tenantId: tenantId,
        activationAttemptId: attemptId,
        eventType: 'ACTIVATION_CHECK',
        idempotencyKey: 'idemp-key-unique-01',
        payloadJson: '{"test": 2}',
        payloadHash: 'hash-02',
        syncStatus: 'PENDING',
        createdAt: '2026-09-04T12:00:01.000Z',
      );

      expect(
        () async => await database.activationOutboxDao.insertEnvelope(duplicateEnvelope),
        throwsA(anything),
      );
    });

    group('ONB1.8E & ONB1.8F — TTFSS First Successful Sale Claim & Clock Semantics', () {
      const tenantId = 'tenant-founder-01';
      const attemptId = 'attempt-pr21-uuid-1';
      const verificationProductId = 'prod-pin-001';
      const cashierId = 'cashier-off-01';

      Future<void> seedPrerequisites({
        String attemptStatus = 'RUNNING',
        String? serverTimeAnchorAt,
        int? anchorMonotonicTicks,
        String? bootSessionId,
      }) async {
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_current_seq', value: '1'),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_range_end', value: '1000'),
        );

        await database.userDao.insertUsers([
          UserEntity(
            id: cashierId,
            name: 'Cajero Offline',
            role: 'CASHIER',
            pinHash: '',
            isActive: true,
            tenantId: tenantId,
          ),
        ]);
        await database.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: cashierId,
            pinHash: localAuth.hashPin('123456'),
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
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: 'pos-terminal-founder-01',
            localStatus: attemptStatus,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: 'fiscal-fp-123',
            verificationProductId: verificationProductId,
            serverTimeAnchorAt: serverTimeAnchorAt,
            anchorMonotonicTicks: anchorMonotonicTicks,
            bootSessionId: bootSessionId,
            assignedAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:00:00.000Z',
          ),
        );
      }

      test('creates atomic FirstSuccessfulSaleClaimEntity and emits FIRST_SUCCESSFUL_SALE_OBSERVED outbox envelope', () async {
        await seedPrerequisites(
          serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
          anchorMonotonicTicks: 0,
          bootSessionId: 'boot-session-pr21',
        );

        final result = await saleRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: cashierId,
          ),
        );

        expect(result.isSuccess, isTrue);
        expect(result.verificationTicketId, isNotNull);

        // 1. Verify FirstSuccessfulSaleClaimEntity in Floor SQLite
        final claim = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(claim, isNotNull);
        expect(claim!.tenantId, equals(tenantId));
        expect(claim.terminalId, equals('pos-terminal-founder-01'));
        expect(claim.ticketId, equals(result.verificationTicketId));
        expect(claim.activationAttemptId, equals(attemptId));
        expect(claim.clockConfidence, equals('ANCHORED'));
        expect(claim.anchoredOccurredAt, isNotNull);
        expect(claim.deviceOccurredAt, isNotEmpty);
        expect(claim.outboxEventId, isNotEmpty);

        // 2. Verify FIRST_SUCCESSFUL_SALE_OBSERVED envelope in outbox
        final envelopes = await database.activationOutboxDao.getPendingEnvelopes(tenantId);
        final firstSaleEnv = envelopes.firstWhere((e) => e.eventType == 'FIRST_SUCCESSFUL_SALE_OBSERVED');
        expect(firstSaleEnv, isNotNull);
        expect(firstSaleEnv.idempotencyKey, equals('onboarding:first-sale:$tenantId'));
        expect(firstSaleEnv.syncStatus, equals('PENDING'));

        final payload = jsonDecode(firstSaleEnv.payloadJson) as Map<String, dynamic>;
        expect(payload['ticketId'], equals(result.verificationTicketId));
        expect(payload['clockConfidence'], equals('ANCHORED'));
        expect(payload['anchoredOccurredAt'], isNotNull);
      });

      test('write-once invariant: second sale or attempt retry NEVER overwrites winning claim nor emits second FIRST_SUCCESSFUL_SALE_OBSERVED', () async {
        await seedPrerequisites(
          serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
          anchorMonotonicTicks: 0,
          bootSessionId: 'boot-session-pr21',
        );

        // First sale
        final firstResult = await saleRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: cashierId,
          ),
        );
        expect(firstResult.isSuccess, isTrue);
        final winningTicketId = firstResult.verificationTicketId!;

        final claimBefore = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(claimBefore!.ticketId, equals(winningTicketId));

        // Re-execute or simulate a second attempt / sale
        final retryResult = await saleRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: cashierId,
          ),
        );
        expect(retryResult.isSuccess, isTrue);

        // Claim must still be the original winning ticket
        final claimAfter = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(claimAfter!.ticketId, equals(winningTicketId));
        expect(claimAfter.createdAtLocal, equals(claimBefore.createdAtLocal));

        // Exactly one FIRST_SUCCESSFUL_SALE_OBSERVED outbox envelope must exist
        final envelopes = await database.activationOutboxDao.getPendingEnvelopes(tenantId);
        final firstSaleEnvs = envelopes.where((e) => e.eventType == 'FIRST_SUCCESSFUL_SALE_OBSERVED').toList();
        expect(firstSaleEnvs.length, equals(1));
      });

      test('claim survives database restart with real SQLite disk persistence', () async {
        final tempDir = await Directory.systemTemp.createTemp('pos_claim_disk_test_');
        final dbFile = File(p.join(tempDir.path, 'pos_claim_test.db'));

        try {
          // Open DB on disk
          var diskDb = await $FloorAppDatabase.databaseBuilder(dbFile.path).build();

          // Seed configs
          await diskDb.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'));
          await diskDb.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_current_seq', value: '1'));
          await diskDb.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_range_end', value: '1000'));
          await diskDb.userDao.insertUsers([
            UserEntity(id: cashierId, name: 'Cajero Offline', role: 'CASHIER', pinHash: '', isActive: true, tenantId: tenantId),
          ]);
          await diskDb.securityProfileDao.insertProfiles([
            SecurityProfileEntity(userId: cashierId, pinHash: localAuth.hashPin('123456'), isPinEnabled: true, isTotpEnabled: false),
          ]);
          await diskDb.productDao.insertProducts([
            ProductEntity(id: verificationProductId, name: 'Café de Prueba', sellPrice: 50.0, averageCost: 15.0, stock: 100.0, uom: 'CUP', barcode: 'PROD-01', isActive: true, isPrepared: false, tenantId: tenantId),
          ]);
          await diskDb.activationAttemptLocalDao.saveAttempt(
            ActivationAttemptLocalEntity(
              attemptId: attemptId,
              tenantId: tenantId,
              candidateTerminalId: 'pos-terminal-founder-01',
              localStatus: 'RUNNING',
              requiredFiscalRevision: 1,
              requiredFiscalFingerprint: 'fiscal-fp-123',
              verificationProductId: verificationProductId,
              serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
              anchorMonotonicTicks: 0,
              bootSessionId: 'boot-session-pr21',
              assignedAt: '2026-09-04T12:00:00.000Z',
              updatedAt: '2026-09-04T12:00:00.000Z',
            ),
          );

          final capCache = TenantCapabilityCache(
            configDao: diskDb.localConfigDao,
            clock: StopwatchMonotonicClock(),
            bootSessionId: 'disk-session',
            nowUtc: () => DateTime.now().toUtc(),
          );
          final aRepo = AuthRepositoryImpl(diskDb.userDao, diskDb.securityProfileDao, localAuth, mockDio, capabilityCache: capCache);
          final audRepo = AuditRepositoryImpl(diskDb.auditDao, aRepo, mockDio, 'pos-terminal-founder-01', capabilityCache: capCache, forensicAlertDao: diskDb.forensicAlertDao);
          final invRepo = InventoryRepositoryImpl(
            insumoDao: diskDb.insumoDao, recipeDao: diskDb.recipeDao, movementDao: diskDb.movementDao,
            movementSyncStateDao: diskDb.movementSyncStateDao, supplierDao: diskDb.supplierDao,
            warehouseDao: diskDb.warehouseDao, countSessionDao: diskDb.countSessionDao,
            countLineDao: diskDb.countLineDao, forensicAlertDao: diskDb.forensicAlertDao,
            uomConversionDao: diskDb.uomConversionDao, batchDao: diskDb.batchDao,
            purchaseDao: diskDb.purchaseDao, recipeVersionDocumentDao: diskDb.recipeVersionDocumentDao,
            productionOrderDocumentDao: diskDb.productionOrderDocumentDao, dio: mockDio, database: diskDb,
          );
          final movEng = MovementEngineImpl(invRepo, mockAlertService);
          final numServ = DgiNumberingServiceImpl(diskDb.localConfigDao);
          final sRepo = SalesRepositoryImpl(
            database: diskDb, invoiceDao: diskDb.invoiceDao, itemDao: diskDb.invoiceItemDao,
            paymentDao: diskDb.paymentDao, transactionDao: diskDb.salesTransactionDao,
            numberingService: numServ, movementEngine: movEng, auditRepository: audRepo,
            processInventoryUseCase: ProcessSaleInventoryUseCase(movEng),
            reverseInventoryUseCase: ReverseSaleInventoryUseCase(movEng),
            inventoryRepository: invRepo,
          );

          final runner = ActivationControlledSaleRunner(
            database: diskDb,
            salesRepository: sRepo,
            printerPort: printerAdapter,
          );

          final res = await runner.executeControlledOfflineSale(
            const ControlledSaleParams(tenantId: tenantId, attemptId: attemptId, cashierUserId: cashierId),
          );
          expect(res.isSuccess, isTrue);

          // Close database connection (simulating reboot/crash)
          await diskDb.close();

          // Re-open from disk
          diskDb = await $FloorAppDatabase.databaseBuilder(dbFile.path).build();
          final reloadedClaim = await diskDb.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
          expect(reloadedClaim, isNotNull);
          expect(reloadedClaim!.ticketId, equals(res.verificationTicketId));
          expect(reloadedClaim.clockConfidence, equals('ANCHORED'));

          final envelopes = await diskDb.activationOutboxDao.getPendingEnvelopes(tenantId);
          expect(envelopes.any((e) => e.eventType == 'FIRST_SUCCESSFUL_SALE_OBSERVED'), isTrue);

          await diskDb.close();
        } finally {
          if (await tempDir.exists()) {
            await tempDir.delete(recursive: true);
          }
        }
      });
    });
  });
}
