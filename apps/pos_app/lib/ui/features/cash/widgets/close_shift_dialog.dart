import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../cash_shift_view_model.dart';
import 'z_report_dialog.dart';

class CloseShiftDialog extends StatefulWidget {
  const CloseShiftDialog({super.key});

  @override
  State<CloseShiftDialog> createState() => _CloseShiftDialogState();
}

class _CloseShiftDialogState extends State<CloseShiftDialog> {
  final _nioCountedController = TextEditingController(text: '0.00');
  final _usdCountedController = TextEditingController(text: '0.00');
  final _notesController = TextEditingController();
  final _supervisorPinController = TextEditingController();

  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nioCountedController.dispose();
    _usdCountedController.dispose();
    _notesController.dispose();
    _supervisorPinController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final countedNio = double.tryParse(_nioCountedController.text) ?? 0.0;
    final countedUsd = double.tryParse(_usdCountedController.text) ?? 0.0;

    if (countedNio < 0 || countedUsd < 0) {
      setState(() {
        _error = 'Los montos contados no pueden ser negativos.';
      });
      return;
    }

    final vm = context.read<CashShiftViewModel>();
    final activeShift = vm.activeShift;
    if (activeShift == null) {
      setState(() {
        _error = 'No hay turno activo para cerrar.';
      });
      return;
    }

    final diffNio = (countedNio - activeShift.expectedNio).abs();
    final diffUsd = (countedUsd - activeShift.expectedUsd).abs();
    final hasHighVariance = diffNio > 100.0 || diffUsd > 5.0;

    setState(() {
      _submitting = true;
      _error = null;
    });

    final success = await vm.closeShiftWithBlindCount(
      countedNio: countedNio,
      countedUsd: countedUsd,
      notes: _notesController.text.trim().isNotEmpty
          ? _notesController.text.trim()
          : null,
      supervisorId: hasHighVariance ? 'supervisor-auth' : null,
    );

    if (mounted) {
      if (success) {
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop(true);
        }
        if (vm.lastClosedShift != null) {
          showDialog<void>(
            context: context,
            builder: (_) => ZReportDialog(shift: vm.lastClosedShift!),
          );
        }
        return;
      }
      setState(() {
        _submitting = false;
        _error = vm.errorMessage ?? 'Error al cerrar turno.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.point_of_sale_outlined, color: Colors.indigo),
          SizedBox(width: 8),
          Expanded(child: Text('Arqueo Ciego y Cierre de Turno')),
        ],
      ),
      content: SingleChildScrollView(
        child: SizedBox(
          width: 480,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Colors.red, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(color: Colors.red, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade300),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.visibility_off, color: Colors.amber, size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Arqueo Ciego: Cuenta el efectivo físico en gaveta e ingresa el monto total contado sin consultar el sistema.',
                        style: TextStyle(fontSize: 12, color: Colors.black87),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('close_shift_nio_counted_input'),
                      controller: _nioCountedController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Total Contado (C\$)',
                        prefixText: 'C\$ ',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      key: const Key('close_shift_usd_counted_input'),
                      controller: _usdCountedController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Total Contado (\$ USD)',
                        prefixText: '\$ ',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('close_shift_notes_input'),
                controller: _notesController,
                decoration: const InputDecoration(
                  labelText: 'Observaciones de Cierre (Opcional)',
                  hintText: 'Ej: Turno entregado a Juan, cambio completo...',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                maxLines: 2,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.red.shade700,
            foregroundColor: Colors.white,
          ),
          child: _submitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Text('Cerrar Turno (Corte Z)'),
        ),
      ],
    );
  }
}
