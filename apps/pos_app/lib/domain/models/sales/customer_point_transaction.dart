import 'package:freezed_annotation/freezed_annotation.dart';
import 'invoice.dart'; // For SyncStatus

part 'customer_point_transaction.freezed.dart';
part 'customer_point_transaction.g.dart';

enum PointTransactionType {
  earn,
  redeem,
  adjust,
}

/// Follow-up #5: the §9.3 canonical textual forms of the declared ledger
/// types. SQLite persists exactly these uppercase spec forms; PostgreSQL
/// persists the lowercase enum members; the case-insensitive guards are
/// defense-in-depth, never the primary contract.
const Set<String> loyaltyLedgerTypeForms = <String>{
  'EARN',
  'REDEEM',
  'ADJUST',
  'REVERSAL',
};

/// Normalizes a raw declared type to the §9.3 canonical form. An
/// unclassifiable type (unknown value, blank) returns NULL: it must not be
/// written as-is, because it would claim a declared namespace the guards do
/// not know and thereby evade every shape rule — the same fail-safe spirit
/// as T4 (never fabricate an attribution).
String? canonicalLoyaltyLedgerType(String? raw) {
  if (raw == null) {
    return null;
  }
  final upper = raw.trim().toUpperCase();
  if (loyaltyLedgerTypeForms.contains(upper)) {
    return upper;
  }
  // Issue #893 (R1-silent-null-downgrade): the downgrade to the NULL legacy
  // namespace must be OBSERVABLE — a writer introducing an invalid type
  // would otherwise silently strip its movements out of every V1 identity.
  assert(() {
    // ignore: avoid_print
    print(
      'LOYALTY_LEDGER_TYPE_DOWNGRADE: transaction_type "$raw" is outside '
      'the §9.3 domain $loyaltyLedgerTypeForms — the row falls back to the '
      'NULL legacy namespace (issue #893)',
    );
    return true;
  }());
  return null;
}

@freezed
class CustomerPointTransaction with _$CustomerPointTransaction {
  const factory CustomerPointTransaction({
    required String id,
    required String customerId,
    String? invoiceId,
    required PointTransactionType type,
    required double points,
    required double balanceAfter,
    @Default(0.1) double conversionRate,
    String? reason,
    required DateTime createdAt,
    @Default(SyncStatus.pending) SyncStatus syncStatus,
    // --- V1 Loyalty fields ---
    String? loyaltyProgramId,
    String? ticketId,
    String? rewardId,
    String? transactionType,
    int? units,
    String? reversalOfTransactionId,
    String? idempotencyKey,
    String? sourceEventId,
    String? actorUserId,
    String? branchId,
    String? terminalId,
    int? programVersion,
    int? rewardVersion,
    String? commercialSnapshot,
    String? origin,
    DateTime? occurredAt,
    DateTime? recordedAt,
    @Default(false) bool legacyImported,
  }) = _CustomerPointTransaction;

  factory CustomerPointTransaction.fromJson(Map<String, dynamic> json) =>
      _$CustomerPointTransactionFromJson(json);
}
