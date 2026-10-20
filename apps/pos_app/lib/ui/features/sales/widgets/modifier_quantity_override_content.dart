import 'package:flutter/material.dart';

/// What the supervisor is authorizing: how much, and why.
class ModifierQuantityOverrideDraft {
  const ModifierQuantityOverrideDraft({this.quantity, this.reason = ''});

  /// The quantity to apply, in the affected insumo's own unit.
  final double? quantity;

  /// Why the quantity differs from the configuration. NEVER empty: an
  /// override without a reason is an override nobody can explain later.
  final String reason;

  bool get isComplete =>
      quantity != null && quantity! > 0 && reason.trim().length >= 3;
}

/// The two facts an amount override needs, on top of the credentials: HOW MUCH
/// and WHY.
///
/// The amount is expressed in the affected insumo's own unit — the same unit
/// the stock movement carries — so nobody has to translate between grams and
/// millilitres at the moment of sale.
class ModifierQuantityOverrideContent extends StatefulWidget {
  final String? unit;

  /// The name of the insumo the amount applies to (for the label).
  final String insumoLabel;

  final void Function(ModifierQuantityOverrideDraft draft) onChanged;

  const ModifierQuantityOverrideContent({
    super.key,
    required this.unit,
    required this.insumoLabel,
    required this.onChanged,
  });

  @override
  State<ModifierQuantityOverrideContent> createState() =>
      _ModifierQuantityOverrideContentState();
}

class _ModifierQuantityOverrideContentState
    extends State<ModifierQuantityOverrideContent> {
  final _quantityCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _quantityCtrl.addListener(_emit);
    _reasonCtrl.addListener(_emit);
  }

  @override
  void dispose() {
    _quantityCtrl
      ..removeListener(_emit)
      ..dispose();
    _reasonCtrl
      ..removeListener(_emit)
      ..dispose();
    super.dispose();
  }

  void _emit() {
    widget.onChanged(
      ModifierQuantityOverrideDraft(
        quantity: double.tryParse(_quantityCtrl.text.trim()),
        reason: _reasonCtrl.text,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final unit = widget.unit;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          unit == null
              ? 'Cantidad que se aplica a ${widget.insumoLabel}:'
              : 'Cantidad de ${widget.insumoLabel} (${unit.toLowerCase()}):',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('modifier_override_quantity'),
          controller: _quantityCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Cantidad',
            hintText: unit == null ? 'Cantidad' : 'Cantidad en ${unit.toLowerCase()}',
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('modifier_override_reason'),
          controller: _reasonCtrl,
          maxLines: 2,
          decoration: const InputDecoration(
            labelText: 'Motivo',
            hintText: 'Por qué se ajusta esta cantidad',
          ),
        ),
      ],
    );
  }
}
