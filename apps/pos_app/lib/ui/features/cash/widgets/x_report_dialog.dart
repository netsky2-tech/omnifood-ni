import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../../../../data/models/sales/cashier_session_entity.dart';
import '../../../../data/models/sales/cash_movement_entity.dart';
import '../../../design_system/nhilos_tokens.dart';

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

  const XReportDialog({
    super.key,
    required this.shift,
    required this.movements,
    required this.effectiveExpectedNio,
    required this.effectiveExpectedUsd,
    this.cashierName,
  });

  String _formatNio(double amount) => 'C\$ ${amount.toStringAsFixed(2)}';
  String _formatUsd(double amount) => '\$ ${amount.toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final openedDate = DateTime.fromMillisecondsSinceEpoch(shift.openedAt);
    final nowStr = DateFormat('dd/MM/yyyy HH:mm:ss').format(DateTime.now());
    final openedStr = DateFormat('dd/MM/yyyy HH:mm:ss').format(openedDate);

    double totalInNio = 0.0;
    double totalInUsd = 0.0;
    double totalOutNio = 0.0;
    double totalOutUsd = 0.0;

    for (final m in movements) {
      if (m.type == 'CASH_IN') {
        totalInNio += m.amountNio;
        totalInUsd += m.amountUsd;
      } else {
        totalOutNio += m.amountNio;
        totalOutUsd += m.amountUsd;
      }
    }

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
