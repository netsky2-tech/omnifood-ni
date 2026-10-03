import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'cash_shift_view_model.dart';
import 'widgets/open_shift_dialog.dart';
import 'widgets/cash_movement_dialog.dart';
import 'widgets/close_shift_dialog.dart';
import 'widgets/z_report_dialog.dart';
import 'widgets/x_report_dialog.dart';
import '../../design_system/nhilos_tokens.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../../../../core/localization/label_map.dart';
import '../../../data/database/app_database.dart';

class CashShiftView extends StatefulWidget {
  const CashShiftView({super.key});

  @override
  State<CashShiftView> createState() => _CashShiftViewState();
}

class _CashShiftViewState extends State<CashShiftView> {
  String _formatNio(double amount) => 'C\$ ${amount.toStringAsFixed(2)}';
  String _formatUsd(double amount) => '\$ ${amount.toStringAsFixed(2)}';

  /// D-14: id→person-name map, built once per view load from the local
  /// users table (findAllUsers keeps INACTIVE users for historical
  /// attribution). Empty when the database is unavailable (isolated test
  /// harnesses); rows then render the honest fallback, never the raw id.
  Map<String, String> _usersById = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _loadUsers();
        final cashVm = context.read<CashShiftViewModel>();
        try {
          final saleVm = context.read<SaleViewModel>();
          if (saleVm.currentUserRole != null) {
            cashVm.setUserRole(saleVm.currentUserRole!);
          }
        } catch (_) {
          // SaleViewModel is optional when CashShiftView is mounted in isolated widget tests
        }
        cashVm.init();
      }
    });
  }

  Future<void> _loadUsers() async {
    try {
      final database = context.read<AppDatabase>();
      final users = await database.userDao.findAllUsers();
      if (mounted) {
        setState(() {
          _usersById = {for (final u in users) u.id: u.name};
        });
      }
    } catch (_) {
      // Fail honest: without a resolvable name the reports show the
      // fallback label, never the raw id.
      _usersById = const {};
    }
  }

  /// D-14: a person's name where an id used to be shown.
  String _userName(String? userId) => resolveUserName(userId, _usersById);

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<CashShiftViewModel>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Control de Caja y Turnos'),
        backgroundColor: NhilosColors.brandNavy,
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
            Icon(Icons.lock_clock, size: 72, color: NhilosColors.textMuted),
            const SizedBox(height: 16),
            const Text(
              'No hay turno de caja abierto',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Para procesar ventas y registrar movimientos, debes abrir un turno con el fondo inicial.',
              textAlign: TextAlign.center,
              style: TextStyle(color: NhilosColors.textSecondary),
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
                    backgroundColor: NhilosColors.brandPrimary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    textStyle: const TextStyle(fontSize: 16),
                    shape: const RoundedRectangleBorder(
                      borderRadius: NhilosRadii.buttonRadius,
                    ),
                  ),
                ),
                if (vm.lastClosedShift != null)
                  OutlinedButton.icon(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => ZReportDialog(
                        shift: vm.lastClosedShift!,
                        // D-14: person names, resolved from the id→name map
                        // built once per view load.
                        cashierName: _userName(vm.lastClosedShift!.userId),
                        supervisorName: vm.lastClosedShift!.supervisorId == null
                            ? null
                            : _userName(vm.lastClosedShift!.supervisorId),
                      ),
                    ),
                    icon: const Icon(Icons.receipt_long),
                    label: const Text('Ver Último Corte Z'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: NhilosColors.brandPrimary,
                      side: const BorderSide(color: NhilosColors.border),
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      textStyle: const TextStyle(fontSize: 16),
                      shape: const RoundedRectangleBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                      ),
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
                              color: NhilosColors.successLight,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Text(
                              'Turno Activo',
                              style: TextStyle(
                                color: NhilosColors.success,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Flexible(
                            child: Text(
                              'Terminal: ${shift.terminalId}',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        'Apertura: $formattedDate',
                        style: const TextStyle(
                            color: NhilosColors.textSecondary, fontSize: 13),
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
                              color: NhilosColors.brandPrimary,
                            ),
                          ),
                          SizedBox(
                            width: itemWidth,
                            child: _buildMetricTile(
                              title: 'Fondo Inicial (\$ USD)',
                              value: _formatUsd(shift.openingBalanceUsd),
                              icon: Icons.attach_money,
                              color: NhilosColors.brandNavy,
                            ),
                          ),
                          SizedBox(
                            width: itemWidth,
                            child: _buildMetricTile(
                              // D-9: the drawer expectation is the persisted base
                              // plus this shift's net cash sales. Showing the raw
                              // `shift.expectedNio` understated the drawer by every
                              // cash sale and made a blind count look short.
                              title: 'Esperado en Gaveta (C\$)',
                              value: _formatNio(vm.effectiveExpectedNio),
                              icon: Icons.payments,
                              color: NhilosColors.brandPrimary,
                            ),
                          ),
                          SizedBox(
                            width: itemWidth,
                            child: _buildMetricTile(
                              title: 'Esperado en Gaveta (\$ USD)',
                              value: _formatUsd(vm.effectiveExpectedUsd),
                              icon: Icons.monetization_on,
                              color: NhilosColors.brandNavy,
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
                color: NhilosColors.warningLight,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: NhilosColors.warningBorder, width: 1.5),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: NhilosColors.warning, size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '⚠️ ${vm.pendingVouchersCount} voucher${vm.pendingVouchersCount > 1 ? 's' : ''} de tarjeta pendiente${vm.pendingVouchersCount > 1 ? 's' : ''} de conciliar',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: NhilosColors.warning,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Debe ingresar los códigos de autorización bancarios antes de emitir el Corte Z.',
                          style: TextStyle(
                              fontSize: 12, color: NhilosColors.warning),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: () => openVoucherReconciliationDialog(context, vm),
                    icon: const Icon(Icons.receipt_long, size: 16),
                    label: const Text('Conciliar Vouchers'),
                    style: FilledButton.styleFrom(
                      backgroundColor: NhilosColors.warning,
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
                      onPressed: () => openVoucherReconciliationDialog(context, vm),
                      icon: const Icon(Icons.receipt_long),
                      label: Text(vm.hasPendingVouchers
                          ? 'Vouchers (${vm.pendingVouchersCount})'
                          : 'Vouchers'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: vm.hasPendingVouchers
                            ? NhilosColors.warning
                            : NhilosColors.brandPrimary,
                      ),
                    ),
                  OutlinedButton.icon(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => XReportDialog(
                        shift: shift,
                        movements: vm.movements,
                        // D-14: person name, resolved from the id→name map.
                        cashierName: _userName(shift.userId),
                        // D-9: the X must report the same expectation the
                        // blind count and the Z close use.
                        effectiveExpectedNio: vm.effectiveExpectedNio,
                        effectiveExpectedUsd: vm.effectiveExpectedUsd,
                        // T9 (cuentas abiertas): informational line, fed by
                        // the same loader the Z gate re-checks.
                        openAccountsCount: vm.openAccountsCount,
                        openAccountsTotalNio: vm.openAccountsTotalNio,
                      ),
                    ),
                    icon: const Icon(Icons.assessment_outlined),
                    label: const Text('Lectura Parcial (Corte X)'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: NhilosColors.brandPrimary,
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
                      backgroundColor: NhilosColors.brandPrimary,
                      foregroundColor: Colors.white,
                      shape: const RoundedRectangleBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                      ),
                    ),
                  ),
                  ElevatedButton.icon(
                    // T7 (unified close): the pre-gate + dialog live in
                    // showCloseShiftFlow so the sale screen's ⋮ Cerrar Caja
                    // entry runs the exact same Corte Z flow.
                    onPressed: () => showCloseShiftFlow(context, vm),
                    icon: const Icon(Icons.lock),
                    label: const Text('Cerrar Turno (Corte Z)'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: NhilosColors.danger,
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
                    style: TextStyle(color: NhilosColors.textSecondary),
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
                                ? NhilosColors.successLight
                                : NhilosColors.dangerLight,
                            child: Icon(
                              isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                              color: isCredit
                                  ? NhilosColors.success
                                  : NhilosColors.danger,
                            ),
                          ),
                          title: Text(
                            mov.reason,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle:
                              Text('Tipo: ${localize(mov.type, kCashMovementTypeLabels)} • Hora: $timeStr'),
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
                                        ? NhilosColors.success
                                        : NhilosColors.danger,
                                  ),
                                ),
                              if (mov.amountUsd > 0)
                                Text(
                                  '${isCredit ? "+" : "-"}${_formatUsd(mov.amountUsd)}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isCredit
                                        ? NhilosColors.success
                                        : NhilosColors.danger,
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
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
