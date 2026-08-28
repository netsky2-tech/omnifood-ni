import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'cash_shift_view_model.dart';
import 'card_voucher_reconciliation_view_model.dart';
import 'widgets/open_shift_dialog.dart';
import 'widgets/cash_movement_dialog.dart';
import 'widgets/close_shift_dialog.dart';
import 'widgets/z_report_dialog.dart';
import 'widgets/x_report_dialog.dart';
import 'widgets/card_voucher_reconciliation_dialog.dart';

class CashShiftView extends StatefulWidget {
  const CashShiftView({super.key});

  @override
  State<CashShiftView> createState() => _CashShiftViewState();
}

class _CashShiftViewState extends State<CashShiftView> {
  String _formatNio(double amount) => 'C\$ ${amount.toStringAsFixed(2)}';
  String _formatUsd(double amount) => '\$ ${amount.toStringAsFixed(2)}';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<CashShiftViewModel>().init();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<CashShiftViewModel>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Control de Caja y Turnos'),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => vm.init(),
            tooltip: 'Actualizar',
          ),
        ],
      ),
      body: vm.isLoading
          ? const Center(child: CircularProgressIndicator())
          : !vm.hasActiveShift
              ? _buildEmptyState(context, vm)
              : _buildActiveShiftView(context, vm),
    );
  }

  Widget _buildEmptyState(BuildContext context, CashShiftViewModel vm) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_clock, size: 72, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            const Text(
              'No hay turno de caja abierto',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Para procesar ventas y registrar movimientos, debes abrir un turno con el fondo inicial.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              alignment: WrapAlignment.center,
              children: [
                ElevatedButton.icon(
                  onPressed: () => showDialog<bool>(
                    context: context,
                    builder: (_) => ChangeNotifierProvider<CashShiftViewModel>.value(
                      value: vm,
                      child: const OpenShiftDialog(),
                    ),
                  ),
                  icon: const Icon(Icons.point_of_sale),
                  label: const Text('Abrir Turno de Caja'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.indigo,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    textStyle: const TextStyle(fontSize: 16),
                  ),
                ),
                if (vm.lastClosedShift != null)
                  OutlinedButton.icon(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => ZReportDialog(shift: vm.lastClosedShift!),
                    ),
                    icon: const Icon(Icons.receipt_long),
                    label: const Text('Ver Último Corte Z'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.indigo,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      textStyle: const TextStyle(fontSize: 16),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveShiftView(BuildContext context, CashShiftViewModel vm) {
    final shift = vm.activeShift!;
    final openedDate = DateTime.fromMillisecondsSinceEpoch(shift.openedAt);
    final formattedDate =
        DateFormat('dd/MM/yyyy HH:mm:ss').format(openedDate);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header card
          Card(
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.green.shade100,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Text(
                              'Turno Activo',
                              style: TextStyle(
                                color: Colors.green,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Terminal: ${shift.terminalId}',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      Text(
                        'Apertura: $formattedDate',
                        style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final itemWidth = constraints.maxWidth > 600
                          ? (constraints.maxWidth - 36) / 4
                          : (constraints.maxWidth - 12) / 2;
                      return Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          SizedBox(
                            width: itemWidth,
                            child: _buildMetricTile(
                              title: 'Fondo Inicial (C\$)',
                              value: _formatNio(shift.openingBalanceNio),
                              icon: Icons.account_balance_wallet,
                              color: Colors.blue.shade700,
                            ),
                          ),
                          SizedBox(
                            width: itemWidth,
                            child: _buildMetricTile(
                              title: 'Fondo Inicial (\$ USD)',
                              value: _formatUsd(shift.openingBalanceUsd),
                              icon: Icons.attach_money,
                              color: Colors.teal.shade700,
                            ),
                          ),
                          SizedBox(
                            width: itemWidth,
                            child: _buildMetricTile(
                              title: 'Esperado en Gaveta (C\$)',
                              value: _formatNio(shift.expectedNio),
                              icon: Icons.payments,
                              color: Colors.indigo.shade700,
                            ),
                          ),
                          SizedBox(
                            width: itemWidth,
                            child: _buildMetricTile(
                              title: 'Esperado en Gaveta (\$ USD)',
                              value: _formatUsd(shift.expectedUsd),
                              icon: Icons.monetization_on,
                              color: Colors.purple.shade700,
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          // Pending card vouchers warning banner
          if (vm.hasPendingVouchers)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.shade400, width: 1.5),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_rounded,
                      color: Colors.amber.shade900, size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '⚠️ ${vm.pendingVouchersCount} voucher${vm.pendingVouchersCount > 1 ? 's' : ''} de tarjeta pendiente${vm.pendingVouchersCount > 1 ? 's' : ''} de conciliar',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.amber.shade900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Debe ingresar los códigos de autorización bancarios antes de emitir el Corte Z.',
                          style: TextStyle(
                              fontSize: 12, color: Colors.amber.shade900),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: () => _openVoucherReconciliationDialog(context, vm),
                    icon: const Icon(Icons.receipt_long, size: 16),
                    label: const Text('Conciliar Vouchers'),
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.amber.shade800,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            ),

          // Action bar
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              const Text(
                'Historial de Movimientos de Caja',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (vm.paymentDao != null)
                    OutlinedButton.icon(
                      onPressed: () =>
                          _openVoucherReconciliationDialog(context, vm),
                      icon: const Icon(Icons.receipt_long),
                      label: Text(vm.hasPendingVouchers
                          ? 'Vouchers (${vm.pendingVouchersCount})'
                          : 'Vouchers'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: vm.hasPendingVouchers
                            ? Colors.amber.shade900
                            : Colors.indigo,
                      ),
                    ),
                  OutlinedButton.icon(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => XReportDialog(
                        shift: shift,
                        movements: vm.movements,
                      ),
                    ),
                    icon: const Icon(Icons.assessment_outlined),
                    label: const Text('Lectura Parcial (Corte X)'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.indigo,
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: () => showDialog<bool>(
                      context: context,
                      builder: (_) => ChangeNotifierProvider<CashShiftViewModel>.value(
                        value: vm,
                        child: const CashMovementDialog(),
                      ),
                    ),
                    icon: const Icon(Icons.add),
                    label: const Text('Registrar Movimiento'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.indigo,
                      foregroundColor: Colors.white,
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: () async {
                      if (vm.hasPendingVouchers) {
                        final goToReconcile = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Bloqueo de Corte Z Fiscal'),
                            content: Text(
                              'Existen ${vm.pendingVouchersCount} vouchers de datáfono en estado PENDIENTE.\n\nPor disposición de control fiscal y auditoría, debe conciliar o autorizar el override de todos los vouchers antes de emitir el Reporte Z.',
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.of(ctx).pop(false),
                                child: const Text('CANCELAR'),
                              ),
                              FilledButton(
                                onPressed: () => Navigator.of(ctx).pop(true),
                                child: const Text('IR A RECONCILIACIÓN'),
                              ),
                            ],
                          ),
                        );
                        if (goToReconcile == true && context.mounted) {
                          _openVoucherReconciliationDialog(context, vm);
                        }
                        return;
                      }

                      showDialog<bool>(
                        context: context,
                        builder: (_) => ChangeNotifierProvider<CashShiftViewModel>.value(
                          value: vm,
                          child: const CloseShiftDialog(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.lock),
                    label: const Text('Cerrar Turno (Corte Z)'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Movements list
          if (vm.movements.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Center(
                  child: Text(
                    'No hay movimientos de efectivo registrados en este turno.',
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                ),
              ),
            )
          else
            Card(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
              child: Column(
                children: [
                  for (int index = 0; index < vm.movements.length; index++) ...[
                    if (index > 0) const Divider(height: 1),
                    Builder(
                      builder: (context) {
                        final mov = vm.movements[index];
                        final isCredit = mov.type == 'CASH_IN';
                        final date =
                            DateTime.fromMillisecondsSinceEpoch(mov.timestamp);
                        final timeStr = DateFormat('HH:mm:ss').format(date);

                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: isCredit
                                ? Colors.green.shade100
                                : Colors.red.shade100,
                            child: Icon(
                              isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                              color: isCredit ? Colors.green : Colors.red,
                            ),
                          ),
                          title: Text(
                            mov.reason,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text('Tipo: ${mov.type} • Hora: $timeStr'),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              if (mov.amountNio > 0)
                                Text(
                                  '${isCredit ? "+" : "-"}${_formatNio(mov.amountNio)}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isCredit
                                        ? Colors.green.shade800
                                        : Colors.red.shade800,
                                  ),
                                ),
                              if (mov.amountUsd > 0)
                                Text(
                                  '${isCredit ? "+" : "-"}${_formatUsd(mov.amountUsd)}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isCredit
                                        ? Colors.green.shade800
                                        : Colors.red.shade800,
                                  ),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _openVoucherReconciliationDialog(
      BuildContext context, CashShiftViewModel vm) {
    if (vm.paymentDao == null) return;
    showDialog<void>(
      context: context,
      builder: (_) => ChangeNotifierProvider<CardVoucherReconciliationViewModel>(
        create: (_) => CardVoucherReconciliationViewModel(
          paymentDao: vm.paymentDao!,
          currentUserId: vm.currentUserId,
        )..loadPendingVouchers(),
        child: const CardVoucherReconciliationDialog(),
      ),
    ).then((_) => vm.refreshPendingVouchersCount());
  }

  Widget _buildMetricTile({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
