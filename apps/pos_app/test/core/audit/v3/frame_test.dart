import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/audit/v3/frame.dart';
import 'package:pos_app/core/audit/v3/types.dart';

typedef Json = Map<String, Object?>;
final fixture = File('../../fixtures/audit/v3/frames.jsonl');
Json object(Object? value) => Map<String, Object?>.from(value! as Map);
int integer(Object? value) => value! as int;
String hex(List<int> bytes) => bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
List<Json> rows() => fixture.readAsLinesSync().where((line) => line.isNotEmpty).map((line) => object(jsonDecode(line))).toList();
FieldState state(Object? value) {
  final field = object(value);
  return switch (field['state']) {
    'absent' => const FieldState.absent(),
    'null' => const FieldState.nil(),
    'text' => FieldState.text(field['value']! as String),
    _ => throw const FormatException('invalid field state'),
  };
}

AuditV3FrameFields base() => const AuditV3FrameFields(
  userId: 'u', resolvedAction: 'LOGOUT', deviceId: 'd', timestamp: '2026-07-21T00:00:00Z',
  sequenceNo: '0', prevHash: 'h', metodoAutorizacion: FieldState.absent(), usuarioAutorizadorId: FieldState.absent(),
);
String text(Object? value) => value is Map ? 'a' * integer(value[r'$repeat_text']) : value! as String;
AuditV3Result<Uint8List> materialize(Json row) {
  final source = object(row['fields']);
  try {
    final defaults = base();
    final fields = AuditV3FrameFields(
      userId: source.containsKey('user_id') ? text(source['user_id']) : defaults.userId,
      resolvedAction: source.containsKey('resolved_action') ? text(source['resolved_action']) : defaults.resolvedAction,
      deviceId: source.containsKey('device_id') ? text(source['device_id']) : defaults.deviceId,
      timestamp: source.containsKey('timestamp') ? text(source['timestamp']) : defaults.timestamp,
      sequenceNo: source.containsKey('sequence_no') ? text(source['sequence_no']) : defaults.sequenceNo,
      prevHash: source.containsKey('prev_hash') ? text(source['prev_hash']) : defaults.prevHash,
      metodoAutorizacion: source.containsKey('metodo_autorizacion') ? state(source['metodo_autorizacion']) : defaults.metodoAutorizacion,
      usuarioAutorizadorId: source.containsKey('usuario_autorizador_id') ? state(source['usuario_autorizador_id']) : defaults.usuarioAutorizadorId,
    );
    final recipe = row['metadata'] == null ? null : object(row['metadata']);
    if (recipe == null) return const AuditV3Failure(AuditV3Error(auditV3FrameInvalid, 8));
    final metadata = recipe['repeat'] == null
        ? Uint8List.fromList([for (var i = 0; i < (recipe['hex']! as String).length; i += 2) int.parse((recipe['hex']! as String).substring(i, i + 2), radix: 16)])
        : Uint8List.fromList(List<int>.filled(integer(object(recipe['repeat'])['count']), integer(object(recipe['repeat'])['byte'])));
    return buildAuditV3Frame(fields, metadata);
  } on TypeError catch (_) {
    var index = ['user_id', 'resolved_action', 'device_id', 'timestamp', 'sequence_no', 'prev_hash'].indexWhere((key) => source.containsKey(key) && source[key] is! String && source[key] is! Map);
    if (index < 0) index = source.containsKey('metodo_autorizacion') ? 6 : 7;
    return AuditV3Failure(AuditV3Error(auditV3FrameInvalid, index));
  } on FormatException catch (_) {
    final index = source.containsKey('metodo_autorizacion') ? 6 : 7;
    return AuditV3Failure(AuditV3Error(auditV3FrameInvalid, index));
  }
}

void main() {
  test('F001-F024 match exact or compact frame authority without digests', () {
    final fixtures = rows();
    expect(fixtures.map((row) => row['id']), [for (var i = 1; i <= 24; i++) 'F${i.toString().padLeft(3, '0')}']);
    for (final row in fixtures) {
      final result = materialize(row);
      if (row['expected_error'] case final Object expected) {
        final error = object(expected);
        expect(result, AuditV3Failure<Uint8List>(AuditV3Error(error['code']! as String, integer(error['offset']))), reason: row['id']! as String);
      } else {
        final bytes = (result as AuditV3Success<Uint8List>).value;
        if (row['frame_hex'] case final String exact) expect(hex(bytes), exact, reason: row['id']! as String);
        if (row['frame_proof'] case final Object value) {
          final proof = object(value);
          expect(bytes.length, integer(proof['length']));
          expect(hex(bytes.sublist(0, 16)), proof['prefix_hex']);
          expect(hex(bytes.sublist(bytes.length - 16)), proof['suffix_hex']);
        }
      }
    }
  });

  test('encodes states, big-endian lengths, metadata, and deterministic bytes', () {
    final fields = AuditV3FrameFields(
      userId: '😀', resolvedAction: 'A', deviceId: '', timestamp: 'T', sequenceNo: '0', prevHash: '',
      metodoAutorizacion: const FieldState.nil(), usuarioAutorizadorId: const FieldState.text(''),
    );
    final first = buildAuditV3Frame(fields, Uint8List.fromList(utf8.encode('{}')));
    final second = buildAuditV3Frame(fields, Uint8List.fromList(utf8.encode('{}')));
    expect((first as AuditV3Success<Uint8List>).value, (second as AuditV3Success<Uint8List>).value);
    expect(hex(first.value.sublist(0, 13)), '4f4641330100000004f09f9880');
    expect(hex(first.value.sublist(first.value.length - 17)), '0300000000010000000002000000027b7d');
  });

  test('validates required values, sequence bounds, Unicode, and no partial bytes', () {
    for (final value in ['0', '4294967295']) {
      expect(buildAuditV3Frame(base().copyWith(sequenceNo: value), Uint8List(0)), isA<AuditV3Success<Uint8List>>());
    }
    for (final value in ['', '-1', '01', '4294967296']) {
      expect(buildAuditV3Frame(base().copyWith(sequenceNo: value), Uint8List(0)), const AuditV3Failure<Uint8List>(AuditV3Error(auditV3FrameInvalid, 4)));
    }
    expect(buildAuditV3Frame(base().copyWith(resolvedAction: ''), Uint8List(0)), const AuditV3Failure<Uint8List>(AuditV3Error(auditV3FrameInvalid, 1)));
    expect(buildAuditV3Frame(base().copyWith(timestamp: ''), Uint8List(0)), const AuditV3Failure<Uint8List>(AuditV3Error(auditV3FrameInvalid, 3)));
    expect(buildAuditV3Frame(base().copyWith(userId: '\ud800'), Uint8List(0)), const AuditV3Failure<Uint8List>(AuditV3Error(auditV3FrameInvalid, 0)));
    expect(buildAuditV3Frame(base().copyWith(userId: '\udc00'), Uint8List(0)), const AuditV3Failure<Uint8List>(AuditV3Error(auditV3FrameInvalid, 0)));
  });
}
