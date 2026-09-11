import 'package:intl/intl.dart';
import '../../models/printer/receipt_document.dart';
import '../../models/config/tax_regime.dart';
import '../../models/sales/cashier_session.dart';
import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';
import '../sales/post_paid_feedback_service.dart';
import 'esc_pos_builder.dart';
import 'receipt_layout_metrics.dart';
import 'printable_text_codec.dart';

/// Highly modular, robust layout engine and ticket generator for 58mm (32 cols) and 80mm (44 cols)
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

  /// Maximum content width in monospaced character columns.
  int get maxCols => metrics.contentWidth;
  int get maxImageWidth => metrics.maxImageWidth;
  int get maxImageHeight => metrics.maxImageHeight;

  /// 58mm Thermal Printer Mode (32 columns, max 384px image width)
  factory ReceiptLayoutFormatter.format58mm() =>
      ReceiptLayoutFormatter(ReceiptLayoutMetrics.mm58());

  /// 80mm Nyx TLMono mode (40 logical columns, max 576px image width)
  factory ReceiptLayoutFormatter.format80mm() =>
      ReceiptLayoutFormatter(ReceiptLayoutMetrics.mm80());

  /// Resolves formatter dynamically based on configured paper width in millimeters.
  factory ReceiptLayoutFormatter.fromPaperWidth(int paperWidthMm) =>
      ReceiptLayoutFormatter(ReceiptLayoutMetrics.fromPaperWidth(paperWidthMm));

  // ==========================================
  // 1. Column Formatting & Text Helpers
  // ==========================================

  /// Formats monetary amount with thousands separator and two decimal places.
  /// Example: C$ 1,234.50 or $ 3.01
  static String formatMoney(
    num value, {
    String symbol = 'C\$',
    bool includeSymbol = true,
  }) {
    final formatted = NumberFormat('#,##0.00', 'en_US').format(value);
    return includeSymbol ? '$symbol $formatted' : formatted;
  }

  /// Centers [text] within [width] characters (defaults to printable width).
  String center(String text, [int? width]) {
    final effectiveWidth = width ?? metrics.contentWidth;
    final clean = sanitizeInlineText(text);
    if (clean.length >= effectiveWidth) {
      return clean.length > effectiveWidth
          ? clean.substring(0, effectiveWidth)
          : clean;
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
  String sectionHeader(String title, [String char = '-']) =>
      metrics.sectionHeader(title, char);

  /// Formats two strings on the same line, with [leftText] aligned to the left
  /// and [rightText] strictly aligned to the right, strictly fitting in [width] columns.
  String formatTwoColumns(String leftText, String rightText, [int? width]) {
    final effectiveWidth = width ?? metrics.contentWidth;
    final cleanLeft = sanitizeInlineText(leftText);
    final cleanRight = sanitizeInlineText(rightText);

    if (cleanRight.length >= effectiveWidth) {
      // Preserve oversized monetary/reference values in a lossless vertical form.
      return formatKeyValue(cleanLeft, cleanRight, effectiveWidth).join('\n');
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
    final cleanLabel = sanitizeInlineText(label);
    final cleanVal = sanitizeInlineText(value);

    if (cleanVal.isEmpty) return [];

    // Single line if both fit cleanly with at least one space
    if (cleanLabel.length + 1 + cleanVal.length <= effectiveWidth) {
      return [formatTwoColumns(cleanLabel, cleanVal, effectiveWidth)];
    }

    // Two-tier fallback: label on first line, value wrapped with 2-space indentation
    final lines = <String>[...wrap(cleanLabel, effectiveWidth)];
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
  /// - 80mm Mode:
  ///   Tabular grid: CANT(4) + gutter(1) + DESCRIPCION(14) + gutter(1) + P.UNIT(8) + gutter(1) + TOTAL(11) = 40 cols
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

    if (metrics.contentColumns <= 38) {
      // ==========================================
      // 58mm Mode (32 cols) - 2-tier composition
      // ==========================================
      final lines = <String>[];
      final itemTitle = '$qtyStr x ${sanitizeInlineText(name)}';

      // Line 1+: Title with 4-space hanging indent on continuation lines
      final wrappedTitle = wrap(itemTitle, metrics.contentWidth, '    ');
      lines.addAll(wrappedTitle);

      // Line 2: Unit price left-aligned with indent, total strictly right-aligned
      lines.add(
        formatTwoColumns('  @ $unitPriceStr', totalStr, metrics.contentWidth),
      );
      return lines;
    } else {
      // ==========================================
      // 80mm Mode (40 cols) - Master Grid
      // CANT(4) + gutter(1) + DESCRIPCION(14) + gutter(1) + P.UNIT(8) + gutter(1) + TOTAL(11) = 40 cols
      // Currency symbol omitted from cells — header provides context.
      // ==========================================
      final rawUnitPrice = NumberFormat('#,##0.00', 'en_US').format(unitPrice);
      final rawTotal = NumberFormat('#,##0.00', 'en_US').format(total);

      // Enforce strict column widths — overflow triggers multi-line fallback
      if (qtyStr.length > metrics.qtyWidth ||
          rawUnitPrice.length > metrics.unitPriceWidth ||
          rawTotal.length > metrics.totalWidth) {
        final lines = wrap(
          '$qtyStr x ${sanitizeInlineText(name)}',
          metrics.contentWidth,
          '    ',
        );
        lines.addAll(
          wrap('  @ ${formatMoney(unitPrice)}', metrics.contentWidth, '    '),
        );
        lines.addAll(
          wrap('TOTAL: ${formatMoney(total)}', metrics.contentWidth, '  '),
        );
        return lines;
      }

      final cleanName = sanitizeInlineText(name);
      final colDescWidth =
          metrics.contentWidth -
          metrics.qtyWidth -
          metrics.unitPriceWidth -
          metrics.totalWidth -
          metrics.columnGutters;
      if (colDescWidth < 8) {
        final lines = wrap(
          '$qtyStr x $cleanName',
          metrics.contentWidth,
          '    ',
        );
        lines.addAll(
          wrap('  @ ${formatMoney(unitPrice)}', metrics.contentWidth, '    '),
        );
        lines.addAll(
          wrap('TOTAL: ${formatMoney(total)}', metrics.contentWidth, '  '),
        );
        return lines;
      }

      final colQty = qtyStr.padRight(metrics.qtyWidth);
      final colDesc = cleanName.padRight(colDescWidth);
      final colUnitPrice = rawUnitPrice.padLeft(metrics.unitPriceWidth);
      final colTotal = rawTotal.padLeft(metrics.totalWidth);
      final gutter = ' ';

      final wrappedNames = wrap(cleanName, colDescWidth);
      final lines = <String>[];

      for (int i = 0; i < wrappedNames.length; i++) {
        final nameChunk = wrappedNames[i].padRight(colDescWidth);
        if (i == 0) {
          lines.add(
            '$colQty$gutter$nameChunk$gutter$colUnitPrice$gutter$colTotal',
          );
        } else {
          // Continuation: qty spaces + gutter + name chunk + gutter + unitPrice spaces + gutter + total spaces
          lines.add(
            '${' ' * metrics.qtyWidth}$gutter$nameChunk$gutter${' ' * metrics.unitPriceWidth}$gutter${' ' * metrics.totalWidth}',
          );
        }
      }
      return lines;
    }
  }

  /// Formats a raw numeric amount for the 80mm items table, right-aligned to
  /// [metrics.totalWidth] columns. No currency symbol — the table header provides context.
  /// Example: `     120.00` (12 chars)
  String amount80(num value) {
    final formatted = NumberFormat('#,##0.00', 'en_US').format(value);
    return formatted.padLeft(metrics.totalWidth);
  }

  /// Formats a numeric amount for the 80mm summary/payment sections with the `C$` prefix.
  /// Returns a single string; `formatTwoColumns` handles overflow naturally
  /// by breaking the amount onto the next line when it exceeds column width.
  /// Example: `C$ 120.00` (12 chars)
  String summaryAmount80(num value) {
    final formatted = NumberFormat('#,##0.00', 'en_US').format(value);
    return 'C\$ $formatted';
  }

  /// Normalizes text to the deterministic single-column Latin-1 receipt codec.
  String normalizePrintableText(String text) =>
      const PrintableTextCodec().normalize(text);

  /// Removes printer controls and normalizes inline whitespace before measuring.
  String sanitizeInlineText(String text) => normalizePrintableText(text)
      .replaceAll(RegExp(r'[\u0000-\u001F\u007F]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  /// Text layout never represents a printer's physical margin as characters.
  String marginLine(String content) {
    return content;
  }

  /// Writes one logical line to the ESC/POS builder.
  EscPosBuilder marginTextLine(EscPosBuilder builder, String line) {
    return builder.textLine(marginLine(line));
  }

  /// Robust word-wrapping engine.
  /// Preserves whole words when possible, breaks words longer than line width,
  /// supports multi-line text input, and applies [indent] to continuation lines.
  List<String> wrap(String text, [int? width, String indent = '']) {
    final effectiveWidth = width ?? metrics.contentWidth;
    if (effectiveWidth <= 0) return [text];
    // Newlines remain supported for authored footer copy; other controls are removed.
    final clean = normalizePrintableText(
      text,
    ).replaceAll(RegExp(r'[\u0000-\u0009\u000B-\u001F\u007F]'), ' ').trim();
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
    if (doc.customerName != null &&
        doc.customerName!.isNotEmpty &&
        doc.customerName != 'N/A') {
      for (final l in formatKeyValue('Cliente:', doc.customerName!)) {
        buffer.writeln(l);
      }
    }
    if (doc.customerRuc != null &&
        doc.customerRuc!.isNotEmpty &&
        doc.customerRuc != 'N/A') {
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
    if (metrics.contentColumns <= 38) {
      buffer.writeln(formatTwoColumns('CANT DESCRIPCION', 'TOTAL'));
    } else {
      // 80mm: CANT(4) + gutter(1) + DESCRIPCION(14) + gutter(1) + P.UNIT(8) + gutter(1) + TOTAL(11) = 40
      final hQty = 'CANT'.padRight(metrics.qtyWidth);
      final hDesc = 'DESCRIPCION'.padRight(metrics.descriptionWidth);
      final hUnitPrice = 'P.UNIT'.padLeft(metrics.unitPriceWidth);
      final hTotal = 'TOTAL'.padLeft(metrics.totalWidth);
      final gutter = ' ';
      buffer.writeln('$hQty$gutter$hDesc$gutter$hUnitPrice$gutter$hTotal');
    }
    buffer.writeln(divider('-'));

    // 4. ITEMS BREAKDOWN
    for (final line in doc.lines) {
      final hasLineDiscount = line.discount > 0;
      final displayLineTotal = hasLineDiscount && line.grossAmount > 0
          ? line.grossAmount
          : line.lineSubtotal;
      final rowLines = formatItemRow(
        quantity: line.quantity,
        name: line.description,
        unitPrice: line.unitPrice,
        total: displayLineTotal,
      );
      for (final r in rowLines) {
        buffer.writeln(r);
      }

      final modifiers = line.modifierDisplays.isNotEmpty
          ? line.modifierDisplays.map((modifier) => modifier.printableText)
          : line.modifiers;
      for (final mod in modifiers) {
        for (final mLine in wrap('  + $mod', metrics.contentWidth, '    ')) {
          buffer.writeln(mLine);
        }
      }
      if (hasLineDiscount) {
        if (metrics.is80mm) {
          buffer.writeln(
            formatTwoColumns('Descuento', amount80(line.discount)),
          );
          buffer.writeln(formatTwoColumns('Neto', amount80(line.lineSubtotal)));
        } else {
          buffer.writeln(
            formatTwoColumns('  - Descuento:', formatMoney(line.discount)),
          );
          buffer.writeln(
            formatTwoColumns('  Neto:', formatMoney(line.lineSubtotal)),
          );
        }
      }
      if (line.notes != null && line.notes!.isNotEmpty) {
        for (final noteLine in wrap(
          '  * ${line.notes!}',
          metrics.contentWidth,
          '    ',
        )) {
          buffer.writeln(noteLine);
        }
      }
    }

    buffer.writeln(divider('-'));

    // 5. TOTALS & TAX COMPLIANCE (Ley 822 / DGI)
    final hasDiscount = doc.discountTotal > 0;
    final displayGrossSubtotal = hasDiscount && doc.grossSubtotal > 0
        ? doc.grossSubtotal
        : (hasDiscount ? (doc.subtotal + doc.discountTotal) : doc.subtotal);

    if (doc.taxRegime.isCuotaFija) {
      // Cuota Fija: Subtotal & Total. Never print IVA (15%): C$ 0.00 or VENTA EXENTA.
      if (hasDiscount) {
        if (metrics.is80mm) {
          buffer.writeln(
            formatTwoColumns(
              'SUBTOTAL BRUTO:',
              summaryAmount80(displayGrossSubtotal),
            ),
          );
          buffer.writeln(
            formatTwoColumns('DESCUENTO:', summaryAmount80(doc.discountTotal)),
          );
          buffer.writeln(
            formatTwoColumns('SUBTOTAL NETO:', summaryAmount80(doc.subtotal)),
          );
        } else {
          buffer.writeln(
            formatTwoColumns(
              'SUBTOTAL BRUTO:',
              formatMoney(displayGrossSubtotal),
            ),
          );
          buffer.writeln(
            formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)),
          );
          buffer.writeln(
            formatTwoColumns('SUBTOTAL NETO:', formatMoney(doc.subtotal)),
          );
        }
      } else {
        buffer.writeln(
          metrics.is80mm
              ? formatTwoColumns('SUBTOTAL:', summaryAmount80(doc.subtotal))
              : formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)),
        );
      }
      buffer.writeln(doubleDivider());
      buffer.writeln(
        metrics.is80mm
            ? formatTwoColumns('TOTAL CORDOBAS:', summaryAmount80(doc.total))
            : formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)),
      );
      buffer.writeln(doubleDivider());
    } else {
      // Régimen General: Disclose Subtotal, applicable exemptions, IVA, and Total
      if (doc.isTaxExempt || doc.globalTaxOverride) {
        if (hasDiscount) {
          if (metrics.is80mm) {
            buffer.writeln(
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                summaryAmount80(displayGrossSubtotal),
              ),
            );
            buffer.writeln(
              formatTwoColumns(
                'DESCUENTO:',
                summaryAmount80(doc.discountTotal),
              ),
            );
            buffer.writeln(
              formatTwoColumns('SUBTOTAL NETO:', summaryAmount80(doc.subtotal)),
            );
          } else {
            buffer.writeln(
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                formatMoney(displayGrossSubtotal),
              ),
            );
            buffer.writeln(
              formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)),
            );
            buffer.writeln(
              formatTwoColumns('SUBTOTAL NETO:', formatMoney(doc.subtotal)),
            );
          }
        } else {
          buffer.writeln(
            metrics.is80mm
                ? formatTwoColumns('SUBTOTAL:', summaryAmount80(doc.subtotal))
                : formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)),
          );
        }
        buffer.writeln(
          formatTwoColumns('VENTA EXENTA (IVA 0%):', formatMoney(0.00)),
        );
        buffer.writeln(doubleDivider());
        buffer.writeln(
          metrics.is80mm
              ? formatTwoColumns('TOTAL CORDOBAS:', summaryAmount80(doc.total))
              : formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)),
        );
        buffer.writeln(doubleDivider());
        for (final line in centerLines(
          '** VENTA EXENTA DE IVA - POLITICA TEMPORAL **',
        )) {
          buffer.writeln(line);
        }
      } else {
        if (hasDiscount) {
          if (metrics.is80mm) {
            buffer.writeln(
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                summaryAmount80(displayGrossSubtotal),
              ),
            );
            buffer.writeln(
              formatTwoColumns(
                'DESCUENTO:',
                summaryAmount80(doc.discountTotal),
              ),
            );
            buffer.writeln(
              formatTwoColumns('SUBTOTAL NETO:', summaryAmount80(doc.subtotal)),
            );
          } else {
            buffer.writeln(
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                formatMoney(displayGrossSubtotal),
              ),
            );
            buffer.writeln(
              formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)),
            );
            buffer.writeln(
              formatTwoColumns('SUBTOTAL NETO:', formatMoney(doc.subtotal)),
            );
          }
        } else {
          buffer.writeln(
            metrics.is80mm
                ? formatTwoColumns('SUBTOTAL:', summaryAmount80(doc.subtotal))
                : formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)),
          );
        }
        if (doc.exemptSubtotal > 0) {
          buffer.writeln(
            formatTwoColumns('VENTA EXENTA:', formatMoney(doc.exemptSubtotal)),
          );
        }
        if (doc.totalTax > 0) {
          buffer.writeln(
            formatTwoColumns('IVA (15%):', formatMoney(doc.totalTax)),
          );
        }
        buffer.writeln(doubleDivider());
        buffer.writeln(
          metrics.is80mm
              ? formatTwoColumns('TOTAL CORDOBAS:', summaryAmount80(doc.total))
              : formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)),
        );
        buffer.writeln(doubleDivider());
      }
    }

    // 6. SECONDARY FX EQUIVALENT (USD)
    if (doc.commercialRate > 0) {
      if (metrics.is80mm) {
        buffer.writeln(
          formatTwoColumns(
            'T/C USD:',
            formatMoney(doc.commercialRate, includeSymbol: false),
          ),
        );
        buffer.writeln(
          formatTwoColumns(
            'TOTAL USD:',
            formatMoney(doc.totalUsd, symbol: '\$', includeSymbol: true),
          ),
        );
      } else {
        buffer.writeln(
          formatTwoColumns('T/C USD:', formatMoney(doc.commercialRate)),
        );
        buffer.writeln(
          formatTwoColumns(
            'TOTAL USD:',
            formatMoney(doc.totalUsd, symbol: '\$'),
          ),
        );
      }
    }

    // 7. PAYMENT BREAKDOWN
    buffer.writeln(divider('-'));
    buffer.writeln(sectionHeader('DETALLE DE PAGO'));

    if (doc.payments.isEmpty) {
      buffer.writeln(formatTwoColumns('Condicion:', 'Contado'));
    } else {
      for (final p in doc.payments) {
        final String amountFormatted;
        if (metrics.is80mm) {
          amountFormatted = p.currency == 'USD'
              ? '\$ ${p.amount.toStringAsFixed(2)}'
              : summaryAmount80(p.amount);
        } else {
          amountFormatted = p.currency == 'USD'
              ? '\$ ${p.amount.toStringAsFixed(2)}'
              : formatMoney(p.amount);
        }
        buffer.writeln(formatTwoColumns('${p.methodLabel}:', amountFormatted));

        if (p.changeGiven > 0) {
          final changeCurr = p.changeCurrency ?? 'NIO';
          final String changeFormatted;
          if (metrics.is80mm) {
            changeFormatted = changeCurr == 'USD'
                ? '\$ ${p.changeGiven.toStringAsFixed(2)}'
                : summaryAmount80(p.changeGiven);
          } else {
            changeFormatted = changeCurr == 'USD'
                ? '\$ ${p.changeGiven.toStringAsFixed(2)}'
                : formatMoney(p.changeGiven);
          }
          buffer.writeln(
            formatTwoColumns('Cambio ($changeCurr):', changeFormatted),
          );
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

    final raw = buffer.toString();
    return raw;
  }

  // ==========================================
  // 3. ESC/POS Bytecode Formatting
  // ==========================================

  /// Formats a complete [ReceiptDocument] into ESC/POS bytecode.
  List<int> formatReceiptDocumentEscPos(ReceiptDocument doc) {
    final builder = EscPosBuilder();
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');

    // 1. Only a validated ESC/POS raster command belongs in this byte stream.
    // PNG bitmap payloads are sent through native bitmap operations by adapters.
    if (doc.logoRasterBytes != null && _isEscPosRaster(doc.logoRasterBytes!)) {
      builder.rasterImage(doc.logoRasterBytes!).feedLines(1);
    }

    // 2. Business Header
    builder
        .align(EscPosAlign.center)
        .bold(true)
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine(marginLine(doc.businessName))
        .fontSize(EscPosFontSize.normal)
        .bold(false);

    if (doc.legalName != null && doc.legalName!.isNotEmpty) {
      marginTextLine(builder, doc.legalName!);
    }
    if (doc.ruc != null && doc.ruc!.isNotEmpty) {
      marginTextLine(builder, 'RUC: ${doc.ruc!}');
    }

    builder
        .bold(true)
        .textLine(marginLine(doc.taxRegime.receiptRegimeHeader))
        .bold(false);

    if (doc.address != null && doc.address!.isNotEmpty) {
      for (final line in wrap(doc.address!)) {
        marginTextLine(builder, line);
      }
    }
    if (doc.phone != null && doc.phone!.isNotEmpty) {
      marginTextLine(builder, 'Tel: ${doc.phone!}');
    }

    // 3. Document Info Block
    builder
        .textLine(marginLine(doubleDivider()))
        .bold(true)
        .textLine(marginLine(doc.documentTitle))
        .textLine(marginLine('No. ${doc.documentNumber}'))
        .bold(false)
        .align(EscPosAlign.left);

    for (final l in formatKeyValue('Fecha:', dateFormat.format(doc.date))) {
      marginTextLine(builder, l);
    }
    if (doc.cashierName != null && doc.cashierName!.isNotEmpty) {
      for (final l in formatKeyValue('Atendido por:', doc.cashierName!)) {
        marginTextLine(builder, l);
      }
    }
    if (doc.customerName != null &&
        doc.customerName!.isNotEmpty &&
        doc.customerName != 'N/A') {
      for (final l in formatKeyValue('Cliente:', doc.customerName!)) {
        marginTextLine(builder, l);
      }
    }
    if (doc.customerRuc != null &&
        doc.customerRuc!.isNotEmpty &&
        doc.customerRuc != 'N/A') {
      for (final l in formatKeyValue('RUC/Cedula:', doc.customerRuc!)) {
        marginTextLine(builder, l);
      }
    }
    if (doc.originInvoiceId != null && doc.originInvoiceId!.isNotEmpty) {
      for (final l in formatKeyValue('Doc. Origen:', doc.originInvoiceId!)) {
        marginTextLine(builder, l);
      }
    }

    marginTextLine(builder, divider('-'));

    // 4. Items Header
    if (metrics.contentColumns <= 38) {
      marginTextLine(builder, formatTwoColumns('CANT DESCRIPCION', 'TOTAL'));
    } else {
      // 80mm: CANT(4) + gutter(1) + DESCRIPCION(14) + gutter(1) + P.UNIT(8) + gutter(1) + TOTAL(11) = 40
      final hQty = 'CANT'.padRight(metrics.qtyWidth);
      final hDesc = 'DESCRIPCION'.padRight(metrics.descriptionWidth);
      final hUnitPrice = 'P.UNIT'.padLeft(metrics.unitPriceWidth);
      final hTotal = 'TOTAL'.padLeft(metrics.totalWidth);
      final gutter = ' ';
      marginTextLine(
        builder,
        '$hQty$gutter$hDesc$gutter$hUnitPrice$gutter$hTotal',
      );
    }
    marginTextLine(builder, divider('-'));

    // Items Body
    for (final line in doc.lines) {
      final hasLineDiscount = line.discount > 0;
      final displayLineTotal = hasLineDiscount && line.grossAmount > 0
          ? line.grossAmount
          : line.lineSubtotal;
      final rowLines = formatItemRow(
        quantity: line.quantity,
        name: line.description,
        unitPrice: line.unitPrice,
        total: displayLineTotal,
      );
      for (final r in rowLines) {
        marginTextLine(builder, r);
      }

      final modifiers = line.modifierDisplays.isNotEmpty
          ? line.modifierDisplays.map((modifier) => modifier.printableText)
          : line.modifiers;
      for (final mod in modifiers) {
        for (final mLine in wrap('  + $mod', metrics.contentWidth, '    ')) {
          marginTextLine(builder, mLine);
        }
      }
      if (hasLineDiscount) {
        if (metrics.is80mm) {
          marginTextLine(
            builder,
            formatTwoColumns('Descuento', amount80(line.discount)),
          );
          marginTextLine(
            builder,
            formatTwoColumns('Neto', amount80(line.lineSubtotal)),
          );
        } else {
          marginTextLine(
            builder,
            formatTwoColumns('  - Descuento:', formatMoney(line.discount)),
          );
          marginTextLine(
            builder,
            formatTwoColumns('  Neto:', formatMoney(line.lineSubtotal)),
          );
        }
      }
      if (line.notes != null && line.notes!.isNotEmpty) {
        for (final noteLine in wrap(
          '  * ${line.notes!}',
          metrics.contentWidth,
          '    ',
        )) {
          marginTextLine(builder, noteLine);
        }
      }
    }

    marginTextLine(builder, divider('-'));

    // 5. Totals & Tax Compliance (Ley 822 / DGI)
    final hasDiscountEsc = doc.discountTotal > 0;
    final displayGrossSubtotalEsc = hasDiscountEsc && doc.grossSubtotal > 0
        ? doc.grossSubtotal
        : (hasDiscountEsc ? (doc.subtotal + doc.discountTotal) : doc.subtotal);

    if (doc.taxRegime.isCuotaFija) {
      if (hasDiscountEsc) {
        if (metrics.is80mm) {
          marginTextLine(
            builder,
            formatTwoColumns(
              'SUBTOTAL BRUTO:',
              summaryAmount80(displayGrossSubtotalEsc),
            ),
          );
          marginTextLine(
            builder,
            formatTwoColumns('DESCUENTO:', summaryAmount80(doc.discountTotal)),
          );
          marginTextLine(
            builder,
            formatTwoColumns('SUBTOTAL NETO:', summaryAmount80(doc.subtotal)),
          );
        } else {
          marginTextLine(
            builder,
            formatTwoColumns(
              'SUBTOTAL BRUTO:',
              formatMoney(displayGrossSubtotalEsc),
            ),
          );
          marginTextLine(
            builder,
            formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)),
          );
          marginTextLine(
            builder,
            formatTwoColumns('SUBTOTAL NETO:', formatMoney(doc.subtotal)),
          );
        }
      } else {
        marginTextLine(
          builder,
          metrics.is80mm
              ? formatTwoColumns('SUBTOTAL:', summaryAmount80(doc.subtotal))
              : formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)),
        );
      }
      builder
          .textLine(marginLine(doubleDivider()))
          .bold(true)
          .textLine(
            marginLine(
              metrics.is80mm
                  ? formatTwoColumns(
                      'TOTAL CORDOBAS:',
                      summaryAmount80(doc.total),
                    )
                  : formatTwoColumns('TOTAL CORDOBAS:', formatMoney(doc.total)),
            ),
          )
          .bold(false)
          .textLine(marginLine(doubleDivider()));
    } else {
      if (doc.isTaxExempt || doc.globalTaxOverride) {
        if (hasDiscountEsc) {
          if (metrics.is80mm) {
            marginTextLine(
              builder,
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                summaryAmount80(displayGrossSubtotalEsc),
              ),
            );
            marginTextLine(
              builder,
              formatTwoColumns(
                'DESCUENTO:',
                summaryAmount80(doc.discountTotal),
              ),
            );
            marginTextLine(
              builder,
              formatTwoColumns('SUBTOTAL NETO:', summaryAmount80(doc.subtotal)),
            );
          } else {
            marginTextLine(
              builder,
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                formatMoney(displayGrossSubtotalEsc),
              ),
            );
            marginTextLine(
              builder,
              formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)),
            );
            marginTextLine(
              builder,
              formatTwoColumns('SUBTOTAL NETO:', formatMoney(doc.subtotal)),
            );
          }
        } else {
          marginTextLine(
            builder,
            metrics.is80mm
                ? formatTwoColumns('SUBTOTAL:', summaryAmount80(doc.subtotal))
                : formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)),
          );
        }
        builder
            .textLine(
              marginLine(
                formatTwoColumns('VENTA EXENTA (IVA 0%):', formatMoney(0.00)),
              ),
            )
            .textLine(marginLine(doubleDivider()))
            .bold(true)
            .textLine(
              marginLine(
                metrics.is80mm
                    ? formatTwoColumns(
                        'TOTAL CORDOBAS:',
                        summaryAmount80(doc.total),
                      )
                    : formatTwoColumns(
                        'TOTAL CORDOBAS:',
                        formatMoney(doc.total),
                      ),
              ),
            )
            .bold(false)
            .textLine(marginLine(doubleDivider()))
            .align(EscPosAlign.center);
        for (final line in centerLines(
          '** VENTA EXENTA DE IVA - POLITICA TEMPORAL **',
        )) {
          marginTextLine(builder, line);
        }
        builder.align(EscPosAlign.left);
      } else {
        if (hasDiscountEsc) {
          if (metrics.is80mm) {
            marginTextLine(
              builder,
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                summaryAmount80(displayGrossSubtotalEsc),
              ),
            );
            marginTextLine(
              builder,
              formatTwoColumns(
                'DESCUENTO:',
                summaryAmount80(doc.discountTotal),
              ),
            );
            marginTextLine(
              builder,
              formatTwoColumns('SUBTOTAL NETO:', summaryAmount80(doc.subtotal)),
            );
          } else {
            marginTextLine(
              builder,
              formatTwoColumns(
                'SUBTOTAL BRUTO:',
                formatMoney(displayGrossSubtotalEsc),
              ),
            );
            marginTextLine(
              builder,
              formatTwoColumns('DESCUENTO:', formatMoney(doc.discountTotal)),
            );
            marginTextLine(
              builder,
              formatTwoColumns('SUBTOTAL NETO:', formatMoney(doc.subtotal)),
            );
          }
        } else {
          marginTextLine(
            builder,
            metrics.is80mm
                ? formatTwoColumns('SUBTOTAL:', summaryAmount80(doc.subtotal))
                : formatTwoColumns('SUBTOTAL:', formatMoney(doc.subtotal)),
          );
        }
        if (doc.exemptSubtotal > 0) {
          marginTextLine(
            builder,
            formatTwoColumns('VENTA EXENTA:', formatMoney(doc.exemptSubtotal)),
          );
        }
        if (doc.totalTax > 0) {
          marginTextLine(
            builder,
            formatTwoColumns('IVA (15%):', formatMoney(doc.totalTax)),
          );
        }
        builder
            .textLine(marginLine(doubleDivider()))
            .bold(true)
            .textLine(
              marginLine(
                metrics.is80mm
                    ? formatTwoColumns(
                        'TOTAL CORDOBAS:',
                        summaryAmount80(doc.total),
                      )
                    : formatTwoColumns(
                        'TOTAL CORDOBAS:',
                        formatMoney(doc.total),
                      ),
              ),
            )
            .bold(false)
            .textLine(marginLine(doubleDivider()));
      }
    }

    // 6. Secondary USD Total
    if (doc.commercialRate > 0) {
      if (metrics.is80mm) {
        builder
            .textLine(
              marginLine(
                formatTwoColumns(
                  'T/C USD:',
                  formatMoney(doc.commercialRate, includeSymbol: false),
                ),
              ),
            )
            .textLine(
              marginLine(
                formatTwoColumns(
                  'TOTAL USD:',
                  formatMoney(doc.totalUsd, symbol: '\$'),
                ),
              ),
            );
      } else {
        builder
            .textLine(
              marginLine(
                formatTwoColumns('T/C USD:', formatMoney(doc.commercialRate)),
              ),
            )
            .textLine(
              marginLine(
                formatTwoColumns(
                  'TOTAL USD:',
                  formatMoney(doc.totalUsd, symbol: '\$'),
                ),
              ),
            );
      }
    }

    // 7. Payments
    builder
        .textLine(marginLine(divider('-')))
        .align(EscPosAlign.center)
        .textLine(marginLine(sectionHeader('DETALLE DE PAGO')))
        .align(EscPosAlign.left);

    if (doc.payments.isEmpty) {
      marginTextLine(builder, formatTwoColumns('Condicion:', 'Contado'));
    } else {
      for (final p in doc.payments) {
        final String amountFormatted;
        if (metrics.is80mm) {
          amountFormatted = p.currency == 'USD'
              ? '\$ ${p.amount.toStringAsFixed(2)}'
              : summaryAmount80(p.amount);
        } else {
          amountFormatted = p.currency == 'USD'
              ? '\$ ${p.amount.toStringAsFixed(2)}'
              : formatMoney(p.amount);
        }
        marginTextLine(
          builder,
          formatTwoColumns('${p.methodLabel}:', amountFormatted),
        );

        if (p.changeGiven > 0) {
          final changeCurr = p.changeCurrency ?? 'NIO';
          final String changeFormatted;
          if (metrics.is80mm) {
            changeFormatted = changeCurr == 'USD'
                ? '\$ ${p.changeGiven.toStringAsFixed(2)}'
                : summaryAmount80(p.changeGiven);
          } else {
            changeFormatted = changeCurr == 'USD'
                ? '\$ ${p.changeGiven.toStringAsFixed(2)}'
                : formatMoney(p.changeGiven);
          }
          marginTextLine(
            builder,
            formatTwoColumns('Cambio ($changeCurr):', changeFormatted),
          );
        }
        if (p.reference != null && p.reference!.isNotEmpty) {
          for (final refLine in formatKeyValue('  Auth/Ref:', p.reference!)) {
            marginTextLine(builder, refLine);
          }
        }
      }
    }

    // 8. Footer
    marginTextLine(builder, doubleDivider()).align(EscPosAlign.center);

    if (doc.taxRegime.isCuotaFija) {
      marginTextLine(
        builder,
        'CONTRIBUYENTE DE CUOTA FIJA',
      ).textLine(marginLine('NO RECAUDA IVA')).feedLines(1);
    }

    final footerMsg = doc.footerMessage ?? '*** GRACIAS POR SU COMPRA ***';
    builder.bold(true);
    for (final line in wrap(footerMsg)) {
      marginTextLine(builder, line);
    }
    builder.bold(false).feedLines(3).cut();

    return builder.toBytes();
  }

  bool _isEscPosRaster(List<int> bytes) =>
      bytes.length >= 8 &&
      bytes[0] == 0x1B &&
      bytes[1] == 0x61 &&
      bytes[3] == 0x1D &&
      bytes[4] == 0x76 &&
      bytes[5] == 0x30;

  /// Backwards-compatibility helper for tests.
  String drawLine([String char = '-']) => divider(char);

  /// Legacy invoice adapter retained for pre-ReceiptDocument callers.
  /// New code should build a canonical ReceiptDocument at the application boundary.
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
    String? footerMessage,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    PostPaidFeedback? loyaltyFeedback,
  }) {
    if (!(loyaltyFeedback?.hasContent ?? false)) {
      return formatReceiptDocumentText(
        ReceiptDocument.fromInvoice(
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
        ),
      );
    }

    final buffer = StringBuffer();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    // 1. Header (Centered)
    buffer.writeln(center(businessName ?? 'OMNIFOOD NI'));
    if (legalName != null &&
        legalName.isNotEmpty &&
        legalName != businessName) {
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
    buffer.writeln(
      formatTwoColumns('Fecha:', dateFormat.format(invoice.createdAt)),
    );

    if (cashierName != null && cashierName.isNotEmpty) {
      buffer.writeln(formatTwoColumns('Atendido por:', cashierName));
    }
    final printableCustomerName = customerName?.trim().isNotEmpty == true
        ? customerName!.trim()
        : invoice.customerId?.trim();
    if (printableCustomerName != null &&
        printableCustomerName.isNotEmpty &&
        printableCustomerName.toUpperCase() != 'N/A') {
      buffer.writeln('Cliente:');
      for (final line in wrap(printableCustomerName)) {
        buffer.writeln(line);
      }
    }
    final printableCustomerRuc = customerRuc?.trim();
    if (printableCustomerRuc != null &&
        printableCustomerRuc.isNotEmpty &&
        printableCustomerRuc.toUpperCase() != 'N/A') {
      buffer.writeln(formatTwoColumns('RUC/Cedula:', printableCustomerRuc));
    }
    if (invoice.originInvoiceId != null &&
        invoice.originInvoiceId!.isNotEmpty) {
      buffer.writeln(
        formatTwoColumns('Doc. Origen:', invoice.originInvoiceId!),
      );
    }

    buffer.writeln(drawLine('-'));

    // 2. Table Column Header
    if (maxCols <= 38) {
      buffer.writeln(formatTwoColumns('CANT DESCRIPCION', 'TOTAL'));
    } else {
      buffer.writeln(
        'CANT'.padRight(4) +
            'DESCRIPCION'.padRight(22) +
            'P.UNIT'.padLeft(10) +
            'TOTAL'.padLeft(12),
      );
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
        final modPrice = mod.extraPrice > 0
            ? ' (+C\$ ${mod.extraPrice.toStringAsFixed(2)})'
            : '';
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
      buffer.writeln(
        formatTwoColumns(
          'TOTAL CORDOBAS:',
          'C\$ ${invoice.total.toStringAsFixed(2)}',
        ),
      );
    } else {
      // REGIMEN GENERAL
      final effectiveExempt = isTaxExempt || invoice.globalTaxOverride;
      if (effectiveExempt) {
        buffer.writeln(
          formatTwoColumns(
            'SUBTOTAL:',
            'C\$ ${invoice.subtotal.toStringAsFixed(2)}',
          ),
        );
        buffer.writeln(formatTwoColumns('VENTA EXENTA (IVA 0%):', 'C\$ 0.00'));
        buffer.writeln(
          formatTwoColumns(
            'TOTAL CORDOBAS:',
            'C\$ ${invoice.total.toStringAsFixed(2)}',
          ),
        );
        for (final line in centerLines(
          '** VENTA EXENTA DE IVA - POLITICA TEMPORAL **',
        )) {
          buffer.writeln(line);
        }
      } else {
        buffer.writeln(
          formatTwoColumns(
            'SUBTOTAL:',
            'C\$ ${invoice.subtotal.toStringAsFixed(2)}',
          ),
        );
        buffer.writeln(
          formatTwoColumns(
            'IVA (15%):',
            'C\$ ${invoice.totalTax.toStringAsFixed(2)}',
          ),
        );
        buffer.writeln(
          formatTwoColumns(
            'TOTAL CORDOBAS:',
            'C\$ ${invoice.total.toStringAsFixed(2)}',
          ),
        );
      }
    }

    // USD Total Calculation
    final commRate = invoice.commercialRate > 0
        ? invoice.commercialRate
        : (invoice.bcnOfficialRate > 0 ? invoice.bcnOfficialRate : 36.50);
    final totalUsdCalc = invoice.totalUsd > 0
        ? invoice.totalUsd
        : (invoice.total / commRate);
    buffer.writeln(
      formatTwoColumns(
        'TOTAL DOLARES:',
        '\$ ${totalUsdCalc.toStringAsFixed(2)}',
      ),
    );

    buffer.writeln(drawLine('-'));
    buffer.writeln(
      formatTwoColumns('Tipo de Cambio:', 'C\$ ${commRate.toStringAsFixed(2)}'),
    );

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
              buffer.writeln(
                formatTwoColumns(
                  'Efectivo USD:',
                  '\$ ${p.amount.toStringAsFixed(2)}',
                ),
              );
              if (p.changeGiven > 0) {
                final cCurr = p.changeCurrency == 'USD' ? '\$ ' : 'C\$ ';
                buffer.writeln(
                  formatTwoColumns(
                    'Cambio (${p.changeCurrency}):',
                    '$cCurr${p.changeGiven.toStringAsFixed(2)}',
                  ),
                );
              }
            } else {
              buffer.writeln(
                formatTwoColumns(
                  'Efectivo C\$:',
                  'C\$ ${p.amount.toStringAsFixed(2)}',
                ),
              );
              if (p.changeGiven > 0) {
                buffer.writeln(
                  formatTwoColumns(
                    'Cambio C\$:',
                    'C\$ ${p.changeGiven.toStringAsFixed(2)}',
                  ),
                );
              }
            }
            break;
          case PaymentMethod.card:
            final bank = p.bankPos ?? 'POS';
            final brand = p.cardBrand ?? 'TARJETA';
            buffer.writeln(
              formatTwoColumns(
                '$brand ($bank):',
                'C\$ ${p.amount.toStringAsFixed(2)}',
              ),
            );
            final auth = p.voucherCode ?? 'PENDIENTE';
            final last4 = p.last4 != null ? ' (****${p.last4})' : '';
            buffer.writeln(formatTwoColumns('  Auth/Ref:', '$auth$last4'));
            break;
          case PaymentMethod.qr:
            buffer.writeln(
              formatTwoColumns(
                'Transferencia / QR:',
                'C\$ ${p.amount.toStringAsFixed(2)}',
              ),
            );
            break;
          case PaymentMethod.points:
            buffer.writeln(
              formatTwoColumns(
                'Puntos Lealtad:',
                'C\$ ${p.amount.toStringAsFixed(2)}',
              ),
            );
            break;
        }
      }
    }

    buffer.writeln(drawLine('='));

    // Loyalty block — inserted before GRACIAS, fiscal data never affected
    if (loyaltyFeedback != null && loyaltyFeedback.hasContent) {
      for (final line in formatLoyaltyBlock(feedback: loyaltyFeedback)) {
        buffer.writeln(line);
      }
    }

    for (final line in wrap(footerMessage ?? '*** GRACIAS POR SU COMPRA ***')) {
      buffer.writeln(center(line));
    }
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
    PostPaidFeedback? loyaltyFeedback,
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

    if (legalName != null &&
        legalName.isNotEmpty &&
        legalName != businessName) {
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
        .textLine(
          formatTwoColumns('Fecha:', dateFormat.format(invoice.createdAt)),
        );

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
      builder.textLine(
        'CANT'.padRight(4) +
            'DESCRIPCION'.padRight(22) +
            'P.UNIT'.padLeft(10) +
            'TOTAL'.padLeft(12),
      );
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
        final modPrice = mod.extraPrice > 0
            ? ' (+C\$ ${mod.extraPrice.toStringAsFixed(2)})'
            : '';
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
          .textLine(
            formatTwoColumns(
              'TOTAL CORDOBAS:',
              'C\$ ${invoice.total.toStringAsFixed(2)}',
            ),
          )
          .bold(false);
    } else {
      final effectiveExempt = isTaxExempt || invoice.globalTaxOverride;
      if (effectiveExempt) {
        builder
            .textLine(
              formatTwoColumns(
                'SUBTOTAL:',
                'C\$ ${invoice.subtotal.toStringAsFixed(2)}',
              ),
            )
            .textLine(formatTwoColumns('VENTA EXENTA (IVA 0%):', 'C\$ 0.00'))
            .bold(true)
            .textLine(
              formatTwoColumns(
                'TOTAL CORDOBAS:',
                'C\$ ${invoice.total.toStringAsFixed(2)}',
              ),
            )
            .bold(false)
            .align(EscPosAlign.center);
        for (final line in centerLines(
          '** VENTA EXENTA DE IVA - POLITICA TEMPORAL **',
        )) {
          builder.textLine(line);
        }
        builder.align(EscPosAlign.left);
      } else {
        builder
            .textLine(
              formatTwoColumns(
                'SUBTOTAL:',
                'C\$ ${invoice.subtotal.toStringAsFixed(2)}',
              ),
            )
            .textLine(
              formatTwoColumns(
                'IVA (15%):',
                'C\$ ${invoice.totalTax.toStringAsFixed(2)}',
              ),
            )
            .bold(true)
            .textLine(
              formatTwoColumns(
                'TOTAL CORDOBAS:',
                'C\$ ${invoice.total.toStringAsFixed(2)}',
              ),
            )
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
        .textLine(
          formatTwoColumns(
            'TOTAL DOLARES:',
            '\$ ${totalUsdCalc.toStringAsFixed(2)}',
          ),
        )
        .textLine(drawLine('-'))
        .textLine(
          formatTwoColumns(
            'Tipo de Cambio:',
            'C\$ ${commRate.toStringAsFixed(2)}',
          ),
        )
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
          builder.textLine(
            formatTwoColumns(
              'Efectivo ${p.currency}:',
              '${p.currency == "USD" ? "\$ " : "C\$ "}${p.amount.toStringAsFixed(2)}',
            ),
          );
          if (p.changeGiven > 0) {
            builder.textLine(
              formatTwoColumns(
                'Cambio (${p.changeCurrency}):',
                '${p.changeCurrency == "USD" ? "\$ " : "C\$ "}${p.changeGiven.toStringAsFixed(2)}',
              ),
            );
          }
        } else if (p.method == PaymentMethod.card) {
          builder.textLine(
            formatTwoColumns(
              '${p.cardBrand ?? "TARJETA"} (${p.bankPos ?? "POS"}):',
              'C\$ ${p.amount.toStringAsFixed(2)}',
            ),
          );
          builder.textLine(
            formatTwoColumns('  Auth/Ref:', '${p.voucherCode ?? "PENDIENTE"}'),
          );
        } else if (p.method == PaymentMethod.qr) {
          builder.textLine(
            formatTwoColumns(
              'Transferencia / QR:',
              'C\$ ${p.amount.toStringAsFixed(2)}',
            ),
          );
        } else if (p.method == PaymentMethod.points) {
          builder.textLine(
            formatTwoColumns(
              'Puntos Lealtad:',
              'C\$ ${p.amount.toStringAsFixed(2)}',
            ),
          );
        }
      }
    }

    // Loyalty block — inserted before GRACIAS, fiscal data never affected
    if (loyaltyFeedback != null && loyaltyFeedback.hasContent) {
      for (final line in formatLoyaltyBlock(feedback: loyaltyFeedback)) {
        builder.textLine(line);
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
  // 4. Loyalty Block
  // ==========================================

  /// Generates the loyalty section lines for a receipt.
  /// Returns empty list if feedback is null — fiscal data is never affected.
  List<String> formatLoyaltyBlock({required dynamic feedback}) {
    if (feedback == null) return const [];

    final programs = feedback.programs as List<dynamic>;
    if (programs.isEmpty) return const [];

    final lines = <String>[];
    lines.add(drawLine('-'));
    lines.add(center('LEALTAD'));
    lines.add('');

    for (final program in programs) {
      final name = program.programName as String;
      final type = program.programType;
      final unitLabel = _loyaltyUnitLabel(type, program.unitsEarned as int);

      final parts = <String>[];

      if (program.unitsRedeemed as int > 0) {
        parts.add('-${program.unitsRedeemed} $unitLabel');
      }
      if (program.unitsEarned as int > 0) {
        parts.add('+${program.unitsEarned} $unitLabel');
      }
      if (parts.isNotEmpty) {
        lines.add(formatTwoColumns(name, parts.join('  ')));
      }

      if (program.rewardRedeemed as bool &&
          program.redeemedRewardName != null) {
        lines.add(
          formatTwoColumns('  Redimido:', '${program.redeemedRewardName}'),
        );
      } else if (program.rewardAvailable as bool &&
          program.rewardName != null) {
        lines.add(formatTwoColumns('  Recompensa:', '${program.rewardName}'));
      } else if (program.unitsToNextReward as int > 0) {
        lines.add(
          formatTwoColumns(
            '  Faltan:',
            '${program.unitsToNextReward} $unitLabel',
          ),
        );
      }

      lines.add(formatTwoColumns('  Saldo:', '${program.newBalance}'));
      lines.add('');
    }

    return lines;
  }

  static String _loyaltyUnitLabel(dynamic type, int count) {
    final typeName = type.toString().split('.').last;
    switch (typeName) {
      case 'spendPoints':
        return 'puntos';
      case 'productStamps':
        return count == 1 ? 'sello' : 'sellos';
      case 'visitStamps':
        return count == 1 ? 'visita' : 'visitas';
      default:
        return 'unidades';
    }
  }

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
