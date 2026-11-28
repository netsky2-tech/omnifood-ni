class QuarantinedSyncDocument {
  final String invoiceId;
  final String invoiceNumber;
  final String documentType;
  final double total;
  final String reason;
  final String? code;
  final DateTime? quarantinedAt;

  const QuarantinedSyncDocument({
    required this.invoiceId,
    required this.invoiceNumber,
    required this.documentType,
    required this.total,
    required this.reason,
    this.code,
    this.quarantinedAt,
  });

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is QuarantinedSyncDocument &&
        other.invoiceId == invoiceId &&
        other.invoiceNumber == invoiceNumber &&
        other.documentType == documentType &&
        other.total == total &&
        other.reason == reason &&
        other.code == code &&
        other.quarantinedAt == quarantinedAt;
  }

  @override
  int get hashCode => Object.hash(
    invoiceId,
    invoiceNumber,
    documentType,
    total,
    reason,
    code,
    quarantinedAt,
  );
}
