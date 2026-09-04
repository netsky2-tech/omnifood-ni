import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart' as p;
import 'package:mockito/mockito.dart';
import 'package:dio/dio.dart';

import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
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
import 'package:pos_app/data/services/activation_pre_offline_runner.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';
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
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('E2E POS Activation: Pre-Offline Checks -> Controlled Offline Sale -> Outbox Durability -> Crash Recovery', () {
    const tenantId = 'tenant-founder-e2e';
    const attemptId = 'attempt-founder-e2e-001';
    const candidateTerminalId = 'terminal-founder-pos-01';
    const verificationProductId = 'prod-pin-founder-coffee';
    const authorizedUserId = 'user-founder-owner';
    const pin = '123456';
    const fiscalFingerprint = 'fp-sha256-verified-fiscal-snapshot';

    test('Full lifecycle with real SQLite disk persistence survives crash before reconnect', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_activation_e2e_durability_');
      final dbPath = p.join(tempDir.path, 'pos_activation_e2e.db');

      try {
        final localAuth = LocalAuthService();
        final mockDio = MockDio();
        final mockAlertService = MockAlertService();
        final printerAdapter = MockPrinterAdapter();

        // -------------------------------------------------------------
        // STEP 1: Boot POS and Seed Cloud Assignment & Config
        // -------------------------------------------------------------
        final db1 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        // Pinned terminal identity
        await db1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'terminal_device_id', value: candidateTerminalId),
        );
        // DGI Range
        await db1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'),
        );
        await db1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_current_seq', value: '1'),
        );
        await db1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_range_end', value: '500'),
        );

        // Fiscal config snapshot
        await db1.fiscalConfigLocalDao.applyFiscalConfig(
          const FiscalConfigLocalEntity(
            tenantId: tenantId,
            revision: 1,
            fingerprint: fiscalFingerprint,
            payload: '{"businessName": "OmniFood Founder Cafe"}',
            appliedAt: '2026-09-04T10:00:00.000Z',
          ),
        );

        // User & Security Profile
        await db1.userDao.insertUsers([
          UserEntity(
            id: authorizedUserId,
            name: 'Founder Owner',
            role: 'ADMIN',
            pinHash: '',
            isActive: true,
            tenantId: tenantId,
          ),
        ]);
        await db1.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: authorizedUserId,
            pinHash: localAuth.hashPin(pin),
            isPinEnabled: true,
            isTotpEnabled: false,
          ),
        ]);

        // Verification Product
        await db1.productDao.insertProducts([
          ProductEntity(
            id: verificationProductId,
            name: 'Café Tueste Oscuro Especial',
            sellPrice: 65.0,
            averageCost: 20.0,
            stock: 100.0,
            uom: 'CUP',
            barcode: 'PROD-FOUNDER-COFFEE',
            isActive: true,
            isPrepared: false,
            tenantId: tenantId,
          ),
        ]);

        // Persist Cloud Activation Assignment
        await db1.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: candidateTerminalId,
            localStatus: 'ASSIGNED',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprint,
            verificationProductId: verificationProductId,
            assignedAt: '2026-09-04T10:00:00.000Z',
            updatedAt: '2026-09-04T10:00:00.000Z',
          ),
        );

        // -------------------------------------------------------------
        // STEP 2: Execute PR-19 Pre-Offline Checks Runner
        // -------------------------------------------------------------
        final configAdapter = ActivationRequiredConfigAdapter(
          database: db1,
          localAuthService: localAuth,
        );
        final terminalIdentity = TerminalIdentityService(db1.localConfigDao);
        final preOfflineRunner = ActivationPreOfflineRunner(
          database: db1,
          configAdapter: configAdapter,
          terminalIdentityService: terminalIdentity,
          printerPort: printerAdapter,
        );

        final preOfflineSummary = await preOfflineRunner.runPreOfflineChecks(
          const PreOfflineRunnerParams(
            attemptId: attemptId,
            tenantId: tenantId,
            authorizedUserId: authorizedUserId,
            authorizedUserPin: pin,
          ),
        );

        expect(preOfflineSummary.isReadyForOffline, isTrue);
        expect(preOfflineSummary.blockers, isEmpty);
        expect(preOfflineSummary.checks.length, equals(6));
        expect(preOfflineSummary.checks.values.every((c) => c.status == 'PASS'), isTrue);

        final attemptAfterPre = await db1.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(attemptAfterPre!.localStatus, equals('RUNNING'));

        // -------------------------------------------------------------
        // STEP 3: WAN Disconnected — Execute PR-20 Controlled Offline Sale
        // -------------------------------------------------------------
        final capabilityCache = TenantCapabilityCache(
          configDao: db1.localConfigDao,
          clock: StopwatchMonotonicClock(),
          bootSessionId: 'e2e-session-pr20',
          nowUtc: () => DateTime.now().toUtc(),
        );
        final authRepo = AuthRepositoryImpl(
          db1.userDao,
          db1.securityProfileDao,
          localAuth,
          mockDio,
          capabilityCache: capabilityCache,
        );
        final auditRepo = AuditRepositoryImpl(
          db1.auditDao,
          authRepo,
          mockDio,
          candidateTerminalId,
          capabilityCache: capabilityCache,
          forensicAlertDao: db1.forensicAlertDao,
        );
        final inventoryRepo = InventoryRepositoryImpl(
          insumoDao: db1.insumoDao,
          recipeDao: db1.recipeDao,
          movementDao: db1.movementDao,
          movementSyncStateDao: db1.movementSyncStateDao,
          supplierDao: db1.supplierDao,
          warehouseDao: db1.warehouseDao,
          countSessionDao: db1.countSessionDao,
          countLineDao: db1.countLineDao,
          forensicAlertDao: db1.forensicAlertDao,
          uomConversionDao: db1.uomConversionDao,
          batchDao: db1.batchDao,
          purchaseDao: db1.purchaseDao,
          recipeVersionDocumentDao: db1.recipeVersionDocumentDao,
          productionOrderDocumentDao: db1.productionOrderDocumentDao,
          dio: mockDio,
          database: db1,
        );
        final movementEngine = MovementEngineImpl(inventoryRepo, mockAlertService);
        final numberingService = DgiNumberingServiceImpl(db1.localConfigDao);
        final salesRepo = SalesRepositoryImpl(
          database: db1,
          invoiceDao: db1.invoiceDao,
          itemDao: db1.invoiceItemDao,
          paymentDao: db1.paymentDao,
          transactionDao: db1.salesTransactionDao,
          numberingService: numberingService,
          movementEngine: movementEngine,
          auditRepository: auditRepo,
          processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
          inventoryRepository: inventoryRepo,
        );

        final saleRunner = ActivationControlledSaleRunner(
          database: db1,
          salesRepository: salesRepo,
          printerPort: printerAdapter,
        );

        final saleResult = await saleRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: authorizedUserId,
          ),
        );

        expect(saleResult.isSuccess, isTrue);
        expect(saleResult.verificationTicketId, isNotNull);
        expect(saleResult.attemptStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
        expect(saleResult.checks['OFFLINE_SALE_PAID']!.status, equals('PASS'));
        expect(saleResult.checks['SALE_RECEIPT_PATH']!.status, equals('PASS'));
        expect(saleResult.checks['OUTBOX_DURABLE']!.status, equals('PASS'));
        expect(printerAdapter.printHistory.length, equals(1));

        final ticketId = saleResult.verificationTicketId!;

        // -------------------------------------------------------------
        // STEP 4: Sudden Crash / Power Outage in Offline Mode
        // -------------------------------------------------------------
        await db1.close();

        // -------------------------------------------------------------
        // STEP 5: Re-boot POS (Disk Reopen) & Assert Durability
        // -------------------------------------------------------------
        final db2 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        // 1. Attempt is preserved in LOCAL_ACTIVATION_EVIDENCE_COMPLETE
        final rehydratedAttempt = await db2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(rehydratedAttempt, isNotNull);
        expect(rehydratedAttempt!.localStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
        expect(rehydratedAttempt.verificationTicketId, equals(ticketId));

        // 2. Real PAID Invoice is preserved with idempotency key
        final rehydratedInvoice = await db2.invoiceDao.getInvoiceById(ticketId);
        expect(rehydratedInvoice, isNotNull);
        expect(rehydratedInvoice!.total, equals(65.0));
        expect(rehydratedInvoice.paymentStatus, equals('paid'));
        expect(rehydratedInvoice.syncStatus, equals('pending'));
        expect(rehydratedInvoice.idempotencyKey, equals('onboarding:activation-sale:$tenantId:$attemptId'));

        // 3. Invoice Items & Payments preserved
        final rehydratedItems = await db2.invoiceItemDao.getItemsByInvoiceId(ticketId);
        expect(rehydratedItems.length, equals(1));
        expect(rehydratedItems.first.productId, equals(verificationProductId));
        expect(rehydratedItems.first.total, equals(65.0));

        final rehydratedPayments = await db2.paymentDao.getPaymentsByInvoiceId(ticketId);
        expect(rehydratedPayments.length, equals(1));
        expect(rehydratedPayments.first.amount, equals(65.0));

        // 4. All 9 Checks (6 pre-offline + 3 offline sale) are durable and PASS
        final allChecks = await db2.activationCheckResultLocalDao.getChecksForAttempt(
          tenantId,
          attemptId,
        );
        expect(allChecks.length, equals(9));
        expect(allChecks.every((c) => c.status == 'PASS'), isTrue);

        final expectedCheckCodes = {
          'TERMINAL_LINKED',
          'REQUIRED_CONFIG_LOCAL',
          'AUTHORIZED_USER_LOCAL',
          'PRINTER_AVAILABLE',
          'TEST_PRINT',
          'SQLITE_DURABILITY',
          'OFFLINE_SALE_PAID',
          'SALE_RECEIPT_PATH',
          'OUTBOX_DURABLE',
        };
        expect(allChecks.map((c) => c.checkCode).toSet(), equals(expectedCheckCodes));

        // 5. Outbox Envelopes are durable, pending, and tamper-proof
        final rehydratedEnvelopes = await db2.activationOutboxDao.getEnvelopesByAttempt(
          tenantId,
          attemptId,
        );
        expect(rehydratedEnvelopes.length, greaterThanOrEqualTo(4));
        for (final env in rehydratedEnvelopes) {
          expect(env.tenantId, equals(tenantId));
          expect(env.activationAttemptId, equals(attemptId));
          expect(env.syncStatus, equals('PENDING'));
          expect(env.payloadHash, isNotEmpty);
          expect(env.payloadJson, isNotEmpty);

          // Verify envelope payload matches hash
          final computedHash = sha256.convert(utf8.encode(env.payloadJson)).toString();
          expect(env.payloadHash, equals(computedHash));
        }

        // -------------------------------------------------------------
        // STEP 6: Idempotent Retry Replay after Recovery
        // -------------------------------------------------------------
        final reloadedNumbering = DgiNumberingServiceImpl(db2.localConfigDao);
        final reloadedSales = SalesRepositoryImpl(
          database: db2,
          invoiceDao: db2.invoiceDao,
          itemDao: db2.invoiceItemDao,
          paymentDao: db2.paymentDao,
          transactionDao: db2.salesTransactionDao,
          numberingService: reloadedNumbering,
          movementEngine: movementEngine,
          auditRepository: auditRepo,
          processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
          inventoryRepository: inventoryRepo,
        );
        final reloadedRunner = ActivationControlledSaleRunner(
          database: db2,
          salesRepository: reloadedSales,
          printerPort: printerAdapter,
        );

        final retryResult = await reloadedRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: authorizedUserId,
          ),
        );

        expect(retryResult.isSuccess, isTrue);
        expect(retryResult.verificationTicketId, equals(ticketId));

        // Invoices count is still strictly 1
        final finalInvoices = await db2.invoiceDao.getInvoicesBySyncStatus('pending');
        expect(finalInvoices.length, equals(1));

        await db2.close();
      } finally {
        if (await tempDir.exists()) {
          await tempDir.delete(recursive: true);
        }
      }
    });
  });
}
