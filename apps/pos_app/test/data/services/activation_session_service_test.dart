import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_check_result_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/data/services/activation_attempt_discovery_service.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/activation_pre_offline_runner.dart';
import 'package:pos_app/data/services/activation_reconnect_sync_runner.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/activation_session_service.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';
import 'package:pos_app/domain/models/activation/activation_attempt_snapshot.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Records `fetchActiveAttempt` behavior, mirroring the discovery-test stub
/// style (`activation_attempt_discovery_service_test.dart`).
class _StubActivationSyncPort extends ActivationSyncPort {
  ActivationAttemptSnapshot? snapshot;

  /// When non-null, [fetchActiveAttempt] throws this instead of returning
  /// [snapshot] (simulates unreachable backends and unusable payloads).
  Object? fetchError;

  @override
  Future<ActivationAttemptSnapshot?> fetchActiveAttempt() async {
    final error = fetchError;
    if (error != null) {
      throw error;
    }
    return snapshot;
  }

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
  }) =>
      Future.value(true);

  @override
  Future<bool> sendFirstSaleClaim({
    required String attemptId,
    required Map<String, dynamic> claimPayload,
  }) =>
      Future.value(true);

  @override
  Future<bool> sendVerificationSale({
    required String attemptId,
    required Map<String, dynamic> salePayload,
  }) =>
      Future.value(true);

  @override
  Future<FinalizeActivationResult> finalizeActivation({
    required String tenantId,
    required String attemptId,
  }) =>
      Future.value(
        const FinalizeActivationResult(isSuccess: true, status: 'PASS'),
      );
}

/// Recording fake: the session service must delegate and pass parameters
/// through untouched, so the test asserts on the recorded params and on the
/// exact (identical) result object it returns.
class _RecordingPreOfflineRunner extends ActivationPreOfflineRunner {
  _RecordingPreOfflineRunner({required AppDatabase database})
      : super(
          database: database,
          configAdapter: ActivationRequiredConfigAdapter(
            database: database,
            localAuthService: LocalAuthService(),
          ),
          terminalIdentityService: TerminalIdentityService(
            database.localConfigDao,
          ),
          printerPort: MockPrinterAdapter(),
          printerConfigService: PrinterConfigService(database.localConfigDao),
        );

  final List<PreOfflineRunnerParams> calls = [];
  PreOfflineRunnerSummary result = const PreOfflineRunnerSummary(
    isReadyForOffline: true,
    checks: {},
  );

  @override
  Future<PreOfflineRunnerSummary> runPreOfflineChecks(
    PreOfflineRunnerParams params,
  ) async {
    calls.add(params);
    return result;
  }
}

class _RecordingControlledSaleRunner extends ActivationControlledSaleRunner {
  _RecordingControlledSaleRunner({required AppDatabase database})
      : super(
          database: database,
          salesRepository: _NoopSalesRepository(),
          printerPort: MockPrinterAdapter(),
        );

  final List<ControlledSaleParams> calls = [];
  ControlledSaleResult result = const ControlledSaleResult(
    isSuccess: true,
    attemptStatus: 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
  );

  @override
  Future<ControlledSaleResult> executeControlledOfflineSale(
    ControlledSaleParams params,
  ) async {
    calls.add(params);
    return result;
  }
}

class _RecordingReconnectSyncRunner extends ActivationReconnectSyncRunner {
  _RecordingReconnectSyncRunner({required AppDatabase database})
      : super(
          database: database,
          syncPort: _StubActivationSyncPort(),
        );

  final List<ActivationReconnectSyncParams> calls = [];
  ActivationReconnectSyncResult result = const ActivationReconnectSyncResult(
    isSuccess: true,
    attemptStatus: 'EVIDENCE_ACKED',
  );

  @override
  Future<ActivationReconnectSyncResult> syncActivationEvidence(
    ActivationReconnectSyncParams params,
  ) async {
    calls.add(params);
    return result;
  }
}

/// Unused collaborator: the recording fake overrides the phase method, so the
/// repository is never reached. Kept as an explicit no-op to satisfy the
/// runner constructor without pulling in the whole sales stack.
class _NoopSalesRepository implements SalesRepository {
  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
    FulfillmentCheckoutContext? fulfillmentContext,
  }) =>
      Future.value();

  @override
  Future<Invoice?> getInvoiceById(String id) async => null;

  @override
  Future<Invoice?> getInvoiceByNumber(String number) async => null;

  @override
  Future<List<Invoice>> getUnsyncedInvoices() async => const [];

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async =>
      const [];

  @override
  Future<void> markAsSynced(List<String> invoiceIds) => Future.value();

  @override
  Future<void> acknowledgeSaleSync({
    required String invoiceId,
    required String? outcome,
    required List<String> acknowledgedCorrelationIds,
  }) =>
      Future.value();

  @override
  Future<int> getInventoryEnrichmentPendingCount() => Future.value(0);

  @override
  Future<void> voidInvoice(String invoiceId, String reason) => Future.value();

  @override
  Future<void> createCreditNote({
    required String originalInvoiceId,
    required String reason,
    required String authorizedByUserId,
    required UserRole authorizedByRole,
    RefundReasonPolicy refundReasonPolicy = RefundReasonPolicy.restockOriginalBom,
    List<CreditNoteRefundLine>? lines,
  }) =>
      Future.value();

  @override
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId) async =>
      const [];

  @override
  Future<List<Payment>> getPaymentsBySessionId(String sessionId) async =>
      const [];
}

void main() {
  late AppDatabase database;
  late _StubActivationSyncPort discoverySyncPort;
  late _RecordingPreOfflineRunner preOfflineRunner;
  late _RecordingControlledSaleRunner controlledSaleRunner;
  late _RecordingReconnectSyncRunner reconnectSyncRunner;
  late ActivationSessionService session;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  /// Seeds the stable terminal identity used by discovery's mismatch guard.
  Future<void> seedTerminalIdentity(String deviceId) async {
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(
        key: TerminalIdentityService.localDeviceIdKey,
        value: deviceId,
        description: 'Activation session fixture',
      ),
    );
  }

  /// Seeds the pinned verification product in the LOCAL catalog.
  Future<void> seedProduct({
    required String id,
    required String tenantId,
  }) async {
    await database.productDao.insertProducts([
      ProductEntity(
        id: id,
        name: 'Gallo Pinto Tradicional',
        uom: 'PLATO',
        sellPrice: 75.0,
        stock: 10.0,
        averageCost: 40.0,
        isActive: true,
        tenantId: tenantId,
      ),
    ]);
  }

  ActivationAttemptSnapshot backendSnapshot({
    String attemptId = 'attempt-active-1',
    String tenantId = 'tenant-founder-01',
    String candidateTerminalId = 'pos-term-01',
    String verificationProductId = 'prod-uuid-1',
  }) {
    return ActivationAttemptSnapshot(
      attemptId: attemptId,
      tenantId: tenantId,
      candidateTerminalId: candidateTerminalId,
      requiredFiscalRevision: 3,
      requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
      verificationProductId: verificationProductId,
      assignedAt: '2026-09-04T12:00:00.000Z',
      serverTimeAnchorAt: '2026-09-04T11:59:58.000Z',
    );
  }

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    discoverySyncPort = _StubActivationSyncPort();
    preOfflineRunner = _RecordingPreOfflineRunner(database: database);
    controlledSaleRunner = _RecordingControlledSaleRunner(database: database);
    reconnectSyncRunner = _RecordingReconnectSyncRunner(database: database);
    session = ActivationSessionService(
      database: database,
      discoveryService: ActivationAttemptDiscoveryService(
        database: database,
        syncPort: discoverySyncPort,
        terminalIdentityService: TerminalIdentityService(
          database.localConfigDao,
        ),
      ),
      preOfflineRunner: preOfflineRunner,
      controlledSaleRunner: controlledSaleRunner,
      reconnectSyncRunner: reconnectSyncRunner,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('L1-05b — ActivationSessionService.prepare', () {
    test(
        'resolves the attempt and reports no blocker when the pinned product exists locally',
        () async {
      await seedTerminalIdentity('pos-term-01');
      discoverySyncPort.snapshot = backendSnapshot();
      await seedProduct(id: 'prod-uuid-1', tenantId: 'tenant-founder-01');

      final result = await session.prepare(tenantId: 'tenant-founder-01');

      expect(result.isSuccess, isTrue);
      expect(result.blockerCode, isNull);
      expect(result.blockerMessage, isNull);
      expect(result.attempt, isNotNull);
      expect(result.attempt!.attemptId, equals('attempt-active-1'));
      expect(result.attempt!.tenantId, equals('tenant-founder-01'));
      expect(result.attempt!.verificationProductId, equals('prod-uuid-1'));
    });

    test(
        'fails closed with VERIFICATION_PRODUCT_MISSING naming the product and does not run any phase',
        () async {
      await seedTerminalIdentity('pos-term-01');
      discoverySyncPort.snapshot = backendSnapshot();
      // No product seeded in the local catalog.

      final result = await session.prepare(tenantId: 'tenant-founder-01');

      expect(result.isSuccess, isFalse);
      expect(
        result.blockerCode,
        equals(ActivationSessionBlockers.verificationProductMissing),
      );
      expect(result.blockerMessage, contains('prod-uuid-1'));

      // Fail closed: no phase may run after an unresolved prepare.
      await expectLater(
        session.runPreOfflineChecks(
          authorizedUserId: 'user-owner-01',
          authorizedUserPin: 'unit-test-fixture-pin',
        ),
        throwsA(isA<ActivationSessionNotPreparedException>()),
      );
      await expectLater(
        session.executeControlledOfflineSale(cashierUserId: 'cashier-09'),
        throwsA(isA<ActivationSessionNotPreparedException>()),
      );
      await expectLater(
        session.syncActivationEvidence(),
        throwsA(isA<ActivationSessionNotPreparedException>()),
      );
      expect(preOfflineRunner.calls, isEmpty);
      expect(controlledSaleRunner.calls, isEmpty);
      expect(reconnectSyncRunner.calls, isEmpty);
    });

    test('propagates the discovery blocker when discovery fails', () async {
      await seedTerminalIdentity('pos-term-01');
      // Backend reports no active attempt.
      discoverySyncPort.snapshot = null;

      final result = await session.prepare(tenantId: 'tenant-founder-01');

      expect(result.isSuccess, isFalse);
      expect(
        result.blockerCode,
        equals(ActivationAttemptDiscoveryBlockers.noActiveAttempt),
      );
      expect(result.blockerMessage, isNotNull);
      expect(result.attempt, isNull);
      expect(preOfflineRunner.calls, isEmpty);
      expect(controlledSaleRunner.calls, isEmpty);
      expect(reconnectSyncRunner.calls, isEmpty);
    });
  });

  group('L1-05b — phase delegation after a successful prepare', () {
    setUp(() async {
      await seedTerminalIdentity('pos-term-01');
      discoverySyncPort.snapshot = backendSnapshot();
      await seedProduct(id: 'prod-uuid-1', tenantId: 'tenant-founder-01');
      final result = await session.prepare(tenantId: 'tenant-founder-01');
      expect(result.isSuccess, isTrue);
    });

    test(
        'pre-offline checks source the attempt from prepare and pass human identifiers through',
        () async {
      await session.runPreOfflineChecks(
        authorizedUserId: 'user-owner-01',
        authorizedUserPin: 'unit-test-fixture-pin',
      );

      expect(preOfflineRunner.calls, hasLength(1));
      final params = preOfflineRunner.calls.single;
      expect(params.attemptId, equals('attempt-active-1'));
      expect(params.tenantId, equals('tenant-founder-01'));
      expect(params.authorizedUserId, equals('user-owner-01'));
      expect(params.authorizedUserPin, equals('unit-test-fixture-pin'));
    });

    test(
        'controlled sale sources the attempt from prepare and passes cashierUserId through',
        () async {
      await session.executeControlledOfflineSale(cashierUserId: 'cashier-09');

      expect(controlledSaleRunner.calls, hasLength(1));
      final params = controlledSaleRunner.calls.single;
      expect(params.attemptId, equals('attempt-active-1'));
      expect(params.tenantId, equals('tenant-founder-01'));
      expect(params.cashierUserId, equals('cashier-09'));
    });

    test('reconnect sources the attempt from prepare', () async {
      await session.syncActivationEvidence();

      expect(reconnectSyncRunner.calls, hasLength(1));
      final params = reconnectSyncRunner.calls.single;
      expect(params.attemptId, equals('attempt-active-1'));
      expect(params.tenantId, equals('tenant-founder-01'));
    });

    test('returns the runners own result objects unchanged', () async {
      final preOfflineResult = await session.runPreOfflineChecks(
        authorizedUserId: 'user-owner-01',
      );
      final saleResult =
          await session.executeControlledOfflineSale(cashierUserId: 'cashier-09');
      final reconnectResult = await session.syncActivationEvidence();

      expect(identical(preOfflineResult, preOfflineRunner.result), isTrue);
      expect(identical(saleResult, controlledSaleRunner.result), isTrue);
      expect(identical(reconnectResult, reconnectSyncRunner.result), isTrue);
    });
  });

  group('L1-05b — phase refusal before a successful prepare', () {
    test('every phase refuses with the named error and runs no runner',
        () async {
      // No prepare() call at all on a fresh session.
      await expectLater(
        session.runPreOfflineChecks(
          authorizedUserId: 'user-owner-01',
          authorizedUserPin: 'unit-test-fixture-pin',
        ),
        throwsA(
          isA<ActivationSessionNotPreparedException>().having(
            (e) => e.toString(),
            'toString',
            contains(ActivationSessionNotPreparedException.code),
          ),
        ),
      );
      await expectLater(
        session.executeControlledOfflineSale(cashierUserId: 'cashier-09'),
        throwsA(isA<ActivationSessionNotPreparedException>()),
      );
      await expectLater(
        session.syncActivationEvidence(),
        throwsA(isA<ActivationSessionNotPreparedException>()),
      );

      expect(preOfflineRunner.calls, isEmpty);
      expect(controlledSaleRunner.calls, isEmpty);
      expect(reconnectSyncRunner.calls, isEmpty);
    });
  });
}
