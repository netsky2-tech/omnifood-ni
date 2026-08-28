import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../design_system/design_system.dart';
import '../../../../domain/models/audit_log.dart';
import 'audit_log_view_model.dart';

class AuditLogView extends StatefulWidget {
  const AuditLogView({super.key});

  @override
  State<AuditLogView> createState() => _AuditLogViewState();
}

class _AuditLogViewState extends State<AuditLogView> {
  final TextEditingController _searchController = TextEditingController();
  final DateFormat _dateFormat = DateFormat('dd/MM/yyyy HH:mm:ss');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _searchController.clear();
        context.read<AuditLogViewModel>().setSearchQuery('');
        context.read<AuditLogViewModel>().loadLogs();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<AuditLogViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Registro de Auditoría'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar',
            onPressed: () => viewModel.loadLogs(),
          ),
          if (viewModel.startDate != null ||
              viewModel.searchQuery.isNotEmpty ||
              viewModel.actionCategory != null)
            IconButton(
              icon: const Icon(Icons.filter_list_off),
              tooltip: 'Limpiar filtros',
              onPressed: () {
                _searchController.clear();
                viewModel.clearFilters();
              },
            ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 1. Search Bar
            TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Buscar por acción, usuario o ID...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: viewModel.searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          viewModel.setSearchQuery('');
                        },
                      )
                    : null,
                isDense: true,
                border: const OutlineInputBorder(),
              ),
              onChanged: viewModel.setSearchQuery,
            ),
            const SizedBox(height: 10),

            // 2. Filters Row (Date button & Action Chips)
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: () => _selectDateRange(context, viewModel),
                  icon: const Icon(Icons.date_range, size: 18),
                  label: Text(
                    viewModel.startDate == null
                        ? 'Fechas'
                        : '${viewModel.startDate!.day}/${viewModel.startDate!.month} - ${viewModel.endDate!.day}/${viewModel.endDate!.month}',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _buildCategoryChip(viewModel, 'TODOS', null),
                        const SizedBox(width: 6),
                        _buildCategoryChip(viewModel, 'VENTAS', 'SALE'),
                        const SizedBox(width: 6),
                        _buildCategoryChip(viewModel, 'ANULACIONES', 'VOID'),
                        const SizedBox(width: 6),
                        _buildCategoryChip(viewModel, 'DEVOLUCIONES', 'RETURN'),
                        const SizedBox(width: 6),
                        _buildCategoryChip(viewModel, 'SESIÓN', 'LOGIN'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // 3. Logs List Content
            Expanded(
              child: viewModel.isLoading && viewModel.logs.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : viewModel.logs.isEmpty
                      ? const Center(
                          child: DsEmptyState(
                            icon: Icons.history_toggle_off,
                            title: 'Sin registros',
                            description: 'No hay eventos de auditoría registrados en la terminal.',
                          ),
                        )
                      : viewModel.filteredLogs.isEmpty
                          ? const Center(
                              child: DsEmptyState(
                                icon: Icons.filter_alt_off,
                                title: 'Sin resultados',
                                description: 'Ningún evento coincide con los filtros aplicados.',
                              ),
                            )
                          : ListView.separated(
                              itemCount: viewModel.filteredLogs.length,
                              separatorBuilder: (context, index) => const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final log = viewModel.filteredLogs[index];
                                final badge = _getActionBadge(log.action);

                                return Card(
                                  margin: EdgeInsets.zero,
                                  child: ListTile(
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                                    leading: Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        color: badge.color.withValues(alpha: 0.12),
                                        shape: BoxShape.circle,
                                      ),
                                      child: Icon(badge.icon, color: badge.color, size: 22),
                                    ),
                                    title: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            log.action,
                                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: badge.color.withValues(alpha: 0.15),
                                            borderRadius: BorderRadius.circular(4),
                                            border: Border.all(color: badge.color.withValues(alpha: 0.4)),
                                          ),
                                          child: Text(
                                            badge.label,
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w700,
                                              color: badge.color,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    subtitle: Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        'Usuario: ${log.userId} • ${_formatDate(log.timestamp)}',
                                        style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    trailing: const Icon(Icons.chevron_right, size: 20),
                                    onTap: () => _showLogDetails(context, log, badge),
                                  ),
                                );
                              },
                            ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryChip(AuditLogViewModel viewModel, String label, String? category) {
    final isSelected = viewModel.actionCategory == category;
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      selected: isSelected,
      onSelected: (_) => viewModel.setActionCategory(category),
    );
  }

  String _formatDate(dynamic timestamp) {
    if (timestamp is DateTime) {
      return _dateFormat.format(timestamp);
    }
    return timestamp.toString();
  }

  _AuditBadgeInfo _getActionBadge(String action) {
    final act = action.toUpperCase();
    if (act.contains('VOID') || act.contains('CANCEL') || act.contains('ANUL')) {
      return _AuditBadgeInfo('ANULACIÓN', Colors.red.shade700, Icons.cancel_outlined);
    }
    if (act.contains('SALE') || act.contains('VENTA')) {
      return _AuditBadgeInfo('VENTA', Colors.green.shade700, Icons.point_of_sale_outlined);
    }
    if (act.contains('RETURN') || act.contains('DEVOL')) {
      return _AuditBadgeInfo('DEVOLUCIÓN', Colors.orange.shade800, Icons.assignment_return_outlined);
    }
    if (act.contains('LOGIN') || act.contains('AUTH') || act.contains('USER')) {
      return _AuditBadgeInfo('SESIÓN', Colors.blue.shade700, Icons.lock_person_outlined);
    }
    return _AuditBadgeInfo('SISTEMA', Colors.purple.shade700, Icons.info_outline);
  }

  Future<void> _selectDateRange(BuildContext context, AuditLogViewModel viewModel) async {
    final DateTimeRange? picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030, 12, 31),
      initialDateRange: viewModel.startDate != null && viewModel.endDate != null
          ? DateTimeRange(start: viewModel.startDate!, end: viewModel.endDate!)
          : null,
    );
    if (picked != null) {
      viewModel.setDateRange(picked.start, picked.end);
    }
  }

  void _showLogDetails(BuildContext context, dynamic log, _AuditBadgeInfo badge) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(badge.icon, color: badge.color, size: 24),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                log.action,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        content: Container(
          constraints: const BoxConstraints(maxWidth: 400),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                _DetailItem(label: 'Fecha y hora', value: _formatDate(log.timestamp)),
                _DetailItem(label: 'Usuario', value: log.userId.toString()),
                _DetailItem(label: 'Dispositivo', value: log.deviceId.toString()),
                const SizedBox(height: 12),
                const Text('METADATOS REGISTRADOS:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
                const SizedBox(height: 6),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: Text(
                    _formatMetadata(log.metadata),
                    style: const TextStyle(fontFamily: 'Courier', fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('CERRAR'),
          ),
        ],
      ),
    );
  }

  String _formatMetadata(dynamic metadata) {
    if (metadata == null || metadata.toString().isEmpty) return 'Sin metadatos';
    try {
      final decoded = json.decode(metadata.toString());
      return const JsonEncoder.withIndent('  ').convert(decoded);
    } catch (_) {
      return metadata.toString();
    }
  }
}

class _AuditBadgeInfo {
  final String label;
  final Color color;
  final IconData icon;
  _AuditBadgeInfo(this.label, this.color, this.icon);
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
          Text('$label: ', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 12))),
        ],
      ),
    );
  }
}
