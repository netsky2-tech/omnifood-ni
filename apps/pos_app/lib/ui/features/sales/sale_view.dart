import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../domain/models/inventory/product.dart';
import '../../../domain/models/sales/cart_item.dart';
import '../../../data/services/sync_service.dart';
import '../../../domain/models/sales/payment.dart';
import '../../../domain/models/sales/promotion.dart';
import '../../../domain/models/user.dart';
import '../../../domain/repositories/auth_repository.dart';
import '../../../domain/repositories/audit_repository.dart';
import '../../../data/database/app_database.dart';
import '../../widgets/app_drawer.dart';
import '../../features/identity/supervisor_override_modal.dart';
import '../../design_system/design_system.dart';
import '../cash/cash_shift_view_model.dart';
import 'widgets/multi_currency_checkout_dialog.dart';
import 'widgets/split_bill_dialog.dart';
import 'widgets/cloud_sync_status_badge.dart';
import 'tables/table_layout_view.dart';
import '../../../presentation/features/sales/widgets/customer_select_dialog.dart';

class SaleView extends StatefulWidget {
  const SaleView({super.key});

  static void showHoldTicketDialog(BuildContext context) async {
    final vm = context.read<SaleViewModel>();
    if (vm.cart.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Agregue productos al carrito antes de poner la venta en espera.'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    final controller = TextEditingController();
    List<dynamic> tables = [];
    try {
      final database = context.read<AppDatabase>();
      tables = await database.restaurantTableDao.getTablesByStatus('DISPONIBLE');
    } catch (e) {
      debugPrint('[SaleView] Error obteniendo mesas disponibles: $e');
    }

    if (!context.mounted) return;

    String? selectedTableId;
    int guestCount = 2;

    showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Poner Venta en Espera'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: controller,
                      decoration: const InputDecoration(
                        labelText: 'Nombre / Identificador',
                        hintText: 'Ej: Juan Perez / Barra',
                      ),
                      autofocus: true,
                    ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String?>(
                    decoration: const InputDecoration(labelText: 'Mesa Asignada (Opcional)'),
                    value: selectedTableId,
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Sin mesa (Para llevar)')),
                      ...tables.map((t) => DropdownMenuItem(
                            value: t.id,
                            child: Text('${t.tableNumber} (Cap: ${t.capacity})'),
                          )),
                    ],
                    onChanged: (val) => setState(() {
                      selectedTableId = val;
                      if (val != null && controller.text.isEmpty) {
                        final found = tables.firstWhere((t) => t.id == val);
                        controller.text = found.tableNumber;
                      }
                    }),
                  ),
                  if (selectedTableId != null) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Text('Comensales:'),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.remove_circle_outline),
                          onPressed: guestCount > 1 ? () => setState(() => guestCount--) : null,
                        ),
                        Text('$guestCount', style: const TextStyle(fontWeight: FontWeight.bold)),
                        IconButton(
                          icon: const Icon(Icons.add_circle_outline),
                          onPressed: guestCount < 20 ? () => setState(() => guestCount++) : null,
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('CANCELAR')),
              ElevatedButton(
                onPressed: () {
                  final name = controller.text.trim().isEmpty ? 'Comanda' : controller.text.trim();
                  vm.holdCurrentTicket(
                    name,
                    tableId: selectedTableId,
                    guestCount: guestCount,
                  );
                  Navigator.pop(dialogCtx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Venta "$name" puesta en espera con éxito.'),
                      duration: const Duration(seconds: 2),
                    ),
                  );
                },
                child: const Text('GUARDAR'),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  State<SaleView> createState() => _SaleViewState();
}

class _SaleViewState extends State<SaleView> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<SaleViewModel>().setSearchQuery('');
        context.read<SaleViewModel>().checkActiveSession();
      }
    });
  }

  Future<void> _checkAuth() async {
    final authRepo = context.read<AuthRepository>();
    final user = await authRepo.getCurrentUser();
    if (user == null && mounted) {
      Navigator.pushReplacementNamed(context, '/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final hasActiveSession = viewModel.activeSession != null;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    // Listener for errors (Visual Feedback)
    if (viewModel.errorMessage != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(viewModel.errorMessage!),
            backgroundColor: colorScheme.error,
            action: SnackBarAction(
              label: 'OK',
              textColor: Colors.white,
              onPressed: () => viewModel.clearError(),
            ),
          ),
        );
        viewModel.clearError();
      });
    }

    final productContent = viewModel.isLoading
        ? const Center(child: CircularProgressIndicator())
        : viewModel.filteredProducts.isEmpty
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.search_off, size: 64, color: colorScheme.outline),
                    const SizedBox(height: 16),
                    Text(
                      'No se encontraron productos',
                      style: Theme.of(context)
                          .textTheme
                          .bodyLarge
                          ?.copyWith(color: colorScheme.outline),
                    ),
                  ],
                ),
              )
            : ProductGrid(products: viewModel.filteredProducts);

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: true, // Show drawer icon
        title: const SearchBarWidget(),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
        actions: isHandheld
            ? [
                if (viewModel.supportsTables)
                  IconButton(
                    icon: const Icon(Icons.table_restaurant),
                    onPressed: () async {
                      final result = await Navigator.push<Map<String, dynamic>>(
                        context,
                        MaterialPageRoute(builder: (_) => const TableLayoutView()),
                      );
                      if (result != null && mounted) {
                        final tableName = result['tableName'] as String? ?? 'Mesa';
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Comanda abierta para $tableName')),
                        );
                      }
                    },
                    tooltip: 'Control de Mesas',
                  ),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: () => viewModel.loadProducts(),
                  tooltip: 'Recargar',
                ),
                const CloudSyncStatusBadge(),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert),
                  tooltip: 'Más opciones',
                  onSelected: (value) {
                    switch (value) {
                      case 'history':
                        Navigator.pushNamed(context, '/sales/history');
                        break;
                      case 'recall':
                        _showRecallTicketsDialog(context);
                        break;
                      case 'hold':
                        SaleView.showHoldTicketDialog(context);
                        break;
                      case 'promotions':
                        PromotionsManagerDialog.show(context);
                        break;
                      case 'sync':
                        context.read<SyncService>().triggerManualSync();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Sincronización Iniciada...')),
                        );
                        break;
                      case 'manual_drawer':
                        _requestSupervisorOverrideForManualDrawer();
                        break;
                      case 'close_box':
                        _requestSupervisorOverrideForCloseBox();
                        break;
                    }
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: 'history',
                      child: ListTile(
                        leading: Icon(Icons.assignment_return),
                        title: Text('Historial / Devoluciones'),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'recall',
                      child: ListTile(
                        leading: Icon(Icons.history),
                        title: Text('Ventas en Espera'),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'hold',
                      child: ListTile(
                        leading: Icon(Icons.pause),
                        title: Text('Poner en Espera'),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'promotions',
                      child: ListTile(
                        leading: Icon(Icons.local_offer, color: Colors.deepOrange),
                        title: Text('Promociones'),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'sync',
                      child: ListTile(
                        leading: Icon(Icons.cloud_upload),
                        title: Text('Sincronizar Nube'),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    ),
                    if (hasActiveSession && viewModel.canManageCashDrawer)
                      const PopupMenuItem(
                        value: 'manual_drawer',
                        child: ListTile(
                          leading: Icon(Icons.point_of_sale),
                          title: Text('Abrir Gaveta Manual'),
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        ),
                      ),
                    if (hasActiveSession && viewModel.canManageCashDrawer)
                      const PopupMenuItem(
                        value: 'close_box',
                        child: ListTile(
                          leading: Icon(Icons.lock_open),
                          title: Text('Cerrar Caja'),
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        ),
                      ),
                  ],
                ),
              ]
            : [
                if (viewModel.supportsTables)
                  IconButton(
                    icon: const Icon(Icons.table_restaurant),
                    onPressed: () async {
                      final result = await Navigator.push<Map<String, dynamic>>(
                        context,
                        MaterialPageRoute(builder: (_) => const TableLayoutView()),
                      );
                      if (result != null && mounted) {
                        final tableName = result['tableName'] as String? ?? 'Mesa';
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Comanda abierta para $tableName')),
                        );
                      }
                    },
                    tooltip: 'Control de Mesas',
                  ),
                IconButton(
                  icon: const Icon(Icons.assignment_return),
                  onPressed: () => Navigator.pushNamed(context, '/sales/history'),
                  tooltip: 'Historial de Ventas / Devoluciones',
                ),
                IconButton(
                  icon: const Icon(Icons.history),
                  onPressed: () => _showRecallTicketsDialog(context),
                  tooltip: 'Recuperar Ventas en Espera',
                ),
                IconButton(
                  icon: const Icon(Icons.pause),
                  onPressed: () => SaleView.showHoldTicketDialog(context),
                  tooltip: 'Poner en Espera',
                ),
                const CloudSyncStatusBadge(),
                if (hasActiveSession && viewModel.canManageCashDrawer)
                  IconButton(
                    icon: const Icon(Icons.point_of_sale),
                    onPressed: () => _requestSupervisorOverrideForManualDrawer(),
                    tooltip: 'Abrir Gaveta Manual',
                  ),
                if (hasActiveSession && viewModel.canManageCashDrawer)
                  IconButton(
                    icon: const Icon(Icons.lock_open),
                    onPressed: () => _requestSupervisorOverrideForCloseBox(),
                    tooltip: 'Cerrar Caja',
                  ),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: () => viewModel.loadProducts(),
                ),
              ],
      ),
      drawer: const AppDrawer(),
      body: hasActiveSession
          ? (isHandheld
              ? Stack(
                  children: [
                    Positioned.fill(
                      child: Padding(
                        padding: EdgeInsets.only(
                          bottom: viewModel.cart.isNotEmpty ? 76 : 0,
                        ),
                        child: Container(
                          color: colorScheme.surfaceContainerLow,
                          child: productContent,
                        ),
                      ),
                    ),
                    if (viewModel.cart.isNotEmpty)
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: MobileFloatingCartBar(
                          onTap: () => _showMobileCartBottomSheet(context),
                        ),
                      ),
                  ],
                )
              : Row(
                  children: [
                    // Product Grid
                    Expanded(
                      flex: 3,
                      child: Container(
                        color: colorScheme.surfaceContainerLow,
                        child: productContent,
                      ),
                    ),

                    // Sidebar Cart
                    Container(
                      width: 400,
                      decoration: BoxDecoration(
                        border: Border(left: BorderSide(color: colorScheme.outlineVariant)),
                        color: colorScheme.surface,
                      ),
                      child: const CartSidebar(),
                    ),
                  ],
                ))
          : const BoxOpeningContent(),
    );
  }

  void _showMobileCartBottomSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (modalContext) {
        return DraggableScrollableSheet(
          initialChildSize: 0.85,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (_, scrollController) {
            return Column(
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade400,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Expanded(
                  child: CartSidebar(
                    scrollController: scrollController,
                    isMobileSheet: true,
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }


  void _showRecallTicketsDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const RecallTicketsDialog(),
    );
  }

  // TODO: Implementar funcionalidad de devoluciones/notas de crédito
  // void _showReturnsDialog(BuildContext context) { ... }

  void _showCloseBoxDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const CloseBoxDialog(),
    );
  }

  Future<void> _requestSupervisorOverrideForCloseBox() async {
    final authRepo = context.read<AuthRepository>();
    final currentUser = await authRepo.getCurrentUser();
    
    // Si el usuario ya es Owner o Manager, abrir directamente el arqueo de cierre
    if (currentUser?.role == UserRole.owner || currentUser?.role == UserRole.manager) {
      if (mounted) _showCloseBoxDialog(context);
      return;
    }

    final auditRepo = context.read<AuditRepository>();

    final authorized = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => SupervisorOverrideModal(
        onAuthorize: (request) {
          final pin = request.method == SupervisorAuthorizationMethod.pin ? request.credential : null;
          final totp = request.method == SupervisorAuthorizationMethod.totp ? request.credential : null;
          return authRepo.authorizeOverride(
            supervisorId: request.supervisorId,
            pin: pin,
            totpCode: totp,
          );
        },
        onAuditSuccess: (request) {
          final method = request.method == SupervisorAuthorizationMethod.pin ? 'PIN' : 'TOTP';
          return auditRepo.logForensic(
            'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
            metodoAutorizacion: method,
            usuarioAutorizadorId: request.supervisorId,
            metadata: '{"action":"close_box"}',
          );
        },
      ),
    );

    if (!mounted) return;
    if (authorized == true) {
      _showCloseBoxDialog(context);
    }
  }

  Future<void> _requestSupervisorOverrideForManualDrawer() async {
    final justification = await _promptJustification(context);
    if (!mounted || justification == null || justification.trim().isEmpty) return;

    final authRepo = context.read<AuthRepository>();
    final auditRepo = context.read<AuditRepository>();

    final authorized = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => SupervisorOverrideModal(
        onAuthorize: (request) {
          final pin = request.method == SupervisorAuthorizationMethod.pin ? request.credential : null;
          final totp = request.method == SupervisorAuthorizationMethod.totp ? request.credential : null;
          return authRepo.authorizeOverride(
            supervisorId: request.supervisorId,
            pin: pin,
            totpCode: totp,
          );
        },
        onAuditSuccess: (request) {
          final method = request.method == SupervisorAuthorizationMethod.pin ? 'PIN' : 'TOTP';
          return auditRepo.logForensic(
            'DRAWER_OPENED_MANUALLY',
            metodoAutorizacion: method,
            usuarioAutorizadorId: request.supervisorId,
            metadata: '{"action":"manual_drawer_open","justification":"$justification"}',
          );
        },
      ),
    );

    if (!mounted) return;
    if (authorized == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Apertura manual de gaveta autorizada y auditada.')),
      );
    }
  }

  Future<String?> _promptJustification(BuildContext context) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Justificación requerida'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Motivo de apertura manual'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Continuar'),
          ),
        ],
      ),
    );
  }
}

class CloseBoxDialog extends StatefulWidget {
  const CloseBoxDialog({super.key});

  @override
  State<CloseBoxDialog> createState() => _CloseBoxDialogState();
}

class _CloseBoxDialogState extends State<CloseBoxDialog> {
  late final TextEditingController controller;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '0.00');
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final expected = viewModel.sessionExpected;
    final colorScheme = Theme.of(context).colorScheme;

    return AlertDialog(
      title: const Text('Cierre de Caja - Arqueo'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4), side: BorderSide(color: colorScheme.primary, width: 2)),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Resumen de Ventas:', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            DataTable(
              columns: const [
                DataColumn(label: Text('Método')),
                DataColumn(label: Text('Esperado')),
              ],
              rows: expected.entries.map((e) => DataRow(cells: [
                DataCell(Text(e.key.name.toUpperCase())),
                DataCell(Text('C\$ ${e.value.toStringAsFixed(2)}')),
              ])).toList(),
            ),
            const Divider(),
            TextField(
              controller: controller,
              decoration: const InputDecoration(labelText: 'Efectivo Real en Caja'),
              keyboardType: TextInputType.number,
              onTap: () {
                controller.selection = TextSelection(baseOffset: 0, extentOffset: controller.text.length);
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: () async {
            final balance = double.tryParse(controller.text) ?? 0.0;
            await context.read<SaleViewModel>().closeSession(balance);
            if (context.mounted) {
              try {
                context.read<CashShiftViewModel>().init();
              } catch (_) {}
              Navigator.pop(context);
            }
          }, 
          child: const Text('CERRAR CAJA'),
        ),
      ],
    );
  }
}

class SearchBarWidget extends StatefulWidget {
  const SearchBarWidget({super.key});

  @override
  State<SearchBarWidget> createState() => _SearchBarWidgetState();
}

class _SearchBarWidgetState extends State<SearchBarWidget> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);
    final viewModel = context.watch<SaleViewModel>();

    // Synchronize controller text if search query changed externally
    if (_controller.text != viewModel.searchQuery) {
      _controller.value = _controller.value.copyWith(
        text: viewModel.searchQuery,
        selection: TextSelection.collapsed(offset: viewModel.searchQuery.length),
      );
    }

    return Container(
      width: isHandheld ? null : 450,
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: TextField(
        controller: _controller,
        onChanged: (val) => context.read<SaleViewModel>().setSearchQuery(val),
        onSubmitted: (val) {
          context.read<SaleViewModel>().searchAndAddToCart(val);
          context.read<SaleViewModel>().setSearchQuery('');
          _controller.clear();
        },
        decoration: InputDecoration(
          hintText: isHandheld ? 'Buscar...' : 'Buscar por SKU o Nombre...',
          hintStyle: TextStyle(fontSize: isHandheld ? 12 : 14),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          filled: false,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          prefixIcon: Icon(Icons.search, size: 20, color: colorScheme.primary),
          suffixIcon: viewModel.searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () {
                    _controller.clear();
                    context.read<SaleViewModel>().setSearchQuery('');
                  },
                )
              : null,
        ),
      ),
    );
  }
}

class RecallTicketsDialog extends StatelessWidget {
  const RecallTicketsDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    return AlertDialog(
      title: const Text('Ventas en Espera'),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: viewModel.holdTickets.isEmpty 
          ? const Text('No hay ventas en espera.')
          : ListView.builder(
              shrinkWrap: true,
              itemCount: viewModel.holdTickets.length,
              itemBuilder: (context, index) {
                final ticket = viewModel.holdTickets[index];
                return ListTile(
                  title: Text(ticket.name),
                  subtitle: Text('${ticket.items.length} productos'),
                  trailing: Text('C\$ ${ticket.items.fold(0.0, (sum, i) => sum + i.total).toStringAsFixed(2)}'),
                  onTap: () {
                    viewModel.recallTicket(ticket);
                    Navigator.pop(context);
                  },
                );
              },
            ),
      ),
    );
  }
}

class ProductGrid extends StatelessWidget {
  final List<Product> products;
  const ProductGrid({super.key, required this.products});

  @override
  Widget build(BuildContext context) {
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);
    final colorScheme = Theme.of(context).colorScheme;

    final viewModel = context.watch<SaleViewModel>();

    return GridView.builder(
      padding: EdgeInsets.all(isHandheld ? 10 : 16),
      gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: isHandheld ? 180 : 200,
        childAspectRatio: isHandheld ? 0.82 : 0.84,
        crossAxisSpacing: isHandheld ? 8 : 12,
        mainAxisSpacing: isHandheld ? 8 : 12,
      ),
      itemCount: products.length,
      itemBuilder: (context, index) {
        final product = products[index];
        final promo = viewModel.promotions
            .where((p) => p.isActive && p.targetProductId == product.id)
            .firstOrNull;

        return InkWell(
          onTap: () => _showProductOptions(context, product),
          child: Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(4),
              side: BorderSide(
                color: promo != null
                    ? Colors.deepOrange
                    : colorScheme.outlineVariant,
                width: promo != null ? 1.5 : 1,
              ),
            ),
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(
                        Icons.fastfood,
                        size: isHandheld ? 32 : 40,
                        color: promo != null ? Colors.deepOrange : colorScheme.primary,
                      ),
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4.0),
                        child: Text(
                          product.name,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: isHandheld ? 12 : 13,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'C\$ ${product.sellPrice.toStringAsFixed(2)}',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: promo != null ? Colors.deepOrange : colorScheme.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: isHandheld ? 13 : 15,
                        ),
                      ),
                    ],
                  ),
                ),
                if (promo != null)
                  Positioned(
                    top: 4,
                    right: 4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.deepOrange,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        promo.type == PromotionType.buyXGetYFree
                            ? '2x1'
                            : (promo.type == PromotionType.percentageDiscount
                                ? '-${promo.discountValue.toStringAsFixed(0)}%'
                                : 'PROMO'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showProductOptions(BuildContext context, Product product) {
    if (product.variants.isEmpty && product.availableModifiers.isEmpty) {
      context.read<SaleViewModel>().addToCart(product);
      return;
    }

    showDialog(
      context: context,
      builder: (context) => ProductOptionsDialog(product: product),
    );
  }
}

class ProductOptionsDialog extends StatefulWidget {
  final Product product;
  const ProductOptionsDialog({super.key, required this.product});

  @override
  State<ProductOptionsDialog> createState() => _ProductOptionsDialogState();
}

class _ProductOptionsDialogState extends State<ProductOptionsDialog> {
  String? _selectedVariantId;
  final List<Modifier> _selectedModifiers = [];

  @override
  void initState() {
    super.initState();
    if (widget.product.variants.isNotEmpty) {
      _selectedVariantId = widget.product.variants.first.id;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text(widget.product.name),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4), side: BorderSide(color: colorScheme.outline, width: 2)),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (widget.product.variants.isNotEmpty) ...[
                const Text('Seleccionar Variante:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                RadioGroup<String>(
                  groupValue: _selectedVariantId,
                  onChanged: (val) => setState(() => _selectedVariantId = val),
                  child: Column(
                    children: widget.product.variants.map((v) => RadioListTile<String>(
                      title: Text('${v.name} (+C\$ ${v.priceAdjustment})'),
                      value: v.id,
                    )).toList(),
                  ),
                ),
                const Divider(),
              ],
              if (widget.product.availableModifiers.isNotEmpty) ...[
                const Text('Modificadores:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ...widget.product.availableModifiers.map((m) => CheckboxListTile(
                  title: Text('${m.name} (+C\$ ${m.extraPrice})'),
                  value: _selectedModifiers.contains(m),
                  onChanged: (val) {
                    setState(() {
                      if (val == true) {
                        _selectedModifiers.add(m);
                      } else {
                        _selectedModifiers.remove(m);
                      }
                    });
                  },
                )),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: () {
            context.read<SaleViewModel>().addToCart(
              widget.product,
              variantId: _selectedVariantId,
              modifiers: List.from(_selectedModifiers),
            );
            Navigator.pop(context);
          }, 
          child: const Text('AGREGAR'),
        ),
      ],
    );
  }
}

class BoxOpeningScreen extends StatefulWidget {
  const BoxOpeningScreen({super.key});

  @override
  State<BoxOpeningScreen> createState() => _BoxOpeningScreenState();
}

class _BoxOpeningScreenState extends State<BoxOpeningScreen> {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: BoxOpeningContent());
  }
}

class BoxOpeningContent extends StatefulWidget {
  const BoxOpeningContent({super.key});

  @override
  State<BoxOpeningContent> createState() => _BoxOpeningContentState();
}

class _BoxOpeningContentState extends State<BoxOpeningContent> {
  late final TextEditingController controller;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '0.00');
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Container(
            padding: EdgeInsets.all(isHandheld ? 20 : 32),
            decoration: BoxDecoration(
              color: colorScheme.surface,
              border: Border.all(color: colorScheme.outline, width: 2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.account_balance_wallet, size: isHandheld ? 56 : 80, color: colorScheme.primary),
                SizedBox(height: isHandheld ? 16 : 24),
                Text('APERTURA DE CAJA', style: TextStyle(fontSize: isHandheld ? 20 : 24, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                TextField(
                  controller: controller,
                  decoration: const InputDecoration(
                    labelText: 'Fondo de Caja Inicial',
                    prefixText: 'C\$ ',
                  ),
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: isHandheld ? 18 : 20),
                  onTap: () {
                    controller.selection = TextSelection(baseOffset: 0, extentOffset: controller.text.length);
                  },
                ),
                SizedBox(height: isHandheld ? 16 : 24),
                ElevatedButton(
                  onPressed: viewModel.currentUserRole != null && viewModel.currentUserRole != UserRole.waiter
                      ? () async {
                          final balance = double.tryParse(controller.text) ?? 0.0;
                          await context.read<SaleViewModel>().openSession(balance);
                          if (context.mounted) {
                            try {
                              context.read<CashShiftViewModel>().init();
                            } catch (_) {}
                          }
                        }
                      : null,
                  child: const Text('ABRIR CAJA'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MobileFloatingCartBar extends StatelessWidget {
  final VoidCallback onTap;

  const MobileFloatingCartBar({
    super.key,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final totalItems = viewModel.cart.fold<int>(0, (sum, i) => sum + i.quantity.toInt());

    return Container(
      key: const Key('mobile_floating_cart_bar'),
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(40),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          Badge(
            label: Text('$totalItems'),
            child: Icon(Icons.shopping_cart, color: colorScheme.onPrimaryContainer),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Total: C\$ ${viewModel.total.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: colorScheme.onPrimaryContainer,
                  ),
                ),
                Text(
                  '${viewModel.cart.length} productos agregados',
                  style: TextStyle(
                    fontSize: 11,
                    color: colorScheme.onPrimaryContainer.withAlpha(200),
                  ),
                ),
              ],
            ),
          ),
          FilledButton.icon(
            key: const Key('mobile_view_cart_button'),
            onPressed: onTap,
            icon: const Icon(Icons.receipt_long, size: 18),
            label: const Text('VER CARRITO'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              backgroundColor: colorScheme.primary,
              foregroundColor: colorScheme.onPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class CartSidebar extends StatelessWidget {
  final ScrollController? scrollController;
  final bool isMobileSheet;

  const CartSidebar({
    super.key,
    this.scrollController,
    this.isMobileSheet = false,
  });

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        Padding(
          padding: EdgeInsets.all(isMobileSheet ? 8.0 : 16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.shopping_cart, color: colorScheme.primary, size: 20),
              const SizedBox(width: 8),
              Text(
                'CARRITO',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                  color: colorScheme.primary,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              if (viewModel.cart.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24.0),
                  child: Center(
                    child: Text(
                      'Carrito vacío',
                      style: TextStyle(color: colorScheme.outline),
                    ),
                  ),
                )
              else
                ...viewModel.cart.map((item) {
                  return ListTile(
                    dense: isMobileSheet,
                    contentPadding: EdgeInsets.zero,
                    title: Text(item.productName, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Row(
                      children: [
                        IconButton(
                          icon: Icon(Icons.remove_circle_outline, size: 22, color: colorScheme.primary),
                          onPressed: () => viewModel.updateQuantity(
                            item.productId,
                            item.quantity - 1,
                            variantId: item.variantId,
                            modifiers: item.selectedModifiers,
                          ),
                        ),
                        Text('${item.quantity.toInt()}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                        IconButton(
                          icon: Icon(Icons.add_circle_outline, size: 22, color: colorScheme.primary),
                          onPressed: () => viewModel.updateQuantity(
                            item.productId,
                            item.quantity + 1,
                            variantId: item.variantId,
                            modifiers: item.selectedModifiers,
                          ),
                        ),
                      ],
                    ),
                    trailing: Text('C\$ ${item.total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                    onLongPress: () => viewModel.removeFromCart(
                      item.productId,
                      variantId: item.variantId,
                      modifiers: item.selectedModifiers,
                    ),
                  );
                }),
              const Divider(),
              Container(
                padding: EdgeInsets.all(isMobileSheet ? 12 : 16),
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerHigh,
                  border: Border(top: BorderSide(color: colorScheme.outlineVariant)),
                ),
                child: const CartSummary(),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class CartSummary extends StatelessWidget {
  const CartSummary({super.key});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Subtotal'),
            Text('C\$ ${((viewModel.subtotal) + (viewModel.totalDiscounts)).toStringAsFixed(2)}'),
          ],
        ),
        if (viewModel.totalDiscounts > 0)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Descuentos (Promos)', style: TextStyle(color: Colors.green)),
              Text('-C\$ ${(viewModel.totalDiscounts).toStringAsFixed(2)}', style: const TextStyle(color: Colors.green)),
            ],
          ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('IVA (15%)'),
            Text('C\$ ${(viewModel.totalTax).toStringAsFixed(2)}'),
          ],
        ),
        const Divider(),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('TOTAL', style: TextStyle(fontWeight: FontWeight.bold, fontSize: ResponsiveBreakpoints.isHandheld(context) ? 20 : 24)),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  'C\$ ${(viewModel.total).toStringAsFixed(2)}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: ResponsiveBreakpoints.isHandheld(context) ? 20 : 24,
                    color: colorScheme.primary,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            const Text('Exento General', style: TextStyle(fontWeight: FontWeight.bold)),
            const Spacer(),
            Switch(
              value: viewModel.isGlobalTaxExempt,
              onChanged: (_) => viewModel.toggleGlobalTaxExempt(),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: viewModel.cart.isEmpty
                ? null
                : () => _requestSupervisorOverrideForManualDiscount(context),
            child: const Text('DESCUENTO MANUAL'),
          ),
        ),
        const SizedBox(height: 8),
        if (viewModel.selectedCustomer != null || viewModel.customerName != null) ...[
          InputChip(
            key: const Key('cart_customer_chip'),
            avatar: const Icon(Icons.person, size: 16, color: Colors.blue),
            label: Text(
              viewModel.selectedCustomer != null
                  ? '${viewModel.selectedCustomer!.name}${viewModel.selectedCustomer!.pointsBalance > 0 ? " (${viewModel.selectedCustomer!.pointsBalance.toStringAsFixed(0)} pts)" : ""}'
                  : 'Cliente: ${viewModel.customerName}',
            ),
            onDeleted: () => viewModel.clearCustomer(),
            deleteIconColor: Colors.red.shade700,
          ),
          const SizedBox(height: 8),
        ],
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            key: const Key('btn_select_customer'),
            onPressed: () => CustomerSelectDialog.show(context, viewModel),
            icon: const Icon(Icons.person_add_alt),
            label: Text(viewModel.selectedCustomer != null ? 'CAMBIAR CLIENTE' : 'ASIGNAR CLIENTE'),
          ),
        ),
        if ((viewModel.supportsBuzzerPager) && viewModel.buzzerNumber != null) ...[
          const SizedBox(height: 8),
          InputChip(
            key: const Key('cart_buzzer_chip'),
            avatar: const Icon(Icons.notifications_active, size: 16, color: Colors.amber),
            label: Text('Buzzer #${viewModel.buzzerNumber}'),
            onDeleted: () => viewModel.setBuzzerNumber(null),
            deleteIconColor: Colors.amber.shade900,
          ),
        ],
        const SizedBox(height: 8),
        if ((viewModel.businessModeEvaluator != null && viewModel.businessModeEvaluator.isSplitBillAllowed) && viewModel.cart.isNotEmpty) ...[
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              key: const Key('btn_split_bill_cart'),
              icon: const Icon(Icons.call_split_rounded, size: 18),
              onPressed: () => _showSplitBillDialog(context),
              label: const Text('DIVIDIR CUENTA'),
            ),
          ),
          const SizedBox(height: 6),
        ],
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: viewModel.cart.isEmpty
                    ? () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Agregue productos al carrito antes de poner en espera.'),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      }
                    : () => SaleView.showHoldTicketDialog(context),
                icon: const Icon(Icons.pause, size: 18),
                label: const Text('EN ESPERA'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: viewModel.cart.isEmpty
                    ? null
                    : () => _showCheckoutDialog(context),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: const Text('COBRAR'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showCheckoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const MultiCurrencyCheckoutDialog(),
    );
  }

  void _showSplitBillDialog(BuildContext context) {
    final vm = context.read<SaleViewModel>();
    showDialog(
      context: context,
      builder: (context) => SplitBillDialog(
        cart: vm.cart,
        commercialRate: vm.commercialRate,
        onPayShare: (share) {
          Navigator.of(context).pop();
          _showCheckoutDialog(context);
        },
      ),
    );
  }

  Future<void> _requestSupervisorOverrideForManualDiscount(BuildContext context) async {
    final amount = await _promptManualDiscountAmount(context);
    if (!context.mounted || amount == null || amount <= 0) return;

    final viewModel = context.read<SaleViewModel>();
    viewModel.applyManualDiscount(amount);

    if (viewModel.errorMessage != 'Acceso denegado.') {
      return;
    }

    final authRepo = context.read<AuthRepository>();
    final auditRepo = context.read<AuditRepository>();

    final authorized = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => SupervisorOverrideModal(
        onAuthorize: (request) {
          final pin = request.method == SupervisorAuthorizationMethod.pin
              ? request.credential
              : null;
          final totp = request.method == SupervisorAuthorizationMethod.totp
              ? request.credential
              : null;
          return authRepo.authorizeOverride(
            supervisorId: request.supervisorId,
            pin: pin,
            totpCode: totp,
          );
        },
        onAuditSuccess: (request) {
          final method =
              request.method == SupervisorAuthorizationMethod.pin ? 'PIN' : 'TOTP';
          return auditRepo.logForensic(
            'SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT',
            metodoAutorizacion: method,
            usuarioAutorizadorId: request.supervisorId,
            metadata: '{"action":"manual_discount"}',
          );
        },
      ),
    );

    if (!context.mounted || authorized != true) return;

    viewModel.grantSupervisorOverride();
    viewModel.applyManualDiscount(amount);
  }

  Future<double?> _promptManualDiscountAmount(BuildContext context) async {
    final controller = TextEditingController();
    return showDialog<double>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Descuento manual'),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Monto de descuento'),
            autofocus: true,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(
              dialogContext,
              double.tryParse(controller.text.trim()),
            ),
            child: const Text('Aplicar'),
          ),
        ],
      ),
    );
  }
}

class CheckoutDialog extends StatefulWidget {
  const CheckoutDialog({super.key});

  @override
  State<CheckoutDialog> createState() => _CheckoutDialogState();
}

class _CheckoutDialogState extends State<CheckoutDialog> {
  final Map<PaymentMethod, double> _payments = {
    PaymentMethod.cash: 0.0,
    PaymentMethod.card: 0.0,
    PaymentMethod.qr: 0.0,
  };
  
  final Map<PaymentMethod, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    final total = context.read<SaleViewModel>().total;
    _payments[PaymentMethod.cash] = total;
    
    for (var method in _payments.keys) {
      _controllers[method] = TextEditingController(text: _payments[method]!.toStringAsFixed(2));
    }
  }

  @override
  void dispose() {
    for (var controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final total = viewModel.total;
    final paid = _payments.values.fold(0.0, (sum, val) => sum + val);
    final remaining = total - paid;
    final colorScheme = Theme.of(context).colorScheme;

    return AlertDialog(
      title: const Text('Finalizar Venta - Pagos'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4), side: BorderSide(color: colorScheme.primary, width: 2)),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 450),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Total a Pagar: C\$ ${total.toStringAsFixed(2)}', 
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const Divider(),
              ..._payments.keys.map((method) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 8.0),
                child: Row(
                  children: [
                    Expanded(flex: 2, child: Text(method.name.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold))),
                    Expanded(
                      flex: 3,
                      child: TextField(
                        controller: _controllers[method],
                        decoration: const InputDecoration(prefixText: 'C\$ '),
                        keyboardType: TextInputType.number,
                        onChanged: (val) {
                          setState(() {
                            _payments[method] = double.tryParse(val) ?? 0.0;
                          });
                        },
                        onTap: () {
                          final c = _controllers[method]!;
                          c.selection = TextSelection(baseOffset: 0, extentOffset: c.text.length);
                        },
                      ),
                    ),
                  ],
                ),
              )),
              const Divider(),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Restante:', style: TextStyle(color: Colors.red, fontSize: 18, fontWeight: FontWeight.bold)),
                  Text('C\$ ${remaining.toStringAsFixed(2)}', 
                    style: TextStyle(color: remaining == 0 ? Colors.green : Colors.red, fontWeight: FontWeight.bold, fontSize: 18)),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: remaining != 0 
            ? null 
            : () {
                final methods = _payments.entries
                  .where((e) => e.value > 0)
                  .map((e) => e.key)
                  .toList();
                context.read<SaleViewModel>().finalizeSale(methods);
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Venta Finalizada Correctamente')),
                );
              }, 
          child: const Text('FINALIZAR'),
        ),
      ],
    );
  }
}

class PromotionsManagerDialog extends StatelessWidget {
  const PromotionsManagerDialog({super.key});

  static void show(BuildContext context) {
    final saleViewModel = context.read<SaleViewModel>();
    showDialog(
      context: context,
      builder: (dialogContext) => ChangeNotifierProvider<SaleViewModel>.value(
        value: saleViewModel,
        child: const PromotionsManagerDialog(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final promotions = viewModel.allPromotions;
    final colorScheme = Theme.of(context).colorScheme;

    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.local_offer, color: Colors.deepOrange),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Control de Promociones',
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
      content: SizedBox(
        width: 420,
        height: 360,
        child: promotions.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Text(
                    'No hay promociones registradas en el sistema.',
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            : ListView.separated(
                itemCount: promotions.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final promo = promotions[index];
                  return SwitchListTile(
                    dense: true,
                    isThreeLine: true,
                    title: Text(
                      promo.name,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: promo.isActive ? colorScheme.onSurface : Colors.grey,
                      ),
                    ),
                    subtitle: Text(
                      promo.type == PromotionType.buyXGetYFree
                          ? '2x1 (Paga ${promo.buyQuantity} Lleva ${promo.buyQuantity + promo.getQuantity})'
                          : (promo.type == PromotionType.percentageDiscount
                              ? '${promo.discountValue.toStringAsFixed(0)}% de descuento'
                              : 'Descuento C\$ ${promo.discountValue.toStringAsFixed(2)}'),
                      style: TextStyle(
                        fontSize: 12,
                        color: promo.isActive ? Colors.deepOrange.shade800 : Colors.grey,
                      ),
                    ),
                    value: promo.isActive,
                    activeColor: Colors.deepOrange,
                    onChanged: (val) {
                      viewModel.togglePromotion(promo.id, val);
                    },
                  );
                },
              ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('CERRAR'),
        ),
      ],
    );
  }
}
