import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../domain/models/inventory/product.dart';
import '../../../domain/models/sales/cart_item.dart';
import '../../../domain/services/printer/kitchen_modifier_lines.dart';
import '../../../domain/models/sales/hold_ticket.dart';
import '../../../data/services/sync_service.dart';
import '../../../domain/models/sales/payment.dart';
import '../../../domain/models/sales/promotion.dart';
import '../../../domain/models/user.dart';
import '../../../domain/repositories/auth_repository.dart';
import '../../../domain/repositories/audit_repository.dart';
import '../../../data/database/app_database.dart';
import '../../../core/localization/label_map.dart';
import '../../../core/navigation/route_observer.dart';
import '../../widgets/app_drawer.dart';
import '../../features/identity/supervisor_override_modal.dart';
import '../../design_system/design_system.dart';
import '../cash/cash_shift_view_model.dart';
import '../cash/widgets/close_shift_dialog.dart' show showCloseShiftFlow;
import 'widgets/product_card_thumbnail.dart';
import 'widgets/multi_currency_checkout_dialog.dart';
import 'widgets/tip_dialog.dart';
import 'widgets/split_bill_dialog.dart';
import 'widgets/cloud_sync_status_badge.dart';
import 'tables/table_layout_view.dart';
import '../../../presentation/features/sales/widgets/customer_select_dialog.dart';
import '../config/business_profile/fiscal_authorization_expiry_notice_widget.dart';
import '../../../presentation/features/sales/widgets/loyalty_compact_widget.dart';
import '../../../presentation/features/sales/widgets/reward_cta_widget.dart';
import '../../../presentation/features/sales/widgets/reward_confirmation_dialog.dart';

/// F3b: the REPLACE semantics of a re-parked account are a deliberate
/// decision, but the operator must see in numbers what a save discards.
/// Disclosure only: this never blocks the normal "add a product and save"
/// flow, which is by far the most common edit.
String _editAccountBanner(HoldTicket account, List<CartItem> cart) {
  String count(int n) => n == 1 ? 'producto' : 'productos';
  String money(double v) => 'C\$ ${v.toStringAsFixed(2)}';
  double totalOf(List<CartItem> items) =>
      items.fold<double>(0, (sum, i) => sum + i.grossAmount);

  final storedTotal = totalOf(account.items);
  final cartTotal = totalOf(cart);
  final dropped = storedTotal - cartTotal;

  final buffer = StringBuffer()
    ..write('Está editando la cuenta abierta "${account.name}". ')
    ..write('Al guardar, sus ${account.items.length} ${count(account.items.length)} ')
    ..write('por ${money(storedTotal)} pasan a ser los ${cart.length} ')
    ..write('${count(cart.length)} del carrito, por ${money(cartTotal)}. ')
    ..write('No se crea una cuenta nueva.');

  if (dropped > 0.005) {
    buffer.write('\n\nSe pierden ${money(dropped)} de productos que no están '
        'en el carrito.');
  }
  return buffer.toString();
}

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

    // F3 (open accounts fix): when a recalled account is loaded, the operator
    // is EDITING that account — seed the field with its name and say so, so
    // they are never blind to what a save will replace.
    final loadedAccount = vm.activeLoadedHoldTicket;
    final controller = TextEditingController(text: loadedAccount?.name ?? '');
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
            title: Text(loadedAccount != null
                ? 'Editar Cuenta Abierta'
                : 'Poner Venta en Espera'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (loadedAccount != null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.secondaryContainer,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.edit_note,
                                size: 20,
                                color: Theme.of(context).colorScheme.onSecondaryContainer),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _editAccountBanner(loadedAccount, vm.cart),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
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
                      content: Text(loadedAccount != null
                          ? 'Cuenta "$name" actualizada con éxito.'
                          : 'Venta "$name" puesta en espera con éxito.'),
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

class _SaleViewState extends State<SaleView> with WidgetsBindingObserver, RouteAware {
  late final SaleViewModel _viewModel;
  bool _errorPresentationScheduled = false;
  bool _loyaltyWarningPresentationScheduled = false;
  ModalRoute<void>? _modalRoute;

  @override
  void initState() {
    super.initState();
    _viewModel = context.read<SaleViewModel>();
    _viewModel.addListener(_presentError);
    _viewModel.addListener(_presentLoyaltyWarning);
    _presentError();
    _presentLoyaltyWarning();
    WidgetsBinding.instance.addObserver(this);
    _checkAuth();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<SaleViewModel>().setSearchQuery('');
        context.read<SaleViewModel>().checkActiveSession();
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != null && route != _modalRoute) {
      appRouteObserver.unsubscribe(this);
      _modalRoute = route;
      appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    appRouteObserver.unsubscribe(this);
    _viewModel.removeListener(_presentError);
    _viewModel.removeListener(_presentLoyaltyWarning);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didPopNext() {
    if (!mounted) return;
    context.read<SaleViewModel>().loadCompanyTaxRegime();
  }

  void _presentError() {
    if (!mounted ||
        _errorPresentationScheduled ||
        _viewModel.errorMessage == null) {
      return;
    }

    _errorPresentationScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      final errorMessage = _viewModel.errorMessage;
      if (errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Theme.of(context).colorScheme.error,
            action: SnackBarAction(
              label: 'OK',
              textColor: Colors.white,
              onPressed: _viewModel.clearError,
            ),
          ),
        );
        _viewModel.clearError();
      }
      _errorPresentationScheduled = false;
    });
  }

  /// POS-B (re-audit): after a successful sale completion, if a loyalty
  /// operation failed along the way, show a NON-blocking warning. The sale
  /// WAS registered — the copy says so honestly (NHILOS §19.2/§31:
  /// specific, calm, no dead end) and never blocks or alters the sale flow.
  void _presentLoyaltyWarning() {
    if (!mounted ||
        _loyaltyWarningPresentationScheduled ||
        !_viewModel.hasPendingLoyaltyWarning) {
      return;
    }

    _loyaltyWarningPresentationScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loyaltyWarningPresentationScheduled = false;
      if (!mounted) return;
      _viewModel.consumePendingLoyaltyWarning();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'La venta se registró, pero los puntos de lealtad no se actualizaron.',
          ),
          duration: Duration(seconds: 4),
        ),
      );
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      context.read<SaleViewModel>().checkActiveSession();
    }
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

  Future<void> _requestSupervisorOverrideForCloseBox() async {
    final authRepo = context.read<AuthRepository>();
    final currentUser = await authRepo.getCurrentUser();

    // Si el usuario ya es Owner o Manager, abrir directamente el corte Z
    if (currentUser?.role == UserRole.owner || currentUser?.role == UserRole.manager) {
      if (mounted) await _openUnifiedZClose();
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
      await _openUnifiedZClose();
    }
  }

  /// T7 (unified close): the weak parallel close (CloseBoxDialog /
  /// SaleViewModel.closeSession, in-memory expected map) was retired. Both
  /// this entry and Control de Caja run the identical Corte Z pre-gate and
  /// blind-count dialog from the root CashShiftViewModel.
  Future<void> _openUnifiedZClose() async {
    final cashVm = context.read<CashShiftViewModel>();
    await showCloseShiftFlow(context, cashVm);
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


class SearchBarWidget extends StatefulWidget {
  const SearchBarWidget({super.key});

  @override
  State<SearchBarWidget> createState() => _SearchBarWidgetState();
}

class _SearchBarWidgetState extends State<SearchBarWidget> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Flutter's route FocusScope remembers its focused child while this
    // route is covered by another one and restores it when the route is
    // revealed again (push + pop navigation), which reopened the keyboard
    // on every re-entry to the Sales screen. Drop focus while the route is
    // not current so there is nothing left to restore.
    final ModalRoute<dynamic>? route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) {
      _focusNode.unfocus();
    }
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
        focusNode: _focusNode,
        // Flutter's default tap-outside behavior intentionally keeps focus
        // for touch events on mobile platforms (the operator's POS
        // terminal), leaving the cursor and keyboard stuck on the search
        // field. Dismiss them on any tap outside the field.
        onTapOutside: (_) => _focusNode.unfocus(),
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
          // F4: bounded scrollable column instead of a shrinkWrap ListView —
          // AlertDialog measures its content with IntrinsicWidth and a
          // ShrinkWrappingViewport cannot compute intrinsics (crash whenever
          // the list had at least one ticket).
          : ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 420),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final ticket in viewModel.holdTickets)
                      _holdTicketRow(context, viewModel, ticket),
                  ],
                ),
              ),
            ),
      ),
    );
  }

  Widget _holdTicketRow(
    BuildContext context,
    SaleViewModel viewModel,
    HoldTicket ticket,
  ) {
    return ListTile(
      title: Text(ticket.name),
      subtitle: Text('${ticket.items.length} productos'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('C\$ ${ticket.items.fold(0.0, (sum, i) => sum + i.grossAmount).toStringAsFixed(2)}'),
          const SizedBox(width: 4),
          // F4 (open accounts fix): discard an account that will never be
          // invoiced. Destructive styling (error color) separates it from
          // the frequent, safe recall tap, per the nhilos experience
          // standard (§12.5, §23).
          IconButton(
            icon: const Icon(Icons.delete_outline),
            color: Theme.of(context).colorScheme.error,
            tooltip: 'Abandonar cuenta',
            onPressed: () => _confirmAbandon(context, viewModel, ticket),
          ),
        ],
      ),
      onTap: () {
        viewModel.recallTicket(ticket);
        Navigator.pop(context);
      },
    );
  }

  Future<void> _confirmAbandon(
    BuildContext context,
    SaleViewModel viewModel,
    HoldTicket ticket,
  ) async {
    final total = ticket.items.fold<double>(0, (sum, i) => sum + i.grossAmount);
    final lineCount = ticket.items.length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('¿Abandonar cuenta?'),
        content: Text(
          'La cuenta "${ticket.name}" tiene $lineCount '
          '${lineCount == 1 ? 'producto' : 'productos'} por '
          'C\$ ${total.toStringAsFixed(2)}.\n\n'
          'Nada de esto ha sido facturado. Al abandonarla se descarta '
          'definitivamente: no se puede deshacer.',
        ),
        actions: [
          // Cancel is the safe/default action (autofocused); the destructive
          // verb is explicit, per the nhilos standard (§23.1, §23.3).
          TextButton(
            autofocus: true,
            onPressed: () => Navigator.pop(dialogCtx, false),
            child: const Text('CANCELAR'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Theme.of(dialogCtx).colorScheme.error,
              foregroundColor: Theme.of(dialogCtx).colorScheme.onError,
            ),
            onPressed: () => Navigator.pop(dialogCtx, true),
            child: const Text('ABANDONAR'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await viewModel.abandonHoldTicket(ticket);
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
              borderRadius: NhilosRadii.cardRadius,
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
                      ProductCardThumbnail(
                        category: product.category,
                        productName: product.name,
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
                        style: NhilosTextStyles.tabular(
                          base: TextStyle(
                            color: promo != null ? Colors.deepOrange : colorScheme.primary,
                            fontWeight: FontWeight.bold,
                            fontSize: isHandheld ? 13 : 15,
                          ),
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
                      decoration: const BoxDecoration(
                        color: Colors.deepOrange,
                        borderRadius: NhilosRadii.badgeRadius,
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
    if (product.variants.isEmpty &&
        product.availableModifiers.isEmpty &&
        product.availableModifierGroups.isEmpty) {
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
  // Legacy flat modifiers: unreachable today, but never a silent sink.
  final List<Modifier> _selectedLegacyModifiers = [];
  // Grouped selection state, keyed per GROUP for radios and per OPTION for
  // checkboxes and quantities. Checkbox and quantity groups start EMPTY:
  // the operator opts in, the dialog never silently adds price.
  final Map<String, String> _selectedRadioOption = {};
  final Map<String, bool> _checkedOptions = {};
  final Map<String, int> _optionQuantities = {};
  // Inline error shows only while the required group is still unsatisfied.
  bool _showMissingGroupError = false;

  @override
  void initState() {
    super.initState();
    if (widget.product.variants.isNotEmpty) {
      _selectedVariantId = widget.product.variants.first.id;
    }
    // Radio groups preselect the option flagged as default, when present.
    for (final group in widget.product.availableModifierGroups) {
      if (group.maxSelected == 1) {
        for (final option in group.options) {
          if (option.isDefault) {
            _selectedRadioOption[group.id] = option.id;
            break;
          }
        }
      }
    }
  }

  /// Whole-price display for deltas ('+C$ 5'), consistent with the variant
  /// idiom but without the trailing '.0' doubles would print.
  String _formatDelta(double priceDelta) =>
      priceDelta % 1 == 0 ? priceDelta.toInt().toString() : '$priceDelta';

  String _groupHint(EffectiveModifierGroup group) {
    if (group.maxSelected == 1) {
      return 'Elige una opción';
    }
    if (group.allowQuantities) {
      return 'Elige hasta ${group.maxSelected} · puedes repetir';
    }
    return 'Elige hasta ${group.maxSelected}';
  }

  /// First group whose selected total is below its minimum, if any: radio
  /// groups count 0/1, checkboxes count checked options, quantity groups
  /// sum their steppers.
  String? _firstUnsatisfiedGroupName() {
    for (final group in widget.product.availableModifierGroups) {
      final total = group.maxSelected == 1
          ? (_selectedRadioOption[group.id] != null ? 1 : 0)
          : group.allowQuantities
              ? group.options.fold<int>(
                  0, (sum, o) => sum + (_optionQuantities[o.id] ?? 0))
              : group.options
                  .where((o) => _checkedOptions[o.id] == true)
                  .length;
      if (total < group.minSelected) return group.name;
    }
    return null;
  }

  void _incrementQuantity(
    EffectiveModifierGroup group,
    EffectiveModifierOption option,
  ) {
    setState(() {
      final currentTotal = group.options
          .fold<int>(0, (sum, o) => sum + (_optionQuantities[o.id] ?? 0));
      // The TOTAL quantity across the group's options never exceeds the
      // group's limit; the minus button floors each option at zero.
      if (currentTotal >= group.maxSelected) return;
      _optionQuantities[option.id] = (_optionQuantities[option.id] ?? 0) + 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    // The inline error shows only while the group is still unsatisfied, so
    // it clears itself the moment the operator fixes the selection.
    final missingGroup =
        _showMissingGroupError ? _firstUnsatisfiedGroupName() : null;
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
              // Legacy flat modifiers: unreachable in today's read path, but
              // rendered (same look as before the grouped selector) so they
              // are never silently dropped.
              if (widget.product.availableModifiers.isNotEmpty) ...[
                const Text('Modificadores:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ...widget.product.availableModifiers.map((m) => CheckboxListTile(
                  dense: true,
                  title: Text('${m.name} (+C\$ ${m.extraPrice})'),
                  value: _selectedLegacyModifiers.contains(m),
                  onChanged: (selected) => setState(() {
                    if (selected == true) {
                      _selectedLegacyModifiers.add(m);
                    } else {
                      _selectedLegacyModifiers.remove(m);
                    }
                  }),
                )),
                const Divider(),
              ],
              // One section per group, in the order the resolver produced
              // (category-inherited first, product exceptions last — already
              // deterministic; never re-sorted here).
              if (missingGroup != null) ...[
                Text(
                  'Falta elegir una opción en «$missingGroup»',
                  style: TextStyle(color: colorScheme.error),
                ),
                const SizedBox(height: 8),
              ],
              for (final group in widget.product.availableModifierGroups) ...[
                Text(group.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(
                  _groupHint(group),
                  style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 4),
                if (group.maxSelected == 1)
                  RadioGroup<String>(
                    groupValue: _selectedRadioOption[group.id] ?? '',
                    onChanged: (val) => setState(() {
                      // A null callback value clears the selection.
                      if (val == null) {
                        _selectedRadioOption.remove(group.id);
                      } else {
                        _selectedRadioOption[group.id] = val;
                      }
                    }),
                    child: Column(
                      children: group.options
                          .map(
                            (option) => RadioListTile<String>(
                              dense: true,
                              title: Text(
                                '${option.name} (+C\$ ${_formatDelta(option.priceDelta)})',
                              ),
                              value: option.id,
                            ),
                          )
                          .toList(),
                    ),
                  )
                else if (group.allowQuantities)
                  Column(
                    children: [
                      for (final option in group.options)
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${option.name} (+C\$ ${_formatDelta(option.priceDelta)})',
                              ),
                            ),
                            IconButton(
                              key: Key('modifier_qty_minus_${option.id}'),
                              icon: const Icon(Icons.remove_circle_outline),
                              onPressed: () => setState(() {
                                final current = _optionQuantities[option.id] ?? 0;
                                if (current > 0) {
                                  _optionQuantities[option.id] = current - 1;
                                }
                              }),
                            ),
                            Text(
                              '${_optionQuantities[option.id] ?? 0}',
                              key: Key('modifier_qty_count_${option.id}'),
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            IconButton(
                              key: Key('modifier_qty_plus_${option.id}'),
                              icon: const Icon(Icons.add_circle_outline),
                              onPressed: () => _incrementQuantity(group, option),
                            ),
                          ],
                        ),
                    ],
                  )
                else
                  Column(
                    children: group.options
                        .map(
                          (option) => CheckboxListTile(
                            dense: true,
                            title: Text(
                              '${option.name} (+C\$ ${_formatDelta(option.priceDelta)})',
                            ),
                            value: _checkedOptions[option.id] ?? false,
                            onChanged: (selected) => setState(() {
                              if (selected != true) {
                                // Unchecking is always allowed.
                                _checkedOptions[option.id] = false;
                                return;
                              }
                              // Same total-bound as the steppers: the
                              // header promises 'Elige hasta N', so a full
                              // group ignores the extra tap.
                              final checkedCount = group.options
                                  .where((o) => _checkedOptions[o.id] == true)
                                  .length;
                              if (checkedCount >= group.maxSelected) return;
                              _checkedOptions[option.id] = true;
                            }),
                          ),
                        )
                        .toList(),
                  ),
                const Divider(),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: () {
            // A required group left empty blocks the add: nothing reaches
            // the cart and the dialog stays open with a friendly hint.
            if (_firstUnsatisfiedGroupName() != null) {
              setState(() => _showMissingGroupError = true);
              return;
            }
            // Puente hacia el carrito: cada opción elegida se entrega como
            // un modificador del modelo existente con su precio POR UNIDAD
            // y su cantidad explícita; las opciones sin selección no generan
            // entrada. Así los totales, el recibo y la comanda de cocina
            // muestran la cantidad real sin tocar el modelo del carrito.
            final selectedModifiers = <Modifier>[];
            selectedModifiers.addAll(_selectedLegacyModifiers);
            for (final group in widget.product.availableModifierGroups) {
              for (final option in group.options) {
                if (group.maxSelected == 1) {
                  if (_selectedRadioOption[group.id] == option.id) {
                    selectedModifiers.add(
                      Modifier(
                        id: option.id,
                        name: option.name,
                        extraPrice: option.priceDelta,
                        quantity: 1,
                      ),
                    );
                  }
                } else if (group.allowQuantities) {
                  final quantity = _optionQuantities[option.id] ?? 0;
                  if (quantity > 0) {
                    selectedModifiers.add(
                      Modifier(
                        id: option.id,
                        name: option.name,
                        // Precio POR UNIDAD: la cantidad viaja en su campo
                        // propio para que totales y comanda sepan cuántas.
                        extraPrice: option.priceDelta,
                        quantity: quantity,
                      ),
                    );
                  }
                } else if (_checkedOptions[option.id] == true) {
                  selectedModifiers.add(
                    Modifier(
                      id: option.id,
                      name: option.name,
                      extraPrice: option.priceDelta,
                      quantity: 1,
                    ),
                  );
                }
              }
            }
            context.read<SaleViewModel>().addToCart(
              widget.product,
              variantId: _selectedVariantId,
              modifiers: selectedModifiers,
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
  late final TextEditingController usdController;

  @override
  void initState() {
    super.initState();
    // D-16: controllers start EMPTY — '0.00' is only a hintText, so the
    // operator types their own figure instead of appending to a seeded one.
    controller = TextEditingController();
    // D-21: the USD initial float rides next to the NIO float, mirroring
    // open_shift_dialog.dart so the session opens with both currencies.
    usdController = TextEditingController();
  }

  @override
  void dispose() {
    controller.dispose();
    usdController.dispose();
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
                  key: const Key('box_opening_nio_input'),
                  controller: controller,
                  decoration: const InputDecoration(
                    // D-20: symbol-first short label so the currency marker
                    // survives truncation on narrow handhelds.
                    labelText: 'Fondo C\$',
                    hintText: '0.00',
                    prefixText: 'C\$ ',
                  ),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: isHandheld ? 18 : 20),
                  onTap: () {
                    controller.selection = TextSelection(baseOffset: 0, extentOffset: controller.text.length);
                  },
                ),
                SizedBox(height: isHandheld ? 16 : 24),
                TextField(
                  key: const Key('box_opening_usd_input'),
                  controller: usdController,
                  decoration: const InputDecoration(
                    // D-20: symbol-first short label (matches
                    // open_shift_dialog.dart's USD field convention).
                    labelText: 'Fondo USD',
                    hintText: '0.00',
                    prefixText: '\$ ',
                  ),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: isHandheld ? 18 : 20),
                  onTap: () {
                    usdController.selection = TextSelection(baseOffset: 0, extentOffset: usdController.text.length);
                  },
                ),
                SizedBox(height: isHandheld ? 16 : 24),
                ElevatedButton(
                  onPressed: viewModel.currentUserRole != null && viewModel.currentUserRole != UserRole.waiter
                      ? () async {
                          final balance = double.tryParse(controller.text) ?? 0.0;
                          final balanceUsd = double.tryParse(usdController.text) ?? 0.0;
                          await context.read<SaleViewModel>().openSession(
                            balance,
                            balanceUsd: balanceUsd,
                          );
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
                  'Total: C\$ ${(viewModel.tipAmount > 0 ? viewModel.grandTotalWithTip : viewModel.total).toStringAsFixed(2)}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: colorScheme.onPrimaryContainer,
                    fontFeatures: const [FontFeature.tabularFigures()],
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
        // D-21 (#554) U4: warning-only DGI authorization expiry notice at the
        // top of the sale screen so the operator sees it before invoicing.
        // Best-effort load; renders nothing when unconfigured and NEVER
        // blocks checkout.
        const FiscalAuthorizationExpiryNoticeLoader(),
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
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (item.selectedModifiers.isNotEmpty)
                          Text(
                            // Mismo formato que la comanda de cocina:
                            // '<cantidad>x <nombre>' por cada opción.
                            item.selectedModifiers
                                .map(
                                  (modifier) => KitchenModifierLines
                                      .quantityLabel(
                                    modifier.quantity,
                                    modifier.name,
                                  ),
                                )
                                .join(', '),
                            style: TextStyle(
                              fontSize: 12,
                              color: colorScheme.onSurfaceVariant,
                            ),
                          ),
                        Row(
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
                      ],
                    ),
                    trailing: Text('C\$ ${(item.subtotal + item.modifiersTotal).toStringAsFixed(2)}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
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
            Text(
              'C\$ ${((viewModel.subtotal) + (viewModel.totalDiscounts)).toStringAsFixed(2)}',
              style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
            ),
          ],
        ),
        if (viewModel.totalDiscounts > 0)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Descuentos (Promos)', style: TextStyle(color: NhilosColors.success)),
              Text(
                '-C\$ ${(viewModel.totalDiscounts).toStringAsFixed(2)}',
                style: const TextStyle(
                  color: NhilosColors.success,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        if (viewModel.tipAmount > 0)
          Row(
            key: const Key('cart_tip_row'),
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Propina'),
              Text('C\$ ${viewModel.tipAmount.toStringAsFixed(2)}'),
            ],
          ),
        if (viewModel.totalTax > 0 || viewModel.companyTaxRegime?.isRegimenGeneral == true)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('IVA'),
              Text(
                'C\$ ${(viewModel.totalTax).toStringAsFixed(2)}',
                style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
              ),
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
                  'C\$ ${(viewModel.tipAmount > 0 ? viewModel.grandTotalWithTip : viewModel.total).toStringAsFixed(2)}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: ResponsiveBreakpoints.isHandheld(context) ? 20 : 24,
                    color: colorScheme.primary,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ),
          ],
        ),
        if (viewModel.totalTax > 0 || viewModel.companyTaxRegime?.isRegimenGeneral == true) ...[
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
        ],
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
          // Loyalty evaluation display
          LoyaltyCompactWidget(evaluation: viewModel.currentEvaluation),
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
        // D-7: direct tip entry on the checkout — available whenever the
        // cart is not empty, NEVER behind the isSplitBillAllowed gate.
        if (viewModel.cart.isNotEmpty) ...[
          if (viewModel.tipAmount > 0)
            SizedBox(
              width: double.infinity,
              child: InputChip(
                key: const Key('btn_tip_cart'),
                avatar: const Icon(
                  Icons.volunteer_activism,
                  size: 16,
                  color: Colors.teal,
                ),
                label: Text(
                  'PROPINA: C\$ ${viewModel.tipAmount.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                backgroundColor: Colors.teal.shade50,
                onDeleted: () => viewModel.clearTip(),
                deleteIconColor: Colors.red.shade700,
                onPressed: () => _showTipDialog(context),
              ),
            )
          else
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: const Key('btn_tip_cart'),
                icon: const Icon(Icons.volunteer_activism, size: 18),
                onPressed: () => _showTipDialog(context),
                label: const Text('PROPINA'),
              ),
            ),
          const SizedBox(height: 6),
        ],
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
        // Reward CTA when eligible reward exists
        RewardCtaWidget(
          evaluation: viewModel.currentEvaluation,
          onApplyReward: () => _showRewardConfirmationDialog(context, viewModel),
        ),
        const SizedBox(height: 8),
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

  Future<void> _showCheckoutDialog(BuildContext context) async {
    // D-5: refresh the FX rates before every checkout. `loadExchangeRates()`
    // otherwise only runs in the SaleViewModel constructors, so a rate change
    // (business profile edit, or a synced fiscal config) would not reach an
    // already-running terminal until the POS was restarted — wrong USD
    // equivalents on the day of the change.
    final vm = context.read<SaleViewModel>();
    await vm.loadExchangeRates();
    if (!context.mounted) return;
    // #67/T2a: with an unreliable rate the checkout dialog never opens —
    // the operator learns BEFORE ringing up the whole sale, not after
    // pressing COBRAR. The directive message rides the standard error path.
    if (vm.gateCheckoutOnFxRates() != null) return;
    showDialog(
      context: context,
      builder: (context) => const MultiCurrencyCheckoutDialog(),
    );
  }

  /// D-7: direct tip entry on the checkout (independent of the gated
  /// DIVIDIR CUENTA flow).
  Future<void> _showTipDialog(BuildContext context) async {
    // #67/T2a: same gate as the checkout and split dialogs — an unknown rate
    // must not render tip USD equivalents computed from a fabricated number.
    final vm = context.read<SaleViewModel>();
    await vm.loadExchangeRates();
    if (!context.mounted) return;
    if (vm.gateCheckoutOnFxRates() != null) return;
    await TipDialog.show(context);
  }

  Future<void> _showSplitBillDialog(BuildContext context) async {
    final vm = context.read<SaleViewModel>();
    // D-5: same refresh as the checkout — the split dialog prints the
    // checkout rate and computes share equivalents from it. T2b/#67: that
    // rate is the APPLIED one (vm.activeCheckoutRate, the BCN rate in
    // BCN_OFFICIAL mode), so what the operator sees matches what is
    // charged — the office's commercial configuration lives in
    // local_configs / the business-profile mirror, not on this dialog.
    await vm.loadExchangeRates();
    if (!context.mounted) return;
    // #67/T2a: same gate as the checkout — an unknown rate must not render
    // split equivalents computed from a fabricated number.
    if (vm.gateCheckoutOnFxRates() != null) return;
    showDialog(
      context: context,
      builder: (context) => SplitBillDialog(
        cart: vm.cart,
        commercialRate: vm.activeCheckoutRate,
        taxRegime: vm.companyTaxRegime,
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

  Future<void> _showRewardConfirmationDialog(BuildContext context, SaleViewModel viewModel) async {
    final nextReward = viewModel.currentEvaluation?.nextReward;
    if (nextReward == null) return;

    final confirmed = await RewardConfirmationDialog.show(
      context,
      reward: nextReward,
    );

    if (confirmed == true && context.mounted) {
      // Apply the reward via the view model
      viewModel.selectReward(nextReward.rewardId);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Recompensa "${nextReward.name}" aplicada'),
          backgroundColor: Colors.green.shade700,
        ),
      );
    }
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
    final vm = context.read<SaleViewModel>();
    // D-7: the legacy multi-payment dialog charges what the operator
    // confirmed — grandTotalWithTip when a tip is applied.
    final total = vm.tipAmount > 0 ? vm.grandTotalWithTip : vm.total;
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
    final total = viewModel.tipAmount > 0
        ? viewModel.grandTotalWithTip
        : viewModel.total;
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
                    Expanded(flex: 2, child: Text(localize(method.name, kPaymentMethodLabels), style: const TextStyle(fontWeight: FontWeight.bold))),
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
