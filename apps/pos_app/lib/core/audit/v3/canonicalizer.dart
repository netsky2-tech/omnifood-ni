import 'dart:convert';
import 'dart:typed_data';

import 'scanner.dart';
import 'types.dart';

const _maxBytes = 1048576;
const _chunkUnits = 8192;

final class _Writer {
  final chunks = <Uint8List>[];
  var length = 0;
  var exceeded = false;

  void write(String text) {
    for (var start = 0; start < text.length && !exceeded;) {
      var end = (start + _chunkUnits).clamp(0, text.length);
      if (end < text.length && _isHighSurrogate(text.codeUnitAt(end - 1))) end--;
      final chunk = Uint8List.fromList(utf8.encode(text.substring(start, end)));
      if (length + chunk.length > _maxBytes) { exceeded = true; return; }
      chunks.add(chunk); length += chunk.length; start = end;
    }
  }

  Uint8List finish() {
    final output = Uint8List(length); var offset = 0;
    for (final chunk in chunks) { output.setRange(offset, offset + chunk.length, chunk); offset += chunk.length; }
    return output;
  }
}

bool _isHighSurrogate(int unit) => unit >= 0xd800 && unit <= 0xdbff;
int _compareUtf16(String left, String right) {
  final shared = left.length < right.length ? left.length : right.length;
  for (var i = 0; i < shared; i++) {
    final difference = left.codeUnitAt(i) - right.codeUnitAt(i);
    if (difference != 0) return difference;
  }
  return left.length - right.length;
}

final class _Text {
  final String value;
  const _Text(this.value);
}
final class _Escaped {
  final String value;
  const _Escaped(this.value);
}

void _writeEscaped(_Writer writer, String value) {
  const escapes = {'"': r'\"', r'\': r'\\', '\b': r'\b', '\f': r'\f', '\n': r'\n', '\r': r'\r', '\t': r'\t'};
  writer.write('"'); var run = 0;
  for (var index = 0; index < value.length; index++) {
    final character = value[index]; final unit = value.codeUnitAt(index);
    final replacement = escapes[character] ?? (unit < 0x20 ? '\\u00${unit.toRadixString(16).padLeft(2, '0')}' : null);
    if (replacement == null) continue;
    writer.write(value.substring(run, index)); writer.write(replacement); run = index + 1;
  }
  writer.write(value.substring(run)); writer.write('"');
}

AuditV3Result<Uint8List> canonicalizeNumberFreeJson(Uint8List rawUtf8) {
  final scanned = scanNumberFreeJson(rawUtf8);
  if (scanned case AuditV3Failure<AuditV3Value>(:final error)) return AuditV3Failure(error);
  final root = (scanned as AuditV3Success<AuditV3Value>).value;
  final writer = _Writer(); final stack = <Object>[root];
  while (stack.isNotEmpty && !writer.exceeded) {
    final action = stack.removeLast();
    if (action is _Text) { writer.write(action.value); continue; }
    if (action is _Escaped) { _writeEscaped(writer, action.value); continue; }
    if (action is AuditV3Null) { writer.write('null'); continue; }
    if (action is AuditV3Boolean) { writer.write(action.value ? 'true' : 'false'); continue; }
    if (action is AuditV3String) { _writeEscaped(writer, action.value); continue; }
    final values = <Object>[];
    if (action is AuditV3Array) {
      for (var i = 0; i < action.values.length; i++) { if (i != 0) values.add(const _Text(',')); values.add(action.values[i]); }
      stack.addAll([const _Text(']'), ...values.reversed, const _Text('[')]);
    } else if (action is AuditV3Object) {
      final entries = [...action.entries]..sort((a, b) => _compareUtf16(a.key, b.key));
      for (var i = 0; i < entries.length; i++) {
        if (i != 0) values.add(const _Text(','));
        values.addAll([_Escaped(entries[i].key), const _Text(':'), entries[i].value]);
      }
      stack.addAll([const _Text('}'), ...values.reversed, const _Text('{')]);
    }
  }
  if (writer.exceeded) return const AuditV3Failure(AuditV3Error(auditV3LimitExceeded, _maxBytes));
  return AuditV3Success(writer.finish());
}
