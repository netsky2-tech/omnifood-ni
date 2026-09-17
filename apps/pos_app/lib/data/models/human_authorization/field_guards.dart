import 'error_codes.dart';

/// Canonical decimal string: `"0"` or a non-zero unsigned decimal without a
/// sign or leading zero. All OHAC integer-like values use this form.
final RegExp decimalStringPattern = RegExp(r'^(0|[1-9][0-9]*)$');
final RegExp lowercaseUuidPattern = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);
final RegExp digestPattern = RegExp(r'^sha256:[0-9a-f]{64}$');

/// Returns the value as a JSON object, or `null` when the value is not an
/// object (arrays and scalars are rejected, matching the TS guard).
Map<String, dynamic>? asObject(Object? value) {
  if (value is! Map) return null;
  for (final key in value.keys) {
    if (key is! String) return null;
  }
  return value.cast<String, dynamic>();
}

bool isNonEmptyString(Object? value) => value is String && value.isNotEmpty;

bool isDecimalString(Object? value) =>
    value is String && decimalStringPattern.hasMatch(value);

/// Maximum signed Int64 (exploration.md §7.3 sequenceNumber) as canonical
/// decimal.
const String maxInt64Decimal = '9223372036854775807';

/// Canonical decimal within the signed Int64 range (0..9223372036854775807),
/// no leading zeros. The range is checked lexicographically — digit length,
/// then the max-Int64 bound for 19-digit values — so an over-range or hostile
/// multi-hundred-digit payload is rejected before any BigInt allocation.
bool isInt64DecimalString(Object? value) {
  if (value is! String || !isDecimalString(value)) return false;
  return value.length < maxInt64Decimal.length ||
      (value.length == maxInt64Decimal.length &&
          value.compareTo(maxInt64Decimal) <= 0);
}

bool isLowercaseUuid(Object? value) =>
    value is String && lowercaseUuidPattern.hasMatch(value);

bool isDigest(Object? value) => value is String && digestPattern.hasMatch(value);

/// Rejects unknown fields before anything else interprets the payload, so a
/// future field cannot be silently ignored by an older contract version.
OhacResult<Map<String, dynamic>> requireExactKeys(
  Map<String, dynamic> object,
  List<String> allowed,
) {
  final allowedSet = allowed.toSet();
  for (final key in object.keys) {
    if (!allowedSet.contains(key)) {
      return OhacFailure(OhacError(OhacErrorCode.unknownField, key));
    }
  }
  for (final key in allowed) {
    if (!object.containsKey(key)) {
      return OhacFailure(OhacError(OhacErrorCode.missingField, key));
    }
  }
  return OhacSuccess(object);
}

/// Requires an array whose values are already sorted (UTF-16 code-unit order,
/// identical to JS `<`/`>=` string comparison) and free of duplicates.
OhacResult<List<String>> requireSortedUnique(
  List<String> values,
  String field,
) {
  for (var index = 1; index < values.length; index++) {
    if (values[index - 1].compareTo(values[index]) >= 0) {
      return OhacFailure(OhacError(OhacErrorCode.invalidField, field));
    }
  }
  return OhacSuccess(values);
}
