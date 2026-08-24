import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../cash_shift_view_model.dart';

class CashMovementDialog extends StatefulWidget {
  const CashMovementDialog({super.key});

  @override
  State<CashMovementDialog> createState() => _CashMovementDialogState();
}

class _CashMovementDialogState extends State<CashMovementDialog> {
  String _selectedType = 'CASH_IN';
  final _nioController = TextEditingController(text: '0.00');
  final _usdController = TextEditingController(text: '0.00');
  final _reasonController = TextEditingController();
  final _supervisorPinController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nioController.dispose();
    _usdController.dispose();
    _reasonController.dispose();
    _supervisorPinController.dispose();
    super.dispose();
  }

  bool get _requiresSupervisor =>
      _selectedType == 'PETTY_CASH' || _selectedType == 'SAFE_DROP';

  Future<void> _submit() async {
    final nio = double.tryParse(_nioController.text) ?? 0.0;
    final usd = double.tryParse(_usdController.text) ?? 0.0;
    final reason = _reasonController.text.trim();

    if (nio <= 0 && usd <= 0) {
      setState(() {
        _error = 'Debes ingresar un monto mayor a 0 en al menos una moneda.';
      });
      return;
    }

    if (reason.isEmpty) {
      setState(() {
        _error = 'El motivo o justificación es obligatorio.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    final vm = context.read<CashShiftViewModel>();
    final success = await vm.recordMovement(
      type: _selectedType,
      amountNio: nio,
      amountUsd: usd,
      reason: reason,
      authorizedByUserId: _requiresSupervisor ? 'user-manager' : null,
    );

    if (mounted) {
      if (success) {
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop(true);
        }
        return;
      }
      setState(() {
        _submitting = false;
        _error = vm.errorMessage ?? 'Error al registrar movimiento.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.swap_vert, color: Colors.indigo),
          SizedBox(width: 8),
          Expanded(child: Text('Nuevo Movimiento de Caja')),
        ],
      ),
      content: SingleChildScrollView(
        child: SizedBox(
          width: 440,
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
              DropdownButtonFormField<String>(
                value: _selectedType,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Tipo de Movimiento',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'CASH_IN',
                    child: Text('🟢 Ingreso Menudo (CASH_IN)', overflow: TextOverflow.ellipsis),
                  ),
                  DropdownMenuItem(
                    value: 'PETTY_CASH',
                    child: Text('🔴 Gasto Menor (PETTY_CASH)', overflow: TextOverflow.ellipsis),
                  ),
                  DropdownMenuItem(
                    value: 'SAFE_DROP',
                    child: Text('🟡 Retiro a Bóveda (SAFE_DROP)', overflow: TextOverflow.ellipsis),
                  ),
                  DropdownMenuItem(
                    value: 'CASH_OUT',
                    child: Text('🔴 Egreso Efectivo (CASH_OUT)', overflow: TextOverflow.ellipsis),
                  ),
                ],
                onChanged: (val) {
                  if (val != null) {
                    setState(() {
                      _selectedType = val;
                    });
                  }
                },
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('cash_movement_nio_input'),
                      controller: _nioController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Monto en Córdobas (C\$)',
                        prefixText: 'C\$ ',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      key: const Key('cash_movement_usd_input'),
                      controller: _usdController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Monto en Dólares (\$ USD)',
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
                key: const Key('cash_movement_reason_input'),
                controller: _reasonController,
                decoration: const InputDecoration(
                  labelText: 'Motivo / Justificación',
                  hintText: 'Ej: Compra de hielo, cambio menudo de banco...',
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
            backgroundColor: Colors.indigo,
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
              : const Text('Guardar Movimiento'),
        ),
      ],
    );
  }
}
