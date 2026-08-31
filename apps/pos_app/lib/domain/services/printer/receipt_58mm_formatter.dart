import 'package:intl/intl.dart';
import '../../models/sales/cashier_session.dart';
import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';
import 'esc_pos_builder.dart';

/// Formatter and Layout Engine for 58mm Thermal Printers (32 columns).
/// Adheres strictly to DGI Disposición Técnica 09-2007 and Food Park QSR needs.
class Receipt58mmFormatter {
  static const int lineWidth = 38;

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

  /// Formats an item row with [qty] on the left (e.g. 4 chars), [desc] in middle,
  /// and [total] strictly right-aligned.
  static List<String> formatItemRow({
    required String qty,
    required String desc,
    required String total,
    int width = lineWidth,
  }) {
    final cleanQty = qty.trim();
    final cleanTotal = total.trim();
    final qtyPrefix = cleanQty.padRight(4); // e.g. "1   " or "10  "
    final maxDescLen = width - qtyPrefix.length - cleanTotal.length - 1;

    if (desc.trim().length <= maxDescLen) {
      final descPart = desc.trim();
      final spaces = width - qtyPrefix.length - descPart.length - cleanTotal.length;
      return ['$qtyPrefix$descPart${' ' * (spaces > 0 ? spaces : 1)}$cleanTotal'];
    }

    // Wrap description if too long
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
          // Word longer than width: hard wrap
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
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
  }) {
    final buffer = StringBuffer();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    // Header
    buffer.writeln(center(businessName ?? 'OMNIFOOD NI'));
    if (ruc != null && ruc.isNotEmpty) {
      buffer.writeln(center('RUC: $ruc'));
    }
    if (address != null && address.isNotEmpty) {
      for (final line in wrap(address)) {
        buffer.writeln(center(line));
      }
    }
    if (phone != null && phone.isNotEmpty) {
      buffer.writeln(center('Tel: $phone'));
    }
    if (invoice.terminalId != null && invoice.terminalId!.isNotEmpty) {
      buffer.writeln(center('Terminal: ${invoice.terminalId}'));
    }

    buffer.writeln(divider('='));
    final docType = invoice.type == InvoiceType.creditNote
        ? 'NOTA DE CREDITO'
        : 'FACTURA DE VENTA';
    buffer.writeln(center(docType));
    buffer.writeln(center('No. ${invoice.number}'));
    buffer.writeln(twoColumns('Fecha:', dateFormat.format(invoice.createdAt)));
    if (cashierName != null && cashierName.isNotEmpty) {
      buffer.writeln(twoColumns('Atendido por:', cashierName));
    }
    if (invoice.customerId != null && invoice.customerId!.isNotEmpty) {
      buffer.writeln(twoColumns('Cliente:', invoice.customerId!));
    }
    if (invoice.originInvoiceId != null) {
      buffer.writeln(twoColumns('Doc. Origen:', invoice.originInvoiceId!));
    }

    buffer.writeln(divider('-'));
    buffer.writeln(twoColumns('CANT DESCRIPCION', 'TOTAL'));
    buffer.writeln(divider('-'));

    // Items
    for (final item in items) {
      final qtyStr = item.quantity % 1 == 0
          ? item.quantity.toInt().toString()
          : item.quantity.toStringAsFixed(2);
      final itemTotalStr = 'C\$ ${item.total.toStringAsFixed(2)}';
      
      final rowLines = formatItemRow(
        qty: qtyStr,
        desc: item.productName,
        total: itemTotalStr,
      );
      for (final l in rowLines) {
        buffer.writeln(l);
      }

      // Modifiers & Variants
      for (final mod in item.selectedModifiers) {
        final modPrice = mod.extraPrice > 0 ? ' (+C\$ ${mod.extraPrice.toStringAsFixed(2)})' : '';
        buffer.writeln('    + ${mod.name}$modPrice');
      }

      if (item.discount > 0) {
        buffer.writeln('    - Desc: C\$ ${item.discount.toStringAsFixed(2)}');
      }
      if (item.notes != null && item.notes!.isNotEmpty) {
        for (final line in wrap(item.notes!, lineWidth - 6)) {
          buffer.writeln('    * $line');
        }
      }
    }

    buffer.writeln(divider('-'));

    // Totals & Taxes (IVA 15%)
    buffer.writeln(twoColumns('SUBTOTAL:', 'C\$ ${invoice.subtotal.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('IVA (15%):', 'C\$ ${invoice.totalTax.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('TOTAL CORDOBAS:', 'C\$ ${invoice.total.toStringAsFixed(2)}'));

    final commRate = invoice.commercialRate > 0 ? invoice.commercialRate : (invoice.bcnOfficialRate > 0 ? invoice.bcnOfficialRate : 36.50);
    final totalUsdCalc = invoice.totalUsd > 0
        ? invoice.totalUsd
        : (invoice.total / commRate);
    buffer.writeln(twoColumns('TOTAL DOLARES:', '\$${totalUsdCalc.toStringAsFixed(2)}'));

    buffer.writeln(divider('-'));
    // Show only the configured Commercial Rate used for the transaction
    buffer.writeln(twoColumns('Tipo de Cambio:', 'C\$ ${commRate.toStringAsFixed(2)}'));

    buffer.writeln(divider('-'));
    buffer.writeln(center('DETALLE DE PAGO'));

    // Payments Breakdown
    if (payments.isEmpty) {
      buffer.writeln(twoColumns('Condicion:', 'Contado'));
    } else {
      for (final p in payments) {
        switch (p.method) {
          case PaymentMethod.cash:
            if (p.currency == 'USD') {
              buffer.writeln(twoColumns('Efectivo USD:', '\$${p.amount.toStringAsFixed(2)}'));
              if (p.changeGiven > 0) {
                final cCurr = p.changeCurrency == 'USD' ? '\$' : 'C\$ ';
                buffer.writeln(twoColumns('Cambio (${p.changeCurrency}):', '$cCurr${p.changeGiven.toStringAsFixed(2)}'));
              }
            } else {
              buffer.writeln(twoColumns('Efectivo C\$:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
              if (p.changeGiven > 0) {
                buffer.writeln(twoColumns('Cambio C\$:', 'C\$ ${p.changeGiven.toStringAsFixed(2)}'));
              }
            }
            break;
          case PaymentMethod.card:
            final bank = p.bankPos ?? 'POS';
            final brand = p.cardBrand ?? 'TARJETA';
            buffer.writeln(twoColumns('$brand ($bank):', 'C\$ ${p.amount.toStringAsFixed(2)}'));
            final auth = p.voucherCode ?? 'PENDIENTE';
            final last4 = p.last4 != null ? ' (****${p.last4})' : '';
            buffer.writeln(twoColumns('  Auth/Ref:', '$auth$last4'));
            break;
          case PaymentMethod.qr:
            buffer.writeln(twoColumns('Transferencia / QR:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
            break;
          case PaymentMethod.points:
            buffer.writeln(twoColumns('Puntos Lealtad:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
            break;
        }
      }
    }

    buffer.writeln(divider('='));
    buffer.writeln(center('*** GRACIAS POR SU COMPRA ***'));
    buffer.writeln('');
    buffer.writeln('');

    return buffer.toString();
  }

  /// Formats a complete DGI invoice into ESC/POS bytecode.
  static List<int> formatInvoiceEscPos(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    List<int>? logoRasterBytes,
  }) {
    final builder = EscPosBuilder();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    // Company Logo (1-bit monochrome thermal raster)
    if (logoRasterBytes != null && logoRasterBytes.isNotEmpty) {
      builder.rasterImage(logoRasterBytes).feedLines(1);
    }

    // Header
    builder
        .align(EscPosAlign.center)
        .bold(true)
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine(businessName ?? 'OMNIFOOD NI')
        .fontSize(EscPosFontSize.normal)
        .bold(false);

    if (ruc != null && ruc.isNotEmpty) {
      builder.textLine('RUC: $ruc');
    }
    if (address != null && address.isNotEmpty) {
      for (final line in wrap(address)) {
        builder.textLine(line);
      }
    }
    if (phone != null && phone.isNotEmpty) {
      builder.textLine('Tel: $phone');
    }
    if (invoice.terminalId != null && invoice.terminalId!.isNotEmpty) {
      builder.textLine('Terminal: ${invoice.terminalId}');
    }

    builder
        .textLine(divider('='))
        .bold(true)
        .textLine(invoice.type == InvoiceType.creditNote ? 'NOTA DE CREDITO' : 'FACTURA COMERCIAL')
        .textLine('No: ${invoice.number}')
        .bold(false)
        .align(EscPosAlign.left)
        .textLine(twoColumns('Fecha:', dateFormat.format(invoice.createdAt)));

    if (cashierName != null && cashierName.isNotEmpty) {
      builder.textLine(twoColumns('Cajero:', cashierName));
    }
    if (invoice.customerId != null && invoice.customerId!.isNotEmpty) {
      builder.textLine(twoColumns('Cliente:', invoice.customerId!));
    }

    builder
        .textLine(divider('-'))
        .bold(true)
        .textLine(twoColumns('CANT DESCRIPCION', 'TOTAL'))
        .bold(false)
        .textLine(divider('-'));

    // Items
    for (final item in items) {
      final qtyStr = item.quantity % 1 == 0
          ? item.quantity.toInt().toString()
          : item.quantity.toStringAsFixed(2);
      final itemTotalStr = 'C\$ ${item.total.toStringAsFixed(2)}';
      builder.textLine(twoColumns('$qtyStr x ${item.productName}', itemTotalStr));

      for (final mod in item.selectedModifiers) {
        final modPrice = mod.extraPrice > 0 ? ' (+C\$ ${mod.extraPrice.toStringAsFixed(2)})' : '';
        builder.textLine('  + ${mod.name}$modPrice');
      }
      if (item.discount > 0) {
        builder.textLine('  - Desc: C\$ ${item.discount.toStringAsFixed(2)}');
      }
    }

    builder.textLine(divider('-'));
    builder.textLine(twoColumns('SUBTOTAL:', 'C\$ ${invoice.subtotal.toStringAsFixed(2)}'));
    builder.textLine(twoColumns('IVA (15%):', 'C\$ ${invoice.totalTax.toStringAsFixed(2)}'));

    builder
        .bold(true)
        .fontSize(EscPosFontSize.doubleHeight)
        .textLine(twoColumns('TOTAL C\$:', 'C\$ ${invoice.total.toStringAsFixed(2)}'))
        .fontSize(EscPosFontSize.normal)
        .bold(false);

    final commRate = invoice.commercialRate > 0 ? invoice.commercialRate : 36.50;
    final totalUsdCalc = invoice.totalUsd > 0
        ? invoice.totalUsd
        : (invoice.total / commRate);
    builder.textLine(twoColumns('TOTAL USD (\$):', '\$${totalUsdCalc.toStringAsFixed(2)}'));

    builder
        .textLine(divider('-'))
        .textLine(twoColumns('T.C. Oficial (BCN):', invoice.bcnOfficialRate.toStringAsFixed(4)))
        .textLine(twoColumns('T.C. Comercial:', invoice.commercialRate.toStringAsFixed(2)))
        .textLine(divider('-'))
        .align(EscPosAlign.center)
        .textLine('DETALLE DE PAGO')
        .align(EscPosAlign.left);

    for (final p in payments) {
      if (p.method == PaymentMethod.cash) {
        builder.textLine(twoColumns('Efectivo ${p.currency}:', '${p.currency == "USD" ? "\$" : "C\$ "}${p.amount.toStringAsFixed(2)}'));
        if (p.changeGiven > 0) {
          builder.textLine(twoColumns('Cambio (${p.changeCurrency}):', '${p.changeCurrency == "USD" ? "\$" : "C\$ "}${p.changeGiven.toStringAsFixed(2)}'));
        }
      } else if (p.method == PaymentMethod.card) {
        builder.textLine(twoColumns('${p.cardBrand ?? "TARJETA"} (${p.bankPos ?? "POS"}):', 'C\$ ${p.amount.toStringAsFixed(2)}'));
        builder.textLine(twoColumns('  Auth/Ref:', '${p.voucherCode ?? "PENDIENTE"}'));
      } else if (p.method == PaymentMethod.qr) {
        builder.textLine(twoColumns('Transferencia / QR:', 'C\$ ${p.amount.toStringAsFixed(2)}'));
      }
    }

    builder
        .textLine(divider('='))
        .align(EscPosAlign.center)
        .bold(true)
        .textLine('*** GRACIAS POR SU COMPRA ***')
        .bold(false)
        .feedLines(3)
        .cut();

    return builder.toBytes();
  }

  // ==========================================
  // 2. Kitchen / KDS Order Ticket
  // ==========================================

  /// Formats a kitchen order ticket as 32-column text.
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

    buffer.writeln(center('*** COMANDA DE COCINA ***'));
    buffer.writeln(divider('='));

    // Highlight Buzzer or Table
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

  /// Formats Partial Cash Audit (Corte X) as 32-column text.
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

    buffer.writeln(twoColumns('Efectivo:', 'C\$ ${cashSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Tarjetas (Datáfono):', 'C\$ ${cardSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('QR / Transfer:', 'C\$ ${qrSales.toStringAsFixed(2)}'));
    if (pointsSales > 0) {
      buffer.writeln(twoColumns('Puntos:', 'C\$ ${pointsSales.toStringAsFixed(2)}'));
    }

    buffer.writeln(divider('-'));
    final totalSales = cashSales + cardSales + qrSales + pointsSales;
    buffer.writeln(twoColumns('TOTAL VENTAS:', 'C\$ ${totalSales.toStringAsFixed(2)}'));

    final expected = totalExpected ?? (session.openingBalanceNio + cashSales);
    buffer.writeln(twoColumns('EFECTIVO ESPERADO:', 'C\$ ${expected.toStringAsFixed(2)}'));
    buffer.writeln(divider('='));
    buffer.writeln(center('DOCUMENTO NO FISCAL'));

    return buffer.toString();
  }

  /// Formats Final Cash Audit (Corte Z) as 32-column text.
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

    buffer.writeln(center('*** CORTE Z (CIERRE DE CAJA) ***'));
    buffer.writeln(divider('='));
    buffer.writeln(twoColumns('Terminal:', session.terminalId));
    if (zSequence != null || session.zReportSequence != null) {
      final seq = zSequence ?? session.zReportSequence;
      buffer.writeln(twoColumns('Corte Z No:', '#${seq.toString().padLeft(4, '0')}'));
    }
    buffer.writeln(twoColumns('Cajero:', cashierName));
    buffer.writeln(twoColumns('Apertura:', dateFormat.format(session.openedAt)));
    buffer.writeln(twoColumns('Cierre:', dateFormat.format(session.closedAt ?? DateTime.now())));
    buffer.writeln(divider('-'));

    buffer.writeln(twoColumns('FONDO APERTURA NIO:', 'C\$ ${session.openingBalanceNio.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('FONDO APERTURA USD:', '\$ ${session.openingBalanceUsd.toStringAsFixed(2)}'));
    buffer.writeln(divider('-'));

    buffer.writeln(center('VENTAS POR METODO'));
    final cashSales = totalsByMethod[PaymentMethod.cash] ?? 0.0;
    final cardSales = totalsByMethod[PaymentMethod.card] ?? 0.0;
    final qrSales = totalsByMethod[PaymentMethod.qr] ?? 0.0;
    final pointsSales = totalsByMethod[PaymentMethod.points] ?? 0.0;

    buffer.writeln(twoColumns('Efectivo:', 'C\$ ${cashSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('Tarjetas (Datáfono):', 'C\$ ${cardSales.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('QR / Transfer:', 'C\$ ${qrSales.toStringAsFixed(2)}'));
    if (pointsSales > 0) {
      buffer.writeln(twoColumns('Puntos:', 'C\$ ${pointsSales.toStringAsFixed(2)}'));
    }

    buffer.writeln(divider('-'));
    final totalSales = cashSales + cardSales + qrSales + pointsSales;
    buffer.writeln(twoColumns('TOTAL VENTAS:', 'C\$ ${totalSales.toStringAsFixed(2)}'));

    final expected = totalExpected ?? session.expectedNio;
    final counted = totalCounted ?? session.closingCountedNio ?? 0.0;
    final diff = difference ?? session.differenceNio ?? (counted - expected);

    buffer.writeln(twoColumns('TOTAL ESPERADO:', 'C\$ ${expected.toStringAsFixed(2)}'));
    buffer.writeln(twoColumns('TOTAL CONTADO:', 'C\$ ${counted.toStringAsFixed(2)}'));

    final diffSign = diff >= 0 ? '+' : '';
    buffer.writeln(twoColumns('DIFERENCIA (VAR):', 'C\$ $diffSign${diff.toStringAsFixed(2)}'));

    String status = 'CUADRADO';
    if (diff > 0) status = 'SOBRANTE';
    if (diff < 0) status = 'FALTANTE';
    buffer.writeln(twoColumns('ESTADO CIERRE:', status));

    buffer.writeln(divider('='));
    buffer.writeln(center('CIERRE DE TURNO OFICIAL'));
    buffer.writeln(center('Disposicion Tecnica 09-2007'));

    return buffer.toString();
  }

  // ==========================================
  // 4. BOH FIFO Production Batch Label (Viñeta)
  // ==========================================

  /// Formats a BOH FIFO Production Batch Label (Viñeta Térmica) as 32-column text.
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
    final dateTimeFormat = DateFormat('yyyy-MM-dd HH:mm');

    buffer.writeln(divider('='));
    buffer.writeln(center('ETIQUETA DE PRE-ELABORACION'));
    buffer.writeln(center('BOH - ROTACION FIFO'));
    buffer.writeln(divider('='));

    buffer.writeln('PRODUCTO:');
    for (final line in wrap(productName)) {
      buffer.writeln('  $line');
    }
    buffer.writeln(divider('-'));

    buffer.writeln(twoColumns('LOTE:', batchCode));
    final qtyStr = quantity % 1 == 0
        ? '${quantity.toInt()} $uom'
        : '${quantity.toStringAsFixed(2)} $uom';
    buffer.writeln(twoColumns('CANTIDAD:', qtyStr));
    buffer.writeln(twoColumns('ELABORADO:', dateTimeFormat.format(productionDate)));
    buffer.writeln(twoColumns('VENCE:', dateTimeFormat.format(expirationDate)));

    if (operatorName != null && operatorName.trim().isNotEmpty) {
      buffer.writeln(divider('-'));
      buffer.writeln(twoColumns('COCINERO / OP:', operatorName.trim()));
    }

    if (storageInstructions != null && storageInstructions.trim().isNotEmpty) {
      buffer.writeln(divider('-'));
      buffer.writeln('CONSERVACION:');
      for (final line in wrap(storageInstructions.trim())) {
        buffer.writeln('  $line');
      }
    }

    buffer.writeln(divider('='));
    return buffer.toString();
  }

  /// Formats a BOH FIFO Production Batch Label into ESC/POS bytecode.
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
    final dateTimeFormat = DateFormat('yyyy-MM-dd HH:mm');

    builder
        .align(EscPosAlign.center)
        .bold(true)
        .textLine(divider('='))
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine('PRE-ELABORACION')
        .fontSize(EscPosFontSize.normal)
        .textLine('ROTACION FIFO (BOH)')
        .textLine(divider('='))
        .align(EscPosAlign.left)
        .bold(false)
        .textLine('PRODUCTO:')
        .bold(true)
        .fontSize(EscPosFontSize.doubleHeight);

    for (final line in wrap(productName)) {
      builder.textLine(line);
    }

    builder
        .fontSize(EscPosFontSize.normal)
        .bold(false)
        .textLine(divider('-'))
        .bold(true)
        .textLine(twoColumns('LOTE:', batchCode))
        .bold(false);

    final qtyStr = quantity % 1 == 0
        ? '${quantity.toInt()} $uom'
        : '${quantity.toStringAsFixed(2)} $uom';
    builder.textLine(twoColumns('CANTIDAD:', qtyStr));
    builder.textLine(twoColumns('ELABORADO:', dateTimeFormat.format(productionDate)));

    builder
        .bold(true)
        .fontSize(EscPosFontSize.doubleWidth)
        .textLine(twoColumns('VENCE:', dateTimeFormat.format(expirationDate)))
        .fontSize(EscPosFontSize.normal)
        .bold(false);

    if (operatorName != null && operatorName.trim().isNotEmpty) {
      builder
          .textLine(divider('-'))
          .textLine(twoColumns('RESPONSABLE:', operatorName.trim()));
    }

    if (storageInstructions != null && storageInstructions.trim().isNotEmpty) {
      builder
          .textLine(divider('-'))
          .textLine('CONSERVACION:');
      for (final line in wrap(storageInstructions.trim())) {
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
