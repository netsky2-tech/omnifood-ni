import 'package:intl/intl.dart';
import '../../models/config/tax_regime.dart';
import '../../models/sales/cashier_session.dart';
import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';
import 'esc_pos_builder.dart';

/// Highly modular, robust layout engine and ticket generator for 58mm (32 cols) and 80mm (48 cols)
/// thermal printers. Compliant with Nicaraguan fiscal rules (DGI Disposición Técnica 09-2007 & Ley 822).
class ReceiptLayoutFormatter {
  final int maxCols;
  final int maxImageWidth;
  final int maxImageHeight;

  const ReceiptLayoutFormatter({
    this.maxCols = 32,
    this.maxImageWidth = 384,
    this.maxImageHeight = 160,
  });

  /// 58mm Thermal Printer Mode (32 Columns, max 384px image width)
  factory ReceiptLayoutFormatter.format58mm() => const ReceiptLayoutFormatter(
        maxCols: 32,
        maxImageWidth: 384,
        maxImageHeight: 160,
      );

  /// 80mm Thermal Printer Mode (48 Columns, max 576px image width)
  factory ReceiptLayoutFormatter.format80mm() => const ReceiptLayoutFormatter(
        maxCols: 48,
        maxImageWidth: 576,
        maxImageHeight: 160,
      );

  /// Resolves formatter dynamically based on configured paper width in millimeters.
  factory ReceiptLayoutFormatter.fromPaperWidth(int paperWidthMm) {
    if (paperWidthMm >= 80) {
      return ReceiptLayoutFormatter.format80mm();
    }
    return ReceiptLayoutFormatter.format58mm();
  }

  // ==========================================
  // 1. Column Formatting & Text Helpers
  // ==========================================

  /// Centers [text] within [maxCols] characters. If text exceeds maxCols, it wraps and centers each line.
  List<String> centerLines(String text) {
    final clean = text.trim();
    if (clean.length <= maxCols) {
      final leftPadding = (maxCols - clean.length) ~/ 2;
      final rightPadding = maxCols - clean.length - leftPadding;
      return ['${' ' * leftPadding}$clean${' ' * rightPadding}'];
    }
    final lines = wrap(clean);
    return lines.map((l) {
      final leftPadding = (maxCols - l.length) ~/ 2;
      final rightPadding = maxCols - l.length - leftPadding;
      return '${' ' * leftPadding}$l${' ' * rightPadding}';
    }).toList();
  }

  /// Centers single line [text] within [maxCols] characters (truncates if too long).
  String center(String text) {
    final clean = text.trim();
    if (clean.length >= maxCols) return clean.substring(0, maxCols);
    final leftPadding = (maxCols - clean.length) ~/ 2;
    final rightPadding = maxCols - clean.length - leftPadding;
    return '${' ' * leftPadding}$clean${' ' * rightPadding}';
  }

  /// Generates a continuous horizontal rule line of [char] with length [maxCols].
  String drawLine([String char = '-']) {
    return char * maxCols;
  }

  /// Formats two strings on the same line, with [leftText] aligned to the left
  /// and [rightText] strictly aligned to the right, strictly fitting in [maxCols] columns.
  /// If [leftText] overflows, it is safely truncated without displacing the right amount.
  String formatTwoColumns(String leftText, String rightText) {
    final cleanLeft = leftText.trim();
    final cleanRight = rightText.trim();

    if (cleanRight.length >= maxCols) {
      return cleanRight.substring(0, maxCols);
    }

    final maxLeftLen = maxCols - cleanRight.length - 1;
    final adjustedLeft = cleanLeft.length > maxLeftLen
        ? cleanLeft.substring(0, maxLeftLen)
        : cleanLeft;

    final spaces = maxCols - adjustedLeft.length - cleanRight.length;
    return '$adjustedLeft${' ' * (spaces > 0 ? spaces : 1)}$cleanRight';
  }

  /// Formats an item row adhering to exact 58mm (2 lines) or 80mm (single row grid) specs.
  ///
  /// - 58mm Mode (32 cols):
  ///   Line 1: "$qty $name"
  ///   Line 2: "  @ C$ $unitPrice" (left) ... "C$ $total" (right)
  /// - 80mm Mode (48 cols):
  ///   Single row grid: Qty (4) + Name (22) + UnitPrice (10) + Total (12)
  List<String> formatItemRow({
    required double quantity,
    required String name,
    required double unitPrice,
    required double total,
    String currencySymbol = 'C\$',
  }) {
    final qtyStr = quantity % 1 == 0
        ? quantity.toInt().toString()
        : quantity.toStringAsFixed(2);
    final unitPriceStr = '$currencySymbol ${unitPrice.toStringAsFixed(2)}';
    final totalStr = '$currencySymbol ${total.toStringAsFixed(2)}';

    if (maxCols <= 38) {
      // 58mm Mode (32 cols)
      final lines = <String>[];
      final itemHeader = '$qtyStr x $name';
      for (final line in wrap(itemHeader, maxCols)) {
        lines.add(line);
      }
      lines.add(formatTwoColumns('  @ $unitPriceStr', totalStr));
      return lines;
    } else {
      // 80mm Mode (48 cols)
      // Grid breakdown: Qty (4 cols) | Name (22 cols) | P.Unit (10 cols) | Total (12 cols) = 48 cols
      final colQty = qtyStr.padRight(4);
      final colTotal = totalStr.padLeft(12);
      final colUnitPrice = unitPriceStr.padLeft(10);
      const nameWidth = 22;

      final wrappedNames = wrap(name.trim(), nameWidth);
      final lines = <String>[];

      for (int i = 0; i < wrappedNames.length; i++) {
        final nameChunk = wrappedNames[i].padRight(nameWidth);
        if (i == 0) {
          lines.add('$colQty$nameChunk$colUnitPrice$colTotal');
        } else {
          lines.add('${' ' * 4}$nameChunk${' ' * 22}');
        }
      }
      return lines;
    }
  }

  /// Wraps long text into lines of at most [width] characters.
  List<String> wrap(String text, [int? width]) {
    final effectiveWidth = width ?? maxCols;
    final words = text.trim().split(RegExp(r'\s+'));
    final lines = <String>[];
    var currentLine = '';

    for (final word in words) {
      if (currentLine.isEmpty) {
        if (word.length <= effectiveWidth) {
          currentLine = word;
        } else {
          var rem = word;
          while (rem.length > effectiveWidth) {
            lines.add(rem.substring(0, effectiveWidth));
            rem = rem.substring(effectiveWidth);
          }
          currentLine = rem;
        }
      } else if (currentLine.length + 1 + word.length <= effectiveWidth) {
        currentLine += ' $word';
      } else {
        lines.add(currentLine);
        if (word.length <= effectiveWidth) {
          currentLine = word;
        } else {
          var rem = word;
          while (rem.length > effectiveWidth) {
            lines.add(rem.substring(0, effectiveWidth));
            rem = rem.substring(effectiveWidth);
          }
          currentLine = rem;
        }
      }
    }
    if (currentLine.isNotEmpty) {
      lines.add(currentLine);
    }
    return lines;
  }

  // ==========================================
  // 2. DGI Ticket Generation Logic (Ley 822)
  // ==========================================

  /// Formats the complete customer sales receipt in plain text adhering to Nicaraguan tax laws.
  String formatInvoiceText(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? legalName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
  }) {
    final buffer = StringBuffer();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    // 1. Header (Centered)
    buffer.writeln(center(businessName ?? 'OMNIFOOD NI'));
    if (legalName != null && legalName.isNotEmpty && legalName != businessName) {
      buffer.writeln(center(legalName));
    }
    if (ruc != null && ruc.isNotEmpty) {
      buffer.writeln(center('RUC: $ruc'));
    }

    // Regime Identification
    if (taxRegime.isCuotaFija) {
      buffer.writeln(center('REGIMEN: CUOTA FIJA'));
    } else {
      buffer.writeln(center('REGIMEN: GENERAL'));
    }

    if (address != null && address.isNotEmpty) {
      for (final line in wrap(address)) {
        buffer.writeln(center(line));
      }
    }
    if (phone != null && phone.isNotEmpty) {
      buffer.writeln(center('Tel: $phone'));
    }

    // Short Terminal Alias (avoid full UUID)
    final shortTerminal = _formatShortTerminal(invoice.terminalId);
    if (shortTerminal.isNotEmpty) {
      buffer.writeln(center('Caja: $shortTerminal'));
    }

    buffer.writeln(drawLine('='));

    // Document Title & Number
    final docTitle = _resolveDocumentTitle(invoice.type, taxRegime);
    buffer.writeln(center(docTitle));
    buffer.writeln(center('No. ${invoice.number}'));
    buffer.writeln(formatTwoColumns('Fecha:', dateFormat.format(invoice.createdAt)));

    if (cashierName != null && cashierName.isNotEmpty) {
      buffer.writeln(formatTwoColumns('Atendido por:', cashierName));
    }
    if (invoice.customerId != null && invoice.customerId!.isNotEmpty) {
      buffer.writeln(formatTwoColumns('Cliente:', invoice.customerId!));
    }
    if (invoice.originInvoiceId != null && invoice.originInvoiceId!.isNotEmpty) {
      buffer.writeln(formatTwoColumns('Doc. Origen:', invoice.originInvoiceId!));
    }

    buffer.writeln(drawLine('-'));

    // 2. Table Column Header
    if (maxCols <= 38) {
      buffer.writeln(formatTwoColumns('CANT DESCRIPCION', 'TOTAL'));
    } else {
      buffer.writeln('CANT'.padRight(4) + 'DESCRIPCION'.padRight(22) + 'P.UNIT'.padLeft(10) + 'TOTAL'.padLeft(12));
    }
    buffer.writeln(drawLine('-'));

    // 3. Items Breakdown
    for (final item in items) {
      final rowLines = formatItemRow(
        quantity: item.quantity,
        name: item.productName,
        unitPrice: item.unitPrice,
        total: item.total,
      );
      for (final l in rowLines) {
        buffer.writeln(l);
      }

      // Modifiers & Extras
      for (final mod in item.selectedModifiers) {
        final modPrice = mod.extraPrice > 0 ? ' (+C\$ ${mod.extraPrice.toStringAsFixed(2)})' : '';
        buffer.writeln('    + ${mod.name}$modPrice');
      }

      // Item Discounts
      if (item.discount > 0) {
        buffer.writeln('    - Desc: C\$ ${item.discount.toStringAsFixed(2)}');
      }

      // Item Notes
      if (item.notes != null && item.notes!.isNotEmpty) {
        for (final line in wrap(item.notes!, maxCols - 6)) {
          buffer.writeln('    * $line');
        }
      }
    }

    buffer.writeln(drawLine('-'));

    // 4. Totals & Tax Compliance Rules (Ley 822)
    if (taxRegime.isCuotaFija) {
      // CUOTA FIJA: Never disclose Subtotal or 15% IVA. Direct to TOTAL CORDOBAS.
      buffer.writeln(formatTwoColumns('TOTAL CORDOBAS:', 'C\$ ${invoice.total.toStringAsFixed(2)}'));
    } else {
      // REGIMEN GENERAL
      final effectiveExempt = isTaxExempt || invoice.globalTaxOverride;
      if (effectiveExempt) {
        buffer.writeln(formatTwoColumns('SUBTOTAL:', 'C\$ ${invoice.subtotal.toStringAsFixed(2)}'));
        buffer.writeln(formatTwoColumns('VENTA EXENTA (IVA 0%):', 'C\$ 0.00'));
        buffer.writeln(formatTwoColumns('TOTAL CORDOBAS:', 'C\$ ${invoice.total.toStringAsFixed(2)}'));
        for (final line in centerLines('** VENTA EXENTA DE IVA - POLITICA TEMPORAL **')) {
          buffer.writeln(line);
        }
      } else {
        buffer.writeln(formatTwoColumns('SUBTOTAL:', 'C\$ ${invoice.subtotal.toStringAsFixed(2)}'));
        buffer.writeln(formatTwoColumns('IVA (15%):', 'C\$ ${invoice.totalTax.toStringAsFixed(2)}'));
        buffer.writeln(formatTwoColumns('TOTAL CORDOBAS:', 'C\$ ${invoice.total.toStringAsFixed(2)}'));
      }
    }

    // USD Total Calculation
    final commRate = invoice.commercialRate > 0
        ? invoice.commercialRate
        : (invoice.bcnOfficialRate > 0 ? invoice.bcnOfficialRate : 36.50);
    final totalUsdCalc = invoice.totalUsd > 0
        ? invoice.totalUsd
        : (invoice.total / commRate);
    buffer.writeln(formatTwoColumns('TOTAL DOLARES:', '\$ ${totalUsdCalc.toStringAsFixed(2)}'));

    buffer.writeln(drawLine('-'));
    buffer.writeln(formatTwoColumns('Tipo de Cambio:', 'C\$ ${commRate.toStringAsFixed(2)}'));

    buffer.writeln(drawLine('-'));
    buffer.writeln(center('DETALLE DE PAGO'));

    // 5. Payment Breakdown
    if (payments.isEmpty) {
      buffer.writeln(formatTwoColumns('Condicion:', 'Contado'));
    } else {
      for (final p in payments) {
        switch (p.method) {
          case PaymentMethod.cash:
            if (p.currency == 'USD') {
              buffer.writeln(formatTwoColumns('Efectivo USD:', '\$ ${p.amount.toStringAsFixed(2)}'));
              if (p.changeGiven > 0) {
                final cCurr = p.changeCurrency == 'USD' ? '\$ ' : 'C\$ ';
                buffer.writeln(formatTwoColumns('Cambio (${p.changeCurrency}):', '$cCurr${p.changeGiven.toStringAsFixed(2)}'));
              }
            } else {
              buffer.writeln(formatTwoColumns('Efectivo C\$:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
              if (p.changeGiven > 0) {
                buffer.writeln(formatTwoColumns('Cambio C\$:', 'C\$ ${p.changeGiven.toStringAsFixed(2)}'));
              }
            }
            break;
          case PaymentMethod.card:
            final bank = p.bankPos ?? 'POS';
            final brand = p.cardBrand ?? 'TARJETA';
            buffer.writeln(formatTwoColumns('$brand ($bank):', 'C\$ ${p.amount.toStringAsFixed(2)}'));
            final auth = p.voucherCode ?? 'PENDIENTE';
            final last4 = p.last4 != null ? ' (****${p.last4})' : '';
            buffer.writeln(formatTwoColumns('  Auth/Ref:', '$auth$last4'));
            break;
          case PaymentMethod.qr:
            buffer.writeln(formatTwoColumns('Transferencia / QR:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
            break;
          case PaymentMethod.points:
            buffer.writeln(formatTwoColumns('Puntos Lealtad:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
            break;
        }
      }
    }

    buffer.writeln(drawLine('='));
    buffer.writeln(center('*** GRACIAS POR SU COMPRA ***'));
    buffer.writeln('');
    buffer.writeln('');
    buffer.writeln('');

    return buffer.toString();
  }

  /// Formats the complete sales receipt into ESC/POS bytecode.
  List<int> formatInvoiceEscPos(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? legalName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    List<int>? logoRasterBytes,
  }) {
    final builder = EscPosBuilder();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    // 1. Logo (if provided as 1-bit raster)
    if (logoRasterBytes != null && logoRasterBytes.isNotEmpty) {
      builder.rasterImage(logoRasterBytes).feedLines(1);
    }

    // 2. Header
    builder
        .align(EscPosAlign.center)
        .bold(true)
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine(businessName ?? 'OMNIFOOD NI')
        .fontSize(EscPosFontSize.normal)
        .bold(false);

    if (legalName != null && legalName.isNotEmpty && legalName != businessName) {
      builder.textLine(legalName);
    }
    if (ruc != null && ruc.isNotEmpty) {
      builder.textLine('RUC: $ruc');
    }
    if (taxRegime.isCuotaFija) {
      builder.bold(true).textLine('REGIMEN: CUOTA FIJA').bold(false);
    } else {
      builder.textLine('REGIMEN: GENERAL');
    }
    if (address != null && address.isNotEmpty) {
      for (final line in wrap(address)) {
        builder.textLine(line);
      }
    }
    if (phone != null && phone.isNotEmpty) {
      builder.textLine('Tel: $phone');
    }

    final shortTerminal = _formatShortTerminal(invoice.terminalId);
    if (shortTerminal.isNotEmpty) {
      builder.textLine('Caja: $shortTerminal');
    }

    // Document Info
    final docTitle = _resolveDocumentTitle(invoice.type, taxRegime);
    builder
        .textLine(drawLine('='))
        .bold(true)
        .textLine(docTitle)
        .textLine('No. ${invoice.number}')
        .bold(false)
        .align(EscPosAlign.left)
        .textLine(formatTwoColumns('Fecha:', dateFormat.format(invoice.createdAt)));

    if (cashierName != null && cashierName.isNotEmpty) {
      builder.textLine(formatTwoColumns('Atendido por:', cashierName));
    }
    if (invoice.customerId != null && invoice.customerId!.isNotEmpty) {
      builder.textLine(formatTwoColumns('Cliente:', invoice.customerId!));
    }

    builder.textLine(drawLine('-'));

    // 3. Items Header
    if (maxCols <= 38) {
      builder.textLine(formatTwoColumns('CANT DESCRIPCION', 'TOTAL'));
    } else {
      builder.textLine('CANT'.padRight(4) + 'DESCRIPCION'.padRight(22) + 'P.UNIT'.padLeft(10) + 'TOTAL'.padLeft(12));
    }
    builder.textLine(drawLine('-'));

    // Items Body
    for (final item in items) {
      final rowLines = formatItemRow(
        quantity: item.quantity,
        name: item.productName,
        unitPrice: item.unitPrice,
        total: item.total,
      );
      for (final l in rowLines) {
        builder.textLine(l);
      }

      for (final mod in item.selectedModifiers) {
        final modPrice = mod.extraPrice > 0 ? ' (+C\$ ${mod.extraPrice.toStringAsFixed(2)})' : '';
        builder.textLine('    + ${mod.name}$modPrice');
      }

      if (item.discount > 0) {
        builder.textLine('    - Desc: C\$ ${item.discount.toStringAsFixed(2)}');
      }
      if (item.notes != null && item.notes!.isNotEmpty) {
        for (final line in wrap(item.notes!, maxCols - 6)) {
          builder.textLine('    * $line');
        }
      }
    }

    builder.textLine(drawLine('-'));

    // 4. Totals & Tax Compliance (Ley 822)
    if (taxRegime.isCuotaFija) {
      builder
          .bold(true)
          .textLine(formatTwoColumns('TOTAL CORDOBAS:', 'C\$ ${invoice.total.toStringAsFixed(2)}'))
          .bold(false);
    } else {
      final effectiveExempt = isTaxExempt || invoice.globalTaxOverride;
      if (effectiveExempt) {
        builder
            .textLine(formatTwoColumns('SUBTOTAL:', 'C\$ ${invoice.subtotal.toStringAsFixed(2)}'))
            .textLine(formatTwoColumns('VENTA EXENTA (IVA 0%):', 'C\$ 0.00'))
            .bold(true)
            .textLine(formatTwoColumns('TOTAL CORDOBAS:', 'C\$ ${invoice.total.toStringAsFixed(2)}'))
            .bold(false)
            .align(EscPosAlign.center);
        for (final line in centerLines('** VENTA EXENTA DE IVA - POLITICA TEMPORAL **')) {
          builder.textLine(line);
        }
        builder.align(EscPosAlign.left);
      } else {
        builder
            .textLine(formatTwoColumns('SUBTOTAL:', 'C\$ ${invoice.subtotal.toStringAsFixed(2)}'))
            .textLine(formatTwoColumns('IVA (15%):', 'C\$ ${invoice.totalTax.toStringAsFixed(2)}'))
            .bold(true)
            .textLine(formatTwoColumns('TOTAL CORDOBAS:', 'C\$ ${invoice.total.toStringAsFixed(2)}'))
            .bold(false);
      }
    }

    final commRate = invoice.commercialRate > 0
        ? invoice.commercialRate
        : (invoice.bcnOfficialRate > 0 ? invoice.bcnOfficialRate : 36.50);
    final totalUsdCalc = invoice.totalUsd > 0
        ? invoice.totalUsd
        : (invoice.total / commRate);
    builder
        .textLine(formatTwoColumns('TOTAL DOLARES:', '\$ ${totalUsdCalc.toStringAsFixed(2)}'))
        .textLine(drawLine('-'))
        .textLine(formatTwoColumns('Tipo de Cambio:', 'C\$ ${commRate.toStringAsFixed(2)}'))
        .textLine(drawLine('-'))
        .align(EscPosAlign.center)
        .textLine('DETALLE DE PAGO')
        .align(EscPosAlign.left);

    // 5. Payments
    if (payments.isEmpty) {
      builder.textLine(formatTwoColumns('Condicion:', 'Contado'));
    } else {
      for (final p in payments) {
        if (p.method == PaymentMethod.cash) {
          builder.textLine(formatTwoColumns('Efectivo ${p.currency}:', '${p.currency == "USD" ? "\$ " : "C\$ "}${p.amount.toStringAsFixed(2)}'));
          if (p.changeGiven > 0) {
            builder.textLine(formatTwoColumns('Cambio (${p.changeCurrency}):', '${p.changeCurrency == "USD" ? "\$ " : "C\$ "}${p.changeGiven.toStringAsFixed(2)}'));
          }
        } else if (p.method == PaymentMethod.card) {
          builder.textLine(formatTwoColumns('${p.cardBrand ?? "TARJETA"} (${p.bankPos ?? "POS"}):', 'C\$ ${p.amount.toStringAsFixed(2)}'));
          builder.textLine(formatTwoColumns('  Auth/Ref:', '${p.voucherCode ?? "PENDIENTE"}'));
        } else if (p.method == PaymentMethod.qr) {
          builder.textLine(formatTwoColumns('Transferencia / QR:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
        } else if (p.method == PaymentMethod.points) {
          builder.textLine(formatTwoColumns('Puntos Lealtad:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
        }
      }
    }

    builder
        .textLine(drawLine('='))
        .align(EscPosAlign.center)
        .bold(true)
        .textLine('*** GRACIAS POR SU COMPRA ***')
        .bold(false)
        .feedLines(3)
        .cut();

    return builder.toBytes();
  }

  // ==========================================
  // Helper Private Methods
  // ==========================================

  static String _formatShortTerminal(String? terminalId) {
    if (terminalId == null || terminalId.isEmpty) return '';
    if (terminalId.length <= 8) return terminalId;
    return 'Caja-${terminalId.substring(0, 4)}';
  }

  static String _resolveDocumentTitle(InvoiceType type, TaxRegime regime) {
    if (type == InvoiceType.creditNote) return 'NOTA DE CREDITO';
    return regime.isCuotaFija ? 'COMPROBANTE DE VENTA' : 'FACTURA DE VENTA';
  }
}
