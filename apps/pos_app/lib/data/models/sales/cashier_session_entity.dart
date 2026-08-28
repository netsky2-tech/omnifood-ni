import 'package:floor/floor.dart';

@Entity(tableName: 'cashier_sessions')
class CashierSessionEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'user_id')
  final String userId;
  @ColumnInfo(name: 'terminal_id')
  final String terminalId;
  @ColumnInfo(name: 'opened_at')
  final int openedAt;
  @ColumnInfo(name: 'tipo_modelo')
  final String tipoModelo;
  @ColumnInfo(name: 'closed_at')
  final int? closedAt;
  @ColumnInfo(name: 'opening_balance_nio')
  final double openingBalanceNio;
  @ColumnInfo(name: 'opening_balance_usd')
  final double openingBalanceUsd;
  @ColumnInfo(name: 'closing_counted_nio')
  final double? closingCountedNio;
  @ColumnInfo(name: 'closing_counted_usd')
  final double? closingCountedUsd;
  @ColumnInfo(name: 'expected_nio')
  final double expectedNio;
  @ColumnInfo(name: 'expected_usd')
  final double expectedUsd;
  @ColumnInfo(name: 'difference_nio')
  final double? differenceNio;
  @ColumnInfo(name: 'difference_usd')
  final double? differenceUsd;
  @ColumnInfo(name: 'z_report_sequence')
  final int? zReportSequence;
  @ColumnInfo(name: 'is_closed')
  final bool isClosed;
  @ColumnInfo(name: 'supervisor_id')
  final String? supervisorId;
  @ColumnInfo(name: 'notes')
  final String? notes;
  @ColumnInfo(name: 'sync_status')
  final String syncStatus;

  double get openingBalance => openingBalanceNio;
  double? get closingBalance => closingCountedNio;
  double get totalExpected => expectedNio;
  double? get totalSales => null;

  CashierSessionEntity({
    required this.id,
    required this.userId,
    this.terminalId = 'default-terminal',
    required this.openedAt,
    this.tipoModelo = 'CAJA_CENTRAL',
    this.closedAt,
    double? openingBalance,
    double? openingBalanceNio,
    this.openingBalanceUsd = 0.0,
    double? closingBalance,
    double? closingCountedNio,
    this.closingCountedUsd,
    double? totalExpected,
    double? expectedNio,
    this.expectedUsd = 0.0,
    double? totalSales,
    this.differenceNio,
    this.differenceUsd,
    this.zReportSequence,
    this.isClosed = false,
    this.supervisorId,
    this.notes,
    this.syncStatus = 'pending',
  })  : openingBalanceNio = openingBalanceNio ?? openingBalance ?? 0.0,
        closingCountedNio = closingCountedNio ?? closingBalance,
        expectedNio = expectedNio ?? totalExpected ?? 0.0;
}
