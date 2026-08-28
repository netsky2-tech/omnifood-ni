import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/audit/v3/frame.dart';
import 'package:pos_app/core/audit/v3/sha256.dart';
import 'package:pos_app/core/audit/v3/types.dart';

typedef Json = Map<String, Object?>;

final fixture = File('../../fixtures/audit/v3/frames.jsonl');

Json object(Object? value) => Map<String, Object?>.from(value! as Map);
int integer(Object? value) => value! as int;
Uint8List decodeHex(String value) => Uint8List.fromList([
  for (var index = 0; index < value.length; index += 2)
    int.parse(value.substring(index, index + 2), radix: 16),
]);

List<Json> rows() => fixture
    .readAsLinesSync()
    .where((line) => line.isNotEmpty)
    .map((line) => object(jsonDecode(line)))
    .toList();

FieldState state(Object? value) {
  final field = object(value);
  return switch (field['state']) {
    'absent' => const FieldState.absent(),
    'null' => const FieldState.nil(),
    'text' => FieldState.text(field['value']! as String),
    _ => throw const FormatException('invalid field state'),
  };
}

String text(Object? value) =>
    value is Map ? 'a' * integer(value[r'$repeat_text']) : value! as String;

Uint8List materializeFrame(Json row) {
  if (row['frame_hex'] case final String exact) return decodeHex(exact);

  final source = object(row['fields']);
  final fields = AuditV3FrameFields(
    userId: source.containsKey('user_id') ? text(source['user_id']) : 'u',
    resolvedAction: source.containsKey('resolved_action')
        ? text(source['resolved_action'])
        : 'LOGOUT',
    deviceId: source.containsKey('device_id') ? text(source['device_id']) : 'd',
    timestamp: source.containsKey('timestamp')
        ? text(source['timestamp'])
        : '2026-07-21T00:00:00Z',
    sequenceNo: source.containsKey('sequence_no')
        ? text(source['sequence_no'])
        : '0',
    prevHash: source.containsKey('prev_hash') ? text(source['prev_hash']) : 'h',
    metodoAutorizacion: source.containsKey('metodo_autorizacion')
        ? state(source['metodo_autorizacion'])
        : const FieldState.absent(),
    usuarioAutorizadorId: source.containsKey('usuario_autorizador_id')
        ? state(source['usuario_autorizador_id'])
        : const FieldState.absent(),
  );
  final metadata = decodeHex(object(row['metadata'])['hex']! as String);
  return (buildAuditV3Frame(fields, metadata) as AuditV3Success<Uint8List>)
      .value;
}

void main() {
  test('hashes every successful F001-F024 frame and skips rejections', () {
    final fixtures = rows();
    expect(fixtures.map((row) => row['id']), [
      for (var index = 1; index <= 24; index++)
        'F${index.toString().padLeft(3, '0')}',
    ]);

    var successes = 0;
    var rejections = 0;
    for (final row in fixtures) {
      if (row['expected_error'] != null) {
        rejections++;
        continue;
      }
      successes++;
      expect(
        sha256LowerHex(materializeFrame(row)),
        row['sha256'],
        reason: row['id']! as String,
      );
    }
    expect((successes, rejections), (9, 15));
  });

  test('hashes empty bytes and a known SHA-256 vector', () {
    expect(
      sha256LowerHex(Uint8List(0)),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(
      sha256LowerHex(Uint8List.fromList(utf8.encode('abc'))),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('is deterministic, lowercase, fixed-length, and input-immutable', () {
    final input = Uint8List.fromList([0, 1, 2, 127, 128, 255]);
    final before = Uint8List.fromList(input);
    final first = sha256LowerHex(input);

    expect(sha256LowerHex(input), first);
    expect(first, hasLength(64));
    expect(first, matches(RegExp(r'^[0-9a-f]{64}$')));
    expect(input, before);
  });
}
