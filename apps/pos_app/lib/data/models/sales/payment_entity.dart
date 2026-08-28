import 'package:floor/floor.dart';
import './invoice_entity.dart';

@Entity(
  tableName: 'payments',
  foreignKeys: [
    ForeignKey(
      childColumns: ['invoice_id'],
      parentColumns: ['id'],
      entity: InvoiceEntity,
    ),
  ],
)
class PaymentEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'invoice_id')
  final String invoiceId;
  final String method;
  final double amount;
  final String currency;
  @ColumnInfo(name: 'exchange_rate')
  final double exchangeRate;
  @ColumnInfo(name: 'amount_nio')
  final double amountNio;
  @ColumnInfo(name: 'change_given')
  final double changeGiven;
  @ColumnInfo(name: 'change_currency')
  final String changeCurrency;
  // Voucher & Card Metadata (PRD Dos Capas)
  @ColumnInfo(name: 'voucher_code')
  final String? voucherCode;
  @ColumnInfo(name: 'card_brand')
  final String? cardBrand;
  @ColumnInfo(name: 'card_type')
  final String? cardType;
  @ColumnInfo(name: 'bank_pos')
  final String? bankPos;
  @ColumnInfo(name: 'reconciliation_status')
  final String? reconciliationStatus;
  final String? last4;
  @ColumnInfo(name: 'batch_number')
  final String? batchNumber;
  @ColumnInfo(name: 'reconciled_at')
  final int? reconciledAt;
  @ColumnInfo(name: 'reconciled_by_user_id')
  final String? reconciledByUserId;
  @ColumnInfo(name: 'created_at')
  final int? createdAt;

  PaymentEntity({
    required this.id,
    required this.invoiceId,
    required this.method,
    required this.amount,
    this.currency = 'NIO',
    this.exchangeRate = 1.0,
    this.amountNio = 0.0,
    this.changeGiven = 0.0,
    this.changeCurrency = 'NIO',
    this.voucherCode,
    this.cardBrand,
    this.cardType,
    this.bankPos,
    this.reconciliationStatus,
    this.last4,
    this.batchNumber,
    this.reconciledAt,
    this.reconciledByUserId,
    this.createdAt,
  });
}
