import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../domain/models/inventory/product.dart';
import '../../../domain/models/sales/cart_item.dart';
import '../../../data/services/sync_service.dart';
import '../../../domain/models/sales/payment.dart';
import '../../../domain/repositories/auth_repository.dart';
import '../../widgets/app_drawer.dart';

class SaleView extends StatefulWidget {
  const SaleView({super.key});

  @override
  State<SaleView> createState() => _SaleViewState();
}

class _SaleViewState extends State<SaleView> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final authRepo = context.read<AuthRepository>();
    final user = await authRepo.getCurrentUser();
    if (user == null && mounted) {
      Navigator.pushReplacementNamed(context, '/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    // Listener for errors (Visual Feedback)
    if (viewModel.errorMessage != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(viewModel.errorMessage!),
            backgroundColor: colorScheme.error,
            action: SnackBarAction(
              label: 'OK',
              textColor: Colors.white,
              onPressed: () => viewModel.clearError(),
            ),
          ),
        );
        viewModel.clearError();
      });
    }

    if (viewModel.activeSession == null) {
      return const BoxOpeningScreen();
    }

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: true, // Show drawer icon
        title: const SearchBarWidget(),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
        actions: [
          IconButton(
            icon: const Icon(Icons.assignment_return),
            onPressed: () => Navigator.pushNamed(context, '/sales/history'),
            tooltip: 'Historial de Ventas / Devoluciones',
          ),
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () => _showRecallTicketsDialog(context),
            tooltip: 'Recuperar Ventas en Espera',
          ),
          IconButton(
            icon: const Icon(Icons.pause),
            onPressed: viewModel.cart.isEmpty ? null : () => _showHoldTicketDialog(context),
            tooltip: 'Poner en Espera',
          ),
          IconButton(
            icon: const Icon(Icons.cloud_upload),
            onPressed: () {
              context.read<SyncService>().triggerManualSync();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Sincronización Iniciada...')),
              );
            },
            tooltip: 'Sincronizar con la Nube',
          ),
          IconButton(
            icon: const Icon(Icons.lock_open),
            onPressed: () => _showCloseBoxDialog(context),
            tooltip: 'Cerrar Caja',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => viewModel.loadProducts(),
          ),
        ],
      ),
      drawer: const AppDrawer(),
      body: Row(
        children: [
          // Product Grid
          Expanded(
            flex: 3,
            child: Container(
              color: colorScheme.surfaceContainerLow,
              child: viewModel.isLoading 
                ? const Center(child: CircularProgressIndicator())
                : viewModel.filteredProducts.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.search_off, size: 64, color: colorScheme.outline),
                          const SizedBox(height: 16),
                          Text(
                            'No se encontraron productos',
                            style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: colorScheme.outline),
                          ),
                        ],
                      ),
                    )
                  : ProductGrid(products: viewModel.filteredProducts),
            ),
          ),
          
          // Sidebar Cart
          Container(
            width: 400,
            decoration: BoxDecoration(
              border: Border(left: BorderSide(color: colorScheme.outlineVariant)),
              color: colorScheme.surface,
            ),
            child: const CartSidebar(),
          ),
        ],
      ),
    );
  }

  void _showRecallTicketsDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const RecallTicketsDialog(),
    );
  }

  // TODO: Implementar funcionalidad de devoluciones/notas de crédito
  // void _showReturnsDialog(BuildContext context) { ... }

  void _showHoldTicketDialog(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Poner Venta en Espera'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Nombre / Mesa'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
          ElevatedButton(
            onPressed: () {
              context.read<SaleViewModel>().holdCurrentTicket(controller.text);
              Navigator.pop(context);
            }, 
            child: const Text('GUARDAR'),
          ),
        ],
      ),
    );
  }

  void _showCloseBoxDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const CloseBoxDialog(),
    );
  }
}

class CloseBoxDialog extends StatefulWidget {
  const CloseBoxDialog({super.key});

  @override
  State<CloseBoxDialog> createState() => _CloseBoxDialogState();
}

class _CloseBoxDialogState extends State<CloseBoxDialog> {
  late final TextEditingController controller;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '0.00');
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final expected = viewModel.sessionExpected;
    final colorScheme = Theme.of(context).colorScheme;

    return AlertDialog(
      title: const Text('Cierre de Caja - Arqueo'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4), side: BorderSide(color: colorScheme.primary, width: 2)),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Resumen de Ventas:', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            DataTable(
              columns: const [
                DataColumn(label: Text('Método')),
                DataColumn(label: Text('Esperado')),
              ],
              rows: expected.entries.map((e) => DataRow(cells: [
                DataCell(Text(e.key.name.toUpperCase())),
                DataCell(Text('\$${e.value.toStringAsFixed(2)}')),
              ])).toList(),
            ),
            const Divider(),
            TextField(
              controller: controller,
              decoration: const InputDecoration(labelText: 'Efectivo Real en Caja'),
              keyboardType: TextInputType.number,
              onTap: () {
                controller.selection = TextSelection(baseOffset: 0, extentOffset: controller.text.length);
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: () {
            final balance = double.tryParse(controller.text) ?? 0.0;
            context.read<SaleViewModel>().closeSession(balance);
            Navigator.pop(context);
          }, 
          child: const Text('CERRAR CAJA'),
        ),
      ],
    );
  }
}

class SearchBarWidget extends StatelessWidget {
  const SearchBarWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: 450,
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: TextField(
        onChanged: (val) => context.read<SaleViewModel>().setSearchQuery(val),
        onSubmitted: (val) {
          context.read<SaleViewModel>().searchAndAddToCart(val);
          context.read<SaleViewModel>().setSearchQuery('');
        },
        decoration: InputDecoration(
          hintText: 'Buscar por SKU o Nombre...',
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          filled: false,
          prefixIcon: Icon(Icons.search, color: colorScheme.primary),
        ),
      ),
    );
  }
}

class RecallTicketsDialog extends StatelessWidget {
  const RecallTicketsDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    return AlertDialog(
      title: const Text('Ventas en Espera'),
      content: SizedBox(
        width: 400,
        child: viewModel.holdTickets.isEmpty 
          ? const Text('No hay ventas en espera.')
          : ListView.builder(
              shrinkWrap: true,
              itemCount: viewModel.holdTickets.length,
              itemBuilder: (context, index) {
                final ticket = viewModel.holdTickets[index];
                return ListTile(
                  title: Text(ticket.name),
                  subtitle: Text('${ticket.items.length} productos'),
                  trailing: Text('\$${ticket.items.fold(0.0, (sum, i) => sum + i.total).toStringAsFixed(2)}'),
                  onTap: () {
                    viewModel.recallTicket(ticket);
                    Navigator.pop(context);
                  },
                );
              },
            ),
      ),
    );
  }
}

class ProductGrid extends StatelessWidget {
  final List<Product> products;
  const ProductGrid({super.key, required this.products});

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(24),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 5,
        childAspectRatio: 0.85,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
      ),
      itemCount: products.length,
      itemBuilder: (context, index) {
        final product = products[index];
        final colorScheme = Theme.of(context).colorScheme;
        return InkWell(
          onTap: () => _showProductOptions(context, product),
          child: Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(4),
              side: BorderSide(color: colorScheme.outlineVariant),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.fastfood, size: 48, color: colorScheme.primary),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8.0),
                  child: Text(product.name, 
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                ),
                const SizedBox(height: 8),
                Text('\$${product.sellPrice.toStringAsFixed(2)}',
                  style: TextStyle(color: colorScheme.primary, fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showProductOptions(BuildContext context, Product product) {
    if (product.variants.isEmpty && product.availableModifiers.isEmpty) {
      context.read<SaleViewModel>().addToCart(product);
      return;
    }

    showDialog(
      context: context,
      builder: (context) => ProductOptionsDialog(product: product),
    );
  }
}

class ProductOptionsDialog extends StatefulWidget {
  final Product product;
  const ProductOptionsDialog({super.key, required this.product});

  @override
  State<ProductOptionsDialog> createState() => _ProductOptionsDialogState();
}

class _ProductOptionsDialogState extends State<ProductOptionsDialog> {
  String? _selectedVariantId;
  final List<Modifier> _selectedModifiers = [];

  @override
  void initState() {
    super.initState();
    if (widget.product.variants.isNotEmpty) {
      _selectedVariantId = widget.product.variants.first.id;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text(widget.product.name),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4), side: BorderSide(color: colorScheme.outline, width: 2)),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.product.variants.isNotEmpty) ...[
              const Text('Seleccionar Variante:', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              RadioGroup<String>(
                groupValue: _selectedVariantId,
                onChanged: (val) => setState(() => _selectedVariantId = val),
                child: Column(
                  children: widget.product.variants.map((v) => RadioListTile<String>(
                    title: Text('${v.name} (+\$${v.priceAdjustment})'),
                    value: v.id,
                  )).toList(),
                ),
              ),
              const Divider(),
            ],
            if (widget.product.availableModifiers.isNotEmpty) ...[
              const Text('Modificadores:', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              ...widget.product.availableModifiers.map((m) => CheckboxListTile(
                title: Text('${m.name} (+\$${m.extraPrice})'),
                value: _selectedModifiers.contains(m),
                onChanged: (val) {
                  setState(() {
                    if (val == true) {
                      _selectedModifiers.add(m);
                    } else {
                      _selectedModifiers.remove(m);
                    }
                  });
                },
              )),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: () {
            context.read<SaleViewModel>().addToCart(
              widget.product,
              variantId: _selectedVariantId,
              modifiers: List.from(_selectedModifiers),
            );
            Navigator.pop(context);
          }, 
          child: const Text('AGREGAR'),
        ),
      ],
    );
  }
}

class BoxOpeningScreen extends StatefulWidget {
  const BoxOpeningScreen({super.key});

  @override
  State<BoxOpeningScreen> createState() => _BoxOpeningScreenState();
}

class _BoxOpeningScreenState extends State<BoxOpeningScreen> {
  late final TextEditingController controller;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '0.00');
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Container(
          width: 400,
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: colorScheme.surface,
            border: Border.all(color: colorScheme.outline, width: 2),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.account_balance_wallet, size: 80, color: colorScheme.primary),
              const SizedBox(height: 24),
              const Text('APERTURA DE CAJA', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              TextField(
                controller: controller,
                decoration: const InputDecoration(
                  labelText: 'Fondo de Caja Inicial',
                  prefixText: '\$ ',
                ),
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 20),
                onTap: () {
                  controller.selection = TextSelection(baseOffset: 0, extentOffset: controller.text.length);
                },
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  final balance = double.tryParse(controller.text) ?? 0.0;
                  context.read<SaleViewModel>().openSession(balance);
                },
                child: const Text('ABRIR CAJA'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CartSidebar extends StatelessWidget {
  const CartSidebar({super.key});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Text('CARRITO', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: colorScheme.primary)),
        ),
        
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: viewModel.cart.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, index) {
              final item = viewModel.cart[index];
              return ListTile(
                title: Text(item.productName, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Row(
                  children: [
                    IconButton(
                      icon: Icon(Icons.remove_circle_outline, size: 24, color: colorScheme.primary),
                      onPressed: () => viewModel.updateQuantity(item.productId, item.quantity - 1, variantId: item.variantId, modifiers: item.selectedModifiers),
                    ),
                    Text('${item.quantity.toInt()}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: Icon(Icons.add_circle_outline, size: 24, color: colorScheme.primary),
                      onPressed: () => viewModel.updateQuantity(item.productId, item.quantity + 1, variantId: item.variantId, modifiers: item.selectedModifiers),
                    ),
                  ],
                ),
                trailing: Text('\$${item.total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                onLongPress: () => viewModel.removeFromCart(item.productId, variantId: item.variantId, modifiers: item.selectedModifiers),
              );
            },
          ),
        ),
        
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerHigh,
            border: Border(top: BorderSide(color: colorScheme.outlineVariant)),
          ),
          child: const CartSummary(),
        ),
      ],
    );
  }
}

class CartSummary extends StatelessWidget {
  const CartSummary({super.key});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Subtotal'),
            Text('\$${(viewModel.subtotal + viewModel.totalDiscounts).toStringAsFixed(2)}'),
          ],
        ),
        if (viewModel.totalDiscounts > 0)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Descuentos (Promos)', style: TextStyle(color: Colors.green)),
              Text('-\$${viewModel.totalDiscounts.toStringAsFixed(2)}', style: const TextStyle(color: Colors.green)),
            ],
          ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('IVA (15%)'),
            Text('\$${viewModel.totalTax.toStringAsFixed(2)}'),
          ],
        ),
        const Divider(),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('TOTAL', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 24)),
            Text('\$${viewModel.total.toStringAsFixed(2)}', 
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 24, color: colorScheme.primary)),
          ],
        ),
        const SizedBox(height: 16),
        
        Row(
          children: [
            const Text('Exento General', style: TextStyle(fontWeight: FontWeight.bold)),
            const Spacer(),
            Switch(
              value: viewModel.isGlobalTaxExempt,
              onChanged: (_) => viewModel.toggleGlobalTaxExempt(),
            ),
          ],
        ),
        
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: viewModel.cart.isEmpty 
            ? null 
            : () => _showCheckoutDialog(context),
          child: const Text('COBRAR'),
        ),
      ],
    );
  }

  void _showCheckoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const CheckoutDialog(),
    );
  }
}

class CheckoutDialog extends StatefulWidget {
  const CheckoutDialog({super.key});

  @override
  State<CheckoutDialog> createState() => _CheckoutDialogState();
}

class _CheckoutDialogState extends State<CheckoutDialog> {
  final Map<PaymentMethod, double> _payments = {
    PaymentMethod.cash: 0.0,
    PaymentMethod.card: 0.0,
    PaymentMethod.qr: 0.0,
  };
  
  final Map<PaymentMethod, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    final total = context.read<SaleViewModel>().total;
    _payments[PaymentMethod.cash] = total;
    
    for (var method in _payments.keys) {
      _controllers[method] = TextEditingController(text: _payments[method]!.toStringAsFixed(2));
    }
  }

  @override
  void dispose() {
    for (var controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final total = viewModel.total;
    final paid = _payments.values.fold(0.0, (sum, val) => sum + val);
    final remaining = total - paid;
    final colorScheme = Theme.of(context).colorScheme;

    return AlertDialog(
      title: const Text('Finalizar Venta - Pagos'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4), side: BorderSide(color: colorScheme.primary, width: 2)),
      content: SizedBox(
        width: 450,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Total a Pagar: \$${total.toStringAsFixed(2)}', 
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const Divider(),
            ..._payments.keys.map((method) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8.0),
              child: Row(
                children: [
                  Expanded(flex: 2, child: Text(method.name.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold))),
                  Expanded(
                    flex: 3,
                    child: TextField(
                      controller: _controllers[method],
                      decoration: const InputDecoration(prefixText: '\$ '),
                      keyboardType: TextInputType.number,
                      onChanged: (val) {
                        setState(() {
                          _payments[method] = double.tryParse(val) ?? 0.0;
                        });
                      },
                      onTap: () {
                        final c = _controllers[method]!;
                        c.selection = TextSelection(baseOffset: 0, extentOffset: c.text.length);
                      },
                    ),
                  ),
                ],
              ),
            )),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Restante:', style: TextStyle(color: Colors.red, fontSize: 18, fontWeight: FontWeight.bold)),
                Text('\$${remaining.toStringAsFixed(2)}', 
                  style: TextStyle(color: remaining == 0 ? Colors.green : Colors.red, fontWeight: FontWeight.bold, fontSize: 18)),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: remaining != 0 
            ? null 
            : () {
                final methods = _payments.entries
                  .where((e) => e.value > 0)
                  .map((e) => e.key)
                  .toList();
                context.read<SaleViewModel>().finalizeSale(methods);
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Venta Finalizada Correctamente')),
                );
              }, 
          child: const Text('FINALIZAR'),
        ),
      ],
    );
  }
}
