import 'package:freezed_annotation/freezed_annotation.dart';
import './cart_item.dart';

part 'hold_ticket.freezed.dart';
part 'hold_ticket.g.dart';

@freezed
class HoldTicket with _$HoldTicket {
  const factory HoldTicket({
    required String id,
    required String name, // Customer name or table label
    required List<CartItem> items,
    required DateTime createdAt,
    DateTime? updatedAt,
    String? tableId,
    String? areaId,
    String? waiterId,
    String? waiterName,
    @Default(1) int guestCount,
    @Default(false) bool isGlobalTaxExempt,
    @Default(1) int version,
  }) = _HoldTicket;

  factory HoldTicket.fromJson(Map<String, dynamic> json) =>
      _$HoldTicketFromJson(json);
}
