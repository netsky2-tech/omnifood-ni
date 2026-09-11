import 'package:uuid/uuid.dart';
import 'package:pos_app/data/daos/customer/customer_point_transaction_dao.dart';
import 'package:pos_app/data/daos/customer/customer_dao.dart';
import 'package:pos_app/data/mappers/customer_mapper.dart';
import 'package:pos_app/domain/services/sales/loyalty_service.dart';

class LoyaltyEarningHandler {
  final CustomerPointTransactionDao _txDao;
  final CustomerDao _customerDao;
  final LoyaltyService _service;
  static const _uuid = Uuid();

  LoyaltyEarningHandler(this._txDao, this._customerDao, {LoyaltyService? service})
      : _service = service ?? LoyaltyService();

  Future<List<Map<String, dynamic>>> handle({
    required String tenantId,
    required String branchId,
    required String terminalId,
    required String ticketId,
    String? customerId,
    required DateTime paidAt,
    required List<TicketLineInput> lines,
  }) async {
    if (customerId == null) return [];

    final eligibleLines = lines.where((l) => l.source == LineSource.normal).toList();
    if (eligibleLines.isEmpty) return [];

    final totalSpend = eligibleLines.fold<double>(
      0,
      (sum, l) => sum + l.merchandiseNetNioAfterAllBenefits,
    );

    final pointsEarned = _service.calculatePointsEarned(totalSpend);
    if (pointsEarned <= 0) return [];

    final idempotencyKey = 'loyalty:earn:$tenantId:$ticketId:legacy';

    final existing = await _txDao.findByIdempotencyKey(idempotencyKey);
    if (existing != null) {
      return [CustomerMapper.toPointTransactionDomain(existing).toJson()];
    }

    final tx = _service.createEarnTransaction(
      customerId: customerId,
      invoiceId: ticketId,
      currentBalance: 0.0,
      netAmount: totalSpend,
    );

    final v1Tx = tx.copyWith(
      loyaltyProgramId: null,
      ticketId: ticketId,
      idempotencyKey: idempotencyKey,
      sourceEventId: ticketId,
      branchId: branchId,
      terminalId: terminalId,
      programVersion: 0,
      origin: 'POS',
      occurredAt: paidAt,
    );

    final entity = CustomerMapper.toPointTransactionEntity(v1Tx);
    final customer = await _customerDao.getCustomerById(customerId);
    if (customer == null) return [];

    final newBalance = customer.pointsBalance + pointsEarned;
    await _txDao.recordPointTransactionAndUpdateBalance(
      entity,
      customerId,
      newBalance,
      DateTime.now().millisecondsSinceEpoch,
    );

    return [v1Tx.toJson()];
  }
}

enum LineSource { normal, loyaltyReward }

class TicketLineInput {
  final String lineId;
  final String productId;
  final String? categoryId;
  final int quantity;
  final double merchandiseNetNioAfterAllBenefits;
  final LineSource source;

  const TicketLineInput({
    required this.lineId,
    required this.productId,
    this.categoryId,
    required this.quantity,
    required this.merchandiseNetNioAfterAllBenefits,
    this.source = LineSource.normal,
  });
}
