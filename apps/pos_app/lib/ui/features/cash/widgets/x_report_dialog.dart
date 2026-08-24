import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../data/models/sales/cashier_session_entity.dart';
import '../../../../data/models/sales/cash_movement_entity.dart';

class XReportDialog extends StatelessWidget {
  final CashierSessionEntity shift;
  final List<CashMovementEntity> movements;

  const XReportDialog({
    super.key,
    required this.shift,
    required this.movements,
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
      title: const Row(
        children: [
          Icon(Icons.assessment_outlined, color: Colors.indigo),
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
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade600,
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
                          style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _buildRow('Terminal POS', shift.terminalId),
                    _buildRow('Cajero ID', shift.userId),
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
                        child: Text('(+) Ingresos Manuales', style: TextStyle(fontSize: 12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatNio(totalInNio), style: const TextStyle(fontSize: 12, color: Colors.green)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatUsd(totalInUsd), style: const TextStyle(fontSize: 12, color: Colors.green)),
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
                        child: Text(_formatNio(totalOutNio), style: const TextStyle(fontSize: 12, color: Colors.red)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(_formatUsd(totalOutUsd), style: const TextStyle(fontSize: 12, color: Colors.red)),
                      ),
                    ],
                  ),
                  TableRow(
                    decoration: BoxDecoration(color: Colors.indigo.shade50),
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(6.0),
                        child: Text('(=) Esperado en Gaveta', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(
                          _formatNio(shift.expectedNio),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Colors.indigo.shade900,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6.0),
                        child: Text(
                          _formatUsd(shift.expectedUsd),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Colors.indigo.shade900,
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
                style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      ),
      actions: [
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.indigo,
            foregroundColor: Colors.white,
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
          Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
