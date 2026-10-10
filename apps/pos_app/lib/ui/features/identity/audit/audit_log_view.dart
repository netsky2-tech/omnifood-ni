import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../../../../core/localization/label_map.dart';
import '../../../design_system/design_system.dart';
import '../../../../domain/models/audit_log.dart';
import '../../../../domain/repositories/auth_repository.dart';
import 'audit_log_view_model.dart';

class AuditLogView extends StatefulWidget {
  const AuditLogView({super.key});

  @override
  State<AuditLogView> createState() => _AuditLogViewState();
}

class _AuditLogViewState extends State<AuditLogView> {
  final TextEditingController _searchController = TextEditingController();
  final DateFormat _dateFormat = DateFormat('dd/MM/yyyy HH:mm:ss');

  /// D-14: id→person-name map, built once per view load from the identity
  /// source (getAllUsers includes INACTIVE users — kept on purpose for
  /// historical attribution). Empty when the provider is unavailable; rows
  /// then render the honest fallback label, never the raw id.
  Map<String, String> _usersById = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _searchController.clear();
        context.read<AuditLogViewModel>().setSearchQuery('');
        context.read<AuditLogViewModel>().loadLogs();
        _loadUsers();
      }
    });
  }

  Future<void> _loadUsers() async {
    try {
      final users = await context.read<AuthRepository>().getAllUsers();
      if (mounted) {
        setState(() {
          _usersById = {for (final u in users) u.id: u.name};
        });
      }
    } catch (_) {
      // Isolated mounts/tests without the identity provider: keep the
      // honest fallback; never render the raw id.
      _usersById = const {};
    }
  }

  /// D-14: a person's name where an id used to be shown.
  String _userName(String userId) => resolveUserName(userId, _usersById);

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
                                            localize(
                                                log.action,
                                                kAuditLedgerActionLabels),
                                            style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 13),
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
                                        'Usuario: ${_userName(log.userId)} • ${_formatDate(log.timestamp)}',
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
    // Metadata presentation: the labelled rows are PRIMARY; the raw JSON
    // payload stays reachable as SECONDARY evidence behind the collapsed
    // 'Ver crudo' toggle. The raw block is only built when expanded, so a
    // quoted-English-keys dump never lands on the owner's screen unless
    // they explicitly ask for it. (ValueNotifier keeps the dialog's
    // pre-existing builder shape untouched.)
    final ValueNotifier<bool> showRawMetadata = ValueNotifier<bool>(false);
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Row(
          children: [
            Icon(badge.icon, color: badge.color, size: 24),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                localize(log.action, kAuditLedgerActionLabels),
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
                _DetailItem(label: 'Usuario', value: _userName(log.userId)),
                // Forensic ledger: the machine code stays reachable as
                // secondary evidence; the human-readable label above it is
                // the primary text.
                _DetailItem(label: 'Código', value: log.action),
                // Device identity, not person identity: the operator rule
                // (D-14) is about people, so the device id stays verbatim.
                _DetailItem(label: 'Dispositivo', value: log.deviceId.toString()),
                const SizedBox(height: 12),
                const Text('METADATOS REGISTRADOS:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
                const SizedBox(height: 6),
                ..._metadataSection(log.metadata, showRawMetadata),
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

  /// The metadata block of the detail dialog: labelled rows keyed by the
  /// verified POS emit sites (kAuditMetadataKeyLabels) as the primary
  /// presentation, with the raw JSON payload as a collapsed secondary
  /// 'Ver crudo' affordance so the evidence stays reachable without being
  /// machine output on the owner's screen. Unparseable metadata degrades
  /// verbatim (the only honest rendering available).
  List<Widget> _metadataSection(dynamic metadata, ValueNotifier<bool> showRaw) {
    final decoration = BoxDecoration(
      color: Colors.grey.shade100,
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: Colors.grey.shade300),
    );
    final rawTextStyle = const TextStyle(fontFamily: 'Courier', fontSize: 11);

    final entries = _metadataEntries(metadata);
    if (entries == null) {
      return [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: decoration,
          child: Text(
            _formatMetadata(metadata),
            style: rawTextStyle,
          ),
        ),
      ];
    }

    return [
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: decoration,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final entry in entries)
              _DetailItem(
                label: _metadataKeyLabel(entry.key),
                value: entry.value,
              ),
          ],
        ),
      ),
      ValueListenableBuilder<bool>(
        valueListenable: showRaw,
        builder: (context, showRawValue, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(
              key: const Key('audit_metadata_raw_toggle'),
              onPressed: () => showRaw.value = !showRaw.value,
              child: Text(
                showRawValue ? 'Ocultar crudo' : 'Ver crudo',
                style: const TextStyle(fontSize: 11),
              ),
            ),
            if (showRawValue)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: decoration,
                child: Text(
                  _formatMetadata(metadata),
                  style: rawTextStyle,
                ),
              ),
          ],
        ),
      ),
    ];
  }

  /// Parses the audit metadata into insertion-ordered key/value entries.
  /// Returns null when the payload is empty, absent, or not a JSON object —
  /// the caller then renders it verbatim instead of guessing a structure.
  List<MapEntry<String, String>>? _metadataEntries(dynamic metadata) =>
      auditMetadataPrimaryEntries(metadata);

  /// Spanish label for a metadata key from the verified POS emit sites
  /// ([kAuditMetadataKeyLabels]); unverified keys humanise honestly
  /// (underscores to spaces) — never hidden, never given an invented
  /// meaning.
  String _metadataKeyLabel(String key) =>
      kAuditMetadataKeyLabels.containsKey(key)
      ? kAuditMetadataKeyLabels[key]!
      : key.replaceAll('_', ' ');

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

/// Metadata keys whose value is a machine identifier with no operator
/// meaning. They stay reachable inside the collapsed raw JSON, which is the
/// documented home for forensic evidence: round-2 F-4c read a bare invoice
/// UUID under "Factura (ID)" and learned nothing from it.
const Set<String> kAuditMetadataIdentifierKeys = <String>{'invoice_id'};

/// The PRIMARY (labelled) rows of an audit metadata payload: identifiers
/// dropped, machine codes humanised. Returns null when the payload is not a
/// JSON object, which the caller degrades verbatim.
List<MapEntry<String, String>>? auditMetadataPrimaryEntries(dynamic metadata) {
  if (metadata == null) return null;
  final raw = metadata.toString();
  if (raw.trim().isEmpty) return null;
  try {
    final decoded = json.decode(raw);
    if (decoded is Map) {
      return [
        for (final entry in decoded.entries)
          if (!kAuditMetadataIdentifierKeys.contains(entry.key.toString()))
            MapEntry(
              entry.key.toString(),
              humanizeAuditMetadataValue(
                entry.key.toString(),
                entry.value is String
                    ? entry.value as String
                    : entry.value.toString(),
              ),
            ),
      ];
    }
  } catch (_) {
    // Not JSON: fall through to the verbatim rendering.
  }
  return null;
}

/// Human copy for an audit metadata VALUE.
///
/// The wire keeps machine codes (a void reason, a reprint reason) and the
/// operator must not read them raw: F-4c reported `CLIENTE_DESISTE` twice,
/// once as the reason and once as its own code. Unknown codes pass through
/// unchanged, exactly like `localize`.
String humanizeAuditMetadataValue(String key, String value) {
  switch (key) {
    case 'reason':
    case 'reason_code':
      return kVoidReasonLabels[value] ?? kReprintReasonLabels[value] ?? value;
    default:
      return value;
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
