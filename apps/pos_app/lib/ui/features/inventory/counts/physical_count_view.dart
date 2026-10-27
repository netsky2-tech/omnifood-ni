import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:provider/provider.dart';

import '../../../../core/localization/label_map.dart';
import 'count_session_detail_view.dart';
import 'physical_count_view_model.dart';

class PhysicalCountView extends StatefulWidget {
  const PhysicalCountView({super.key});

  @override
  State<PhysicalCountView> createState() => _PhysicalCountViewState();
}

class _PhysicalCountViewState extends State<PhysicalCountView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PhysicalCountViewModel>().loadInitialData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Conteo Físico / Ajustes')),
      body: Consumer<PhysicalCountViewModel>(
        builder: (context, viewModel, child) {
          if (viewModel.isLoading &&
              viewModel.availableInsumos.isEmpty &&
              viewModel.sessions.isEmpty) {
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
                          'Conteos físicos',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Esta pantalla congela el baseline local, preserva reconteos y publica ajustes compensatorios sólo cuando la sesión se aprueba.',
                        ),
                        if (viewModel.statusMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(viewModel.statusMessage!),
                        ],
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
                              : () => viewModel.startSession(
                                    warehouseId: 'wh-local',
                                    warehouseName: 'Bodega Central',
                                  ),
                          icon: const Icon(Icons.fact_check_outlined),
                          label: const Text('ABRIR SESIÓN DE CONTEO'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (viewModel.sessions.isEmpty)
                  const Expanded(child: _EmptyPhysicalCountState())
                else ...[
                  SizedBox(
                    height: 170,
                    child: ListView.separated(
                      itemCount: viewModel.sessions.length,
                      scrollDirection: Axis.horizontal,
                      separatorBuilder: (context, index) => const SizedBox(width: 12),
                      itemBuilder: (context, index) {
                        final session = viewModel.sessions[index];
                        return SizedBox(
                          width: 240,
                          child: Card(
                            child: InkWell(
                              onTap: () => viewModel.selectSession(session.id),
                              child: SingleChildScrollView(
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        session.warehouseName,
                                        style: Theme.of(context).textTheme.titleMedium,
                                      ),
                                      const SizedBox(height: 8),
                                      Text('Estado: ${localize(session.status, kCountSessionStatusLabels)}'),
                        Text(
                          'Líneas aprobadas: ${session.approvedLineCount}',
                          style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      child: CountSessionDetailView(
                        session: viewModel.selectedSession!,
                        onRecordCount: (lineId) => _showCountEntryDialog(
                          context,
                          viewModel,
                          viewModel.selectedSession!.id,
                          lineId,
                        ),
                        onRequestApproval: () =>
                            viewModel.requestApproval(viewModel.selectedSession!.id),
                        onApprove: () =>
                            viewModel.approveSession(viewModel.selectedSession!.id),
                        onPost: () => _showPostingDialog(context, viewModel),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _showCountEntryDialog(
    BuildContext context,
    PhysicalCountViewModel viewModel,
    String sessionId,
    String lineId,
  ) async {
    final countedController = TextEditingController();
    final notesController = TextEditingController();
    var disputed = false;
    String? validationMessage;
    final session = viewModel.selectedSession!;
    final line = session.lines.firstWhere((item) => item.id == lineId);
    final availableBatches = line.isBatchManaged
        ? await viewModel.getBatchesForInsumo(line.insumoId)
        : <Batch>[];
    Batch? selectedBatch;

    if (!context.mounted) return;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) {
          final counted = double.tryParse(countedController.text.trim());
          final variance = counted == null
              ? null
              : viewModel.calculateVariance(
                  theoreticalQuantity: line.theoreticalQuantity,
                  countedQuantity: counted,
                );

          return AlertDialog(
            title: Text(line.insumoName),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ReadOnlyMetricField(
                    label: 'Cantidad teórica / esperada',
                    value: line.theoreticalQuantity.toStringAsFixed(2),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: countedController,
                    decoration: const InputDecoration(labelText: 'Cantidad contada'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  _ReadOnlyMetricField(
                    label: 'Variación',
                    value: variance == null ? '' : variance.toStringAsFixed(2),
                  ),
                  if (line.isBatchManaged) ...[
                    const SizedBox(height: 12),
                    if (availableBatches.isNotEmpty)
                      DropdownButtonFormField<String>(
                        key: const Key('count_entry_batch_select'),
                        value: selectedBatch?.id,
                        isExpanded: true,
                        decoration: InputDecoration(
                          labelText: (variance != null && variance > 0)
                              ? 'Lote del sobrante *'
                              : 'Lote de la observación (opcional)',
                        ),
                        hint: const Text('Seleccionar lote'),
                        items: availableBatches.map((b) {
                          final expStr = DateFormat('yyyy-MM-dd')
                              .format(b.expirationDate.toLocal());
                          return DropdownMenuItem<String>(
                            value: b.id,
                            child: Text(
                              '${b.batchNumber} (Vence: $expStr) — ${b.remainingStock.toStringAsFixed(2)} ${line.uom}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          setState(() {
                            selectedBatch = val == null
                                ? null
                                : availableBatches.firstWhere((b) => b.id == val);
                          });
                        },
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Text(
                          'Insumo gestionado por lotes sin lotes activos registrados.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ),
                  ],
                  const SizedBox(height: 12),
                  SwitchListTile(
                    value: disputed,
                    onChanged: (value) => setState(() => disputed = value),
                    title: const Text('Marcar como disputado'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    minLines: 2,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Notas del conteo'),
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
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: viewModel.isLoading ? null : () => Navigator.pop(dialogContext),
                  child: const Text('CANCELAR'),
                ),
              ),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: viewModel.isLoading
                      ? null
                      : () async {
                          final parsedCount = double.tryParse(countedController.text.trim());
                          if (parsedCount == null) {
                            setState(() {
                              validationMessage = 'Ingrese una cantidad válida para continuar.';
                            });
                            return;
                          }

                          if (line.isBatchManaged &&
                              variance != null &&
                              variance > 0 &&
                              selectedBatch == null) {
                            setState(() {
                              validationMessage =
                                  'Debe seleccionar en qué lote se encuentra el sobrante para continuar.';
                            });
                            return;
                          }

                          await viewModel.recordCount(
                            sessionId: sessionId,
                            lineId: lineId,
                            countedQuantity: parsedCount,
                            notes: notesController.text,
                            disputed: disputed,
                            batchId: selectedBatch?.id,
                            batchNumber: selectedBatch?.batchNumber,
                          );

                          if (dialogContext.mounted) {
                            Navigator.pop(dialogContext);
                          }
                        },
                  child: const Text('Guardar conteo'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _showPostingDialog(
    BuildContext context,
    PhysicalCountViewModel viewModel,
  ) async {
    final session = viewModel.selectedSession;
    if (session == null) {
      return;
    }

    final validationErrors =
        viewModel.validateSessionBeforePosting(session.id);
    if (validationErrors.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('No se pueden aplicar los ajustes'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Los siguientes insumos gestionados por lotes tienen un sobrante sin lote asignado:',
              ),
              const SizedBox(height: 12),
              ...validationErrors.map((err) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text('• $err', style: const TextStyle(fontSize: 13)),
                  )),
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('ENTENDIDO'),
            ),
          ],
        ),
      );
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Aplicar ajustes',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Text(
                'Esta acción creará ajustes compensatorios irreversibles para ${session.warehouseName}.',
              ),
              const SizedBox(height: 16),
               OutlinedButton(
                 onPressed: () => Navigator.pop(dialogContext),
                 child: const Text('CANCELAR'),
               ),
               const SizedBox(height: 8),
               ElevatedButton(
                 onPressed: () async {
                   await viewModel.postSession(session.id);
                   if (dialogContext.mounted) {
                     Navigator.pop(dialogContext);
                   }
                 },
                  child: const Text('Confirmar aplicación'),
               ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyPhysicalCountState extends StatelessWidget {
  const _EmptyPhysicalCountState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.fact_check_outlined, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(
            'Todavía no hay sesiones de conteo en esta terminal.',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'Abrí una sesión para congelar el baseline local y llevar la aprobación completa.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ReadOnlyMetricField extends StatelessWidget {
  const _ReadOnlyMetricField({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label),
      child: Text(value),
    );
  }
}
