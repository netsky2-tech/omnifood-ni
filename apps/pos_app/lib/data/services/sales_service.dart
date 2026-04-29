import '../../domain/repositories/audit_repository.dart';

class SalesService {
  final AuditRepository _auditRepository;

  SalesService(this._auditRepository);

  Future<void> createInvoice(Map<String, dynamic> data) async {
    // Logic to save invoice locally (omitted)
    
    // Audit Hook
    await _auditRepository.log(
      'INVOICE_CREATED',
      metadata: '{"total": ${data['total']}, "items_count": ${data['items']?.length}}',
    );
  }

  Future<void> voidInvoice(String invoiceId, String reason) async {
    // Logic to mark invoice as canceled (omitted)
    
    // Audit Hook
    await _auditRepository.log(
      'INVOICE_VOIDED',
      metadata: '{"invoice_id": "$invoiceId", "reason": "$reason"}',
    );
  }
}
