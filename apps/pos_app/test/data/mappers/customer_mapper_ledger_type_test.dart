import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/customer_mapper.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/sales/customer_point_transaction.dart';

/// Follow-up #5: the ledger type textual form is canonical on write. SQLite
/// persists the spec's uppercase §9.3 forms ('EARN'/'REDEEM'/'ADJUST'/
/// 'REVERSAL'); the case-insensitive guards are defense-in-depth, never the
/// primary contract. An unclassifiable type must NOT be written as-is: it
/// would claim a declared namespace the guards do not know — it falls back to
/// the NULL legacy namespace (the same fail-safe spirit as T4).
void main() {
  CustomerPointTransaction domain({
    String? transactionType,
  }) =>
      CustomerPointTransaction(
        id: 'tx-1',
        customerId: 'cust-1',
        type: PointTransactionType.earn,
        points: 10,
        balanceAfter: 110,
        createdAt: DateTime(2026, 2, 14),
        transactionType: transactionType,
      );

  group('CustomerMapper ledger type form normalization (follow-up #5)', () {
    test('canonical spec forms pass through unchanged', () {
      for (final form in ['EARN', 'REDEEM', 'ADJUST', 'REVERSAL']) {
        expect(
          CustomerMapper.toPointTransactionEntity(
            domain(transactionType: form),
          ).transactionType,
          form,
        );
      }
    });

    test('backend enum forms (lowercase) normalize to the spec forms', () {
      expect(
        CustomerMapper.toPointTransactionEntity(
          domain(transactionType: 'earn'),
        ).transactionType,
        'EARN',
      );
      expect(
        CustomerMapper.toPointTransactionEntity(
          domain(transactionType: 'Reversal'),
        ).transactionType,
        'REVERSAL',
      );
    });

    test('an unknown declared type falls back to the NULL legacy namespace',
        () {
      expect(
        CustomerMapper.toPointTransactionEntity(
          domain(transactionType: 'MILESTONE'),
        ).transactionType,
        isNull,
      );
      expect(
        CustomerMapper.toPointTransactionEntity(
          domain(transactionType: '  '),
        ).transactionType,
        isNull,
      );
    });

    test('NULL stays NULL (pre-V1 legacy namespace)', () {
      expect(
        CustomerMapper.toPointTransactionEntity(domain()).transactionType,
        isNull,
      );
    });
  });
}
