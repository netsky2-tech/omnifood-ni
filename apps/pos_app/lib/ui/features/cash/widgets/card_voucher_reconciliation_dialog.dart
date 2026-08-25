import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../card_voucher_reconciliation_view_model.dart';
import '../../../../data/models/sales/payment_entity.dart';

class CardVoucherReconciliationDialog extends StatefulWidget {
  const CardVoucherReconciliationDialog({super.key});

  @override
  State<CardVoucherReconciliationDialog> createState() =>
      _CardVoucherReconciliationDialogState();
}

class _CardVoucherReconciliationDialogState
    extends State<CardVoucherReconciliationDialog> {
  final Map<String, TextEditingController> _codeControllers = {};
  final Map<String, TextEditingController> _batchControllers = {};
  final Map<String, TextEditingController> _last4Controllers = {};

  @override
  void dispose() {
    for (final c in _codeControllers.values) {
      c.dispose();
    }
    for (final c in _batchControllers.values) {
      c.dispose();
    }
    for (final c in _last4Controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _getCodeController(String id) {
    return _codeControllers.putIfAbsent(id, () => TextEditingController());
  }

  TextEditingController _getBatchController(String id) {
    return _batchControllers.putIfAbsent(id, () => TextEditingController());
  }

  TextEditingController _getLast4Controller(String id) {
    return _last4Controllers.putIfAbsent(id, () => TextEditingController());
  }

  Future<void> _showOverrideDialog(BuildContext context, PaymentEntity payment) async {
    final reasonController = TextEditingController();
    final supervisorController = TextEditingController();

    await showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Autorización de Voucher Extraviado'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Si el voucher físico del datáfono se extravió o dañó, se requiere justificación y autorización de un supervisor para emitir el Corte Z.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('override_reason_field'),
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Motivo / Justificación',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('override_supervisor_field'),
              controller: supervisorController,
              decoration: const InputDecoration(
                labelText: 'ID / Usuario Supervisor',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('CANCELAR'),
          ),
          FilledButton(
            key: const Key('btn_submit_override'),
            onPressed: () async {
              if (reasonController.text.trim().isEmpty ||
                  supervisorController.text.trim().isEmpty) {
                return;
              }
              FocusScope.of(dialogCtx).unfocus();
              final vm = context.read<CardVoucherReconciliationViewModel>();
              final ok = await vm.overrideMissingVoucher(
                paymentId: payment.id,
                reason: reasonController.text.trim(),
                supervisorId: supervisorController.text.trim(),
              );
              if (ok && mounted) {
                Navigator.of(dialogCtx).pop();
              }
            },
            child: const Text('AUTORIZAR OVERRIDE'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<CardVoucherReconciliationViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: colorScheme.primary, width: 2),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(Icons.receipt_long, color: colorScheme.primary),
                      const SizedBox(width: 8),
                      Text(
                        'Reconciliación de Vouchers',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Digite los códigos de autorización de los comprobantes emitidos por los datáfonos físicos antes de emitir el Corte Z.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
              ),
              const Divider(height: 20),

              // Error banner if any
              if (viewModel.errorMessage != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: Text(
                    viewModel.errorMessage!,
                    style: TextStyle(color: Colors.red.shade800, fontSize: 12),
                  ),
                ),

              // Vouchers list or Empty state
              if (viewModel.pendingVouchers.isEmpty)
                _buildAllReconciledState(context)
              else
                ...viewModel.pendingVouchers.map(
                  (payment) => _buildVoucherCard(context, viewModel, payment),
                ),

              const SizedBox(height: 12),

              // Footer close button
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  FilledButton.tonal(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('CERRAR'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAllReconciledState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle, color: Colors.green.shade600, size: 56),
            const SizedBox(height: 12),
            const Text(
              '¡Todos los vouchers han sido conciliados!',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'No hay transacciones con tarjeta pendientes. La caja está lista para emitir el Corte Z Fiscal.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVoucherCard(
    BuildContext context,
    CardVoucherReconciliationViewModel viewModel,
    PaymentEntity payment,
  ) {
    final codeCtrl = _getCodeController(payment.id);
    final batchCtrl = _getBatchController(payment.id);
    final last4Ctrl = _getLast4Controller(payment.id);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Row 1: Badges & Amount
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      Chip(
                        visualDensity: VisualDensity.compact,
                        label: Text(payment.bankPos ?? 'BAC',
                            style: const TextStyle(fontWeight: FontWeight.bold)),
                        backgroundColor: Colors.indigo.shade50,
                      ),
                      Chip(
                        visualDensity: VisualDensity.compact,
                        label: Text(payment.cardBrand ?? 'VISA'),
                      ),
                      if (payment.cardType != null)
                        Chip(
                          visualDensity: VisualDensity.compact,
                          label: Text(payment.cardType!),
                        ),
                    ],
                  ),
                ),
                Text(
                  'C\$ ${payment.amountNio.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: Colors.blueAccent,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Row 2: Inputs for authorization code, batch, last4
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    key: Key('voucher_code_input_${payment.id}'),
                    controller: codeCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Cód. Autorización (6 dígitos)',
                      hintText: '123456',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: batchCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Lote / Batch',
                      hintText: '001',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: last4Ctrl,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    decoration: const InputDecoration(
                      labelText: 'Últimos 4',
                      hintText: '4321',
                      border: OutlineInputBorder(),
                      isDense: true,
                      counterText: '',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Row 3: Action Buttons (Conciliar vs Override)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton.icon(
                  key: Key('btn_override_${payment.id}'),
                  icon: const Icon(Icons.warning_amber, size: 16, color: Colors.amber),
                  label: const Text('Extraviado (Override)',
                      style: TextStyle(color: Colors.amber, fontSize: 12)),
                  onPressed: () => _showOverrideDialog(context, payment),
                ),
                FilledButton.icon(
                  key: Key('btn_reconcile_${payment.id}'),
                  icon: const Icon(Icons.check, size: 16),
                  label: const Text('CONCILIAR'),
                  onPressed: () async {
                    if (codeCtrl.text.trim().isEmpty) return;
                    FocusScope.of(context).unfocus();
                    await viewModel.reconcileVoucher(
                      paymentId: payment.id,
                      voucherCode: codeCtrl.text.trim(),
                      batchNumber: batchCtrl.text.trim(),
                      last4: last4Ctrl.text.trim(),
                    );
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
