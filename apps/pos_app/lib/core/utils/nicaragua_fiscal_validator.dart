enum FiscalIdentificationType {
  cedula,
  rucJuridico,
  none,
  invalid,
}

class NicaraguaFiscalValidator {
  NicaraguaFiscalValidator._();

  static final RegExp _cedulaHyphenRegex = RegExp(r'^(\d{3})-(\d{6})-(\d{4})([a-zA-Z])$');
  static final RegExp _cedulaCleanRegex = RegExp(r'^(\d{3})(\d{6})(\d{4})([a-zA-Z])$');
  static final RegExp _rucJuridicoRegex = RegExp(r'^[jJ](\d{13})$');

  /// Cleans whitespace and hyphens from the identification string.
  static String clean(String? raw) {
    if (raw == null) return '';
    return raw.replaceAll(RegExp(r'[\s\-]'), '').toUpperCase();
  }

  /// Validates a Nicaraguan Cédula (with or without hyphens).
  static bool isValidCedula(String? raw) {
    if (raw == null || raw.trim().isEmpty) return false;
    final trimmed = raw.trim();

    String? dept;
    String? dateStr;
    String? seq;
    String? letter;

    final hyphenMatch = _cedulaHyphenRegex.firstMatch(trimmed);
    if (hyphenMatch != null) {
      dept = hyphenMatch.group(1);
      dateStr = hyphenMatch.group(2);
      seq = hyphenMatch.group(3);
      letter = hyphenMatch.group(4);
    } else {
      final cleanMatch = _cedulaCleanRegex.firstMatch(trimmed);
      if (cleanMatch != null) {
        dept = cleanMatch.group(1);
        dateStr = cleanMatch.group(2);
        seq = cleanMatch.group(3);
        letter = cleanMatch.group(4);
      }
    }

    if (dept == null || dateStr == null || seq == null || letter == null) {
      return false;
    }

    // Validate date part (DDMMYY)
    final day = int.tryParse(dateStr.substring(0, 2)) ?? 0;
    final month = int.tryParse(dateStr.substring(2, 4)) ?? 0;

    if (day < 1 || day > 31) return false;
    if (month < 1 || month > 12) return false;

    return true;
  }

  /// Validates a Nicaraguan RUC (Corporate J + 13 digits OR Natural person Cedula).
  static bool isValidRuc(String? raw) {
    if (raw == null || raw.trim().isEmpty) return false;
    final cleaned = clean(raw);

    if (_rucJuridicoRegex.hasMatch(cleaned)) {
      return true;
    }

    return isValidCedula(cleaned);
  }

  /// Detects the fiscal identification type.
  static FiscalIdentificationType detectType(String? raw) {
    if (raw == null || raw.trim().isEmpty) return FiscalIdentificationType.none;
    final cleaned = clean(raw);

    if (_rucJuridicoRegex.hasMatch(cleaned)) {
      return FiscalIdentificationType.rucJuridico;
    }

    if (isValidCedula(raw)) {
      return FiscalIdentificationType.cedula;
    }

    return FiscalIdentificationType.invalid;
  }

  /// Formats a valid clean or hyphenated cédula into standard 001-000000-0000X format.
  static String? formatCedula(String? raw) {
    if (!isValidCedula(raw)) return raw;
    final cleaned = clean(raw);
    if (cleaned.length != 14) return raw;

    final dept = cleaned.substring(0, 3);
    final dateStr = cleaned.substring(3, 9);
    final seq = cleaned.substring(9, 13);
    final letter = cleaned.substring(13, 14).toUpperCase();

    return '$dept-$dateStr-$seq$letter';
  }
}
