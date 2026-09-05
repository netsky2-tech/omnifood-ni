import 'package:intl/intl.dart';
import '../../models/config/tax_regime.dart';
import '../../models/printer/receipt_document.dart';
import '../../models/sales/cashier_session.dart';
import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';
import 'esc_pos_builder.dart';
import 'receipt_layout_metrics.dart';

/// Highly modular, robust layout engine and ticket generator for 58mm (32 cols) and 80mm (48 cols)
/// thermal printers. Strictly adheres to Nicaraguan tax laws (DGI Disposición Técnica 09-2007 & Ley 822).
///
/// Principles:
/// - Pure visual presentation layer: consumes pre-calculated figures from [ReceiptDocument].
/// - Zero fiscal logic or tax calculation inside layout/printer formatting.
/// - Full-width dynamic dividers based on exact printable width.
/// - Right-aligned monetary values with consistent thousands separators.
/// - Distinct layout compositions: 58mm 2-tier vertical vs 80mm 4-column tabular grid.
/// - Robust word-wrapping with hanging indents to prevent truncation of cashier/client/product names.
class ReceiptLayoutFormatter {
  final ReceiptLayoutMetrics metrics;

  ReceiptLayoutFormatter(this.metrics);

  int get maxCols => metrics.printableWidth;
  int get maxImageWidth => metrics.maxImageWidth;
  int get maxImageHeight => metrics.maxImageHeight;

  /// 58mm Thermal Printer Mode (32 Columns, max 384px image width)
  factory ReceiptLayoutFormatter.format58mm() => ReceiptLayoutFormatter(
        ReceiptLayoutMetrics.mm58(),
      );

  /// 80mm Thermal Printer Mode (48 Columns, max 576px image width)
  factory ReceiptLayoutFormatter.format80mm() => ReceiptLayoutFormatter(
        ReceiptLayoutMetrics.mm80(),
      );

  /// Resolves formatter dynamically based on configured paper width in millimeters.
  factory ReceiptLayoutFormatter.fromPaperWidth(int paperWidthMm) => ReceiptLayoutFormatter(
        ReceiptLayoutMetrics.fromPaperWidth(paperWidthMm),
      );

  // ==========================================
  // 1. Column Formatting & Text Helpers
  // ==========================================

  /// Formats monetary amount with thousands separator and two decimal places.
  /// Example: C$ 1,234.50 or $ 3.01
  static String formatMoney(num value, {String symbol = 'C\$', bool includeSymbol = true}) {
    final formatted = NumberFormat('#,##0.00', 'en_US').format(value);
    return includeSymbol ? '$symbol $formatted' : formatted;
  }

  /// Centers [text] within [width] characters (defaults to printable width).
  String center(String text, [int? width]) {
    final effectiveWidth = width ?? metrics.contentWidth;
    final clean = text.trim();
    if (clean.length >= effectiveWidth) {
      return clean.length > effectiveWidth ? clean.substring(0, effectiveWidth) : clean;
    }
    final leftPadding = (effectiveWidth - clean.length) ~/ 2;
    final rightPadding = effectiveWidth - clean.length - leftPadding;
    return '${' ' * leftPadding}$clean${' ' * rightPadding}';
  }

  /// Centers wrapped lines of text within [width] characters.
  List<String> centerLines(String text, [int? width]) {
    final effectiveWidth = width ?? metrics.contentWidth;
    final clean = text.trim();
    if (clean.length <= effectiveWidth) {
      return [center(clean, effectiveWidth)];
    }
    final lines = wrap(clean, effectiveWidth);
    return lines.map((l) => center(l, effectiveWidth)).toList();
  }

  /// Generates a continuous horizontal rule line of [char] spanning the full printable width.
  String divider([String char = '-']) => metrics.divider(char);

  /// Double-line rule (=) for major document boundaries.
  String doubleDivider() => metrics.doubleDivider();

  /// Formats a centered section header enclosed with filler characters spanning full width.
  /// Example (32 cols): `------- DETALLE DE PAGO --------`
  String sectionHeader(String title, [String char = '-']) => metrics.sectionHeader(title, char);

  /// Formats two strings on the same line, with [leftText] aligned to the left
  /// and [rightText] strictly aligned to the right, strictly fitting in [width] columns.
  String formatTwoColumns(String leftText, String rightText, [int? width]) {
    final effectiveWidth = width ?? metrics.contentWidth;
    final cleanLeft = leftText.trim();
    final cleanRight = rightText.trim();

    if (cleanRight.length >= effectiveWidth) {
      return cleanRight.substring(0, effectiveWidth);
    }

    final maxLeftLen = effectiveWidth - cleanRight.length - 1;
    final adjustedLeft = cleanLeft.length > maxLeftLen
        ? cleanLeft.substring(0, maxLeftLen)
        : cleanLeft;

    final spaces = effectiveWidth - adjustedLeft.length - cleanRight.length;
    return '$adjustedLeft${' ' * (spaces > 0 ? spaces : 1)}$cleanRight';
  }

  /// Formats a key-value label pair.
  /// If label + value fits in a single line, outputs a single [formatTwoColumns] line.
  /// If it exceeds [width], outputs the label on line 1 and the full value on line 2+ with indentation,
  /// completely avoiding premature truncation of cashier names or long customer records.
  List<String> formatKeyValue(String label, String value, [int? width]) {
    final effectiveWidth = width ?? metrics.contentWidth;
    final cleanLabel = label.trim();
    final cleanVal = value.trim();

    if (cleanVal.isEmpty) return [];

    // Single line if both fit cleanly with at least one space
    if (cleanLabel.length + 1 + cleanVal.length <= effectiveWidth) {
      return [formatTwoColumns(cleanLabel, cleanVal, effectiveWidth)];
    }

    // Two-tier fallback: label on first line, value wrapped with 2-space indentation
    final lines = <String>[cleanLabel];
    final wrappedVal = wrap(cleanVal, effectiveWidth - 2);
    for (final vl in wrappedVal) {
      lines.add('  $vl');
    }
    return lines;
  }

  /// Formats an item row adhering to exact 58mm (2-tier) or 80mm (4-column grid) specs.
  ///
  /// - 58mm Mode (32 cols):
  ///   Line 1: "$qty x $name" (wrapped with 4-space hanging indent if long)
  ///   Line 2: "  @ C$ $unitPrice" (left) ... "C$ $total" (right)
  /// - 80mm Mode (48 cols):
  ///   Tabular grid: CANT (4) | DESCRIPCION (flexible) | P.UNIT (>=10) | TOTAL (>=11) = 48 cols
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
    final unitPriceStr = formatMoney(unitPrice, symbol: currencySymbol);
    final totalStr = formatMoney(total, symbol: currencySymbol);

    if (metrics.printableWidth <= 38) {
      // ==========================================
      // 58mm Mode (32 cols) - 2-tier composition
      // ==========================================
      final lines = <String>[];
      final itemTitle = '$qtyStr x ${name.trim()}';

      // Line 1+: Title with 4-space hanging indent on continuation lines
      final wrappedTitle = wrap(itemTitle, metrics.contentWidth, '    ');
      lines.addAll(wrappedTitle);

      // Line 2: Unit price left-aligned with indent, total strictly right-aligned
      lines.add(formatTwoColumns('  @ $unitPriceStr', totalStr, metrics.contentWidth));
      return lines;
    } else {
      // ==========================================
      // 80mm Mode (48 cols) - 4-column tabular grid
      // CANT (4) + DESCRIPCION (flexible) + P.UNIT (>=10) + TOTAL (>=11) = 48 cols
      // ==========================================
      final colQtyWidth = metrics.qtyWidth; // 4
      final actualUnitPriceWidth = unitPriceStr.length > metrics.unitPriceWidth
          ? unitPriceStr.length + 1
          : metrics.unitPriceWidth;
      final actualTotalWidth = totalStr.length > metrics.totalWidth
          ? totalStr.length + 1
          : metrics.totalWidth;

      // Description receives flexible space dynamically so row ALWAYS sums to contentWidth
      final colDescWidth = metrics.contentWidth - colQtyWidth - actualUnitPriceWidth - actualTotalWidth;

      final colQty = qtyStr.padRight(colQtyWidth);
      final colUnitPrice = unitPriceStr.padLeft(actualUnitPriceWidth);
      final colTotal = totalStr.padLeft(actualTotalWidth);

      final wrappedNames = wrap(name.trim(), colDescWidth > 8 ? colDescWidth : 8);
      final lines = <String>[];

      for (int i = 0; i < wrappedNames.length; i++) {
        final nameChunk = wrappedNames[i].padRight(colDescWidth);
        if (i == 0) {
          lines.add('$colQty$nameChunk$colUnitPrice$colTotal');
        } else {
          lines.add('${' ' * colQtyWidth}$nameChunk${' ' * (actualUnitPriceWidth + actualTotalWidth)}');
        }
      }
      return lines;
    }
  }

  /// Robust word-wrapping engine.
  /// Preserves whole words when possible, breaks words longer than line width,
  /// supports multi-line text input, and applies [indent] to continuation lines.
  List<String> wrap(String text, [int? width, String indent = '']) {
    final effectiveWidth = width ?? metrics.contentWidth;
    if (effectiveWidth <= 0) return [text];
    final clean = text.trim();
    if (clean.isEmpty) return [];

    final rawLines = clean.split(RegExp(r'\r?\n'));
    final result = <String>[];

    for (var rIdx = 0; rIdx < rawLines.length; rIdx++) {
      final rawLine = rawLines[rIdx].trim();
      if (rawLine.isEmpty) {
        result.add('');
        continue;
      }

      final words = rawLine.split(RegExp(r'\s+'));
      var currentLine = '';

      for (final word in words) {
        final currentIndent = result.isEmpty ? '' : indent;
        final maxForLine = effectiveWidth - currentIndent.length;

        if (currentLine.isEmpty) {
          if (word.length <= maxForLine) {
            currentLine = word;
          } else {
            // Word is longer than line width: split cleanly without truncation
            var rem = word;
            while (rem.length > maxForLine) {
              result.add('$currentIndent${rem.substring(0, maxForLine)}');
              rem = rem.substring(maxForLine);
            }
            currentLine = rem;
          }
        } else if (currentLine.length + 1 + word.length <= maxForLine) {
          currentLine += ' $word';
        } else {
          result.add('$currentIndent$currentLine');
          final nextIndent = indent;
          final nextMax = effectiveWidth - nextIndent.length;
          if (word.length <= nextMax) {
            currentLine = word;
          } else {
            var rem = word;
            while (rem.length > nextMax) {
              result.add('$nextIndent${rem.substring(0, nextMax)}');
              rem = rem.substring(nextMax);
            }
            currentLine = rem;
          }
        }
      }
      if (currentLine.isNotEmpty) {
        final lineIndent = result.isEmpty ? '' : indent;
        result.add('$lineIndent$currentLine');
      }
    }
    return result;
  }

  // ==========================================
  // 2. Receipt Document Text Formatting
  // ==========================================

  /// Formats a complete, calculated [ReceiptDocument] as plain text.
  /// Strictly adheres to visual hierarchy:
  /// BUSINESS -> DOCUMENT -> ITEMS -> SUMMARY -> TOTAL -> FX USD -> PAYMENTS -> FOOTER
  String formatReceiptDocumentText(ReceiptDocument doc) {
    final buffer = StringBuffer();
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');

    // 1. BUSINESS HEADER (Centered)
    buffer.writeln(center(doc.businessName));
    if (doc.legalName != null && doc.legalName!.isNotEmpty) {
      buffer.writeln(center(doc.legalName!));
    }
    if (doc.ruc != null && doc.ruc!.isNotEmpty) {
      buffer.writeln(center('RUC: ${doc.ruc!}'));
    }

    // Regime Identification from Canonical Company Settings
    buffer.writeln(center(doc.taxRegime.receiptRegimeHeader));

    if (doc.address != null && doc.address!.isNotEmpty) {
      for (final line in wrap(doc.address!)) {
        buffer.writeln(center(line));
      }
    }
    if (doc.phone != null && doc.phone!.isNotEmpty) {
      buffer.writeln(center('Tel: ${doc.phone!}'));
    }

    // 2. DOCUMENT INFO BLOCK
    buffer.writeln(doubleDivider());
    buffer.writeln(center(doc.documentTitle));
    buffer.writeln(center('No. ${doc.documentNumber}'));
    for (final l in formatKeyValue('Fecha:', dateFormat.format(doc.date))) {
      buffer.writeln(l);
    }

    if (doc.cashierName != null && doc.cashierName!.isNotEmpty) {
      for (final l in formatKeyValue('Atendido por:', doc.cashierName!)) {
        buffer.writeln(l);
      }
    }

    // Only display customer fields if actual data exists (never print "Cliente: N/A")
    if (doc.customerName != null && doc.customerName!.isNotEmpty && doc.customerName != 'N/A') {
      for (final l in formatKeyValue('Cliente:', doc.customerName!)) {
        buffer.writeln(l);
      }
    }
    if (doc.customerRuc != null && doc.customerRuc!.isNotEmpty && doc.customerRuc != 'N/A') {
      for (final l in formatKeyValue('RUC/Cedula:', doc.customerRuc!)) {
        buffer.writeln(l);
      }
    }
    if (doc.originInvoiceId != null && doc.originInvoiceId!.isNotEmpty) {
      for (final l in formatKeyValue('Doc. Origen:', doc.originInvoiceId!)) {
        buffer.writeln(l);
      }
    }

    buffer.writeln(divider('-'));

    // 3. ITEMS TABLE HEADER
    if (metrics.printableWidth <= 38) {
      buffer.writeln(formatTwoColumns('CANT DESCRIPCION', 'TOTAL'));
    } else {
      final hQty = 'CANT'.padRight(metrics.qtyWidth);
      final hDesc = 'DESCRIPCION'.padRight(metrics.descriptionWidth);
      final hUnitPrice = 'P.UNIT'.padLeft(metrics.unitPriceWidth);
      final hTotal = 'TOTAL'.padLeft(metrics.totalWidth);
      buffer.writeln('$hQty$hDesc$hUnitPrice$hTotal');
    }
    buffer.writeln(divider('-'));

    // 4. ITEMS BREAKDOWN
    for (final line in doc.lines) {
      final rowLines = formatItemRow(
        quantity: line.quantity,
        name: line.description,
        unitPrice: line.unitPrice,
        total: line.lineTotal,
      );
      for (final r in rowLines) {
        buffer.writeln(r);
      }

      for (final mod in line.modifiers) {
        for (final mLine in wrap('  + $mod', metrics.contentWidth, '    ')) {
          buffer.writeln(mLine);
        }
      }
      if (line.discount > 0) {
        buffer.writeln('  - Desc: ${formatMoney(line.discount)}');
      }
      if (line.notes != null && line.notes!.isNotEmpty) {
        for (final noteLine in wrap('  * ${line.notes!}', metrics.contentWidth, '    ')) {
          buffer.writeln(noteLine);
        }
      }
    }

    buffer.writeln(divider('-'));

    // 5. TOTALS & TAX COMPLIANCE (Ley 822 / DGI)
    if (doc.taxRegime.isCuotaFija) {
      // Cuota Fija: Subtotal & Total. Never print IVA (15%): C$ 0.00 or VENTA EXENTA.
      buffer.writeln(formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)));
      if (doc.discountTotal > 0) {
        buffer.writeln(formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)));
      }
      buffer.writeln(doubleDivider());
      buffer.writeln(formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)));
      buffer.writeln(doubleDivider());
    } else {
      // Régimen General: Disclose Subtotal, applicable exemptions, IVA, and Total
      if (doc.isTaxExempt || doc.globalTaxOverride) {
        buffer.writeln(formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)));
        buffer.writeln(formatTwoColumns('VENTA EXENTA (IVA 0%):', formatMoney(0.00)));
        buffer.writeln(doubleDivider());
        buffer.writeln(formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)));
        buffer.writeln(doubleDivider());
        for (final line in centerLines('** VENTA EXENTA DE IVA - POLITICA TEMPORAL **')) {
          buffer.writeln(line);
        }
      } else {
        buffer.writeln(formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)));
        if (doc.discountTotal > 0) {
          buffer.writeln(formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)));
        }
        if (doc.exemptSubtotal > 0) {
          buffer.writeln(formatTwoColumns('VENTA EXENTA:', formatMoney(doc.exemptSubtotal)));
        }
        if (doc.totalTax > 0) {
          buffer.writeln(formatTwoColumns('IVA (15%):', formatMoney(doc.totalTax)));
        }
        buffer.writeln(doubleDivider());
        buffer.writeln(formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)));
        buffer.writeln(doubleDivider());
      }
    }

    // 6. SECONDARY FX EQUIVALENT (USD)
    if (doc.commercialRate > 0) {
      buffer.writeln(formatTwoColumns('T/C USD:', formatMoney(doc.commercialRate)));
      buffer.writeln(formatTwoColumns('TOTAL USD:', formatMoney(doc.totalUsd, symbol: '\$')));
    }

    // 7. PAYMENT BREAKDOWN
    buffer.writeln(divider('-'));
    buffer.writeln(sectionHeader('DETALLE DE PAGO'));

    if (doc.payments.isEmpty) {
      buffer.writeln(formatTwoColumns('Condicion:', 'Contado'));
    } else {
      for (final p in doc.payments) {
        final amountFormatted = p.currency == 'USD'
            ? '\$ ${p.amount.toStringAsFixed(2)}'
            : formatMoney(p.amount);
        buffer.writeln(formatTwoColumns('${p.methodLabel}:', amountFormatted));

        if (p.changeGiven > 0) {
          final changeCurr = p.changeCurrency ?? 'NIO';
          final changeFormatted = changeCurr == 'USD'
              ? '\$ ${p.changeGiven.toStringAsFixed(2)}'
              : formatMoney(p.changeGiven);
          buffer.writeln(formatTwoColumns('Cambio ($changeCurr):', changeFormatted));
        }
        if (p.reference != null && p.reference!.isNotEmpty) {
          for (final refLine in formatKeyValue('  Auth/Ref:', p.reference!)) {
            buffer.writeln(refLine);
          }
        }
      }
    }

    // 8. FOOTER
    buffer.writeln(doubleDivider());

    // Cuota Fija Notice
    if (doc.taxRegime.isCuotaFija) {
      buffer.writeln(center('CONTRIBUYENTE DE CUOTA FIJA'));
      buffer.writeln(center('NO RECAUDA IVA'));
      buffer.writeln('');
    }

    final footerMsg = doc.footerMessage ?? '*** GRACIAS POR SU COMPRA ***';
    for (final line in wrap(footerMsg)) {
      buffer.writeln(center(line));
    }
    buffer.write(metrics.footerGap());

    return buffer.toString();
  }

  /// Formats the complete customer sales receipt in plain text from domain [Invoice].
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
    String? customerName,
    String? customerRuc,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    String? footerMessage,
  }) {
    final doc = ReceiptDocument.fromInvoice(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      legalName: legalName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
      customerName: customerName,
      customerRuc: customerRuc,
      taxRegime: taxRegime,
      isTaxExempt: isTaxExempt,
      footerMessage: footerMessage,
    );
    return formatReceiptDocumentText(doc);
  }

  // ==========================================
  // 3. ESC/POS Bytecode Formatting
  // ==========================================

  /// Formats a complete [ReceiptDocument] into ESC/POS bytecode.
  List<int> formatReceiptDocumentEscPos(ReceiptDocument doc) {
    final builder = EscPosBuilder();
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');

    // 1. Logo (if provided as 1-bit raster)
    if (doc.logoRasterBytes != null && doc.logoRasterBytes!.isNotEmpty) {
      builder.rasterImage(doc.logoRasterBytes!).feedLines(1);
    }

    // 2. Business Header
    builder
        .align(EscPosAlign.center)
        .bold(true)
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine(doc.businessName)
        .fontSize(EscPosFontSize.normal)
        .bold(false);

    if (doc.legalName != null && doc.legalName!.isNotEmpty) {
      builder.textLine(doc.legalName!);
    }
    if (doc.ruc != null && doc.ruc!.isNotEmpty) {
      builder.textLine('RUC: ${doc.ruc!}');
    }

    builder.bold(true).textLine(doc.taxRegime.receiptRegimeHeader).bold(false);

    if (doc.address != null && doc.address!.isNotEmpty) {
      for (final line in wrap(doc.address!)) {
        builder.textLine(line);
      }
    }
    if (doc.phone != null && doc.phone!.isNotEmpty) {
      builder.textLine('Tel: ${doc.phone!}');
    }

    // 3. Document Info Block
    builder
        .textLine(doubleDivider())
        .bold(true)
        .textLine(doc.documentTitle)
        .textLine('No. ${doc.documentNumber}')
        .bold(false)
        .align(EscPosAlign.left);

    for (final l in formatKeyValue('Fecha:', dateFormat.format(doc.date))) {
      builder.textLine(l);
    }
    if (doc.cashierName != null && doc.cashierName!.isNotEmpty) {
      for (final l in formatKeyValue('Atendido por:', doc.cashierName!)) {
        builder.textLine(l);
      }
    }
    if (doc.customerName != null && doc.customerName!.isNotEmpty && doc.customerName != 'N/A') {
      for (final l in formatKeyValue('Cliente:', doc.customerName!)) {
        builder.textLine(l);
      }
    }
    if (doc.customerRuc != null && doc.customerRuc!.isNotEmpty && doc.customerRuc != 'N/A') {
      for (final l in formatKeyValue('RUC/Cedula:', doc.customerRuc!)) {
        builder.textLine(l);
      }
    }
    if (doc.originInvoiceId != null && doc.originInvoiceId!.isNotEmpty) {
      for (final l in formatKeyValue('Doc. Origen:', doc.originInvoiceId!)) {
        builder.textLine(l);
      }
    }

    builder.textLine(divider('-'));

    // 4. Items Header
    if (metrics.printableWidth <= 38) {
      builder.textLine(formatTwoColumns('CANT DESCRIPCION', 'TOTAL'));
    } else {
      final hQty = 'CANT'.padRight(metrics.qtyWidth);
      final hDesc = 'DESCRIPCION'.padRight(metrics.descriptionWidth);
      final hUnitPrice = 'P.UNIT'.padLeft(metrics.unitPriceWidth);
      final hTotal = 'TOTAL'.padLeft(metrics.totalWidth);
      builder.textLine('$hQty$hDesc$hUnitPrice$hTotal');
    }
    builder.textLine(divider('-'));

    // Items Body
    for (final line in doc.lines) {
      final rowLines = formatItemRow(
        quantity: line.quantity,
        name: line.description,
        unitPrice: line.unitPrice,
        total: line.lineTotal,
      );
      for (final r in rowLines) {
        builder.textLine(r);
      }

      for (final mod in line.modifiers) {
        for (final mLine in wrap('  + $mod', metrics.contentWidth, '    ')) {
          builder.textLine(mLine);
        }
      }
      if (line.discount > 0) {
        builder.textLine('  - Desc: ${formatMoney(line.discount)}');
      }
      if (line.notes != null && line.notes!.isNotEmpty) {
        for (final noteLine in wrap('  * ${line.notes!}', metrics.contentWidth, '    ')) {
          builder.textLine(noteLine);
        }
      }
    }

    builder.textLine(divider('-'));

    // 5. Totals & Tax Compliance (Ley 822 / DGI)
    if (doc.taxRegime.isCuotaFija) {
      builder.textLine(formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)));
      if (doc.discountTotal > 0) {
        builder.textLine(formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)));
      }
      builder
          .textLine(doubleDivider())
          .bold(true)
          .textLine(formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)))
          .bold(false)
          .textLine(doubleDivider());
    } else {
      if (doc.isTaxExempt || doc.globalTaxOverride) {
        builder
            .textLine(formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)))
            .textLine(formatTwoColumns('VENTA EXENTA (IVA 0%):', formatMoney(0.00)))
            .textLine(doubleDivider())
            .bold(true)
            .textLine(formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)))
            .bold(false)
            .textLine(doubleDivider())
            .align(EscPosAlign.center);
        for (final line in centerLines('** VENTA EXENTA DE IVA - POLITICA TEMPORAL **')) {
          builder.textLine(line);
        }
        builder.align(EscPosAlign.left);
      } else {
        builder.textLine(formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)));
        if (doc.discountTotal > 0) {
          builder.textLine(formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)));
        }
        if (doc.exemptSubtotal > 0) {
          builder.textLine(formatTwoColumns('VENTA EXENTA:', formatMoney(doc.exemptSubtotal)));
        }
        if (doc.totalTax > 0) {
          builder.textLine(formatTwoColumns('IVA (15%):', formatMoney(doc.totalTax)));
        }
        builder
            .textLine(doubleDivider())
            .bold(true)
            .textLine(formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)))
            .bold(false)
            .textLine(doubleDivider());
      }
    }

    // 6. Secondary USD Total
    if (doc.commercialRate > 0) {
      builder
          .textLine(formatTwoColumns('T/C USD:', formatMoney(doc.commercialRate)))
          .textLine(formatTwoColumns('TOTAL USD:', formatMoney(doc.totalUsd, symbol: '\$')));
    }

    // 7. Payments
    builder
        .textLine(divider('-'))
        .align(EscPosAlign.center)
        .textLine(sectionHeader('DETALLE DE PAGO'))
        .align(EscPosAlign.left);

    if (doc.payments.isEmpty) {
      builder.textLine(formatTwoColumns('Condicion:', 'Contado'));
    } else {
      for (final p in doc.payments) {
        final amountFormatted = p.currency == 'USD'
            ? '\$ ${p.amount.toStringAsFixed(2)}'
            : formatMoney(p.amount);
        builder.textLine(formatTwoColumns('${p.methodLabel}:', amountFormatted));

        if (p.changeGiven > 0) {
          final changeCurr = p.changeCurrency ?? 'NIO';
          final changeFormatted = changeCurr == 'USD'
              ? '\$ ${p.changeGiven.toStringAsFixed(2)}'
              : formatMoney(p.changeGiven);
          builder.textLine(formatTwoColumns('Cambio ($changeCurr):', changeFormatted));
        }
        if (p.reference != null && p.reference!.isNotEmpty) {
          for (final refLine in formatKeyValue('  Auth/Ref:', p.reference!)) {
            builder.textLine(refLine);
          }
        }
      }
    }

    // 8. Footer
    builder.textLine(doubleDivider()).align(EscPosAlign.center);

    if (doc.taxRegime.isCuotaFija) {
      builder.textLine('CONTRIBUYENTE DE CUOTA FIJA').textLine('NO RECAUDA IVA').feedLines(1);
    }

    final footerMsg = doc.footerMessage ?? '*** GRACIAS POR SU COMPRA ***';
    builder.bold(true);
    for (final line in wrap(footerMsg)) {
      builder.textLine(line);
    }
    builder
        .bold(false)
        .feedLines(3)
        .cut();

    return builder.toBytes();
  }

  /// Formats the complete sales receipt into ESC/POS bytecode from domain [Invoice].
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
    String? customerName,
    String? customerRuc,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    List<int>? logoRasterBytes,
    String? footerMessage,
  }) {
    final doc = ReceiptDocument.fromInvoice(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      legalName: legalName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
      customerName: customerName,
      customerRuc: customerRuc,
      taxRegime: taxRegime,
      isTaxExempt: isTaxExempt,
      footerMessage: footerMessage,
      logoRasterBytes: logoRasterBytes,
    );
    return formatReceiptDocumentEscPos(doc);
  }

  /// Backwards-compatibility helper for tests.
  String drawLine([String char = '-']) => divider(char);
}
