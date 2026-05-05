import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'audit_log_view_model.dart';
import 'dart:convert';

class AuditLogView extends StatefulWidget {
  const AuditLogView({super.key});

  @override
  State<AuditLogView> createState() => _AuditLogViewState();
}

class _AuditLogViewState extends State<AuditLogView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AuditLogViewModel>().loadLogs();
    });
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<AuditLogViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Registro de Auditoría'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => viewModel.loadLogs(),
          ),
          IconButton(
            icon: const Icon(Icons.filter_list_off),
            onPressed: () => viewModel.clearFilters(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Bar
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _selectDateRange(context, viewModel),
                    icon: const Icon(Icons.date_range),
                    label: Text(viewModel.startDate == null 
                      ? 'Filtrar por Fecha' 
                      : '${viewModel.startDate!.toString().split(' ')[0]} - ${viewModel.endDate!.toString().split(' ')[0]}'),
                  ),
                ),
                const SizedBox(width: 16),
                // User filter could be added here
              ],
            ),
          ),
          const Divider(),
          // Logs List
          Expanded(
            child: viewModel.isLoading
              ? const Center(child: CircularProgressIndicator())
              : viewModel.logs.isEmpty
                ? const Center(child: Text('No se encontraron registros de auditoría.'))
                : ListView.separated(
                    itemCount: viewModel.logs.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final log = viewModel.logs[index];
                      return ListTile(
                        leading: _getIconForAction(log.action),
                        title: Text(log.action, style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Usuario: ${log.userId} • ${log.timestamp}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _showLogDetails(context, log),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _getIconForAction(String action) {
    if (action.contains('VOID')) return const Icon(Icons.cancel, color: Colors.red);
    if (action.contains('SALE')) return const Icon(Icons.shopping_cart, color: Colors.green);
    if (action.contains('LOGIN')) return const Icon(Icons.login, color: Colors.blue);
    if (action.contains('RETURN')) return const Icon(Icons.assignment_return, color: Colors.orange);
    return const Icon(Icons.info_outline);
  }

  Future<void> _selectDateRange(BuildContext context, AuditLogViewModel viewModel) async {
    final DateTimeRange? picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDateRange: viewModel.startDate != null && viewModel.endDate != null
        ? DateTimeRange(start: viewModel.startDate!, end: viewModel.endDate!)
        : null,
    );
    if (picked != null) {
      viewModel.setDateRange(picked.start, picked.end);
    }
  }

  void _showLogDetails(BuildContext context, dynamic log) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Detalles: ${log.action}'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _DetailItem(label: 'Timestamp', value: log.timestamp.toString()),
              _DetailItem(label: 'Usuario ID', value: log.userId),
              _DetailItem(label: 'Dispositivo', value: log.deviceId),
              const SizedBox(height: 16),
              const Text('METADATOS:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey[200],
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  _formatMetadata(log.metadata),
                  style: const TextStyle(fontFamily: 'Courier', fontSize: 12),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CERRAR')),
        ],
      ),
    );
  }

  String _formatMetadata(String? metadata) {
    if (metadata == null || metadata.isEmpty) return 'Sin metadatos';
    try {
      final decoded = json.decode(metadata);
      return const JsonEncoder.withIndent('  ').convert(decoded);
    } catch (_) {
      return metadata;
    }
  }
}

class _DetailItem extends StatelessWidget {
  final String label;
  final String value;
  const _DetailItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label: ', style: const TextStyle(fontWeight: FontWeight.bold)),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
