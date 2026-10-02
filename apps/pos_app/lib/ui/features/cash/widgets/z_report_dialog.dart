import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../../../../data/models/sales/cashier_session_entity.dart';
import '../../../design_system/nhilos_tokens.dart';

class ZReportDialog extends StatelessWidget {
  final CashierSessionEntity shift;

  /// D-14: resolved person names (see XReportDialog). When absent, the
  /// honest fallback label renders — never the raw user id.
  final String? cashierName;
  final String? supervisorName;

  const ZReportDialog({
    super.key,
    required this.shift,
    this.cashierName,
    this.supervisorName,
  });

  String _formatNio(double amount) => 'C\$ ${amount.toStringAsFixed(2)}';
  String _formatUsd(double amount) => '\$ ${amount.toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final openedDate = DateTime.fromMillisecondsSinceEpoch(shift.openedAt);
    final closedDate = shift.closedAt != null
        ? DateTime.fromMillisecondsSinceEpoch(shift.closedAt!)
        : DateTime.now();

    final openedStr = DateFormat('dd/MM/yyyy HH:mm:ss').format(openedDate);
    final closedStr = DateFormat('dd/MM/yyyy HH:mm:ss').format(closedDate);

    final diffNio = shift.differenceNio ?? 0.0;
    final diffUsd = shift.differenceUsd ?? 0.0;
    final zSeq = shift.zReportSequence != null
        ? 'Z-${shift.zReportSequence.toString().padLeft(4, "0")}'
        : 'Z-PENDIENTE';

    return AlertDialog(
      shape: const RoundedRectangleBorder(
        borderRadius: NhilosRadii.modalRadius,
      ),
      title: Row(
        children: [
          const Icon(Icons.receipt_long, color: NhilosColors.brandPrimary),
          const SizedBox(width: 8),
          Expanded(child: Text('Reporte Fiscal Corte $zSeq')),
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
                    _buildRow('Correlativo Fiscal DGI', zSeq, isBold: true),
                    _buildRow('Terminal POS', shift.terminalId),
                    // D-14: a person's name where the id used to be shown.
                    _buildRow('Cajero', cashierName ?? kUnresolvedUserNameLabel),
                    _buildRow('Fecha Apertura', openedStr),
                    _buildRow('Fecha Cierre', closedStr),
                    if (shift.supervisorId != null)
                      _buildRow(
                          'Supervisor',
                          supervisorName ??
                              kUnresolvedSupervisorNameLabel),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Arqueo de Efectivo y Varianzas',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
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
                        child: Text('Saldo Esperado', style: TextStyle(fontSize: 12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatNio(shift.expectedNio), style: const TextStyle(fontSize: 12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatUsd(shift.expectedUsd), style: const TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('Conteo Ciego', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatNio(shift.closingCountedNio ?? 0.0), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatUsd(shift.closingCountedUsd ?? 0.0), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                  TableRow(
                    decoration: BoxDecoration(
                      color: (diffNio != 0 || diffUsd != 0)
                          ? (diffNio < 0 || diffUsd < 0
                              ? NhilosColors.dangerLight
                              : NhilosColors.successLight)
                          : Colors.transparent,
                    ),
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('Diferencia (Varianza)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(
                          _formatNio(diffNio),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: diffNio == 0
                                ? NhilosColors.textPrimary
                                : diffNio > 0
                                    ? NhilosColors.success
                                    : NhilosColors.danger,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(
                          _formatUsd(diffUsd),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: diffUsd == 0
                                ? NhilosColors.textPrimary
                                : diffUsd > 0
                                    ? NhilosColors.success
                                    : NhilosColors.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              if (shift.notes != null && shift.notes!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  'Notas: ${shift.notes}',
                  style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        ElevatedButton.icon(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.check),
          label: const Text('Entendido / Cerrar Reporte'),
          style: ElevatedButton.styleFrom(
            backgroundColor: NhilosColors.brandPrimary,
            foregroundColor: Colors.white,
            shape: const RoundedRectangleBorder(
              borderRadius: NhilosRadii.buttonRadius,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRow(String label, String value, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 12, color: NhilosColors.textSecondary)),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
