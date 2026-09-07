import 'package:intl/intl.dart';
import '../../models/printer/receipt_document.dart';
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
}
