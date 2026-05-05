import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dgi_report_view_model.dart';

class DgiReportView extends StatefulWidget {
  const DgiReportView({super.key});

  @override
  State<DgiReportView> createState() => _DgiReportViewState();
}

class _DgiReportViewState extends State<DgiReportView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DgiReportViewModel>().loadSessions();
    });
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<DgiReportViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reportes de Auditoría DGI'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      body: Row(
        children: [
          // Sessions Sidebar
          Container(
            width: 350,
            decoration: BoxDecoration(
              border: Border(right: BorderSide(color: colorScheme.outlineVariant)),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text('HISTORIAL DE SESIONES', style: TextStyle(fontWeight: FontWeight.bold, color: colorScheme.primary)),
                ),
                Expanded(
                  child: viewModel.isLoading && viewModel.sessions.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : ListView.builder(
                        itemCount: viewModel.sessions.length,
                        itemBuilder: (context, index) {
                          final session = viewModel.sessions[index];
                          final isSelected = viewModel.selectedSession?.id == session.id;
                          return ListTile(
                            title: Text('Sesión: ${session.id.substring(0, 8)}', style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                            subtitle: Text('Abierta: ${session.openedAt}\n${session.isClosed ? "Cerrada: ${session.closedAt}" : "ACTIVA"}'),
                            isThreeLine: true,
                            selected: isSelected,
                            selectedTileColor: colorScheme.primaryContainer.withValues(alpha: 0.3),
                            onTap: () => viewModel.selectSession(session),
                          );
                        },
                      ),
                ),
              ],
            ),
          ),
          
          // Report Content
          Expanded(
            child: viewModel.selectedSession == null
              ? const Center(child: Text('Seleccione una sesión para generar el reporte'))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Arqueo de Caja (Reporte ${viewModel.selectedSession!.isClosed ? "Z" : "X"})', 
                            style: Theme.of(context).textTheme.headlineMedium),
                          ElevatedButton.icon(
                            onPressed: () => _showPrintPreview(context),
                            icon: const Icon(Icons.print),
                            label: const Text('IMPRIMIR REPORTE'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      
                      // Summary Grid
                      GridView.count(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisCount: 3,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                        childAspectRatio: 2,
                        children: [
                          _ReportStatCard(title: 'Ventas Brutas', value: '\$${viewModel.totalGross.toStringAsFixed(2)}', color: colorScheme.primary),
                          _ReportStatCard(title: 'IVA (15%)', value: '\$${viewModel.totalTax.toStringAsFixed(2)}', color: colorScheme.secondary),
                          _ReportStatCard(title: 'Ventas Netas', value: '\$${viewModel.totalNet.toStringAsFixed(2)}', color: colorScheme.tertiary),
                        ],
                      ),
                      
                      const SizedBox(height: 32),
                      Text('DESGLOSE POR MÉTODO DE PAGO', style: Theme.of(context).textTheme.labelLarge),
                      const Divider(),
                      ...viewModel.paymentsByMethod.entries.map((e) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(e.key.name.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold)),
                            Text('\$${e.value.toStringAsFixed(2)}', style: const TextStyle(fontSize: 18)),
                          ],
                        ),
                      )),
                      
                      const SizedBox(height: 32),
                      Text('AUDITORÍA DE ANULACIONES', style: Theme.of(context).textTheme.labelLarge),
                      const Divider(),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Facturas Anuladas:', style: const TextStyle(fontWeight: FontWeight.bold)),
                          Text('${viewModel.canceledCount}', style: const TextStyle(fontSize: 18, color: Colors.red)),
                        ],
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Monto Total Anulado:', style: const TextStyle(fontWeight: FontWeight.bold)),
                          Text('\$${viewModel.canceledTotal.toStringAsFixed(2)}', style: const TextStyle(fontSize: 18, color: Colors.red)),
                        ],
                      ),
                    ],
                  ),
                ),
          ),
        ],
      ),
    );
  }

  void _showPrintPreview(BuildContext context) {
    final text = context.read<DgiReportViewModel>().generatePrintString();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Vista Previa de Impresión'),
        content: Container(
          width: 350,
          padding: const EdgeInsets.all(16),
          color: Colors.white,
          child: Text(text, style: const TextStyle(fontFamily: 'Courier', fontSize: 12)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CERRAR')),
          ElevatedButton(onPressed: () => Navigator.pop(context), child: const Text('ENVIAR A IMPRESORA')),
        ],
      ),
    );
  }
}

class _ReportStatCard extends StatelessWidget {
  final String title;
  final String value;
  final Color color;
  const _ReportStatCard({required this.title, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }
}
