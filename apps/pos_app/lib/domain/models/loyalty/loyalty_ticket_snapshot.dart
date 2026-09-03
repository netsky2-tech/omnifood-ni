enum TicketLineSource {
  normal,
  loyaltyReward,
}

class TicketLineSnapshot {
  final String lineId;
  final String productId;
  final int quantity;
  final double netAmount;
  final TicketLineSource source;

  TicketLineSnapshot({
    required this.lineId,
    required this.productId,
    required this.quantity,
    required this.netAmount,
    required this.source,
  }) {
    if (quantity <= 0) {
      throw ArgumentError('quantity must be positive, got $quantity');
    }
    if (netAmount < 0) {
      throw ArgumentError('netAmount cannot be negative, got $netAmount');
    }
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TicketLineSnapshot &&
          runtimeType == other.runtimeType &&
          lineId == other.lineId &&
          productId == other.productId &&
          quantity == other.quantity &&
          netAmount == other.netAmount &&
          source == other.source;

  @override
  int get hashCode => Object.hash(lineId, productId, quantity, netAmount, source);

  @override
  String toString() => 'TicketLineSnapshot(lineId: $lineId, productId: $productId, '
      'qty: $quantity, net: $netAmount, source: $source)';
}

class LoyaltyTicketSnapshot {
  final String tenantId;
  final String branchId;
  final String terminalId;
  final String ticketId;
  final String? customerId;
  final DateTime occurredAt;
  final List<TicketLineSnapshot> lines;

  const LoyaltyTicketSnapshot({
    required this.tenantId,
    required this.branchId,
    required this.terminalId,
    required this.ticketId,
    this.customerId,
    required this.occurredAt,
    required this.lines,
  });

  List<TicketLineSnapshot> get normalLines =>
      lines.where((l) => l.source == TicketLineSource.normal).toList();

  List<TicketLineSnapshot> get loyaltyRewardLines =>
      lines.where((l) => l.source == TicketLineSource.loyaltyReward).toList();

  double get totalNetAmount =>
      normalLines.fold(0.0, (sum, l) => sum + l.netAmount);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LoyaltyTicketSnapshot &&
          runtimeType == other.runtimeType &&
          tenantId == other.tenantId &&
          branchId == other.branchId &&
          terminalId == other.terminalId &&
          ticketId == other.ticketId &&
          customerId == other.customerId &&
          occurredAt == other.occurredAt;

  @override
  int get hashCode => Object.hash(
        tenantId,
        branchId,
        terminalId,
        ticketId,
        customerId,
        occurredAt,
      );

  @override
  String toString() => 'LoyaltyTicketSnapshot(ticketId: $ticketId, '
      'customerId: $customerId, lines: ${lines.length}, '
      'totalNet: $totalNetAmount)';
}
