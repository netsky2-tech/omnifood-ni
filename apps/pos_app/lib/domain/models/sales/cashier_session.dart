import 'package:freezed_annotation/freezed_annotation.dart';

part 'cashier_session.freezed.dart';
part 'cashier_session.g.dart';

enum CashSessionModel {
  @JsonValue('CAJA_CENTRAL')
  cajaCentral,
  @JsonValue('CARTERA_MESERO')
  carteraMesero,
}

@freezed
class CashierSession with _$CashierSession {
  const factory CashierSession({
    required String id,
    required String userId,
    @Default('default-terminal') String terminalId,
    required DateTime openedAt,
    @JsonKey(name: 'tipo_modelo')
    @Default(CashSessionModel.cajaCentral)
    CashSessionModel tipoModelo,
    DateTime? closedAt,
    @Default(0.0) double openingBalance,
    @Default(0.0) double openingBalanceNio,
    @Default(0.0) double openingBalanceUsd,
    double? closingBalance,
    double? closingCountedNio,
    double? closingCountedUsd,
    double? totalSales,
    @Default(0.0) double totalExpected,
    @Default(0.0) double expectedNio,
    @Default(0.0) double expectedUsd,
    double? differenceNio,
    double? differenceUsd,
    int? zReportSequence,
    @Default(false) bool isClosed,
    String? supervisorId,
    String? notes,
    @Default('pending') String syncStatus,
  }) = _CashierSession;

  factory CashierSession.fromJson(Map<String, dynamic> json) =>
      _$CashierSessionFromJson(json);
}
