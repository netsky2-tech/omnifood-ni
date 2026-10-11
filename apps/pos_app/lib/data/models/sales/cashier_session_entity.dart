import 'package:floor/floor.dart';

@Entity(tableName: 'cashier_sessions')
class CashierSessionEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'user_id')
  final String userId;

  /// Round-2 F-5b: the opener's display name, snapshotted when the shift is
  /// OPENED. The Z/X reports render this snapshot — the name as it was at the
  /// counter — instead of a lookup that can silently fail on a re-provisioned
  /// terminal (the S23 round printed "Operador no disponible" on a shift whose
  /// cloud row had the real cashier). Nullable: shifts opened before the
  /// migration keep null and fall back to the existing resolver.
  @ColumnInfo(name: 'cashier_name')
  final String? cashierName;
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
    this.cashierName,
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
