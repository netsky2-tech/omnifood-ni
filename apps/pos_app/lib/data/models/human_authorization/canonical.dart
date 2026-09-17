import 'dart:convert';
import 'dart:typed_data';

import 'package:pos_app/core/audit/v3/canonicalizer.dart' as audit;
import 'package:pos_app/core/audit/v3/scanner.dart' as audit;
import 'package:pos_app/core/audit/v3/sha256.dart' as audit;
import 'package:pos_app/core/audit/v3/types.dart' as audit;

import 'error_codes.dart';
import 'field_guards.dart';

/// Maps the shared audit-v3 scanner/canonicalizer codes onto the stable OHAC
/// codes so both runtimes reject the same byte-level problems identically.
///
/// Audit-v3 represents its codes as plain strings, so Dart cannot prove this
/// switch exhaustive at compile time. Every currently supported audit-v3 code
/// is therefore listed explicitly, and an unmapped future code throws instead
/// of silently degrading to OHAC_INVALID_JSON. The full mapping is pinned in
/// `canonical_test.dart`; extend both together when a new audit-v3 code ships.
String auditV3CodeToOhac(String auditCode) => switch (auditCode) {
      audit.auditV3InvalidUtf8 => OhacErrorCode.invalidUtf8,
      audit.auditV3InvalidJson => OhacErrorCode.invalidJson,
      audit.auditV3InvalidUnicode => OhacErrorCode.invalidUnicode,
      audit.auditV3DuplicateKey => OhacErrorCode.duplicateKey,
      audit.auditV3NumberForbidden => OhacErrorCode.numberForbidden,
      audit.auditV3LimitExceeded => OhacErrorCode.limitExceeded,
      audit.auditV3FrameInvalid => OhacErrorCode.invalidField,
      audit.auditV3FrameTooLarge => OhacErrorCode.limitExceeded,
      _ => throw StateError(
          'unmapped audit-v3 code "$auditCode": add an explicit OHAC mapping '
          'in canonical.dart and extend the pinning test instead of letting it '
          'silently become OHAC_INVALID_JSON',
        ),
    };

/// OHAC-C14N-1 adds two rules on top of the shared number-free canonicalizer:
/// `null` values are forbidden and no Unicode normalization is ever applied
/// (the underlying canonicalizer never normalizes).
bool _containsNull(audit.AuditV3Value value) => switch (value) {
      audit.AuditV3Null() => true,
      audit.AuditV3Array(:final values) => values.any(_containsNull),
      audit.AuditV3Object(:final entries) =>
        entries.any((entry) => _containsNull(entry.value)),
      _ => false,
    };

/// Canonicalizes raw UTF-8 JSON bytes with OHAC-C14N-1.
OhacResult<Uint8List> canonicalizeOhac(Uint8List rawUtf8) {
  final scanned = audit.scanNumberFreeJson(rawUtf8);
  if (scanned case final audit.AuditV3Failure<audit.AuditV3Value> failure) {
    return OhacFailure(OhacError(auditV3CodeToOhac(failure.error.code)));
  }
  final value = (scanned as audit.AuditV3Success<audit.AuditV3Value>).value;
  if (_containsNull(value)) {
    return const OhacFailure(OhacError(OhacErrorCode.nullForbidden));
  }
  final canonical = audit.canonicalizeNumberFreeJson(rawUtf8);
  if (canonical case final audit.AuditV3Failure<Uint8List> failure) {
    return OhacFailure(OhacError(auditV3CodeToOhac(failure.error.code)));
  }
  return OhacSuccess((canonical as audit.AuditV3Success<Uint8List>).value);
}

/// `sha256:` prefix plus 64 lowercase hex characters over canonical bytes.
String ohacDigest(Uint8List canonicalBytes) =>
    'sha256:${audit.sha256LowerHex(canonicalBytes)}';

/// Canonicalizes raw UTF-8 JSON bytes and returns their OHAC digest.
OhacResult<String> digestOfJson(Uint8List rawUtf8) {
  final canonical = canonicalizeOhac(rawUtf8);
  if (canonical case final OhacFailure<Uint8List> failure) {
    return OhacFailure<String>(failure.error);
  }
  return OhacSuccess<String>(
    ohacDigest((canonical as OhacSuccess<Uint8List>).value),
  );
}

/// OHAC-C14N-1 digests cover the whole object except `digest` itself, so the
/// transmitted digest can be verified against a body re-canonicalized from the
/// parsed value. Returns the body without the digest field on success.
OhacResult<Map<String, dynamic>> verifyBodyDigest(
  Map<String, dynamic> object,
) {
  final transmitted = object['digest'];
  if (!isDigest(transmitted)) {
    return OhacFailure(OhacError(OhacErrorCode.missingField, 'digest'));
  }
  final body = <String, dynamic>{
    for (final entry in object.entries)
      if (entry.key != 'digest') entry.key: entry.value,
  };
  final canonical = canonicalizeOhac(
    Uint8List.fromList(utf8.encode(jsonEncode(body))),
  );
  if (canonical case final OhacFailure<Uint8List> failure) {
    return OhacFailure<Map<String, dynamic>>(failure.error);
  }
  if (ohacDigest((canonical as OhacSuccess<Uint8List>).value) != transmitted) {
    return const OhacFailure(OhacError(OhacErrorCode.digestMismatch));
  }
  return OhacSuccess(body);
}
