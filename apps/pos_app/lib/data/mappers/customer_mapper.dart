import '../../domain/models/customer/customer.dart';
import '../../domain/models/sales/customer_point_transaction.dart';
import '../../domain/models/sales/invoice.dart';
import '../models/customer/customer_entity.dart';
import '../models/customer/customer_point_transaction_entity.dart';

class CustomerMapper {
  CustomerMapper._();

  static Customer toDomain(CustomerEntity entity) {
    return Customer(
      id: entity.id,
      name: entity.name,
      taxId: entity.taxId,
      phone: entity.phone,
      email: entity.email,
      address: entity.address,
      pointsBalance: entity.pointsBalance,
      isActive: entity.isActive,
      createdAt: DateTime.fromMillisecondsSinceEpoch(entity.createdAt),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(entity.updatedAt),
      syncStatus: entity.syncStatus,
    );
  }

  static CustomerEntity toEntity(Customer domain) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return CustomerEntity(
      id: domain.id,
      name: domain.name,
      taxId: domain.taxId,
      phone: domain.phone,
      email: domain.email,
      address: domain.address,
      pointsBalance: domain.pointsBalance,
      isActive: domain.isActive,
      createdAt: domain.createdAt?.millisecondsSinceEpoch ?? now,
      updatedAt: domain.updatedAt?.millisecondsSinceEpoch ?? now,
      syncStatus: domain.syncStatus,
    );
  }

  static CustomerPointTransaction toPointTransactionDomain(
    CustomerPointTransactionEntity entity,
  ) {
    return CustomerPointTransaction(
      id: entity.id,
      customerId: entity.customerId,
      invoiceId: entity.invoiceId,
      type: PointTransactionType.values.firstWhere(
        (t) => t.name == entity.type,
        orElse: () => PointTransactionType.earn,
      ),
      points: entity.points,
      balanceAfter: entity.balanceAfter,
      conversionRate: entity.conversionRate,
      reason: entity.reason,
      createdAt: DateTime.fromMillisecondsSinceEpoch(entity.createdAt),
      syncStatus: SyncStatus.values.firstWhere(
        (s) => s.name == entity.syncStatus,
        orElse: () => SyncStatus.pending,
      ),
    );
  }

  static CustomerPointTransactionEntity toPointTransactionEntity(
    CustomerPointTransaction domain,
  ) {
    return CustomerPointTransactionEntity(
      id: domain.id,
      customerId: domain.customerId,
      invoiceId: domain.invoiceId,
      type: domain.type.name,
      points: domain.points,
      balanceAfter: domain.balanceAfter,
      conversionRate: domain.conversionRate,
      reason: domain.reason,
      createdAt: domain.createdAt.millisecondsSinceEpoch,
      syncStatus: domain.syncStatus.name,
    );
  }
}
