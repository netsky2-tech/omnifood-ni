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

/// Font-size kind of a segmented receipt text run.
enum ReceiptTextRunSize { normal, small }

/// A contiguous block of receipt text rendered at a single font size.
///
/// The plain-text receipt is segmented on complete lines only: every run's
/// text is built from whole lines (each emitted with its trailing newline,
/// except a trailing raw footer gap), so concatenating all run texts
/// reproduces `ReceiptLayoutFormatter.formatReceiptDocumentText`
/// byte-for-byte.
class ReceiptTextRun {
  final String text;
  final ReceiptTextRunSize size;

  const ReceiptTextRun(this.text, this.size);
}

/// Internal accumulator that groups emitted receipt lines into
/// [ReceiptTextRun]s of consecutive equal size.
class _ReceiptRunBuffer {
  final List<ReceiptTextRun> _runs = [];

  /// Emits one complete receipt line (with its trailing newline).
  void writeln(
    String line, {
    ReceiptTextRunSize size = ReceiptTextRunSize.normal,
  }) {
    _append('$line\n', size);
  }

  /// Appends raw trailing text (the footer gap) without adding a newline.
  void write(String text) => _append(text, ReceiptTextRunSize.normal);

  void _append(String text, ReceiptTextRunSize size) {
    if (_runs.isNotEmpty && _runs.last.size == size) {
      _runs[_runs.length - 1] = ReceiptTextRun(_runs.last.text + text, size);
    } else {
      _runs.add(ReceiptTextRun(text, size));
    }
  }

  List<ReceiptTextRun> build() => List.unmodifiable(_runs);
}

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

  /// D-17 (DT 09-2007 QUINTO): the fiscal authorization number prints at
  /// the bottom-right of the printed document. One right-aligned line when
  /// it fits at the current width; otherwise the label sits above a wrapped
  /// value block ([formatKeyValue] idiom). Empty value renders nothing —
  /// absence on paper is the honest state until the business fills the
  /// field (#548: never fabricate presence).
  List<String> fiscalAuthorizationLines(String? number) {
    final value = sanitizeInlineText(number ?? '');
    if (value.isEmpty) return const [];
    const label = 'Autorización DGI:';
    final oneLine = '$label $value';
    if (oneLine.length <= maxCols) {
      return [oneLine.padLeft(maxCols)];
    }
    return formatKeyValue(label, value);
  }

  /// A customer-block value is printable only when it is non-blank AND is not
  /// the legacy 'N/A' placeholder. The comparison is case-insensitive: 'n/a'
  /// is the same absence of fact, and all four render paths must agree —
  /// otherwise the very same sale prints four different fiscal documents
  /// (odd/factura-con-nombre, post-review). The rule is "never print a
  /// placeholder as if it were a fact": absence stays absence.
  static bool isPrintableCustomerValue(String? value) {
    final trimmed = value?.trim() ?? '';
    return trimmed.isNotEmpty && trimmed.toUpperCase() != 'N/A';
  }

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
  // 2. Voluntary Tip Rendering
  // ==========================================

  /// Label for the tip line: `PROPINA (10%):` when the effective percentage
  /// was snapshotted, plain `PROPINA:` otherwise (historical rows carry none).
  /// The amount is always the stored snapshot — never recomputed.
  String tipLabel(ReceiptDocument doc) {
    final pct = doc.tipPercentage;
    if (pct == null || pct <= 0) return 'PROPINA:';
    final percentText = pct == pct.roundToDouble()
        ? pct.toStringAsFixed(0)
        : pct.toString();
    return 'PROPINA ($percentText%):';
  }

  /// Non-taxable NIO tip block: the tip and the amount actually collected.
  /// Rendered separately from the fiscal total so the payment breakdown
  /// balances. A zero/absent tip renders nothing.
  List<String> tipNioLines(ReceiptDocument doc) {
    if (!doc.hasTip) return const [];
    return [
      ...formatKeyValue(tipLabel(doc), formatMoney(doc.tipAmountNio)),
      ...formatKeyValue(
        'TOTAL A PAGAR:',
        formatMoney(doc.totalWithTipNio),
      ),
    ];
  }

  /// USD reference of the same non-taxable tip block. Rendered only when a
  /// USD tip snapshot exists.
  List<String> tipUsdLines(ReceiptDocument doc) {
    if (doc.tipAmountUsd <= 0) return const [];
    return [
      ...formatKeyValue(
        'PROPINA USD:',
        formatMoney(doc.tipAmountUsd, symbol: '\$'),
      ),
      ...formatKeyValue(
        'TOTAL A PAGAR USD:',
        formatMoney(doc.totalWithTipUsd, symbol: '\$'),
      ),
    ];
  }

  // ==========================================
  // 3. Receipt Document Text Formatting
  // ==========================================

  /// Formats a complete, calculated [ReceiptDocument] as plain text.
  /// Strictly adheres to visual hierarchy:
  /// BUSINESS -> DOCUMENT -> ITEMS -> SUMMARY -> TOTAL -> FX USD -> PAYMENTS -> FOOTER
  ///
  /// Byte-for-byte identical to concatenating the texts of
  /// [formatReceiptDocumentTextRuns].
  String formatReceiptDocumentText(ReceiptDocument doc) =>
      formatReceiptDocumentTextRuns(doc).map((run) => run.text).join();

  /// Segmented variant of [formatReceiptDocumentText]: the same receipt text
  /// grouped into [ReceiptTextRun]s by font size. Only the item modifier
  /// lines (`  + ...` extras under each item) are tagged
  /// [ReceiptTextRunSize.small]; every other line is
  /// [ReceiptTextRunSize.normal]. Run boundaries fall on complete lines, so
  /// the concatenation of all run texts equals the plain-text receipt
  /// byte-for-byte (T5: smaller font for extras on printers that accept a
  /// per-call text size, e.g. iPOS/Nyx).
  List<ReceiptTextRun> formatReceiptDocumentTextRuns(ReceiptDocument doc) {
    if (!doc.isFiscalDocument) {
      return _formatNonFiscalTestPageTextRuns(doc);
    }
    final buffer = _ReceiptRunBuffer();
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
    // Cancelled documents keep every fiscal element (DGI: no deletion) but lead
    // with an unmistakable ANULADO banner so the paper can never be mistaken
    // for a valid sale.
    if (doc.isCanceled) {
      buffer.writeln(doubleDivider());
      for (final l in centerLines('*** DOCUMENTO ANULADO ***')) {
        buffer.writeln(l);
      }
    }
    buffer.writeln(doubleDivider());
    buffer.writeln(center(doc.documentTitle));
    buffer.writeln(center('No. ${doc.documentNumber}'));
    if (doc.isCanceled) {
      final reason = doc.voidReason?.trim().isNotEmpty == true
          ? doc.voidReason!.trim()
          : 'SIN MOTIVO REGISTRADO';
      for (final l in formatKeyValue('Motivo:', reason)) {
        buffer.writeln(l);
      }
    }

    // D-13: reprints identify themselves and carry the reprint datetime.
    // Shares the banner slot with ANULADO: a canceled reprint shows both.
    // First-issuance documents render neither.
    if (doc.isReprint) {
      for (final l in centerLines('*** REIMPRESIÓN ***')) {
        buffer.writeln(l);
      }
      for (final l in formatKeyValue(
        'Reimpresión:',
        dateFormat.format(doc.reprintAt ?? DateTime.now()),
      )) {
        buffer.writeln(l);
      }
    }

    for (final l in formatKeyValue('Fecha:', dateFormat.format(doc.date))) {
      buffer.writeln(l);
    }

    // NHILOS §45.1 (Fecha · Hora · Caja · Turno): the Caja identifies the
    // point of sale on paper. It is an operator-assigned alias for THIS
    // terminal — never the device serial. Unset -> the line is omitted and
    // the ticket stays byte-identical to a terminal that never set it.
    if (doc.cajaLabel != null && doc.cajaLabel!.isNotEmpty) {
      for (final l in formatKeyValue('Caja:', doc.cajaLabel!)) {
        buffer.writeln(l);
      }
    }

    if (doc.cashierName != null && doc.cashierName!.isNotEmpty) {
      for (final l in formatKeyValue('Atendido por:', doc.cashierName!)) {
        buffer.writeln(l);
      }
    }

    // Decision 2 (odd/factura-con-nombre):
    // Venta anónima -> "Cliente: Contado" explícito.
    // Venta con nombre -> "Cliente: <nombre>".
    // Venta con RUC/Cédula -> "RUC/Cedula: <ruc>" (sólo si no es N/A ni vacío).
    // Owner rule (post-review ITEM 2): name absent + tax id present prints
    // ONLY the "RUC/Cedula:" line — the contradictory pair
    // "Cliente: Contado" + RUC is forbidden. "Cliente: Contado" is reserved
    // for a true anonymous sale (neither name nor tax id).
    final hasPrintableCustomerName = isPrintableCustomerValue(doc.customerName);
    final hasPrintableCustomerRuc = isPrintableCustomerValue(doc.customerRuc);
    if (hasPrintableCustomerName) {
      for (final l in formatKeyValue('Cliente:', doc.customerName!.trim())) {
        buffer.writeln(l);
      }
    } else if (!hasPrintableCustomerRuc) {
      for (final l in formatKeyValue('Cliente:', 'Contado')) {
        buffer.writeln(l);
      }
    }
    if (hasPrintableCustomerRuc) {
      for (final l in formatKeyValue('RUC/Cedula:', doc.customerRuc!.trim())) {
        buffer.writeln(l);
      }
    }
    // REQ-8 (slice 8a): the credit note's origin reference is the origin
    // invoice's HUMAN fiscal number (e.g. 001-001-01-00000042), resolved by
    // the view model at print time. Printed ONLY when resolved AND the
    // document is a credit note — never the internal originInvoiceId UUID,
    // never a placeholder. A missing reference prints no line at all.
    if (doc.isCreditNote &&
        doc.originDocumentReference != null &&
        doc.originDocumentReference!.isNotEmpty) {
      for (final l in formatKeyValue('Doc. Origen:', doc.originDocumentReference!)) {
        buffer.writeln(l);
      }
    }

    // DGI credit note (DT 09-2007): the compensating document names the
    // persisted refund reason at document level. Sourced ONLY from the
    // refund lines' persisted notes (createCreditNote stamps every line
    // with the issued reason); rendered when the lines carry one unified
    // reason and the document is not ALSO canceled (a canceled document's
    // 'Motivo:' line is the cancellation reason — never mix the two).
    // The formatter never invents fiscal copy.
    final creditNoteReason = unifiedCreditNoteReason(doc);
    if (!doc.isCanceled && creditNoteReason != null) {
      for (final l in formatKeyValue('Motivo:', creditNoteReason)) {
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
          // T5: extras print one size below the item text; layout (columns,
          // wrapping, ordering) is untouched — only the font-size tag differs.
          buffer.writeln(mLine, size: ReceiptTextRunSize.small);
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
      // Cuota Fija: Subtotal & Total. Never print an IVA line or VENTA EXENTA.
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
            formatTwoColumns('IVA:', formatMoney(doc.totalTax)),
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

    // 5b. VOLUNTARY TIP (non-taxable, DGI INV-16.1). It is printed OUTSIDE
    // the fiscal total block above and never changes it; it exists so the
    // payment breakdown — registered against total + tip — balances. A zero
    // tip renders nothing (existing receipts stay byte-identical).
    for (final line in tipNioLines(doc)) {
      buffer.writeln(line);
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
      for (final line in tipUsdLines(doc)) {
        buffer.writeln(line);
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

    // D-17 fiscal authorization number: bottom-right of the document
    // (DT 09-2007 QUINTO). Nothing prints when unconfigured.
    for (final line in fiscalAuthorizationLines(doc.fiscalAuthorizationNumber)) {
      buffer.writeln(line);
    }

    // Loyalty block — presentation only, inserted before the footer so the
    // fiscal document above is never affected.
    //
    // DECISION (accepted 2026-10-22): first issuance only. The feedback
    // snapshot (earned/redeemed + post-sale balance) is NOT persisted on the
    // invoice, so a reprint cannot reproduce it. Recomputing it from the
    // customer's CURRENT balance would print a false figure on a historical
    // document — strictly worse than omitting a non-fiscal marketing block.
    // Reprints therefore carry every fiscal line and no loyalty block. If the
    // business ever requires identical reprints, persist the snapshot (JSON
    // column) — never recompute it.
    if (doc.loyaltyFeedback?.hasContent ?? false) {
      for (final line in formatLoyaltyBlock(feedback: doc.loyaltyFeedback!)) {
        buffer.writeln(line);
      }
    }

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

    return buffer.build();
  }

  // ==========================================
  // 4. ESC/POS Bytecode Formatting
  // ==========================================

  /// Formats a complete [ReceiptDocument] into ESC/POS bytecode.
  /// Issue #957: hardware test page. Deliberately emits NO fiscal element —
  /// no regime header, no document number, no issuer RUC, no authorization
  /// code, no customer block and no amounts — so the paper cannot be read as
  /// a DGI comprobante. The "NO ES FACTURA" banner is the point of the page.
  List<ReceiptTextRun> _formatNonFiscalTestPageTextRuns(ReceiptDocument doc) {
    final buffer = _ReceiptRunBuffer();
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');

    buffer.writeln(center(doc.businessName));
    if (doc.legalName != null && doc.legalName!.isNotEmpty) {
      buffer.writeln(center(doc.legalName!));
    }
    if (doc.address != null && doc.address!.isNotEmpty) {
      for (final line in wrap(doc.address!)) {
        buffer.writeln(center(line));
      }
    }
    if (doc.phone != null && doc.phone!.isNotEmpty) {
      buffer.writeln(center('Tel: ${doc.phone!}'));
    }
    buffer.writeln(doubleDivider());
    for (final line in centerLines('*** NO ES FACTURA ***')) {
      buffer.writeln(line);
    }
    buffer.writeln(center('PRUEBA DE IMPRESION'));
    for (final line in centerLines('SIN VALIDEZ FISCAL')) {
      buffer.writeln(line);
    }
    buffer.writeln(doubleDivider());
    for (final l in formatKeyValue('Fecha:', dateFormat.format(doc.date))) {
      buffer.writeln(l);
    }
    if (doc.cajaLabel != null && doc.cajaLabel!.isNotEmpty) {
      for (final l in formatKeyValue('Caja:', doc.cajaLabel!)) {
        buffer.writeln(l);
      }
    }
    if (doc.cashierName != null && doc.cashierName!.isNotEmpty) {
      for (final l in formatKeyValue('Atendido por:', doc.cashierName!)) {
        buffer.writeln(l);
      }
    }
    buffer.writeln(divider());
    for (final line in wrap('Caracteres: ÁÉÍÓÚ áéíóú Ññ ¿? ¡! 0123456789')) {
      buffer.writeln(line);
    }
    buffer.writeln(doubleDivider());
    for (final line in wrap(doc.footerMessage ?? 'Fin de la prueba de impresion')) {
      buffer.writeln(center(line));
    }
    buffer.write('\n');
    return buffer.build();
  }

  /// Issue #957: ESC/POS twin of [_formatNonFiscalTestPageTextRuns]. Same
  /// lines in the same order; the banner is double-width and bold so it
  /// dominates the paper.
  List<int> _formatNonFiscalTestPageEscPos(ReceiptDocument doc) {
    final builder = EscPosBuilder();
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');

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
    if (doc.address != null && doc.address!.isNotEmpty) {
      for (final line in wrap(doc.address!)) {
        marginTextLine(builder, line);
      }
    }
    if (doc.phone != null && doc.phone!.isNotEmpty) {
      marginTextLine(builder, 'Tel: ${doc.phone!}');
    }

    marginTextLine(builder, doubleDivider());
    builder
        .bold(true)
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine(marginLine('*** NO ES FACTURA ***'))
        .fontSize(EscPosFontSize.normal)
        .textLine(marginLine('PRUEBA DE IMPRESION'))
        .textLine(marginLine('SIN VALIDEZ FISCAL'))
        .bold(false)
        .align(EscPosAlign.left);

    marginTextLine(builder, doubleDivider());
    for (final l in formatKeyValue('Fecha:', dateFormat.format(doc.date))) {
      marginTextLine(builder, l);
    }
    if (doc.cajaLabel != null && doc.cajaLabel!.isNotEmpty) {
      for (final l in formatKeyValue('Caja:', doc.cajaLabel!)) {
        marginTextLine(builder, l);
      }
    }
    if (doc.cashierName != null && doc.cashierName!.isNotEmpty) {
      for (final l in formatKeyValue('Atendido por:', doc.cashierName!)) {
        marginTextLine(builder, l);
      }
    }
    marginTextLine(builder, divider());
    for (final line in wrap('Caracteres: ÁÉÍÓÚ áéíóú Ññ ¿? ¡! 0123456789')) {
      marginTextLine(builder, line);
    }
    marginTextLine(builder, doubleDivider()).align(EscPosAlign.center);
    for (final line in wrap(doc.footerMessage ?? 'Fin de la prueba de impresion')) {
      marginTextLine(builder, line);
    }
    builder.feedLines(3).cut();

    return builder.toBytes();
  }

  List<int> formatReceiptDocumentEscPos(ReceiptDocument doc) {
    if (!doc.isFiscalDocument) {
      return _formatNonFiscalTestPageEscPos(doc);
    }
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
    // Cancelled documents lead with a dominant ANULADO banner (double-width
    // and bold so it dominates the paper); see the plain-text path above.
    if (doc.isCanceled) {
      builder
          .align(EscPosAlign.center)
          .bold(true)
          .fontSize(EscPosFontSize.doubleWidth)
          .textLine(marginLine('ANULADO'))
          .fontSize(EscPosFontSize.normal)
          .textLine(marginLine('*** DOCUMENTO ANULADO ***'))
          .bold(false)
          .align(EscPosAlign.left);
    }

    // D-13: reprints identify themselves and carry the reprint datetime.
    // Shares the banner slot with ANULADO: a canceled reprint shows both.
    // First-issuance documents render neither.
    if (doc.isReprint) {
      builder
          .align(EscPosAlign.center)
          .textLine(marginLine('*** REIMPRESIÓN ***'))
          .textLine(
            marginLine(
              'Reimpresión: ${dateFormat.format(doc.reprintAt ?? DateTime.now())}',
            ),
          )
          .align(EscPosAlign.left);
    }
    builder
        .textLine(marginLine(doubleDivider()))
        .bold(true)
        .textLine(marginLine(doc.documentTitle))
        .textLine(marginLine('No. ${doc.documentNumber}'))
        .bold(false)
        .align(EscPosAlign.left);

    if (doc.isCanceled) {
      final reason = doc.voidReason?.trim().isNotEmpty == true
          ? doc.voidReason!.trim()
          : 'SIN MOTIVO REGISTRADO';
      for (final l in formatKeyValue('Motivo:', reason)) {
        marginTextLine(builder, l);
      }
    }
    for (final l in formatKeyValue('Fecha:', dateFormat.format(doc.date))) {
      marginTextLine(builder, l);
    }
    // NHILOS §45.1: operator-assigned Caja alias; omitted when unset.
    if (doc.cajaLabel != null && doc.cajaLabel!.isNotEmpty) {
      for (final l in formatKeyValue('Caja:', doc.cajaLabel!)) {
        marginTextLine(builder, l);
      }
    }
    if (doc.cashierName != null && doc.cashierName!.isNotEmpty) {
      for (final l in formatKeyValue('Atendido por:', doc.cashierName!)) {
        marginTextLine(builder, l);
      }
    }
    // Decision 2 (odd/factura-con-nombre) + owner rule (post-review ITEM 2):
    // same customer-block contract as the text renderer — name present
    // prints "Cliente: <nombre>"; name absent + tax id present prints ONLY
    // "RUC/Cedula:"; "Cliente: Contado" is reserved for a true anonymous
    // sale (neither name nor tax id).
    final hasPrintableCustomerName = isPrintableCustomerValue(doc.customerName);
    final hasPrintableCustomerRuc = isPrintableCustomerValue(doc.customerRuc);
    if (hasPrintableCustomerName) {
      for (final l in formatKeyValue('Cliente:', doc.customerName!.trim())) {
        marginTextLine(builder, l);
      }
    } else if (!hasPrintableCustomerRuc) {
      for (final l in formatKeyValue('Cliente:', 'Contado')) {
        marginTextLine(builder, l);
      }
    }
    if (hasPrintableCustomerRuc) {
      for (final l in formatKeyValue('RUC/Cedula:', doc.customerRuc!.trim())) {
        marginTextLine(builder, l);
      }
    }
    // REQ-8 (slice 8a): same rule as the text renderer — only the resolved
    // human fiscal number of the origin invoice, only on credit notes.
    // Never the internal originInvoiceId UUID.
    if (doc.isCreditNote &&
        doc.originDocumentReference != null &&
        doc.originDocumentReference!.isNotEmpty) {
      for (final l in formatKeyValue('Doc. Origen:', doc.originDocumentReference!)) {
        marginTextLine(builder, l);
      }
    }

    // DGI credit note (DT 09-2007): document-level refund reason, same
    // sourcing/guarding rules as the text renderer above. Never fabricated.
    final creditNoteReason = unifiedCreditNoteReason(doc);
    if (!doc.isCanceled && creditNoteReason != null) {
      for (final l in formatKeyValue('Motivo:', creditNoteReason)) {
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
            formatTwoColumns('IVA:', formatMoney(doc.totalTax)),
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

    // 5b. Voluntary tip (non-taxable, DGI INV-16.1): outside the fiscal total
    // block, before the payment breakdown it reconciles. No tip → no lines.
    for (final line in tipNioLines(doc)) {
      marginTextLine(builder, line);
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
      for (final line in tipUsdLines(doc)) {
        marginTextLine(builder, line);
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

    // D-17 fiscal authorization number: bottom-right of the document
    // (DT 09-2007 QUINTO). Nothing prints when unconfigured.
    final authorizationLines =
        fiscalAuthorizationLines(doc.fiscalAuthorizationNumber);
    if (authorizationLines.isNotEmpty) {
      builder.align(EscPosAlign.right);
      for (final line in authorizationLines) {
        marginTextLine(builder, line.trim());
      }
      builder.align(EscPosAlign.left);
    }

    // First issuance only — see the canonical text renderer for the decision
    // and why reprints must never recompute the balance.
    if (doc.loyaltyFeedback?.hasContent ?? false) {
      for (final line in formatLoyaltyBlock(feedback: doc.loyaltyFeedback!)) {
        marginTextLine(builder, line);
      }
    }

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
    String? fiscalAuthorizationNumber,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    PostPaidFeedback? loyaltyFeedback,
  }) {
    // Single canonical renderer: loyalty is a presentation field of the
    // document, not a reason to switch to a divergent layout. Fiscal data,
    // the 80mm grid, discounts, tip, reprint/void banners and the credit-note
    // origin are identical for every sale.
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
        fiscalAuthorizationNumber: fiscalAuthorizationNumber,
        loyaltyFeedback: loyaltyFeedback,
      ),
    );
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
    String? customerName,
    String? customerRuc,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    List<int>? logoRasterBytes,
    String? fiscalAuthorizationNumber,
    PostPaidFeedback? loyaltyFeedback,
  }) {
    return formatReceiptDocumentEscPos(
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
        logoRasterBytes: logoRasterBytes,
        fiscalAuthorizationNumber: fiscalAuthorizationNumber,
        loyaltyFeedback: loyaltyFeedback,
      ),
    );
  }

  // ==========================================
  // 5. Loyalty Block
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
  /// The document-level refund reason for a credit note, when its persisted
  /// refund lines agree on exactly one non-blank note. Null for any other
  /// document type, or when the lines disagree or carry no reason at all —
  /// in those cases nothing is rendered and nothing is invented.
  String? unifiedCreditNoteReason(ReceiptDocument doc) {
    if (doc.documentTitle != 'NOTA DE CREDITO') return null;
    final reasons = <String>{};
    for (final line in doc.lines) {
      final note = line.notes?.trim() ?? '';
      if (note.isEmpty) continue;
      reasons.add(note);
    }
    return reasons.length == 1 ? reasons.single : null;
  }
}
