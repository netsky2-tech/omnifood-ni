import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../presentation/features/sales/view_models/sales_history_view_model.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../domain/models/sales/invoice.dart';
import '../../../domain/models/sales/invoice_item.dart';
import '../../../domain/usecases/sales/void_decision.dart';
// ReprintReasonCodes and the snapshot-unavailable copy live in the same module.
import '../../../core/localization/label_map.dart';
import '../../design_system/design_system.dart';

class SalesHistoryView extends StatefulWidget {
  const SalesHistoryView({super.key});

  @override
  State<SalesHistoryView> createState() => _SalesHistoryViewState();
}

class _SalesHistoryViewState extends State<SalesHistoryView> {
  Invoice? _selectedInvoice;
  bool _isSearching = false;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _searchController.clear();
        context.read<SalesHistoryViewModel>().setSearchQuery('');
        context.read<SalesHistoryViewModel>().loadInvoices();
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
    final viewModel = context.watch<SalesHistoryViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Scaffold(
      appBar: AppBar(
        title: _isSearching && isHandheld
            ? TextField(
                controller: _searchController,
                autofocus: true,
                onChanged: viewModel.setSearchQuery,
                decoration: const InputDecoration(
                  hintText: 'Buscar factura...',
                  border: InputBorder.none,
                  hintStyle: TextStyle(color: Colors.black54),
                ),
              )
            : const Text('Historial de Ventas'),
        actions: [
          if (isHandheld) ...[
            IconButton(
              icon: Icon(_isSearching ? Icons.close : Icons.search),
              onPressed: () {
                setState(() {
                  if (_isSearching) {
                    _searchController.clear();
                    viewModel.setSearchQuery('');
                    _isSearching = false;
                  } else {
                    _isSearching = true;
                  }
                });
              },
            ),
          ] else ...[
            Container(
              width: 280,
              margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              child: TextField(
                controller: _searchController,
                onChanged: viewModel.setSearchQuery,
                decoration: InputDecoration(
                  hintText: 'Buscar factura...',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            viewModel.setSearchQuery('');
                          },
                        )
                      : null,
                  border: const OutlineInputBorder(),
                  contentPadding: EdgeInsets.zero,
                  isDense: true,
                ),
              ),
            ),
          ],
        ],
      ),
      body: isHandheld
          ? _buildMobileInvoiceList(context, viewModel, colorScheme)
          : Row(
              children: [
                // Invoice List
                Expanded(
                  flex: 2,
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border(right: BorderSide(color: colorScheme.outlineVariant)),
                    ),
                    child: _buildInvoiceListView(context, viewModel, colorScheme, isHandheld: false),
                  ),
                ),
                
                // Details Panel
                Expanded(
                  flex: 3,
                  child: _selectedInvoice == null
                      ? const Center(
                          child: DsEmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: 'Seleccione una factura',
                            description: 'Elija una factura de la lista lateral para ver el desglose detallado.',
                          ),
                        )
                      : InvoiceDetailsPanel(invoice: _selectedInvoice!),
                ),
              ],
            ),
    );
  }

  Widget _buildMobileInvoiceList(
    BuildContext context,
    SalesHistoryViewModel viewModel,
    ColorScheme colorScheme,
  ) {
    return _buildInvoiceListView(context, viewModel, colorScheme, isHandheld: true);
  }

  Widget _buildInvoiceListView(
    BuildContext context,
    SalesHistoryViewModel viewModel,
    ColorScheme colorScheme, {
    required bool isHandheld,
  }) {
    if (viewModel.isLoading && viewModel.invoices.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    // S3b: the three states are now DISTINGUISHABLE. The genuine EMPTY
    // state only exists when the read SUCCEEDED — a failed read renders
    // the honest error (plus any retained rows) and never this copy,
    // because a failed read must not look like a quiet day.
    final hasLoadError = viewModel.hasLoadError;
    // S3b: the list renders the WINDOWED set, never the full filtered set.
    final rows = viewModel.visibleInvoices;

    if (!hasLoadError && rows.isEmpty) {
      return const Center(
        child: DsEmptyState(
          icon: Icons.receipt_long_outlined,
          title: 'Sin facturas encontradas',
          description: 'No hay facturas que coincidan con la búsqueda.',
        ),
      );
    }

    return Column(
      children: [
        // S3b: honest failure surface — shown even when stale rows are
        // retained below, so degraded data is never mistaken for truth.
        if (hasLoadError) _buildLoadErrorBanner(context, viewModel, colorScheme),
        if (viewModel.rowContextFailureCount > 0)
          _buildRowContextNotice(context, viewModel),
        _buildHistoryHeader(context, viewModel, colorScheme),
        Expanded(
          child: ListView.separated(
            itemCount:
                rows.length + (viewModel.hasMoreVisibleInvoices ? 1 : 0),
            separatorBuilder: (context, _) => const Divider(height: 1),
            itemBuilder: (context, index) {
              if (index >= rows.length) {
                // S3b: the "ver más" affordance at the end of the window.
                return _buildRevealMoreFooter(context, viewModel, rows.length);
              }
              final invoice = rows[index];
              final isSelected = !isHandheld && _selectedInvoice?.id == invoice.id;
              final rowCtx = viewModel.getRowContext(invoice.id);
              final timeStr = DateFormat('HH:mm').format(invoice.createdAt);
              final dateStr = DateFormat('dd/MM/yyyy').format(invoice.createdAt);
              final cashierText = rowCtx != null && rowCtx.cashierName.isNotEmpty
                  ? '$timeStr · ${rowCtx.cashierName}'
                  : '$dateStr $timeStr';
              final itemsSummary = rowCtx?.itemsSummary ?? '';
              final paymentMethod = rowCtx?.paymentMethodSummary ?? '';

              return Container(
                color: invoice.isCanceled
                    ? NhilosColors.dangerLight.withOpacity(0.5)
                    : (isSelected
                        ? colorScheme.primaryContainer.withValues(alpha: 0.15)
                        : null),
                child: ListTile(
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  title: Row(
                    children: [
                      Expanded(
                        child: Text(
                          invoice.number,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: NhilosColors.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (invoice.isCanceled) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: const BoxDecoration(
                            color: NhilosColors.dangerLight,
                            borderRadius: NhilosRadii.badgeRadius,
                            border: Border.fromBorderSide(
                                BorderSide(color: NhilosColors.dangerBorder)),
                          ),
                          child: const Text(
                            'ANULADA',
                            style: TextStyle(
                              color: NhilosColors.danger,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(height: 3),
                      Wrap(
                        spacing: 6,
                        runSpacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            cashierText,
                            style: const TextStyle(
                              fontSize: 12,
                              color: NhilosColors.textSecondary,
                            ),
                          ),
                          if (paymentMethod.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 5, vertical: 1),
                              decoration: BoxDecoration(
                                color: NhilosColors.neutralGray,
                                borderRadius: NhilosRadii.badgeRadius,
                                border:
                                    Border.all(color: NhilosColors.border),
                              ),
                              child: Text(
                                paymentMethod,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: NhilosColors.neutralGrayDark,
                                ),
                              ),
                            ),
                        ],
                      ),
                      if (itemsSummary.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          itemsSummary,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: NhilosColors.textSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'C\$ ${invoice.total.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                          fontFeatures: const [FontFeature.tabularFigures()],
                          color: invoice.isCanceled
                              ? NhilosColors.danger
                              : colorScheme.primary,
                        ),
                      ),
                      if (isHandheld) const Icon(Icons.chevron_right, size: 20),
                    ],
                  ),
                  selected: isSelected,
                  selectedTileColor:
                      colorScheme.primaryContainer.withValues(alpha: 0.15),
                  onTap: () {
                    if (isHandheld) {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => InvoiceDetailScreen(invoice: invoice),
                        ),
                      );
                    } else {
                      setState(() => _selectedInvoice = invoice);
                    }
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  /// S3b: honest failure banner for a failed invoice read. Reuses the
  /// app-wide error pattern (error icon + message + REINTENTAR, as in
  /// StockAlertsView); the load error message comes verbatim from the
  /// view model. Rendered together with — never instead of — any stale
  /// retained rows.
  Widget _buildLoadErrorBanner(
    BuildContext context,
    SalesHistoryViewModel viewModel,
    ColorScheme colorScheme,
  ) {
    return Container(
      key: const Key('sales_history_load_error_banner'),
      width: double.infinity,
      color: NhilosColors.dangerLight,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: colorScheme.error),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              viewModel.loadErrorMessage!,
              style: TextStyle(
                color: colorScheme.error,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
          TextButton.icon(
            key: const Key('sales_history_retry_button'),
            icon: const Icon(Icons.refresh),
            label: const Text('Reintentar'),
            onPressed: viewModel.loadInvoices,
          ),
        ],
      ),
    );
  }

  /// S3b: quiet-but-readable notice that N rows could not load their
  /// per-invoice detail (items/payments), so a degraded row is not
  /// silently mistaken for a row without items.
  Widget _buildRowContextNotice(
    BuildContext context,
    SalesHistoryViewModel viewModel,
  ) {
    final count = viewModel.rowContextFailureCount;
    final detail = count == 1
        ? '1 fila no pudo mostrar su detalle (artículos y forma de pago).'
        : '$count filas no pudieron mostrar su detalle (artículos y forma de pago).';
    final surface = Theme.of(context).colorScheme.surfaceContainerHigh;
    return Container(
      key: const Key('sales_history_row_context_notice'),
      width: double.infinity,
      color: surface,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          const Icon(
            Icons.info_outline,
            size: 18,
            color: NhilosColors.textSecondary,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              detail,
              style: const TextStyle(
                fontSize: 12,
                color: NhilosColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// S3b: the always-visible operational header — date-range filter with
  /// an HONEST label (default is NO filter) and the totals row for the
  /// FULL filtered set. Cancelled invoices are counted separately and
  /// explicitly excluded from the money, so they can never look like they
  /// contributed to the day's figures.
  Widget _buildHistoryHeader(
    BuildContext context,
    SalesHistoryViewModel viewModel,
    ColorScheme colorScheme,
  ) {
    final totals = viewModel.filteredTotals;
    String money(double value) => 'C\$ ${value.toStringAsFixed(2)}';
    return Container(
      width: double.infinity,
      color: colorScheme.surfaceContainerLow,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildDateFilterRow(context, viewModel),
          const SizedBox(height: 4),
          Wrap(
            key: const Key('sales_history_totals_row'),
            spacing: 16,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                'Facturas: ${totals.invoiceCount}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: NhilosColors.textPrimary,
                ),
              ),
              Text(
                'Subtotal: ${money(totals.subtotalSum)}',
                style: const TextStyle(
                  fontSize: 13,
                  fontFeatures: [FontFeature.tabularFigures()],
                  color: NhilosColors.textPrimary,
                ),
              ),
              Text(
                'IVA: ${money(totals.taxSum)}',
                style: const TextStyle(
                  fontSize: 13,
                  fontFeatures: [FontFeature.tabularFigures()],
                  color: NhilosColors.textPrimary,
                ),
              ),
              Text(
                'Total: ${money(totals.totalSum)}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  fontFeatures: [FontFeature.tabularFigures()],
                  color: NhilosColors.textPrimary,
                ),
              ),
              Text(
                'Anuladas: ${totals.cancelledCount} (excluidas del dinero)',
                key: const Key('sales_history_totals_cancelled'),
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                  color: NhilosColors.danger,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// S3b: date-range control. The default is NO filter (label says so
  /// honestly); the "Hoy" preset sets today's local fiscal day on both
  /// inclusive bounds, and the clear affordance restores the unfiltered
  /// view. The active range is always shown so the operator knows what
  /// they are looking at.
  Widget _buildDateFilterRow(
    BuildContext context,
    SalesHistoryViewModel viewModel,
  ) {
    final from = viewModel.filterDateFrom;
    final to = viewModel.filterDateTo;
    final active = from != null || to != null;
    String label;
    if (!active) {
      label = 'Sin filtro de fecha';
    } else {
      final formatter = DateFormat('dd/MM/yyyy');
      if (from != null && to != null) {
        label = DateTime(from.year, from.month, from.day) ==
                DateTime(to.year, to.month, to.day)
            ? 'Filtro: ${formatter.format(from)}'
            : 'Filtro: ${formatter.format(from)} – ${formatter.format(to)}';
      } else if (from != null) {
        label = 'Filtro: desde ${formatter.format(from)}';
      } else {
        label = 'Filtro: hasta ${formatter.format(to!)}';
      }
    }
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            key: const Key('sales_history_date_filter_label'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: NhilosColors.textSecondary,
            ),
          ),
        ),
        TextButton.icon(
          key: const Key('sales_history_date_filter_today'),
          style: TextButton.styleFrom(
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            minimumSize: const Size(0, 36),
          ),
          icon: const Icon(Icons.today, size: 16),
          label: const Text('Hoy'),
          onPressed: () {
            final now = DateTime.now();
            final today = DateTime(now.year, now.month, now.day);
            viewModel.setDateRange(today, today);
          },
        ),
        if (active)
          IconButton(
            key: const Key('sales_history_date_filter_clear'),
            tooltip: 'Quitar filtro de fecha',
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            icon: const Icon(Icons.close, size: 18),
            onPressed: viewModel.clearDateRange,
          ),
      ],
    );
  }

  /// S3b: footer affordance at the end of the display window. Remaining
  /// count is shown honestly; tapping reveals the next page of rows.
  Widget _buildRevealMoreFooter(
    BuildContext context,
    SalesHistoryViewModel viewModel,
    int visibleCount,
  ) {
    final remaining = viewModel.filteredInvoices.length - visibleCount;
    return Center(
      child: TextButton.icon(
        key: const Key('sales_history_reveal_more_button'),
        icon: const Icon(Icons.expand_more),
        label: Text('Ver más ($remaining restantes)'),
        onPressed: viewModel.revealMoreVisible,
      ),
    );
  }
}

class InvoiceDetailScreen extends StatelessWidget {
  final Invoice invoice;

  const InvoiceDetailScreen({super.key, required this.invoice});

  @override
  Widget build(BuildContext context) {
    // D-12: render the PERSISTED invoice, never the snapshot taken when the
    // row was tapped. Otherwise a cancelled invoice kept showing
    // `EMITIR NOTA DE CRÉDITO` / `ANULAR FACTURA` (and no ANULADA badge),
    // inviting a second void that the repository then refused.
    final live =
        context.watch<SalesHistoryViewModel>().invoiceById(invoice.id) ??
            invoice;
    return Scaffold(
      appBar: AppBar(
        title: Text('Factura ${invoice.number}'),
      ),
      body: InvoiceDetailsPanel(invoice: live),
    );
  }
}

class InvoiceDetailsPanel extends StatelessWidget {
  final Invoice invoice;
  const InvoiceDetailsPanel({super.key, required this.invoice});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.read<SalesHistoryViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Padding(
      padding: EdgeInsets.all(isHandheld ? 16.0 : 24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'Factura: ${invoice.number}',
                  style: isHandheld
                      ? Theme.of(context).textTheme.titleLarge
                      : Theme.of(context).textTheme.headlineSmall,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (invoice.isCanceled) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: colorScheme.error, borderRadius: BorderRadius.circular(4)),
                  child: const Text('ANULADA', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text('Fecha: ${DateFormat('dd/MM/yyyy HH:mm').format(invoice.createdAt)}'),
          // D-14: the operator's name, resolved from the view model's
          // id→name map — never the device-observed UUID.
          Text('Usuario: ${viewModel.userNameFor(invoice.userId)}'),
          const Divider(height: 24),
          
          Expanded(
            child: FutureBuilder<List<InvoiceItem>>(
              future: viewModel.getInvoiceItems(invoice.id),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                final items = snapshot.data!;
                return ListView.builder(
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return ListTile(
                      title: Text(item.productName),
                      subtitle: Text('${item.quantity.toInt()} x C\$ ${item.unitPrice.toStringAsFixed(2)}'),
                      trailing: Text('C\$ ${item.total.toStringAsFixed(2)}'),
                    );
                  },
                );
              },
            ),
          ),
          
          const Divider(height: 32),
          
          // Summary
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Subtotal:'),
              Text('C\$ ${invoice.subtotal.toStringAsFixed(2)}'),
            ],
          ),
          // D-3: under CUOTA_FIJA the tenant does not collect IVA — the row is
          // omitted instead of showing a label that contradicts the receipts.
          if (context.watch<SaleViewModel>().companyTaxRegime?.isCuotaFija != true)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('IVA:'),
                Text('C\$ ${invoice.totalTax.toStringAsFixed(2)}'),
              ],
            ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('TOTAL:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
              Text('C\$ ${invoice.total.toStringAsFixed(2)}', 
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: colorScheme.primary)),
            ],
          ),
          
          const SizedBox(height: 24),
          
          // D-13: REIMPRIMIR is available for ANY invoice row — canceled
          // included; the paper then carries ANULADO and REIMPRESIÓN
          // together (#547). Permission-gated (SalesPermission).
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              key: const Key('reprint_invoice_button'),
              icon: const Icon(Icons.print_outlined),
              label: const Text('REIMPRIMIR'),
              onPressed: context.watch<SaleViewModel>().canReprint
                  ? () => _showReprintDialog(context)
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          if (!invoice.isCanceled && invoice.type == InvoiceType.regular) ...[
            // H5 (batch 8a): the credit-note action is RESTORED behind the
            // role gate (owner/manager only — [SaleViewModel
            // .canIssueCreditNote]); the view model keeps the same hard gate
            // as defense-in-depth. Cross-day corrections are emitted in the
            // POS again, but each note stays a local fiscal document pending
            // upstream acceptance until DSI-6 lands.
            if (context.watch<SaleViewModel>().canIssueCreditNote) ...[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('credit_note_button'),
                  icon: const Icon(Icons.assignment_return_outlined),
                  label: const Text('EMITIR NOTA DE CRÉDITO'),
                  onPressed: () => _showCreditNoteDialog(context),
                ),
              ),
              const SizedBox(height: 12),
            ],
            // D-15: the void action is permission-gated (SalesPermission),
            // never a role-label check. The dialog collects the mandatory
            // controlled reason (AC-6) before invoking the view model.
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: const Key('void_invoice_button'),
                icon: const Icon(Icons.cancel_outlined),
                label: const Text('ANULAR FACTURA'),
                onPressed: context.watch<SaleViewModel>().canVoidInvoice
                    ? () => _showVoidDialog(context)
                    : null,
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Neutral Spanish labels for the D-13 reprint reason codes, delegated to
  /// the centralized map (#587 WU3); unknown codes pass through unchanged.
  String _reprintReasonLabel(String code) =>
      localize(code, kReprintReasonLabels);

  /// D-13: reprint reason dialog — mandatory controlled code + optional
  /// detail. On success the SnackBar claims only the print outcome; the
  /// list is NOT reloaded (a reprint writes no invoice data).
  void _showReprintDialog(BuildContext context) {
    String? selectedCode;
    final detailController = TextEditingController();
    var submitting = false;
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Reimprimir Comprobante'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Seleccione el motivo de la reimpresión de ${invoice.number}:'),
              const SizedBox(height: 8),
              ...ReprintReasonCodes.all.map(
                (code) => RadioListTile<String>(
                  value: code,
                  groupValue: selectedCode,
                  title: Text(_reprintReasonLabel(code)),
                  onChanged: (value) =>
                      setDialogState(() => selectedCode = value),
                ),
              ),
              TextField(
                controller: detailController,
                decoration: const InputDecoration(
                  labelText: 'Detalle (opcional)',
                  hintText: 'Describa el motivo si lo considera necesario',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              key: const Key('confirm_reprint_button'),
              onPressed: selectedCode == null || submitting
                  ? null
                  : () async {
                      setDialogState(() => submitting = true);
                      final saleViewModel = context.read<SaleViewModel>();
                      final messenger = ScaffoldMessenger.of(context);
                      final detail = detailController.text.trim();
                      final ok = await saleViewModel.reprintInvoice(
                        invoice.id,
                        selectedCode!,
                        reasonDetail: detail.isEmpty ? null : detail,
                      );
                      final printed = saleViewModel.lastReprintPrintSucceeded;
                      if (!context.mounted) return;
                      if (ok) {
                        Navigator.pop(dialogContext);
                        // Honesty rule: only claim the print if it happened.
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              printed
                                  ? 'Comprobante REIMPRESIÓN impreso.'
                                  : 'Comprobante REIMPRESIÓN no pudo imprimirse.',
                            ),
                          ),
                        );
                        // No list reload: a reprint writes no invoice data.
                      } else {
                        setDialogState(() => submitting = false);
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              saleViewModel.errorMessage ??
                                  'No se pudo reimprimir el comprobante.',
                            ),
                          ),
                        );
                      }
                    },
              child: const Text('REIMPRIMIR'),
            ),
          ],
        ),
      ),
    );
  }

  /// Neutral Spanish labels for the D-15 controlled reason codes (AC-6/AC-7),
  /// delegated to the centralized map (#587 WU3); unknown codes pass through
  /// unchanged.
  String _voidReasonLabel(String code) => localize(code, kVoidReasonLabels);

  void _showVoidDialog(BuildContext context) {
    String? selectedCode;
    final detailController = TextEditingController();
    var submitting = false;
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Anular Factura'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Seleccione el motivo de la anulación de ${invoice.number}:'),
              const SizedBox(height: 8),
              ...VoidReasonCodes.all.map(
                (code) => RadioListTile<String>(
                  value: code,
                  groupValue: selectedCode,
                  title: Text(_voidReasonLabel(code)),
                  onChanged: (value) =>
                      setDialogState(() => selectedCode = value),
                ),
              ),
              TextField(
                controller: detailController,
                decoration: const InputDecoration(
                  labelText: 'Detalle (opcional)',
                  hintText: 'Describa el motivo si lo considera necesario',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              key: const Key('confirm_void_button'),
              onPressed: selectedCode == null || submitting
                  ? null
                  : () async {
                      setDialogState(() => submitting = true);
                      final saleViewModel = context.read<SaleViewModel>();
                      final messenger = ScaffoldMessenger.of(context);
                      final detail = detailController.text.trim();
                      final ok = await saleViewModel.voidInvoice(
                        invoice.id,
                        selectedCode!,
                        reasonDetail: detail.isEmpty ? null : detail,
                      );
                      // Audit #79: the void's print outcome is a TRI-STATE.
                      // The fiscal void is the fact; the print is derivative
                      // and never reported as a void failure. `notRequested`
                      // (auto-print off) is NOT a failure — the old boolean
                      // fabricated one there.
                      final printOutcome =
                          saleViewModel.lastVoidCopyPrintOutcome;
                      if (!context.mounted) return;
                      if (ok) {
                        Navigator.pop(dialogContext);
                        // Honesty rule: only claim the print if it happened.
                        final String voidPrintMessage = switch (printOutcome) {
                          VoidCopyPrintOutcome.printed =>
                            'Factura anulada. Se imprimió el comprobante ANULADO.',
                          VoidCopyPrintOutcome.notRequested =>
                            'Factura anulada. Comprobante ANULADO no impreso: '
                                'la impresión automática está desactivada.',
                          VoidCopyPrintOutcome.failed =>
                            // Unavailable printer / paper / driver failure:
                            // named, never silently swallowed.
                            () {
                              final detail = saleViewModel.lastPrintError;
                              return 'Factura anulada. No se pudo imprimir el '
                                      'comprobante ANULADO.' +
                                  (detail == null || detail.isEmpty
                                      ? ''
                                      : ' Motivo: $detail');
                            }(),
                        };
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(voidPrintMessage),
                          ),
                        );
                        await context
                            .read<SalesHistoryViewModel>()
                            .loadInvoices();
                      } else {
                        // Denial: the dialog stays open with the typed reason
                        // preserved; the specific guard message is surfaced.
                        setDialogState(() => submitting = false);
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              saleViewModel.errorMessage ??
                                  'No se pudo anular la factura.',
                            ),
                          ),
                        );
                        // D-12: a refusal can mean the invoice is ALREADY
                        // cancelled (another terminal, or an earlier attempt
                        // that did commit). Re-read so the preview stops
                        // offering an action that can only fail again.
                        await context
                            .read<SalesHistoryViewModel>()
                            .loadInvoices();
                      }
                    },
              child: const Text('ANULAR'),
            ),
          ],
        ),
      ),
    );
  }

  /// H5: credit-note confirmation dialog (NHILOS §23.1): it states the
  /// object (origin invoice number), the scope (all items — this flow
  /// refunds every line), the consequence and the irreversibility of the
  /// fiscal compensation, and the confirm button is the explicit verb
  /// (§23.3). The reason is MANDATORY free text: it is persisted as the
  /// note's audit justification, and only the operator knows the real-world
  /// cause — a fabricated default would write a false fiscal reason.
  /// Success copy is the honest split (§19.2/§31): issuance and print
  /// outcome are reported separately; a print failure never retracts the
  /// issuance (§30: what happened, what the user can still do).
  void _showCreditNoteDialog(BuildContext context) {
    final reasonController = TextEditingController();
    var submitting = false;
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Emitir Nota de Crédito'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Factura afectada: ${invoice.number}'),
              const SizedBox(height: 8),
              const Text(
                'Se devolverán todos los artículos de la factura.',
              ),
              const SizedBox(height: 8),
              const Text(
                'La compensación es permanente: la nota de crédito queda '
                'registrada y no puede eliminarse (normativa DGI).',
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('credit_note_reason_field'),
                controller: reasonController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Motivo (obligatorio)',
                  hintText: 'Describa el motivo de la devolución',
                ),
                onChanged: (_) => setDialogState(() {}),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: submitting ? null : () => Navigator.pop(dialogContext),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              key: const Key('confirm_credit_note_button'),
              onPressed:
                  reasonController.text.trim().isEmpty || submitting
                      ? null
                      : () async {
                          setDialogState(() => submitting = true);
                          final saleViewModel = context.read<SaleViewModel>();
                          final messenger = ScaffoldMessenger.of(context);
                          final creditNoteId = await saleViewModel.processReturn(
                            invoice.number,
                            reasonController.text.trim(),
                          );
                          if (!context.mounted) return;
                          if (creditNoteId != null) {
                            Navigator.pop(dialogContext);
                            // Honesty rule: issuance and print outcome are
                            // claimed separately, never conflated.
                            final printed =
                                saleViewModel.lastCreditNotePrintSucceeded;
                            messenger.showSnackBar(
                              SnackBar(
                                content: Text(
                                  printed
                                      ? 'Nota de crédito emitida. Copia fiscal impresa.'
                                      : 'Nota de crédito emitida. No se pudo '
                                          'imprimir la copia fiscal; use '
                                          'REIMPRIMIR para reintentarlo.',
                                ),
                              ),
                            );
                            await context
                                .read<SalesHistoryViewModel>()
                                .loadInvoices();
                          } else {
                            // Denial: the dialog stays open with the typed
                            // reason preserved; the specific guard message
                            // is surfaced.
                            setDialogState(() => submitting = false);
                            messenger.showSnackBar(
                              SnackBar(
                                content: Text(
                                  saleViewModel.errorMessage ??
                                      'No se pudo emitir la nota de crédito.',
                                ),
                              ),
                            );
                          }
                        },
              child: const Text('Emitir nota de crédito'),
            ),
          ],
        ),
      ),
    );
  }

}
