import '../../models/config/tax_regime.dart';
import '../../models/printer/receipt_document.dart';
import '../../models/sales/cart_item.dart';

/// Exception thrown when attempting to finalize a sale or print a receipt
/// without a valid DGI tax regime configured.
class FiscalConfigurationException implements Exception {
  final String message;
  const FiscalConfigurationException(this.message);

  @override
  String toString() => 'FiscalConfigurationException: $message';
}

/// Helper model for deterministic discount remainder apportionment (Largest Remainder method).
class _DiscountRemainder {
  final int index;
  final double remainder;
  final double gross;
  final int maxCents;

  const _DiscountRemainder({
    required this.index,
    required this.remainder,
    required this.gross,
    required this.maxCents,
  });
}

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
  final double exemptBase;
  final double nominalTaxRate;
  final double appliedTaxRate;
  final double taxAmount;

  /// Net pre-tax line base amount (grossAmount - discount).
  final double lineSubtotal;

  /// Total line amount including taxes (lineSubtotal + taxAmount).
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
    this.exemptBase = 0.0,
    required this.nominalTaxRate,
    required this.appliedTaxRate,
    required this.taxAmount,
    required this.lineSubtotal,
    required this.lineTotal,
  });
}

/// Comprehensive result of a fiscal sale calculation.
class FiscalCalculationResult {
  final TaxRegime? taxRegime;
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

  /// True if a valid DGI tax regime was provided during calculation.
  bool get isFiscalPolicyConfigured => taxRegime != null;
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

  /// Monetary rounding policy (Nicaragua C$ NIO & USD):
  /// Uses standard 2-decimal half-up rounding with an epsilon of 1e-9
  /// to eliminate IEEE-754 binary floating point precision artifacts.
  static double _round(double value) {
    if (value.isNaN || value.isInfinite) return 0.0;
    const epsilon = 1e-9;
    final adjusted = value + (value >= 0 ? epsilon : -epsilon);
    return ((adjusted * 100.0).roundToDouble()) / 100.0;
  }

  FiscalCalculationResult calculate({
    required List<CartItem> cart,
    TaxRegime? taxRegime,
    bool isGlobalTaxExempt = false,
    double totalDiscounts = 0.0,
    double commercialRate = 36.50,
    double bcnOfficialRate = 36.6241,
  }) {
    // 1. Calculate line gross amounts
    final lineGrosses = <double>[];
    double rawGrossTotal = 0.0;
    for (final item in cart) {
      final gross = _round((item.unitPrice * item.quantity) + item.modifiersTotal);
      lineGrosses.add(gross);
      rawGrossTotal += gross;
    }
    rawGrossTotal = _round(rawGrossTotal);

    final effectiveDiscountTotal = _round(
      totalDiscounts > rawGrossTotal ? rawGrossTotal : (totalDiscounts < 0.0 ? 0.0 : totalDiscounts),
    );

    // 2. Deterministic discount apportionment (Largest Remainder / Hare-Niemeyer method).
    // Invariant: SUM(lineDiscount) == effectiveDiscountTotal down to the exact cent.
    final lineDiscounts = List<double>.filled(cart.length, 0.0);
    if (rawGrossTotal > 0.0 && effectiveDiscountTotal > 0.0) {
      final targetCents = (effectiveDiscountTotal * 100.0).round();
      final baseCentsList = <int>[];
      final remainders = <_DiscountRemainder>[];
      var allocatedCents = 0;

      for (var i = 0; i < cart.length; i++) {
        final gross = lineGrosses[i];
        final exactLineCents = targetCents * (gross / rawGrossTotal);
        final baseCents = exactLineCents.floor();
        final maxLineCents = (gross * 100.0).round();
        final clampedBaseCents = baseCents > maxLineCents ? maxLineCents : baseCents;

        baseCentsList.add(clampedBaseCents);
        allocatedCents += clampedBaseCents;
        remainders.add(_DiscountRemainder(
          index: i,
          remainder: exactLineCents - baseCents,
          gross: gross,
          maxCents: maxLineCents,
        ));
      }

      var centsToDistribute = targetCents - allocatedCents;
      if (centsToDistribute > 0) {
        remainders.sort((a, b) {
          final remCmp = b.remainder.compareTo(a.remainder);
          if (remCmp != 0) return remCmp;
          final grossCmp = b.gross.compareTo(a.gross);
          if (grossCmp != 0) return grossCmp;
          return a.index.compareTo(b.index);
        });

        for (final r in remainders) {
          if (centsToDistribute <= 0) break;
          if (baseCentsList[r.index] < r.maxCents) {
            baseCentsList[r.index] += 1;
            centsToDistribute -= 1;
          }
        }
      }

      for (var i = 0; i < cart.length; i++) {
        lineDiscounts[i] = _round(baseCentsList[i] / 100.0);
      }
    }

    final lines = <FiscalLineCalculation>[];
    double subtotalAccum = 0.0;
    double taxableAccum = 0.0;
    double exemptAccum = 0.0;
    double taxAccum = 0.0;

    for (var i = 0; i < cart.length; i++) {
      final item = cart[i];
      final lineGross = lineGrosses[i];
      final lineDiscount = lineDiscounts[i];
      final netBase = _round(lineGross - lineDiscount > 0 ? lineGross - lineDiscount : 0.0);

      final double appliedRate;
      final double lineTax;
      final double lineTaxableBase;
      final double lineExemptBase;

      if (taxRegime == null) {
        // Unconfigured regime: safe non-assumptive baseline (0% tax, no synthetic exemption)
        appliedRate = 0.0;
        lineTax = 0.0;
        lineTaxableBase = 0.0;
        lineExemptBase = 0.0;
      } else if (taxRegime.isCuotaFija) {
        // Cuota Fija (Art. 244 Ley 822):
        // La empresa NO recauda IVA al consumidor.
        // NUNCA se cataloga como "venta exenta" ni se agrega IVA.
        appliedRate = 0.0;
        lineTax = 0.0;
        lineTaxableBase = 0.0;
        lineExemptBase = 0.0;
      } else {
        // Régimen General:
        if (isGlobalTaxExempt || item.taxRate == 0.0) {
          // Producto exento o política temporal de exención general
          appliedRate = 0.0;
          lineTax = 0.0;
          lineTaxableBase = 0.0;
          lineExemptBase = netBase;
        } else {
          // Producto gravado
          appliedRate = item.taxRate;
          lineTaxableBase = netBase;
          lineExemptBase = 0.0;
          lineTax = _round(lineTaxableBase * appliedRate);
        }
      }

      final lineSubtotal = netBase;
      final lineTotal = _round(netBase + lineTax);

      lines.add(FiscalLineCalculation(
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        modifiersTotal: item.modifiersTotal,
        grossAmount: lineGross,
        discount: lineDiscount,
        taxableBase: lineTaxableBase,
        exemptBase: lineExemptBase,
        nominalTaxRate: item.taxRate,
        appliedTaxRate: appliedRate,
        taxAmount: lineTax,
        lineSubtotal: lineSubtotal,
        lineTotal: lineTotal,
      ));

      subtotalAccum += lineSubtotal;
      if (taxRegime?.isRegimenGeneral == true) {
        if (appliedRate > 0) {
          taxableAccum += lineTaxableBase;
          taxAccum += lineTax;
        } else {
          exemptAccum += lineExemptBase;
        }
      }
    }

    final finalSubtotal = _round(subtotalAccum);
    final finalTaxable = _round(taxableAccum);
    final finalExempt = _round(exemptAccum);
    final finalTotalTax = (taxRegime?.isRegimenGeneral == true) ? _round(taxAccum) : 0.0;
    final finalTotal = _round(finalSubtotal + finalTotalTax);
    final commRate = commercialRate > 0 ? commercialRate : 36.50;
    final totalUsd = _round(finalTotal / commRate);

    return FiscalCalculationResult(
      taxRegime: taxRegime,
      lines: lines,
      grossSubtotal: rawGrossTotal,
      totalDiscount: effectiveDiscountTotal,
      subtotal: finalSubtotal,
      taxableSubtotal: finalTaxable,
      exemptSubtotal: finalExempt,
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
      final change = cashGivenNio - calculation.total > 0
          ? _round(cashGivenNio - calculation.total)
          : 0.0;
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
        grossAmount: l.grossAmount,
        discount: l.discount,
        taxableBase: l.taxableBase,
        exemptBase: l.exemptBase,
        taxRate: l.appliedTaxRate,
        taxAmount: l.taxAmount,
        lineSubtotal: l.lineSubtotal,
        lineTotal: l.lineTotal,
      );
    }).toList();

    if (calculation.taxRegime == null) {
      throw const FiscalConfigurationException(
        'No se puede emitir un comprobante fiscal sin un régimen fiscal DGI configurado.',
      );
    }

    final isDocTaxExempt = calculation.taxRegime!.isRegimenGeneral &&
        (calculation.exemptSubtotal > 0 && calculation.taxableSubtotal == 0);

    return ReceiptDocument(
      businessName: businessName?.trim().isNotEmpty == true ? businessName!.trim() : 'OMNIFOOD NI',
      legalName: legalName,
      ruc: businessRuc,
      taxRegime: calculation.taxRegime!,
      address: businessAddress,
      phone: businessPhone,
      documentTitle: calculation.taxRegime!.defaultReceiptTitle,
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
      isTaxExempt: isDocTaxExempt,
    );
  }
}
