import 'package:freezed_annotation/freezed_annotation.dart';
import './cart_item.dart';

part 'hold_ticket.freezed.dart';
part 'hold_ticket.g.dart';

@freezed
class HoldTicket with _$HoldTicket {
  const factory HoldTicket({
    required String id,
    required String name, // Customer name or table number
    required List<CartItem> items,
    required DateTime createdAt,
    @Default(false) bool isGlobalTaxExempt,
  }) = _HoldTicket;

  factory HoldTicket.fromJson(Map<String, dynamic> json) =>
      _$HoldTicketFromJson(json);
}
