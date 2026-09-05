import '../../models/config/tax_regime.dart';
import '../../models/printer/receipt_document.dart';
import '../../models/sales/cart_item.dart';

/// Calculation result for an individual sale line.
class FiscalLineCalculation {
  final String productId;
  final String productName;
  final double quantity;
  final double unitPrice;
  final double modifiersTotal;
  final double grossAmount;
  final double discount;
  final double taxableBase;
  final double nominalTaxRate;
  final double appliedTaxRate;
  final double taxAmount;

  /// Net pre-tax line total (taxableBase) for item detail display.
  final double lineTotal;

  const FiscalLineCalculation({
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.modifiersTotal,
    required this.grossAmount,
    required this.discount,
    required this.taxableBase,
    required this.nominalTaxRate,
    required this.appliedTaxRate,
    required this.taxAmount,
    required this.lineTotal,
  });
}

/// Comprehensive result of a fiscal sale calculation.
class FiscalCalculationResult {
  final TaxRegime taxRegime;
  final List<FiscalLineCalculation> lines;
  final double grossSubtotal;
  final double totalDiscount;
  final double subtotal;
  final double taxableSubtotal;
  final double exemptSubtotal;
  final double totalTax;
  final double total;
  final double commercialRate;
  final double bcnOfficialRate;
  final double totalUsd;

  const FiscalCalculationResult({
    required this.taxRegime,
    required this.lines,
    required this.grossSubtotal,
    required this.totalDiscount,
    required this.subtotal,
    required this.taxableSubtotal,
    required this.exemptSubtotal,
    required this.totalTax,
    required this.total,
    required this.commercialRate,
    required this.bcnOfficialRate,
    required this.totalUsd,
  });
}

/// Domain service responsible for computing sales taxes and line subtotals according
/// to Nicaraguan DGI regulations (Disposición Técnica 09-2007 & Ley 822).
///
/// Rules:
/// - [TaxRegime.cuotaFija]:
///   Never adds or transfers IVA (15%). Lines and totals equal the net subtotal.
///   `taxAmount = 0.0`, `totalTax = 0.0`, `total = subtotal`.
/// - [TaxRegime.regimenGeneral]:
///   Standard fiscal regime. Taxable items apply 15% IVA on the taxable base.
///   Truly exempt items (taxRate == 0.0 or globalTaxExempt override) have 0% IVA.
///   Detail line column represents the net taxable base (`quantity * unitPrice - discount`),
///   and IVA is summarized in the document footer summary.
class InvoiceFiscalCalculator {
  const InvoiceFiscalCalculator();

  FiscalCalculationResult calculate({
    required List<CartItem> cart,
    required TaxRegime taxRegime,
    bool isGlobalTaxExempt = false,
    double totalDiscounts = 0.0,
    double commercialRate = 36.50,
    double bcnOfficialRate = 36.6241,
  }) {
    double rawGrossTotal = 0.0;
    for (final item in cart) {
      final lineGross = (item.unitPrice * item.quantity) + item.modifiersTotal;
      rawGrossTotal += lineGross;
    }

    final effectiveDiscountTotal = totalDiscounts > rawGrossTotal ? rawGrossTotal : totalDiscounts;

    final lines = <FiscalLineCalculation>[];
    double subtotalAccum = 0.0;
    double taxableAccum = 0.0;
    double exemptAccum = 0.0;
    double taxAccum = 0.0;

    for (final item in cart) {
      final lineGross = (item.unitPrice * item.quantity) + item.modifiersTotal;
      final lineDiscount = rawGrossTotal > 0
          ? (effectiveDiscountTotal * (lineGross / rawGrossTotal))
          : 0.0;
      final taxableBase = lineGross - lineDiscount > 0 ? lineGross - lineDiscount : 0.0;

      final double appliedRate;
      final double lineTax;

      if (taxRegime.isCuotaFija || isGlobalTaxExempt) {
        appliedRate = 0.0;
        lineTax = 0.0;
      } else {
        appliedRate = item.taxRate;
        lineTax = taxableBase * appliedRate;
      }

      // The line column value in receipt item tables represents the net pre-tax base.
      final lineTotal = taxableBase;

      lines.add(FiscalLineCalculation(
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        modifiersTotal: item.modifiersTotal,
        grossAmount: lineGross,
        discount: lineDiscount,
        taxableBase: taxableBase,
        nominalTaxRate: item.taxRate,
        appliedTaxRate: appliedRate,
        taxAmount: lineTax,
        lineTotal: lineTotal,
      ));

      subtotalAccum += taxableBase;
      if (appliedRate > 0) {
        taxableAccum += taxableBase;
        taxAccum += lineTax;
      } else {
        exemptAccum += taxableBase;
      }
    }

    final finalTotalTax = taxRegime.isCuotaFija ? 0.0 : taxAccum;
    final finalTotal = subtotalAccum + finalTotalTax;
    final commRate = commercialRate > 0 ? commercialRate : 36.50;
    final totalUsd = ((finalTotal / commRate) * 100).round() / 100;

    return FiscalCalculationResult(
      taxRegime: taxRegime,
      lines: lines,
      grossSubtotal: rawGrossTotal,
      totalDiscount: effectiveDiscountTotal,
      subtotal: subtotalAccum,
      taxableSubtotal: taxableAccum,
      exemptSubtotal: exemptAccum,
      totalTax: finalTotalTax,
      total: finalTotal,
      commercialRate: commRate,
      bcnOfficialRate: bcnOfficialRate > 0 ? bcnOfficialRate : 36.6241,
      totalUsd: totalUsd,
    );
  }

  /// Builds a [ReceiptDocument] from a [FiscalCalculationResult] for rendering or live preview.
  ReceiptDocument buildReceiptDocument({
    required FiscalCalculationResult calculation,
    required String invoiceNumber,
    String? businessName,
    String? legalName,
    String? businessRuc,
    String? businessAddress,
    String? businessPhone,
    String? cashierName,
    String? customerName,
    String? customerRuc,
    DateTime? date,
    double? cashGivenNio,
    double? cashGivenUsd,
    String? footerMessage,
    List<ReceiptPayment>? payments,
    List<int>? logoRasterBytes,
  }) {
    final effectivePayments = <ReceiptPayment>[];
    if (payments != null && payments.isNotEmpty) {
      effectivePayments.addAll(payments);
    } else if (cashGivenNio != null && cashGivenNio > 0) {
      final change = cashGivenNio - calculation.total > 0 ? cashGivenNio - calculation.total : 0.0;
      effectivePayments.add(ReceiptPayment(
        methodLabel: 'Efectivo C\$',
        currency: 'NIO',
        amount: calculation.total,
        changeGiven: change,
      ));
    }

    final receiptLines = calculation.lines.map((l) {
      return ReceiptLine(
        quantity: l.quantity,
        description: l.productName,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxableBase: l.taxableBase,
        taxRate: l.appliedTaxRate,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
      );
    }).toList();

    return ReceiptDocument(
      businessName: businessName?.trim().isNotEmpty == true ? businessName!.trim() : 'OMNIFOOD NI',
      legalName: legalName,
      ruc: businessRuc,
      taxRegime: calculation.taxRegime,
      address: businessAddress,
      phone: businessPhone,
      documentTitle: calculation.taxRegime.defaultReceiptTitle,
      documentNumber: invoiceNumber,
      date: date ?? DateTime.now(),
      cashierName: cashierName,
      customerName: customerName,
      customerRuc: customerRuc,
      lines: receiptLines,
      subtotal: calculation.subtotal,
      discountTotal: calculation.totalDiscount,
      exemptSubtotal: calculation.exemptSubtotal,
      taxableSubtotal: calculation.taxableSubtotal,
      totalTax: calculation.totalTax,
      total: calculation.total,
      commercialRate: calculation.commercialRate,
      bcnOfficialRate: calculation.bcnOfficialRate,
      totalUsd: calculation.totalUsd,
      payments: effectivePayments,
      footerMessage: footerMessage,
      logoRasterBytes: logoRasterBytes,
      isTaxExempt: calculation.exemptSubtotal > 0 && calculation.taxableSubtotal == 0,
    );
  }
}
