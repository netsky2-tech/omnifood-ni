import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../../domain/services/sales/tip_engine.dart';
import '../../../../presentation/features/sales/view_models/sale_view_model.dart';

/// D-7 (owner decision 2026-10-02): direct tip entry on the checkout.
///
/// This dialog is reachable from the cart sidebar whenever the cart is not
/// empty — it is NEVER behind the FOODPARK_QSR `isSplitBillAllowed` gate
/// that guards `DIVIDIR CUENTA`. It covers the full [TipType] set:
/// none / suggested 10% / custom percentage (validated 0-100) / fixed NIO /
/// fixed USD ([TipEngine] converts the USD amount through the applied
/// checkout rate — the BCN rate in BCN_OFFICIAL mode, the commercial rate
/// otherwise — so the USD option is first-class).
///
/// The live preview shows the tip and `Total con propina`; applying writes
/// through [SaleViewModel.setTip] / [SaleViewModel.clearTip]. The tip is
/// voluntary and DGI non-taxable (INV-16.1): it never enters the taxable
/// base, it is charged on top of the fiscal total.
class TipDialog extends StatefulWidget {
  const TipDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog<void>(
      context: context,
      builder: (_) => const TipDialog(),
    );
  }

  @override
  State<TipDialog> createState() => _TipDialogState();
}

class _TipDialogState extends State<TipDialog> {
  late TipType _selected;
  late final TextEditingController _customPctController;
  late final TextEditingController _fixedNioController;
  late final TextEditingController _fixedUsdController;
  String? _customError;
  String? _fixedNioError;
  String? _fixedUsdError;

  @override
  void initState() {
    super.initState();
    final vm = context.read<SaleViewModel>();
    _selected = vm.tipType;
    _customPctController = TextEditingController(
      text: vm.tipType == TipType.customPercentage && vm.customTipPercentage > 0
          ? vm.customTipPercentage.toStringAsFixed(0)
          : '',
    );
    _fixedNioController = TextEditingController(
      text: vm.tipType == TipType.fixedAmountNio && vm.fixedTipAmount > 0
          ? vm.fixedTipAmount.toStringAsFixed(2)
          : '',
    );
    _fixedUsdController = TextEditingController(
      text: vm.tipType == TipType.fixedAmountUsd && vm.fixedTipAmount > 0
          ? vm.fixedTipAmount.toStringAsFixed(2)
          : '',
    );
  }

  @override
  void dispose() {
    _customPctController.dispose();
    _fixedNioController.dispose();
    _fixedUsdController.dispose();
    super.dispose();
  }

  double _parse(String raw) {
    final value = double.tryParse(raw.trim().replaceAll(',', '.'));
    return value ?? -1.0;
  }

  double get _customPctValue => _parse(_customPctController.text);

  double get _fixedNioValue => _parse(_fixedNioController.text);

  double get _fixedUsdValue => _parse(_fixedUsdController.text);

  /// Mirror of [SaleViewModel.tipCalculation] but reflecting the dialog's
  /// PENDING selection, so the operator sees the effect before applying.
  TipCalculation _preview(SaleViewModel vm) {
    return TipEngine.calculate(
      subtotalNio: vm.subtotal,
      taxNio: vm.totalTax,
      discountNio: 0.0,
      tipType: _selected,
      customPercentage: _selected == TipType.customPercentage
          ? (_customPctValue > 0 ? _customPctValue : 0.0)
          : 0.0,
      fixedAmount: _selected == TipType.fixedAmountNio
          ? (_fixedNioValue > 0 ? _fixedNioValue : 0.0)
          : _selected == TipType.fixedAmountUsd
              ? (_fixedUsdValue > 0 ? _fixedUsdValue : 0.0)
              : 0.0,
      // T2b/#67: preview at the rate actually applied at checkout (the BCN
      // rate in BCN_OFFICIAL mode), mirroring [SaleViewModel.tipCalculation].
      commercialRate: vm.activeCheckoutRate,
    );
  }

  bool get _canApply {
    switch (_selected) {
      case TipType.none:
      case TipType.suggestedTenPercent:
        return true;
      case TipType.customPercentage:
        return _customPctValue > 0 && _customPctValue <= 100;
      case TipType.fixedAmountNio:
        return _fixedNioValue > 0;
      case TipType.fixedAmountUsd:
        return _fixedUsdValue > 0;
    }
  }

  void _onCustomPctChanged(String raw) {
    final value = _parse(raw);
    setState(() {
      _customError = (value <= 0 || value > 100)
          ? 'Ingresá un porcentaje entre 0 y 100'
          : null;
    });
  }

  void _onFixedNioChanged(String raw) {
    final value = _parse(raw);
    setState(() {
      _fixedNioError =
          value <= 0 ? 'Ingresá un monto mayor a C\$ 0' : null;
    });
  }

  void _onFixedUsdChanged(String raw) {
    final value = _parse(raw);
    setState(() {
      _fixedUsdError =
          value <= 0 ? 'Ingresá un monto mayor a \$ 0' : null;
    });
  }

  String _formatPct(double pct) {
    return pct % 1 == 0 ? pct.toStringAsFixed(0) : pct.toStringAsFixed(2);
  }

  void _apply() {
    if (!_canApply) return;
    final vm = context.read<SaleViewModel>();

    switch (_selected) {
      case TipType.none:
        vm.clearTip();
        break;
      case TipType.suggestedTenPercent:
        vm.setTip(tipType: TipType.suggestedTenPercent);
        break;
      case TipType.customPercentage:
        vm.setTip(
          tipType: TipType.customPercentage,
          customPercentage: _customPctValue,
        );
        break;
      case TipType.fixedAmountNio:
        vm.setTip(
          tipType: TipType.fixedAmountNio,
          fixedAmount: _fixedNioValue,
        );
        break;
      case TipType.fixedAmountUsd:
        vm.setTip(
          tipType: TipType.fixedAmountUsd,
          fixedAmount: _fixedUsdValue,
        );
        break;
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final preview = _preview(vm);
    final totalWithTip = vm.total + preview.tipAmountNio;

    return Dialog(
      key: const Key('tip_dialog'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header — follows the split-bill dialog conventions.
            Row(
              children: [
                const Icon(
                  Icons.volunteer_activism,
                  color: Colors.teal,
                  size: 26,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Propina Voluntaria',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: colorScheme.onSurface,
                        ),
                      ),
                      const Text(
                        'Se suma al total a cobrar',
                        style: TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Tip type selector.
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  key: const Key('tip_dialog_chip_none'),
                  label: const Text('Sin propina'),
                  selected: _selected == TipType.none,
                  onSelected: (_) => setState(() => _selected = TipType.none),
                ),
                ChoiceChip(
                  key: const Key('tip_dialog_chip_10'),
                  label: const Text('10% sugerida'),
                  selected: _selected == TipType.suggestedTenPercent,
                  onSelected: (_) => setState(
                    () => _selected = TipType.suggestedTenPercent,
                  ),
                ),
                ChoiceChip(
                  key: const Key('tip_dialog_chip_custom'),
                  label: const Text('% personalizado'),
                  selected: _selected == TipType.customPercentage,
                  onSelected: (_) => setState(
                    () => _selected = TipType.customPercentage,
                  ),
                ),
                ChoiceChip(
                  key: const Key('tip_dialog_chip_fixed_nio'),
                  label: const Text('Monto fijo C\$'),
                  selected: _selected == TipType.fixedAmountNio,
                  onSelected: (_) => setState(
                    () => _selected = TipType.fixedAmountNio,
                  ),
                ),
                ChoiceChip(
                  key: const Key('tip_dialog_chip_fixed_usd'),
                  label: const Text('Monto fijo USD'),
                  selected: _selected == TipType.fixedAmountUsd,
                  onSelected: (_) => setState(
                    () => _selected = TipType.fixedAmountUsd,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Input for the selected type.
            if (_selected == TipType.customPercentage)
              TextField(
                key: const Key('tip_dialog_custom_input'),
                controller: _customPctController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d*[.,]?\d{0,2}')),
                ],
                decoration: InputDecoration(
                  labelText: 'Porcentaje de propina (0-100)',
                  suffixText: '%',
                  border: const OutlineInputBorder(),
                  errorText: _customError,
                ),
                onChanged: _onCustomPctChanged,
              ),
            if (_selected == TipType.fixedAmountNio)
              TextField(
                key: const Key('tip_dialog_fixed_nio_input'),
                controller: _fixedNioController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d*[.,]?\d{0,2}')),
                ],
                decoration: InputDecoration(
                  labelText: 'Monto fijo en córdobas',
                  prefixText: 'C\$ ',
                  border: const OutlineInputBorder(),
                  errorText: _fixedNioError,
                ),
                onChanged: _onFixedNioChanged,
              ),
            if (_selected == TipType.fixedAmountUsd)
              TextField(
                key: const Key('tip_dialog_fixed_usd_input'),
                controller: _fixedUsdController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d*[.,]?\d{0,2}')),
                ],
                decoration: InputDecoration(
                  labelText: 'Monto fijo en dólares',
                  prefixText: '\$ ',
                  border: const OutlineInputBorder(),
                  errorText: _fixedUsdError,
                ),
                onChanged: _onFixedUsdChanged,
              ),
            const SizedBox(height: 12),

            // Live preview card.
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.teal.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.teal.shade200),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Subtotal:',
                          style: TextStyle(fontSize: 12)),
                      Text(
                        'C\$ ${vm.subtotal.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    key: const Key('tip_dialog_preview_tip'),
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _selected == TipType.none
                            ? 'Propina:'
                            : 'Propina (${_formatPct(preview.effectivePercentage)}%):',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.teal.shade800,
                        ),
                      ),
                      Text(
                        'C\$ ${preview.tipAmountNio.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.teal.shade800,
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 12),
                  Row(
                    key: const Key('tip_dialog_preview_total'),
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Total con propina:',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        'C\$ ${totalWithTip.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: colorScheme.primary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Actions are STACKED full-width, deliberately not a horizontal
            // Row. Device-verified defect: on the Q80 (533dp logical) the
            // end-aligned Row pushed 'APLICAR PROPINA' out of the dialog, so
            // the primary action had no hit target and an operator could not
            // apply a tip at all. The widget-test surface (800x600) never
            // reproduced it, which is why this reached the device. The Column
            // above is crossAxisAlignment.stretch, so both actions fill the
            // available width and cannot be pushed off-screen at any width.
            ElevatedButton(
              key: const Key('tip_dialog_apply'),
              onPressed: _canApply ? _apply : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal.shade700,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('APLICAR PROPINA'),
            ),
            const SizedBox(height: 4),
            TextButton(
              key: const Key('tip_dialog_cancel'),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('CANCELAR'),
            ),
          ],
        ),
      ),
    );
  }
}
