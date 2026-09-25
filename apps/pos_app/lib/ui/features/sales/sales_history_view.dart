import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../presentation/features/sales/view_models/sales_history_view_model.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../domain/models/sales/invoice.dart';
import '../../../domain/models/sales/invoice_item.dart';
import '../../../domain/usecases/sales/void_decision.dart';
// ReprintReasonCodes and the snapshot-unavailable copy live in the same module.
import '../../../core/localization/label_map.dart';
import '../../design_system/design_system.dart';

class SalesHistoryView extends StatefulWidget {
  const SalesHistoryView({super.key});

  @override
  State<SalesHistoryView> createState() => _SalesHistoryViewState();
}

class _SalesHistoryViewState extends State<SalesHistoryView> {
  Invoice? _selectedInvoice;
  bool _isSearching = false;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _searchController.clear();
        context.read<SalesHistoryViewModel>().setSearchQuery('');
        context.read<SalesHistoryViewModel>().loadInvoices();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SalesHistoryViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Scaffold(
      appBar: AppBar(
        title: _isSearching && isHandheld
            ? TextField(
                controller: _searchController,
                autofocus: true,
                onChanged: viewModel.setSearchQuery,
                decoration: const InputDecoration(
                  hintText: 'Buscar factura...',
                  border: InputBorder.none,
                  hintStyle: TextStyle(color: Colors.black54),
                ),
              )
            : const Text('Historial de Ventas'),
        actions: [
          if (isHandheld) ...[
            IconButton(
              icon: Icon(_isSearching ? Icons.close : Icons.search),
              onPressed: () {
                setState(() {
                  if (_isSearching) {
                    _searchController.clear();
                    viewModel.setSearchQuery('');
                    _isSearching = false;
                  } else {
                    _isSearching = true;
                  }
                });
              },
            ),
          ] else ...[
            Container(
              width: 280,
              margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              child: TextField(
                controller: _searchController,
                onChanged: viewModel.setSearchQuery,
                decoration: InputDecoration(
                  hintText: 'Buscar factura...',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            viewModel.setSearchQuery('');
                          },
                        )
                      : null,
                  border: const OutlineInputBorder(),
                  contentPadding: EdgeInsets.zero,
                  isDense: true,
                ),
              ),
            ),
          ],
        ],
      ),
      body: isHandheld
          ? _buildMobileInvoiceList(context, viewModel, colorScheme)
          : Row(
              children: [
                // Invoice List
                Expanded(
                  flex: 2,
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border(right: BorderSide(color: colorScheme.outlineVariant)),
                    ),
                    child: _buildInvoiceListView(context, viewModel, colorScheme, isHandheld: false),
                  ),
                ),
                
                // Details Panel
                Expanded(
                  flex: 3,
                  child: _selectedInvoice == null
                      ? const Center(
                          child: DsEmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: 'Seleccione una factura',
                            description: 'Elija una factura de la lista lateral para ver el desglose detallado.',
                          ),
                        )
                      : InvoiceDetailsPanel(invoice: _selectedInvoice!),
                ),
              ],
            ),
    );
  }

  Widget _buildMobileInvoiceList(
    BuildContext context,
    SalesHistoryViewModel viewModel,
    ColorScheme colorScheme,
  ) {
    return _buildInvoiceListView(context, viewModel, colorScheme, isHandheld: true);
  }

  Widget _buildInvoiceListView(
    BuildContext context,
    SalesHistoryViewModel viewModel,
    ColorScheme colorScheme, {
    required bool isHandheld,
  }) {
    if (viewModel.isLoading && viewModel.invoices.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (viewModel.filteredInvoices.isEmpty) {
      return const Center(
        child: DsEmptyState(
          icon: Icons.receipt_long_outlined,
          title: 'Sin facturas encontradas',
          description: 'No hay facturas que coincidan con la búsqueda.',
        ),
      );
    }

    return ListView.separated(
      itemCount: viewModel.filteredInvoices.length,
      separatorBuilder: (context, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final invoice = viewModel.filteredInvoices[index];
        final isSelected = !isHandheld && _selectedInvoice?.id == invoice.id;
        return ListTile(
          title: Row(
            children: [
              Flexible(
                child: Text(
                  invoice.number,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (invoice.isCanceled) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: colorScheme.error,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'ANULADA',
                    style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ],
          ),
          subtitle: Text(DateFormat('dd/MM/yyyy HH:mm').format(invoice.createdAt)),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'C\$ ${invoice.total.toStringAsFixed(2)}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: invoice.isCanceled ? colorScheme.error : colorScheme.primary,
                ),
              ),
              if (isHandheld) const Icon(Icons.chevron_right, size: 20),
            ],
          ),
          selected: isSelected,
          selectedTileColor: colorScheme.primaryContainer.withValues(alpha: 0.3),
          onTap: () {
            if (isHandheld) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => InvoiceDetailScreen(invoice: invoice),
                ),
              );
            } else {
              setState(() => _selectedInvoice = invoice);
            }
          },
        );
      },
    );
  }
}

class InvoiceDetailScreen extends StatelessWidget {
  final Invoice invoice;

  const InvoiceDetailScreen({super.key, required this.invoice});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Factura ${invoice.number}'),
      ),
      body: InvoiceDetailsPanel(invoice: invoice),
    );
  }
}

class InvoiceDetailsPanel extends StatelessWidget {
  final Invoice invoice;
  const InvoiceDetailsPanel({super.key, required this.invoice});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.read<SalesHistoryViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Padding(
      padding: EdgeInsets.all(isHandheld ? 16.0 : 24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'Factura: ${invoice.number}',
                  style: isHandheld
                      ? Theme.of(context).textTheme.titleLarge
                      : Theme.of(context).textTheme.headlineSmall,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (invoice.isCanceled) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: colorScheme.error, borderRadius: BorderRadius.circular(4)),
                  child: const Text('ANULADA', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text('Fecha: ${DateFormat('dd/MM/yyyy HH:mm').format(invoice.createdAt)}'),
          Text('Usuario: ${invoice.userId}'),
          const Divider(height: 24),
          
          Expanded(
            child: FutureBuilder<List<InvoiceItem>>(
              future: viewModel.getInvoiceItems(invoice.id),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                final items = snapshot.data!;
                return ListView.builder(
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return ListTile(
                      title: Text(item.productName),
                      subtitle: Text('${item.quantity.toInt()} x C\$ ${item.unitPrice.toStringAsFixed(2)}'),
                      trailing: Text('C\$ ${item.total.toStringAsFixed(2)}'),
                    );
                  },
                );
              },
            ),
          ),
          
          const Divider(height: 32),
          
          // Summary
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Subtotal:'),
              Text('C\$ ${invoice.subtotal.toStringAsFixed(2)}'),
            ],
          ),
          // D-3: under CUOTA_FIJA the tenant does not collect IVA — the row is
          // omitted instead of showing a label that contradicts the receipts.
          if (context.watch<SaleViewModel>().companyTaxRegime?.isCuotaFija != true)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('IVA:'),
                Text('C\$ ${invoice.totalTax.toStringAsFixed(2)}'),
              ],
            ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('TOTAL:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
              Text('C\$ ${invoice.total.toStringAsFixed(2)}', 
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: colorScheme.primary)),
            ],
          ),
          
          const SizedBox(height: 24),
          
          // D-13: REIMPRIMIR is available for ANY invoice row — canceled
          // included; the paper then carries ANULADO and REIMPRESIÓN
          // together (#547). Permission-gated (SalesPermission).
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              key: const Key('reprint_invoice_button'),
              icon: const Icon(Icons.print_outlined),
              label: const Text('REIMPRIMIR'),
              onPressed: context.watch<SaleViewModel>().canReprint
                  ? () => _showReprintDialog(context)
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          if (!invoice.isCanceled && invoice.type == InvoiceType.regular) ...[
            // D-14/#553: the credit-note action (REALIZAR DEVOLUCIÓN) was
            // REMOVED, not hidden — the Backoffice is the emitter for
            // cross-day corrections until DSI-6 re-enables POS-side
            // issuance. ANULAR is the only correction action in the POS.
            // D-15: the void action is permission-gated (SalesPermission),
            // never a role-label check. The dialog collects the mandatory
            // controlled reason (AC-6) before invoking the view model.
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: const Key('void_invoice_button'),
                icon: const Icon(Icons.cancel_outlined),
                label: const Text('ANULAR FACTURA'),
                onPressed: context.watch<SaleViewModel>().canVoidInvoice
                    ? () => _showVoidDialog(context)
                    : null,
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Neutral Spanish labels for the D-13 reprint reason codes, delegated to
  /// the centralized map (#587 WU3); unknown codes pass through unchanged.
  String _reprintReasonLabel(String code) =>
      localize(code, kReprintReasonLabels);

  /// D-13: reprint reason dialog — mandatory controlled code + optional
  /// detail. On success the SnackBar claims only the print outcome; the
  /// list is NOT reloaded (a reprint writes no invoice data).
  void _showReprintDialog(BuildContext context) {
    String? selectedCode;
    final detailController = TextEditingController();
    var submitting = false;
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Reimprimir Comprobante'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Seleccione el motivo de la reimpresión de ${invoice.number}:'),
              const SizedBox(height: 8),
              ...ReprintReasonCodes.all.map(
                (code) => RadioListTile<String>(
                  value: code,
                  groupValue: selectedCode,
                  title: Text(_reprintReasonLabel(code)),
                  onChanged: (value) =>
                      setDialogState(() => selectedCode = value),
                ),
              ),
              TextField(
                controller: detailController,
                decoration: const InputDecoration(
                  labelText: 'Detalle (opcional)',
                  hintText: 'Describa el motivo si lo considera necesario',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              key: const Key('confirm_reprint_button'),
              onPressed: selectedCode == null || submitting
                  ? null
                  : () async {
                      setDialogState(() => submitting = true);
                      final saleViewModel = context.read<SaleViewModel>();
                      final messenger = ScaffoldMessenger.of(context);
                      final detail = detailController.text.trim();
                      final ok = await saleViewModel.reprintInvoice(
                        invoice.id,
                        selectedCode!,
                        reasonDetail: detail.isEmpty ? null : detail,
                      );
                      final printed = saleViewModel.lastReprintPrintSucceeded;
                      if (!context.mounted) return;
                      if (ok) {
                        Navigator.pop(dialogContext);
                        // Honesty rule: only claim the print if it happened.
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              printed
                                  ? 'Comprobante REIMPRESIÓN impreso.'
                                  : 'Comprobante REIMPRESIÓN no pudo imprimirse.',
                            ),
                          ),
                        );
                        // No list reload: a reprint writes no invoice data.
                      } else {
                        setDialogState(() => submitting = false);
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              saleViewModel.errorMessage ??
                                  'No se pudo reimprimir el comprobante.',
                            ),
                          ),
                        );
                      }
                    },
              child: const Text('REIMPRIMIR'),
            ),
          ],
        ),
      ),
    );
  }

  /// Neutral Spanish labels for the D-15 controlled reason codes (AC-6/AC-7),
  /// delegated to the centralized map (#587 WU3); unknown codes pass through
  /// unchanged.
  String _voidReasonLabel(String code) => localize(code, kVoidReasonLabels);

  void _showVoidDialog(BuildContext context) {
    String? selectedCode;
    final detailController = TextEditingController();
    var submitting = false;
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Anular Factura'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Seleccione el motivo de la anulación de ${invoice.number}:'),
              const SizedBox(height: 8),
              ...VoidReasonCodes.all.map(
                (code) => RadioListTile<String>(
                  value: code,
                  groupValue: selectedCode,
                  title: Text(_voidReasonLabel(code)),
                  onChanged: (value) =>
                      setDialogState(() => selectedCode = value),
                ),
              ),
              TextField(
                controller: detailController,
                decoration: const InputDecoration(
                  labelText: 'Detalle (opcional)',
                  hintText: 'Describa el motivo si lo considera necesario',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              key: const Key('confirm_void_button'),
              onPressed: selectedCode == null || submitting
                  ? null
                  : () async {
                      setDialogState(() => submitting = true);
                      final saleViewModel = context.read<SaleViewModel>();
                      final messenger = ScaffoldMessenger.of(context);
                      final detail = detailController.text.trim();
                      final ok = await saleViewModel.voidInvoice(
                        invoice.id,
                        selectedCode!,
                        reasonDetail: detail.isEmpty ? null : detail,
                      );
                      final printed = saleViewModel.lastVoidPrintSucceeded;
                      if (!context.mounted) return;
                      if (ok) {
                        Navigator.pop(dialogContext);
                        // Honesty rule: only claim the print if it happened.
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              printed
                                  ? 'Factura anulada. Se imprimió el comprobante ANULADO.'
                                  : 'Factura anulada. No se pudo imprimir el comprobante ANULADO.',
                            ),
                          ),
                        );
                        await context
                            .read<SalesHistoryViewModel>()
                            .loadInvoices();
                      } else {
                        // Denial: the dialog stays open with the typed reason
                        // preserved; the specific guard message is surfaced.
                        setDialogState(() => submitting = false);
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              saleViewModel.errorMessage ??
                                  'No se pudo anular la factura.',
                            ),
                          ),
                        );
                      }
                    },
              child: const Text('ANULAR'),
            ),
          ],
        ),
      ),
    );
  }

}
