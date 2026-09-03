import '../models/loyalty/customer_identification.dart';

/// Port for customer identification in the POS checkout flow.
///
/// Each adapter implements a specific identification method:
/// - QR: decodes QR payload → CustomerCode → lookup
/// - CUSTOMER_CODE: manual code entry → lookup
/// - PHONE: existing phone lookup
/// - SEARCH: text search across name/taxId/phone
///
/// The port returns null when identification fails (customer not found,
/// invalid input, etc.) without throwing. The caller decides the UX response.
abstract class CustomerIdentificationPort {
  /// Attempts to identify a customer from the given [input].
  ///
  /// Returns [CustomerIdentificationResult] on success, or null if the
  /// input cannot resolve to a valid, active customer within the tenant.
  Future<CustomerIdentificationResult?> identify(String input);
}
