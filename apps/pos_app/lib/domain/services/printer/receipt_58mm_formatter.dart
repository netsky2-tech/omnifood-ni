import 'package:intl/intl.dart';
import '../../models/config/tax_regime.dart';
import '../../models/sales/cashier_session.dart';
import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';
import 'esc_pos_builder.dart';
import 'receipt_layout_formatter.dart';

/// Formatter and Layout Engine for 58mm Thermal Printers.
/// Adheres strictly to DGI Disposición Técnica 09-2007, Ley 822, and Food Park QSR needs.
class Receipt58mmFormatter {
  /// Usable monospaced character columns on 58mm thermal paper (384 dots @ 203 DPI = 32 cols).
  static const int lineWidth = 32;
  static final ReceiptLayoutFormatter _formatter = ReceiptLayoutFormatter.format58mm();

  // ==========================================
  // Layout & Text Manipulation Utilities
  // ==========================================

  /// Centers [text] within [width] characters.
  static String center(String text, [int width = lineWidth]) {
    final clean = text.trim();
    if (clean.length >= width) return clean.substring(0, width);
    final leftPadding = (width - clean.length) ~/ 2;
    final rightPadding = width - clean.length - leftPadding;
    return '${' ' * leftPadding}$clean${' ' * rightPadding}';
  }

  /// Formats two strings on the same line, with [left] aligned to the left
  /// and [right] aligned to the right, strictly fitting in [width] columns.
  static String twoColumns(String left, String right, [int width = lineWidth]) {
    final cleanLeft = left.trim();
    final cleanRight = right.trim();

    if (cleanRight.length >= width) {
      return cleanRight.substring(0, width);
    }

    final maxLeftLen = width - cleanRight.length - 1;
    final adjustedLeft = cleanLeft.length > maxLeftLen
        ? cleanLeft.substring(0, maxLeftLen)
        : cleanLeft;

    final spaces = width - adjustedLeft.length - cleanRight.length;
    return '$adjustedLeft${' ' * (spaces > 0 ? spaces : 1)}$cleanRight';
  }

  /// Formats an item row with [qty] on the left, [desc] in middle,
  /// and [total] strictly right-aligned.
  static List<String> formatItemRow({
    required String qty,
    required String desc,
    required String total,
    int width = lineWidth,
  }) {
    final cleanQty = qty.trim();
    final cleanTotal = total.trim();
    final qtyPrefix = cleanQty.padRight(4);
    final maxDescLen = width - qtyPrefix.length - cleanTotal.length - 1;

    if (desc.trim().length <= maxDescLen) {
      final descPart = desc.trim();
      final spaces = width - qtyPrefix.length - descPart.length - cleanTotal.length;
      return ['$qtyPrefix$descPart${' ' * (spaces > 0 ? spaces : 1)}$cleanTotal'];
    }

    final lines = <String>[];
    final wrappedDesc = wrap(desc.trim(), maxDescLen);
    for (int i = 0; i < wrappedDesc.length; i++) {
      if (i == 0) {
        final spaces = width - qtyPrefix.length - wrappedDesc[i].length - cleanTotal.length;
        lines.add('$qtyPrefix${wrappedDesc[i]}${' ' * (spaces > 0 ? spaces : 1)}$cleanTotal');
      } else {
        lines.add('    ${wrappedDesc[i]}');
      }
    }
    return lines;
  }

  /// Generates a continuous horizontal rule line of [char] with length [width].
  static String divider([String char = '-', int width = lineWidth]) {
    return char * width;
  }

  /// Wraps long text into lines of at most [width] characters.
  static List<String> wrap(String text, [int width = lineWidth]) {
    final words = text.trim().split(RegExp(r'\s+'));
    final lines = <String>[];
    var currentLine = '';

    for (final word in words) {
      if (currentLine.isEmpty) {
        if (word.length <= width) {
          currentLine = word;
        } else {
          var rem = word;
          while (rem.length > width) {
            lines.add(rem.substring(0, width));
            rem = rem.substring(width);
          }
          currentLine = rem;
        }
      } else if (currentLine.length + 1 + word.length <= width) {
        currentLine += ' $word';
      } else {
        lines.add(currentLine);
        if (word.length <= width) {
          currentLine = word;
        } else {
          var rem = word;
          while (rem.length > width) {
            lines.add(rem.substring(0, width));
            rem = rem.substring(width);
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
  // 1. DGI Fiscal Customer Invoice
  // ==========================================

  /// Formats a complete DGI-compliant invoice as plain text.
  static String formatInvoiceText(
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
    return _formatter.formatInvoiceText(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      legalName: legalName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
      taxRegime: taxRegime,
      isTaxExempt: isTaxExempt,
    );
  }

  /// Formats a complete DGI invoice into ESC/POS bytecode.
  static List<int> formatInvoiceEscPos(
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
    return _formatter.formatInvoiceEscPos(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      legalName: legalName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
      taxRegime: taxRegime,
      isTaxExempt: isTaxExempt,
      logoRasterBytes: logoRasterBytes,
    );
  }

  // ==========================================
  // 2. Kitchen / KDS Order Ticket
  // ==========================================

  /// Formats a kitchen order ticket as plain text.
  static String formatKitchenOrderText({
    required String ticketId,
    required String orderTitle,
    required String cashierName,
    required DateTime timestamp,
    required List<InvoiceItem> items,
    String? notes,
    int? buzzerNumber,
    String? tableName,
  }) {
    final buffer = StringBuffer();
    final timeFormat = DateFormat('HH:mm:ss');

    buffer.writeln(center('*** COMANDA COCINA ***'));
    buffer.writeln(divider('='));

    if (buzzerNumber != null && buzzerNumber > 0) {
      buffer.writeln(center('================================'));
      buffer.writeln(center('>>> BUZZER / PAGER #$buzzerNumber <<<'));
      buffer.writeln(center('================================'));
    } else if (tableName != null && tableName.isNotEmpty) {
      buffer.writeln(center('================================'));
      buffer.writeln(center('>>> MESA: $tableName <<<'));
      buffer.writeln(center('================================'));
    } else {
      buffer.writeln(center('>>> PARA LLEVAR <<<'));
    }

    buffer.writeln(twoColumns('Orden: $orderTitle', 'Hora: ${timeFormat.format(timestamp)}'));
    buffer.writeln(twoColumns('Ticket: $ticketId', 'Mesero: $cashierName'));
    buffer.writeln(divider('-'));
    buffer.writeln(twoColumns('CANT PRODUCTO', ''));
    buffer.writeln(divider('-'));

    for (final item in items) {
      final qtyStr = item.quantity % 1 == 0
          ? item.quantity.toInt().toString()
          : item.quantity.toStringAsFixed(2);
      for (final line in wrap('$qtyStr x ${item.productName}', lineWidth)) {
        buffer.writeln(line);
      }

      for (final mod in item.selectedModifiers) {
        for (final line in wrap('[MOD] ${mod.name}', lineWidth - 4)) {
          buffer.writeln('   * $line');
        }
      }
      if (item.notes != null && item.notes!.isNotEmpty) {
        for (final line in wrap('[NOTA] ${item.notes}', lineWidth - 4)) {
          buffer.writeln('   * $line');
        }
      }
    }

    if (notes != null && notes.isNotEmpty) {
      buffer.writeln(divider('-'));
      buffer.writeln('NOTAS GENERALES:');
      for (final line in wrap(notes)) {
        buffer.writeln('  $line');
      }
    }

    buffer.writeln(divider('='));
    return buffer.toString();
  }

  /// Formats a kitchen order ticket into ESC/POS bytecode.
  static List<int> formatKitchenOrderEscPos({
    required String ticketId,
    required String orderTitle,
    required String cashierName,
    required DateTime timestamp,
    required List<InvoiceItem> items,
    String? notes,
    int? buzzerNumber,
    String? tableName,
  }) {
    final builder = EscPosBuilder();
    final timeFormat = DateFormat('HH:mm:ss');

    builder
        .align(EscPosAlign.center)
        .bold(true)
        .fontSize(EscPosFontSize.doubleSize)
        .textLine('COMANDA COCINA')
        .fontSize(EscPosFontSize.normal);

    if (buzzerNumber != null && buzzerNumber > 0) {
      builder
          .textLine(divider('='))
          .fontSize(EscPosFontSize.doubleSize)
          .textLine('BUZZER #$buzzerNumber')
          .fontSize(EscPosFontSize.normal)
          .textLine(divider('='));
    } else if (tableName != null && tableName.isNotEmpty) {
      builder
          .textLine(divider('='))
          .fontSize(EscPosFontSize.doubleSize)
          .textLine('MESA: $tableName')
          .fontSize(EscPosFontSize.normal)
          .textLine(divider('='));
    }

    builder
        .align(EscPosAlign.left)
        .bold(false)
        .textLine(twoColumns('Orden: $orderTitle', 'Hora: ${timeFormat.format(timestamp)}'))
        .textLine(twoColumns('Ticket: $ticketId', 'Mesero: $cashierName'))
        .textLine(divider('-'))
        .bold(true)
        .textLine('ITEMS:')
        .bold(false);

    for (final item in items) {
      final qtyStr = item.quantity % 1 == 0
          ? item.quantity.toInt().toString()
          : item.quantity.toStringAsFixed(2);

      builder
          .bold(true)
          .textLine('$qtyStr x ${item.productName}')
          .bold(false);

      for (final mod in item.selectedModifiers) {
        builder.textLine('   * [MOD] ${mod.name}');
      }
      if (item.notes != null && item.notes!.isNotEmpty) {
        builder.textLine('   * [NOTA] ${item.notes}');
      }
    }

    if (notes != null && notes.isNotEmpty) {
      builder
          .textLine(divider('-'))
          .bold(true)
          .textLine('NOTAS GENERALES:')
          .bold(false);
      for (final line in wrap(notes)) {
        builder.textLine('  $line');
      }
    }

    builder
        .textLine(divider('='))
        .feedLines(3)
        .cut();

    return builder.toBytes();
  }

  // ==========================================
  // 3. Cash Drawer Audits (Corte X & Corte Z)
  // ==========================================

  /// Formats Partial Cash Audit (Corte X) as plain text.
  static String formatCorteXText(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    double? totalExpected,
  }) {
    final buffer = StringBuffer();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    buffer.writeln(center('*** CORTE X (PARCIAL) ***'));
    buffer.writeln(divider('='));
    buffer.writeln(twoColumns('Terminal:', session.terminalId));
    buffer.writeln(twoColumns('Cajero:', cashierName));
    buffer.writeln(twoColumns('Apertura:', dateFormat.format(session.openedAt)));
    buffer.writeln(twoColumns('Fecha Corte:', dateFormat.format(DateTime.now())));
    buffer.writeln(divider('-'));

    buffer.writeln(twoColumns('FONDO APERTURA NIO:', 'C\$ ${session.openingBalanceNio.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('FONDO APERTURA USD:', '\$ ${session.openingBalanceUsd.toStringAsFixed(2)}'));
    buffer.writeln(divider('-'));

    buffer.writeln(center('VENTAS POR METODO'));
    final cashSales = totalsByMethod[PaymentMethod.cash] ?? 0.0;
    final cardSales = totalsByMethod[PaymentMethod.card] ?? 0.0;
    final qrSales = totalsByMethod[PaymentMethod.qr] ?? 0.0;
    final pointsSales = totalsByMethod[PaymentMethod.points] ?? 0.0;
    final totalSales = cashSales + cardSales + qrSales + pointsSales;

    buffer.writeln(twoColumns('Efectivo:', 'C\$ ${cashSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Tarjeta POS:', 'C\$ ${cardSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Transferencia / QR:', 'C\$ ${qrSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Puntos Lealtad:', 'C\$ ${pointsSales.toStringAsFixed(2)}'));
    buffer.writeln(divider('-'));
    buffer.writeln(twoColumns('TOTAL VENTAS:', 'C\$ ${totalSales.toStringAsFixed(2)}'));

    if (totalExpected != null) {
      buffer.writeln(divider('-'));
      buffer.writeln(twoColumns('EFECTIVO ESPERADO EN CAJA:', 'C\$ ${totalExpected.toStringAsFixed(2)}'));
    }

    buffer.writeln(divider('='));
    buffer.writeln(center('AUDITORIA INTERNA - NO FISCAL'));
    return buffer.toString();
  }

  /// Formats Final Shift Cash Audit (Corte Z) as plain text.
  static String formatCorteZText(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    int? zSequence,
    double? totalExpected,
    double? totalCounted,
    double? difference,
  }) {
    final buffer = StringBuffer();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    buffer.writeln(center('*** CIERRE FISCAL (CORTE Z) ***'));
    if (zSequence != null) {
      buffer.writeln(center('SECUENCIA Z: #$zSequence'));
    }
    buffer.writeln(divider('='));
    buffer.writeln(twoColumns('Terminal:', session.terminalId));
    buffer.writeln(twoColumns('Cajero:', cashierName));
    buffer.writeln(twoColumns('Apertura:', dateFormat.format(session.openedAt)));
    buffer.writeln(twoColumns('Cierre:', session.closedAt != null ? dateFormat.format(session.closedAt!) : dateFormat.format(DateTime.now())));
    buffer.writeln(divider('-'));

    buffer.writeln(twoColumns('FONDO INICIAL NIO:', 'C\$ ${session.openingBalanceNio.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('FONDO INICIAL USD:', '\$ ${session.openingBalanceUsd.toStringAsFixed(2)}'));
    buffer.writeln(divider('-'));

    buffer.writeln(center('DESGLOSE DE INGRESOS'));
    final cashSales = totalsByMethod[PaymentMethod.cash] ?? 0.0;
    final cardSales = totalsByMethod[PaymentMethod.card] ?? 0.0;
    final qrSales = totalsByMethod[PaymentMethod.qr] ?? 0.0;
    final pointsSales = totalsByMethod[PaymentMethod.points] ?? 0.0;
    final totalSales = cashSales + cardSales + qrSales + pointsSales;

    buffer.writeln(twoColumns('Efectivo (NIO):', 'C\$ ${cashSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Tarjeta POS:', 'C\$ ${cardSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Transferencia / QR:', 'C\$ ${qrSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Puntos Lealtad:', 'C\$ ${pointsSales.toStringAsFixed(2)}'));
    buffer.writeln(divider('-'));
    buffer.writeln(twoColumns('TOTAL VENTAS:', 'C\$ ${totalSales.toStringAsFixed(2)}'));

    if (totalExpected != null && totalCounted != null) {
      buffer.writeln(divider('-'));
      buffer.writeln(center('ARQUEO Y CUADRE'));
      buffer.writeln(twoColumns('Total Esperado:', 'C\$ ${totalExpected.toStringAsFixed(2)}'));
      buffer.writeln(twoColumns('Total Contado:', 'C\$ ${totalCounted.toStringAsFixed(2)}'));

      final diff = difference ?? (totalCounted - totalExpected);
      final diffLabel = diff >= 0 ? 'Sobrante (+):' : 'Faltante (-):';
      buffer.writeln(twoColumns(diffLabel, 'C\$ ${diff.abs().toStringAsFixed(2)}'));
    }

    buffer.writeln(divider('='));
    buffer.writeln(center('CIERRE DE TURNO DEFINITIVO'));
    return buffer.toString();
  }

  // ==========================================
  // 4. BOH FIFO Production Batch Label
  // ==========================================

  /// Formats a Production Batch Label as plain text.
  static String formatProductionBatchLabelText({
    required String productName,
    required String batchCode,
    required double quantity,
    required String uom,
    required DateTime productionDate,
    required DateTime expirationDate,
    String? operatorName,
    String? storageInstructions,
  }) {
    final buffer = StringBuffer();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    buffer.writeln(center('*** ETIQUETA DE PRODUCCION ***'));
    buffer.writeln(center('CONTROL FIFO / INOCUIDAD'));
    buffer.writeln(divider('='));
    buffer.writeln(center(productName));
    buffer.writeln(divider('-'));
    buffer.writeln(twoColumns('Lote:', batchCode));
    buffer.writeln(twoColumns('Cantidad:', '${quantity.toStringAsFixed(2)} $uom'));
    buffer.writeln(twoColumns('Produccion:', dateFormat.format(productionDate)));
    buffer.writeln(twoColumns('Vence:', dateFormat.format(expirationDate)));

    if (operatorName != null && operatorName.isNotEmpty) {
      buffer.writeln(twoColumns('Elaborado por:', operatorName));
    }
    if (storageInstructions != null && storageInstructions.isNotEmpty) {
      buffer.writeln(divider('-'));
      buffer.writeln('Almacenamiento:');
      for (final line in wrap(storageInstructions, lineWidth)) {
        buffer.writeln('  $line');
      }
    }

    buffer.writeln(divider('='));
    return buffer.toString();
  }

  /// Formats a Production Batch Label into ESC/POS bytecode.
  static List<int> formatProductionBatchLabelEscPos({
    required String productName,
    required String batchCode,
    required double quantity,
    required String uom,
    required DateTime productionDate,
    required DateTime expirationDate,
    String? operatorName,
    String? storageInstructions,
  }) {
    final builder = EscPosBuilder();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    builder
        .align(EscPosAlign.center)
        .bold(true)
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine('ETIQUETA PRODUCCION')
        .fontSize(EscPosFontSize.normal)
        .textLine('CONTROL FIFO / BOH')
        .textLine(divider('='))
        .fontSize(EscPosFontSize.doubleSize)
        .textLine(productName)
        .fontSize(EscPosFontSize.normal)
        .textLine(divider('-'))
        .align(EscPosAlign.left)
        .bold(false)
        .textLine(twoColumns('Lote:', batchCode))
        .textLine(twoColumns('Cantidad:', '${quantity.toStringAsFixed(2)} $uom'))
        .textLine(twoColumns('Produccion:', dateFormat.format(productionDate)))
        .bold(true)
        .textLine(twoColumns('Vence:', dateFormat.format(expirationDate)))
        .bold(false);

    if (operatorName != null && operatorName.isNotEmpty) {
      builder.textLine(twoColumns('Elaborado por:', operatorName));
    }
    if (storageInstructions != null && storageInstructions.isNotEmpty) {
      builder
          .textLine(divider('-'))
          .textLine('Almacenamiento:');
      for (final line in wrap(storageInstructions, lineWidth)) {
        builder.textLine('  $line');
      }
    }

    builder
        .textLine(divider('='))
        .feedLines(3)
        .cut();

    return builder.toBytes();
  }
}
