import '../customer/customer.dart';

enum IdentificationMethod {
  qr,
  customerCode,
  phone,
  search,
}

class CustomerIdentificationResult {
  final Customer customer;
  final IdentificationMethod method;

  const CustomerIdentificationResult({
    required this.customer,
    required this.method,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CustomerIdentificationResult &&
          runtimeType == other.runtimeType &&
          customer == other.customer &&
          method == other.method;

  @override
  int get hashCode => Object.hash(customer, method);

  @override
  String toString() => 'CustomerIdentificationResult '
      '(${method.name}: ${customer.id})';
}
