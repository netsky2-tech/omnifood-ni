import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/audit/v3/scanner.dart';
import 'package:pos_app/core/audit/v3/types.dart';

typedef Json = Map<String, Object?>;
const maxRecipeBytes = 1048577;
final fixtureRoot = Directory('../../fixtures/audit/v3');

Json object(Object? value) => Map<String, Object?>.from(value! as Map);
int integer(Object? value) => value! as int;
Uint8List materialize(Object? input) {
  final recipe = object(input);
  if (recipe['hex'] case final String value) {
    return Uint8List.fromList([for (var i = 0; i < value.length; i += 2) int.parse(value.substring(i, i + 2), radix: 16)]);
  }
  if (recipe['repeat'] case final Object repeated) {
    final value = object(repeated); final count = integer(value['count']); final byte = integer(value['byte']);
    if (count > maxRecipeBytes || byte > 255) throw const FormatException('repeat exceeds bounds');
    return Uint8List.fromList(List<int>.filled(count, byte));
  }
  final key = ['nested_array', 'array_count', 'object_count', 'string_bytes'].where(recipe.containsKey).first;
  final count = integer(recipe[key]);
  if (count > maxRecipeBytes) throw const FormatException('recipe exceeds bounds');
  final text = switch (key) {
    'nested_array' => '${'[' * count}null${']' * count}',
    'array_count' => '[${List<String>.filled(count, 'null').join(',')}]',
    'object_count' => '{${List<String>.generate(count, (i) => '"k${i.toString().padLeft(5, '0')}":null').join(',')}}',
    _ => '"${'a' * (count - 2)}"',
  };
  final bytes = utf8.encode(text); if (bytes.length > maxRecipeBytes) throw const FormatException('materialization exceeds bounds');
  return Uint8List.fromList(bytes);
}
List<Json> load(String name) => File('${fixtureRoot.path}/$name').readAsLinesSync().where((line) => line.isNotEmpty).map((line) => object(jsonDecode(line))).toList();

void main() {
  test('R001-R028 reject at the exact phase and byte', () {
    for (final row in load('rejections.jsonl')) {
      expect(scanNumberFreeJson(materialize(row['raw'])), AuditV3Failure<AuditV3Value>(AuditV3Error(row['code']! as String, integer(row['offset']))), reason: row['id']! as String);
    }
  });
  test('V001-V012 succeed with typed number-free shapes', () {
    final results = load('canonical-valid.jsonl').map((row) => scanNumberFreeJson(materialize(row['raw']))).toList();
    expect(results, everyElement(isA<AuditV3Success<AuditV3Value>>()));
    expect((results[0] as AuditV3Success<AuditV3Value>).value, isA<AuditV3Object>());
    expect((results[1] as AuditV3Success<AuditV3Value>).value, isA<AuditV3Array>());
    expect((results[4] as AuditV3Success<AuditV3Value>).value, isA<AuditV3String>());
  });
  test('preserves decoded insertion entries and supplementary keys', () {
    final ordered = scanNumberFreeJson(Uint8List.fromList(utf8.encode('{"b":"b","a":"a"}'))) as AuditV3Success<AuditV3Value>;
    expect((ordered.value as AuditV3Object).entries.map((entry) => entry.key), ['b', 'a']);
    final scalar = scanNumberFreeJson(Uint8List.fromList(utf8.encode('{"\\ue400":"b","𐀀":"a"}'))) as AuditV3Success<AuditV3Value>;
    expect((scalar.value as AuditV3Object).entries.map((entry) => entry.key), ['\ue400', '𐀀']);
  });
  test('applies phase precedence without partial output', () {
    final duplicate = scanNumberFreeJson(Uint8List.fromList(utf8.encode('{"a":1,"\\u0061":2}')));
    expect(duplicate, const AuditV3Failure<AuditV3Value>(AuditV3Error(auditV3DuplicateKey, 7)));
    expect(duplicate, isNot(isA<AuditV3Success<AuditV3Value>>()));
    expect(scanNumberFreeJson(Uint8List.fromList(utf8.encode('[1,2]'))), const AuditV3Failure<AuditV3Value>(AuditV3Error(auditV3NumberForbidden, 1)));
  });
  test('reports incomplete containers at the EOF byte offset', () {
    expect(scanNumberFreeJson(Uint8List.fromList(utf8.encode('[null'))), const AuditV3Failure<AuditV3Value>(AuditV3Error(auditV3InvalidJson, 5)));
    expect(scanNumberFreeJson(Uint8List.fromList(utf8.encode('{"a"'))), const AuditV3Failure<AuditV3Value>(AuditV3Error(auditV3InvalidJson, 4)));
  });
  test('large valid numeric array does not throw or overflow the stack', () {
    final raw = Uint8List.fromList(utf8.encode('[${'0,' * 199999}0]'));
    expect(() => scanNumberFreeJson(raw), returnsNormally);
    expect(scanNumberFreeJson(raw), const AuditV3Failure<AuditV3Value>(AuditV3Error(auditV3NumberForbidden, 1)));
  });
}
