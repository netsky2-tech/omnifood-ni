import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/localization/label_map.dart';
import '../../../design_system/responsive_layout.dart';
import '../cash_shift_view_model.dart';
import '../../../design_system/nhilos_tokens.dart';

class CashMovementDialog extends StatefulWidget {
  const CashMovementDialog({super.key});

  @override
  State<CashMovementDialog> createState() => _CashMovementDialogState();
}

class _CashMovementDialogState extends State<CashMovementDialog> {
  String _selectedType = 'CASH_IN';
  // D-16: start EMPTY. Seeding '0.00' made the operator's digits CONCATENATE
  // onto it ("0.00100"), a silent data-entry error on a money field. The hint
  // keeps the affordance without owning the value.
  final _nioController = TextEditingController();
  final _usdController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nioController.dispose();
    _usdController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

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
    // D-13: authorizedByUserId is ALWAYS null. There IS no authorization
    // step here — the owner explicitly ruled out a PIN gate for this kiosk
    // (in a food park the operator buys ice on the spot while the owner is
    // absent), so nobody authorized the movement and the field — which means
    // "who authorized" — must not carry a fabricated identity. The REAL
    // operator attribution already exists through
    // `shift_id -> cashier_sessions.user_id`: a movement can only be
    // recorded on the active shift of the acting user. Fabricating a
    // self-authorization id would trade one false identity for another.
    // Policy note: PETTY_CASH/SAFE_DROP deliberately require NO
    // authorization gate; authorization is a policy decision, never a
    // stamped identity.
    final success = await vm.recordMovement(
      type: _selectedType,
      amountNio: nio,
      amountUsd: usd,
      reason: reason,
      authorizedByUserId: null,
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
    // D-20: handheld widths stack the two money fields so the currency marker
    // in the label can never be truncated by a cramped half-width field.
    // Same isHandheld switch used by MultiCurrencyCheckoutDialog.
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);
    return AlertDialog(
      shape: const RoundedRectangleBorder(
        borderRadius: NhilosRadii.modalRadius,
      ),
      title: const Row(
        children: [
          Icon(Icons.swap_vert, color: NhilosColors.brandPrimary),
          SizedBox(width: 8),
          Expanded(child: Text('Nuevo Movimiento de Caja')),
        ],
      ),
      content: SingleChildScrollView(
        child: SizedBox(
          width: isHandheld ? double.infinity : 440,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: NhilosColors.dangerLight,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: NhilosColors.dangerBorder),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline,
                          color: NhilosColors.danger, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(
                              color: NhilosColors.danger, fontSize: 13),
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
                // D-14: displayed text is the localized Spanish label; the
                // `value:` codes are the persistence contract and stay
                // EXACTLY as they were.
                items: [
                  DropdownMenuItem(
                    value: 'CASH_IN',
                    child: Text(
                        '🟢 ${localize('CASH_IN', kCashMovementTypeLabels)}',
                        overflow: TextOverflow.ellipsis),
                  ),
                  DropdownMenuItem(
                    value: 'PETTY_CASH',
                    child: Text(
                        '🔴 ${localize('PETTY_CASH', kCashMovementTypeLabels)}',
                        overflow: TextOverflow.ellipsis),
                  ),
                  DropdownMenuItem(
                    value: 'SAFE_DROP',
                    child: Text(
                        '🟡 ${localize('SAFE_DROP', kCashMovementTypeLabels)}',
                        overflow: TextOverflow.ellipsis),
                  ),
                  DropdownMenuItem(
                    value: 'CASH_OUT',
                    child: Text(
                        '🔴 ${localize('CASH_OUT', kCashMovementTypeLabels)}',
                        overflow: TextOverflow.ellipsis),
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
              // D-20: short, symbol-FIRST labels so the currency marker
              // survives any truncation; stacked on handheld widths.
              if (isHandheld)
                Column(
                  children: [
                    _amountField(_nioController, isNio: true),
                    const SizedBox(height: 12),
                    _amountField(_usdController, isNio: false),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(child: _amountField(_nioController, isNio: true)),
                    const SizedBox(width: 12),
                    Expanded(child: _amountField(_usdController, isNio: false)),
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
            backgroundColor: NhilosColors.brandPrimary,
            foregroundColor: Colors.white,
            shape: const RoundedRectangleBorder(
              borderRadius: NhilosRadii.buttonRadius,
            ),
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

  // D-16 contract preserved: controllers start EMPTY, '0.00' is only a hint.
  // Only the label wording and the layout wrapper changed (D-20).
  Widget _amountField(TextEditingController controller, {required bool isNio}) {
    return TextField(
      key: Key(isNio ? 'cash_movement_nio_input' : 'cash_movement_usd_input'),
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: isNio ? 'Monto C\$' : 'Monto USD',
        prefixText: isNio ? 'C\$ ' : '\$ ',
        hintText: '0.00',
        border: const OutlineInputBorder(),
        isDense: true,
      ),
    );
  }
}
