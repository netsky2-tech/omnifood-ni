import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dgi_report_view_model.dart';
import '../../../design_system/design_system.dart';
import '../../../../domain/services/config/printer_config_service.dart';
import '../../../../domain/services/printer/printer_resolver.dart';

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
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reporte de Auditoría'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      body: isHandheld
          ? _buildMobileLayout(context, viewModel, colorScheme)
          : _buildDesktopLayout(context, viewModel, colorScheme),
    );
  }

  Widget _buildMobileLayout(
    BuildContext context,
    DgiReportViewModel viewModel,
    ColorScheme colorScheme,
  ) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Mobile Session Selector
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'SESIÓN / ARQUEO',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (viewModel.isLoading && viewModel.sessions.isEmpty)
                    const Center(child: CircularProgressIndicator())
                  else if (viewModel.sessions.isEmpty)
                    const Text('No hay sesiones registradas.')
                  else
                    DropdownButtonFormField<String>(
                      value: viewModel.selectedSession?.id,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        isDense: true,
                      ),
                      hint: const Text('Seleccione una sesión'),
                      items: viewModel.sessions.map((session) {
                        final status = session.isClosed ? 'Cerrada' : 'ACTIVA';
                        return DropdownMenuItem<String>(
                          value: session.id,
                          child: Text(
                            'Sesión ${session.id.substring(0, 8)} ($status)',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (sessionId) {
                        if (sessionId != null) {
                          final session = viewModel.sessions.firstWhere((s) => s.id == sessionId);
                          viewModel.selectSession(session);
                        }
                      },
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          if (viewModel.selectedSession == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: DsEmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'Seleccione una sesión',
                  description: 'Elija una sesión de caja arriba para generar y auditar el reporte DGI.',
                ),
              ),
            )
          else
            _buildReportContent(context, viewModel, colorScheme, isHandheld: true),
        ],
      ),
    );
  }

  Widget _buildDesktopLayout(
    BuildContext context,
    DgiReportViewModel viewModel,
    ColorScheme colorScheme,
  ) {
    return Row(
      children: [
        // Sessions Sidebar
        Container(
          width: 320,
          decoration: BoxDecoration(
            border: Border(right: BorderSide(color: colorScheme.outlineVariant)),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Text(
                  'HISTORIAL DE SESIONES',
                  style: TextStyle(fontWeight: FontWeight.bold, color: colorScheme.primary),
                ),
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
                            title: Text(
                              'Sesión: ${session.id.substring(0, 8)}',
                              style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.normal),
                            ),
                            subtitle: Text(
                              'Abierta: ${session.openedAt}\n${session.isClosed ? "Cerrada: ${session.closedAt}" : "ACTIVA"}',
                            ),
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
              ? const Center(
                  child: DsEmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: 'Seleccione una sesión',
                    description: 'Elija una sesión del panel lateral para auditar el reporte X/Z.',
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(32),
                  child: _buildReportContent(context, viewModel, colorScheme, isHandheld: false),
                ),
        ),
      ],
    );
  }

  Widget _buildReportContent(
    BuildContext context,
    DgiReportViewModel viewModel,
    ColorScheme colorScheme, {
    required bool isHandheld,
  }) {
    final reportTitle = 'Arqueo de Caja (Reporte ${viewModel.selectedSession!.isClosed ? "Z" : "X"})';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isHandheld) ...[
          Text(reportTitle, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => _showPrintPreview(context),
              icon: const Icon(Icons.print),
              label: const Text('IMPRIMIR REPORTE'),
            ),
          ),
        ] else ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  reportTitle,
                  style: Theme.of(context).textTheme.headlineMedium,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 16),
              ElevatedButton.icon(
                onPressed: () => _showPrintPreview(context),
                icon: const Icon(Icons.print),
                label: const Text('IMPRIMIR REPORTE'),
              ),
            ],
          ),
        ],
        const SizedBox(height: 20),

        // Summary KPI Section
        if (isHandheld)
          Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _ReportStatCard(
                      title: 'Ventas Brutas',
                      value: 'C\$ ${viewModel.totalGross.toStringAsFixed(2)}',
                      color: colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _ReportStatCard(
                      title: 'IVA (15%)',
                      value: 'C\$ ${viewModel.totalTax.toStringAsFixed(2)}',
                      color: colorScheme.secondary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _ReportStatCard(
                title: 'Ventas Netas',
                value: 'C\$ ${viewModel.totalNet.toStringAsFixed(2)}',
                color: colorScheme.tertiary,
              ),
            ],
          )
        else
          Row(
            children: [
              Expanded(
                child: _ReportStatCard(
                  title: 'Ventas Brutas',
                  value: 'C\$ ${viewModel.totalGross.toStringAsFixed(2)}',
                  color: colorScheme.primary,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _ReportStatCard(
                  title: 'IVA (15%)',
                  value: 'C\$ ${viewModel.totalTax.toStringAsFixed(2)}',
                  color: colorScheme.secondary,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _ReportStatCard(
                  title: 'Ventas Netas',
                  value: 'C\$ ${viewModel.totalNet.toStringAsFixed(2)}',
                  color: colorScheme.tertiary,
                ),
              ),
            ],
          ),

        const SizedBox(height: 24),
        Text('DESGLOSE POR MÉTODO DE PAGO', style: Theme.of(context).textTheme.labelLarge),
        const Divider(),
        ...viewModel.paymentsByMethod.entries.map((e) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(e.key.name.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text('C\$ ${e.value.toStringAsFixed(2)}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ],
              ),
            )),

        const SizedBox(height: 24),
        Text('AUDITORÍA DE ANULACIONES', style: Theme.of(context).textTheme.labelLarge),
        const Divider(),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Flexible(child: Text('Facturas Anuladas:', style: TextStyle(fontWeight: FontWeight.bold))),
            Text('${viewModel.canceledCount}', style: const TextStyle(fontSize: 16, color: Colors.red, fontWeight: FontWeight.bold)),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Flexible(child: Text('Monto Total Anulado:', style: TextStyle(fontWeight: FontWeight.bold))),
            Text('C\$ ${viewModel.canceledTotal.toStringAsFixed(2)}', style: const TextStyle(fontSize: 16, color: Colors.red, fontWeight: FontWeight.bold)),
          ],
        ),
      ],
    );
  }

  void _showPrintPreview(BuildContext context) {
    final text = context.read<DgiReportViewModel>().generatePrintString();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Vista Previa de Impresión'),
        content: Container(
          constraints: const BoxConstraints(maxWidth: 350),
          padding: const EdgeInsets.all(16),
          color: Colors.white,
          child: SingleChildScrollView(
            child: Text(text, style: const TextStyle(fontFamily: 'Courier', fontSize: 12)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CERRAR')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              final configService = context.read<PrinterConfigService>();
              final config = await configService.getPrinterConfig();
              final printerPort = PrinterResolver.resolve(config);
              final bytes = utf8.encode('$text\n\n\n');
              final result = await printerPort.printRawEscPos(bytes);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      result.isSuccess
                          ? 'Reporte enviado a la impresora'
                          : 'Error al imprimir: ${result.message ?? "desconocido"}',
                    ),
                    backgroundColor: result.isSuccess ? Colors.green : Colors.red,
                  ),
                );
              }
            },
            child: const Text('ENVIAR A IMPRESORA'),
          ),
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
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: color.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      color: color.withValues(alpha: 0.06),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              title,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color),
            ),
          ],
        ),
      ),
    );
  }
}

