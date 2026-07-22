import 'dart:typed_data';

import 'types.dart';

const _max = 1048576;
final class _Failure implements Exception {
  final String code;
  final int offset;
  const _Failure(this.code, this.offset);
}
Never _fail(String code, int offset) => throw _Failure(code, offset);

({String source, List<int> offsets}) _decode(Uint8List raw) {
  final units = <int>[]; final offsets = <int>[];
  for (var i = 0; i < raw.length;) {
    final lead = raw[i];
    if (lead < 0x80) { units.add(lead); offsets.add(i++); continue; }
    int remaining; int scalar; int minimum;
    if (lead >= 0xc2 && lead <= 0xdf) { remaining = 1; scalar = lead & 31; minimum = 0x80; }
    else if (lead >= 0xe0 && lead <= 0xef) { remaining = 2; scalar = lead & 15; minimum = 0x800; }
    else if (lead >= 0xf0 && lead <= 0xf4) { remaining = 3; scalar = lead & 7; minimum = 0x10000; }
    else { _fail(auditV3InvalidUtf8, i); }
    if (i + remaining >= raw.length) _fail(auditV3InvalidUtf8, i);
    for (var j = 1; j <= remaining; j++) {
      final next = raw[i + j]; if (next & 0xc0 != 0x80) _fail(auditV3InvalidUtf8, i + j);
      scalar = (scalar << 6) | (next & 63);
    }
    if (scalar < minimum || scalar >= 0xd800 && scalar <= 0xdfff || scalar > 0x10ffff) _fail(auditV3InvalidUtf8, i);
    final width = remaining + 1;
    if (scalar <= 0xffff) { units.add(scalar); offsets.add(i); }
    else { scalar -= 0x10000; units.addAll([0xd800 | scalar >> 10, 0xdc00 | scalar & 0x3ff]); offsets.addAll([i, i]); }
    i += width;
  }
  offsets.add(raw.length); return (source: String.fromCharCodes(units), offsets: offsets);
}

final class _Frame {
  final bool object;
  final int depth;
  final List<AuditV3Value> values = [];
  final List<AuditV3ObjectEntry> entries = [];
  final Set<String> seen = {};
  int count = 0;
  bool afterValue = false;
  _Frame(this.object, this.depth);
}

AuditV3Result<AuditV3Value> scanNumberFreeJson(Uint8List rawUtf8) {
  try {
    if (rawUtf8.length > _max) _fail(auditV3LimitExceeded, _max);
    final decoded = _decode(rawUtf8); final source = decoded.source; final offsets = decoded.offsets;
    var position = 0; final unicode = <int>[]; final duplicates = <int>[]; final limits = <int>[]; int? numberOffset;
    int offset(int index) => index >= source.length ? rawUtf8.length : offsets[index];
    void whitespace() { while (position < source.length && ' \n\r\t'.contains(source[position])) { position++; } }
    ({String value, int start}) string() {
      final start = offset(position++); final output = StringBuffer();
      while (position < source.length) {
        var character = source[position++]; if (character == '"') return (value: output.toString(), start: start);
        if (character.codeUnitAt(0) < 32) _fail(auditV3InvalidJson, offset(position - 1));
        if (character != r'\') { output.write(character); continue; }
        final slash = offset(position - 1); if (position >= source.length) _fail(auditV3InvalidJson, rawUtf8.length);
        character = source[position++]; const escaped = {'"':'"', r'\':r'\', '/':'/', 'b':'\b', 'f':'\f', 'n':'\n', 'r':'\r', 't':'\t'};
        if (escaped.containsKey(character)) { output.write(escaped[character]); continue; }
        if (character != 'u') _fail(auditV3InvalidJson, offset(position - 1));
        var bad = 0; while (bad < 4 && position + bad < source.length && RegExp(r'[0-9a-fA-F]').hasMatch(source[position + bad])) { bad++; }
        if (bad < 4) _fail(auditV3InvalidJson, offset(position + bad));
        final first = int.parse(source.substring(position, position + 4), radix: 16); position += 4;
        if (first >= 0xd800 && first <= 0xdbff) {
          if (position + 6 <= source.length && source.substring(position, position + 2) == r'\u' && RegExp(r'^[0-9a-fA-F]{4}$').hasMatch(source.substring(position + 2, position + 6))) {
            final second = int.parse(source.substring(position + 2, position + 6), radix: 16);
            if (second >= 0xdc00 && second <= 0xdfff) { output.writeCharCode(0x10000 + ((first - 0xd800) << 10) + second - 0xdc00); position += 6; continue; }
          }
          unicode.add(slash); output.writeCharCode(0xfffd);
        } else if (first >= 0xdc00 && first <= 0xdfff) { unicode.add(slash); output.writeCharCode(0xfffd); }
        else { output.writeCharCode(first); }
      }
      _fail(auditV3InvalidJson, rawUtf8.length);
    }
    final stack = <_Frame>[];
    AuditV3Value value(int depth) {
      whitespace(); final start = offset(position); if (depth > 64) limits.add(start);
      final character = position < source.length ? source[position] : '';
      if (character == '"') return AuditV3String(string().value);
      if (source.startsWith('true', position)) { position += 4; return const AuditV3Boolean(true); }
      if (source.startsWith('false', position)) { position += 5; return const AuditV3Boolean(false); }
      if (source.startsWith('null', position)) { position += 4; return const AuditV3Null(); }
      if (character == '-' || character.isNotEmpty && character.codeUnitAt(0) >= 48 && character.codeUnitAt(0) <= 57) {
        bool digitAt(int index) => index < source.length && source.codeUnitAt(index) >= 48 && source.codeUnitAt(index) <= 57;
        if (character == '-') position++;
        if (!digitAt(position)) _fail(auditV3InvalidJson, offset(position));
        if (source.codeUnitAt(position) == 48) { position++; }
        else { while (digitAt(position)) { position++; } }
        if (position < source.length && source.codeUnitAt(position) == 46) {
          position++; if (!digitAt(position)) _fail(auditV3InvalidJson, offset(position));
          while (digitAt(position)) { position++; }
        }
        if (position < source.length && (source.codeUnitAt(position) == 69 || source.codeUnitAt(position) == 101)) {
          position++;
          if (position < source.length && (source.codeUnitAt(position) == 43 || source.codeUnitAt(position) == 45)) position++;
          if (!digitAt(position)) _fail(auditV3InvalidJson, offset(position));
          while (digitAt(position)) { position++; }
        }
        numberOffset ??= start; return const AuditV3Null();
      }
      if (character == '[' || character == '{') {
        position++; final frame = _Frame(character == '{', depth); stack.add(frame);
        return frame.object ? AuditV3Object(frame.entries) : AuditV3Array(frame.values);
      }
      _fail(auditV3InvalidJson, position >= source.length ? rawUtf8.length : start);
    }
    whitespace(); final root = value(0);
    while (stack.isNotEmpty) {
      final frame = stack.last; whitespace(); final close = frame.object ? '}' : ']';
      if (frame.afterValue) {
        if (position < source.length && source[position] == close) { position++; stack.removeLast(); continue; }
        if (position >= source.length || source[position++] != ',') _fail(auditV3InvalidJson, offset(position - 1));
        frame.afterValue = false; whitespace();
      } else if (frame.count == 0 && position < source.length && source[position] == close) { position++; stack.removeLast(); continue; }
      final crossing = offset(position); frame.count++; if (frame.count > 10000) limits.add(crossing);
      if (!frame.object) { frame.values.add(value(frame.depth + 1)); }
      else {
        if (position >= source.length || source[position] != '"') _fail(auditV3InvalidJson, position >= source.length ? rawUtf8.length : offset(position));
        final key = string(); if (!frame.seen.add(key.value)) duplicates.add(key.start);
        whitespace(); if (position >= source.length || source[position++] != ':') _fail(auditV3InvalidJson, offset(position - 1));
        frame.entries.add(AuditV3ObjectEntry(key.value, value(frame.depth + 1)));
      }
      frame.afterValue = true;
    }
    whitespace(); if (position != source.length) _fail(auditV3InvalidJson, offset(position));
    void candidate(String code, List<int> values) { if (values.isNotEmpty) _fail(code, values.reduce((a, b) => a < b ? a : b)); }
    candidate(auditV3InvalidUnicode, unicode); candidate(auditV3DuplicateKey, duplicates);
    if (numberOffset != null) _fail(auditV3NumberForbidden, numberOffset!); candidate(auditV3LimitExceeded, limits);
    return AuditV3Success(root);
  } on _Failure catch (error) { return AuditV3Failure(AuditV3Error(error.code, error.offset)); }
}
