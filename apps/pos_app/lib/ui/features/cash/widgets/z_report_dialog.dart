import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../data/models/sales/cashier_session_entity.dart';

class ZReportDialog extends StatelessWidget {
  final CashierSessionEntity shift;

  const ZReportDialog({super.key, required this.shift});

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
      title: Row(
        children: [
          const Icon(Icons.receipt_long, color: Colors.indigo),
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
                  color: Colors.indigo.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.indigo.shade200),
                ),
                child: Column(
                  children: [
                    _buildRow('Correlativo Fiscal DGI', zSeq, isBold: true),
                    _buildRow('Terminal POS', shift.terminalId),
                    _buildRow('Cajero ID', shift.userId),
                    _buildRow('Fecha Apertura', openedStr),
                    _buildRow('Fecha Cierre', closedStr),
                    if (shift.supervisorId != null)
                      _buildRow('Supervisor Autoriza', shift.supervisorId!),
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
                border: TableBorder.all(color: Colors.grey.shade300),
                children: [
                  TableRow(
                    decoration: BoxDecoration(color: Colors.grey.shade100),
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
                          ? (diffNio < 0 || diffUsd < 0 ? Colors.red.shade50 : Colors.green.shade50)
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
                                ? Colors.black87
                                : diffNio > 0
                                    ? Colors.green.shade800
                                    : Colors.red.shade800,
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
                                ? Colors.black87
                                : diffUsd > 0
                                    ? Colors.green.shade800
                                    : Colors.red.shade800,
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
            backgroundColor: Colors.indigo,
            foregroundColor: Colors.white,
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
          Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
