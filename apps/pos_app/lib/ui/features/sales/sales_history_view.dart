import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../presentation/features/sales/view_models/sales_history_view_model.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../domain/models/sales/invoice.dart';
import '../../../domain/models/sales/invoice_item.dart';
import 'package:intl/intl.dart';

class SalesHistoryView extends StatefulWidget {
  const SalesHistoryView({super.key});

  @override
  State<SalesHistoryView> createState() => _SalesHistoryViewState();
}

class _SalesHistoryViewState extends State<SalesHistoryView> {
  Invoice? _selectedInvoice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SalesHistoryViewModel>().loadInvoices();
    });
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SalesHistoryViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Historial de Ventas'),
        actions: [
          Container(
            width: 300,
            margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
            child: TextField(
              onChanged: viewModel.setSearchQuery,
              decoration: const InputDecoration(
                hintText: 'Buscar factura...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
        ],
      ),
      body: Row(
        children: [
          // Invoice List
          Expanded(
            flex: 2,
            child: Container(
              decoration: BoxDecoration(
                border: Border(right: BorderSide(color: colorScheme.outlineVariant)),
              ),
              child: viewModel.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView.builder(
                      itemCount: viewModel.filteredInvoices.length,
                      itemBuilder: (context, index) {
                        final invoice = viewModel.filteredInvoices[index];
                        final isSelected = _selectedInvoice?.id == invoice.id;
                        return ListTile(
                          title: Text(invoice.number, style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text(DateFormat('dd/MM/yyyy HH:mm').format(invoice.createdAt)),
                          trailing: Text('\$${invoice.total.toStringAsFixed(2)}', 
                            style: TextStyle(fontWeight: FontWeight.bold, color: colorScheme.primary)),
                          selected: isSelected,
                          selectedTileColor: colorScheme.primaryContainer.withValues(alpha: 0.3),
                          onTap: () => setState(() => _selectedInvoice = invoice),
                        );
                      },
                    ),
            ),
          ),
          
          // Details Panel
          Expanded(
            flex: 3,
            child: _selectedInvoice == null
                ? const Center(child: Text('Seleccione una factura para ver detalles'))
                : InvoiceDetailsPanel(invoice: _selectedInvoice!),
          ),
        ],
      ),
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

    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Factura: ${invoice.number}', style: Theme.of(context).textTheme.headlineSmall),
              if (invoice.isCanceled)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(color: colorScheme.error, borderRadius: BorderRadius.circular(4)),
                  child: const Text('ANULADA', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Fecha: ${DateFormat('dd/MM/yyyy HH:mm').format(invoice.createdAt)}'),
          Text('Usuario: ${invoice.userId}'),
          const Divider(height: 32),
          
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
                      subtitle: Text('${item.quantity.toInt()} x \$${item.unitPrice.toStringAsFixed(2)}'),
                      trailing: Text('\$${item.total.toStringAsFixed(2)}'),
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
              Text('\$${invoice.subtotal.toStringAsFixed(2)}'),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('IVA (15%):'),
              Text('\$${invoice.totalTax.toStringAsFixed(2)}'),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('TOTAL:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
              Text('\$${invoice.total.toStringAsFixed(2)}', 
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: colorScheme.primary)),
            ],
          ),
          
          const SizedBox(height: 24),
          
          if (!invoice.isCanceled && invoice.type == InvoiceType.regular)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.assignment_return),
                label: const Text('REALIZAR DEVOLUCIÓN'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colorScheme.errorContainer,
                  foregroundColor: colorScheme.onErrorContainer,
                ),
                onPressed: () => _showReturnConfirmation(context),
              ),
            ),
        ],
      ),
    );
  }

  void _showReturnConfirmation(BuildContext context) {
    final controller = TextEditingController(text: 'Devolución de cliente');
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirmar Devolución'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('¿Está seguro de emitir una Nota de Crédito para la factura ${invoice.number}?'),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              decoration: const InputDecoration(labelText: 'Motivo de devolución'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('CANCELAR')),
          ElevatedButton(
            onPressed: () async {
              await context.read<SaleViewModel>().processReturn(invoice.number, controller.text);
              if (context.mounted) {
                Navigator.pop(dialogContext);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Nota de Crédito emitida correctamente')),
                );
                context.read<SalesHistoryViewModel>().loadInvoices();
              }
            }, 
            child: const Text('PROCESAR'),
          ),
        ],
      ),
    );
  }
}
