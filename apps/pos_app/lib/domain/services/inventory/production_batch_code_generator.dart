class ProductionBatchCodeGenerator {
  const ProductionBatchCodeGenerator._();

  static String generateCode({
    required DateTime date,
    required int sequence,
  }) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    final seqStr = sequence.toString().padLeft(3, '0');
    return 'LOTE-$year$month$day-$seqStr';
  }

  static String generateNextCode({
    required DateTime date,
    required Iterable<String> existingCodes,
  }) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    final prefix = 'LOTE-$year$month$day-';

    var maxSequence = 0;
    for (final code in existingCodes) {
      final trimmed = code.trim();
      if (trimmed.startsWith(prefix)) {
        final suffix = trimmed.substring(prefix.length);
        final parsed = int.tryParse(suffix);
        if (parsed != null && parsed > maxSequence) {
          maxSequence = parsed;
        }
      }
    }

    return generateCode(date: date, sequence: maxSequence + 1);
  }
}
