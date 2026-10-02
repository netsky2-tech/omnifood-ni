import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';

/// A complete, valid offer for the Q80 (arm64). Individual tests mutate one
/// field at a time so each rejection is attributable.
Map<String, dynamic> validManifest() => {
      'schema': releaseManifestSchema,
      'channel': 'pilot',
      'abi': 'arm64-v8a',
      'versionCode': 2002,
      'versionName': '1.0.2',
      'sha256': 'd' * 64,
      'sizeBytes': 32357769,
      'downloadUrl': 'https://cdn.example.test/pos/arm64-2002.apk?sig=x',
      'minFromVersionCode': 2001,
      'mandatory': false,
      'publishedAt': '2026-10-02T18:00:00Z',
      'notes': 'runtime server URL card fix',
    };

ReleaseManifest accepted(Object? json) {
  final result = ReleaseManifest.tryParse(json);
  expect(result, isA<ReleaseManifestAccepted>());
  return (result as ReleaseManifestAccepted).manifest;
}

ReleaseRejectReason rejected(Object? json) {
  final result = ReleaseManifest.tryParse(json);
  expect(result, isA<ReleaseManifestRejection>());
  return (result as ReleaseManifestRejection).reason;
}

void main() {
  group('ReleaseManifest.tryParse — happy path', () {
    test('accepts a well-formed offer and preserves every field', () {
      final m = accepted(validManifest());
      expect(m.channel, 'pilot');
      expect(m.abi, TargetAbi.arm64v8a);
      expect(m.versionCode, 2002);
      expect(m.versionName, '1.0.2');
      expect(m.sha256, 'd' * 64);
      expect(m.sizeBytes, 32357769);
      expect(m.minFromVersionCode, 2001);
      expect(m.mandatory, isFalse);
      expect(m.publishedAt, DateTime.utc(2026, 10, 2, 18));
      expect(m.notes, contains('card fix'));
    });

    test('treats notes as the only optional field', () {
      final json = validManifest()..remove('notes');
      expect(accepted(json).notes, isNull);
    });

    test('normalizes publishedAt to UTC', () {
      final json = validManifest()
        ..['publishedAt'] = '2026-10-02T15:00:00-0300';
      expect(accepted(json).publishedAt, DateTime.utc(2026, 10, 2, 18));
    });

    test('trims channel and versionName whitespace', () {
      final json = validManifest()
        ..['channel'] = '  pilot  '
        ..['versionName'] = '  1.0.2  ';
      final m = accepted(json);
      expect(m.channel, 'pilot');
      expect(m.versionName, '1.0.2');
    });
  });

  group('ReleaseManifest.tryParse — schema is a hard boundary (R6)', () {
    test('rejects a future schema instead of parsing what it cannot know', () {
      final json = validManifest()..['schema'] = 'omnifood.pos.release/2';
      expect(rejected(json), ReleaseRejectReason.unknownSchema);
    });

    test('rejects a missing or non-string schema', () {
      expect(
        rejected(validManifest()..remove('schema')),
        ReleaseRejectReason.missingField,
      );
      expect(
        rejected(validManifest()..['schema'] = 1),
        ReleaseRejectReason.missingField,
      );
    });

    test('rejects a non-object payload', () {
      expect(rejected('nope'), ReleaseRejectReason.malformedManifest);
      expect(rejected(null), ReleaseRejectReason.malformedManifest);
      expect(rejected([]), ReleaseRejectReason.malformedManifest);
    });
  });

  group('ReleaseManifest.tryParse — per-ABI integrity (R1)', () {
    test('rejects an ABI it does not recognize', () {
      expect(
        rejected(validManifest()..['abi'] = 'arm64'),
        ReleaseRejectReason.unknownAbi,
      );
      expect(
        rejected(validManifest()..['abi'] = null),
        ReleaseRejectReason.unknownAbi,
      );
    });

    test('accepts each real Android ABI', () {
      for (final abi in TargetAbi.values) {
        expect(
          accepted(validManifest()..['abi'] = abi.wireName).abi,
          abi,
        );
      }
    });
  });

  group('ReleaseManifest.tryParse — version integrity (R2, R3)', () {
    test('rejects a non-positive or non-integer versionCode', () {
      for (final bad in [0, -1, '2002', 2002.0, null]) {
        expect(
          rejected(validManifest()..['versionCode'] = bad),
          ReleaseRejectReason.invalidVersionCode,
          reason: 'versionCode $bad must not be accepted',
        );
      }
    });

    test('rejects a malformed minFromVersionCode', () {
      expect(
        rejected(validManifest()..['minFromVersionCode'] = 0),
        ReleaseRejectReason.invalidMinFromVersionCode,
      );
    });

    test('rejects an inverted range, which cannot describe a real upgrade',
        () {
      expect(
        rejected(validManifest()..['versionCode'] = 2001),
        ReleaseRejectReason.invertedVersionRange,
      );
      expect(
        rejected(validManifest()..['minFromVersionCode'] = 2003),
        ReleaseRejectReason.invertedVersionRange,
      );
    });
  });

  group('ReleaseManifest.tryParse — artifact integrity (R4, R5)', () {
    test('rejects a sha256 that is not 64 lowercase hex', () {
      for (final bad in [
        'D' * 64, // uppercase: would not match a lowercase digest comparison
        'd' * 63,
        'd' * 65,
        '',
        'z' * 64,
        null,
      ]) {
        expect(
          rejected(validManifest()..['sha256'] = bad),
          ReleaseRejectReason.invalidSha256,
          reason: 'sha256 "$bad" must not be accepted',
        );
      }
    });

    test('rejects a non-positive size', () {
      expect(
        rejected(validManifest()..['sizeBytes'] = 0),
        ReleaseRejectReason.invalidSize,
      );
    });
  });

  group('ReleaseManifest.tryParse — transport sanity', () {
    test('rejects a relative or non-http download URL', () {
      for (final bad in [
        '/pos/arm64.apk',
        'file:///sdcard/pos.apk',
        'ftp://cdn.test/pos.apk',
        'javascript:alert(1)',
        '',
      ]) {
        expect(
          rejected(validManifest()..['downloadUrl'] = bad),
          ReleaseRejectReason.invalidDownloadUrl,
          reason: 'downloadUrl "$bad" must not be accepted',
        );
      }
    });

    test('accepts an absolute https URL carrying a signed query', () {
      final m = accepted(
        validManifest()
          ..['downloadUrl'] =
              'https://cdn.example.test/a.apk?X-Amz-Signature=deadbeef',
      );
      expect(m.downloadUrl.queryParameters.containsKey('X-Amz-Signature'),
          isTrue);
    });

    test('rejects an unparseable publishedAt', () {
      expect(
        rejected(validManifest()..['publishedAt'] = 'tomorrow-ish'),
        ReleaseRejectReason.invalidPublishedAt,
      );
    });

    test('rejects a non-boolean mandatory', () {
      expect(
        rejected(validManifest()..['mandatory'] = 'true'),
        ReleaseRejectReason.missingField,
      );
    });

    test('rejects a blank channel', () {
      expect(
        rejected(validManifest()..['channel'] = '   '),
        ReleaseRejectReason.invalidChannel,
      );
    });
  });

  group('rejection diagnostics', () {
    test('carries a canonical English detail for logs', () {
      final result = ReleaseManifest.tryParse(
        validManifest()..['schema'] = 'omnifood.pos.release/9',
      ) as ReleaseManifestRejection;
      expect(result.detail, contains('omnifood.pos.release/1'));
      expect(result.detail, contains('omnifood.pos.release/9'));
    });
  });
}
