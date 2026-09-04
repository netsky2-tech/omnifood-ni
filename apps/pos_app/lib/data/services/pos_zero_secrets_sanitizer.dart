import 'dart:convert';

class PosZeroSecretsSanitizer {
  static final RegExp _jwtRegex = RegExp(
    r'\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b',
  );

  static final RegExp _cardRegex = RegExp(
    r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b',
  );

  static final RegExp _emailRegex = RegExp(
    r'\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*([a-zA-Z0-9_.+-])@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b',
  );

  static final Set<String> _secretKeyNames = {
    'password',
    'pass',
    'pwd',
    'secret',
    'apikey',
    'api_key',
    'privkey',
    'privatekey',
    'token',
    'jwt',
    'bearer',
  };

  static final Set<String> _pinKeyNames = {
    'pin',
    'totp',
    'totpcode',
    'totp_code',
    'otp',
    'passcode',
  };

  static final Set<String> _csvKeyNames = {
    'rawcsv',
    'raw_csv',
    'csvcontent',
    'csv_content',
    'csvdata',
    'filedata',
    'file_data',
  };

  static dynamic sanitize(dynamic input) {
    if (input == null) return null;

    if (input is String) {
      return _sanitizeString(input);
    }

    if (input is List) {
      return input.map((item) => sanitize(item)).toList();
    }

    if (input is Map) {
      final result = <String, dynamic>{};
      for (final entry in input.entries) {
        final key = entry.key.toString();
        final value = entry.value;

        if (value is String) {
          if (_jwtRegex.hasMatch(value)) {
            result[key] = _sanitizeString(value);
            continue;
          }

          if (RegExp(r'^\d{13,19}$').hasMatch(value.trim())) {
            result[key] = '[REDACTED_CARD]';
            continue;
          }

          if (_isCsvKey(key) || _isRawCsvContent(value)) {
            result[key] = _summarizeRawCsv(value);
            continue;
          }
        }

        if (_isSecretKey(key)) {
          result[key] = '[REDACTED_SECRET]';
          continue;
        }

        if (_isPinKey(key)) {
          result[key] = '[REDACTED_PIN]';
          continue;
        }

        result[key] = sanitize(value);
      }
      return result;
    }

    return input;
  }

  static String _sanitizeString(String str) {
    if (RegExp(r'^\d{13,19}$').hasMatch(str.trim())) {
      return '[REDACTED_CARD]';
    }

    var sanitized = str;
    sanitized = sanitized.replaceAllMapped(
      _jwtRegex,
      (match) => '[REDACTED_JWT]',
    );
    sanitized = sanitized.replaceAllMapped(
      _cardRegex,
      (match) => '[REDACTED_CARD]',
    );
    sanitized = sanitized.replaceAllMapped(
      _emailRegex,
      (match) => '${match.group(1)}***${match.group(2)}@${match.group(3)}',
    );

    return sanitized;
  }

  static bool _isSecretKey(String key) {
    final lower = key.toLowerCase().replaceAll(RegExp(r'[-_]'), '');
    for (final secret in _secretKeyNames) {
      if (lower.contains(secret)) return true;
    }
    return false;
  }

  static bool _isPinKey(String key) {
    final lower = key.toLowerCase().replaceAll(RegExp(r'[-_]'), '');
    for (final pin in _pinKeyNames) {
      if (lower.contains(pin)) return true;
    }
    return false;
  }

  static bool _isCsvKey(String key) {
    final lower = key.toLowerCase().replaceAll(RegExp(r'[-_]'), '');
    for (final csv in _csvKeyNames) {
      if (lower.contains(csv)) return true;
    }
    return false;
  }

  static bool _isRawCsvContent(String value) {
    if (value.length < 50) return false;
    final lines = value.split('\n');
    if (lines.length >= 3) {
      final firstCommaCount = ','.allMatches(lines[0]).length;
      final secondCommaCount = ','.allMatches(lines[1]).length;
      if (firstCommaCount >= 2 && firstCommaCount == secondCommaCount) {
        return true;
      }
    }
    return false;
  }

  static Map<String, dynamic> _summarizeRawCsv(String content) {
    final lines = content.split('\n').where((l) => l.trim().isNotEmpty).toList();
    return {
      'redacted': true,
      'type': 'RAW_CSV_REDACTED',
      'lineCount': lines.length,
      'byteLength': utf8.encode(content).length,
    };
  }
}
