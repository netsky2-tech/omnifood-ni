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
                          itemBuilder: (context, index) {
                            final order = viewModel.orders[index];
                            return ProductionOrderDetailCard(
                              order: order,
                              onPrintLabel: () async {
                                try {
                                  final result = await viewModel.printBatchLabel(
                                    order: order,
                                  );
                                  if (context.mounted && result.isSuccess) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Viñeta de producción enviada a impresora'),
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('Error al imprimir viñeta: $e'),
                                      ),
                                    );
                                  }
                                }
                              },
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

  Future<void> _showCloseOrderDialog(
    BuildContext context,
    ProductionOrderViewModel viewModel,
  ) async {
    RecipeVersionDocument? selectedVersion;
    String? producedInsumoId;
    final initialBatchCode = viewModel.generateNextBatchCode();
    final plannedController = TextEditingController(text: '1');
    final actualController = TextEditingController(text: '1');
    final batchController = TextEditingController(text: initialBatchCode);
    final expiryController = TextEditingController(
      text: DateTime.now().add(const Duration(days: 2)).toIso8601String().split('T').first,
    );
    final varianceController = TextEditingController();
    final supervisorIdController = TextEditingController();
    final supervisorPinController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) {
          final screenSize = MediaQuery.of(context).size;
          final isCompact = screenSize.width < 600;

          final planned = double.tryParse(plannedController.text.trim()) ?? 0;
          final actual = double.tryParse(actualController.text.trim()) ?? 0;
          final evaluation = selectedVersion == null
              ? null
              : viewModel.evaluateVariance(
                  recipeVersion: selectedVersion!,
                  plannedQuantity: planned,
                  actualQuantity: actual,
                );
          final requiresSupervisor = evaluation?.requiresSupervisorOverride ?? false;
          final isTotalLoss = evaluation?.isTotalLoss ?? false;

          final isSubmitDisabled = selectedVersion == null ||
              producedInsumoId == null ||
              batchController.text.trim().isEmpty ||
              planned <= 0 ||
              (!isTotalLoss && actual <= 0) ||
              (requiresSupervisor &&
                  (supervisorIdController.text.trim().isEmpty ||
                      supervisorPinController.text.trim().isEmpty ||
                      varianceController.text.trim().isEmpty));

          Future<void> submitClose() async {
            try {
              await viewModel.closeOrderLocally(
                recipeVersion: selectedVersion!,
                producedInsumoId: producedInsumoId!,
                plannedQuantity: planned,
                actualQuantity: actual,
                producedBatchNumber: batchController.text.trim(),
                producedExpirationDate:
                    DateTime.parse(expiryController.text.trim()),
                varianceReason: varianceController.text.trim().isEmpty
                    ? null
                    : varianceController.text.trim(),
                supervisorId: supervisorIdController.text.trim().isEmpty
                    ? null
                    : supervisorIdController.text.trim(),
                supervisorPin: supervisorPinController.text.trim().isEmpty
                    ? null
                    : supervisorPinController.text.trim(),
              );
              if (dialogContext.mounted) {
                Navigator.pop(dialogContext);
              }
            } catch (error) {
              if (dialogContext.mounted) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(
                    content: Text('$error'),
                    backgroundColor: Theme.of(dialogContext).colorScheme.error,
                  ),
                );
              }
            }
          }

          return Dialog(
            insetPadding: EdgeInsets.symmetric(
              horizontal: isCompact ? 12 : 24,
              vertical: isCompact ? 16 : 24,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 540),
              child: Padding(
                padding: EdgeInsets.all(isCompact ? 16 : 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Cerrar producción',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 16),
                    Flexible(
                      child: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            DropdownButtonFormField<RecipeVersionDocument>(
                              initialValue: selectedVersion,
                              isExpanded: true,
                              decoration: const InputDecoration(
                                labelText: 'Versión de receta',
                                border: OutlineInputBorder(),
                              ),
                              items: viewModel.availableRecipeVersions
                                   .map(
                                    (version) => DropdownMenuItem<RecipeVersionDocument>(
                                      value: version,
                                      child: Text(
                                        '${version.productName} • V${version.versionNumber}',
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  )
                                  .toList(growable: false),
                              onChanged: (value) {
                                setState(() {
                                  selectedVersion = value;
                                  if (value != null) {
                                    final calculatedExpiry = viewModel.calculateExpirationDate(value);
                                    expiryController.text =
                                        calculatedExpiry.toIso8601String().split('T').first;
                                    plannedController.text = value.yieldQuantity.toString();
                                    actualController.text = value.yieldQuantity.toString();
                                  }
                                });
                              },
                            ),
                            const SizedBox(height: 12),
                            DropdownButtonFormField<String>(
                              initialValue: producedInsumoId,
                              isExpanded: true,
                              decoration: const InputDecoration(
                                labelText: 'Insumo producido',
                                border: OutlineInputBorder(),
                              ),
                              items: viewModel.availableInsumos
                                  .map(
                                    (insumo) => DropdownMenuItem<String>(
                                      value: insumo.id,
                                      child: Text(
                                        insumo.name,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  )
                                  .toList(growable: false),
                              onChanged: (value) => setState(() => producedInsumoId = value),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: plannedController,
                                    decoration: const InputDecoration(
                                      labelText: 'Cant. planificada',
                                      border: OutlineInputBorder(),
                                    ),
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: TextField(
                                    controller: actualController,
                                    decoration: const InputDecoration(
                                      labelText: 'Cant. real recibida',
                                      border: OutlineInputBorder(),
                                    ),
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            if (evaluation != null) ...[
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: requiresSupervisor
                                      ? (isTotalLoss
                                          ? Colors.red.withOpacity(0.08)
                                          : Colors.orange.withOpacity(0.08))
                                      : Colors.green.withOpacity(0.08),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: requiresSupervisor
                                        ? (isTotalLoss ? Colors.red : Colors.orange.shade700)
                                        : Colors.green.shade700,
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Icon(
                                          requiresSupervisor
                                              ? (isTotalLoss
                                                  ? Icons.cancel_outlined
                                                  : Icons.warning_amber_rounded)
                                              : Icons.check_circle_outline,
                                          size: 20,
                                          color: requiresSupervisor
                                              ? (isTotalLoss
                                                  ? Colors.red.shade800
                                                  : Colors.orange.shade900)
                                              : Colors.green.shade800,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            isTotalLoss
                                                ? 'Pérdida total de lote (Merma a cocina)'
                                                : (requiresSupervisor
                                                    ? 'Desviación excede tolerancia (±${selectedVersion!.umbralDesviacionPermitido}%)'
                                                    : 'Rendimiento dentro de tolerancia'),
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: requiresSupervisor
                                                  ? (isTotalLoss
                                                      ? Colors.red.shade900
                                                      : Colors.orange.shade900)
                                                  : Colors.green.shade900,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      'Rendimiento: ${evaluation.yieldPercentage.toStringAsFixed(1)}% • Desviación: ${evaluation.deviationPercentage.toStringAsFixed(1)}%',
                                      style: const TextStyle(fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                            TextField(
                              controller: batchController,
                              decoration: const InputDecoration(
                                labelText: 'Código de lote (auto)',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.qr_code),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: expiryController,
                              decoration: const InputDecoration(
                                labelText: 'Expiración (YYYY-MM-DD)',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.calendar_today),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: varianceController,
                              decoration: InputDecoration(
                                labelText: requiresSupervisor
                                    ? 'Motivo de variación o merma *'
                                    : 'Motivo de variación (opcional)',
                                border: const OutlineInputBorder(),
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                            if (requiresSupervisor) ...[
                              const SizedBox(height: 12),
                              TextField(
                                controller: supervisorIdController,
                                decoration: const InputDecoration(
                                  labelText: 'Usuario / ID de Supervisor *',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.person),
                                ),
                                onChanged: (_) => setState(() {}),
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: supervisorPinController,
                                obscureText: true,
                                keyboardType: TextInputType.number,
                                decoration: const InputDecoration(
                                  labelText: 'PIN o TOTP de Supervisor *',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.lock_outline),
                                ),
                                onChanged: (_) => setState(() {}),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (isCompact) ...[
                      FilledButton.icon(
                        icon: const Icon(Icons.check_circle_outline),
                        onPressed: isSubmitDisabled ? null : submitClose,
                        label: const Text('CERRAR ORDEN'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        child: const Text('CANCELAR'),
                      ),
                    ] else ...[
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          OutlinedButton(
                            onPressed: () => Navigator.pop(dialogContext),
                            child: const Text('CANCELAR'),
                          ),
                          const SizedBox(width: 12),
                          FilledButton.icon(
                            icon: const Icon(Icons.check_circle_outline),
                            onPressed: isSubmitDisabled ? null : submitClose,
                            label: const Text('CERRAR ORDEN'),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );

    plannedController.dispose();
    actualController.dispose();
    batchController.dispose();
    expiryController.dispose();
    varianceController.dispose();
    supervisorIdController.dispose();
    supervisorPinController.dispose();
  }
}
