import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/audit/v3/types.dart' as audit;
import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

import 'ohac_test_helpers.dart';

void main() {
  final fixture = loadCanonicalVectorsFixture();

  test(
    'loads the authored fixture instead of generating expectations at runtime',
    () {
      expect(fixture['contract'], 'OHAC-C14N-1');
      expect(
        (fixture['canonicalVectors'] as List).length,
        greaterThanOrEqualTo(9),
      );
      expect(
        (fixture['rejectionVectors'] as List).length,
        greaterThanOrEqualTo(6),
      );
      expect(
        [
          for (final vector in fixture['contractVectors'] as List)
            (vector as Map)['id'],
        ],
        ['K01', 'K02', 'K03'],
      );
      expect(
        [
          for (final vector in fixture['sizeVectors'] as List)
            (vector as Map)['id'],
        ],
        ['S01', 'S02'],
      );
    },
  );

  test(
    'every canonical vector canonicalizes to the authored bytes and digest',
    () {
      for (final entry in fixture['canonicalVectors'] as List) {
        final vector = Map<String, dynamic>.from(entry as Map);
        final id = vector['id']! as String;
        final result = canonicalizeOhac(utf8Bytes(vector['raw']! as String));
        expect(result, isA<OhacSuccess<Uint8List>>(), reason: id);
        if (result case final OhacSuccess<Uint8List> success) {
          expect(utf8.decode(success.value), vector['canonical'], reason: id);
          expect(ohacDigest(success.value), vector['digest'], reason: id);
        }
      }
    },
  );

  test('every rejection vector fails with the authored error code', () {
    for (final entry in fixture['rejectionVectors'] as List) {
      final vector = Map<String, dynamic>.from(entry as Map);
      final id = vector['id']! as String;
      final raw = vector['rawHex'] != null
          ? hexBytes(vector['rawHex']! as String)
          : utf8Bytes((vector['raw'] ?? '') as String);
      final result = canonicalizeOhac(raw);
      expect(result, isA<OhacFailure<dynamic>>(), reason: id);
      expect(failureOf(result).code, vector['errorCode'], reason: id);
    }
  });

  test('keeps NFC and NFD vectors distinct in both bytes and digest', () {
    final vectors = {
      for (final entry in fixture['canonicalVectors'] as List)
        (entry as Map)['id']! as String: Map<String, dynamic>.from(entry),
    };
    final nfc = vectors['C04'];
    final nfd = vectors['C05'];
    expect(nfc, isNotNull);
    expect(nfd, isNotNull);
    expect(nfc!['canonical'], isNot(nfd!['canonical']));
    expect(nfc['digest'], isNot(nfd['digest']));
  });

  test('stable error codes keep their wire values', () {
    expect(OhacErrorCode.nullForbidden, 'OHAC_NULL_FORBIDDEN');
    expect(OhacErrorCode.numberForbidden, 'OHAC_NUMBER_FORBIDDEN');
    expect(OhacErrorCode.duplicateKey, 'OHAC_DUPLICATE_KEY');
  });

  test('shared contract vectors enforce value-layer parity', () {
    for (final entry in fixture['contractVectors'] as List) {
      final vector = Map<String, dynamic>.from(entry as Map);
      final id = vector['id']! as String;
      expect(vector['operation'], 'parseStaffPolicyEpochV1', reason: id);
      final validRaw = vector['validRaw'] as String?;
      final mutatedRaw = vector['mutatedRaw'] as String?;
      if (validRaw != null) {
        expect(
          parseStaffPolicyEpochV1(utf8Bytes(validRaw)),
          isA<OhacSuccess<StaffPolicyEpochV1>>(),
          reason: '$id validRaw',
        );
      }
      final rejectedRaw = (vector['raw'] ?? mutatedRaw) as String?;
      if (rejectedRaw == null) {
        fail('$id has no rejection payload');
      }
      if (validRaw != null && mutatedRaw != null) {
        final validBytes = utf8Bytes(validRaw);
        final mutatedBytes = utf8Bytes(mutatedRaw);
        expect(mutatedBytes.length, validBytes.length, reason: id);
        var differentBytes = 0;
        for (var index = 0; index < validBytes.length; index += 1) {
          if (validBytes[index] != mutatedBytes[index]) differentBytes += 1;
        }
        expect(differentBytes, 1, reason: id);
      }
      final error = failureOf(
        parseStaffPolicyEpochV1(utf8Bytes(rejectedRaw)),
      );
      expect(error.code, vector['errorCode'], reason: id);
      expect(error.field, vector['field'], reason: id);
    }
  });

  test('shared compact size vectors enforce the 1 MiB boundary', () {
    for (final entry in fixture['sizeVectors'] as List) {
      final vector = Map<String, dynamic>.from(entry as Map);
      final id = vector['id']! as String;
      final totalBytes = vector['totalBytes']! as int;
      final prefix = vector['jsonPrefix']! as String;
      final suffix = vector['jsonSuffix']! as String;
      final fill = vector['fillCharacter']! as String;
      expect(utf8.encode(fill).length, 1, reason: id);
      final raw = utf8Bytes(
        '$prefix${fill * (totalBytes - utf8.encode(prefix + suffix).length)}$suffix',
      );
      expect(raw.length, totalBytes, reason: id);
      final result = canonicalizeOhac(raw);
      if (vector['expected'] == 'success') {
        expect(result, isA<OhacSuccess<Uint8List>>(), reason: id);
      } else {
        expect(failureOf(result).code, vector['errorCode'], reason: id);
      }
    }
  });

  group('audit-v3 → OHAC code mapping', () {
    // Audit-v3 represents codes as plain strings, so Dart cannot check the
    // mapping switch for exhaustiveness at compile time. This group pins every
    // current mapping and the loud failure for unmapped future codes; extend
    // both together whenever a new audit-v3 code ships.
    test('pins every audit-v3 code to its explicit OHAC mapping', () {
      expect(
        auditV3CodeToOhac(audit.auditV3InvalidUtf8),
        OhacErrorCode.invalidUtf8,
      );
      expect(
        auditV3CodeToOhac(audit.auditV3InvalidJson),
        OhacErrorCode.invalidJson,
      );
      expect(
        auditV3CodeToOhac(audit.auditV3InvalidUnicode),
        OhacErrorCode.invalidUnicode,
      );
      expect(
        auditV3CodeToOhac(audit.auditV3DuplicateKey),
        OhacErrorCode.duplicateKey,
      );
      expect(
        auditV3CodeToOhac(audit.auditV3NumberForbidden),
        OhacErrorCode.numberForbidden,
      );
      expect(
        auditV3CodeToOhac(audit.auditV3LimitExceeded),
        OhacErrorCode.limitExceeded,
      );
      expect(
        auditV3CodeToOhac(audit.auditV3FrameInvalid),
        OhacErrorCode.invalidField,
      );
      expect(
        auditV3CodeToOhac(audit.auditV3FrameTooLarge),
        OhacErrorCode.limitExceeded,
      );
    });

    test(
      'an unmapped future audit-v3 code throws instead of silently becoming OHAC_INVALID_JSON',
      () {
        expect(
          () => auditV3CodeToOhac('AUDIT_V3_SOME_FUTURE_CODE'),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              contains('AUDIT_V3_SOME_FUTURE_CODE'),
            ),
          ),
        );
      },
    );
  });

  group('verifyBodyDigest reserved-key parity', () {
    // `__proto__` stays an ordinary map entry in Dart, so an integrity digest
    // stamped over bytes that contain it must verify against the parsed
    // envelope. The TS side must keep the own property the same way; plain
    // assignment there triggers the Object.prototype setter and drops the
    // key, which would turn identical bytes into OHAC_DIGEST_MISMATCH
    // instead of the stable unknown-field rejection.
    test(
      'verifies a digest computed over a body carrying the reserved `__proto__` key',
      () {
        const bodyJson =
            '{"__proto__":{"injected":true},"schema":"ohac.assertion.v1"}';
        final digest =
            (digestOfJson(utf8Bytes(bodyJson)) as OhacSuccess<String>).value;
        final envelope =
            jsonDecode(
                  '${bodyJson.substring(0, bodyJson.length - 1)},"digest":"$digest"}',
                )
                as Map<String, dynamic>;
        final verified = verifyBodyDigest(envelope);
        expect(verified, isA<OhacSuccess<Map<String, dynamic>>>());
        expect(
          (verified as OhacSuccess<Map<String, dynamic>>).value['__proto__'],
          <String, dynamic>{'injected': true},
        );
      },
    );

    test(
      'still fails with digestMismatch when the transmitted digest does not cover the reserved key',
      () {
        final digest =
            (digestOfJson(utf8Bytes('{"schema":"ohac.assertion.v1"}'))
                    as OhacSuccess<String>)
                .value;
        final envelope =
            jsonDecode(
                  '{"__proto__":{"injected":true},"schema":"ohac.assertion.v1","digest":"$digest"}',
                )
                as Map<String, dynamic>;
        expect(
          failureOf(verifyBodyDigest(envelope)).code,
          OhacErrorCode.digestMismatch,
        );
      },
    );
  });
}
