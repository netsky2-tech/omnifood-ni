import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../../../../data/models/sales/cashier_session_entity.dart';
import '../../../../data/models/sales/cash_movement_entity.dart';
import '../../../design_system/nhilos_tokens.dart';

/// Round-2 P6b: manual cash movements split into ingresos and egresos.
///
/// `CASH_IN` is the only ingreso; a petty-cash expense, a safe drop and a
/// cash-out all leave the drawer. The owner decision of 2026-10-10 routes a
/// CUOTA_FIJA out-of-date administrative refund through a petty-cash expense,
/// so that movement MUST reduce the expected cash — never add to it.
({double inNio, double inUsd, double outNio, double outUsd})
    splitMovementTotals(List<CashMovementEntity> movements) {
  double inNio = 0.0;
  double inUsd = 0.0;
  double outNio = 0.0;
  double outUsd = 0.0;
  for (final m in movements) {
    if (m.type == 'CASH_IN') {
      inNio += m.amountNio;
      inUsd += m.amountUsd;
    } else {
      outNio += m.amountNio;
      outUsd += m.amountUsd;
    }
  }
  return (inNio: inNio, inUsd: inUsd, outNio: outNio, outUsd: outUsd);
}

class XReportDialog extends StatelessWidget {
  final CashierSessionEntity shift;
  final List<CashMovementEntity> movements;

  /// D-9: opening float + manual movements + this shift's net cash sales, as
  /// computed by `CashShiftViewModel.effectiveExpectedNio/Usd`. The raw
  /// `shift.expectedNio/Usd` only carries the float and the manual movements,
  /// so reporting it made the X understate the drawer by every cash sale.
  final double effectiveExpectedNio;
  final double effectiveExpectedUsd;

  /// D-14: the cashier's resolved display name. The caller (CashShiftView,
  /// via the view model's id→name map) resolves it; when absent the dialog
  /// renders the honest fallback label, never the raw user id.
  final String? cashierName;

  /// T9 (cuentas abiertas): informational only. Open accounts never reached
  /// an invoice, so they are not in the drawer expectation above — but the
  /// operator doing a mid-shift reading must see them. The X never blocks
  /// on them (it writes nothing); the hard block lives in the Corte Z flow.
  final int openAccountsCount;
  final double openAccountsTotalNio;

  /// Fail-closed representation (R1-stale-open-accounts-init, slice F5):
  /// true only when the caller's open-account read SUCCEEDED. Defaults to
  /// FALSE (UNVERIFIED) so an omitted argument can never render a clean
  /// report that implies "no open accounts" — the safest default is the
  /// one that admits it does not know, same posture as the view model's
  /// nullable `_openAccounts` and the close gate's fail-closed re-query.
  final bool openAccountsVerified;

  const XReportDialog({
    super.key,
    required this.shift,
    required this.movements,
    required this.effectiveExpectedNio,
    required this.effectiveExpectedUsd,
    this.cashierName,
    this.openAccountsCount = 0,
    this.openAccountsTotalNio = 0.0,
    this.openAccountsVerified = false,
  });

  String _formatNio(double amount) => 'C\$ ${amount.toStringAsFixed(2)}';
  String _formatUsd(double amount) => '\$ ${amount.toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final openedDate = DateTime.fromMillisecondsSinceEpoch(shift.openedAt);
    final nowStr = DateFormat('dd/MM/yyyy HH:mm:ss').format(DateTime.now());
    final openedStr = DateFormat('dd/MM/yyyy HH:mm:ss').format(openedDate);

    final (
      inNio: totalInNio,
      inUsd: totalInUsd,
      outNio: totalOutNio,
      outUsd: totalOutUsd,
    ) = splitMovementTotals(movements);

    return AlertDialog(
      shape: const RoundedRectangleBorder(
        borderRadius: NhilosRadii.modalRadius,
      ),
      title: const Row(
        children: [
          Icon(Icons.assessment_outlined, color: NhilosColors.brandPrimary),
          SizedBox(width: 8),
          Expanded(child: Text('Lectura Parcial (Corte X)')),
        ],
      ),
      content: SingleChildScrollView(
        child: SizedBox(
          width: 480,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: NhilosColors.neutralGray,
                  borderRadius: NhilosRadii.buttonRadius,
                  border: Border.all(color: NhilosColors.border),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: NhilosColors.brandPrimary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'CORTE X (TURNO EN CURSO)',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 11,
                            ),
                          ),
                        ),
                        Text(
                          nowStr,
                          style: const TextStyle(
                              fontSize: 11, color: NhilosColors.textSecondary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _buildRow('Terminal POS', shift.terminalId),
                    // D-14: a person's name where the id used to be shown.
                    _buildRow('Cajero', cashierName ?? kUnresolvedUserNameLabel),
                    _buildRow('Fecha/Hora Apertura', openedStr),
                    // T9 (cuentas abiertas): same row language as the rows
                    // above, fed by the same loader the close gate uses —
                    // exactly one source of truth. Fail closed: an
                    // UNVERIFIED state renders the honest "could not
                    // verify" row (tone of the Corte Z block copy), never
                    // an absent row that would read as "no open accounts";
                    // only a VERIFIED read may render the count or stay
                    // silent on zero.
                    if (!openAccountsVerified)
                      _buildRow('Cuentas abiertas', 'No se pudieron verificar')
                    else if (openAccountsCount > 0)
                      _buildRow(
                        'Cuentas abiertas',
                        '$openAccountsCount · ${_formatNio(openAccountsTotalNio)}',
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Resumen de Flujo de Gaveta en Tiempo Real',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
              const SizedBox(height: 8),
              Table(
                border: TableBorder.all(color: NhilosColors.border),
                children: [
                  TableRow(
                    decoration: const BoxDecoration(color: NhilosColors.neutralGray),
                    children: const [
                      Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('Concepto', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      ),
                      Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('Córdobas (NIO)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      ),
                      Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('Dólares (USD)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('Fondo Inicial', style: TextStyle(fontSize: 12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatNio(shift.openingBalanceNio), style: const TextStyle(fontSize: 12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatUsd(shift.openingBalanceUsd), style: const TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('(+) Ingresos Manuales', style: TextStyle(fontSize: 12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatNio(totalInNio),
                            style: const TextStyle(
                                fontSize: 12, color: NhilosColors.success)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatUsd(totalInUsd),
                            style: const TextStyle(
                                fontSize: 12, color: NhilosColors.success)),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('(-) Egresos / Retiros', style: TextStyle(fontSize: 12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatNio(totalOutNio),
                            style: const TextStyle(
                                fontSize: 12, color: NhilosColors.danger)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatUsd(totalOutUsd),
                            style: const TextStyle(
                                fontSize: 12, color: NhilosColors.danger)),
                      ),
                    ],
                  ),
                  TableRow(
                    decoration: const BoxDecoration(color: NhilosColors.neutralGray),
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('(=) Esperado en Gaveta', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(
                          _formatNio(effectiveExpectedNio),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: NhilosColors.textPrimary,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(
                          _formatUsd(effectiveExpectedUsd),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: NhilosColors.textPrimary,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Nota: La lectura X es informativa y no cierra el turno de caja.',
                style: const TextStyle(
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                  color: NhilosColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(),
          style: ElevatedButton.styleFrom(
            backgroundColor: NhilosColors.brandPrimary,
            foregroundColor: Colors.white,
            shape: const RoundedRectangleBorder(
              borderRadius: NhilosRadii.buttonRadius,
            ),
          ),
          child: const Text('Cerrar Lectura'),
        ),
      ],
    );
  }

  Widget _buildRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 12, color: NhilosColors.textSecondary)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
