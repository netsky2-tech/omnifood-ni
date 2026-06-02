import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../domain/models/inventory/production_order.dart';
import 'production_order_view_model.dart';

class ProductionOrderView extends StatefulWidget {
  const ProductionOrderView({super.key});

  @override
  State<ProductionOrderView> createState() => _ProductionOrderViewState();
}

class _ProductionOrderViewState extends State<ProductionOrderView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProductionOrderViewModel>().loadInitialData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Producción BOH')),
      body: Consumer<ProductionOrderViewModel>(
        builder: (context, viewModel, child) {
          if (viewModel.isLoading &&
              viewModel.availableInsumos.isEmpty &&
              viewModel.orders.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Órdenes de producción',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          viewModel.statusMessage ??
                              'Creá una orden local para dejar lista la operación BOH.',
                        ),
                        if (viewModel.errorMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            viewModel.errorMessage!,
                            style: TextStyle(color: Theme.of(context).colorScheme.error),
                          ),
                        ],
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: viewModel.availableInsumos.isEmpty || viewModel.isLoading
                              ? null
                              : () => _showCreateOrderDialog(context, viewModel),
                          icon: const Icon(Icons.playlist_add),
                          label: const Text('INICIAR ORDEN DE PRODUCCIÓN'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: viewModel.orders.isEmpty
                      ? _EmptyProductionState(canCreate: viewModel.availableInsumos.isNotEmpty)
                      : ListView.separated(
                          itemCount: viewModel.orders.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final order = viewModel.orders[index];
                            return _ProductionOrderCard(
                              order: order,
                              insumoName: viewModel.resolveInsumoName(order.producedInsumoId),
                            );
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _showCreateOrderDialog(
    BuildContext context,
    ProductionOrderViewModel viewModel,
  ) async {
    final scaffoldMessenger = ScaffoldMessenger.of(context);
    final recipeVersionController = TextEditingController();
    final quantityController = TextEditingController();
    String? producedInsumoId;
    String? validationMessage;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Nueva orden de producción'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Insumo producido'),
                  items: viewModel.availableInsumos
                      .map(
                        (insumo) => DropdownMenuItem<String>(
                          value: insumo.id,
                          child: Text(insumo.name),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() => producedInsumoId = value),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: recipeVersionController,
                  decoration: const InputDecoration(
                    labelText: 'Referencia de receta / versión',
                    helperText: 'Capturá el identificador operativo mientras llega la integración completa.',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: quantityController,
                  decoration: const InputDecoration(labelText: 'Cantidad a producir'),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
                if (validationMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    validationMessage!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              onPressed: () async {
                final parsedQuantity = double.tryParse(quantityController.text.trim()) ?? 0;
                if (producedInsumoId == null ||
                    recipeVersionController.text.trim().isEmpty ||
                    parsedQuantity <= 0) {
                  setState(() {
                    validationMessage = 'Completá insumo, referencia de receta y una cantidad válida.';
                  });
                  return;
                }

                await viewModel.startLocalOrder(
                  producedInsumoId: producedInsumoId!,
                  recipeVersionId: recipeVersionController.text,
                  orderQuantity: parsedQuantity,
                );

                if (dialogContext.mounted) {
                  Navigator.pop(dialogContext);
                  scaffoldMessenger.showSnackBar(
                    const SnackBar(content: Text('Orden de producción registrada localmente.')),
                  );
                }
              },
              child: const Text('INICIAR'),
            ),
          ],
        ),
      ),
    );

  }
}

class _EmptyProductionState extends StatelessWidget {
  const _EmptyProductionState({required this.canCreate});

  final bool canCreate;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.factory_outlined, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(
            'Todavía no hay órdenes de producción locales.',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            canCreate
                ? 'Usá el CTA superior para iniciar la primera orden usable de BOH.'
                : 'No hay insumos disponibles para iniciar producción todavía.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ProductionOrderCard extends StatelessWidget {
  const _ProductionOrderCard({required this.order, required this.insumoName});

  final ProductionOrder order;
  final String insumoName;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(insumoName, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text('Referencia receta: ${order.recipeVersionId}'),
            Text('Cantidad: ${order.orderQuantity.toStringAsFixed(order.orderQuantity.truncateToDouble() == order.orderQuantity ? 0 : 2)}'),
            Text('Fecha operativa: ${order.operationDate.toLocal()}'),
            const SizedBox(height: 8),
            const Chip(label: Text('Pendiente BOH')),
          ],
        ),
      ),
    );
  }
}
