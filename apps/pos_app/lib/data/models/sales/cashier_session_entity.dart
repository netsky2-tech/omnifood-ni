import 'package:floor/floor.dart';

@Entity(tableName: 'cashier_sessions')
class CashierSessionEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'user_id')
  final String userId;
  @ColumnInfo(name: 'opened_at')
  final int openedAt;
  @ColumnInfo(name: 'closed_at')
  final int? closedAt;
  @ColumnInfo(name: 'opening_balance')
  final double openingBalance;
  @ColumnInfo(name: 'closing_balance')
  final double? closingBalance;
  @ColumnInfo(name: 'total_sales')
  final double? totalSales;
  @ColumnInfo(name: 'total_expected')
  final double? totalExpected;
  @ColumnInfo(name: 'is_closed')
  final bool isClosed;

  CashierSessionEntity({
    required this.id,
    required this.userId,
    required this.openedAt,
    this.closedAt,
    required this.openingBalance,
    this.closingBalance,
    this.totalSales,
    this.totalExpected,
    this.isClosed = false,
  });
}
