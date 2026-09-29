import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/field_guards.dart';
import 'package:pos_app/data/models/human_authorization/ohac_epoch_persistence_mapper.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

import 'ohac_test_helpers.dart';

const _tenant = '11111111-1111-4111-8111-111111111111';
const _otherTenant = '22222222-2222-4222-8222-222222222222';
const _userA = '33333333-3333-4333-8333-333333333333';
const _userB = '44444444-4444-4444-8444-444444444444';
const _terminal = 'Q802024120001';
const _posBuild = '2.3.4+11';
const _receivedAt = '2026-01-01T00:00:00.000Z';

const _maxInt64 = '9223372036854775807';
const _maxInt64PlusOne = '9223372036854775808';

Map<String, dynamic> _epochEntry(
  String userId,
  List<String> permissions,
) => <String, dynamic>{
  'userId': userId,
  'status': 'ACTIVE',
  'role': 'MANAGER',
  // Permissions arrive UTF-16 sorted and de-duplicated (design §4.1 rule 3).
  'permissions': permissions,
  'pinVerifier': <String, dynamic>{
    'algorithm': 'bcrypt',
    'formatVersion': '2b',
    'encoded': r'$2b$10$abcdefghijklmnopqrstuv',
  },
  'attemptResetGeneration': '0',
};

Map<String, dynamic> _epochBody([
  Map<String, dynamic> overrides = const {},
]) => <String, dynamic>{
  'schema': staffPolicyEpochV1Schema,
  'tenantId': _tenant,
  'targetTerminalId': _terminal,
  'sequence': '1',
  'previousSequence': '0',
  'previousDigest': genesisDigest,
  'publisherBackendBuild': 'backend-build-1',
  'targetPosBuild': _posBuild,
  'minimumAssertionSchema': 'ohac.assertion.v1',
  // Entries are sorted by userId (design §4.1 rule 3); userA < userB.
  'policyEntries': <Map<String, dynamic>>[
    _epochEntry(_userA, <String>['inventory:adjust', 'sales:void_invoice']),
    _epochEntry(_userB, <String>['sales:void_invoice']),
  ],
  ...overrides,
};

/// The epoch exactly as the backend envelope carries it: parsed JSON with the
/// `digest` field appended by the backend's own signing procedure.
Map<String, dynamic> _signedEpochJson([
  Map<String, dynamic> overrides = const {},
]) => jsonDecode(utf8.decode(signBody(_epochBody(overrides))))
    as Map<String, dynamic>;

void main() {
  test('maps a delivered epoch into the immutable persistence entities', () {
    final mapping = mapDeliveredEpochForPersistence(
      epochMap: _signedEpochJson(),
      tenantId: _tenant,
      terminalId: _terminal,
      receivedAt: _receivedAt,
    );

    expect(mapping.epoch.sequence, '1');
    final epochEntity = mapping.epochEntity;
    // Identity comes from the persisted terminal state (the arguments), not
    // from the epoch map.
    expect(epochEntity.tenantId, _tenant);
    expect(epochEntity.terminalId, _terminal);
    expect(epochEntity.sequence, 1);
    expect(epochEntity.previousSequence, 0);
    expect(epochEntity.digest, startsWith('sha256:'));
    expect(epochEntity.previousDigest, genesisDigest);
    expect(epochEntity.schema, staffPolicyEpochV1Schema);
    expect(epochEntity.targetPosBuild, _posBuild);
    expect(epochEntity.publisherBackendBuild, 'backend-build-1');
    expect(epochEntity.minimumAssertionSchema, 'ohac.assertion.v1');
    expect(epochEntity.receivedAt, _receivedAt);
  });

  test(
    'entries keep the epoch order and map permissions/verifier columns',
    () {
      final mapping = mapDeliveredEpochForPersistence(
        epochMap: _signedEpochJson(),
        tenantId: _tenant,
        terminalId: _terminal,
        receivedAt: _receivedAt,
      );

      expect(mapping.entryEntities.length, 2);
      final first = mapping.entryEntities[0];
      final second = mapping.entryEntities[1];
      // Epoch entry order preserved (the contract sorts entries by userId).
      expect(first.userId, _userA);
      expect(second.userId, _userB);

      expect(first.tenantId, _tenant);
      expect(first.terminalId, _terminal);
      expect(first.sequence, 1);
      expect(first.status, 'ACTIVE');
      expect(first.role, 'MANAGER');
      // The entity column is a JSON array string.
      expect(
        first.permissions,
        jsonEncode(<String>['inventory:adjust', 'sales:void_invoice']),
      );
      expect(first.verifierAlgorithm, 'bcrypt');
      expect(first.verifierFormatVersion, '2b');
      expect(first.verifierEncoded, r'$2b$10$abcdefghijklmnopqrstuv');
      expect(first.attemptResetGeneration, '0');

      expect(second.permissions, jsonEncode(<String>['sales:void_invoice']));
    },
  );

  test(
    'payload provenance: the stored payload is the envelope the backend '
    'signed — its digest verifies against the stored body',
    () {
      final mapping = mapDeliveredEpochForPersistence(
        epochMap: _signedEpochJson(),
        tenantId: _tenant,
        terminalId: _terminal,
        receivedAt: _receivedAt,
      );

      final payloadMap =
          jsonDecode(mapping.epochEntity.payload) as Map<String, dynamic>;
      // The digest covers the whole object except `digest` itself, so a
      // verification over the STORED payload proves it is the envelope the
      // backend signed — not a re-serialization that silently dropped or
      // reordered bytes.
      final verified = verifyBodyDigest(payloadMap);
      expect(verified, isA<OhacSuccess<dynamic>>());
      expect(payloadMap['digest'], mapping.epoch.digest);
    },
  );

  test(
    'payload provenance: re-canonicalizing the stored payload is '
    'byte-identical (idempotent round-trip)',
    () {
      final mapping = mapDeliveredEpochForPersistence(
        epochMap: _signedEpochJson(),
        tenantId: _tenant,
        terminalId: _terminal,
        receivedAt: _receivedAt,
      );

      final payloadBytes = utf8Bytes(mapping.epochEntity.payload);
      final recanonicalized = canonicalizeOhac(payloadBytes);
      expect(recanonicalized, isA<OhacSuccess<Uint8List>>());
      expect(
        (recanonicalized as OhacSuccess<Uint8List>).value,
        payloadBytes,
      );
    },
  );

  test(
    'a tampered field breaks the digest check and the mapper refuses the '
    'epoch (fails for the right reason)',
    () {
      final tampered = _signedEpochJson();
      // Mutate one field WITHOUT re-signing: the transmitted digest no
      // longer covers the body.
      ((tampered['policyEntries'] as List<dynamic>)[0]
          as Map<String, dynamic>)['permissions'] = <String>['zzz:perm'];

      // Layer 1 — the digest check itself must fail, proving the tamper is
      // detectable at the canonical-digest layer and not merely by some
      // unrelated validation.
      final digestCheck = verifyBodyDigest(tampered);
      expect(digestCheck, isA<OhacFailure<dynamic>>());
      expect(
        (digestCheck as OhacFailure<dynamic>).error.code,
        OhacErrorCode.digestMismatch,
      );

      // Layer 2 — the mapper fails closed on exactly that input.
      expect(
        () => mapDeliveredEpochForPersistence(
          epochMap: tampered,
          tenantId: _tenant,
          terminalId: _terminal,
          receivedAt: _receivedAt,
        ),
        throwsStateError,
      );
    },
  );

  test(
    'identity comes from the persisted terminal state: a tenant mismatch '
    'throws instead of silently keying from the epoch',
    () {
      // The epoch names _tenant; the persisted state says _otherTenant.
      expect(
        () => mapDeliveredEpochForPersistence(
          epochMap: _signedEpochJson(),
          tenantId: _otherTenant,
          terminalId: _terminal,
          receivedAt: _receivedAt,
        ),
        throwsStateError,
      );
    },
  );

  test(
    'identity comes from the persisted terminal state: a terminal mismatch '
    'throws instead of silently keying from the epoch',
    () {
      expect(
        () => mapDeliveredEpochForPersistence(
          epochMap: _signedEpochJson(),
          tenantId: _tenant,
          terminalId: 'OTHER-TERMINAL',
          receivedAt: _receivedAt,
        ),
        throwsStateError,
      );
    },
  );

  test(
    'sequence values outside the Int64 guard are rejected by the contract '
    'parser, and the mapper fails closed on them',
    () {
      // Direct guard proof: the value the epoch below carries is exactly the
      // value the guard refuses (chain-consistent, so only the guard can
      // reject it).
      expect(isInt64DecimalString(_maxInt64PlusOne), isFalse);

      final overrides = <String, dynamic>{
        'sequence': _maxInt64PlusOne,
        'previousSequence': _maxInt64,
        'previousDigest': 'sha256:${'b' * 64}',
      };

      // Pin the layer that actually rejects: the mapper holds an already-
      // parsed StaffPolicyEpochV1, so its rejection of this envelope can
      // only come from parseStaffPolicyEpochV1's own Int64 guard. The raw
      // value is an int-overflow decimal, so the guard refuses it.
      final parsed = parseStaffPolicyEpochV1(
        signBody(_epochBody(overrides)),
      );
      expect(parsed, isA<OhacFailure<dynamic>>());
      expect(
        (parsed as OhacFailure<dynamic>).error.code,
        OhacErrorCode.invalidField,
      );
      expect((parsed as OhacFailure<dynamic>).error.field, 'sequence');

      // The mapper propagates that refusal as a throw (fail closed).
      expect(
        () => mapDeliveredEpochForPersistence(
          epochMap:
              jsonDecode(utf8.decode(signBody(_epochBody(overrides))))
                  as Map<String, dynamic>,
          tenantId: _tenant,
          terminalId: _terminal,
          receivedAt: _receivedAt,
        ),
        throwsStateError,
      );
    },
  );
}
