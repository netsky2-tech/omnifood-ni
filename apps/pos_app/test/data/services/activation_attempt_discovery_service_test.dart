import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_sync_port.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/data/services/activation_attempt_discovery_service.dart';
import 'package:pos_app/data/services/activation_clock_manager.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';
import 'package:pos_app/domain/models/activation/activation_attempt_snapshot.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

const _fixedBootSessionId = 'boot-session-uuid-1234';
final _fixedNow = DateTime.parse('2026-09-04T12:00:05.000Z');
const _fixedTicks = 1000000;

ActivationAttemptSnapshot _activeSnapshot({
  String candidateTerminalId = 'pos-term-01',
  String tenantId = 'tenant-founder-01',
  String attemptId = 'attempt-active-1',
}) {
  return ActivationAttemptSnapshot(
    attemptId: attemptId,
    tenantId: tenantId,
    candidateTerminalId: candidateTerminalId,
    requiredFiscalRevision: 3,
    requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
    verificationProductId: 'prod-uuid-1',
    assignedAt: '2026-09-04T12:00:00.000Z',
    // Deliberately different from the local `_fixedNow` (12:00:05) so a local
    // clock substitution can never pass the assertions.
    serverTimeAnchorAt: '2026-09-04T11:59:58.000Z',
  );
}

class _StubActivationSyncPort extends ActivationSyncPort {
  _StubActivationSyncPort({this.snapshot});

  ActivationAttemptSnapshot? snapshot;

  /// When non-null, [fetchActiveAttempt] throws this instead of returning
  /// [snapshot] (simulates unreachable backends and unusable payloads).
  Object? fetchError;

  int fetchActiveAttemptCalls = 0;

  @override
  Future<ActivationAttemptSnapshot?> fetchActiveAttempt() async {
    fetchActiveAttemptCalls++;
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

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('DioActivationSyncPort.fetchActiveAttempt', () {
    late HttpServer server;
    late DioActivationSyncPort port;
    final requests = <_CapturedRequest>[];
    bool respondWithActiveAttempt = true;

    setUp(() async {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) async {
        await utf8.decoder.bind(request).join();
        requests.add(
          _CapturedRequest(method: request.method, path: request.uri.path),
        );
        request.response.headers.contentType = ContentType.json;
        if (request.uri.path.endsWith('/attempts/active') &&
            respondWithActiveAttempt) {
          request.response.write(jsonEncode({
            'id': 'attempt-active-1',
            'tenantId': 'tenant-founder-01',
            'candidateTerminalId': 'pos-term-01',
            'requiredFiscalRevision': 3,
            'requiredFiscalFingerprint': 'fiscal-fp-sha256-abc',
            'verificationProductId': 'prod-uuid-1',
            'startedAt': '2026-09-04T12:00:00.000Z',
            'serverTimeAnchorAt': '2026-09-04T11:59:58.000Z',
          }));
        } else {
          request.response.write('null');
        }
        await request.response.close();
      });
      port = DioActivationSyncPort(
        Dio(BaseOptions(
          baseUrl: 'http://${server.address.address}:${server.port}/',
        )),
      );
    });

    tearDown(() async => server.close(force: true));

    test('issues GET to the authoritative active-attempt endpoint and parses the snapshot', () async {
      final snapshot = await port.fetchActiveAttempt();

      expect(requests, hasLength(1));
      expect(requests.single.method, 'GET');
      expect(requests.single.path, '/onboarding/activation/attempts/active');
      expect(snapshot, isNotNull);
      expect(snapshot!.attemptId, 'attempt-active-1');
      expect(snapshot.tenantId, 'tenant-founder-01');
      expect(snapshot.candidateTerminalId, 'pos-term-01');
      expect(snapshot.requiredFiscalRevision, 3);
      expect(snapshot.requiredFiscalFingerprint, 'fiscal-fp-sha256-abc');
      expect(snapshot.verificationProductId, 'prod-uuid-1');
      expect(snapshot.assignedAt, '2026-09-04T12:00:00.000Z');
      expect(snapshot.serverTimeAnchorAt, '2026-09-04T11:59:58.000Z');
    });

    test('returns null when the backend reports no active attempt', () async {
      respondWithActiveAttempt = false;
      expect(await port.fetchActiveAttempt(), isNull);
    });
  });

  group('ActivationAttemptDiscoveryService', () {
    late AppDatabase database;
    late _StubActivationSyncPort syncPort;
    late TerminalIdentityService terminalIdentity;
    late ActivationClockManager clock;
    late ActivationAttemptDiscoveryService discoveryService;

    setUp(() async {
      database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      // Canonical device identity, as provisioned on first install.
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: TerminalIdentityService.localDeviceIdKey,
          value: 'pos-term-01',
          description: 'Test terminal identity',
        ),
      );
      syncPort = _StubActivationSyncPort(snapshot: _activeSnapshot());
      terminalIdentity = TerminalIdentityService(database.localConfigDao);
      clock = ActivationClockManager(
        initialBootSessionId: _fixedBootSessionId,
      );
      discoveryService = ActivationAttemptDiscoveryService(
        database: database,
        syncPort: syncPort,
        terminalIdentityService: terminalIdentity,
        clockManager: clock,
        nowProvider: () => _fixedNow,
        monotonicTicksProvider: () => _fixedTicks,
      );
    });

    tearDown(() async {
      await database.close();
    });

    test('maps the backend snapshot into a complete local row the runners can consume', () async {
      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isTrue);
      expect(result.resolvedFromLocal, isFalse);
      expect(result.attempt, isNotNull);

      final persisted =
          await database.activationAttemptLocalDao.getAttemptById('attempt-active-1');
      expect(persisted, isNotNull);
      expect(persisted!.attemptId, 'attempt-active-1');
      expect(persisted.tenantId, 'tenant-founder-01');
      expect(persisted.candidateTerminalId, 'pos-term-01');
      expect(persisted.localStatus, 'ASSIGNED');
      expect(persisted.requiredFiscalRevision, 3);
      expect(persisted.requiredFiscalFingerprint, 'fiscal-fp-sha256-abc');
      expect(persisted.verificationProductId, 'prod-uuid-1');
      expect(persisted.assignedAt, '2026-09-04T12:00:00.000Z');
      // The SERVER anchor from the backend response is persisted verbatim —
      // never the local clock (which reads 12:00:05 here).
      expect(persisted.serverTimeAnchorAt, '2026-09-04T11:59:58.000Z');
      // The monotonic anchor is deliberately a LOCAL reading taken at discovery.
      expect(persisted.anchorMonotonicTicks, _fixedTicks);
      expect(persisted.bootSessionId, _fixedBootSessionId);
      expect(persisted.updatedAt, '2026-09-04T12:00:05.000Z');
      // Clock anchor registered with the runner conventions ('anchor-<attemptId>').
      expect(clock.serverTimeAnchorId, 'anchor-attempt-active-1');
    });

    test('re-running discovery never clobbers a locally finished row for the same attempt', () async {
      // The row must be in a status getActiveAttempt does NOT return, so this
      // exercises the real reconcile-and-keep path (backend consulted, existing
      // row preserved) instead of the trivial early return for in-progress rows.
      final finished = ActivationAttemptLocalEntity(
        attemptId: 'attempt-active-1',
        tenantId: 'tenant-founder-01',
        candidateTerminalId: 'pos-term-01',
        localStatus: 'FAILED',
        requiredFiscalRevision: 3,
        requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
        verificationProductId: 'prod-uuid-1',
        verificationTicketId: 'ticket-1',
        serverTimeAnchorAt: '2026-09-01T00:00:00.000Z',
        anchorMonotonicTicks: 42,
        bootSessionId: 'older-boot-session',
        assignedAt: '2026-09-04T12:00:00.000Z',
        updatedAt: '2026-09-04T13:00:00.000Z',
      );
      await database.activationAttemptLocalDao.saveAttempt(finished);

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isTrue);
      expect(result.resolvedFromLocal, isTrue);

      final persisted =
          await database.activationAttemptLocalDao.getAttemptById('attempt-active-1');
      expect(persisted!.localStatus, 'FAILED');
      expect(persisted.verificationTicketId, 'ticket-1');
      expect(persisted.serverTimeAnchorAt, '2026-09-01T00:00:00.000Z');
      expect(persisted.anchorMonotonicTicks, 42);
      expect(persisted.bootSessionId, 'older-boot-session');
      expect(persisted.updatedAt, '2026-09-04T13:00:00.000Z');
    });

    test('reconciles with the backend when the only local row is terminal and enrolls a newly created attempt', () async {
      // A finished local row (ACTIVATED/FAILED) must never hide a NEW attempt
      // created in the back office after a successful activation.
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: 'attempt-old-1',
          tenantId: 'tenant-founder-01',
          candidateTerminalId: 'pos-term-01',
          localStatus: 'ACTIVATED',
          requiredFiscalRevision: 3,
          requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
          verificationProductId: 'prod-uuid-1',
          serverTimeAnchorAt: '2026-09-01T00:00:00.000Z',
          anchorMonotonicTicks: 42,
          bootSessionId: 'older-boot-session',
          assignedAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        ),
      );
      syncPort.snapshot =
          _activeSnapshot(attemptId: 'attempt-new-1');

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isTrue);
      expect(result.resolvedFromLocal, isFalse);
      expect(result.attempt!.attemptId, 'attempt-new-1');
      expect(syncPort.fetchActiveAttemptCalls, 1);

      final persistedNew = await database.activationAttemptLocalDao
          .getAttemptById('attempt-new-1');
      expect(persistedNew, isNotNull);
      expect(persistedNew!.localStatus, 'ASSIGNED');
      // The old terminal row is preserved untouched.
      final oldRow = await database.activationAttemptLocalDao
          .getAttemptById('attempt-old-1');
      expect(oldRow!.localStatus, 'ACTIVATED');
    });

    test('never skips the terminal-mismatch guard when reconciling a terminal local row', () async {
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: 'attempt-old-1',
          tenantId: 'tenant-founder-01',
          candidateTerminalId: 'pos-term-01',
          localStatus: 'ACTIVATED',
          requiredFiscalRevision: 3,
          requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
          verificationProductId: 'prod-uuid-1',
          assignedAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        ),
      );
      syncPort.snapshot = _activeSnapshot(candidateTerminalId: 'other-terminal');

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isFalse);
      expect(result.blockerCode, 'TERMINAL_MISMATCH');
      expect(
        await database.activationAttemptLocalDao.getAttemptById('attempt-active-1'),
        isNull,
      );
      expect(clock.serverTimeAnchorId, isNull);
    });

    test('never skips the terminal-mismatch guard for an in-progress local row', () async {
      // A re-provisioned device identity must not silently resume another
      // terminal's attempt just because the row is locally in progress.
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: 'attempt-local-1',
          tenantId: 'tenant-founder-01',
          candidateTerminalId: 'other-terminal',
          localStatus: 'RUNNING',
          requiredFiscalRevision: 3,
          requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
          verificationProductId: 'prod-uuid-1',
          assignedAt: '2026-09-04T11:00:00.000Z',
          updatedAt: '2026-09-04T11:00:00.000Z',
        ),
      );

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isFalse);
      expect(result.blockerCode, 'TERMINAL_MISMATCH');
      expect(result.blockerMessage, contains('other-terminal'));
      expect(result.blockerMessage, contains('pos-term-01'));
    });

    test('fails closed when the snapshot tenant differs from the requested tenant', () async {
      syncPort.snapshot =
          _activeSnapshot(tenantId: 'tenant-other-99');

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isFalse);
      expect(result.blockerCode, 'TENANT_MISMATCH');
      expect(result.attempt, isNull);
      expect(
        await database.activationAttemptLocalDao.getAttemptById('attempt-active-1'),
        isNull,
      );
      expect(clock.serverTimeAnchorId, isNull);
    });

    test('maps an unusable backend payload to a named blocker instead of crashing', () async {
      // The port contract turns unusable payloads into a named exception;
      // discovery must map it to a blocker result, never let it escape.
      syncPort.fetchError = const ActivationAttemptPayloadException(
        'ACTIVE_ATTEMPT_PAYLOAD_MALFORMED',
        'Server returned a non-object active activation attempt payload',
      );

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isFalse);
      expect(result.blockerCode, 'ACTIVE_ATTEMPT_PAYLOAD_INVALID');
      expect(result.attempt, isNull);
      expect(
        await database.activationAttemptLocalDao.getAttemptById('attempt-active-1'),
        isNull,
      );
      expect(clock.serverTimeAnchorId, isNull);
    });

    test('keeps reporting a named blocker when the backend is unreachable', () async {
      syncPort.fetchError = DioException(
        requestOptions: RequestOptions(path: '/onboarding/activation/attempts/active'),
      );

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isFalse);
      expect(result.blockerCode, 'ACTIVE_ATTEMPT_FETCH_FAILED');
      expect(result.blockerCode, isNot('NO_ACTIVE_ATTEMPT'));
      expect(result.blockerCode, isNot('ACTIVE_ATTEMPT_PAYLOAD_INVALID'));
    });

    test('fails closed with a named blocker when the registered terminal is not this terminal', () async {
      syncPort.snapshot = _activeSnapshot(candidateTerminalId: 'other-terminal');

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isFalse);
      expect(result.blockerCode, 'TERMINAL_MISMATCH');
      expect(result.blockerMessage, contains('other-terminal'));
      expect(result.blockerMessage, contains('pos-term-01'));
      expect(result.attempt, isNull);

      final persisted =
          await database.activationAttemptLocalDao.getAttemptById('attempt-active-1');
      expect(persisted, isNull);
      expect(clock.serverTimeAnchorId, isNull);
    });

    test('returns a named blocker when the backend reports no active attempt', () async {
      syncPort.snapshot = null;

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isFalse);
      expect(result.blockerCode, 'NO_ACTIVE_ATTEMPT');
      expect(result.attempt, isNull);

      final persisted =
          await database.activationAttemptLocalDao.getAttemptById('attempt-active-1');
      expect(persisted, isNull);
    });

    test('prefers an already persisted active attempt over the backend on restart', () async {
      final localRow = ActivationAttemptLocalEntity(
        attemptId: 'attempt-local-1',
        tenantId: 'tenant-founder-01',
        candidateTerminalId: 'pos-term-01',
        localStatus: 'ASSIGNED',
        requiredFiscalRevision: 3,
        requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
        verificationProductId: 'prod-uuid-1',
        assignedAt: '2026-09-04T11:00:00.000Z',
        updatedAt: '2026-09-04T11:00:00.000Z',
      );
      await database.activationAttemptLocalDao.saveAttempt(localRow);

      final result = await discoveryService.discoverActiveAttempt(
        tenantId: 'tenant-founder-01',
      );

      expect(result.isSuccess, isTrue);
      expect(result.resolvedFromLocal, isTrue);
      expect(result.attempt!.attemptId, 'attempt-local-1');
      // The backend was never consulted.
      expect(syncPort.fetchActiveAttemptCalls, 0);
    });
  });
}

class _CapturedRequest {
  final String method;
  final String path;

  const _CapturedRequest({required this.method, required this.path});
}
