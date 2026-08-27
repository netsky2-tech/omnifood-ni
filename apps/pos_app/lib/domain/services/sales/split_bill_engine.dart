import 'package:freezed_annotation/freezed_annotation.dart';
import '../../models/sales/cart_item.dart';
import 'tip_engine.dart';

part 'split_bill_engine.freezed.dart';
part 'split_bill_engine.g.dart';

@freezed
class SplitBillShare with _$SplitBillShare {
  const SplitBillShare._();

  const factory SplitBillShare({
    required int shareIndex,
    required String label,
    @Default(<CartItem>[]) List<CartItem> items,
    required double subtotalNio,
    required double taxNio,
    required double tipNio,
    required double discountNio,
    required double totalNio,
    required double totalUsd,
    @Default(false) bool isPaid,
  }) = _SplitBillShare;

  factory SplitBillShare.fromJson(Map<String, dynamic> json) =>
      _$SplitBillShareFromJson(json);
}

@freezed
class SplitBillResult with _$SplitBillResult {
  const SplitBillResult._();

  const factory SplitBillResult({
    required List<SplitBillShare> shares,
    required double totalDistributedNio,
    required double totalDistributedUsd,
    required double commercialRate,
  }) = _SplitBillResult;

  factory SplitBillResult.fromJson(Map<String, dynamic> json) =>
      _$SplitBillResultFromJson(json);
}

class ItemizedShareInput {
  final int shareIndex;
  final String label;
  final List<CartItem> items;
  final TipType tipType;
  final double customTipPercentage;
  final double fixedTipAmount;

  const ItemizedShareInput({
    required this.shareIndex,
    required this.label,
    required this.items,
    this.tipType = TipType.none,
    this.customTipPercentage = 0.0,
    this.fixedTipAmount = 0.0,
  });
}

/// Domain engine for splitting bills in restaurant dining environments.
class SplitBillEngine {
  SplitBillEngine._();

  /// Splits an order into [coverCount] equal shares, preserving centavo remainder invariants (INV-16.2).
  static SplitBillResult splitEqual({
    required double subtotalNio,
    required double taxNio,
    required double tipNio,
    required double discountNio,
    required int coverCount,
    required double commercialRate,
  }) {
    if (coverCount <= 0) {
      throw ArgumentError.value(coverCount, 'coverCount', 'El número de comensales debe ser mayor a cero.');
    }

    final rate = commercialRate > 0 ? commercialRate : 36.50;
    final totalNio = double.parse(((subtotalNio - discountNio) + taxNio + tipNio).toStringAsFixed(2));

    // Distribute centavos evenly
    final totalCents = (totalNio * 100).round();
    final baseShareCents = totalCents ~/ coverCount;
    final remainderCents = totalCents % coverCount;

    final subtotalCents = (subtotalNio * 100).round();
    final baseSubtotalCents = subtotalCents ~/ coverCount;
    final remainderSubtotalCents = subtotalCents % coverCount;

    final taxCents = (taxNio * 100).round();
    final baseTaxCents = taxCents ~/ coverCount;
    final remainderTaxCents = taxCents % coverCount;

    final tipCents = (tipNio * 100).round();
    final baseTipCents = tipCents ~/ coverCount;
    final remainderTipCents = tipCents % coverCount;

    final discountCents = (discountNio * 100).round();
    final baseDiscountCents = discountCents ~/ coverCount;
    final remainderDiscountCents = discountCents % coverCount;

    final List<SplitBillShare> shares = [];

    for (int i = 0; i < coverCount; i++) {
      final shareTotalCents = baseShareCents + (i < remainderCents ? 1 : 0);
      final shareSubtotalCents = baseSubtotalCents + (i < remainderSubtotalCents ? 1 : 0);
      final shareTaxCents = baseTaxCents + (i < remainderTaxCents ? 1 : 0);
      final shareTipCents = baseTipCents + (i < remainderTipCents ? 1 : 0);
      final shareDiscountCents = baseDiscountCents + (i < remainderDiscountCents ? 1 : 0);

      final shareTotalNio = shareTotalCents / 100.0;
      final shareSubtotalNio = shareSubtotalCents / 100.0;
      final shareTaxNio = shareTaxCents / 100.0;
      final shareTipNio = shareTipCents / 100.0;
      final shareDiscountNio = shareDiscountCents / 100.0;

      final shareTotalUsd = double.parse((shareTotalNio / rate).toStringAsFixed(2));

      shares.add(
        SplitBillShare(
          shareIndex: i + 1,
          label: 'Comensal ${i + 1}',
          items: const [],
          subtotalNio: shareSubtotalNio,
          taxNio: shareTaxNio,
          tipNio: shareTipNio,
          discountNio: shareDiscountNio,
          totalNio: shareTotalNio,
          totalUsd: shareTotalUsd,
        ),
      );
    }

    final totalDistributed = shares.fold<double>(0.0, (sum, s) => sum + s.totalNio);
    final totalDistributedUsd = double.parse((totalDistributed / rate).toStringAsFixed(2));

    return SplitBillResult(
      shares: shares,
      totalDistributedNio: double.parse(totalDistributed.toStringAsFixed(2)),
      totalDistributedUsd: totalDistributedUsd,
      commercialRate: rate,
    );
  }

  /// Splits an order item by item across distinct covers / shares (INV-16.3).
  static SplitBillResult splitByItems({
    required List<ItemizedShareInput> shares,
    required double commercialRate,
  }) {
    if (shares.isEmpty) {
      throw ArgumentError.value(shares, 'shares', 'Debe haber al menos un comensal configurado.');
    }

    final rate = commercialRate > 0 ? commercialRate : 36.50;
    final List<SplitBillShare> outputShares = [];

    for (final input in shares) {
      double shareSubtotal = 0.0;
      double shareTax = 0.0;

      for (final item in input.items) {
        shareSubtotal += item.subtotal + item.modifiersTotal;
        shareTax += item.taxAmount;
      }

      shareSubtotal = double.parse(shareSubtotal.toStringAsFixed(2));
      shareTax = double.parse(shareTax.toStringAsFixed(2));

      final tipCalc = TipEngine.calculate(
        subtotalNio: shareSubtotal,
        taxNio: shareTax,
        discountNio: 0.0,
        tipType: input.tipType,
        customPercentage: input.customTipPercentage,
        fixedAmount: input.fixedTipAmount,
        commercialRate: rate,
      );

      final shareTotalNio = tipCalc.totalWithTipNio;
      final shareTotalUsd = tipCalc.totalWithTipUsd;

      outputShares.add(
        SplitBillShare(
          shareIndex: input.shareIndex,
          label: input.label,
          items: input.items,
          subtotalNio: shareSubtotal,
          taxNio: shareTax,
          tipNio: tipCalc.tipAmountNio,
          discountNio: 0.0,
          totalNio: shareTotalNio,
          totalUsd: shareTotalUsd,
        ),
      );
    }

    final totalDistributed = outputShares.fold<double>(0.0, (sum, s) => sum + s.totalNio);
    final totalDistributedUsd = double.parse((totalDistributed / rate).toStringAsFixed(2));

    return SplitBillResult(
      shares: outputShares,
      totalDistributedNio: double.parse(totalDistributed.toStringAsFixed(2)),
      totalDistributedUsd: totalDistributedUsd,
      commercialRate: rate,
    );
  }
}
