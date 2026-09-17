/// Stable OHAC contract error codes.
///
/// Framework-free on purpose: domain and application layers import these
/// without depending on NestJS, TypeORM, Floor, Dio or bcrypt. Wire values are
/// frozen because backend and POS must reject with the identical stable code.
abstract final class OhacErrorCode {
  static const invalidUtf8 = 'OHAC_INVALID_UTF8';
  static const invalidJson = 'OHAC_INVALID_JSON';
  static const invalidUnicode = 'OHAC_INVALID_UNICODE';
  static const duplicateKey = 'OHAC_DUPLICATE_KEY';
  static const numberForbidden = 'OHAC_NUMBER_FORBIDDEN';
  static const nullForbidden = 'OHAC_NULL_FORBIDDEN';
  static const limitExceeded = 'OHAC_LIMIT_EXCEEDED';
  static const unknownField = 'OHAC_UNKNOWN_FIELD';
  static const missingField = 'OHAC_MISSING_FIELD';
  static const invalidField = 'OHAC_INVALID_FIELD';
  static const unsupportedSchema = 'OHAC_UNSUPPORTED_SCHEMA';
  static const digestMismatch = 'OHAC_DIGEST_MISMATCH';
  static const tenantScopeMismatch = 'OHAC_TENANT_SCOPE_MISMATCH';
  static const sequenceNotNewer = 'OHAC_SEQUENCE_NOT_NEWER';
  static const unsupportedBuildPair = 'OHAC_UNSUPPORTED_BUILD_PAIR';
  static const credentialBindingMismatch = 'OHAC_CREDENTIAL_BINDING_MISMATCH';
  static const tenantTerminalMismatch = 'OHAC_TENANT_TERMINAL_MISMATCH';
}

/// Stable OHAC failure: code plus optional non-secret context such as a field
/// name. Never PIN or verifier material.
final class OhacError {
  final String code;
  final String? field;

  const OhacError(this.code, [this.field]);

  @override
  bool operator ==(Object other) =>
      other is OhacError && other.code == code && other.field == field;

  @override
  int get hashCode => Object.hash(code, field);

  @override
  String toString() =>
      field == null ? 'OhacError($code)' : 'OhacError($code, $field)';
}

/// Discriminated result mirroring the TypeScript `OhacResult<T>` union so both
/// runtimes share the same validation/error semantics.
sealed class OhacResult<T> {
  const OhacResult();

  bool get ok;
}

final class OhacSuccess<T> extends OhacResult<T> {
  final T value;

  const OhacSuccess(this.value);

  @override
  bool get ok => true;
}

final class OhacFailure<T> extends OhacResult<T> {
  final OhacError error;

  const OhacFailure(this.error);

  @override
  bool get ok => false;
}

/// Rewraps a failure into `R`'s result type, or returns `null` when `result`
/// is a success. This keeps cross-type failure propagation explicit and
/// type-safe at every call site.
OhacFailure<R>? ohacFailureAs<R>(OhacResult<dynamic> result) =>
    result is OhacFailure ? OhacFailure<R>(result.error) : null;
