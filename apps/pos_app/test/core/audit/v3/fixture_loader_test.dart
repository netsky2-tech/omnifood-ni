import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

typedef Json = Map<String, Object?>;
const maxBytes = 1048577;
final root = Directory('../../fixtures/audit/v3');

Json asObject(Object? value, String label) {
  if (value is! Map) throw FormatException('$label must be an object');
  return Map<String, Object?>.from(value);
}

int asInteger(Object? value, String label) {
  if (value is! int || value < 0) throw FormatException('$label must be a non-negative integer');
  return value;
}

Uint8List materialize(Object? value) {
  final recipe = asObject(value, 'recipe');
  final exact = recipe['hex'];
  if (exact is String && RegExp(r'^(?:[0-9a-f]{2})*$').hasMatch(exact)) return Uint8List.fromList([for (var i = 0; i < exact.length; i += 2) int.parse(exact.substring(i, i + 2), radix: 16)]);
  final repeated = recipe['repeat'];
  if (repeated != null) {
    final repeat = asObject(repeated, 'repeat');
    final count = asInteger(repeat['count'], 'repeat.count');
    final byte = asInteger(repeat['byte'], 'repeat.byte');
    if (count > maxBytes || byte > 255) throw const FormatException('repeat exceeds bounds');
    return Uint8List.fromList(List<int>.filled(count, byte));
  }
  final key = ['nested_array', 'array_count', 'object_count', 'string_bytes'].where(recipe.containsKey).firstOrNull;
  if (key == null) throw const FormatException('unknown recipe');
  final count = asInteger(recipe[key], key);
  if (count > maxBytes) throw FormatException('$key exceeds bounds');
  final text = switch (key) {
    'nested_array' => '${'[' * count}null${']' * count}',
    'array_count' => '[${List<String>.filled(count, 'null').join(',')}]',
    'object_count' => '{${List<String>.generate(count, (i) => '"k${i.toString().padLeft(5, '0')}":null').join(',')}}',
    _ => '"${'a' * (count - 2)}"',
  };
  final bytes = utf8.encode(text);
  if (bytes.length > maxBytes) throw FormatException('$key materialization exceeds bounds');
  return Uint8List.fromList(bytes);
}

String hex(List<int> bytes) => bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
void prove(Uint8List bytes, Object? value) {
  final proof = asObject(value, 'proof');
  if (proof['exact_hex'] case final String exact) {
    expect(hex(bytes), exact);
    return;
  }
  expect(bytes.length, asInteger(proof['length'], 'proof.length'));
  expect(sha256.convert(bytes).toString(), proof['sha256']);
  expect(hex(bytes.sublist(0, 16)), proof['prefix_hex']);
  expect(hex(bytes.sublist(bytes.length - 16)), proof['suffix_hex']);
}

List<Json> load(String name) => File('${root.path}/$name').readAsLinesSync().where((line) => line.isNotEmpty).map((line) => asObject(jsonDecode(line), name)).toList();

void main() {
  test('loads the compact final v3 fixture authority', () {
    final schemaBytes = File('${root.path}/schema.json').readAsBytesSync();
    expect(sha256.convert(schemaBytes).toString(), '74c3f4900d00fe3f0642a973beed5ac1235230552136b6095294467fc1ca3e84');
    final schema = asObject(jsonDecode(utf8.decode(schemaBytes)), 'schema');
    expect(schema['version'], 1);
    final authority = asObject(schema['x-authority'], 'x-authority');
    expect(authority['commit'], 'af5bd6e009b9f6be83a39a289cd539a2457abf7e');
    expect(authority['tree'], 'db9c02ce16a29e2eb439d34190084b83d0a1b5a3');
    expect(asObject(authority['source'], 'source')['results'], 'd2808ae2218d3c4090794fe67ec91883b16027c33ec6023a6f850ee66b6988ba');
    final names = ['canonical-valid.jsonl', 'rejections.jsonl', 'frames.jsonl'];
    final compact = asObject(authority['compact'], 'compact');
    for (var i = 0; i < names.length; i++) {
      expect(sha256.convert(File('${root.path}/${names[i]}').readAsBytesSync()).toString(), compact[['canonical', 'rejections', 'frames'][i]]);
    }
    final shards = names.map(load).toList();
    expect(shards.map((rows) => rows.length), [12, 28, 24]);
    final rows = shards.expand((rows) => rows).toList();
    expect(rows, hasLength(64));
    final expected = [...List.generate(12, (i) => 'V${(i + 1).toString().padLeft(3, '0')}'), ...List.generate(28, (i) => 'R${(i + 1).toString().padLeft(3, '0')}'), ...List.generate(24, (i) => 'F${(i + 1).toString().padLeft(3, '0')}')];
    expect(rows.map((row) => row['id']), expected);
    for (final row in rows) {
      expect(row['id'], matches(r'^[VRF][0-9]{3}$'));
      if (row['raw'] != null) prove(materialize(row['raw']), row['raw_proof']);
      final canonical = row['canonical_proof'];
      if (canonical is Map && canonical['length'] != null) expect(canonical, row['raw_proof']);
      final fields = row['fields'] == null ? null : asObject(row['fields'], 'fields');
      final user = fields?['user_id'];
      if (user is Map && user.containsKey(r'$repeat_text')) prove(Uint8List.fromList(List<int>.filled(asInteger(user[r'$repeat_text'], r'$repeat_text'), 97)), asObject(row['field_proofs'], 'field_proofs')['user_id']);
      final metadata = row['metadata'];
      if (metadata is Map && metadata.containsKey('repeat')) prove(materialize(metadata), row['metadata_proof']);
      if (row['frame_hex'] case final String frame) expect(sha256.convert(materialize({'hex': frame})).toString(), row['sha256']);
    }
  });
}
