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
    required DateTime openedAt,
    @JsonKey(name: 'tipo_modelo')
    @Default(CashSessionModel.cajaCentral)
    CashSessionModel tipoModelo,
    DateTime? closedAt,
    required double openingBalance,
    double? closingBalance,
    double? totalSales,
    double? totalExpected,
    @Default(false) bool isClosed,
  }) = _CashierSession;

  factory CashierSession.fromJson(Map<String, dynamic> json) =>
      _$CashierSessionFromJson(json);
}
