import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../design_system/responsive_layout.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../../../../domain/models/sales/cart_item.dart';
import '../../../../domain/models/sales/hold_ticket.dart';
import '../../../../domain/services/sales/waiter_settlement_service.dart';
import '../cash_shift_view_model.dart';
import '../card_voucher_reconciliation_view_model.dart';
import 'card_voucher_reconciliation_dialog.dart';
import 'z_report_dialog.dart';
import '../../../design_system/nhilos_tokens.dart';
import '../../../../presentation/features/sales/view_models/sale_view_model.dart';

/// T7 (unified close): THE single Corte Z close entry point. Both the
/// Control de Caja button and the sale screen's ⋮ Cerrar Caja (after its
/// supervisor override) run this identical pre-gate + dialog, so the weak
/// parallel close (CloseBoxDialog / SaleViewModel.closeSession) cannot
/// bypass the pending-voucher fiscal gate anymore.
///
/// The cash VM is re-synced from the database first ([CashShiftViewModel.init])
/// so the gate and the dialog see the shift and voucher state as of NOW,
/// not as of the last screen load.
Future<void> showCloseShiftFlow(
  BuildContext context,
  CashShiftViewModel vm,
) async {
  await vm.init();
  if (!context.mounted) return;

  // T8 (INV-16.5): hard block — no Corte Z while open accounts exist.
  // Deliberate order: accounts BEFORE the pending-voucher gate below,
  // because resolving a tab paid by card creates a pending voucher — the
  // operator clears accounts first and then reconciles the vouchers that
  // action produced. Hard block: no supervisor override, no bypass, no
  // "close anyway" — the only way through is to resolve the accounts.
  // R1-stale-open-accounts-init (native review, slice F5): if init could
  // not verify the open-account state, the pre-gate must not fall through
  // as if it had verified "no open accounts" — same fail-closed posture
  // as the VM's close gate. Checked BEFORE the hasOpenAccounts branch.
  if (!vm.openAccountsVerified) {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Bloqueo de Corte Z — Cuentas Abiertas'),
        content: const Text(
          'No se pudieron verificar las cuentas abiertas de esta terminal.\n\n'
          'Por disposición de control fiscal (INV-16.5), sin verificación no se emite Reporte Z. Intente de nuevo.',
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('ENTENDIDO'),
          ),
        ],
      ),
    );
    return;
  }

  if (vm.hasOpenAccounts) {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Bloqueo de Corte Z — Cuentas Abiertas'),
        content: Text(openAccountsBlockMessage(vm.openAccounts)),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('ENTENDIDO'),
          ),
        ],
      ),
    );
    return;
  }

  // Invariante Fiscal DGI: no Corte Z with pending card vouchers.
  if (vm.hasPendingVouchers) {
    final goToReconcile = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Bloqueo de Corte Z Fiscal'),
        content: Text(
          // Round-2 F-5a: one voucher is not "Existen 1 vouchers".
          '${vm.pendingVouchersCount == 1 ? 'Existe 1 voucher' : 'Existen ${vm.pendingVouchersCount} vouchers'} de datáfono en estado PENDIENTE.\n\nPor disposición de control fiscal y auditoría, debe conciliar o autorizar el override de todos los vouchers antes de emitir el Reporte Z.',
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
    if (goToReconcile != true) return;
    if (!context.mounted) return;
    await openVoucherReconciliationDialog(context, vm);
    // Issue #74: re-evaluate the fiscal gate against the LIVE count — each
    // successful in-dialog resolution already refreshed the parent VM, so
    // if the operator reconciled/overrode every voucher inside the dialog
    // they proceed straight to the blind count WITHOUT dismissing and
    // re-entering the whole close flow. Vouchers still pending → back out;
    // the operator can re-enter (the gate re-reads on every invocation).
    if (vm.hasPendingVouchers) return;
  }

  await showDialog<bool>(
    context: context,
    builder: (_) => ChangeNotifierProvider<CashShiftViewModel>.value(
      value: vm,
      child: const CloseShiftDialog(),
    ),
  );
}

/// T8: the operator-facing block message for open accounts. Names each
/// account with its line count and total, states that nothing is invoiced
/// and no Z is emitted while accounts remain open, and tells the operator
/// exactly what to do (Ventas en Espera — cobrar o abandonar). No
/// continuation is offered anywhere this message is shown.
String openAccountsBlockMessage(List<HoldTicket> accounts) {
  final lines = accounts.map((a) {
    final total = a.items.fold<double>(0, (sum, i) => sum + i.grossAmount);
    final n = a.items.length;
    return '• ${a.name} — $n ${n == 1 ? 'línea' : 'líneas'} · C\$ ${total.toStringAsFixed(2)}';
  }).join('\n');
  return 'Existen ${accounts.length} '
      '${accounts.length == 1 ? 'cuenta abierta' : 'cuentas abiertas'} '
      'en esta terminal:\n\n'
      '$lines\n\n'
      'Por disposición de control fiscal (INV-16.5), mientras haya cuentas '
      'abiertas no se factura nada y no se emite Reporte Z.\n\n'
      'Resuelva cada cuenta en Ventas en Espera: cóbrela o abandónela. '
      'Abandonar la descarta definitivamente: no se puede deshacer. '
      'Luego vuelva a intentar el cierre.';
}

/// Opens the voucher reconciliation dialog for [vm]'s payment DAO. The
/// pending-voucher count refreshes after EACH successful in-dialog
/// resolution (Issue #74) and once more on close (idempotent safety net).
Future<void> openVoucherReconciliationDialog(
  BuildContext context,
  CashShiftViewModel vm,
) async {
  if (vm.paymentDao == null) return;
  // Reconcile-time identity fix: resolve the acting user with the SAME
  // per-action resolver open/close use, instead of the raw constructor
  // field (which the production wiring in main.dart leaves empty — that
  // empty id is what the backend rejected with 'reconciledByUserId should
  // not be empty'). When nobody can be resolved the child VM receives ''
  // and REFUSES every identity-stamped write, so no row is ever persisted
  // with an empty reconciledByUserId.
  final actingUserId = await vm.resolveActingUserId();
  await showDialog<void>(
    context: context,
    builder: (_) => ChangeNotifierProvider<CardVoucherReconciliationViewModel>(
      create: (_) => CardVoucherReconciliationViewModel(
        paymentDao: vm.paymentDao!,
        currentUserId: actingUserId ?? '',
        // Issue #74: refresh the parent count after EACH successful
        // resolution while the dialog is still open, so the pending-voucher
        // badge, the 'Vouchers (n)' label and the fiscal gate reflect the
        // live state. The `.then(...)` below stays as an idempotent
        // close-time safety net — no longer the only mechanism.
        onVoucherResolved: () => vm.refreshPendingVouchersCount(),
      )..loadPendingVouchers(),
      child: const CardVoucherReconciliationDialog(),
    ),
  ).then((_) => vm.refreshPendingVouchersCount());
}

class CloseShiftDialog extends StatefulWidget {
  const CloseShiftDialog({super.key, this.usersById = const {}});

  final Map<String, String> usersById;

  @override
  State<CloseShiftDialog> createState() => _CloseShiftDialogState();
}

class _CloseShiftDialogState extends State<CloseShiftDialog> {
  // D-16: start EMPTY so the counted amount REPLACES nothing instead of
  // concatenating onto a seeded '0.00' (the blind count is exactly where a
  // silent digit error corrupts the Z discrepancy).
  final _nioCountedController = TextEditingController();
  final _usdCountedController = TextEditingController();
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

    // Issue #529: re-query the net cash sales before evaluating variance,
    // so sales recorded after the screen loaded are included and the
    // difference that gets RECORDED is honest.
    await vm.refreshSalesCash();

    // D-15 (owner decision, 2026-10-02): closing with any difference is
    // allowed — no threshold, no PIN, no authorization. The requirement is
    // that the difference is recorded (difference_nio / Z variance / cloud),
    // which closeShiftWithBlindCount already does. The old
    // `hasHighVariance > 100 C$ / 5 USD` branch only stamped the fabricated
    // id 'supervisor-auth' — a nonexistent actor dressed as an
    // authorization (same defect class as D-13). Nobody authorizes here,
    // so supervisorId is always null and the shift carries no fake stamp.
    setState(() {
      _submitting = true;
      _error = null;
    });

    bool success;
    try {
      success = await vm.closeShiftWithBlindCount(
        countedNio: countedNio,
        countedUsd: countedUsd,
        notes: _notesController.text.trim().isNotEmpty
            ? _notesController.text.trim()
            : null,
        supervisorId: null,
      );
    } on OpenTablesPendingException catch (e) {
      // T8 stale-read defence: an account parked between the pre-gate and
      // this write resurfaces HERE, at the VM's fresh re-check. Same block,
      // same copy, and still no continuation.
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.openAccounts.isEmpty
            ? 'Existen cuentas abiertas. Resuélvalas en Ventas en Espera antes de emitir el Corte Z.'
            : openAccountsBlockMessage(e.openAccounts);
      });
      return;
    }

    if (mounted) {
      if (success) {
        try {
          context.read<SaleViewModel>().checkActiveSession();
        } catch (_) {}
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop(true);
        }
        if (vm.lastClosedShift != null) {
          // R-18: the Z report must carry the same resolved person names the
          // standalone 'Ver Último Corte Z' site passes (D-14). The dialog
          // itself keeps the honest fallback contract for unresolvable ids.
          final shift = vm.lastClosedShift!;
          showDialog<void>(
            context: context,
            builder: (_) => ZReportDialog(
              shift: shift,
              cashierName: resolveUserName(shift.userId, widget.usersById),
              supervisorName: shift.supervisorId == null
                  ? null
                  : resolveUserName(shift.supervisorId, widget.usersById),
            ),
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
    // D-20: on handheld widths the two money fields must NOT share a row —
    // a cramped half-width field truncates the label tail, which is exactly
    // the currency marker the operator needs to see. Same isHandheld switch
    // used by MultiCurrencyCheckoutDialog and the search dialog in sale_view.
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);
    return AlertDialog(
      shape: const RoundedRectangleBorder(
        borderRadius: NhilosRadii.modalRadius,
      ),
      title: const Row(
        children: [
          Icon(Icons.point_of_sale_outlined, color: NhilosColors.brandPrimary),
          SizedBox(width: 8),
          Expanded(child: Text('Arqueo Ciego y Cierre de Turno')),
        ],
      ),
      content: SingleChildScrollView(
        child: SizedBox(
          width: isHandheld ? double.infinity : 480,
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
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: NhilosColors.warningLight,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: NhilosColors.warningBorder),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.visibility_off,
                        color: NhilosColors.warning, size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Arqueo Ciego: Cuenta el efectivo físico en gaveta e ingresa el monto total contado sin consultar el sistema.',
                        style: TextStyle(
                            fontSize: 12, color: NhilosColors.textPrimary),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              // D-20: short, symbol-FIRST labels ('C$ contado' / 'USD contado')
              // so the currency marker survives any truncation. Fields stack
              // on handheld widths instead of sharing a cramped row.
              if (isHandheld)
                Column(
                  children: [
                    _countedField(_nioCountedController, isNio: true),
                    const SizedBox(height: 12),
                    _countedField(_usdCountedController, isNio: false),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(child: _countedField(_nioCountedController, isNio: true)),
                    const SizedBox(width: 12),
                    Expanded(child: _countedField(_usdCountedController, isNio: false)),
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
            backgroundColor: NhilosColors.danger,
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

  // D-16 contract preserved: controllers start EMPTY, '0.00' is only a hint,
  // and validators/keyboard types are unchanged. Only the label wording and
  // the layout wrapper changed (D-20).
  Widget _countedField(TextEditingController controller, {required bool isNio}) {
    return TextField(
      key: Key(isNio ? 'close_shift_nio_counted_input' : 'close_shift_usd_counted_input'),
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: isNio ? 'C\$ contado' : 'USD contado',
        prefixText: isNio ? 'C\$ ' : '\$ ',
        hintText: '0.00',
        border: const OutlineInputBorder(),
        isDense: true,
      ),
    );
  }
}
