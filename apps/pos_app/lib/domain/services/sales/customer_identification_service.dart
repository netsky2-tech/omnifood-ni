import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/ports/customer_identification_port.dart';

/// Composes multiple CustomerIdentificationPort adapters with fallback logic.
///
/// Tries each adapter in order until one succeeds. The recommended order is:
/// 1. QR (fastest, most reliable)
/// 2. CustomerCode (manual entry)
/// 3. Phone (existing fallback)
/// 4. Search (broadest, last resort)
class CustomerIdentificationService {
  final List<CustomerIdentificationPort> _adapters;

  const CustomerIdentificationService(this._adapters);

  /// Identifies a customer by trying each adapter in order.
  ///
  /// Returns the first successful identification, or null if all fail.
  /// The caller can inspect the `method` field on the result to know
  /// which adapter succeeded.
  Future<CustomerIdentificationResult?> identify(String input) async {
    final trimmed = input.trim();
    if (trimmed.isEmpty) return null;

    for (final adapter in _adapters) {
      final result = await adapter.identify(trimmed);
      if (result != null) return result;
    }

    return null;
  }

  /// Identifies a customer using a specific adapter method.
  ///
  /// Useful when the UI knows the input type (e.g., QR scan result).
  Future<CustomerIdentificationResult?> identifyWith(
    CustomerIdentificationPort adapter,
    String input,
  ) {
    return adapter.identify(input.trim());
  }
}
