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
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/activation_clock_manager.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/activation_pre_offline_runner.dart';
import 'package:pos_app/data/services/activation_reconnect_sync_runner.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/activation_verification_sale_cleanup_runner.dart';
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

class FounderPilotRehearsalSyncPort implements ActivationSyncPort {
  final List<Map<String, dynamic>> deliveredChecks = [];
  final List<Map<String, dynamic>> deliveredClaims = [];
  final List<Map<String, dynamic>> deliveredSales = [];
  bool simulateWanOutage = false;
  String finalizerVerdict = 'PASS';
  int warningsCount = 0;

  @override
  Future<bool> sendCheck({
    required String attemptId,
    required String checkCode,
    required String status,
    Map<String, dynamic>? details,
    String? occurredAt,
    String? evidenceType,
    String? evidenceRef,
    String? tenantId,
    String? terminalId,
  }) async {
    if (simulateWanOutage) return false;
    deliveredChecks.add({
      'attemptId': attemptId,
      'checkCode': checkCode,
      'status': status,
      'details': details,
      'evidenceType': evidenceType,
    });
    return true;
  }

  @override
  Future<bool> sendFirstSaleClaim({
    required String attemptId,
    required Map<String, dynamic> claimPayload,
  }) async {
    if (simulateWanOutage) return false;
    deliveredClaims.add({
      'attemptId': attemptId,
      'payload': claimPayload,
    });
    return true;
  }

  @override
  Future<bool> sendVerificationSale({
    required String attemptId,
    required Map<String, dynamic> salePayload,
  }) async {
    if (simulateWanOutage) return false;
    deliveredSales.add({
      'attemptId': attemptId,
      'payload': salePayload,
    });
    return true;
  }

  @override
  Future<FinalizeActivationResult> finalizeActivation({
    required String tenantId,
    required String attemptId,
  }) async {
    if (simulateWanOutage) {
      return const FinalizeActivationResult(
        isSuccess: false,
        status: 'NETWORK_ERROR',
        failureCode: 'WAN_TIMEOUT',
        warningsCount: 0,
      );
    }
    return FinalizeActivationResult(
      isSuccess: true,
      status: finalizerVerdict,
      warningsCount: warningsCount,
    );
  }
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('ONB1.10F: Founder Pilot Rehearsal End-to-End Suite', () {
    const tenantId = 'tenant-founder-pilot-ni';
    const terminalId = 'SUNMI-V2S-FOUNDER-01';
    const attemptId = 'att-pilot-founder-001';
    const prodId = 'prod-founder-specialty-coffee';
    const userId = 'user-founder-owner';
    const pin = '654321';
    const fiscalFp = 'fp-pilot-dgi-092007-snapshot';
    const bootSession = 'boot-session-pilot-01';

    test('rehearses complete Founder Pilot journey: Clean Path, Abandon/Resume, WAN Outage, Restart, PASS, and TTFSS <= 15m', () async {
      final startTime = DateTime.now();
      final tempDir = await Directory.systemTemp.createTemp('founder_pilot_rehearsal_');
      final dbPath = p.join(tempDir.path, 'founder_pilot.db');

      try {
        final localAuth = LocalAuthService();
        final mockDio = MockDio();
        final mockAlertService = MockAlertService();
        final printer = MockPrinterAdapter();
        final syncPort = FounderPilotRehearsalSyncPort();
        final clockManager = ActivationClockManager(initialBootSessionId: bootSession);

        // =========================================================================
        // STEP 1: Initial Setup & Reference State Configuration (Clean Reference Path)
        // =========================================================================
        final dbPhase1 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'terminal_device_id', value: terminalId),
        );
        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'),
        );
        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_current_seq', value: '1'),
        );
        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_range_end', value: '5000'),
        );

        // Inbound Fiscal Config
        await dbPhase1.fiscalConfigLocalDao.applyFiscalConfig(
          const FiscalConfigLocalEntity(
            tenantId: tenantId,
            revision: 1,
            fingerprint: fiscalFp,
            payload: '{"businessName": "Founder Pilot Specialty Cafe", "ruc": "J0310000008888"}',
            appliedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        // Identity & Offline PIN Setup
        await dbPhase1.userDao.insertUsers([
          UserEntity(
            id: userId,
            name: 'Founder Pilot Owner',
            role: 'ADMIN',
            pinHash: '',
            isActive: true,
            tenantId: tenantId,
          ),
        ]);
        await dbPhase1.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: userId,
            pinHash: localAuth.hashPin(pin),
            isPinEnabled: true,
            isTotpEnabled: false,
          ),
        ]);

        // Catalog Product (Sellable, Price C$ 80.00)
        await dbPhase1.productDao.insertProducts([
          ProductEntity(
            id: prodId,
            name: 'Café de Especialidad Maragogipe',
            sellPrice: 80.0,
            averageCost: 35.0,
            stock: 250.0,
            uom: 'CUP',
            barcode: 'PROD-FOUNDER-COFFEE',
            isActive: true,
            isPrepared: false,
            tenantId: tenantId,
          ),
        ]);

        // Activation Attempt Assigned
        await dbPhase1.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: terminalId,
            localStatus: 'ASSIGNED',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFp,
            verificationProductId: prodId,
            serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
            anchorMonotonicTicks: 0,
            bootSessionId: bootSession,
            assignedAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        // =========================================================================
        // STEP 2: Abandonment & Resume Rehearsal
        // =========================================================================
        // Pilot operator closes the terminal / crashes before starting checks
        await dbPhase1.close();

        // Pilot resumes terminal application
        final dbPhase2 = await $FloorAppDatabase.databaseBuilder(dbPath).build();
        final resumedAttempt = await dbPhase2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(resumedAttempt, isNotNull);
        expect(resumedAttempt!.localStatus, equals('ASSIGNED'));
        expect(resumedAttempt.candidateTerminalId, equals(terminalId));

        // =========================================================================
        // STEP 3: Pre-Offline Checks Execution
        // =========================================================================
        final configAdapter = ActivationRequiredConfigAdapter(
          database: dbPhase2,
          localAuthService: localAuth,
        );
        final terminalIdentity = TerminalIdentityService(dbPhase2.localConfigDao);
        final preOfflineRunner = ActivationPreOfflineRunner(
          database: dbPhase2,
          configAdapter: configAdapter,
          terminalIdentityService: terminalIdentity,
          printerPort: printer,
        );

        final preSummary = await preOfflineRunner.runPreOfflineChecks(
          const PreOfflineRunnerParams(
            attemptId: attemptId,
            tenantId: tenantId,
            authorizedUserId: userId,
            authorizedUserPin: pin,
          ),
        );
        expect(preSummary.isReadyForOffline, isTrue);

        final attemptRunning = await dbPhase2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(attemptRunning!.localStatus, equals('RUNNING'));

        // =========================================================================
        // STEP 4: Controlled Offline Sale & TTFSS Claim with WAN Outage & Printer
        // =========================================================================
        final capCache = TenantCapabilityCache(
          configDao: dbPhase2.localConfigDao,
          clock: StopwatchMonotonicClock(),
          bootSessionId: bootSession,
          nowUtc: () => DateTime.now().toUtc(),
        );
        final authRepo = AuthRepositoryImpl(
          dbPhase2.userDao,
          dbPhase2.securityProfileDao,
          localAuth,
          mockDio,
          capabilityCache: capCache,
        );
        final auditRepo = AuditRepositoryImpl(
          dbPhase2.auditDao,
          authRepo,
          mockDio,
          terminalId,
          capabilityCache: capCache,
          forensicAlertDao: dbPhase2.forensicAlertDao,
        );
        final invRepo = InventoryRepositoryImpl(
          insumoDao: dbPhase2.insumoDao,
          recipeDao: dbPhase2.recipeDao,
          movementDao: dbPhase2.movementDao,
          movementSyncStateDao: dbPhase2.movementSyncStateDao,
          supplierDao: dbPhase2.supplierDao,
          warehouseDao: dbPhase2.warehouseDao,
          countSessionDao: dbPhase2.countSessionDao,
          countLineDao: dbPhase2.countLineDao,
          forensicAlertDao: dbPhase2.forensicAlertDao,
          uomConversionDao: dbPhase2.uomConversionDao,
          batchDao: dbPhase2.batchDao,
          purchaseDao: dbPhase2.purchaseDao,
          recipeVersionDocumentDao: dbPhase2.recipeVersionDocumentDao,
          productionOrderDocumentDao: dbPhase2.productionOrderDocumentDao,
          dio: mockDio,
          database: dbPhase2,
        );
        final movementEngine = MovementEngineImpl(invRepo, mockAlertService);
        final numberingService = DgiNumberingServiceImpl(dbPhase2.localConfigDao);
        final salesRepo = SalesRepositoryImpl(
          database: dbPhase2,
          invoiceDao: dbPhase2.invoiceDao,
          itemDao: dbPhase2.invoiceItemDao,
          paymentDao: dbPhase2.paymentDao,
          transactionDao: dbPhase2.salesTransactionDao,
          numberingService: numberingService,
          movementEngine: movementEngine,
          auditRepository: auditRepo,
          processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
          inventoryRepository: invRepo,
        );

        final saleRunner = ActivationControlledSaleRunner(
          database: dbPhase2,
          salesRepository: salesRepo,
          printerPort: printer,
          clockManager: clockManager,
        );

        // Execute sale: ticket printed on Sunmi thermal printer
        final saleResult = await saleRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: userId,
          ),
        );
        expect(saleResult.isSuccess, isTrue);
        expect(saleResult.verificationTicketId, isNotNull);

        // Verification ticket printed on thermal printer
        expect(printer.printHistory.length, greaterThanOrEqualTo(1));

        // TTFSS Claim recorded locally
        final claim = await dbPhase2.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(claim, isNotNull);
        expect(claim!.ticketId, equals(saleResult.verificationTicketId));
        expect(claim.clockConfidence, equals('ANCHORED'));

        // =========================================================================
        // STEP 5: Terminal Restart & Power Cut Simulation Mid-Activation
        // =========================================================================
        await dbPhase2.close();

        // Terminal boots up again
        final dbPhase3 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        // =========================================================================
        // STEP 6: Reconnect & Sync Finalization (Activation PASS)
        // =========================================================================
        final reconnectSyncRunner = ActivationReconnectSyncRunner(
          database: dbPhase3,
          syncPort: syncPort,
        );

        final syncResult = await reconnectSyncRunner.syncActivationEvidence(
          const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
        );
        expect(syncResult.isSuccess, isTrue);
        expect(syncResult.attemptStatus, equals('ACTIVATED'));

        // Local attempt is officially ACTIVATED
        final finalAttempt = await dbPhase3.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(finalAttempt!.localStatus, equals('ACTIVATED'));

        // Outbox drained
        final remainingPending = await dbPhase3.activationOutboxDao.getPendingEnvelopes(tenantId);
        expect(remainingPending, isEmpty);

        // =========================================================================
        // STEP 7: Verification Sale Cleanup (Normal VOID)
        // =========================================================================
        final invRepoPhase3 = InventoryRepositoryImpl(
          insumoDao: dbPhase3.insumoDao,
          recipeDao: dbPhase3.recipeDao,
          movementDao: dbPhase3.movementDao,
          movementSyncStateDao: dbPhase3.movementSyncStateDao,
          supplierDao: dbPhase3.supplierDao,
          warehouseDao: dbPhase3.warehouseDao,
          countSessionDao: dbPhase3.countSessionDao,
          countLineDao: dbPhase3.countLineDao,
          forensicAlertDao: dbPhase3.forensicAlertDao,
          uomConversionDao: dbPhase3.uomConversionDao,
          batchDao: dbPhase3.batchDao,
          purchaseDao: dbPhase3.purchaseDao,
          recipeVersionDocumentDao: dbPhase3.recipeVersionDocumentDao,
          productionOrderDocumentDao: dbPhase3.productionOrderDocumentDao,
          dio: mockDio,
          database: dbPhase3,
        );
        final movementEnginePhase3 = MovementEngineImpl(invRepoPhase3, mockAlertService);
        final numberingPhase3 = DgiNumberingServiceImpl(dbPhase3.localConfigDao);

        final cleanupSalesRepo = SalesRepositoryImpl(
          database: dbPhase3,
          invoiceDao: dbPhase3.invoiceDao,
          itemDao: dbPhase3.invoiceItemDao,
          paymentDao: dbPhase3.paymentDao,
          transactionDao: dbPhase3.salesTransactionDao,
          numberingService: numberingPhase3,
          movementEngine: movementEnginePhase3,
          auditRepository: auditRepo,
          processInventoryUseCase: ProcessSaleInventoryUseCase(movementEnginePhase3),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEnginePhase3),
          inventoryRepository: invRepoPhase3,
        );

        final cleanupRunner = ActivationVerificationSaleCleanupRunner(
          database: dbPhase3,
          salesRepository: cleanupSalesRepo,
        );

        final cleanupResult = await cleanupRunner.voidVerificationSale(
          const VoidVerificationSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            reason: 'Founder pilot rehearsal verification sale cleanup',
          ),
        );
        expect(cleanupResult.isSuccess, isTrue);

        // DGI Compliance Check: Invoice is canceled, NEVER deleted
        final invoice = await dbPhase3.invoiceDao.getInvoiceById(saleResult.verificationTicketId!);
        expect(invoice, isNotNull);
        expect(invoice!.isCanceled, isTrue);

        // TTFSS Claim remains intact
        final winningClaimFinal = await dbPhase3.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(winningClaimFinal, isNotNull);
        expect(winningClaimFinal!.ticketId, equals(saleResult.verificationTicketId));

        // =========================================================================
        // STEP 8: TTFSS Measurement Invariant (Preliminary Target <= 15 minutes)
        // =========================================================================
        final totalElapsedMinutes = DateTime.now().difference(startTime).inMinutes;
        expect(totalElapsedMinutes, lessThanOrEqualTo(15));

        await dbPhase3.close();
      } finally {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      }
    });

    test('rehearses PASS_WITH_WARNING only for allowed POST_RECONNECT_SYNC transient delay', () async {
      final tempDir = await Directory.systemTemp.createTemp('founder_warning_');
      final dbPath = p.join(tempDir.path, 'founder_warning.db');

      try {
        final syncPort = FounderPilotRehearsalSyncPort();
        syncPort.finalizerVerdict = 'PASS_WITH_WARNING';
        syncPort.warningsCount = 1;

        final db = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        await db.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: 'att-warn-001',
            tenantId: tenantId,
            candidateTerminalId: terminalId,
            localStatus: 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFp,
            verificationProductId: prodId,
            serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
            anchorMonotonicTicks: 0,
            bootSessionId: bootSession,
            assignedAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        final reconnectSyncRunner = ActivationReconnectSyncRunner(
          database: db,
          syncPort: syncPort,
        );

        final syncResult = await reconnectSyncRunner.syncActivationEvidence(
          const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: 'att-warn-001'),
        );

        expect(syncResult.isSuccess, isTrue);
        expect(syncResult.attemptStatus, equals('ACTIVATED_WITH_WARNING'));
        expect(syncResult.backendFinalizeResult?.warningsCount, equals(1));

        await db.close();
      } finally {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      }
    });

    test('rehearses Activation FAIL hard blocker when candidate terminal mismatches identity', () async {
      final tempDir = await Directory.systemTemp.createTemp('founder_fail_');
      final dbPath = p.join(tempDir.path, 'founder_fail.db');

      try {
        final db = await $FloorAppDatabase.databaseBuilder(dbPath).build();
        final localAuth = LocalAuthService();
        final printer = MockPrinterAdapter();
        final syncPort = FounderPilotRehearsalSyncPort();

        // Terminal ID configured is DIFFERENT from candidateTerminalId
        await db.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'terminal_device_id', value: 'OTHER-TERMINAL-ID'),
        );

        await db.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: 'att-fail-001',
            tenantId: tenantId,
            candidateTerminalId: 'CANDIDATE-STATION-01',
            localStatus: 'ASSIGNED',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFp,
            verificationProductId: prodId,
            serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
            anchorMonotonicTicks: 0,
            bootSessionId: bootSession,
            assignedAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        final configAdapter = ActivationRequiredConfigAdapter(
          database: db,
          localAuthService: localAuth,
        );
        final terminalIdentity = TerminalIdentityService(db.localConfigDao);
        final preOfflineRunner = ActivationPreOfflineRunner(
          database: db,
          configAdapter: configAdapter,
          terminalIdentityService: terminalIdentity,
          printerPort: printer,
        );

        final preSummary = await preOfflineRunner.runPreOfflineChecks(
          const PreOfflineRunnerParams(
            attemptId: 'att-fail-001',
            tenantId: tenantId,
            authorizedUserId: userId,
            authorizedUserPin: pin,
          ),
        );

        // TERMINAL_LINKED check MUST FAIL as hard blocker
        expect(preSummary.isReadyForOffline, isFalse);
        expect(preSummary.checks['TERMINAL_LINKED']?.status, equals('FAIL'));

        await db.close();
      } finally {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      }
    });
  });
}
