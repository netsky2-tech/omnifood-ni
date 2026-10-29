import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../design_system/nhilos_tokens.dart';
import '../../../../data/models/sales/cashier_session_entity.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../cash_shift_view_model.dart';
import 'z_report_dialog.dart';

/// Issue #940 (Paso B): Dialog to inspect and administratively manage
/// all cashier shifts currently open on this physical terminal.
/// Allows supervisors (Owner / Manager) to identify orphaned shifts left
/// behind by previous operators and close them with a mandatory forensic reason.
class DeviceShiftsDialog extends StatelessWidget {
  const DeviceShiftsDialog({
    super.key,
    required this.usersById,
  });

  final Map<String, String> usersById;

  String _formatNio(double amount) => 'C\$ ${amount.toStringAsFixed(2)}';
  String _formatUsd(double amount) => '\$ ${amount.toStringAsFixed(2)}';

  String _userName(CashierSessionEntity shift) {
    if (shift.cashierName != null && shift.cashierName!.trim().isNotEmpty) {
      return shift.cashierName!.trim();
    }
    return resolveUserName(shift.userId, usersById);
  }

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<CashShiftViewModel>();
    final openShifts = vm.openTerminalShifts;
    final activeShiftId = vm.activeShift?.id;

    return Dialog(
      shape: const RoundedRectangleBorder(borderRadius: NhilosRadii.modalRadius),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680, maxHeight: 720),
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: NhilosColors.brandTealLight,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.devices_other,
                      color: NhilosColors.brandPrimary,
                      size: 28,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Turnos Abiertos en este Dispositivo',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: NhilosColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Terminal: ${vm.currentTerminalId} • Gestión y auditoría administrativa de turnos locales.',
                          style: const TextStyle(
                            fontSize: 13,
                            color: NhilosColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                    tooltip: 'Cerrar',
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(height: 1),
              const SizedBox(height: 16),

              // Content list
              if (openShifts.isEmpty)
                Container(
                  padding: const EdgeInsets.all(32),
                  alignment: Alignment.center,
                  child: Column(
                    children: [
                      const Icon(
                        Icons.check_circle_outline,
                        color: NhilosColors.success,
                        size: 56,
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'No hay turnos abiertos en este dispositivo',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: NhilosColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Todos los turnos de la terminal ${vm.currentTerminalId} se encuentran debidamente cerrados.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 13,
                          color: NhilosColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: openShifts.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final shift = openShifts[index];
                      final isCurrentOperatorShift = shift.id == activeShiftId;
                      final openedDate =
                          DateTime.fromMillisecondsSinceEpoch(shift.openedAt);
                      final formattedDate =
                          DateFormat('dd/MM/yyyy HH:mm:ss').format(openedDate);

                      return Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: isCurrentOperatorShift
                              ? Colors.white
                              : NhilosColors.warningLight.withOpacity(0.4),
                          border: Border.all(
                            color: isCurrentOperatorShift
                                ? NhilosColors.border
                                : NhilosColors.warningBorder,
                            width: isCurrentOperatorShift ? 1 : 1.5,
                          ),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              alignment: WrapAlignment.spaceBetween,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 12,
                              runSpacing: 6,
                              children: [
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      isCurrentOperatorShift
                                          ? Icons.person
                                          : Icons.warning_amber_rounded,
                                      color: isCurrentOperatorShift
                                          ? NhilosColors.brandPrimary
                                          : NhilosColors.warning,
                                      size: 20,
                                    ),
                                    const SizedBox(width: 8),
                                    Flexible(
                                      child: Text(
                                        _userName(shift),
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.bold,
                                          color: NhilosColors.textPrimary,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: isCurrentOperatorShift
                                        ? NhilosColors.successLight
                                        : NhilosColors.warningLight,
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(
                                      color: isCurrentOperatorShift
                                          ? NhilosColors.successBorder
                                          : NhilosColors.warningBorder,
                                    ),
                                  ),
                                  child: Text(
                                    isCurrentOperatorShift
                                        ? 'Turno Activo Actual'
                                        : 'Turno Huérfano / Otro Operador',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: isCurrentOperatorShift
                                          ? NhilosColors.success
                                          : NhilosColors.warning,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 16,
                              runSpacing: 4,
                              children: [
                                Text(
                                  'Apertura: $formattedDate',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: NhilosColors.textSecondary,
                                  ),
                                ),
                                Text(
                                  'Fondo Inicial: ${_formatNio(shift.openingBalanceNio)} / ${_formatUsd(shift.openingBalanceUsd)}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: NhilosColors.textSecondary,
                                    fontFeatures: [FontFeature.tabularFigures()],
                                  ),
                                ),
                                Text(
                                  'Base Gaveta: ${_formatNio(shift.expectedNio)} / ${_formatUsd(shift.expectedUsd)}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: NhilosColors.textSecondary,
                                    fontFeatures: [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ],
                            ),
                            if (shift.notes != null &&
                                shift.notes!.trim().isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                'Nota: ${shift.notes!.trim()}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontStyle: FontStyle.italic,
                                  color: NhilosColors.textSecondary,
                                ),
                              ),
                            ],
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                if (!isCurrentOperatorShift)
                                  ElevatedButton.icon(
                                    onPressed: () => _openAdministrativeClose(
                                        context, vm, shift),
                                    icon: const Icon(Icons.gavel, size: 16),
                                    label: const Text(
                                        'Cierre Administrativo con Motivo'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: NhilosColors.danger,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 14, vertical: 8),
                                      textStyle: const TextStyle(fontSize: 13),
                                      shape: const RoundedRectangleBorder(
                                        borderRadius: NhilosRadii.buttonRadius,
                                      ),
                                    ),
                                  )
                                else
                                  const Text(
                                    'Gestionable desde la pantalla principal de caja',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: NhilosColors.textSecondary,
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),

              const SizedBox(height: 16),
              const Divider(height: 1),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cerrar'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openAdministrativeClose(
    BuildContext context,
    CashShiftViewModel vm,
    CashierSessionEntity shift,
  ) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => AdministrativeCloseShiftDialog(
        shift: shift,
        cashierDisplayName: _userName(shift),
        viewModel: vm,
      ),
    );

    if (result == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Turno huérfano de ${_userName(shift)} cerrado administrativamente (Corte Z emitido).',
          ),
          backgroundColor: NhilosColors.success,
        ),
      );

      // Offer to view the generated Z report
      if (vm.lastClosedShift != null && context.mounted) {
        showDialog<void>(
          context: context,
          builder: (_) => ZReportDialog(
            shift: vm.lastClosedShift!,
            cashierName: _userName(shift),
            supervisorName: vm.currentUserName,
          ),
        );
      }
    }
  }
}

/// Modal dialog requiring a justified reason and cash counts before
/// completing an administrative close of an orphaned shift.
class AdministrativeCloseShiftDialog extends StatefulWidget {
  const AdministrativeCloseShiftDialog({
    super.key,
    required this.shift,
    required this.cashierDisplayName,
    required this.viewModel,
  });

  final CashierSessionEntity shift;
  final String cashierDisplayName;
  final CashShiftViewModel viewModel;

  @override
  State<AdministrativeCloseShiftDialog> createState() =>
      _AdministrativeCloseShiftDialogState();
}

class _AdministrativeCloseShiftDialogState
    extends State<AdministrativeCloseShiftDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _reasonController;
  late final TextEditingController _countedNioController;
  late final TextEditingController _countedUsdController;
  late final TextEditingController _notesController;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _reasonController = TextEditingController();
    _countedNioController =
        TextEditingController(text: widget.shift.expectedNio.toStringAsFixed(2));
    _countedUsdController =
        TextEditingController(text: widget.shift.expectedUsd.toStringAsFixed(2));
    _notesController = TextEditingController();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    _countedNioController.dispose();
    _countedUsdController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final nio = double.tryParse(_countedNioController.text.trim()) ?? 0.0;
    final usd = double.tryParse(_countedUsdController.text.trim()) ?? 0.0;

    setState(() => _submitting = true);

    final success = await widget.viewModel.closeOrphanShift(
      shiftId: widget.shift.id,
      reason: _reasonController.text.trim(),
      countedNio: nio,
      countedUsd: usd,
      notes: _notesController.text.trim().isNotEmpty
          ? _notesController.text.trim()
          : null,
    );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (success) {
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.viewModel.errorMessage ??
                'No se pudo cerrar el turno huérfano.',
          ),
          backgroundColor: NhilosColors.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: const RoundedRectangleBorder(borderRadius: NhilosRadii.modalRadius),
      title: Row(
        children: [
          const Icon(Icons.gavel, color: NhilosColors.danger),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Cierre Administrativo de Turno',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: NhilosColors.dangerLight,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: NhilosColors.dangerBorder),
                ),
                child: Text(
                  'Atención: Va a emitir un Corte Z forzado para el turno huérfano de ${widget.cashierDisplayName}. Esta acción es definitiva y quedará registrada en la bitácora de auditoría forense.',
                  style: const TextStyle(
                    fontSize: 12,
                    color: NhilosColors.danger,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _reasonController,
                decoration: const InputDecoration(
                  labelText: 'Motivo del cierre administrativo *',
                  hintText: 'Ej. Operador abandonó el puesto / Emergencia',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.edit_note),
                ),
                maxLines: 2,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'El motivo es obligatorio para auditar el cierre.';
                  }
                  if (val.trim().length < 4) {
                    return 'Ingrese un motivo descriptivo (mínimo 4 caracteres).';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _countedNioController,
                      decoration: const InputDecoration(
                        labelText: 'Arqueo Efectivo (C\$)',
                        border: OutlineInputBorder(),
                        prefixText: 'C\$ ',
                      ),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      style: const TextStyle(
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                      validator: (val) {
                        if (val == null || double.tryParse(val.trim()) == null) {
                          return 'Monto inválido';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _countedUsdController,
                      decoration: const InputDecoration(
                        labelText: 'Arqueo Efectivo (\$ USD)',
                        border: OutlineInputBorder(),
                        prefixText: '\$ ',
                      ),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      style: const TextStyle(
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                      validator: (val) {
                        if (val == null || double.tryParse(val.trim()) == null) {
                          return 'Monto inválido';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _notesController,
                decoration: const InputDecoration(
                  labelText: 'Notas adicionales (opcional)',
                  hintText: 'Ej. Conteo realizado en presencia de supervisión',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.comment),
                ),
                maxLines: 1,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton.icon(
          onPressed: _submitting ? null : _submit,
          icon: _submitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.check, size: 16),
          label: const Text('Confirmar y Emitir Corte Z'),
          style: FilledButton.styleFrom(
            backgroundColor: NhilosColors.danger,
            foregroundColor: Colors.white,
          ),
        ),
      ],
    );
  }
}
