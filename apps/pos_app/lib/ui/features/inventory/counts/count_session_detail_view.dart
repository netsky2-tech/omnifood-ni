import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:pos_app/core/localization/label_map.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/ui/design_system/design_system.dart';

typedef CountLineAction = Future<void> Function(String lineId);
typedef CountSessionAction = Future<void> Function();

enum CountLineFilter { all, pending, counted, disputed }

class CountSessionDetailView extends StatefulWidget {
  const CountSessionDetailView({
    super.key,
    required this.session,
    required this.onRecordCount,
    required this.onRequestApproval,
    required this.onApprove,
    required this.onPost,
  });

  final CountSessionDocument session;
  final CountLineAction onRecordCount;
  final CountSessionAction onRequestApproval;
  final CountSessionAction onApprove;
  final CountSessionAction onPost;

  @override
  State<CountSessionDetailView> createState() => _CountSessionDetailViewState();
}

class _CountSessionDetailViewState extends State<CountSessionDetailView> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  CountLineFilter _activeFilter = CountLineFilter.all;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  DsChipTone _statusTone(String status) {
    switch (status) {
      case CountSessionStatus.posted:
      case CountSessionStatus.approved:
        return DsChipTone.success;
      case CountSessionStatus.recount:
      case CountSessionStatus.approvalPending:
        return DsChipTone.warning;
      case CountSessionStatus.open:
      case CountSessionStatus.counting:
        return DsChipTone.primary;
      case CountSessionStatus.draft:
      case CountSessionStatus.closed:
      default:
        return DsChipTone.neutral;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case CountSessionStatus.posted:
        return Icons.verified_outlined;
      case CountSessionStatus.approved:
        return Icons.check_circle_outline;
      case CountSessionStatus.recount:
        return Icons.warning_amber_rounded;
      case CountSessionStatus.approvalPending:
        return Icons.hourglass_bottom_rounded;
      case CountSessionStatus.open:
      case CountSessionStatus.counting:
        return Icons.fact_check_outlined;
      case CountSessionStatus.draft:
      case CountSessionStatus.closed:
      default:
        return Icons.lock_outline;
    }
  }

  List<CountSessionLineDocument> _filterLines(List<CountSessionLineDocument> lines) {
    final query = _searchQuery.trim().toLowerCase();
    return lines.where((line) {
      if (query.isNotEmpty) {
        final matchesName = line.insumoName.toLowerCase().contains(query);
        final matchesUom = line.uom.toLowerCase().contains(query);
        if (!matchesName && !matchesUom) {
          return false;
        }
      }

      switch (_activeFilter) {
        case CountLineFilter.all:
          return true;
        case CountLineFilter.pending:
          return line.entries.isEmpty;
        case CountLineFilter.counted:
          return line.entries.isNotEmpty && !line.hasDispute;
        case CountLineFilter.disputed:
          return line.hasDispute;
      }
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');
    final statusLabel = localize(session.status, kCountSessionStatusLabels);
    final filteredLines = _filterLines(session.lines);
    final totalLines = session.lines.length;
    final countedLines = session.lines.where((l) => l.entries.isNotEmpty).length;
    final disputedLines = session.lines.where((l) => l.hasDispute).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 1. Session Summary Header Card (Flat Nhilos style)
        Container(
          decoration: BoxDecoration(
            color: NhilosColors.surface,
            borderRadius: NhilosRadii.cardRadius,
            border: Border.all(color: NhilosColors.border),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: NhilosColors.brandTealLight,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.warehouse_outlined,
                      color: NhilosColors.brandPrimary,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          session.warehouseName,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: NhilosColors.textPrimary,
                              ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Estado: $statusLabel',
                          style: const TextStyle(
                            fontSize: 12,
                            color: NhilosColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  DsStatusChip(
                    label: statusLabel.toUpperCase(),
                    tone: _statusTone(session.status),
                    icon: _statusIcon(session.status),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Divider(height: 1, color: NhilosColors.border),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                runSpacing: 8,
                children: [
                  _MetaMetric(
                    icon: Icons.schedule_outlined,
                    label: 'Corte: ${dateFormat.format(session.cutoffAt.toLocal())}',
                  ),
                  if (session.postedAt != null)
                    _MetaMetric(
                      icon: Icons.event_available_outlined,
                      label: 'Aplicado: ${dateFormat.format(session.postedAt!.toLocal())}',
                    ),
                  _MetaMetric(
                    icon: Icons.checklist_rtl_outlined,
                    label: 'Progreso: $countedLines / $totalLines contados',
                  ),
                  if (session.movementReferences.isNotEmpty)
                    _MetaMetric(
                      icon: Icons.sync_alt_outlined,
                      label: 'Referencias de ajuste: ${session.movementReferences.length}',
                    ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 2. Search Bar & Filter Chips (Nhilos §12-§13)
        TextField(
          key: const Key('count_lines_search_input'),
          controller: _searchController,
          decoration: InputDecoration(
            hintText: 'Buscar insumo por nombre o unidad...',
            prefixIcon: const Icon(Icons.search, color: NhilosColors.textSecondary),
            suffixIcon: _searchQuery.isNotEmpty
                ? IconButton(
                    key: const Key('count_lines_search_clear'),
                    icon: const Icon(Icons.clear, size: 18),
                    tooltip: 'Limpiar búsqueda',
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _searchQuery = '');
                    },
                  )
                : null,
            filled: true,
            fillColor: NhilosColors.surface,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: NhilosRadii.buttonRadius,
              borderSide: const BorderSide(color: NhilosColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: NhilosRadii.buttonRadius,
              borderSide: const BorderSide(color: NhilosColors.border),
            ),
          ),
          onChanged: (val) => setState(() => _searchQuery = val),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _FilterChipButton(
                label: 'Todos ($totalLines)',
                selected: _activeFilter == CountLineFilter.all,
                onTap: () => setState(() => _activeFilter = CountLineFilter.all),
              ),
              const SizedBox(width: 8),
              _FilterChipButton(
                label: 'Pendientes (${totalLines - countedLines})',
                selected: _activeFilter == CountLineFilter.pending,
                onTap: () => setState(() => _activeFilter = CountLineFilter.pending),
              ),
              const SizedBox(width: 8),
              _FilterChipButton(
                label: 'Contados (${countedLines - disputedLines})',
                selected: _activeFilter == CountLineFilter.counted,
                onTap: () => setState(() => _activeFilter = CountLineFilter.counted),
              ),
              if (disputedLines > 0) ...[
                const SizedBox(width: 8),
                _FilterChipButton(
                  label: 'Disputados ($disputedLines)',
                  selected: _activeFilter == CountLineFilter.disputed,
                  isWarning: true,
                  onTap: () => setState(() => _activeFilter = CountLineFilter.disputed),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        // 3. Filtered Line Items or Empty Search State
        if (filteredLines.isEmpty)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
            decoration: BoxDecoration(
              color: NhilosColors.surface,
              borderRadius: NhilosRadii.cardRadius,
              border: Border.all(color: NhilosColors.border),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.search_off_outlined,
                  size: 40,
                  color: NhilosColors.textMuted,
                ),
                const SizedBox(height: 8),
                Text(
                  _searchQuery.trim().isNotEmpty
                      ? 'Sin resultados para «${_searchQuery.trim()}»'
                      : 'No hay insumos en este filtro.',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: NhilosColors.textPrimary,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () {
                    _searchController.clear();
                    setState(() {
                      _searchQuery = '';
                      _activeFilter = CountLineFilter.all;
                    });
                  },
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Mostrar todos los insumos'),
                ),
              ],
            ),
          )
        else
          ...filteredLines.map(
            (line) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _CountLineCard(
                line: line,
                onRecordCount: () => widget.onRecordCount(line.id),
              ),
            ),
          ),

        const SizedBox(height: 16),

        // 4. Primary Session Lifecycle Actions
        if (session.status == CountSessionStatus.open ||
            session.status == CountSessionStatus.counting ||
            session.status == CountSessionStatus.recount)
          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: NhilosColors.brandPrimary,
                foregroundColor: Colors.white,
                shape: const RoundedRectangleBorder(
                  borderRadius: NhilosRadii.buttonRadius,
                ),
              ),
              onPressed: widget.onRequestApproval,
              icon: const Icon(Icons.send_outlined, size: 18),
              label: const Text(
                'Enviar a aprobación',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        if (session.status == CountSessionStatus.approvalPending)
          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: NhilosColors.brandPrimary,
                foregroundColor: Colors.white,
                shape: const RoundedRectangleBorder(
                  borderRadius: NhilosRadii.buttonRadius,
                ),
              ),
              onPressed: widget.onApprove,
              icon: const Icon(Icons.verified_user_outlined, size: 18),
              label: const Text(
                'Aprobar conteo',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        if (session.status == CountSessionStatus.approved)
          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: NhilosColors.success,
                foregroundColor: Colors.white,
                shape: const RoundedRectangleBorder(
                  borderRadius: NhilosRadii.buttonRadius,
                ),
              ),
              onPressed: widget.onPost,
              icon: const Icon(Icons.publish_outlined, size: 18),
              label: const Text(
                'Aplicar ajustes',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
      ],
    );
  }
}

class _MetaMetric extends StatelessWidget {
  const _MetaMetric({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: NhilosColors.textSecondary),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: NhilosColors.textSecondary,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

class _FilterChipButton extends StatelessWidget {
  const _FilterChipButton({
    required this.label,
    required this.selected,
    required this.onTap,
    this.isWarning = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool isWarning;

  @override
  Widget build(BuildContext context) {
    final activeBg = isWarning ? NhilosColors.warningLight : NhilosColors.brandPrimary;
    final activeFg = isWarning ? NhilosColors.warning : Colors.white;
    final borderCol = selected
        ? (isWarning ? NhilosColors.warningBorder : NhilosColors.brandPrimary)
        : NhilosColors.border;

    return InkWell(
      onTap: onTap,
      borderRadius: NhilosRadii.chipRadius,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? activeBg : NhilosColors.surface,
          borderRadius: NhilosRadii.chipRadius,
          border: Border.all(color: borderCol),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? activeFg : NhilosColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _CountLineCard extends StatelessWidget {
  const _CountLineCard({
    required this.line,
    required this.onRecordCount,
  });

  final CountSessionLineDocument line;
  final VoidCallback onRecordCount;

  @override
  Widget build(BuildContext context) {
    final variance = line.variance ?? 0;
    final hasEntries = line.entries.isNotEmpty;
    final isDisputed = line.hasDispute;

    Color varianceColor = NhilosColors.textSecondary;
    if (hasEntries && !isDisputed) {
      if (variance > 0) {
        varianceColor = NhilosColors.warning;
      } else if (variance < 0) {
        varianceColor = NhilosColors.danger;
      } else {
        varianceColor = NhilosColors.success;
      }
    }

    final approvedBatch = (line.entries.isNotEmpty &&
            line.approvedEntryIndex != null &&
            line.approvedEntryIndex! >= 0 &&
            line.approvedEntryIndex! < line.entries.length)
        ? line.entries[line.approvedEntryIndex!].batchNumber
        : null;

    return Container(
      decoration: BoxDecoration(
        color: NhilosColors.surface,
        borderRadius: NhilosRadii.cardRadius,
        border: Border.all(
          color: isDisputed
              ? NhilosColors.warningBorder
              : (hasEntries ? NhilosColors.borderStrong : NhilosColors.border),
        ),
      ),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        line.insumoName,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: NhilosColors.textPrimary,
                        ),
                      ),
                    ),
                    if (line.isBatchManaged) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: NhilosColors.brandTealLight,
                          borderRadius: NhilosRadii.badgeRadius,
                        ),
                        child: const Text(
                          'POR LOTES',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: NhilosColors.brandPrimary,
                          ),
                        ),
                      ),
                    ],
                    if (isDisputed) ...[
                      const SizedBox(width: 6),
                      const DsStatusChip(
                        label: 'DISPUTADO',
                        tone: DsChipTone.warning,
                        icon: Icons.warning_amber_rounded,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    Text(
                      'Teórico: ${line.theoreticalQuantity.toStringAsFixed(2)} ${line.uom}',
                      style: const TextStyle(
                        fontSize: 13,
                        color: NhilosColors.textSecondary,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    Text(
                      'Variación aprobada: ${variance.toStringAsFixed(2)} ${line.uom}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: hasEntries ? FontWeight.w600 : FontWeight.normal,
                        color: varianceColor,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    Text(
                      'Entradas: ${line.entries.length}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: NhilosColors.textMuted,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                if (approvedBatch != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.inventory_2_outlined,
                        size: 13,
                        color: NhilosColors.brandPrimary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Lote: $approvedBatch',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: NhilosColors.brandPrimary,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            height: 40,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: NhilosColors.brandPrimary,
                side: const BorderSide(color: NhilosColors.borderStrong),
                shape: const RoundedRectangleBorder(
                  borderRadius: NhilosRadii.buttonRadius,
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12),
              ),
              onPressed: onRecordCount,
              icon: Icon(
                hasEntries ? Icons.replay_outlined : Icons.edit_note_outlined,
                size: 18,
              ),
              label: Text(
                hasEntries ? 'Recontar' : 'Registrar conteo',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
