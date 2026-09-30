import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';
import 'package:pos_app/data/models/human_authorization/terminal_state_machine.dart';
import 'package:pos_app/domain/security/ohac_authorization_port.dart';
import 'package:pos_app/domain/security/ohac_authorization_service.dart';
import 'package:pos_app/domain/security/ohac_integrity_classifier.dart';
import 'package:pos_app/domain/security/ohac_outbox_registry.dart';
import 'package:pos_app/domain/security/ohac_observability.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// The decision-31 test registrant reused as the R1-008 registered outbox.
class TestOutbox implements OhacAssertionBearingOutbox {
  @override
  final String outboxId;

  TestOutbox(this.outboxId);

  @override
  Future<int?> lowestUnconsumedAssertionSequence() async => null;
}

/// Unit U5b end-to-end, the chain tasks.md D-RED asks for (design §9, spec
/// `Integrity Loss Fails Closed`): for EVERY §9 class, the REAL classifier
/// maps a concrete condition to the expected class, that output is persisted
/// through `markIntegrityLoss` (asserted on the `integrity_classification`
/// column), and ONLY THEN does `authorizeOperation` deny with ZERO
/// `pinComparer` invocations, no attempt-state write and no assertion. A
/// wrong condition→class mapping fails the persistence pin; a fallback that
/// consulted the PIN under quarantine fails the zero-comparison pin.
void main() {
  final now = DateTime.utc(2026, 1, 4, 12, 0, 0);

  const tenantId = '0f0e8a20-1111-4222-8333-444455556666';
  const terminalId = 'terminal-1';
  const userId = 'aa000000-1111-4222-8333-444455556666';
  const operatorUserId = 'bb000000-1111-4222-8333-444455556666';
  const deviceCredentialId = 'cc000000-1111-4222-8333-444455556666';
  final epochDigest = 'sha256:${'d' * 64}';
  const pin = '1234';

  late AppDatabase database;
  late OhacOutboxRegistry registry;
  late int pinComparerCalls;
  final List<OhacObservabilityFact> facts = [];

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addMigrations(allMigrations)
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    addTearDown(database.close);
    registry = OhacOutboxRegistry()..register(TestOutbox('outbox-1'));
    pinComparerCalls = 0;
    facts.clear();

    await database.ohacDeliveryDao.insertEpoch(
      OhacPolicyEpochEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 1,
        digest: epochDigest,
        previousSequence: 0,
        previousDigest: 'GENESIS',
        schema: 'ohac.staff-policy-epoch.v1',
        targetPosBuild: '1.0.0+1',
        publisherBackendBuild: 'backend-1',
        minimumAssertionSchema: 'ohac.assertion.v1',
        payload: '{"sequence":1}',
        receivedAt: '2026-01-01T00:00:00.000Z',
      ),
    );
    await database.ohacDeliveryDao.insertEntries([
      OhacPolicyEntryEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 1,
        userId: userId,
        status: 'ACTIVE',
        role: 'MANAGER',
        permissions: '["sales.sell","sales.void_invoice"]',
        verifierAlgorithm: 'bcrypt',
        verifierFormatVersion: '2b',
        verifierEncoded: r'$2b$10$abcdefghijklmnopqrstuv',
        attemptResetGeneration: '1',
      ),
    ]);
  });

  /// Seeds a healthy ACTIVE terminal (revision 1) — with a fully intact
  /// authorizable epoch pair — as the STARTING point of the quarantine
  /// chain, so the fault arrives only through the classifier +
  /// markIntegrityLoss path under test.
  Future<void> seedHealthyState() =>
      database.ohacDeliveryDao.insertTerminalState(
        OhacTerminalStateEntity(
          tenantId: tenantId,
          terminalId: terminalId,
          state: OhacTerminalPhase.active.wire,
          activeSequence: 1,
          activeDigest: epochDigest,
          candidateSequence: 0,
          candidateDigest: '',
          serverFloorSequence: 1,
          serverFloorDigest: epochDigest,
          negotiatedPosBuild: '1.0.0+1',
          negotiatedBackendBuild: 'backend-1',
          negotiatedPolicySchema: 'ohac.staff-policy-epoch.v1',
          negotiatedAssertionSchema: 'ohac.assertion.v1',
          integrityClassification: '',
          localAuthorizationSequence: 0,
          revision: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
        ),
      );

  /// Seeds a quarantined terminal: INTEGRITY_LOSS with the given §9 class,
  /// but with a fully intact ACTIVE-looking epoch pair — everything ELSE
  /// about the terminal looks authorizable, so the denial must come from
  /// the phase/classification gate alone. Used only by the narrow phase-gate
  /// claims below; the per-class chain test builds its state through the
  /// real classifier instead.
  Future<void> seedQuarantinedState(String classification) =>
      database.ohacDeliveryDao.insertTerminalState(
        OhacTerminalStateEntity(
          tenantId: tenantId,
          terminalId: terminalId,
          state: OhacTerminalPhase.integrityLoss.wire,
          activeSequence: 1,
          activeDigest: epochDigest,
          candidateSequence: 0,
          candidateDigest: '',
          serverFloorSequence: 1,
          serverFloorDigest: epochDigest,
          negotiatedPosBuild: '1.0.0+1',
          negotiatedBackendBuild: 'backend-1',
          negotiatedPolicySchema: 'ohac.staff-policy-epoch.v1',
          negotiatedAssertionSchema: 'ohac.assertion.v1',
          integrityClassification: classification,
          localAuthorizationSequence: 0,
          revision: 2,
          updatedAt: '2026-01-01T00:00:00.000Z',
        ),
      );

  OhacAuthorizationService service() => OhacAuthorizationService(
    ohacDeliveryDao: database.ohacDeliveryDao,
    ohacOutboxRegistry: registry,
    readPosBuild: () async => '1.0.0+1',
    clock: () => now,
    newId: () => 'ee000000-1111-4222-8333-444455556666',
    onFact: facts.add,
    pinComparer: (candidatePin, verifierEncoded) {
      pinComparerCalls++;
      return true;
    },
  );

  OhacAuthorizationRequest request() => OhacAuthorizationRequest(
    tenantId: tenantId,
    terminalId: terminalId,
    userId: userId,
    operatorUserId: operatorUserId,
    pin: pin,
    outboxId: 'outbox-1',
    deviceCredentialId: deviceCredentialId,
    deviceCredentialVersion: '1',
    permissionsUsed: const ['sales.void_invoice'],
    operationType: 'void_invoice',
    operationSchema: 'pos.sale.v1',
    operationDigest: 'sha256:${'a' * 64}',
  );

  /// The quarantine chain: a concrete observed condition per §9 class, the
  /// expected classifier output, and a label for reasons.
  final conditionChain = <(String, OhacIntegrityCondition,
      OhacIntegrityClassification)>[
    (
      'auth_state_missing',
      const OhacConditionAuthStateMissing('seed'),
      OhacIntegrityClassification.authStateMissing,
    ),
    (
      'digest_mismatch',
      const OhacConditionDigestMismatch('seed'),
      OhacIntegrityClassification.digestMismatch,
    ),
    (
      'scope_mismatch',
      const OhacConditionScopeMismatch('seed'),
      OhacIntegrityClassification.scopeMismatch,
    ),
    (
      'local_rollback',
      const OhacConditionLocalRollback('seed'),
      OhacIntegrityClassification.localRollback,
    ),
    (
      'ack_inconsistent',
      const OhacConditionAckInconsistent('seed'),
      OhacIntegrityClassification.ackInconsistent,
    ),
    (
      'unsupported_schema_build',
      const OhacConditionUnsupportedSchemaBuild('seed'),
      OhacIntegrityClassification.unsupportedSchemaBuild,
    ),
    (
      'transport_state_missing',
      const OhacConditionTransportStateMissing('seed'),
      OhacIntegrityClassification.transportStateMissing,
    ),
  ];

  group(
      'fail-closed chain: classifier → markIntegrityLoss → denial (§9, '
      'tasks.md D-RED)', () {
    for (final (label, condition, expected) in conditionChain) {
      test(
        'condition $label: the real classifier output persists as '
        '${expected.wire} and authorization then denies with zero PIN '
        'comparisons',
        () async {
          await seedHealthyState();

          // 1. The REAL classifier maps the concrete condition.
          final classification = classifyOhacIntegrity(condition);
          expect(
            classification,
            expected,
            reason: 'condition $label must map to its §9 class',
          );

          // 2. The output is persisted through the real primitive, and the
          // `integrity_classification` column holds EXACTLY the classified
          // wire value — a swapped or fail-open mapping fails here.
          final marked = await database.ohacDeliveryDao.markIntegrityLoss(
            tenantId,
            terminalId,
            1,
            classification.wire,
            '2026-01-04T12:00:00.000Z',
          );
          expect(marked, 1, reason: 'the quarantine CAS must win');
          final state = await database.ohacDeliveryDao
              .findTerminalState(tenantId, terminalId);
          expect(state!.state, OhacTerminalPhase.integrityLoss.wire);
          expect(
            state.integrityClassification,
            expected.wire,
            reason: 'persisted class must equal the classified class',
          );

          // 3. Authorization against the quarantined state: deny closed,
          // zero PIN comparisons, no attempt-state write (no assertion
          // path, no fallback).
          final result = await service().authorizeOperation(request());
          expect(result, isA<OhacAssertionDenied>(), reason: label);
          expect(
            (result as OhacAssertionDenied).reason,
            OhacAuthorizationDenialReason.noActiveEpoch,
            reason: 'INTEGRITY_LOSS freezes the governing epoch (§5/§9)',
          );
          expect(
            pinComparerCalls,
            0,
            reason: 'no fallback: never compare a PIN under a quarantined '
                'terminal ($label)',
          );
          expect(
            await database.ohacDeliveryDao.findAttemptState(
              tenantId,
              terminalId,
              userId,
            ),
            isNull,
            reason: 'the durable attempt transaction never ran ($label)',
          );
        },
      );
    }

    test('a quarantined terminal creates no assertion and no attempt state '
        'movement', () async {
      await seedQuarantinedState(
        OhacIntegrityClassification.localRollback.wire,
      );

      final result = await service().authorizeOperation(request());

      expect(result, isA<OhacAssertionDenied>());
      final attempts = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      expect(
        attempts,
        isNull,
        reason:
            'no assertion path: the durable attempt transaction '
            'never ran',
      );
    });
  });

  group(
    'authorization decision facts (design §12: cohort/build decisions)',
    () {
      test(
        'denial on an INTEGRITY_LOSS terminal emits a pinned decision fact',
        () async {
          await seedQuarantinedState(
            OhacIntegrityClassification.localRollback.wire,
          );

          await service().authorizeOperation(request());

          expect(facts, hasLength(1));
          final fact = facts.single;
          expect(fact.event, 'ohac_authorization_decision');
          expect(fact.fields['outcome'], 'denied');
          expect(
            fact.fields['reason'],
            OhacAuthorizationDenialReason.noActiveEpoch,
          );
          expect(fact.fields['tenantId'], tenantId);
          expect(fact.fields['terminalId'], terminalId);
        },
      );

      test(
        'cohort/build gate denial (build mismatch) emits the build fact',
        () async {
          // ACTIVE terminal, but the POS build differs from the epoch target.
          await database.ohacDeliveryDao.insertTerminalState(
            OhacTerminalStateEntity(
              tenantId: tenantId,
              terminalId: terminalId,
              state: 'ACTIVE',
              activeSequence: 1,
              activeDigest: epochDigest,
              candidateSequence: 0,
              candidateDigest: '',
              serverFloorSequence: 1,
              serverFloorDigest: epochDigest,
              negotiatedPosBuild: '1.0.0+1',
              negotiatedBackendBuild: 'backend-1',
              negotiatedPolicySchema: 'ohac.staff-policy-epoch.v1',
              negotiatedAssertionSchema: 'ohac.assertion.v1',
              integrityClassification: '',
              localAuthorizationSequence: 0,
              revision: 1,
              updatedAt: '2026-01-01T00:00:00.000Z',
            ),
          );
          final mismatchedService = OhacAuthorizationService(
            ohacDeliveryDao: database.ohacDeliveryDao,
            ohacOutboxRegistry: registry,
            readPosBuild: () async => '9.9.9+99',
            clock: () => now,
            newId: () => 'ee000000-1111-4222-8333-444455556666',
            onFact: facts.add,
            pinComparer: (candidatePin, verifierEncoded) {
              pinComparerCalls++;
              return true;
            },
          );

          final result = await mismatchedService.authorizeOperation(request());

          expect(result, isA<OhacAssertionDenied>());
          expect(
            (result as OhacAssertionDenied).reason,
            OhacAuthorizationDenialReason.buildMismatch,
          );
          expect(pinComparerCalls, 0, reason: 'denied before any comparison');
          final fact = facts.single;
          expect(fact.fields['outcome'], 'denied');
          expect(
            fact.fields['reason'],
            OhacAuthorizationDenialReason.buildMismatch,
          );
          expect(fact.fields['posBuild'], '9.9.9+99');
          expect(fact.fields.keys.toSet(), contains('epochSequence'));
        },
      );
    },
  );
}
