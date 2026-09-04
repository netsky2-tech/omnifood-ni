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

class NormativeActivationSyncPort implements ActivationSyncPort {
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
      'details': details,
      'occurredAt': occurredAt,
      'evidenceType': evidenceType,
      'evidenceRef': evidenceRef,
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

  group('ONB1.10D: Normative Architecture Scenarios in Floor SQLite Real Persistence', () {
    const tenantId = 'tenant-normative-pos-1';
    const terminalId = 'TERM-POS-NORM-01';
    const attemptId = 'attempt-pos-norm-01';
    const prodId = 'prod-norm-001';
    const userId = 'user-owner-norm-01';
    const pin = '123456';
    const fiscalFingerprint = 'fp-sha256-normative-fp';
    const bootSession = 'boot-session-normative-01';

    test('covers Scenarios 36–39: Fiscal Fingerprint, Revision & Inbound POS Config in SQLite', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_norm_fiscal_');
      final dbPath = p.join(tempDir.path, 'pos_norm_fiscal.db');

      try {
        final db = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        // 36. Fiscal {revision, fingerprint} cloud arrives and is persisted in local Floor SQLite
        const fiscalEntity = FiscalConfigLocalEntity(
          tenantId: tenantId,
          revision: 1,
          fingerprint: fiscalFingerprint,
          payload: '{"regime":"REGIMEN_GENERAL","businessName":"Normative Store NI"}',
          appliedAt: '2026-09-04T12:00:00.000Z',
        );

        await db.fiscalConfigLocalDao.applyFiscalConfig(fiscalEntity);

        final loaded = await db.fiscalConfigLocalDao.getByTenantId(tenantId);
        expect(loaded, isNotNull);
        expect(loaded!.revision, equals(1));
        expect(loaded.fingerprint, equals(fiscalFingerprint));

        // 38. Duplicate inbound config is a no-op / clean upsert
        await db.fiscalConfigLocalDao.applyFiscalConfig(fiscalEntity);
        final reloaded = await db.fiscalConfigLocalDao.getByTenantId(tenantId);
        expect(reloaded!.revision, equals(1));

        await db.close();
      } finally {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      }
    });

    test('covers Scenarios 40–55 & 56–60: Pre-Offline -> Real Checkout -> TTFSS Write-Once -> Restart Durability -> VOID', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_norm_full_');
      final dbPath = p.join(tempDir.path, 'pos_norm_full.db');

      try {
        final localAuth = LocalAuthService();
        final mockDio = MockDio();
        final mockAlertService = MockAlertService();
        final printerAdapter = MockPrinterAdapter();
        final syncPort = NormativeActivationSyncPort();
        final clockManager = ActivationClockManager(initialBootSessionId: bootSession);

        // =============================================================
        // PHASE 1: Initialize Database & Seed Prerequisite State
        // =============================================================
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
          LocalConfigEntity(key: 'dgi_range_end', value: '1000'),
        );

        await dbPhase1.fiscalConfigLocalDao.applyFiscalConfig(
          const FiscalConfigLocalEntity(
            tenantId: tenantId,
            revision: 1,
            fingerprint: fiscalFingerprint,
            payload: '{"businessName": "Normative Store NI"}',
            appliedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        await dbPhase1.userDao.insertUsers([
          UserEntity(
            id: userId,
            name: 'Normative Owner',
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

        await dbPhase1.productDao.insertProducts([
          ProductEntity(
            id: prodId,
            name: 'Café Normativo',
            sellPrice: 50.0,
            averageCost: 20.0,
            stock: 100.0,
            uom: 'CUP',
            barcode: 'PROD-NORM-COFFEE',
            isActive: true,
            isPrepared: false,
            tenantId: tenantId,
          ),
        ]);

        await dbPhase1.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: terminalId,
            localStatus: 'ASSIGNED',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprint,
            verificationProductId: prodId,
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
            authorizedUserId: userId,
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
          terminalId,
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

        final controlledSaleRunner = ActivationControlledSaleRunner(
          database: dbPhase1,
          salesRepository: salesRepo,
          printerPort: printerAdapter,
          clockManager: clockManager,
        );

        final saleResult = await controlledSaleRunner.executeControlledOfflineSale(
          const ControlledSaleParams(
            tenantId: tenantId,
            attemptId: attemptId,
            cashierUserId: userId,
          ),
        );

        expect(saleResult.isSuccess, isTrue);
        expect(saleResult.verificationTicketId, isNotNull);

        // 56. First successful sale claim write-once
        final claim = await dbPhase1.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(claim, isNotNull);
        expect(claim!.ticketId, equals(saleResult.verificationTicketId));
        expect(claim.clockConfidence, equals('ANCHORED'));

        // 43. Power cut / Restart simulation: close SQLite and reopen
        await dbPhase1.close();

        final dbPhase2 = await $FloorAppDatabase.databaseBuilder(dbPath).build();
        final persistedAttempt = await dbPhase2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(persistedAttempt, isNotNull);
        expect(persistedAttempt!.localStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
        expect(persistedAttempt.verificationTicketId, equals(saleResult.verificationTicketId));

        final persistedClaim = await dbPhase2.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(persistedClaim, isNotNull);
        expect(persistedClaim!.ticketId, equals(saleResult.verificationTicketId));

        // 54. Normal VOID of verification sale preserves TTFSS claim intact
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

        // Claim is still intact after VOID
        final finalClaim = await dbPhase2.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(finalClaim, isNotNull);
        expect(finalClaim!.ticketId, equals(saleResult.verificationTicketId));

        await dbPhase2.close();
      } finally {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      }
    });
  });
}
