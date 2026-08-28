import 'dart:collection';

const auditV3InvalidUtf8 = 'AUDIT_V3_INVALID_UTF8';
const auditV3InvalidJson = 'AUDIT_V3_INVALID_JSON';
const auditV3InvalidUnicode = 'AUDIT_V3_INVALID_UNICODE';
const auditV3DuplicateKey = 'AUDIT_V3_DUPLICATE_KEY';
const auditV3NumberForbidden = 'AUDIT_V3_NUMBER_FORBIDDEN';
const auditV3LimitExceeded = 'AUDIT_V3_LIMIT_EXCEEDED';
const auditV3FrameInvalid = 'AUDIT_V3_FRAME_INVALID';
const auditV3FrameTooLarge = 'AUDIT_V3_FRAME_TOO_LARGE';

final class AuditV3Error {
  final String code;
  final int offset;
  const AuditV3Error(this.code, this.offset);
  @override
  bool operator ==(Object other) => other is AuditV3Error && other.code == code && other.offset == offset;
  @override
  int get hashCode => Object.hash(code, offset);
}

sealed class AuditV3Result<T> { const AuditV3Result(); }
final class AuditV3Success<T> extends AuditV3Result<T> {
  final T value;
  const AuditV3Success(this.value);
}
final class AuditV3Failure<T> extends AuditV3Result<T> {
  final AuditV3Error error;
  const AuditV3Failure(this.error);
  @override
  bool operator ==(Object other) => other is AuditV3Failure<T> && other.error == error;
  @override
  int get hashCode => error.hashCode;
}

sealed class AuditV3Value { const AuditV3Value(); }
final class AuditV3Null extends AuditV3Value { const AuditV3Null(); }
final class AuditV3Boolean extends AuditV3Value {
  final bool value;
  const AuditV3Boolean(this.value);
}
final class AuditV3String extends AuditV3Value {
  final String value;
  const AuditV3String(this.value);
}
final class AuditV3Array extends AuditV3Value {
  final List<AuditV3Value> values;
  AuditV3Array(List<AuditV3Value> values) : values = UnmodifiableListView(values);
}
final class AuditV3ObjectEntry {
  final String key;
  final AuditV3Value value;
  const AuditV3ObjectEntry(this.key, this.value);
}
final class AuditV3Object extends AuditV3Value {
  final List<AuditV3ObjectEntry> entries;
  AuditV3Object(List<AuditV3ObjectEntry> entries) : entries = UnmodifiableListView(entries);
}
