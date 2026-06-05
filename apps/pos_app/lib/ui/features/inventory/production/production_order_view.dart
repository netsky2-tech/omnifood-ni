import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../../domain/models/inventory/recipe_version_document.dart';
import 'production_order_detail_card.dart';
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
              viewModel.availableRecipeVersions.isEmpty &&
              viewModel.orders.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    side: BorderSide(color: Theme.of(context).colorScheme.outline),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Cierre operativo', style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 8),
                        Text(viewModel.statusMessage ?? 'Todavía no hay cierres operativos locales.'),
                        if (viewModel.errorMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            viewModel.errorMessage!,
                            style: TextStyle(color: Theme.of(context).colorScheme.error),
                          ),
                        ],
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: viewModel.availableRecipeVersions.isEmpty || viewModel.availableInsumos.isEmpty
                              ? null
                              : () => _showCloseOrderDialog(context, viewModel),
                          icon: const Icon(Icons.task_alt),
                          label: const Text('CONFIRMAR Y CERRAR ORDEN'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: viewModel.orders.isEmpty
                      ? const Center(child: Text('No hay órdenes de producción cerradas localmente.'))
                      : ListView.separated(
                          itemCount: viewModel.orders.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 12),
                          itemBuilder: (context, index) => ProductionOrderDetailCard(
                            order: viewModel.orders[index],
                          ),
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _showCloseOrderDialog(
    BuildContext context,
    ProductionOrderViewModel viewModel,
  ) async {
    RecipeVersionDocument? selectedVersion;
    String? producedInsumoId;
    final plannedController = TextEditingController(text: '1');
    final actualController = TextEditingController(text: '1');
    final batchController = TextEditingController();
    final expiryController = TextEditingController(text: DateTime.now().add(const Duration(days: 30)).toIso8601String().split('T').first);
    final varianceController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => Dialog(
          insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Cerrar producción', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                  DropdownButtonFormField<RecipeVersionDocument>(
                  initialValue: selectedVersion,
                  decoration: const InputDecoration(labelText: 'Versión de receta'),
                  items: viewModel.availableRecipeVersions
                      .map(
                        (version) => DropdownMenuItem<RecipeVersionDocument>(
                          value: version,
                          child: Text('${version.productName} • V${version.versionNumber}'),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) => setState(() => selectedVersion = value),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: producedInsumoId,
                  decoration: const InputDecoration(labelText: 'Insumo producido'),
                  items: viewModel.availableInsumos
                      .map(
                        (insumo) => DropdownMenuItem<String>(
                          value: insumo.id,
                          child: Text(insumo.name),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) => setState(() => producedInsumoId = value),
                ),
                const SizedBox(height: 12),
                      TextField(
                        controller: plannedController,
                        decoration: const InputDecoration(labelText: 'Cantidad planificada'),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                      ),
                const SizedBox(height: 12),
                      TextField(
                        controller: actualController,
                        decoration: const InputDecoration(labelText: 'Cantidad real recibida'),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                      ),
                const SizedBox(height: 12),
                      TextField(
                  controller: batchController,
                  decoration: const InputDecoration(labelText: 'Lote de salida'),
                      ),
                const SizedBox(height: 12),
                      TextField(
                  controller: expiryController,
                  decoration: const InputDecoration(labelText: 'Expiración del lote'),
                      ),
                const SizedBox(height: 12),
                      TextField(
                  controller: varianceController,
                  decoration: const InputDecoration(labelText: 'Motivo de variación'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () => Navigator.pop(dialogContext),
                  child: const Text('CANCELAR'),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: selectedVersion == null || producedInsumoId == null || batchController.text.trim().isEmpty
                      ? null
                      : () async {
                          await viewModel.closeOrderLocally(
                            recipeVersion: selectedVersion!,
                            producedInsumoId: producedInsumoId!,
                            plannedQuantity: double.tryParse(plannedController.text.trim()) ?? 0,
                            actualQuantity: double.tryParse(actualController.text.trim()) ?? 0,
                            producedBatchNumber: batchController.text.trim(),
                            producedExpirationDate: DateTime.parse(expiryController.text.trim()),
                            varianceReason: varianceController.text.trim().isEmpty
                                ? null
                                : varianceController.text.trim(),
                          );
                          if (dialogContext.mounted) {
                            Navigator.pop(dialogContext);
                          }
                        },
                  child: const Text('CERRAR ORDEN'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    plannedController.dispose();
    actualController.dispose();
    batchController.dispose();
    expiryController.dispose();
    varianceController.dispose();
  }
}
