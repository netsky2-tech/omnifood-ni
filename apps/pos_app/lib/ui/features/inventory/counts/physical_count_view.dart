import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'package:pos_app/core/localization/label_map.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/ui/design_system/design_system.dart';
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
      if (mounted) {
        context.read<PhysicalCountViewModel>().loadInitialData();
      }
    });
  }

  void _showToast(BuildContext context, String message, {bool isError = false}) {
    if (!context.mounted) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isError ? NhilosColors.danger : NhilosColors.success,
        shape: const RoundedRectangleBorder(borderRadius: NhilosRadii.buttonRadius),
        content: Row(
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.check_circle_outline,
              color: Colors.white,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: NhilosColors.background,
      appBar: AppBar(
        title: const Text('Conteo Físico / Ajustes'),
        backgroundColor: NhilosColors.surface,
        elevation: 0,
        actions: [
          Consumer<PhysicalCountViewModel>(
            builder: (context, vm, _) => IconButton(
              icon: const Icon(Icons.add_task),
              tooltip: 'Nueva sesión de conteo',
              onPressed: vm.availableInsumos.isEmpty || vm.isLoading
                  ? null
                  : () async {
                      await vm.startSession(
                        warehouseId: 'wh-local',
                        warehouseName: 'Bodega Central',
                      );
                      if (context.mounted) {
                        _showToast(
                          context,
                          'Nueva sesión de conteo iniciada en Bodega Central.',
                        );
                      }
                    },
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar conteos',
            onPressed: () {
              context.read<PhysicalCountViewModel>().loadInitialData();
            },
          ),
        ],
      ),
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
                // Error Banner (if any)
                if (viewModel.errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: NhilosColors.dangerLight,
                      borderRadius: NhilosRadii.buttonRadius,
                      border: Border.all(color: NhilosColors.dangerBorder),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: NhilosColors.danger,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            viewModel.errorMessage!,
                            style: const TextStyle(
                              color: NhilosColors.danger,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                const SizedBox(height: 16),

                // 3. Empty State or Active Sessions Workspace
                if (viewModel.sessions.isEmpty)
                  const Expanded(child: _EmptyPhysicalCountState())
                else ...[
                  // Compact horizontal session switcher ONLY when multiple sessions exist,
                  // eliminating the redundant double-card duplication for a single session.
                  if (viewModel.sessions.length > 1) ...[
                    SizedBox(
                      height: 76,
                      child: ListView.separated(
                        itemCount: viewModel.sessions.length,
                        scrollDirection: Axis.horizontal,
                        separatorBuilder: (context, index) => const SizedBox(width: 10),
                        itemBuilder: (context, index) {
                          final session = viewModel.sessions[index];
                          final isSelected =
                              viewModel.selectedSession?.id == session.id;
                          return _CompactSessionPill(
                            session: session,
                            isSelected: isSelected,
                            onTap: () => viewModel.selectSession(session.id),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
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
                        onRequestApproval: () async {
                          await viewModel.requestApproval(
                            viewModel.selectedSession!.id,
                          );
                          if (context.mounted) {
                            _showToast(
                              context,
                              'Sesión enviada a aprobación correctamente.',
                            );
                          }
                        },
                        onApprove: () async {
                          await viewModel.approveSession(
                            viewModel.selectedSession!.id,
                          );
                          if (context.mounted) {
                            _showToast(
                              context,
                              'Conteo aprobado. Listo para aplicar ajustes.',
                            );
                          }
                        },
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
    final notesController = TextEditingController();
    final batchNumberController = TextEditingController();
    var disputed = false;
    String? validationMessage;
    final session = viewModel.selectedSession!;
    final line = session.lines.firstWhere((item) => item.id == lineId);

    // Pre-populate if recounting an existing entry
    final initialCountText = line.entries.isNotEmpty
        ? line.entries.last.countedQuantity.toStringAsFixed(2)
        : '';
    final countedController = TextEditingController(text: initialCountText);

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

          void adjustQuantity(double delta) {
            final current = double.tryParse(countedController.text.trim()) ??
                line.theoreticalQuantity;
            final next = (current + delta).clamp(0.0, 999999.0);
            final formatted = next == next.roundToDouble()
                ? next.toInt().toString()
                : next.toStringAsFixed(2);
            countedController.text = formatted;
            countedController.selection = TextSelection.fromPosition(
              TextPosition(offset: countedController.text.length),
            );
            setState(() {
              validationMessage = null;
            });
          }

          void applyTheoreticalSuggestion() {
            final theo = line.theoreticalQuantity;
            final formatted = theo == theo.roundToDouble()
                ? theo.toInt().toString()
                : theo.toStringAsFixed(2);
            countedController.text = formatted;
            countedController.selection = TextSelection.fromPosition(
              TextPosition(offset: countedController.text.length),
            );
            setState(() {
              validationMessage = null;
            });
          }

          return AlertDialog(
            backgroundColor: NhilosColors.surface,
            shape: const RoundedRectangleBorder(
              borderRadius: NhilosRadii.modalRadius,
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    line.insumoName,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: NhilosColors.textPrimary,
                    ),
                  ),
                ),
                if (line.isBatchManaged)
                  const DsStatusChip(
                    label: 'POR LOTES',
                    tone: DsChipTone.primary,
                  ),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // 1. Theoretical Reference Banner + Quick Suggestion Action
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: NhilosColors.neutralGray,
                      borderRadius: NhilosRadii.buttonRadius,
                      border: Border.all(color: NhilosColors.border),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Cantidad teórica / esperada',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: NhilosColors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${line.theoreticalQuantity.toStringAsFixed(2)} ${line.uom}',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: NhilosColors.textPrimary,
                                fontFeatures: [FontFeature.tabularFigures()],
                              ),
                            ),
                          ],
                        ),
                        TextButton.icon(
                          key: const Key('count_entry_suggest_theoretical'),
                          style: TextButton.styleFrom(
                            backgroundColor: NhilosColors.brandTealLight,
                            foregroundColor: NhilosColors.brandPrimary,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            shape: const RoundedRectangleBorder(
                              borderRadius: NhilosRadii.buttonRadius,
                            ),
                          ),
                          onPressed: applyTheoreticalSuggestion,
                          icon: const Icon(Icons.bolt, size: 16),
                          label: const Text(
                            'Usar teórico',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // 2. Ergonomic Count Input with - / + Stepper Buttons
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      _StepperIconButton(
                        key: const Key('count_entry_step_minus'),
                        icon: Icons.remove,
                        tooltip: 'Disminuir cantidad',
                        onPressed: () => adjustQuantity(-1),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: countedController,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                          decoration: InputDecoration(
                            labelText: 'Cantidad contada',
                            suffixText: line.uom,
                            border: const OutlineInputBorder(
                              borderRadius: NhilosRadii.buttonRadius,
                            ),
                          ),
                          keyboardType:
                              const TextInputType.numberWithOptions(decimal: true),
                          onChanged: (_) => setState(() {
                            validationMessage = null;
                          }),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _StepperIconButton(
                        key: const Key('count_entry_step_plus'),
                        icon: Icons.add,
                        tooltip: 'Aumentar cantidad',
                        onPressed: () => adjustQuantity(1),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // 3. Live Variance Indicator Banner
                  _VarianceBanner(
                    variance: variance,
                    uom: line.uom,
                  ),

                  // 4. Batch Selection / Input for Lot-Managed Insumos (A-01)
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
                          border: const OutlineInputBorder(
                            borderRadius: NhilosRadii.buttonRadius,
                          ),
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
                            validationMessage = null;
                          });
                        },
                      )
                    else
                      TextField(
                        key: const Key('count_entry_batch_text'),
                        controller: batchNumberController,
                        decoration: InputDecoration(
                          labelText: (variance != null && variance > 0)
                              ? 'Lote del sobrante *'
                              : 'Lote de la observación (opcional)',
                          hintText: 'Ej. LOT-R28-C-003',
                          border: const OutlineInputBorder(
                            borderRadius: NhilosRadii.buttonRadius,
                          ),
                        ),
                        onChanged: (_) => setState(() {
                          validationMessage = null;
                        }),
                      ),
                  ],
                  const SizedBox(height: 12),

                  // 5. Dispute Switch & Notes
                  Container(
                    decoration: BoxDecoration(
                      color: disputed
                          ? NhilosColors.warningLight
                          : NhilosColors.neutralGray,
                      borderRadius: NhilosRadii.buttonRadius,
                      border: Border.all(
                        color: disputed
                            ? NhilosColors.warningBorder
                            : NhilosColors.border,
                      ),
                    ),
                    child: SwitchListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                      value: disputed,
                      onChanged: (value) => setState(() => disputed = value),
                      title: const Text(
                        'Marcar como disputado',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: const Text(
                        'Requiere verificación o reconteo antes de aprobar',
                        style: TextStyle(fontSize: 11),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    minLines: 2,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Notas del conteo',
                      hintText: 'Observación opcional sobre el estado físico...',
                      border: OutlineInputBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                      ),
                    ),
                  ),

                  // 6. Validation Alert Banner
                  if (validationMessage != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: NhilosColors.dangerLight,
                        borderRadius: NhilosRadii.buttonRadius,
                        border: Border.all(color: NhilosColors.dangerBorder),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            color: NhilosColors.danger,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              validationMessage!,
                              style: const TextStyle(
                                color: NhilosColors.danger,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: NhilosColors.textSecondary,
                        side: const BorderSide(color: NhilosColors.borderStrong),
                        shape: const RoundedRectangleBorder(
                          borderRadius: NhilosRadii.buttonRadius,
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: viewModel.isLoading
                          ? null
                          : () => Navigator.pop(dialogContext),
                      child: const Text('CANCELAR'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: NhilosColors.brandPrimary,
                        foregroundColor: Colors.white,
                        shape: const RoundedRectangleBorder(
                          borderRadius: NhilosRadii.buttonRadius,
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: viewModel.isLoading
                          ? null
                          : () async {
                              final parsedCount =
                                  double.tryParse(countedController.text.trim());
                              if (parsedCount == null || parsedCount < 0) {
                                setState(() {
                                  validationMessage =
                                      'Ingrese una cantidad válida para continuar.';
                                });
                                return;
                              }

                              final manualBatch =
                                  batchNumberController.text.trim();
                              final effectiveBatchNum =
                                  selectedBatch?.batchNumber ?? manualBatch;

                              if (line.isBatchManaged &&
                                  variance != null &&
                                  variance > 0 &&
                                  selectedBatch == null &&
                                  manualBatch.isEmpty) {
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
                                batchNumber: effectiveBatchNum.isEmpty
                                    ? null
                                    : effectiveBatchNum,
                              );

                              if (dialogContext.mounted) {
                                Navigator.pop(dialogContext);
                              }
                              if (context.mounted) {
                                _showToast(
                                  context,
                                  'Conteo registrado para ${line.insumoName} (${parsedCount.toStringAsFixed(2)} ${line.uom}).',
                                );
                              }
                            },
                      child: const Text(
                        'Guardar conteo',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
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

    final validationErrors = viewModel.validateSessionBeforePosting(session.id);
    if (validationErrors.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          backgroundColor: NhilosColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: NhilosRadii.modalRadius,
          ),
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: NhilosColors.danger),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'No se pueden aplicar los ajustes',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Los siguientes insumos gestionados por lotes tienen un sobrante sin lote asignado:',
              ),
              const SizedBox(height: 12),
              ...validationErrors.map(
                (err) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text('• $err', style: const TextStyle(fontSize: 13)),
                ),
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: NhilosColors.brandPrimary,
                foregroundColor: Colors.white,
                shape: const RoundedRectangleBorder(
                  borderRadius: NhilosRadii.buttonRadius,
                ),
              ),
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
        backgroundColor: NhilosColors.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: NhilosRadii.modalRadius,
        ),
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.published_with_changes_outlined,
                    color: NhilosColors.brandPrimary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Aplicar ajustes',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Esta acción creará ajustes compensatorios irreversibles en el kardex para ${session.warehouseName}.',
                style: const TextStyle(color: NhilosColors.textSecondary),
              ),
              const SizedBox(height: 20),
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: NhilosColors.textSecondary,
                  side: const BorderSide(color: NhilosColors.borderStrong),
                  shape: const RoundedRectangleBorder(
                    borderRadius: NhilosRadii.buttonRadius,
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('CANCELAR'),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: NhilosColors.success,
                  foregroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(
                    borderRadius: NhilosRadii.buttonRadius,
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                onPressed: () async {
                  await viewModel.postSession(session.id);
                  if (dialogContext.mounted) {
                    Navigator.pop(dialogContext);
                  }
                  if (context.mounted) {
                    _showToast(
                      context,
                      'Ajustes de inventario aplicados y registrados en el Kardex.',
                    );
                  }
                },
                child: const Text(
                  'Confirmar aplicación',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompactSessionPill extends StatelessWidget {
  const _CompactSessionPill({
    required this.session,
    required this.isSelected,
    required this.onTap,
  });

  final CountSessionDocument session;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusLabel = localize(session.status, kCountSessionStatusLabels);
    return InkWell(
      onTap: onTap,
      borderRadius: NhilosRadii.cardRadius,
      child: Container(
        width: 210,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? NhilosColors.brandTealLight : NhilosColors.surface,
          borderRadius: NhilosRadii.cardRadius,
          border: Border.all(
            color: isSelected ? NhilosColors.brandPrimary : NhilosColors.border,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              session.warehouseName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: isSelected
                    ? NhilosColors.brandPrimary
                    : NhilosColors.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Estado: $statusLabel · Aprobadas: ${session.approvedLineCount}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                color: NhilosColors.textSecondary,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepperIconButton extends StatelessWidget {
  const _StepperIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: NhilosColors.neutralGray,
      borderRadius: NhilosRadii.buttonRadius,
      child: InkWell(
        onTap: onPressed,
        borderRadius: NhilosRadii.buttonRadius,
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            borderRadius: NhilosRadii.buttonRadius,
            border: Border.all(color: NhilosColors.borderStrong),
          ),
          child: Icon(icon, color: NhilosColors.brandPrimary, size: 22),
        ),
      ),
    );
  }
}

class _VarianceBanner extends StatelessWidget {
  const _VarianceBanner({
    required this.variance,
    required this.uom,
  });

  final double? variance;
  final String uom;

  @override
  Widget build(BuildContext context) {
    if (variance == null) {
      return InputDecorator(
        decoration: const InputDecoration(
          labelText: 'Variación',
          border: OutlineInputBorder(borderRadius: NhilosRadii.buttonRadius),
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
        child: const Text(
          '—',
          style: TextStyle(color: NhilosColors.textMuted),
        ),
      );
    }

    final v = variance!;
    final Color bg;
    final Color fg;
    final Color border;
    final IconData icon;
    final String statusText;

    if (v == 0) {
      bg = NhilosColors.successLight;
      fg = NhilosColors.success;
      border = NhilosColors.successBorder;
      icon = Icons.check_circle_outline;
      statusText = 'Sin diferencia (Cuadra exacto)';
    } else if (v > 0) {
      bg = NhilosColors.warningLight;
      fg = NhilosColors.warning;
      border = NhilosColors.warningBorder;
      icon = Icons.trending_up_rounded;
      statusText = 'Sobrante físico (+${v.toStringAsFixed(2)} $uom)';
    } else {
      bg = NhilosColors.dangerLight;
      fg = NhilosColors.danger;
      border = NhilosColors.dangerBorder;
      icon = Icons.trending_down_rounded;
      statusText = 'Faltante físico (${v.toStringAsFixed(2)} $uom)';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: NhilosRadii.buttonRadius,
        border: Border.all(color: border),
      ),
      child: Row(
        children: [
          Icon(icon, color: fg, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Variación: ${v.toStringAsFixed(2)} $uom',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                    color: fg,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                Text(
                  statusText,
                  style: TextStyle(
                    fontSize: 11,
                    color: fg,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyPhysicalCountState extends StatelessWidget {
  const _EmptyPhysicalCountState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: NhilosColors.surface,
          borderRadius: NhilosRadii.cardRadius,
          border: Border.all(color: NhilosColors.border),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: NhilosColors.brandTealLight,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.fact_check_outlined,
                size: 40,
                color: NhilosColors.brandPrimary,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Todavía no hay sesiones de conteo en esta terminal.',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: NhilosColors.textPrimary,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Abra una sesión para iniciar el conteo físico y registrar ajustes de inventario.',
              style: TextStyle(color: NhilosColors.textSecondary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            Consumer<PhysicalCountViewModel>(
              builder: (context, vm, _) => ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: NhilosColors.brandPrimary,
                  foregroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(
                    borderRadius: NhilosRadii.buttonRadius,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                ),
                onPressed: vm.availableInsumos.isEmpty || vm.isLoading
                    ? null
                    : () async {
                        await vm.startSession(
                          warehouseId: 'wh-local',
                          warehouseName: 'Bodega Central',
                        );
                      },
                icon: const Icon(Icons.add_task, size: 18),
                label: const Text(
                  'INICIAR CONTEO FÍSICO',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
