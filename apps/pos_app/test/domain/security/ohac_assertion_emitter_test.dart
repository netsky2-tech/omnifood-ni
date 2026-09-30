import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/assertion_v1.dart';
import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/domain/security/ohac_assertion_emitter.dart';
import 'package:pos_app/domain/security/ohac_authorization_port.dart';
import 'package:pos_app/domain/security/ohac_outbox_registry.dart';

/// The decision-31 test registrant reused for R1-008 emitter coverage: a
/// minimal assertion-bearing outbox that only needs its stable identity.
class RegisteredTestOutbox implements OhacAssertionBearingOutbox {
  @override
  final String outboxId;

  RegisteredTestOutbox(this.outboxId);

  @override
  Future<int?> lowestUnconsumedAssertionSequence() async => null;
}

/// Emitter coverage for operation-bound `ohac.assertion.v1` creation
/// (design §7.1, Slice C): the 23-field schema pinned to `assertion.v1.ts` /
/// `assertion_v1.dart`, digest stamping, the R1-008 fail-closed registration
/// coupler, and the parse round trip that makes construction fail-closed.
void main() {
  final authorizedAt = DateTime.utc(2026, 1, 4, 12, 0, 0);

  const tenantId = '0f0e8a20-1111-4222-8333-444455556666';
  const authorizerUserId = 'aa000000-1111-4222-8333-444455556666';
  const operatorUserId = 'bb000000-1111-4222-8333-444455556666';
  const deviceCredentialId = 'cc000000-1111-4222-8333-444455556666';
  const assertionId = 'dd000000-1111-4222-8333-444455556666';
  const localAuditId = 'ee000000-1111-4222-8333-444455556666';

  OhacAssertionCreationInput input({
    String outboxId = 'outbox-1',
    String? assertionIdField,
    List<String>? permissionsUsed,
    int localAuthorizationSequence = 42,
  }) =>
      OhacAssertionCreationInput(
        outboxId: outboxId,
        assertionId: assertionIdField ?? assertionId,
        tenantId: tenantId,
        terminalId: 'terminal-1',
        deviceCredentialId: deviceCredentialId,
        deviceCredentialVersion: '3',
        epochSequence: 17,
        epochDigest: 'sha256:${'e' * 64}',
        authorizerUserId: authorizerUserId,
        operatorUserId: operatorUserId,
        authorizerRole: 'MANAGER',
        permissionsUsed: permissionsUsed ?? const ['sales.void_invoice'],
        operationType: 'consumer.registered-operation.v1',
        operationSchema: 'consumer.operation.v1',
        operationDigest: 'sha256:${'f' * 64}',
        localAuthorizationSequence: localAuthorizationSequence,
        localAuditId: localAuditId,
        localAuditEntryHash: 'sha256:${'a' * 64}',
        posBuild: '1.0.0+1',
        authorizedAt: authorizedAt,
      );

  late OhacOutboxRegistry registry;

  setUp(() {
    registry = OhacOutboxRegistry()..register(RegisteredTestOutbox('outbox-1'));
  });

  group('R1-008 registration coupler', () {
    test('an unregistered outbox is refused with the stable reason', () {
      final result = OhacAssertionEmitter(registry).create(
        input(outboxId: 'never-registered'),
      );

      expect(result, isA<OhacFailure<OhacAssertionV1>>());
      expect(
        (result as OhacFailure<OhacAssertionV1>).error.code,
        OhacAuthorizationDenialReason.unregisteredOutbox,
      );
    });

    test('a registered outbox may emit', () {
      final result = OhacAssertionEmitter(registry).create(input());

      expect(result, isA<OhacSuccess<OhacAssertionV1>>());
    });
  });

  group('assertion construction', () {
    test('the emitted assertion survives the verifier-side parser', () {
      final result = OhacAssertionEmitter(registry).create(input());

      expect(result, isA<OhacSuccess<OhacAssertionV1>>());
      final assertion = (result as OhacSuccess<OhacAssertionV1>).value;
      expect(assertion.schema, 'ohac.assertion.v1');
      expect(assertion.policySchema, 'ohac.staff-policy-epoch.v1');
      expect(assertion.trustLevel, 'APPLICATION_SANDBOX_SOFTWARE');
    });

    test('every one of the 23 schema fields is carried with its exact wire '
        'value', () {
      final assertion =
          (OhacAssertionEmitter(registry).create(input()) as OhacSuccess)
              .value as OhacAssertionV1;

      // The 22 body fields...
      expect(assertion.schema, 'ohac.assertion.v1');
      expect(assertion.assertionId, assertionId);
      expect(assertion.tenantId, tenantId);
      expect(assertion.terminalId, 'terminal-1');
      expect(assertion.deviceCredentialId, deviceCredentialId);
      expect(assertion.deviceCredentialVersion, '3');
      expect(assertion.epochSequence, '17');
      expect(assertion.epochDigest, 'sha256:${'e' * 64}');
      expect(assertion.authorizerUserId, authorizerUserId);
      expect(assertion.operatorUserId, operatorUserId);
      expect(assertion.authorizerRole, 'MANAGER');
      expect(assertion.permissionsUsed, ['sales.void_invoice']);
      expect(assertion.operationType, 'consumer.registered-operation.v1');
      expect(assertion.operationSchema, 'consumer.operation.v1');
      expect(assertion.operationDigest, 'sha256:${'f' * 64}');
      expect(assertion.localAuthorizationSequence, '42');
      expect(assertion.localAuditId, localAuditId);
      expect(assertion.localAuditEntryHash, 'sha256:${'a' * 64}');
      expect(assertion.posBuild, '1.0.0+1');
      expect(assertion.policySchema, 'ohac.staff-policy-epoch.v1');
      expect(assertion.trustLevel, 'APPLICATION_SANDBOX_SOFTWARE');
      expect(assertion.authorizedAt, '2026-01-04T12:00:00Z');
      // ...and the stamped digest: the 23rd field. Its binding property is
      // proven by the tamper test below; here its exact shape is pinned.
      expect(assertion.digest, matches(RegExp(r'^sha256:[0-9a-f]{64}$')));
    });

    test('a one-byte tamper on the emitted body is rejected by '
        'parseAssertionV1: the stamped digest binds the payload', () {
      final assertion =
          (OhacAssertionEmitter(registry).create(input()) as OhacSuccess)
              .value as OhacAssertionV1;

      // Rebuild the exact wire body the emitter produced, flip one byte of
      // the operation digest, keep the emitted digest — the verifier-side
      // parser must reject it. (This is the emitter-level complement to the
      // parser suite: the digest the emitter stamps is load-bearing.)
      final tampered = <String, dynamic>{
        'schema': assertion.schema,
        'assertionId': assertion.assertionId,
        'tenantId': assertion.tenantId,
        'terminalId': assertion.terminalId,
        'deviceCredentialId': assertion.deviceCredentialId,
        'deviceCredentialVersion': assertion.deviceCredentialVersion,
        'epochSequence': assertion.epochSequence,
        'epochDigest': assertion.epochDigest,
        'authorizerUserId': assertion.authorizerUserId,
        'operatorUserId': assertion.operatorUserId,
        'authorizerRole': assertion.authorizerRole,
        'permissionsUsed': List<String>.of(assertion.permissionsUsed),
        'operationType': assertion.operationType,
        'operationSchema': assertion.operationSchema,
        'operationDigest':
            'sha256:${'f' * 63}${assertion.operationDigest.endsWith('f') ? 'e' : 'f'}',
        'localAuthorizationSequence': assertion.localAuthorizationSequence,
        'localAuditId': assertion.localAuditId,
        'localAuditEntryHash': assertion.localAuditEntryHash,
        'posBuild': assertion.posBuild,
        'policySchema': assertion.policySchema,
        'trustLevel': assertion.trustLevel,
        'authorizedAt': assertion.authorizedAt,
        'digest': assertion.digest,
      };
      expect(tampered['operationDigest'], isNot('sha256:${'f' * 64}'));

      final verdict = parseAssertionV1(
        Uint8List.fromList(utf8.encode(jsonEncode(tampered))),
      );
      expect(verdict, isA<OhacFailure<OhacAssertionV1>>());
    });

    test('the digest is stamped over the canonical body without it, and the '
        'parser re-verifies it', () {
      final assertion =
          (OhacAssertionEmitter(registry).create(input()) as OhacSuccess)
              .value as OhacAssertionV1;

      // Re-canonicalize the body the emitter must have used and require the
      // same digest the parser verified.
      final body = <String, dynamic>{
        'schema': 'ohac.assertion.v1',
        'assertionId': assertionId,
        'tenantId': tenantId,
        'terminalId': 'terminal-1',
        'deviceCredentialId': deviceCredentialId,
        'deviceCredentialVersion': '3',
        'epochSequence': '17',
        'epochDigest': 'sha256:${'e' * 64}',
        'authorizerUserId': authorizerUserId,
        'operatorUserId': operatorUserId,
        'authorizerRole': 'MANAGER',
        'permissionsUsed': ['sales.void_invoice'],
        'operationType': 'consumer.registered-operation.v1',
        'operationSchema': 'consumer.operation.v1',
        'operationDigest': 'sha256:${'f' * 64}',
        'localAuthorizationSequence': '42',
        'localAuditId': localAuditId,
        'localAuditEntryHash': 'sha256:${'a' * 64}',
        'posBuild': '1.0.0+1',
        'policySchema': 'ohac.staff-policy-epoch.v1',
        'trustLevel': 'APPLICATION_SANDBOX_SOFTWARE',
        'authorizedAt': '2026-01-04T12:00:00Z',
      };
      final canonical = canonicalizeOhac(
        Uint8List.fromList(utf8.encode(jsonEncode(body))),
      );
      expect(canonical, isA<OhacSuccess<Uint8List>>());
      expect(
        ohacDigest((canonical as OhacSuccess<Uint8List>).value),
        assertion.digest,
      );
    });

    test('identical inputs produce byte-identical digests (determinism)', () {
      final first = OhacAssertionEmitter(registry).create(input());
      final second = OhacAssertionEmitter(registry).create(input());

      expect(
        (first as OhacSuccess<OhacAssertionV1>).value.digest,
        ((second as OhacSuccess<OhacAssertionV1>).value).digest,
      );
    });

    test('the emitted payload round-trips through parseAssertionV1 byte '
        'identity', () {
      final assertion =
          (OhacAssertionEmitter(registry).create(input()) as OhacSuccess)
              .value as OhacAssertionV1;

      final reparsed = parseAssertionV1(
        Uint8List.fromList(utf8.encode(jsonEncode({
          'schema': assertion.schema,
          'assertionId': assertion.assertionId,
          'tenantId': assertion.tenantId,
          'terminalId': assertion.terminalId,
          'deviceCredentialId': assertion.deviceCredentialId,
          'deviceCredentialVersion': assertion.deviceCredentialVersion,
          'epochSequence': assertion.epochSequence,
          'epochDigest': assertion.epochDigest,
          'authorizerUserId': assertion.authorizerUserId,
          'operatorUserId': assertion.operatorUserId,
          'authorizerRole': assertion.authorizerRole,
          'permissionsUsed': assertion.permissionsUsed,
          'operationType': assertion.operationType,
          'operationSchema': assertion.operationSchema,
          'operationDigest': assertion.operationDigest,
          'localAuthorizationSequence': assertion.localAuthorizationSequence,
          'localAuditId': assertion.localAuditId,
          'localAuditEntryHash': assertion.localAuditEntryHash,
          'posBuild': assertion.posBuild,
          'policySchema': assertion.policySchema,
          'trustLevel': assertion.trustLevel,
          'authorizedAt': assertion.authorizedAt,
          'digest': assertion.digest,
        })),
      ));

      expect(reparsed, isA<OhacSuccess<OhacAssertionV1>>());
      final round = (reparsed as OhacSuccess<OhacAssertionV1>).value;
      expect(round.digest, assertion.digest);
      expect(round.authorizedAt, assertion.authorizedAt);
      expect(round.localAuthorizationSequence,
          assertion.localAuthorizationSequence);
    });
  });

  group('fail-closed input validation', () {
    test('unsorted permissions are refused', () {
      final result = OhacAssertionEmitter(registry)
          .create(input(permissionsUsed: ['sales.zzz', 'sales.aaa']));

      expect(result, isA<OhacFailure<OhacAssertionV1>>());
      expect(
        (result as OhacFailure<OhacAssertionV1>).error.code,
        OhacErrorCode.invalidField,
      );
    });

    test('a non-decimal deviceCredentialVersion is refused', () {
      final result = OhacAssertionEmitter(registry).create(
        OhacAssertionCreationInput(
          outboxId: 'outbox-1',
          assertionId: assertionId,
          tenantId: tenantId,
          terminalId: 'terminal-1',
          deviceCredentialId: deviceCredentialId,
          deviceCredentialVersion: 'v3',
          epochSequence: 17,
          epochDigest: 'sha256:${'e' * 64}',
          authorizerUserId: authorizerUserId,
          operatorUserId: operatorUserId,
          authorizerRole: 'MANAGER',
          permissionsUsed: const ['sales.void_invoice'],
          operationType: 'consumer.registered-operation.v1',
          operationSchema: 'consumer.operation.v1',
          operationDigest: 'sha256:${'f' * 64}',
          localAuthorizationSequence: 42,
          localAuditId: localAuditId,
          localAuditEntryHash: 'sha256:${'a' * 64}',
          posBuild: '1.0.0+1',
          authorizedAt: authorizedAt,
        ),
      );

      expect(result, isA<OhacFailure<OhacAssertionV1>>());
    });
  });

  group('authorizedAt rendering', () {
    test('renders RFC3339 UTC with second precision, never millis', () {
      expect(
        ohacFormatAuthorizedAt(DateTime.utc(2026, 1, 4, 12, 0, 0, 500, 0)),
        '2026-01-04T12:00:00Z',
      );
      expect(
        ohacFormatAuthorizedAt(
            DateTime.utc(2026, 12, 31, 23, 59, 9).toUtc()),
        '2026-12-31T23:59:09Z',
      );
    });
  });
}
