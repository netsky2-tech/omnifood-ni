import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:pos_app/core/audit/v3/canonicalizer.dart';
import 'package:pos_app/core/audit/v3/frame.dart';
import 'package:pos_app/core/audit/v3/sha256.dart';
import 'package:pos_app/core/audit/v3/types.dart';

typedef Json = Map<String, Object?>;
Json object(Object? value) => Map<String, Object?>.from(value! as Map);
int integer(Object? value) => value! as int;
List<Json> rows(String path) => File(path).readAsLinesSync().where((line) => line.isNotEmpty).map((line) => object(jsonDecode(line))).toList();
Uint8List bytes(Object? value) {
  final recipe = object(value);
  if (recipe['hex'] case final String hex) return Uint8List.fromList([for (var i = 0; i < hex.length; i += 2) int.parse(hex.substring(i, i + 2), radix: 16)]);
  if (recipe['repeat'] case final Object repeated) {
    final item = object(repeated);
    return Uint8List.fromList(List<int>.filled(integer(item['count']), integer(item['byte'])));
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
String text(Object? value) => value is Map ? 'a' * integer(value[r'$repeat_text']) : value! as String;
FieldState state(Object? value) => switch (object(value)) {
  {'state': 'absent'} => const FieldState.absent(),
  {'state': 'null'} => const FieldState.nil(),
  {'state': 'text', 'value': final String value} => FieldState.text(value),
  _ => throw const FormatException('invalid field state'),
};
AuditV3Result<Uint8List> frame(Json row) {
  final source = object(row['fields']);
  if (row['metadata'] == null) return const AuditV3Failure(AuditV3Error(auditV3FrameInvalid, 8));
  String value(String key, String fallback) => source.containsKey(key) ? text(source[key]) : fallback;
  try {
    return buildAuditV3Frame(AuditV3FrameFields(
      userId: value('user_id', 'u'), resolvedAction: value('resolved_action', 'LOGOUT'),
      deviceId: value('device_id', 'd'), timestamp: value('timestamp', '2026-07-21T00:00:00Z'),
      sequenceNo: value('sequence_no', '0'), prevHash: value('prev_hash', 'h'),
      metodoAutorizacion: source.containsKey('metodo_autorizacion') ? state(source['metodo_autorizacion']) : const FieldState.absent(),
      usuarioAutorizadorId: source.containsKey('usuario_autorizador_id') ? state(source['usuario_autorizador_id']) : const FieldState.absent(),
    ), bytes(row['metadata']));
  } on TypeError catch (_) {
    var index = ['user_id', 'resolved_action', 'device_id', 'timestamp', 'sequence_no', 'prev_hash'].indexWhere((key) => source.containsKey(key) && source[key] is! String && source[key] is! Map);
    if (index < 0) index = source.containsKey('metodo_autorizacion') ? 6 : 7;
    return AuditV3Failure(AuditV3Error(auditV3FrameInvalid, index));
  } on FormatException catch (_) {
    return AuditV3Failure(AuditV3Error(auditV3FrameInvalid, source.containsKey('metodo_autorizacion') ? 6 : 7));
  }
}
Json output(String id, AuditV3Result<Uint8List> result, [bool digest = false]) => switch (result) {
  AuditV3Success(:final value) => {'id': id, 'output': 'bytes:${base64Encode(value)}${digest ? ';sha256:${sha256LowerHex(value)}' : ''}'},
  AuditV3Failure(:final error) => {'id': id, 'output': 'error:${error.code}@${error.offset}'},
};
void main(List<String> args) {
  final root = args.single;
  final fixture = '$root/fixtures/audit/v3';
  final valid = rows('$fixture/canonical-valid.jsonl');
  final rejected = rows('$fixture/rejections.jsonl');
  final frames = rows('$fixture/frames.jsonl');
  stdout.write(jsonEncode(<Json>[
    for (final row in [...valid, ...rejected]) output(row['id']! as String, canonicalizeNumberFreeJson(bytes(row['raw']))),
    for (final row in frames) output(row['id']! as String, frame(row), true),
  ]));
}
