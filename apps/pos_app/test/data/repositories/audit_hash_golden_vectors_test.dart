import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

const _orderedIds = <String>[
  'baseline-ascii',
  'null-metadata',
  'trim-empty-metadata',
  'malformed-metadata',
  'json-scalar-wrapper',
  'json-array-wrapper',
  'object-order-ab',
  'object-order-ba',
  'unicode-nonascii-surrogate-pair',
  'literal-pipes',
  'null-authorization',
  'empty-authorization',
  'timestamp-string-dto-edge',
  'numeric-metadata',
];

void main() {
  test('characterizes current POS logout audit hash vectors', () {
    final fixture =
        jsonDecode(
              File(
                'test/fixtures/logout_audit_flutter_golden_vectors.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    final authority = fixture['authority'] as Map<String, dynamic>;
    final sources = authority['sources'] as Map<String, dynamic>;
    final runtime = fixture['runtime'] as Map<String, dynamic>;
    final comparison = runtime['comparison'] as Map<String, dynamic>;
    final common = fixture['common'] as Map<String, dynamic>;
    final vectors = (fixture['vectors'] as List).cast<Map<String, dynamic>>();

    expect(fixture['schema_version'], 1);
    expect(authority['commit'], '624bde818594ad3636db60ef7b73233227accb22');
    expect(authority['tree'], '752b9732fe10396f5ea64c7875ea5e07ede85f93');
    expect(sources, {
      'fixture-manifest.json':
          '46b742f59739e23a0305722eb0d3296f143ac45b3465b7456bd46139206ac5bc',
      'vector-results.json':
          '17ad2d11ac5c53aea343bb4e0d8daa3cc27f6f0f14ff88493cd202cf0223fb3d',
    });
    expect(comparison, {
      'total': 14,
      'parity': 12,
      'mismatches': ['empty-authorization', 'numeric-metadata'],
      'exit_code': 0,
    });
    expect(runtime['dart'], contains('3.11.5'));
    expect(runtime['node'], 'v24.0.2');
    expect(vectors.map((vector) => vector['id']).toList(), _orderedIds);

    for (final vector in vectors) {
      final actual = _computeVector(common, vector);
      final expectedBytes = _decodeHex(vector['payload_utf8_hex'] as String);
      final expectedDigest = vector['sha256'] as String;
      final offset = _firstDifference(expectedBytes, actual.bytes);
      final diagnostics =
          'vector=${vector['id']} '
          'first_differing_byte_offset=$offset\n'
          'expected_bytes=${_encodeHex(expectedBytes)}\n'
          'actual_bytes=${_encodeHex(actual.bytes)}\n'
          'expected_digest=$expectedDigest\n'
          'actual_digest=${actual.sha256}';

      expect(
        actual.canonicalMetadata,
        vector['canonical_metadata'],
        reason: diagnostics,
      );
      expect(actual.bytes, orderedEquals(expectedBytes), reason: diagnostics);
      expect(actual.sha256, expectedDigest, reason: diagnostics);
      expect(
        expectedDigest,
        matches(RegExp(r'^[0-9a-f]{64}$')),
        reason: diagnostics,
      );
    }

    final byId = {for (final vector in vectors) vector['id']: vector};
    expect(byId['empty-authorization']!['canonical_metadata'], '{}');
    expect(
      utf8.decode(
        _decodeHex(byId['empty-authorization']!['payload_utf8_hex'] as String),
      ),
      contains('|GENESIS|||{}'),
    );
    expect(
      byId['numeric-metadata']!['canonical_metadata'],
      '{"integer":1,"decimal":1.0,"exponent":1e+21}',
    );
  });
}

({List<int> bytes, String canonicalMetadata, String sha256}) _computeVector(
  Map<String, dynamic> common,
  Map<String, dynamic> vector,
) {
  dynamic value(String key) =>
      vector.containsKey(key) ? vector[key] : common[key];
  final metadata = value('metadata_input') as String?;
  final canonicalMetadata = jsonEncode(_normalizeMetadata(metadata));
  final payload = [
    value('user_id'),
    value('action'),
    value('device_id'),
    value('timestamp'),
    value('sequence_no'),
    value('prev_hash'),
    value('metodo_autorizacion') ?? 'null',
    value('usuario_autorizador_id') ?? 'null',
    canonicalMetadata,
  ].join('|');
  final bytes = utf8.encode(payload);
  return (
    bytes: bytes,
    canonicalMetadata: canonicalMetadata,
    sha256: sha256.convert(bytes).toString(),
  );
}

Map<String, dynamic> _normalizeMetadata(String? metadata) {
  if (metadata == null || metadata.trim().isEmpty) return <String, dynamic>{};
  try {
    final decoded = jsonDecode(metadata);
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) {
      return decoded.map((key, value) => MapEntry(key.toString(), value));
    }
    return <String, dynamic>{'value': decoded};
  } catch (_) {
    return <String, dynamic>{'raw_text': metadata};
  }
}

List<int> _decodeHex(String hex) => [
  for (var index = 0; index < hex.length; index += 2)
    int.parse(hex.substring(index, index + 2), radix: 16),
];

String _encodeHex(List<int> bytes) =>
    bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();

int? _firstDifference(List<int> expected, List<int> actual) {
  final sharedLength = expected.length < actual.length
      ? expected.length
      : actual.length;
  for (var index = 0; index < sharedLength; index++) {
    if (expected[index] != actual[index]) return index;
  }
  return expected.length == actual.length ? null : sharedLength;
}
