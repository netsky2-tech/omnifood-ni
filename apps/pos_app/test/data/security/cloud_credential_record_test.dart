import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/security/cloud_credentials.dart';
import 'package:pos_app/domain/security/cloud_credential_record.dart';

const _id = '123e4567-e89b-42d3-a456-426614174000';
final _max = BigInt.parse('18446744073709551615');

String _canonical(Map<String, dynamic> value) {
  final keys = value.keys.toList()..sort();
  return '{${keys.map((key) => '${jsonEncode(key)}:${jsonEncode(value[key])}').join(',')}}';
}

Map<String, dynamic> _signed(Map<String, dynamic> value) {
  final fields = Map<String, dynamic>.from(value)..remove('checksum');
  return {
    ...fields,
    'checksum': sha256.convert(utf8.encode(_canonical(fields))).toString(),
  };
}

CloudCredentials _credentials() => CloudCredentials(
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  userId: 'user-1',
  tenantId: 'tenant-1',
  issuedAtUtc: DateTime.utc(2026, 1, 2, 3, 4, 5),
);

CloudCredentialRecord _active(BigInt generation) =>
    CloudCredentialRecord.active(
      generation: generation,
      previousGeneration: generation == BigInt.one
          ? null
          : generation - BigInt.one,
      writerEpoch: generation,
      commitId: _id,
      state: CredentialRecordPhase.committed,
      credentials: _credentials(),
    );

void main() {
  test(
    'uses the exact ACTIVE schema and canonical checksum independent of wire order',
    () {
      final encoded = _active(BigInt.from(2)).encode();
      final fields = jsonDecode(encoded) as Map<String, dynamic>;
      expect(fields.keys.toSet(), {
        'schemaVersion',
        'generation',
        'previousGeneration',
        'writerEpoch',
        'commitId',
        'state',
        'credentialState',
        'issuedAt',
        'accessToken',
        'refreshToken',
        'userId',
        'tenantId',
        'checksum',
      });
      final reordered = Map<String, dynamic>.fromEntries(
        fields.entries.toList().reversed,
      );
      expect(
        CloudCredentialRecord.decode(jsonEncode(reordered)).record!.generation,
        BigInt.from(2),
      );
      expect(
        CloudCredentialRecord.decode(
          jsonEncode({...reordered, 'tenantId': 'tampered'}),
        ).status,
        CredentialRecordStatus.invalid,
      );
    },
  );
  test(
    'round trips a generation-one ACTIVE followed by generation-two CLEARED tombstone',
    () {
      final active = _active(BigInt.one);
      final cleared = CloudCredentialRecord.cleared(
        generation: BigInt.from(2),
        previousGeneration: BigInt.one,
        writerEpoch: BigInt.from(2),
        commitId: _id,
        state: CredentialRecordPhase.committed,
        issuedAtUtc: DateTime.utc(2026, 1, 3),
      );
      expect(
        CloudCredentialRecord.decode(
          active.encode(),
        ).record!.previousGeneration,
        isNull,
      );
      final decoded = CloudCredentialRecord.decode(cleared.encode()).record!;
      expect(decoded.previousGeneration, BigInt.one);
      expect(decoded.credentials, isNull);
      expect(
        (jsonDecode(cleared.encode()) as Map<String, dynamic>).keys.toSet(),
        {
          'schemaVersion',
          'generation',
          'previousGeneration',
          'writerEpoch',
          'commitId',
          'state',
          'credentialState',
          'issuedAt',
          'checksum',
        },
      );
    },
  );
  test(
    'round trips exact uint64 values and rejects noncanonical, negative, and overflow values',
    () {
      for (final value in [
        BigInt.parse('9007199254740992'),
        BigInt.parse('9223372036854775808'),
        _max,
      ]) {
        expect(
          CloudCredentialRecord.decode(
            _active(value).encode(),
          ).record!.generation,
          value,
        );
      }
      final valid =
          jsonDecode(_active(BigInt.one).encode()) as Map<String, dynamic>;
      for (final generation in ['0', '-1', '01', '18446744073709551616']) {
        expect(
          CloudCredentialRecord.decode(
            jsonEncode(_signed({...valid, 'generation': generation})),
          ).status,
          CredentialRecordStatus.invalid,
        );
      }
    },
  );
  test('decodes valid hints and classifies untrusted raw hint data', () {
    final hint = CloudCredentialHint(
      generation: _max,
      slot: CredentialSlot.b,
      commitId: _id,
      checksum: 'a' * 64,
    );
    final valid = jsonDecode(hint.encode()) as Map<String, dynamic>;
    final reordered = Map<String, dynamic>.fromEntries(
      valid.entries.toList().reversed,
    );
    expect(
      CloudCredentialHint.decode(null).status,
      CredentialHintStatus.absent,
    );
    expect(
      CloudCredentialHint.decode(jsonEncode(reordered)).hint!.generation,
      _max,
    );
    expect(
      CloudCredentialHint.decode(jsonEncode(reordered)).hint!.slot,
      CredentialSlot.b,
    );
    for (final invalid in [
      'not-json',
      jsonEncode({'generation': '1'}),
      jsonEncode({...valid, 'unknown': true}),
      jsonEncode({...valid, 'generation': '-1'}),
      jsonEncode({...valid, 'slot': 'C'}),
      jsonEncode({...valid, 'commitId': 'not-a-uuid'}),
      jsonEncode({...valid, 'checksum': 'A' * 64}),
      jsonEncode({...valid, 'checksum': 1}),
    ]) {
      expect(
        CloudCredentialHint.decode(invalid).status,
        CredentialHintStatus.invalid,
      );
    }
  });

  test('rejects every extra, missing, or conditionally wrong key', () {
    final active =
        jsonDecode(_active(BigInt.one).encode()) as Map<String, dynamic>;
    final cleared =
        jsonDecode(
              CloudCredentialRecord.cleared(
                generation: BigInt.one,
                writerEpoch: BigInt.one,
                commitId: _id,
                state: CredentialRecordPhase.prepared,
                issuedAtUtc: DateTime.utc(2026),
              ).encode(),
            )
            as Map<String, dynamic>;
    for (final fields in [
      {...active}..remove('issuedAt'),
      {...active, 'phase': 'COMMITTED'},
      {...cleared, 'accessToken': 'secret'},
      {...cleared, 'writerIntentEpoch': '1'},
    ]) {
      expect(
        CloudCredentialRecord.decode(jsonEncode(_signed(fields))).status,
        CredentialRecordStatus.invalid,
      );
    }
  });
}
