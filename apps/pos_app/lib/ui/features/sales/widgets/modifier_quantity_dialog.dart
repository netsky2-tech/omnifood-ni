import 'package:flutter/material.dart';

/// The quantity a supervisor (or the operator) marks for an extra that has
/// no configured quantity, and WHY.
///
/// WITHOUT a supervisor: the quantity is a DATA question, not a control one.
/// The evidence (who, how much, why) is the control, and it is recorded.
/// The tenant can still require a supervisor for it (its policy).
class ModifierQuantityResult {
  const ModifierQuantityResult({required this.quantity, required this.reason});

  final double quantity;
  final String reason;
}

/// Asks for the quantity to apply and the reason, with no credential: the
/// operator knows their own numbers far better than a supervisor does, and
/// the reason is what makes the adjustment explainable later.
class ModifierQuantityDialog extends StatefulWidget {
  final String? unit;
  final String insumoLabel;

  const ModifierQuantityDialog({
    super.key,
    required this.unit,
    required this.insumoLabel,
  });

  @override
  State<ModifierQuantityDialog> createState() => _ModifierQuantityDialogState();
}

class _ModifierQuantityDialogState extends State<ModifierQuantityDialog> {
  final _quantityCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();

  @override
  void dispose() {
    _quantityCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  bool get _isComplete {
    final quantity = double.tryParse(_quantityCtrl.text.trim());
    return quantity != null && quantity > 0 && _reasonCtrl.text.trim().length >= 3;
  }

  void _confirm() {
    final quantity = double.tryParse(_quantityCtrl.text.trim());
    if (quantity == null || quantity <= 0) return;
    if (_reasonCtrl.text.trim().length < 3) return;
    Navigator.of(context).pop(
      ModifierQuantityResult(
        quantity: quantity,
        reason: _reasonCtrl.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final unit = widget.unit;
    return AlertDialog(
      title: const Text('Cantidad de este extra'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              unit == null
                  ? 'Este extra no tiene una cantidad configurada. Escriba '
                      'cuánto descuenta del inventario.'
                  : 'Este extra no tiene una cantidad configurada. Escriba '
                      'cuántos ${unit.toLowerCase()} descuenta del inventario.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('modifier_quantity_value'),
              controller: _quantityCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Cantidad',
                hintText: unit == null ? 'Cantidad' : 'Cantidad en ${unit.toLowerCase()}',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('modifier_quantity_reason'),
              controller: _reasonCtrl,
              maxLines: 2,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Motivo',
                hintText: 'Por qué se aplica esta cantidad',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _isComplete ? _confirm : null,
          child: const Text('APLICAR'),
        ),
      ],
    );
  }
}
