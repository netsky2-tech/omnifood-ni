import 'package:pos_app/data/daos/customer/customer_dao.dart';
import 'package:pos_app/data/mappers/customer_mapper.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/models/loyalty/customer_code.dart';
import 'package:pos_app/domain/ports/customer_identification_port.dart';

/// Adapter: identifies customer by scanning QR payload.
///
/// Decodes the QR payload format `NHL1:{customerCode}`, normalizes the code,
/// and looks up the customer by their opaque tenant-scoped identifier.
class QrIdentificationAdapter implements CustomerIdentificationPort {
  final CustomerDao _customerDao;

  QrIdentificationAdapter(this._customerDao);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final code = CustomerCode.fromQrPayload(input);
    if (code == null) return null;

    final entity = await _customerDao.getCustomerByCode(code.value);
    if (entity == null || !entity.isActive) return null;

    return CustomerIdentificationResult(
      customer: CustomerMapper.toDomain(entity),
      method: IdentificationMethod.qr,
    );
  }
}

/// Adapter: identifies customer by manual customer code entry.
///
/// Normalizes the input using Crockford Base32 rules and looks up
/// the customer by their opaque tenant-scoped identifier.
class CustomerCodeIdentificationAdapter implements CustomerIdentificationPort {
  final CustomerDao _customerDao;

  CustomerCodeIdentificationAdapter(this._customerDao);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final trimmed = input.trim();
    if (trimmed.isEmpty) return null;

    try {
      final code = CustomerCode(trimmed);
      final entity = await _customerDao.getCustomerByCode(code.value);
      if (entity == null || !entity.isActive) return null;

      return CustomerIdentificationResult(
        customer: CustomerMapper.toDomain(entity),
        method: IdentificationMethod.customerCode,
      );
    } catch (_) {
      return null;
    }
  }
}

/// Adapter: identifies customer by phone number.
///
/// Uses the existing `getCustomerByPhone` DAO method.
class PhoneIdentificationAdapter implements CustomerIdentificationPort {
  final CustomerDao _customerDao;

  PhoneIdentificationAdapter(this._customerDao);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final phone = input.trim();
    if (phone.isEmpty) return null;

    final entity = await _customerDao.getCustomerByPhone(phone);
    if (entity == null || !entity.isActive) return null;

    return CustomerIdentificationResult(
      customer: CustomerMapper.toDomain(entity),
      method: IdentificationMethod.phone,
    );
  }
}

/// Adapter: identifies customer by text search across name/taxId/phone.
///
/// Uses the existing `searchCustomers` DAO method. Returns the first
/// matching active customer.
class SearchIdentificationAdapter implements CustomerIdentificationPort {
  final CustomerDao _customerDao;

  SearchIdentificationAdapter(this._customerDao);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final query = input.trim();
    if (query.isEmpty) return null;

    final results = await _customerDao.searchCustomers(query, 1);
    if (results.isEmpty) return null;

    return CustomerIdentificationResult(
      customer: CustomerMapper.toDomain(results.first),
      method: IdentificationMethod.search,
    );
  }
}
