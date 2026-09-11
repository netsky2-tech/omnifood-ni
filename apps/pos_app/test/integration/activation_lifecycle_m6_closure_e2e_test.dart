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
import 'package:pos_app/data/models/activation/first_successful_sale_claim_entity.dart';
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

class E2EActivationSyncPort implements ActivationSyncPort {
  final List<Map<String, dynamic>> deliveredChecks = [];
  final List<Map<String, dynamic>> deliveredClaims = [];
  final List<Map<String, dynamic>> deliveredSales = [];
  String finalizerVerdict = 'PASS';

  @override
  Future<bool> sendCheck({
    required String attemptId,
    required String checkCode,
    required String status,
    String? evidenceType,
    String? evidenceRef,
    String? occurredAt,
    Map<String, dynamic>? details,
    String? tenantId,
    String? terminalId,
  }) async {
    deliveredChecks.add({
      'attemptId': attemptId,
      'checkCode': checkCode,
      'status': status,
      'evidenceType': evidenceType,
      'evidenceRef': evidenceRef,
      'occurredAt': occurredAt,
      'details': details,
      'tenantId': tenantId,
      'terminalId': terminalId,
    });
    return true;
  }

  @override
  Future<bool> sendFirstSaleClaim({
    required String attemptId,
    required Map<String, dynamic> claimPayload,
  }) async {
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
    return FinalizeActivationResult(
      isSuccess: true,
      status: finalizerVerdict,
      warningsCount: 0,
    );
  }
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('M6 Closure E2E: ONB1.8A–H Full Lifecycle with Real SQLite Disk Persistence', () {
    const tenantId = 'tenant-founder-m6-e2e';
    const attemptId = 'attempt-founder-m6-001';
    const candidateTerminalId = 'terminal-founder-pos-m6';
    const verificationProductId = 'prod-pin-m6-coffee';
    const authorizedUserId = 'user-founder-m6-owner';
    const pin = '123456';
    const fiscalFingerprint = 'fp-sha256-m6-closure-snapshot';
    const bootSession = 'boot-session-m6-e2e';

    test('Runs full M6 lifecycle: Pre-offline -> Offline Sale & TTFSS Claim -> Crash Recovery -> Reconnect Sync -> Normal VOID', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_activation_m6_closure_');
      final dbPath = p.join(tempDir.path, 'pos_m6_closure.db');

      try {
        final localAuth = LocalAuthService();
        final mockDio = MockDio();
        final mockAlertService = MockAlertService();
        final printerAdapter = MockPrinterAdapter();
        final syncPort = E2EActivationSyncPort();
        final clockManager = ActivationClockManager(initialBootSessionId: bootSession);

        // =============================================================
        // PHASE 1: Initialize Database & Seed Prerequisite State
        // =============================================================
        final dbPhase1 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'terminal_device_id', value: candidateTerminalId),
        );
        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'),
        );
        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_current_seq', value: '1'),
        );
        await dbPhase1.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_range_end', value: '1000'),
        );

        await dbPhase1.fiscalConfigLocalDao.applyFiscalConfig(
          const FiscalConfigLocalEntity(
            tenantId: tenantId,
            revision: 1,
            fingerprint: fiscalFingerprint,
            payload: '{"businessName": "OmniFood M6 Closure Cafe"}',
            appliedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        await dbPhase1.userDao.insertUsers([
          UserEntity(
            id: authorizedUserId,
            name: 'M6 Founder Owner',
            role: 'ADMIN',
            pinHash: '',
            isActive: true,
            tenantId: tenantId,
          ),
        ]);
        await dbPhase1.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: authorizedUserId,
            pinHash: localAuth.hashPin(pin),
            isPinEnabled: true,
            isTotpEnabled: false,
          ),
        ]);

        await dbPhase1.productDao.insertProducts([
          ProductEntity(
            id: verificationProductId,
            name: 'Café M6 Especial Tueste',
            sellPrice: 75.0,
            averageCost: 25.0,
            stock: 100.0,
            uom: 'CUP',
            barcode: 'PROD-M6-COFFEE',
            isActive: true,
            isPrepared: false,
            tenantId: tenantId,
          ),
        ]);

        // Attempt assigned with Clock Semantics anchors
        await dbPhase1.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: candidateTerminalId,
            localStatus: 'ASSIGNED',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprint,
            verificationProductId: verificationProductId,
            serverTimeAnchorAt: '2026-09-04T12:00:00.000Z',
            anchorMonotonicTicks: 0,
            bootSessionId: bootSession,
            assignedAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        // =============================================================
        // PHASE 2: Pre-Offline Checks Execution (ONB1.8B)
        // =============================================================
        final configAdapter = ActivationRequiredConfigAdapter(
          database: dbPhase1,
          localAuthService: localAuth,
        );
        final terminalIdentity = TerminalIdentityService(dbPhase1.localConfigDao);
        final preOfflineRunner = ActivationPreOfflineRunner(
          database: dbPhase1,
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
        expect(preOfflineSummary.checks.length, equals(6));
        expect(preOfflineSummary.checks.values.every((c) => c.status == 'PASS'), isTrue);

        final attemptAfterPre = await dbPhase1.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(attemptAfterPre!.localStatus, equals('RUNNING'));

        // =============================================================
        // PHASE 3: Controlled Offline Sale & TTFSS Claim (ONB1.8C–F)
        // =============================================================
        final capCache = TenantCapabilityCache(
          configDao: dbPhase1.localConfigDao,
          clock: StopwatchMonotonicClock(),
          bootSessionId: bootSession,
          nowUtc: () => DateTime.now().toUtc(),
        );
        final authRepo = AuthRepositoryImpl(
          dbPhase1.userDao,
          dbPhase1.securityProfileDao,
          localAuth,
          mockDio,
          capabilityCache: capCache,
        );
        final auditRepo = AuditRepositoryImpl(
          dbPhase1.auditDao,
          authRepo,
          mockDio,
          candidateTerminalId,
          capabilityCache: capCache,
          forensicAlertDao: dbPhase1.forensicAlertDao,
        );
        final invRepo = InventoryRepositoryImpl(
          insumoDao: dbPhase1.insumoDao,
          recipeDao: dbPhase1.recipeDao,
          movementDao: dbPhase1.movementDao,
          movementSyncStateDao: dbPhase1.movementSyncStateDao,
          supplierDao: dbPhase1.supplierDao,
          warehouseDao: dbPhase1.warehouseDao,
          countSessionDao: dbPhase1.countSessionDao,
          countLineDao: dbPhase1.countLineDao,
          forensicAlertDao: dbPhase1.forensicAlertDao,
          uomConversionDao: dbPhase1.uomConversionDao,
          batchDao: dbPhase1.batchDao,
          purchaseDao: dbPhase1.purchaseDao,
          recipeVersionDocumentDao: dbPhase1.recipeVersionDocumentDao,
          productionOrderDocumentDao: dbPhase1.productionOrderDocumentDao,
          dio: mockDio,
          database: dbPhase1,
        );
        final movementEngine = MovementEngineImpl(invRepo, mockAlertService);
        final numberingService = DgiNumberingServiceImpl(dbPhase1.localConfigDao);
        final salesRepo = SalesRepositoryImpl(
          database: dbPhase1,
          invoiceDao: dbPhase1.invoiceDao,
          itemDao: dbPhase1.invoiceItemDao,
          paymentDao: dbPhase1.paymentDao,
          transactionDao: dbPhase1.salesTransactionDao,
          numberingService: numberingService,
          movementEngine: movementEngine,
          auditRepository: auditRepo,
          processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
          inventoryRepository: invRepo,
        );

        final saleRunner = ActivationControlledSaleRunner(
          database: dbPhase1,
          salesRepository: salesRepo,
          printerPort: printerAdapter,
          clockManager: clockManager,
        );

        final saleResult = await saleRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: authorizedUserId,
          ),
        );

        expect(saleResult.isSuccess, isTrue);
        final ticketId = saleResult.verificationTicketId!;
        expect(saleResult.attemptStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));

        // Verify TTFSS claim is created atomically in SQLite
        final claim = await dbPhase1.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(claim, isNotNull);
        expect(claim!.ticketId, equals(ticketId));
        expect(claim.clockConfidence, equals('ANCHORED'));
        expect(claim.anchoredOccurredAt, isNotNull);

        // Verify FIRST_SUCCESSFUL_SALE_OBSERVED envelope in outbox
        final envelopesPhase1 = await dbPhase1.activationOutboxDao.getPendingEnvelopes(tenantId);
        expect(envelopesPhase1.any((e) => e.eventType == 'FIRST_SUCCESSFUL_SALE_OBSERVED'), isTrue);

        // =============================================================
        // PHASE 4: Crash Simulation & Energy Cutoff
        // =============================================================
        await dbPhase1.close();

        // =============================================================
        // PHASE 5: Post-Crash Restart & Disk Durability Verification
        // =============================================================
        var dbPhase2 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        final reloadedAttempt = await dbPhase2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(reloadedAttempt, isNotNull);
        expect(reloadedAttempt!.localStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
        expect(reloadedAttempt.verificationTicketId, equals(ticketId));

        final reloadedClaim = await dbPhase2.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(reloadedClaim, isNotNull);
        expect(reloadedClaim!.ticketId, equals(ticketId));
        expect(reloadedClaim.clockConfidence, equals('ANCHORED'));

        final reloadedInvoice = await dbPhase2.invoiceDao.getInvoiceById(ticketId);
        expect(reloadedInvoice, isNotNull);
        expect(reloadedInvoice!.paymentStatus, equals('paid'));
        expect(reloadedInvoice.isCanceled, isFalse);

        // =============================================================
        // PHASE 6: WAN Reconnected & Evidence Sync (ONB1.8G)
        // =============================================================
        final reconnectSyncRunner = ActivationReconnectSyncRunner(
          database: dbPhase2,
          syncPort: syncPort,
        );

        final syncResult = await reconnectSyncRunner.syncActivationEvidence(
          const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
        );

        expect(syncResult.isSuccess, isTrue);
        expect(syncResult.attemptStatus, equals('ACTIVATED'));
        expect(syncResult.syncedEnvelopesCount, greaterThanOrEqualTo(4));
        expect(syncResult.pendingEnvelopesCount, equals(0));

        // Authoritative backend classification must now be persisted in SQLite
        final finalAttempt = await dbPhase2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(finalAttempt!.localStatus, equals('ACTIVATED'));

        // All outbox envelopes must now be marked SYNCED
        final remainingPending = await dbPhase2.activationOutboxDao.getPendingEnvelopes(tenantId);
        expect(remainingPending, isEmpty);

        // Confirm cloud received the claim and checks
        expect(syncPort.deliveredClaims.length, equals(1));
        expect(syncPort.deliveredChecks.length, greaterThanOrEqualTo(3));

        // =============================================================
        // PHASE 7: Verification Sale Cleanup Path (ONB1.8H)
        // =============================================================
        final invRepoPhase2 = InventoryRepositoryImpl(
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
        final movementEnginePhase2 = MovementEngineImpl(invRepoPhase2, mockAlertService);
        final numberingPhase2 = DgiNumberingServiceImpl(dbPhase2.localConfigDao);

        final cleanupSalesRepo = SalesRepositoryImpl(
          database: dbPhase2,
          invoiceDao: dbPhase2.invoiceDao,
          itemDao: dbPhase2.invoiceItemDao,
          paymentDao: dbPhase2.paymentDao,
          transactionDao: dbPhase2.salesTransactionDao,
          numberingService: numberingPhase2,
          movementEngine: movementEnginePhase2,
          auditRepository: auditRepo,
          processInventoryUseCase: ProcessSaleInventoryUseCase(movementEnginePhase2),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEnginePhase2),
          inventoryRepository: invRepoPhase2,
        );

        final cleanupRunner = ActivationVerificationSaleCleanupRunner(
          database: dbPhase2,
          salesRepository: cleanupSalesRepo,
        );

        final cleanupResult = await cleanupRunner.voidVerificationSale(
          const VoidVerificationSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            reason: 'Limpieza controlada post-activación exitosa',
          ),
        );

        expect(cleanupResult.isSuccess, isTrue);
        expect(cleanupResult.ticketId, equals(ticketId));

        // 1. DGI Compliance: invoice row is NEVER deleted, only is_canceled = true
        final voidedInvoice = await dbPhase2.invoiceDao.getInvoiceById(ticketId);
        expect(voidedInvoice, isNotNull);
        expect(voidedInvoice!.isCanceled, isTrue);
        expect(voidedInvoice.voidReason, equals('Limpieza controlada post-activación exitosa'));

        // 2. Historical TTFSS Preservation: claim is NOT deleted or corrupted
        final preservedClaim = await dbPhase2.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(preservedClaim, isNotNull);
        expect(preservedClaim!.ticketId, equals(ticketId));
        expect(preservedClaim.clockConfidence, equals('ANCHORED'));
        expect(preservedClaim.anchoredOccurredAt, equals(claim.anchoredOccurredAt));
        expect(preservedClaim.deviceOccurredAt, equals(claim.deviceOccurredAt));

        await dbPhase2.close();
      } finally {
        if (await tempDir.exists()) {
          await tempDir.delete(recursive: true);
        }
      }
    });
  });
}
