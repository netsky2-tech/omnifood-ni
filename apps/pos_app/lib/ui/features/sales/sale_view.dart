import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../domain/models/inventory/product.dart';
import '../../../domain/usecases/inventory/authority_sale_time.dart';
import '../../../domain/usecases/inventory/modifier_effect_preview.dart';
import '../../../domain/models/config/supervision_policy.dart';
import '../../../domain/services/config/tenant_config_service.dart';
import '../../../domain/models/sales/cart_item.dart';
import '../../../domain/services/config/discount_policy_service.dart';
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
import '../../features/identity/supervisor_authorization.dart';
import '../../design_system/design_system.dart';
import '../cash/cash_shift_view_model.dart';
import '../cash/widgets/close_shift_dialog.dart' show showCloseShiftFlow;
import 'widgets/category_filter_bar.dart';
import 'widgets/product_grid_skeleton.dart';
import 'widgets/product_card.dart';
import 'widgets/product_card_thumbnail.dart';
import 'widgets/product_grid_geometry.dart';
import 'widgets/multi_currency_checkout_dialog.dart';
import 'widgets/modifier_quantity_override_content.dart';
import 'widgets/modifier_quantity_dialog.dart';
import 'widgets/tip_dialog.dart';
import 'widgets/split_bill_dialog.dart';
import 'widgets/cloud_sync_status_badge.dart';
import 'widgets/fx_rate_block_banner.dart';
import 'widgets/inventory_enrichment_warning_banner.dart';
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

  /// Round-2 D-3: the mobile cart is a modal bottom sheet, so a Scaffold
  /// SnackBar renders BEHIND it and the operator has to collapse the cart to
  /// read a refusal. While the sheet is open its own banner owns the message.
  bool _isCartSheetOpen = false;
  bool _loyaltyWarningPresentationScheduled = false;

  /// Category currently filtered in the catalog, or null for "Todas".
  /// Search lives in the view model because it is shared with the scanner
  /// flow; the category is presentation state and lives with the screen (§14).
  String? _selectedCategory;
  ModalRoute<void>? _modalRoute;

  @override
  void initState() {
    super.initState();
    _viewModel = context.read<SaleViewModel>();
    _viewModel.addListener(_presentError);
    _viewModel.addListener(_presentLoyaltyWarning);
    _presentError();
    _presentLoyaltyWarning();
    _presentFiscalConfigWarning();
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

    // Round-2 D-3: while the mobile cart sheet is open, that sheet renders
    // the message in its own banner (the Scaffold SnackBar would sit behind
    // the modal). Neither duplicate it nor clear it out from under it here;
    // the sheet clears it when it closes.
    if (_isCartSheetOpen) return;

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

  /// #539 S1.3 (AC-3): a computerized-invoice ticket printed without the DGI
  /// authorization number surfaces a NON-blocking configuration warning
  /// after the sale was registered. The warning is per-print state on the
  /// view model; consuming it here prevents a stale copy from re-appearing
  /// on an unrelated rebuild.
  void _presentFiscalConfigWarning() {
    if (!mounted) return;
    final warning = _viewModel.fiscalConfigWarning;
    if (warning == null || warning.isEmpty) return;
    _viewModel.clearFiscalConfigWarning();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(warning),
        duration: const Duration(seconds: 5),
      ),
    );
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

    final productContent = _catalogContent(viewModel);
    final catalogCategories = _catalogCategories(viewModel);

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
                    if (hasActiveSession &&
                        (viewModel.canManageCashDrawer ||
                            viewModel.canCloseOwnShift))
                      const PopupMenuItem(
                        value: 'manual_drawer',
                        child: ListTile(
                          leading: Icon(Icons.point_of_sale),
                          title: Text('Abrir Gaveta Manual'),
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        ),
                      ),
                    if (hasActiveSession &&
                        (viewModel.canManageCashDrawer ||
                            viewModel.canCloseOwnShift))
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
                if (hasActiveSession &&
                    (viewModel.canManageCashDrawer || viewModel.canCloseOwnShift))
                  IconButton(
                    icon: const Icon(Icons.point_of_sale),
                    onPressed: () => _requestSupervisorOverrideForManualDrawer(),
                    tooltip: 'Abrir Gaveta Manual',
                  ),
                if (hasActiveSession &&
                    (viewModel.canManageCashDrawer || viewModel.canCloseOwnShift))
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
      // Issue #73c / R-13: the inventory enrichment warning banner is mounted
      // above both handheld and tablet/desktop layouts so operators always
      // see local sales with APPLIED_INVENTORY_PENDING outcome. Warning-only
      // (Q80 Section D4): it never blocks checkout, DGI invoicing, or
      // offline operations, and renders SizedBox.shrink at count 0.
      body: hasActiveSession
          ? Column(
              children: [
                const InventoryEnrichmentWarningBanner(),
                if (catalogCategories.isNotEmpty)
                  CategoryFilterBar(
                    categories: catalogCategories,
                    selected: _selectedCategory,
                    onSelected: _onCategorySelected,
                  ),
                Expanded(
                  child: isHandheld
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
                ),
              ),
            ],
          )
          : const BoxOpeningContent(),
    );
  }

  /// Categories configured in the loaded catalog, deduplicated and ordered.
  /// It is derived from the products themselves, so the row never offers a
  /// category that has nothing behind it.
  List<String> _catalogCategories(SaleViewModel viewModel) {
    final seen = <String>{};
    for (final product in viewModel.products) {
      final category = product.category?.trim();
      if (category != null && category.isNotEmpty) {
        seen.add(category);
      }
    }
    return seen.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
  }

  /// Products left after the screen's own category filter.
  List<Product> _visibleProducts(SaleViewModel viewModel) {
    final category = _selectedCategory;
    final products = viewModel.filteredProducts;
    if (category == null) return products;
    return products
        .where((product) => product.category?.trim() == category)
        .toList();
  }

  void _onCategorySelected(String? category) {
    setState(() => _selectedCategory = category);
  }

  void _clearCatalogFilters() {
    setState(() => _selectedCategory = null);
    _viewModel.setSearchQuery('');
  }

  /// Catalog body of the sales surface.
  ///
  /// The catalog is read from local SQLite, so the loading state is a light
  /// skeleton instead of a full-page loader (§28.1, §47). An empty catalog is
  /// told apart from an empty search because they need different copy and
  /// different recovery: resync versus clear the filter (§13.2, §29).
  Widget _catalogContent(SaleViewModel viewModel) {
    if (viewModel.isLoading) return const ProductGridSkeleton();

    final visible = _visibleProducts(viewModel);

    if (visible.isNotEmpty) {
      return ProductGrid(
        products: visible,
        promotions: viewModel.promotions,
        onProductTap: _openProduct,
      );
    }

    if (viewModel.products.isEmpty) {
      return DsEmptyState(
        icon: Icons.inventory_2_outlined,
        title: 'Todavía no hay productos',
        description:
            'Cuando el catálogo se sincronice, los productos van a aparecer acá.',
        actionLabel: 'Recargar catálogo',
        actionIcon: Icons.refresh,
        onAction: () => _viewModel.loadProducts(),
      );
    }

    final query = viewModel.searchQuery;
    final category = _selectedCategory;
    final String description;
    if (category != null && query.isNotEmpty) {
      description =
          'No hay productos de «$category» que coincidan con «$query».';
    } else if (category != null) {
      description =
          'No hay productos de «$category» que coincidan con la búsqueda.';
    } else if (query.isNotEmpty) {
      description =
          'No hay productos que coincidan con «$query». Probá con otro nombre o SKU.';
    } else {
      description = 'No hay productos que coincidan con el filtro elegido.';
    }

    return DsEmptyState(
      icon: Icons.search_off,
      title: 'Sin resultados',
      description: description,
      actionLabel: 'Limpiar filtros',
      actionIcon: Icons.close,
      onAction: _clearCatalogFilters,
    );
  }

  /// Adds a product with no options straight to the cart; a product with
  /// variants or modifiers opens its options dialog first, so an
  /// under-specified line never reaches the ticket.
  void _openProduct(Product product) {
    if (product.variants.isEmpty &&
        product.availableModifiers.isEmpty &&
        product.availableModifierGroups.isEmpty) {
      _viewModel.addToCart(product);
      return;
    }

    showDialog<void>(
      context: context,
      builder: (context) => ProductOptionsDialog(product: product),
    );
  }

  void _showMobileCartBottomSheet(BuildContext context) {
    _isCartSheetOpen = true;
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
                _CartSheetErrorBanner(viewModel: _viewModel),
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
    ).whenComplete(() {
      _isCartSheetOpen = false;
      // The sheet's banner owned the refusal while it was open; drop it now
      // so it cannot leak into the next interaction.
      _viewModel.clearError();
    });
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
    final policy = await tenantSupervisionPolicy(context);

    // La credencial (el PIN) identifica a la persona; la politica del
    // tenant decide si puede autorizar o si la operacion se auto-autoriza.
    final outcome = await showDialog<SupervisorOverrideOutcome>(
      context: context,
      builder: (dialogContext) => SupervisorOverrideModal(
        onAuthorize: (request) => authorizeWithPolicy(
          authRepository: authRepo,
          policy: policy,
          request: request,
          selfAuthorizationAllowed: policy.selfAuthorizationAllowedCloseBox,
        ),
      ),
    );

    if (!mounted || outcome == null || !outcome.authorized) return;
    // La evidencia: quien firmo, con que credencial, y si hubo supervisor.
    await auditRepo.logForensic(
      outcome.isAuthorizingRole
          ? 'SUPERVISOR_OVERRIDE_CLOSE_SESSION'
          : 'SELF_AUTHORIZED_CLOSE_SESSION',
      metodoAutorizacion: outcome.method,
      usuarioAutorizadorId: outcome.userId,
      metadata: jsonEncode({
        'action': 'close_box',
        'self_authorized': !outcome.isAuthorizingRole,
        'policy': policy.selfAuthorizationAllowedCloseBox
            ? 'SELF_ALLOWED'
            : 'SUPERVISOR_ONLY',
      }),
    );
    await _openUnifiedZClose();
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
    final policy = await tenantSupervisionPolicy(context);

    final outcome = await showDialog<SupervisorOverrideOutcome>(
      context: context,
      builder: (dialogContext) => SupervisorOverrideModal(
        onAuthorize: (request) => authorizeWithPolicy(
          authRepository: authRepo,
          policy: policy,
          request: request,
          selfAuthorizationAllowed: policy.selfAuthorizationAllowedCashDrawer,
        ),
      ),
    );

    if (!mounted || outcome == null || !outcome.authorized) return;
    await auditRepo.logForensic(
      outcome.isAuthorizingRole
          ? 'DRAWER_OPENED_MANUALLY'
          : 'SELF_AUTHORIZED_DRAWER_OPENED',
      metodoAutorizacion: outcome.method,
      usuarioAutorizadorId: outcome.userId,
      metadata: jsonEncode({
        'action': 'manual_drawer_open',
        'justification': justification,
        'self_authorized': !outcome.isAuthorizingRole,
      }),
    );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          outcome.isAuthorizingRole
              ? 'Apertura manual de gaveta autorizada y auditada.'
              : 'Apertura manual de gaveta sin supervisor: queda auditada '
                  'para su revisión.',
        ),
      ),
    );
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
          hintText: isHandheld
              // §13.1: the hint names what the operator can search by, and it
              // has to FIT: on the 384 dp terminal the field leaves ~85 dp for
              // text, so the verb stays in the magnifier icon and both keys
              // (name, SKU) are spelled out. A longer hint is ellipsised and
              // hides the SKU capability.
              ? 'Nombre o SKU'
              : 'Buscar por nombre o SKU...',
          hintStyle: TextStyle(fontSize: isHandheld ? 12 : 14),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          filled: false,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          prefixIcon: Icon(Icons.search, size: 20, color: colorScheme.primary),
          // §42.6/§43: on the 384 dp terminal the field is 150 dp wide and
          // Flutter's default 48 dp minimum prefix box left 72 dp for the hint,
          // which ellipsised "Nombre o SKU" into "Nombre o S...". The magnifier
          // is decorative — not a tap target — so its box shrinks and the
          // operator gets to read what the field accepts.
          prefixIconConstraints: const BoxConstraints(
            minWidth: 34,
            minHeight: 34,
          ),
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

/// Watches the view model and hands the operator-facing refusal to the
/// presentational banner (round-2 D-3).
class _CartSheetErrorBanner extends StatelessWidget {
  const _CartSheetErrorBanner({required this.viewModel});

  final SaleViewModel viewModel;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: viewModel,
    builder: (context, _) =>
        CartSheetErrorBanner(message: viewModel.errorMessage),
  );
}

/// Round-2 D-3: the mobile cart is a modal bottom sheet, so a
/// `ScaffoldMessenger` SnackBar renders in the page Scaffold BEHIND it and
/// the operator has to collapse the cart to notice a refusal. While the
/// sheet is open the message is rendered here, at the top of the sheet,
/// where the operator is already looking.
class CartSheetErrorBanner extends StatelessWidget {
  const CartSheetErrorBanner({super.key, required this.message});

  /// Operator-facing message; null or empty renders nothing.
  final String? message;

  @override
  Widget build(BuildContext context) {
    final error = message;
    if (error == null || error.isEmpty) return const SizedBox.shrink();
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      key: const Key('cart_sheet_error_banner'),
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: colorScheme.error, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              error,
              style: TextStyle(
                color: colorScheme.onErrorContainer,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ProductGrid extends StatelessWidget {
  const ProductGrid({
    super.key,
    required this.products,
    this.promotions = const [],
    this.onProductTap,
  });

  final List<Product> products;

  /// Promotions of the tenant. The grid renders only the active ones that
  /// target a visible product; the label copy is unchanged (2x1 / -10% /
  /// PROMO) so the badge keeps meaning the same thing on every surface.
  final List<Promotion> promotions;

  /// Catalog tap handler. The grid never adds to the cart by itself: a product
  /// with variants or modifiers has to be configured first.
  final ValueChanged<Product>? onProductTap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final geometry = ProductGridGeometry(
          viewportWidth: constraints.maxWidth,
          devicePixelRatio: MediaQuery.devicePixelRatioOf(context),
        );

        return GridView.builder(
          padding: EdgeInsets.all(geometry.horizontalPadding),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: geometry.columns,
            childAspectRatio: geometry.childAspectRatio,
            crossAxisSpacing: geometry.crossAxisSpacing,
            mainAxisSpacing: geometry.mainAxisSpacing,
          ),
          itemCount: products.length,
          itemBuilder: (context, index) {
            final product = products[index];
            final promo = promotions
                .where((p) => p.isActive && p.targetProductId == product.id)
                .firstOrNull;

            return ProductCard(
              product: product,
              promoLabel: promo == null ? null : _promoLabel(promo),
              onTap: () => onProductTap?.call(product),
            );
          },
        );
      },
    );
  }

  static String _promoLabel(Promotion promo) {
    if (promo.type == PromotionType.buyXGetYFree) return '2x1';
    if (promo.type == PromotionType.percentageDiscount) {
      return '-${promo.discountValue.toStringAsFixed(0)}%';
    }
    return 'PROMO';
  }
}

class ProductOptionsDialog extends StatefulWidget {
  final Product product;

  /// The instant the dialog resolves the ACTIVE recipe version against.
  ///
  /// Injectable so a test can pin the instant — and the timezone — it
  /// asserts on. The authority stores `effective_from` in UTC; a LOCAL
  /// wall-clock string compared against it makes the dialog believe a
  /// version published minutes ago is not yet in force (the rig showed
  /// exactly that: the inherited quantity never reached the operator in
  /// Nicaragua's UTC-6).
  final DateTime? now;

  const ProductOptionsDialog({
    super.key,
    required this.product,
    this.now,
  });

  @override
  State<ProductOptionsDialog> createState() => _ProductOptionsDialogState();
}

/// What the dialog needs to know about a RECIPE COMPONENT: the quantity it
/// consumes per sold unit (the quantity an effect INHERITS) and its unit.
class _RecipeComponentFact {
  const _RecipeComponentFact({
    required this.insumoId,
    required this.quantityPerSaleUnit,
    required this.unit,
  });

  final String insumoId;
  final double quantityPerSaleUnit;
  final String? unit;
}

/// What the dialog needs to know about an INSUMO: its name and the unit its
/// stock is kept in.
class _InsumoFact {
  const _InsumoFact({required this.name, required this.unit});

  final String name;
  final String? unit;
}

/// The affordance that opens the supervisor override for an option whose
/// effect has no quantity of its own.
///
/// A verb and its object (§39.1): the operator reads what the button does.
class _QuantityOverrideAction extends StatelessWidget {
  final VoidCallback onPressed;

  const _QuantityOverrideAction({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton(
        key: const Key('modifier_override_action'),
        onPressed: onPressed,
        style: TextButton.styleFrom(
          // The target tactile size (§18.3): the button is a control the
          // operator uses with a wet finger, not a caption.
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 12),
        ),
        child: const Text('AJUSTAR CANTIDAD'),
      ),
    );
  }
}

/// A quantity a SUPERVISOR authorized for an option whose effect had no
/// quantity of its own.
///
/// The override is the only way the cashier can put a number on an extra, and
/// it is never the cashier's decision alone: it needs a supervisor, a reason,
/// and a forensic trace.
class _EffectOverride {
  const _EffectOverride({
    required this.quantity,
    required this.supervisorId,
    required this.method,
    required this.reason,
  });

  final double quantity;
  final String supervisorId;
  final String method;
  final String reason;
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
  // R28 (decisión del owner: "el backoffice manda"): el cajero NO escribe
  // cantidades de extras. La cantidad la configura el backoffice
  // (`effectQuantity` de la opción) y, cuando no hay ninguna, la hereda del
  // componente de la receta. El ÚNICO caso en el que alguien pone un número
  // es un override de supervisor, con motivo y autorización.
  final Map<String, _EffectOverride> _effectOverrides = {};
  // R28: the facts the dialog needs to tell the operator what the option
  // does to the stock: the live recipe's components (the inherited
  // quantity) and the insumos' names and units.
  Map<String, _RecipeComponentFact> _recipeComponents = {};
  Map<String, _InsumoFact> _insumoFacts = {};
  // Inline error shows only while the required group is still unsatisfied.
  bool _showMissingGroupError = false;

  /// R28: reads the facts the effect needs — the live recipe's components
  /// (the quantity an effect inherits) and the insumos' names and units.
  ///
  /// It NEVER blocks the dialog: a terminal whose authority is not hydrated
  /// yet simply shows the effect without the inherited number, and the
  /// quantity is inherited at sale time anyway. Failing to read the facts
  /// must not stop the cashier from selling (§39.3, and the SOHO
  /// guarantee: a failure of this feature degrades the inventory, never the
  /// sale).
  Future<void> _loadEffectFacts() async {
    final options = <EffectiveModifierOption>[
      for (final group in widget.product.availableModifierGroups) ...group.options,
    ];
    if (options.every((o) => o.inventoryEffect == 'NONE')) {
      return;
    }
    try {
      final database = context.read<AppDatabase>();
      final tenantId =
          (await database.localConfigDao.getConfigByKey('tenant_id'))?.value ??
              '';
      if (tenantId.isEmpty) return;

      // The INSUMO facts (name and unit) do NOT depend on the recipe: they
      // are read first, and ALWAYS. A product without a recipe still has to
      // say WHAT the extra takes out of the stock ("Saca 30 ml de jarabe"),
      // not the vague "el insumo" — and the pending case (no recipe) is
      // exactly where the operator most needs the name.
      final insumoFacts = <String, _InsumoFact>{};
      final referenced = <String>{};
      for (final option in options) {
        if (option.effectInsumoId != null) referenced.add(option.effectInsumoId!);
        if (option.effectTargetInsumoId != null) {
          referenced.add(option.effectTargetInsumoId!);
        }
      }
      for (final insumoId in referenced) {
        final insumo =
            await database.authorityProjectionDao.findInsumoById(tenantId, insumoId);
        if (insumo == null) continue;
        insumoFacts[insumoId] = _InsumoFact(
          name: insumo.name,
          unit: insumo.uom.isEmpty ? null : insumo.uom,
        );
      }
      if (insumoFacts.isNotEmpty && mounted) {
        setState(() => _insumoFacts = insumoFacts);
      }

      final versions =
          await database.authorityProjectionDao.findActivePublishedVersions(
        tenantId,
        widget.product.id,
        // The authority keeps `effective_from` in UTC and the checkout path
        // compares in UTC (`invoice.createdAt.toUtc()`). The dialog must
        // compare in the same frame: a LOCAL wall-clock string made a
        // version published minutes ago look "not yet in force" in every
        // timezone behind UTC — the operator lost the inherited quantity
        // (and the names that come with it) exactly where they needed it.
        authoritySaleTime(widget.now ?? DateTime.now()),
      );
      if (versions.isEmpty) return;
      final version = versions.first;
      final components = await database.authorityProjectionDao.findComponentsByVersion(
        tenantId,
        version.id,
      );

      final yieldQuantity = version.yieldQuantity > 0 ? version.yieldQuantity : 1;
      final facts = <String, _RecipeComponentFact>{};
      for (final component in components) {
        if (component.ingredientType != 'INSUMO') continue;
        facts[component.insumoId] = _RecipeComponentFact(
          insumoId: component.insumoId,
          // The SAME formula the explosion uses: the gross quantity, less the
          // technical shrink, spread over the yield (the per-sold-unit
          // consumption).
          quantityPerSaleUnit:
              (component.grossQuantity *
                      (1 - component.technicalShrinkPct / 100)) /
                  yieldQuantity,
          unit: component.componentUom,
        );
      }

      if (!mounted) return;
      setState(() {
        _recipeComponents = facts;
      });
    } catch (_) {
      // The facts are a convenience for the operator, never a gate.
    } finally {
      // Nada que limpiar: mientras los hechos no llegan, el número heredado
      // simplemente no se muestra.
    }
  }

  /// R28: the line under an option that declares an inventory effect — what
  /// it does to the stock, and how much.
  ///
  /// A price-only option shows nothing: the overwhelming majority of the
  /// options in a food park are just a price, and a line under every one of
  /// them would be noise (the restraint filter).
  ///
  /// The number announced is ALWAYS the one that will be applied: the one the
  /// backoffice configured, or — when it configured none — the one the recipe
  /// component consumes. The cashier never writes a quantity: the field that
  /// used to live here is gone, and what remains is a sentence about the stock
  /// and, when the effect has no quantity of its own, a supervisor's way to
  /// authorize one.
  Widget? _effectSubtitle(EffectiveModifierOption option) {
    final preview = _previewOf(option);
    if (preview == null) return null;
    final theme = Theme.of(context);
    final override = _effectOverrides[option.id];
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            preview.explanation,
            style: theme.textTheme.bodySmall,
          ),
          if (override != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Cantidad ajustada a ${_trimQuantity(override.quantity)}'
                '${_effectUnitOf(option) == null ? '' : ' ${_effectUnitOf(option)}'} '
                'con autorización de supervisor.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: NhilosColors.brandTealLight,
                ),
              ),
            ),
          if (preview.isPending && override == null) ...[
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                preview.pendingNote,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: NhilosColors.warning,
                ),
              ),
            ),
            const SizedBox(height: 4),
            _QuantityOverrideAction(
              onPressed: () => _requestQuantityOverride(option),
            ),
          ],
        ],
      ),
    );
  }

  /// Asks a supervisor to authorize the quantity of an option that has none.
  ///
  /// The override needs three things and the product does not give it up
  /// without them: the AMOUNT, the REASON and the SUPERVISOR. The amount and
  /// the reason travel with the authorization dialog; the supervisor's
  /// credentials are checked by the auth repository, and the whole act leaves
  /// a forensic trace.
  ///
  /// It never blocks the sale: the extra sells with its effect pending, and
  /// this is the way to make the stock move NOW.
  Future<void> _requestQuantityOverride(EffectiveModifierOption option) async {
    final preview = _previewOf(option);
    if (preview == null) return;
    final authRepo = context.read<AuthRepository>();
    final auditRepo = context.read<AuditRepository>();
    final policy = await tenantSupervisionPolicy(context);
    final insumoLabel = _insumoFacts[option.effectInsumoId]?.name ??
        _insumoFacts[option.effectTargetInsumoId]?.name ??
        'la opción';

    // The quantity of an extra is a DATA question, not a control one: the
    // operator knows their own numbers, and the reason is what makes the
    // adjustment explainable later. The tenant can still require a
    // supervisor for it (its policy), and then the credential is asked for.
    if (!policy.supervisorRequiredForModifierQuantity) {
      final result = await showDialog<ModifierQuantityResult>(
        context: context,
        builder: (dialogContext) => ModifierQuantityDialog(
          unit: preview.markingUnit,
          insumoLabel: insumoLabel,
        ),
      );
      if (!mounted || result == null) return;
      await auditRepo.logForensic(
        'MODIFIER_EFFECT_QUANTITY_ADJUSTED',
        usuarioAutorizadorId: null,
        metadata: jsonEncode({
          'action': 'modifier_effect_quantity_adjusted',
          'option_id': option.id,
          'quantity': result.quantity,
          'unit': preview.markingUnit,
          'reason': result.reason,
          'supervisor_required': false,
        }),
      );
      if (!mounted) return;
      setState(() {
        _effectOverrides[option.id] = _EffectOverride(
          quantity: result.quantity,
          supervisorId: '',
          method: '',
          reason: result.reason,
        );
      });
      return;
    }

    var draft = const ModifierQuantityOverrideDraft();
    String supervisorId = '';
    String method = '';
    // The submit button follows the extra fields: it stays disabled until the
    // amount AND the reason are there (the modal rebuilds on this notifier).
    final extraValid = ValueNotifier<bool>(false);
    final outcome = await showDialog<SupervisorOverrideOutcome>(
      context: context,
      builder: (dialogContext) => SupervisorOverrideModal(
        title: 'Cantidad autorizada para este extra',
        submitLabel: 'AUTORIZAR',
        content: ModifierQuantityOverrideContent(
          unit: preview.markingUnit,
          insumoLabel: insumoLabel,
          onChanged: (value) {
            draft = value;
            extraValid.value = value.isComplete;
          },
        ),
        extraValid: extraValid,
        onAuthorize: (request) async {
          supervisorId = request.supervisorId;
          method = request.method == SupervisorAuthorizationMethod.pin
              ? 'PIN'
              : 'TOTP';
          return authorizeWithPolicy(
            authRepository: authRepo,
            policy: policy,
            request: request,
            selfAuthorizationAllowed: true,
          );
        },
      ),
    );
    extraValid.dispose();
    if (!mounted || outcome == null || !outcome.authorized) return;
    await auditRepo.logForensic(
      outcome.isAuthorizingRole
          ? 'MODIFIER_EFFECT_QUANTITY_OVERRIDE'
          : 'SELF_AUTHORIZED_MODIFIER_EFFECT_QUANTITY',
      metodoAutorizacion: method,
      usuarioAutorizadorId: outcome.userId,
      metadata: jsonEncode({
        'action': 'modifier_effect_quantity_override',
        'option_id': option.id,
        'quantity': draft.quantity,
        'unit': preview.markingUnit,
        'reason': draft.reason,
        'self_authorized': !outcome.isAuthorizingRole,
      }),
    );
    if (!mounted) return;
    setState(() {
      _effectOverrides[option.id] = _EffectOverride(
        quantity: draft.quantity!,
        supervisorId: supervisorId,
        method: method,
        reason: draft.reason.trim(),
      );
    });
  }


  static String _trimQuantity(double value) {
    final rounded = (value * 10000).roundToDouble() / 10000;
    return rounded == rounded.truncateToDouble()
        ? rounded.toStringAsFixed(0)
        : rounded.toString();
  }

  /// The preview of an option's effect, or null when the option declares
  /// none (the overwhelmingly common case: a price-only option).
  /// The unit the insumo the effect acts on keeps its stock in.
  String? _effectUnitOf(EffectiveModifierOption option) =>
      option.effectInsumoId == null
          ? null
          : _insumoFacts[option.effectInsumoId]?.unit;

  ModifierEffectPreview? _previewOf(EffectiveModifierOption option) {
    if (option.inventoryEffect == 'NONE') return null;
    final target = option.effectTargetInsumoId == null
        ? null
        : _recipeComponents[option.effectTargetInsumoId];
    // The unit the affected insumo keeps its stock in, and the unit of the
    // recipe component the effect targets.
    final affectedUnit = option.effectInsumoId == null
        ? null
        : _insumoFacts[option.effectInsumoId]?.unit;
    final targetUnit = option.effectTargetInsumoId == null
        ? null
        : (_insumoFacts[option.effectTargetInsumoId]?.unit ??
            _recipeComponents[option.effectTargetInsumoId]?.unit);
    // The resolver refuses to inherit the recipe's number when the two
    // units differ (`UNIT_MISMATCH`): the inherited number means something
    // else in the affected insumo's unit. The dialog must say so instead
    // of announcing a quantity the stock movement will never carry.
    final unitsMismatch = affectedUnit != null &&
        targetUnit != null &&
        affectedUnit.toUpperCase() != targetUnit.toUpperCase();
    return buildModifierEffectPreview(
      option: option,
      insumoName: option.effectInsumoId == null
          ? null
          : _insumoFacts[option.effectInsumoId]?.name,
      targetName: option.effectTargetInsumoId == null
          ? null
          : (_insumoFacts[option.effectTargetInsumoId]?.name ??
              _recipeComponents[option.effectTargetInsumoId]?.insumoId),
      unit: affectedUnit,
      inheritedQuantity: target?.quantityPerSaleUnit,
      inheritedUnit: target?.unit,
      // A supervisor's authorized quantity wins over everything: it is the
      // one that will be applied, and it is expressed in the affected
      // insumo's own unit.
      quantityIsMarked: _effectOverrides.containsKey(option.id),
      markedQuantity: _effectOverrides[option.id]?.quantity,
      unitsMismatch: unitsMismatch,
    );
  }

  @override
  void initState() {
    super.initState();
    if (widget.product.variants.isNotEmpty) {
      _selectedVariantId = widget.product.variants.first.id;
    }
    _loadEffectFacts();
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

  /// The width the dialog's content may take.
  ///
  /// It follows the DEVICE instead of a fixed number: the same dialog has to
  /// work on the handheld terminal (360-411 dp) and on the food park's
  /// tablet (800 dp), and it must not overflow in either.
  double get _dialogContentWidth => ResponsiveBreakpoints.value(
        context,
        mobile: 400,
        tablet: 520,
        desktop: 600,
      );

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
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(NhilosRadii.modal),
        side: BorderSide(color: colorScheme.outline, width: 2),
      ),
      content: ConstrainedBox(
        // El ancho sigue al dispositivo (§48): la tableta del food park
        // aprovecha el room que tiene, el terminal de mano conserva su
        // columna cómoda, y en ninguno de los dos hay desbordamiento.
        constraints: BoxConstraints(maxWidth: _dialogContentWidth),
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
                Text(
                  group.name,
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
                Text(
                  _groupHint(group),
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: colorScheme.onSurfaceVariant),
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
                              // Sin `dense`: la fila completa es el target
                              // táctil (§18.3), no una línea comprimida de 32.
                              title: Text(
                                '${option.name} (+C\$ ${_formatDelta(option.priceDelta)})',
                              ),
                              subtitle: _effectSubtitle(option),
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
                        ConstrainedBox(
                          constraints: const BoxConstraints(minHeight: 48),
                          child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    '${option.name} (+C\$ ${_formatDelta(option.priceDelta)})',
                                  ),
                                  if (_effectSubtitle(option) != null)
                                    _effectSubtitle(option)!,
                                ],
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
                        ),
                    ],
                  )
                else
                  Column(
                    children: group.options
                        .map(
                          (option) => CheckboxListTile(
                            title: Text(
                              '${option.name} (+C\$ ${_formatDelta(option.priceDelta)})',
                            ),
                            subtitle: _effectSubtitle(option),
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
              final groupName = group.name.trim();
              for (final option in group.options) {
                final optionName = option.name.trim();
                // Issue #795: Contextualize modifier name with group name if not redundant
                // e.g. "Leche: Almendras", "Endulzante: Stevia", "Extra shot"
                final hasGroupContext = groupName.isNotEmpty &&
                    !optionName.toLowerCase().contains(groupName.toLowerCase()) &&
                    !groupName.toLowerCase().startsWith('extra');
                final displayName = hasGroupContext ? '$groupName: $optionName' : optionName;

                // R28: the option's IDENTITY (the backend's option and
                // group ids) and its INVENTORY EFFECT travel with the line.
                // Until now the line carried only a display NAME, so neither
                // the terminal nor the cloud could tell WHICH option was
                // sold, and the effect of the option was invisible.
                Modifier buildModifier(int quantity) => Modifier(
                      id: option.id,
                      name: displayName,
                      extraPrice: option.priceDelta,
                      quantity: quantity,
                      optionId: option.id,
                      groupId: group.id,
                      inventoryEffect: option.inventoryEffect,
                      effectInsumoId: option.effectInsumoId,
                      effectTargetInsumoId: option.effectTargetInsumoId,
                      // R28 (decisión del owner): la cantidad la manda el
                      // backoffice. La del supervisor (override autorizado)
                      // gana; sin ella, la que configuró el backoffice; sin
                      // ninguna, la que se hereda del componente de la
                      // receta — y esa última la resuelve el resolver, no
                      // el cajero.
                      effectQuantity:
                          _effectOverrides[option.id]?.quantity ??
                              option.effectQuantity,
                      effectFactor: option.effectFactor,
                    );

                if (group.maxSelected == 1) {
                  if (_selectedRadioOption[group.id] == option.id) {
                    selectedModifiers.add(buildModifier(1));
                  }
                } else if (group.allowQuantities) {
                  final quantity = _optionQuantities[option.id] ?? 0;
                  if (quantity > 0) {
                    // Precio POR UNIDAD: la cantidad viaja en su campo
                    // propio para que totales y comanda sepan cuántas.
                    selectedModifiers.add(buildModifier(quantity));
                  }
                } else if (_checkedOptions[option.id] == true) {
                  selectedModifiers.add(buildModifier(1));
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
                  // §39: the badge and this line count the same thing (units),
                  // and the copy agrees with the number it shows.
                  totalItems == 1
                      ? '1 producto agregado'
                      : '$totalItems productos agregados',
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
                  child: Column(
                    children: [
                      Icon(
                        Icons.shopping_cart_outlined,
                        size: 40,
                        color: colorScheme.outline,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Carrito vacío',
                        style: TextStyle(color: colorScheme.outline),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Tocá un producto del catálogo para agregarlo.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          color: colorScheme.outline,
                        ),
                      ),
                    ],
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
                    trailing: Text(
                      'C\$ ${(item.subtotal + item.modifiersTotal).toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        // §34.1: line totals keep tabular figures, exactly like
                        // the totals below them.
                        fontFeatures: [FontFeature.tabularFigures()],
                      ).copyWith(color: colorScheme.onSurface),
                    ),
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
              // SOHO-P3: the TRUE gross from the fiscal calculator, not
              // subtotal + totalDiscounts — that expression over-reports
              // whenever the aggregate is clamped (e.g. a stale redemption
              // after the cart shrinks).
              'C\$ ${(viewModel.grossSubtotal).toStringAsFixed(2)}',
              style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
            ),
          ],
        ),
        // SOHO-P3: report the discount breakdown honestly. A manual discount
        // is not a promotion; each component gets its own row and the rows
        // still sum to the aggregate the fiscal path consumes.
        if (viewModel.manualDiscount > 0)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Descuento manual',
                style: TextStyle(color: NhilosColors.success),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '-C\$ ${(viewModel.manualDiscount).toStringAsFixed(2)}',
                    style: const TextStyle(
                      color: NhilosColors.success,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  // The device-reported defect: the operator had NO way to
                  // take back a discount they did not want. Removing a
                  // discount RAISES what the customer pays, so it is not a
                  // restricted action (no supervisor override) and it is not
                  // destructive (the sale was never invoiced) — it needs no
                  // confirmation, exactly like the customer chip's delete.
                  IconButton(
                    key: const Key('cart_remove_manual_discount'),
                    onPressed: viewModel.removeManualDiscount,
                    icon: const Icon(Icons.undo, size: 18),
                    color: NhilosColors.success,
                    tooltip: 'Quitar descuento manual',
                    constraints: const BoxConstraints(
                      minWidth: 48,
                      minHeight: 48,
                    ),
                  ),
                ],
              ),
            ],
          ),
        if (viewModel.promoDiscounts > 0)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Promociones',
                style: TextStyle(color: NhilosColors.success),
              ),
              Text(
                '-C\$ ${(viewModel.promoDiscounts).toStringAsFixed(2)}',
                style: const TextStyle(
                  color: NhilosColors.success,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        if (viewModel.loyaltyDiscount > 0)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Descuento por puntos',
                style: TextStyle(color: NhilosColors.success),
              ),
              Text(
                '-C\$ ${(viewModel.loyaltyDiscount).toStringAsFixed(2)}',
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
        // #805 U4: the FX checkout block reason is a persistent banner in
        // the same column as the checkout action, directly above it, so it
        // can never be covered or lost as a transient SnackBar.
        const FxRateBlockBanner(),
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
        pricesIncludeTax: vm.pricesIncludeTax,
        onPayShare: (share) {
          Navigator.of(context).pop();
          _showCheckoutDialog(context);
        },
      ),
    );
  }

  Future<void> _requestSupervisorOverrideForManualDiscount(BuildContext context) async {
    final viewModel = context.read<SaleViewModel>();
    // SOHO-P3 S1b: refresh the caps before every prompt (D-5 freshness
    // precedent) so the operator sees the CURRENT configured limit and the
    // enforcement gate evaluates against it.
    await viewModel.loadDiscountCaps();
    if (!context.mounted) return;

    final amount = await _promptManualDiscountAmount(context);
    if (!context.mounted || amount == null || amount <= 0) return;

    viewModel.applyManualDiscount(amount);

    if (viewModel.errorMessage != 'Acceso denegado.') {
      return;
    }

    final authRepo = context.read<AuthRepository>();
    final auditRepo = context.read<AuditRepository>();
    final policy = await tenantSupervisionPolicy(context);

    final outcome = await showDialog<SupervisorOverrideOutcome>(
      context: context,
      builder: (dialogContext) => SupervisorOverrideModal(
        onAuthorize: (request) => authorizeWithPolicy(
          authRepository: authRepo,
          policy: policy,
          request: request,
          selfAuthorizationAllowed:
              policy.selfAuthorizationAllowedManualDiscount,
        ),
      ),
    );

    if (!context.mounted || outcome == null || !outcome.authorized) return;

    await auditRepo.logForensic(
      outcome.isAuthorizingRole
          ? 'SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT'
          : 'SELF_AUTHORIZED_MANUAL_DISCOUNT',
      metodoAutorizacion: outcome.method,
      usuarioAutorizadorId: outcome.userId,
      metadata: jsonEncode({
        'action': 'manual_discount',
        'self_authorized': !outcome.isAuthorizingRole,
      }),
    );

    viewModel.grantSupervisorOverride();
    viewModel.applyManualDiscount(amount);
  }

  Future<double?> _promptManualDiscountAmount(BuildContext context) async {
    final controller = TextEditingController();
    final viewModel = context.read<SaleViewModel>();
    // SOHO-P3 S1b: show the configured effective limit BEFORE typing so the
    // cashier does not have to discover it by rejection.
    final limitLabel = viewModel.manualDiscountLimitLabel;
    return showDialog<double>(
      context: context,
      builder: (dialogContext) {
        // Device-reported defect: the OLD path closed the dialog on Aplicar
        // and let the view model's refusal surface only through
        // _presentError's ScaffoldMessenger SnackBar, which renders on the
        // scaffold BEHIND the cart modal bottom sheet — the operator saw
        // nothing anywhere and reasonably believed the discount applied.
        // The prompt now carries the verdict itself: it evaluates the typed
        // amount with the SAME rule the view model enforces —
        // DiscountPolicyService fed with the view model's exposed caps
        // (maxDiscountAmountCap / maxDiscountPercentCap), gross subtotal and
        // accumulated manual discount, so there is one rule and one
        // implementation — and on refusal it keeps the dialog OPEN with the
        // cause-naming message INLINE, where the cashier is looking. The
        // view model's enforcement is untouched and still guards the apply
        // path; this pre-check only decides whether the dialog may close.
        String? inlineRejection;
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) => AlertDialog(
            title: const Text('Descuento manual'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (limitLabel != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        limitLabel,
                        key: const Key('manual_discount_limit_label'),
                        style: Theme.of(dialogContext).textTheme.bodySmall?.copyWith(
                          color: Theme.of(dialogContext).colorScheme.error,
                        ),
                      ),
                    ),
                  TextField(
                    controller: controller,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Monto de descuento'),
                    autofocus: true,
                    // Device-reported defect: after a refusal the inline
                    // message kept claiming the OLD amount was not permitted
                    // while the operator corrected it. The refusal clears on
                    // the text change itself — the same moment the claim
                    // stops being true — and reappears only if a new Aplicar
                    // is refused again.
                    onChanged: (_) {
                      if (inlineRejection != null) {
                        setDialogState(() => inlineRejection = null);
                      }
                    },
                  ),
                  if (inlineRejection != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        inlineRejection!,
                        key: const Key('manual_discount_inline_rejection'),
                        style:
                            Theme.of(dialogContext).textTheme.bodySmall?.copyWith(
                          color: Theme.of(dialogContext).colorScheme.error,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancelar'),
              ),
              ElevatedButton(
                onPressed: () {
                  final amount = double.tryParse(controller.text.trim());
                  if (amount != null && amount > 0) {
                    final decision = const DiscountPolicyService()
                        .evaluateManualDiscount(
                      requestedAmount: amount,
                      accumulatedManualDiscount: viewModel.manualDiscount,
                      grossSubtotal: viewModel.grossSubtotal,
                      maxDiscountAmount: viewModel.maxDiscountAmountCap,
                      maxDiscountPercent: viewModel.maxDiscountPercentCap,
                    );
                    if (!decision.allowed) {
                      // Refusal: keep the dialog open, show the cause.
                      setDialogState(
                        () => inlineRejection = decision.rejectionMessage,
                      );
                      return;
                    }
                  }
                  Navigator.pop(dialogContext, amount);
                },
                child: const Text('Aplicar'),
              ),
            ],
          ),
        );
      },
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
      // Round-2 D-3b: selectReward REFUSES (cap, unreadable benefit) without
      // mutating anything and leaves the refusal in errorMessage — the cart
      // sheet's own banner renders it while the sheet is open. Announcing
      // "aplicada" here, unconditionally, was a false success on top of a
      // refusal; only claim success when the VM agrees.
      if (viewModel.errorMessage != null) return;
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
              'Promociones',
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
            : Column(
                children: [
                  Expanded(
                    child: ListView.separated(
                      itemCount: promotions.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final promo = promotions[index];
                        // SOHO P3 S2 (defect 2): the cloud is authoritative
                        // for promotions; the former SwitchListTile offered a
                        // local-only write that the next delta silently
                        // reverted. The surface is now strictly read-only.
                        return ListTile(
                          dense: true,
                          isThreeLine: true,
                          title: Text(
                            promo.name,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: promo.isActive
                                  ? colorScheme.onSurface
                                  : Colors.grey,
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
                              color: promo.isActive
                                  ? Colors.deepOrange.shade800
                                  : Colors.grey,
                            ),
                          ),
                          trailing: Text(
                            promo.isActive ? 'Activa' : 'Inactiva',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color:
                                  promo.isActive ? Colors.green : Colors.grey,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const Divider(height: 1),
                  const Padding(
                    padding: EdgeInsets.all(8.0),
                    child: Text(
                      'Las promociones se activan y desactivan desde el panel de negocio (web).',
                      style: TextStyle(fontSize: 11, color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
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
