import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';

/// The dry run never touches the sales repository: it must prove the fiscal
/// sequence WITHOUT persisting an invoice. Every call is a test failure.
class _ForbiddenSalesRepository implements SalesRepository {
  int calls = 0;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls++;
    throw StateError(
      'Contract V2 dry run must never touch the sales repository '
      '(called ${invocation.memberName})',
    );
  }
}

void main() {
  late AppDatabase database;
  late MockPrinterAdapter printerAdapter;
  late _ForbiddenSalesRepository salesRepository;
  late ActivationControlledSaleRunner runner;

  const tenantId = 'tenant-v2-01';
  const attemptId = 'attempt-v2-1';
  const terminalId = 'pos-term-v2';
  const cashierId = 'cashier-v2';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    printerAdapter = MockPrinterAdapter();
    salesRepository = _ForbiddenSalesRepository();
    runner = ActivationControlledSaleRunner(
      database: database,
      salesRepository: salesRepository,
      printerPort: printerAdapter,
    );
  });

  tearDown(() async {
    await database.close();
  });

  Future<void> seedAttempt({
    int contractVersion = 2,
    String status = 'RUNNING',
  }) async {
    await database.activationAttemptLocalDao.saveAttempt(
      ActivationAttemptLocalEntity(
        attemptId: attemptId,
        tenantId: tenantId,
        candidateTerminalId: terminalId,
        localStatus: status,
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: 'fiscal-fp',
        verificationProductId: 'prod-1',
        contractVersion: contractVersion,
        assignedAt: '2026-10-23T12:00:00.000Z',
        updatedAt: '2026-10-23T12:00:00.000Z',
      ),
    );
  }

  Future<void> config(String key, String value) =>
      database.localConfigDao.saveConfig(
        LocalConfigEntity(key: key, value: value),
      );

  Future<String?> readConfig(String key) async =>
      (await database.localConfigDao.getConfigByKey(key))?.value;

  group('Issue #957 — contract V2 verification sequence dry run', () {
    test('verifies the next folio without creating an invoice or printing',
        () async {
      await seedAttempt();
      // Real DGI folio shape: the prefix ends with '-', so the trailing digit
      // run of the folio is the consecutivo alone (the same rule the cloud
      // watermark applies).
      await config('dgi_prefix', '001-001-01-');
      await config('dgi_current_number', '5');
      await config('dgi_cloud_highest_sequence', '4');

      final result = await runner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isTrue);
      expect(result.attemptStatus, equals('LOCAL_ACTIVATION_EVIDENCE_COMPLETE'));
      expect(result.verificationTicketId, isNull);
      expect(result.firstSaleClaim, isNull);

      // No fiscal document, no printer involvement.
      final invoices = await database.invoiceDao.getAllInvoices();
      expect(invoices, isEmpty);
      expect(printerAdapter.printHistory, isEmpty);
      expect(salesRepository.calls, 0);

      final check = result.checks['VERIFICATION_SEQUENCE_DRY_RUN']!;
      expect(check.status, equals('PASS'));
      final details =
          jsonDecode(check.detailsSanitizedJson!) as Map<String, dynamic>;
      expect(details['proposedSequence'], equals(5));
      expect(details['proposedFolio'], equals('001-001-01-00000005'));
      expect(details['cloudHighestSequence'], equals(4));
      expect(details['cursorProvisioned'], isFalse);

      // OUTBOX_DURABLE proves the evidence was staged durably.
      expect(result.checks['OUTBOX_DURABLE']!.status, equals('PASS'));
      expect(result.outboxEnvelopes, hasLength(1));
      expect(result.outboxEnvelopes.single.eventType, equals('ACTIVATION_CHECK'));
      expect(
        result.outboxEnvelopes.single.idempotencyKey,
        contains('VERIFICATION_SEQUENCE_DRY_RUN'),
      );

      // The cursor is NEVER advanced by a dry run.
      expect(await readConfig('dgi_current_number'), equals('5'));
    });

    test('fresh terminal seeds the cursor above the cloud watermark', () async {
      await seedAttempt();
      await config('dgi_cloud_highest_sequence', '7');

      final result = await runner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isTrue);
      final details = jsonDecode(
        result.checks['VERIFICATION_SEQUENCE_DRY_RUN']!.detailsSanitizedJson!,
      ) as Map<String, dynamic>;
      expect(details['proposedSequence'], equals(8));
      expect(details['cursorProvisioned'], isTrue);
      expect(await readConfig('dgi_current_number'), equals('8'));
    });

    test('refuses a lagging cursor and never self-heals it (AC-3)', () async {
      await seedAttempt();
      await config('dgi_prefix', '');
      await config('dgi_current_number', '3');
      await config('dgi_cloud_highest_sequence', '7');

      final result = await runner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isFalse);
      expect(result.attemptStatus, equals('FISCAL_SEQUENCE_RECOVERY_REQUIRED'));
      expect(await readConfig('dgi_current_number'), equals('3'));
      final checks = await database.activationCheckResultLocalDao
          .getChecksForAttempt(tenantId, attemptId);
      expect(checks, isEmpty);
      final outbox = await database.activationOutboxDao
          .getEnvelopesByAttempt(tenantId, attemptId);
      expect(outbox, isEmpty);
      expect(printerAdapter.printHistory, isEmpty);
    });

    test('refuses to run outside RUNNING / evidence-complete', () async {
      await seedAttempt(status: 'ASSIGNED');

      final result = await runner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      expect(result.isSuccess, isFalse);
      expect(result.attemptStatus, equals('ASSIGNED'));
      expect(result.errors, anyElement(contains('ATTEMPT_NOT_IN_RUNNING')));
    });

    test('legacy V1 attempts still take the invoice path', () async {
      await seedAttempt(contractVersion: 1);
      await config('dgi_prefix', '');
      await config('dgi_current_number', '1');

      final result = await runner.executeControlledOfflineSale(
        const ControlledSaleParams(
          tenantId: tenantId,
          attemptId: attemptId,
          cashierUserId: cashierId,
        ),
      );

      // The V1 path reaches the sales repository (which is forbidden here), so
      // the discriminator is simply that the dry run did not produce the V2
      // check. It fails on the missing verification product, not the dry run.
      expect(result.checks.containsKey('VERIFICATION_SEQUENCE_DRY_RUN'), isFalse);
    });
  });
}
