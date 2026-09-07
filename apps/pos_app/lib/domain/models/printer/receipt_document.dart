import 'package:intl/intl.dart';
import '../config/tax_regime.dart';
import '../sales/invoice.dart';
import '../sales/invoice_item.dart';
import '../sales/payment.dart';

/// A modifier's precomputed, display-ready amount and scope. The renderer prints
/// [displayAmount] verbatim and never multiplies it by line quantity.
class ReceiptModifierDisplay {
  final String name;
  final String? displayAmount;
  final String scope;

  const ReceiptModifierDisplay({required this.name, this.displayAmount, this.scope = 'unit'});

  String get printableText => displayAmount == null || displayAmount!.isEmpty
      ? name
      : '$name ($scope: $displayAmount)';
}

/// Single item line in a printed or previewed receipt, already fiscally calculated.
class ReceiptLine {
  final double quantity;
  final String description;
  final double unitPrice;
  final double grossAmount;
  final double discount;
  final double taxableBase;
  final double exemptBase;
  final double taxRate;
  final double taxAmount;

  /// The pre-tax net line base amount displayed in the line breakdown column (unitPrice * qty - discount).
  final double lineSubtotal;

  /// The line total including taxes (lineSubtotal + taxAmount).
  final double lineTotal;

  final List<String> modifiers;
  final List<ReceiptModifierDisplay> modifierDisplays;
  final String? notes;

  const ReceiptLine({
    required this.quantity,
    required this.description,
    required this.unitPrice,
    this.grossAmount = 0.0,
    this.discount = 0.0,
    required this.taxableBase,
    this.exemptBase = 0.0,
    this.taxRate = 0.0,
    this.taxAmount = 0.0,
    double? lineSubtotal,
    required this.lineTotal,
    this.modifiers = const [],
    this.modifierDisplays = const [],
    this.notes,
  }) : lineSubtotal = lineSubtotal ?? taxableBase;

  /// Factory creating a [ReceiptLine] from domain [InvoiceItem].
  factory ReceiptLine.fromInvoiceItem(
    InvoiceItem item, {
    required TaxRegime taxRegime,
  }) {
    final qty = item.quantity;
    final unitPrice = item.unitPrice;
    final modifiersTotal = item.selectedModifiers.fold(0.0, (sum, m) => sum + m.extraPrice) * qty;
    final gross = (unitPrice * qty) + modifiersTotal;
    final discount = item.discount;
    final lineSubtotal = gross - discount > 0 ? gross - discount : 0.0;

    final double effectiveTaxRate;
    final double effectiveTaxAmount;
    final double effectiveTaxableBase;
    final double effectiveExemptBase;

    if (taxRegime.isCuotaFija) {
      effectiveTaxRate = 0.0;
      effectiveTaxAmount = 0.0;
      effectiveTaxableBase = 0.0;
      effectiveExemptBase = 0.0;
    } else {
      effectiveTaxRate = item.appliedTaxRate;
      effectiveTaxAmount = item.taxAmount;
      if (effectiveTaxRate > 0) {
        effectiveTaxableBase = lineSubtotal;
        effectiveExemptBase = 0.0;
      } else {
        effectiveTaxableBase = 0.0;
        effectiveExemptBase = lineSubtotal;
      }
    }

    final lineTotal = item.total > 0
        ? item.total
        : (taxRegime.isCuotaFija ? lineSubtotal : (lineSubtotal + effectiveTaxAmount));

    final modifierDisplays = item.selectedModifiers.map((m) => ReceiptModifierDisplay(
          name: m.name,
          displayAmount: m.extraPrice > 0 ? 'C\$ ${m.extraPrice.toStringAsFixed(2)}' : null,
          scope: 'por unidad',
        )).toList();

    return ReceiptLine(
      quantity: qty,
      description: item.productName,
      unitPrice: unitPrice,
      grossAmount: gross,
      discount: discount,
      taxableBase: effectiveTaxableBase,
      exemptBase: effectiveExemptBase,
      taxRate: effectiveTaxRate,
      taxAmount: effectiveTaxAmount,
      lineSubtotal: lineSubtotal,
      lineTotal: lineTotal,
      modifierDisplays: modifierDisplays,
      notes: item.notes,
    );
  }
}

/// Payment entry for printed or previewed receipts.
class ReceiptPayment {
  final String methodLabel;
  final String currency;
  final double amount;
  final double changeGiven;
  final String? changeCurrency;
  final String? reference;

  const ReceiptPayment({
    required this.methodLabel,
    required this.currency,
    required this.amount,
    this.changeGiven = 0.0,
    this.changeCurrency,
    this.reference,
  });

  factory ReceiptPayment.fromPayment(Payment p) {
    String label;
    String? ref;

    switch (p.method) {
      case PaymentMethod.cash:
        label = p.currency == 'USD' ? 'Efectivo USD' : 'Efectivo C\$';
        break;
      case PaymentMethod.card:
        final brand = p.cardBrand ?? 'TARJETA';
        final bank = p.bankPos != null ? ' (${p.bankPos})' : '';
        label = '$brand$bank';
        final voucher = p.voucherCode ?? 'PENDIENTE';
        final last4 = p.last4 != null ? ' (****${p.last4})' : '';
        ref = '$voucher$last4';
        break;
      case PaymentMethod.qr:
        label = 'Transferencia / QR';
        break;
      case PaymentMethod.points:
        label = 'Puntos Lealtad';
        break;
    }

    return ReceiptPayment(
      methodLabel: label,
      currency: p.currency,
      amount: p.amount,
      changeGiven: p.changeGiven,
      changeCurrency: p.changeCurrency,
      reference: ref,
    );
  }
}

/// Fully calculated, view-model representation of a sales receipt / invoice.
/// The printing renderer consumes this directly without performing any fiscal calculations.
class ReceiptDocument {
  final String businessName;
  final String? legalName;
  final String? ruc;
  final TaxRegime taxRegime;
  final String? address;
  final String? phone;
  final String? terminalId;

  final String documentTitle;
  final String documentNumber;
  final DateTime date;
  final String? cashierName;
  final String? customerName;
  final String? customerRuc;
  final String? originInvoiceId;

  final List<ReceiptLine> lines;

  final double subtotal;
  final double discountTotal;
  final double exemptSubtotal;
  final double taxableSubtotal;
  final double totalTax;
  final double total;

  final double commercialRate;
  final double bcnOfficialRate;
  final double totalUsd;

  final List<ReceiptPayment> payments;
  final String? footerMessage;
  final List<int>? logoRasterBytes;
  final bool isTaxExempt;
  final bool globalTaxOverride;

  const ReceiptDocument({
    required this.businessName,
    this.legalName,
    this.ruc,
    required this.taxRegime,
    this.address,
    this.phone,
    this.terminalId,
    required this.documentTitle,
    required this.documentNumber,
    required this.date,
    this.cashierName,
    this.customerName,
    this.customerRuc,
    this.originInvoiceId,
    required this.lines,
    required this.subtotal,
    this.discountTotal = 0.0,
    this.exemptSubtotal = 0.0,
    this.taxableSubtotal = 0.0,
    required this.totalTax,
    required this.total,
    this.commercialRate = 36.50,
    this.bcnOfficialRate = 36.6241,
    required this.totalUsd,
    this.payments = const [],
    this.footerMessage,
    this.logoRasterBytes,
    this.isTaxExempt = false,
    this.globalTaxOverride = false,
  });

  bool get isCuotaFija => taxRegime.isCuotaFija;
  bool get isGlobalTaxExempt => isTaxExempt || globalTaxOverride;

  /// Replaces only printer transport artwork; all fiscal presentation remains intact.
  ReceiptDocument withLogoRasterBytes(List<int>? logoBytes) => ReceiptDocument(
        businessName: businessName,
        legalName: legalName,
        ruc: ruc,
        taxRegime: taxRegime,
        address: address,
        phone: phone,
        terminalId: terminalId,
        documentTitle: documentTitle,
        documentNumber: documentNumber,
        date: date,
        cashierName: cashierName,
        customerName: customerName,
        customerRuc: customerRuc,
        originInvoiceId: originInvoiceId,
        lines: lines,
        subtotal: subtotal,
        discountTotal: discountTotal,
        exemptSubtotal: exemptSubtotal,
        taxableSubtotal: taxableSubtotal,
        totalTax: totalTax,
        total: total,
        commercialRate: commercialRate,
        bcnOfficialRate: bcnOfficialRate,
        totalUsd: totalUsd,
        payments: payments,
        footerMessage: footerMessage,
        logoRasterBytes: logoBytes,
        isTaxExempt: isTaxExempt,
        globalTaxOverride: globalTaxOverride,
      );
  String get regimeHeader => taxRegime.receiptRegimeHeader;
  String? get fiscalNotice => taxRegime.fiscalNotice;
  double get changeGiven => payments.fold(0.0, (sum, p) => sum + p.changeGiven);

  /// Builds a [ReceiptDocument] from an [Invoice] and related items and payments.
  factory ReceiptDocument.fromInvoice(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? legalName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    String? customerName,
    String? customerRuc,
    required TaxRegime taxRegime,
    bool isTaxExempt = false,
    String? footerMessage,
    List<int>? logoRasterBytes,
  }) {
    final receiptLines = items
        .map((item) => ReceiptLine.fromInvoiceItem(item, taxRegime: taxRegime))
        .toList();

    double computedSubtotal = 0.0;
    double computedDiscount = 0.0;
    double computedExempt = 0.0;
    double computedTaxable = 0.0;
    double computedTax = 0.0;

    for (final line in receiptLines) {
      computedSubtotal += line.lineSubtotal;
      computedDiscount += line.discount;
      if (taxRegime.isRegimenGeneral) {
        if (line.taxRate > 0) {
          computedTaxable += line.taxableBase;
        } else {
          computedExempt += line.exemptBase;
        }
      }
      computedTax += line.taxAmount;
    }

    final double effectiveSubtotal;
    final double effectiveTotalTax;
    final double effectiveTotal;

    if (taxRegime.isCuotaFija) {
      effectiveSubtotal = invoice.subtotal > 0 ? invoice.subtotal : computedSubtotal;
      effectiveTotalTax = 0.0;
      effectiveTotal = invoice.total > 0 ? invoice.total : effectiveSubtotal;
    } else {
      final isExemptEffective = isTaxExempt || invoice.globalTaxOverride;
      effectiveSubtotal = invoice.subtotal > 0 ? invoice.subtotal : computedSubtotal;
      effectiveTotalTax = isExemptEffective ? 0.0 : (invoice.totalTax > 0 ? invoice.totalTax : computedTax);
      effectiveTotal = invoice.total > 0
          ? invoice.total
          : (isExemptEffective ? effectiveSubtotal : (effectiveSubtotal + effectiveTotalTax));
    }

    final commRate = invoice.commercialRate > 0
        ? invoice.commercialRate
        : (invoice.bcnOfficialRate > 0 ? invoice.bcnOfficialRate : 36.50);
    final totalUsdCalc = invoice.totalUsd > 0
        ? invoice.totalUsd
        : (effectiveTotal / (commRate > 0 ? commRate : 36.50));

    final docTitle = _resolveDocTitle(invoice.type, taxRegime);

    return ReceiptDocument(
      businessName: businessName?.trim().isNotEmpty == true ? businessName!.trim() : 'OMNIFOOD NI',
      legalName: (legalName != null && legalName.trim().isNotEmpty && legalName.trim() != businessName?.trim())
          ? legalName.trim()
          : null,
      ruc: (ruc != null && ruc.trim().isNotEmpty) ? ruc.trim() : null,
      taxRegime: taxRegime,
      address: (address != null && address.trim().isNotEmpty) ? address.trim() : null,
      phone: (phone != null && phone.trim().isNotEmpty) ? phone.trim() : null,
      terminalId: invoice.terminalId,
      documentTitle: docTitle,
      documentNumber: invoice.number,
      date: invoice.createdAt,
      cashierName: (cashierName != null && cashierName.trim().isNotEmpty) ? cashierName.trim() : null,
      customerName: (customerName != null && customerName.trim().isNotEmpty)
          ? customerName.trim()
          : (invoice.customerId != null && invoice.customerId!.trim().isNotEmpty && invoice.customerId != 'N/A'
              ? invoice.customerId!.trim()
              : null),
      customerRuc: (customerRuc != null && customerRuc.trim().isNotEmpty && customerRuc != 'N/A')
          ? customerRuc.trim()
          : null,
      originInvoiceId: invoice.originInvoiceId,
      lines: receiptLines,
      subtotal: effectiveSubtotal,
      discountTotal: computedDiscount,
      exemptSubtotal: computedExempt,
      taxableSubtotal: computedTaxable,
      totalTax: effectiveTotalTax,
      total: effectiveTotal,
      commercialRate: commRate,
      bcnOfficialRate: invoice.bcnOfficialRate > 0 ? invoice.bcnOfficialRate : 36.6241,
      totalUsd: totalUsdCalc,
      payments: payments.map(ReceiptPayment.fromPayment).toList(),
      footerMessage: footerMessage,
      logoRasterBytes: logoRasterBytes,
      isTaxExempt: taxRegime.isRegimenGeneral &&
          (isTaxExempt || invoice.globalTaxOverride || (computedExempt > 0 && computedTaxable == 0)),
      globalTaxOverride: invoice.globalTaxOverride,
    );
  }

  static String _resolveDocTitle(InvoiceType type, TaxRegime regime) {
    if (type == InvoiceType.creditNote) return 'NOTA DE CREDITO';
    return regime.isCuotaFija ? 'COMPROBANTE DE VENTA' : 'FACTURA DE VENTA';
  }
}
