import 'package:flutter/material.dart';
import '../../domain/models/config/tax_regime.dart';
import '../../domain/models/printer/receipt_document.dart';
import '../../domain/models/sales/cart_item.dart';
import '../../domain/models/sales/invoice.dart';
import '../../domain/models/sales/invoice_item.dart';
import '../../domain/models/sales/payment.dart';
import '../../domain/ports/printer_port.dart';
import '../../domain/services/printer/receipt_layout_formatter.dart';
import '../../domain/services/printer/receipt_layout_metrics.dart';
import '../../domain/services/sales/invoice_fiscal_calculator.dart';

/// Modal dialog providing a live diagnostic preview of a thermal receipt.
///
/// Features:
/// - Monospace visual fidelity to the printed ticket
/// - Dynamic toggle between 58mm (32 cols) and 80mm (48 cols)
/// - Dynamic toggle between Régimen General and Cuota Fija
/// - Sample fiscal sale or custom [Invoice] preview
/// - Direct print action via [PrinterPort] (optional)
class ReceiptPreviewDialog extends StatefulWidget {
  final Invoice? invoice;
  final List<InvoiceItem>? items;
  final List<Payment>? payments;
  final TaxRegime initialTaxRegime;
  final int initialPaperWidthMm;
  final PrinterPort? printerPort;

  const ReceiptPreviewDialog({
    super.key,
    this.invoice,
    this.items,
    this.payments,
    this.initialTaxRegime = TaxRegime.regimenGeneral,
    this.initialPaperWidthMm = 58,
    this.printerPort,
  });

  /// Helper to show this dialog from any BuildContext.
  static Future<void> show(
    BuildContext context, {
    Invoice? invoice,
    List<InvoiceItem>? items,
    List<Payment>? payments,
    TaxRegime initialTaxRegime = TaxRegime.regimenGeneral,
    int initialPaperWidthMm = 58,
    PrinterPort? printerPort,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (context) => ReceiptPreviewDialog(
        invoice: invoice,
        items: items,
        payments: payments,
        initialTaxRegime: initialTaxRegime,
        initialPaperWidthMm: initialPaperWidthMm,
        printerPort: printerPort,
      ),
    );
  }

  @override
  State<ReceiptPreviewDialog> createState() => _ReceiptPreviewDialogState();
}

class _ReceiptPreviewDialogState extends State<ReceiptPreviewDialog> {
  late int _paperWidthMm;
  late TaxRegime _taxRegime;
  late bool _isSampleMode;
  bool _isPrinting = false;

  final _calculator = const InvoiceFiscalCalculator();

  @override
  void initState() {
    super.initState();
    _paperWidthMm = widget.initialPaperWidthMm == 80 ? 80 : 58;
    _taxRegime = widget.initialTaxRegime;
    _isSampleMode = widget.invoice == null;
  }

  ReceiptDocument _buildDocument() {
    if (!_isSampleMode && widget.invoice != null) {
      return ReceiptDocument.fromInvoice(
        widget.invoice!,
        items: widget.items ?? const [],
        payments: widget.payments ?? const [],
        taxRegime: _taxRegime,
      );
    }

    // Build standard diagnostic sample sale
    final sampleCart = [
      const CartItem(
        productId: 'prod-01',
        productName: 'Café Americano Doble 12oz',
        quantity: 2,
        unitPrice: 45.0,
        taxRate: 0.15,
      ),
      const CartItem(
        productId: 'prod-02',
        productName: 'Croissant Jamón y Queso Horneado Artesanal',
        quantity: 1,
        unitPrice: 85.0,
        taxRate: 0.15,
      ),
    ];

    final calc = _calculator.calculate(
      cart: sampleCart,
      taxRegime: _taxRegime,
      totalDiscounts: 10.0,
      commercialRate: 36.50,
      bcnOfficialRate: 36.6241,
    );

    return _calculator.buildReceiptDocument(
      calculation: calc,
      invoiceNumber: '001-001-01-00000042',
      businessName: 'OMNIFOOD CAFÉ & BISTRO',
      legalName: 'CORPORACIÓN GASTRONÓMICA S.A.',
      businessRuc: 'J0310000001234',
      businessAddress: 'Plaza Las Victorias, Módulo 4',
      businessPhone: '+505 2222-8888',
      cashierName: 'Juan Cajero',
      customerName: 'Cliente Contribuyente Express',
      customerRuc: '001-150885-0002Y',
      cashGivenNio: 200.0,
      footerMessage: '*** GRACIAS POR SU COMPRA ***\nCONSERVE ESTE COMPROBANTE',
    );
  }

  @override
  Widget build(BuildContext context) {
    final doc = _buildDocument();
    final formatter = ReceiptLayoutFormatter.fromPaperWidth(_paperWidthMm);
    final receiptText = formatter.formatReceiptDocumentText(doc);
    final metrics = formatter.metrics;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(
          maxWidth: 600,
          maxHeight: 780,
        ),
        child: Column(
          children: [
            // Header Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.receipt_long, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Preview de Comprobante Térmico',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        Text(
                          '${metrics.is80mm ? 80 : 58} mm (${metrics.printableWidth} columnas) • ${metrics.maxImageWidth} dots',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            // Controls Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              child: Wrap(
                spacing: 12,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                alignment: WrapAlignment.spaceBetween,
                children: [
                  // Width Toggle
                  SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(
                        value: 58,
                        label: Text('58 mm (32 col)'),
                      ),
                      ButtonSegment(
                        value: 80,
                        label: Text('80 mm (48 col)'),
                      ),
                    ],
                    selected: {_paperWidthMm},
                    onSelectionChanged: (set) {
                      if (set.isNotEmpty) {
                        setState(() => _paperWidthMm = set.first);
                      }
                    },
                  ),

                  // Tax Regime Toggle
                  SegmentedButton<TaxRegime>(
                    segments: const [
                      ButtonSegment(
                        value: TaxRegime.cuotaFija,
                        label: Text('Cuota Fija'),
                      ),
                      ButtonSegment(
                        value: TaxRegime.regimenGeneral,
                        label: Text('Régimen Gral.'),
                      ),
                    ],
                    selected: {_taxRegime},
                    onSelectionChanged: (set) {
                      if (set.isNotEmpty) {
                        setState(() => _taxRegime = set.first);
                      }
                    },
                  ),
                ],
              ),
            ),

            // Monospaced Receipt Preview Body
            Expanded(
              child: Container(
                color: Colors.grey.shade200,
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: SingleChildScrollView(
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(4),
                        boxShadow: const [
                          BoxShadow(
                            color: Colors.black26,
                            blurRadius: 8,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 20),
                      child: Text(
                        receiptText,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                          color: Colors.black87,
                          height: 1.25,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),

            // Footer Actions
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cerrar'),
                  ),
                  if (widget.printerPort != null) ...[
                    const SizedBox(width: 12),
                    FilledButton.icon(
                      icon: _isPrinting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.print, size: 18),
                      label: const Text('IMPRIMIR ESTE TICKET'),
                      onPressed: _isPrinting
                          ? null
                          : () async {
                              setState(() => _isPrinting = true);
                              try {
                                final port = widget.printerPort!;
                                final escpos = ReceiptLayoutFormatter.fromPaperWidth(_paperWidthMm)
                                    .formatReceiptDocumentEscPos(doc);
                                await port.printRawEscPos(escpos);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Ticket enviado a la impresora términa.'),
                                      backgroundColor: Colors.green,
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('Error al imprimir: $e'),
                                      backgroundColor: Colors.red,
                                    ),
                                  );
                                }
                              } finally {
                                if (mounted) {
                                  setState(() => _isPrinting = false);
                                }
                              }
                            },
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
