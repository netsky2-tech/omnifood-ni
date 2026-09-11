import 'dart:math' show Random;

/// Crockford Base32 character set (excludes I, L, O, U for visual clarity).
const _crockfordBase32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/// Crockford Base32 decode map for validation.
const _decodeMap = <String, int>{
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15, 'G': 16, 'H': 17,
  'J': 18, 'K': 19, 'M': 20, 'N': 21, 'P': 22, 'Q': 23, 'R': 24, 'S': 25,
  'T': 26, 'V': 27, 'W': 28, 'X': 29, 'Y': 30, 'Z': 31,
  // lowercase aliases (Crockford spec)
  'a': 10, 'b': 11, 'c': 12, 'd': 13, 'e': 14, 'f': 15, 'g': 16, 'h': 17,
  'j': 18, 'k': 19, 'm': 20, 'n': 21, 'p': 22, 'q': 23, 'r': 24, 's': 25,
  't': 26, 'v': 27, 'w': 28, 'x': 29, 'y': 30, 'z': 31,
  // Crockford: I/i -> 1, L/l -> 1, O/o -> 0 (transcription errors)
  'i': 1, 'l': 1, 'o': 0,
};

/// Validates that all characters are valid Crockford Base32.
bool _isValidCrockford(String normalized) {
  for (var i = 0; i < normalized.length; i++) {
    if (!_decodeMap.containsKey(normalized[i])) return false;
  }
  return true;
}

/// QR payload prefix for V1.
const qrPayloadPrefix = 'NHL1:';

/// Opaque, tenant-scoped customer identifier.
///
/// - Normalized to uppercase Crockford Base32
/// - Not sequential, not predictable
/// - Does not contain PII
/// - Identifies but does not authenticate
class CustomerCode {
  final String value;

  const CustomerCode._(this.value);

  /// Creates a CustomerCode from a raw string, normalizing to uppercase.
  /// Throws [ArgumentError] if empty or contains invalid characters.
  factory CustomerCode(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) throw ArgumentError('CustomerCode cannot be empty');
    final normalized = trimmed.toUpperCase();
    if (!_isValidCrockford(normalized)) {
      throw ArgumentError('CustomerCode contains invalid Crockford Base32 characters');
    }
    return CustomerCode._(normalized);
  }

  /// Generates a cryptographically random CustomerCode.
  ///
  /// Uses 80+ bits of entropy encoded in Crockford Base32 (16 chars = 80 bits).
  factory CustomerCode.generate({int length = 16}) {
    assert(length >= 16, 'Minimum 16 chars for 80-bit entropy');
    final random = _SecureRandom();
    final chars = List<String>.generate(length, (_) {
      return _crockfordBase32[random.nextInt(32)];
    });
    return CustomerCode._(chars.join());
  }

  /// The QR payload in format `NHL1:{customerCode}`.
  String get qrPayload => '$qrPayloadPrefix$value';

  /// Attempts to decode a QR payload. Returns null if invalid.
  static CustomerCode? fromQrPayload(String payload) {
    if (!payload.startsWith(qrPayloadPrefix)) return null;
    final code = payload.substring(qrPayloadPrefix.length);
    if (code.isEmpty) return null;
    try {
      return CustomerCode(code);
    } catch (_) {
      return null;
    }
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CustomerCode && value == other.value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'CustomerCode($value)';
}

/// Minimal secure random wrapper using dart:math Random.secure().
class _SecureRandom {
  static final _instance = _SecureRandom._();
  late final Random _rng;

  _SecureRandom._() : _rng = Random.secure();

  factory _SecureRandom() => _instance;

  int nextInt(int max) => _rng.nextInt(max);
}
