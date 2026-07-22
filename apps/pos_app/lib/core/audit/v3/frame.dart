import 'dart:convert';
import 'dart:typed_data';

import 'types.dart';

const _maxBytes = 1048576;

sealed class FieldState {
  const FieldState();
  const factory FieldState.absent() = _Absent;
  const factory FieldState.nil() = _Nil;
  const factory FieldState.text(String value) = _Text;
}

final class _Absent extends FieldState { const _Absent(); }
final class _Nil extends FieldState { const _Nil(); }
final class _Text extends FieldState {
  final String value;
  const _Text(this.value);
}

final class AuditV3FrameFields {
  final String userId;
  final String resolvedAction;
  final String deviceId;
  final String timestamp;
  final String sequenceNo;
  final String prevHash;
  final FieldState metodoAutorizacion;
  final FieldState usuarioAutorizadorId;

  const AuditV3FrameFields({
    required this.userId,
    required this.resolvedAction,
    required this.deviceId,
    required this.timestamp,
    required this.sequenceNo,
    required this.prevHash,
    required this.metodoAutorizacion,
    required this.usuarioAutorizadorId,
  });

  AuditV3FrameFields copyWith({
    String? userId, String? resolvedAction, String? deviceId, String? timestamp,
    String? sequenceNo, String? prevHash, FieldState? metodoAutorizacion, FieldState? usuarioAutorizadorId,
  }) => AuditV3FrameFields(
    userId: userId ?? this.userId, resolvedAction: resolvedAction ?? this.resolvedAction,
    deviceId: deviceId ?? this.deviceId, timestamp: timestamp ?? this.timestamp,
    sequenceNo: sequenceNo ?? this.sequenceNo, prevHash: prevHash ?? this.prevHash,
    metodoAutorizacion: metodoAutorizacion ?? this.metodoAutorizacion,
    usuarioAutorizadorId: usuarioAutorizadorId ?? this.usuarioAutorizadorId,
  );
}

final class _Part {
  final int tag;
  final Uint8List bytes;
  final int index;
  const _Part(this.tag, this.bytes, this.index);
}

bool _validUnicode(String value) {
  final units = value.codeUnits;
  for (var i = 0; i < units.length; i++) {
    final unit = units[i];
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (++i >= units.length || units[i] < 0xdc00 || units[i] > 0xdfff) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

AuditV3Result<Uint8List> buildAuditV3Frame(
  AuditV3FrameFields fields,
  Uint8List canonicalMetadata,
) {
  final values = [fields.userId, fields.resolvedAction, fields.deviceId, fields.timestamp, fields.sequenceNo, fields.prevHash];
  final parts = <_Part>[];
  for (var index = 0; index < values.length; index++) {
    final value = values[index];
    if (!_validUnicode(value) || ((index == 1 || index == 3) && value.isEmpty)) {
      return AuditV3Failure(AuditV3Error(auditV3FrameInvalid, index));
    }
    if (index == 4 && (!RegExp(r'^(?:0|[1-9][0-9]*)$').hasMatch(value) || BigInt.parse(value) > BigInt.from(0xffffffff))) {
      return const AuditV3Failure(AuditV3Error(auditV3FrameInvalid, 4));
    }
    parts.add(_Part(0x01, Uint8List.fromList(utf8.encode(value)), index));
  }
  for (final (index, field) in [(6, fields.metodoAutorizacion), (7, fields.usuarioAutorizadorId)]) {
    switch (field) {
      case _Absent(): parts.add(_Part(0x00, Uint8List(0), index));
      case _Nil(): parts.add(_Part(0x03, Uint8List(0), index));
      case _Text(:final value):
        if (!_validUnicode(value)) return AuditV3Failure(AuditV3Error(auditV3FrameInvalid, index));
        parts.add(_Part(0x01, Uint8List.fromList(utf8.encode(value)), index));
    }
  }
  parts.add(_Part(0x02, canonicalMetadata, 8));
  var size = 4;
  for (final part in parts) {
    if (part.bytes.length > _maxBytes) return AuditV3Failure(AuditV3Error(auditV3FrameTooLarge, part.index));
    size += 5 + part.bytes.length;
  }
  if (size > _maxBytes) return const AuditV3Failure(AuditV3Error(auditV3FrameTooLarge, 9));

  final output = Uint8List(size);
  output.setAll(0, const [0x4f, 0x46, 0x41, 0x33]);
  final data = ByteData.sublistView(output);
  var offset = 4;
  for (final part in parts) {
    output[offset] = part.tag;
    data.setUint32(offset + 1, part.bytes.length, Endian.big);
    output.setAll(offset + 5, part.bytes);
    offset += 5 + part.bytes.length;
  }
  return AuditV3Success(output);
}
