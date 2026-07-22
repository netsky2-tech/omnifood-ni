import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/audit/v3/canonicalizer.dart';
import 'package:pos_app/core/audit/v3/types.dart';

typedef Json = Map<String, Object?>;
final fixtureRoot = Directory('../../fixtures/audit/v3');
Json object(Object? value) => Map<String, Object?>.from(value! as Map);
int integer(Object? value) => value! as int;
String hex(List<int> bytes) => bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
List<Json> load(String name) => File('${fixtureRoot.path}/$name').readAsLinesSync().where((line) => line.isNotEmpty).map((line) => object(jsonDecode(line))).toList();

Uint8List materialize(Object? input) {
  final recipe = object(input);
  if (recipe['hex'] case final String value) return Uint8List.fromList([for (var i = 0; i < value.length; i += 2) int.parse(value.substring(i, i + 2), radix: 16)]);
  if (recipe['repeat'] case final Object repeated) {
    final value = object(repeated);
    return Uint8List.fromList(List<int>.filled(integer(value['count']), integer(value['byte'])));
  }
  final key = ['nested_array', 'array_count', 'object_count', 'string_bytes'].where(recipe.containsKey).first;
  final count = integer(recipe[key]);
  final text = switch (key) {
    'nested_array' => '${'[' * count}null${']' * count}',
    'array_count' => '[${List<String>.filled(count, 'null').join(',')}]',
    'object_count' => '{${List<String>.generate(count, (i) => '"k${i.toString().padLeft(5, '0')}":null').join(',')}}',
    _ => '"${'a' * (count - 2)}"',
  };
  return Uint8List.fromList(utf8.encode(text));
}

Uint8List success(String raw) => (canonicalizeNumberFreeJson(Uint8List.fromList(utf8.encode(raw))) as AuditV3Success<Uint8List>).value;
void expectProof(Uint8List bytes, Object? value) {
  final proof = object(value);
  if (proof['exact_hex'] case final String exact) { expect(hex(bytes), exact); return; }
  expect(bytes.length, integer(proof['length']));
  expect(sha256.convert(bytes).toString(), proof['sha256']);
  expect(hex(bytes.sublist(0, 16)), proof['prefix_hex']);
  expect(hex(bytes.sublist(bytes.length - 16)), proof['suffix_hex']);
}

void main() {
  test('V001-V012 emit exact canonical authority and rerun deterministically', () {
    for (final row in load('canonical-valid.jsonl')) {
      final first = canonicalizeNumberFreeJson(materialize(row['raw']));
      expect(first, isA<AuditV3Success<Uint8List>>(), reason: row['id']! as String);
      final bytes = (first as AuditV3Success<Uint8List>).value;
      expectProof(bytes, row['canonical_proof']);
      expect((canonicalizeNumberFreeJson(materialize(row['raw'])) as AuditV3Success<Uint8List>).value, bytes);
    }
  });
  test('R001-R028 preserve scanner code and offset without partial output', () {
    for (final row in load('rejections.jsonl')) {
      final result = canonicalizeNumberFreeJson(materialize(row['raw']));
      expect(result, AuditV3Failure<Uint8List>(AuditV3Error(row['code']! as String, integer(row['offset']))), reason: row['id']! as String);
      expect(result, isNot(isA<AuditV3Success<Uint8List>>()));
    }
  });
  test('sorts unsigned UTF-16 units and shorter prefixes first', () {
    expect(utf8.decode(success('{"\ue400":"2","𐀀":"1","aa":"4","a":"3"}')), '{"a":"3","aa":"4","𐀀":"1","\ue400":"2"}');
  });
  test('escapes controls exactly and preserves Unicode, arrays, and normalization', () {
    const raw = '["é","é","😀","\\u0000\\b\\f\\n\\r\\t\\"\\\\"]';
    expect(utf8.decode(success(raw)), raw);
  });
  test('accepts exactly 1 MiB and returns no partial output on failure', () {
    expect(success('"${'a' * 1048574}"').length, 1048576);
    final result = canonicalizeNumberFreeJson(Uint8List.fromList(utf8.encode('[true,1,false]')));
    expect(result, const AuditV3Failure<Uint8List>(AuditV3Error(auditV3NumberForbidden, 6)));
    expect(result, isNot(isA<AuditV3Success<Uint8List>>()));
  });
}
