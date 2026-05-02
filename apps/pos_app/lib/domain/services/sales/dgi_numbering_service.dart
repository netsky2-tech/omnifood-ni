abstract class DgiNumberingService {
  Future<void> initializeRange({
    required String prefix,
    required int start,
    required int end,
  });

  Future<String> getNextNumber();
  Future<void> incrementNumber();
  Future<bool> isRangeExhausted();
}
