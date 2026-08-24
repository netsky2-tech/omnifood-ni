import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../cash_shift_view_model.dart';

class OpenShiftDialog extends StatefulWidget {
  const OpenShiftDialog({super.key});

  @override
  State<OpenShiftDialog> createState() => _OpenShiftDialogState();
}

class _OpenShiftDialogState extends State<OpenShiftDialog> {
  final _nioController = TextEditingController(text: '0.00');
  final _usdController = TextEditingController(text: '0.00');
  final _notesController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nioController.dispose();
    _usdController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _addQuickNio(double amount) {
    final current = double.tryParse(_nioController.text) ?? 0.0;
    setState(() {
      _nioController.text = (current + amount).toStringAsFixed(2);
    });
  }

  void _addQuickUsd(double amount) {
    final current = double.tryParse(_usdController.text) ?? 0.0;
    setState(() {
      _usdController.text = (current + amount).toStringAsFixed(2);
    });
  }

  Future<void> _submit() async {
    final nio = double.tryParse(_nioController.text) ?? 0.0;
    final usd = double.tryParse(_usdController.text) ?? 0.0;

    if (nio < 0 || usd < 0) {
      setState(() {
        _error = 'Los montos no pueden ser negativos.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    final vm = context.read<CashShiftViewModel>();
    final success = await vm.openShift(
      initialFloatNio: nio,
      initialFloatUsd: usd,
      notes: _notesController.text.trim().isNotEmpty
          ? _notesController.text.trim()
          : null,
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
        _error = vm.errorMessage ?? 'Error al abrir turno.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.point_of_sale, color: Colors.indigo),
          SizedBox(width: 8),
          Expanded(child: Text('Apertura de Turno de Caja')),
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
              const Text(
                'Ingresa el fondo inicial de gaveta para comenzar a facturar:',
                style: TextStyle(fontSize: 13, color: Colors.black87),
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('open_shift_nio_input'),
                controller: _nioController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Fondo Inicial (C\$)',
                  prefixText: 'C\$ ',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  ActionChip(
                    label: const Text('+C\$ 500'),
                    onPressed: () => _addQuickNio(500),
                  ),
                  ActionChip(
                    label: const Text('+C\$ 1,000'),
                    onPressed: () => _addQuickNio(1000),
                  ),
                  ActionChip(
                    label: const Text('+C\$ 2,000'),
                    onPressed: () => _addQuickNio(2000),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('open_shift_usd_input'),
                controller: _usdController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Fondo Inicial (\$ USD)',
                  prefixText: '\$ ',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  ActionChip(
                    label: const Text('+\$ 20'),
                    onPressed: () => _addQuickUsd(20),
                  ),
                  ActionChip(
                    label: const Text('+\$ 50'),
                    onPressed: () => _addQuickUsd(50),
                  ),
                  ActionChip(
                    label: const Text('+\$ 100'),
                    onPressed: () => _addQuickUsd(100),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _notesController,
                decoration: const InputDecoration(
                  labelText: 'Notas / Observaciones (Opcional)',
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
              : const Text('Confirmar Apertura'),
        ),
      ],
    );
  }
}
