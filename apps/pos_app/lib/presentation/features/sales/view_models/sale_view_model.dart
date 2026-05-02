import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../../../domain/models/sales/invoice.dart';
import '../../../../domain/models/sales/invoice_item.dart';
import '../../../../domain/models/sales/payment.dart';
import '../../../../domain/models/sales/cashier_session.dart';
import '../../../../domain/models/sales/cart_item.dart';
import '../../../../domain/models/sales/hold_ticket.dart';
import '../../../../domain/models/sales/promotion.dart';
import '../../../../domain/models/inventory/product.dart';
import '../../../../domain/repositories/sales/sales_repository.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/repositories/auth_repository.dart';
import '../../../../data/database/app_database.dart';
import '../../../../data/mappers/sales_mapper.dart';

class SaleViewModel extends ChangeNotifier {
  final SalesRepository _salesRepository;
  final InventoryRepository _inventoryRepository;
  final AuthRepository _authRepository;
  final AppDatabase _database; // For session, hold, and promo DAOs

  SaleViewModel(this._salesRepository, this._inventoryRepository, this._authRepository, this._database) {
    loadProducts();
    checkActiveSession();
    loadHoldTickets();
    loadPromotions();
  }

  final List<CartItem> _cart = [];
  List<CartItem> get cart => List.unmodifiable(_cart);

  List<Product> _products = [];
  List<Product> get products => _products;

  List<Promotion> _promotions = [];
  List<Promotion> get promotions => _promotions;

  List<HoldTicket> _holdTickets = [];
  List<HoldTicket> get holdTickets => _holdTickets;

  CashierSession? _activeSession;
  CashierSession? get activeSession => _activeSession;

  Map<PaymentMethod, double> _sessionExpected = {
    PaymentMethod.cash: 0.0,
    PaymentMethod.card: 0.0,
    PaymentMethod.qr: 0.0,
  };
  Map<PaymentMethod, double> get sessionExpected => _sessionExpected;

  bool _isGlobalTaxExempt = false;
  bool get isGlobalTaxExempt => _isGlobalTaxExempt;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String _searchQuery = '';
  String get searchQuery => _searchQuery;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  double get subtotal {
    final rawSubtotal = _cart.fold(0.0, (sum, item) => sum + item.subtotal + item.modifiersTotal);
    return rawSubtotal - _totalDiscounts;
  }
  
  double _totalDiscounts = 0.0;
  double get totalDiscounts => _totalDiscounts;

  double get totalTax {
    if (_isGlobalTaxExempt) return 0.0;
    // Recalculate tax based on subtotal after discounts
    return _cart.fold(0.0, (sum, item) {
      final itemBase = item.subtotal + item.modifiersTotal;
      // Simple proportional discount application for tax calculation
      final totalBase = subtotal + _totalDiscounts;
      final itemDiscount = totalBase == 0 ? 0.0 : (_totalDiscounts * (itemBase / totalBase));
      return sum + ((itemBase - itemDiscount) * item.taxRate);
    });
  }

  double get total => subtotal + totalTax;

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> loadPromotions() async {
    final entities = await _database.promotionDao.getActivePromotions();
    _promotions = entities.map(SalesMapper.toPromotionDomain).toList();
    notifyListeners();
  }

  void _applyPromotions() {
    _totalDiscounts = 0.0;
    for (final promo in _promotions) {
      if (promo.type == PromotionType.buyXGetYFree) {
        final items = _cart.where((i) => i.productId == promo.targetProductId);
        if (items.isNotEmpty) {
          final totalQty = items.fold(0.0, (sum, i) => sum + i.quantity).toInt();
          final sets = totalQty ~/ (promo.buyQuantity + promo.getQuantity);
          if (sets > 0) {
            final unitPrice = items.first.unitPrice;
            _totalDiscounts += sets * promo.getQuantity * unitPrice;
          }
        }
      }
    }
  }

  Future<void> loadProducts() async {
    _isLoading = true;
    notifyListeners();
    try {
      _products = await _inventoryRepository.getActiveProducts();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  List<Product> get filteredProducts {
    if (_searchQuery.isEmpty) return _products;
    final q = _searchQuery.toLowerCase();
    return _products.where((p) => 
      p.name.toLowerCase().contains(q) || 
      (p.sku?.toLowerCase().contains(q) ?? false) ||
      (p.barcode?.toLowerCase().contains(q) ?? false)
    ).toList();
  }

  Future<void> searchAndAddToCart(String code) async {
    try {
      final product = _products.firstWhere(
        (p) => (p.sku != null && p.sku == code) || (p.barcode != null && p.barcode == code),
      );
      addToCart(product);
      _errorMessage = null;
    } catch (e) {
      _errorMessage = 'Producto no encontrado: $code';
      notifyListeners();
    }
  }

  Future<void> loadHoldTickets() async {
    final entities = await _database.holdTicketDao.getAllHoldTickets();
    final List<HoldTicket> tickets = [];
    for (final entity in entities) {
      final itemEntities = await _database.holdTicketDao.getItemsByHoldTicketId(entity.id);
      tickets.add(SalesMapper.toHoldTicketDomain(entity, itemEntities));
    }
    _holdTickets = tickets;
    notifyListeners();
  }

  Future<void> holdCurrentTicket(String name) async {
    if (_cart.isEmpty) return;
    
    final ticket = HoldTicket(
      id: const Uuid().v4(),
      name: name,
      items: List.from(_cart),
      createdAt: DateTime.now(),
      isGlobalTaxExempt: _isGlobalTaxExempt,
    );

    await _database.holdTicketDao.saveHoldTicket(
      SalesMapper.toHoldTicketEntity(ticket),
      SalesMapper.toHoldTicketItemEntities(ticket),
    );

    clearCart();
    await loadHoldTickets();
  }

  Future<void> recallTicket(HoldTicket ticket) async {
    _cart.clear();
    _cart.addAll(ticket.items);
    _isGlobalTaxExempt = ticket.isGlobalTaxExempt;
    
    await _database.holdTicketDao.deleteHoldTicket(ticket.id);
    await loadHoldTickets();
    _applyPromotions();
    notifyListeners();
  }

  Future<void> checkActiveSession() async {
    final sessionEntity = await _database.cashierSessionDao.getActiveSession();
    if (sessionEntity != null) {
      _activeSession = SalesMapper.toSessionDomain(sessionEntity);
      _sessionExpected = {
        PaymentMethod.cash: _activeSession!.openingBalance,
        PaymentMethod.card: 0.0,
        PaymentMethod.qr: 0.0,
      };
    } else {
      _activeSession = null;
    }
    notifyListeners();
  }

  Future<void> openSession(double balance) async {
    final user = await _authRepository.getCurrentUser();
    if (user == null) {
      _errorMessage = 'Debe iniciar sesión para abrir caja.';
      notifyListeners();
      return;
    }

    final session = CashierSession(
      id: const Uuid().v4(),
      userId: user.id,
      openedAt: DateTime.now(),
      openingBalance: balance,
    );
    await _database.cashierSessionDao.insertSession(SalesMapper.toSessionEntity(session));
    _activeSession = session;
    _sessionExpected = {
      PaymentMethod.cash: balance,
      PaymentMethod.card: 0.0,
      PaymentMethod.qr: 0.0,
    };
    notifyListeners();
  }

  Future<void> closeSession(double closingBalance) async {
    if (_activeSession == null) return;
    
    final totalSales = _sessionExpected.values.fold(0.0, (sum, v) => sum + v) - _activeSession!.openingBalance;
    
    final updated = _activeSession!.copyWith(
      isClosed: true,
      closedAt: DateTime.now(),
      closingBalance: closingBalance,
      totalSales: totalSales,
      totalExpected: _sessionExpected[PaymentMethod.cash],
    );
    await _database.cashierSessionDao.updateSession(SalesMapper.toSessionEntity(updated));
    _activeSession = null;
    notifyListeners();
  }

  void addToCart(
    Product product, {
    double quantity = 1.0,
    String? variantId,
    List<Modifier> modifiers = const [],
  }) {
    final index = _cart.indexWhere((item) => 
      item.productId == product.id && 
      item.variantId == variantId && 
      listEquals(item.selectedModifiers, modifiers)
    );

    if (index != -1) {
      _cart[index] = _cart[index].copyWith(quantity: _cart[index].quantity + quantity);
    } else {
      double unitPrice = product.sellPrice;
      String productName = product.name;

      if (variantId != null) {
        try {
          final variant = product.variants.firstWhere((v) => v.id == variantId);
          unitPrice += variant.priceAdjustment;
          productName += ' (${variant.name})';
        } catch (_) {}
      }

      _cart.add(CartItem(
        productId: product.id,
        productName: productName,
        quantity: quantity,
        unitPrice: unitPrice,
        taxRate: 0.15,
        variantId: variantId,
        selectedModifiers: modifiers,
      ));
    }
    _applyPromotions();
    notifyListeners();
  }

  void removeFromCart(String productId, {String? variantId, List<Modifier>? modifiers}) {
    _cart.removeWhere((item) => 
      item.productId == productId && 
      item.variantId == variantId && 
      (modifiers == null || listEquals(item.selectedModifiers, modifiers))
    );
    _applyPromotions();
    notifyListeners();
  }

  void updateQuantity(String productId, double quantity, {String? variantId, List<Modifier>? modifiers}) {
    final index = _cart.indexWhere((item) => 
      item.productId == productId && 
      item.variantId == variantId && 
      (modifiers == null || listEquals(item.selectedModifiers, modifiers))
    );
    if (index != -1) {
      if (quantity <= 0) {
        _cart.removeAt(index);
      } else {
        _cart[index] = _cart[index].copyWith(quantity: quantity);
      }
      _applyPromotions();
      notifyListeners();
    }
  }

  void toggleGlobalTaxExempt() {
    _isGlobalTaxExempt = !_isGlobalTaxExempt;
    notifyListeners();
  }

  void clearCart() {
    _cart.clear();
    _isGlobalTaxExempt = false;
    _totalDiscounts = 0.0;
    notifyListeners();
  }

  Future<void> finalizeSale(List<PaymentMethod> methods) async {
    if (_cart.isEmpty) return;

    final user = await _authRepository.getCurrentUser();
    if (user == null) {
      _errorMessage = 'Sesión de usuario expirada. Re-ingrese PIN.';
      notifyListeners();
      return;
    }

    final invoiceId = const Uuid().v4();

    final items = _cart.map((cartItem) {
      final appliedTaxRate = _isGlobalTaxExempt ? 0.0 : cartItem.taxRate;
      
      return InvoiceItem(
        id: const Uuid().v4(),
        invoiceId: invoiceId,
        productId: cartItem.productId,
        productName: cartItem.productName,
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice,
        originalTaxRate: cartItem.taxRate,
        appliedTaxRate: appliedTaxRate,
        taxAmount: cartItem.taxAmount,
        total: cartItem.total,
        variantId: cartItem.variantId,
        notes: cartItem.notes,
        selectedModifiers: cartItem.selectedModifiers,
      );
    }).toList();

    final invoice = Invoice(
      id: invoiceId,
      number: 'PENDING',
      createdAt: DateTime.now(),
      userId: user.id,
      subtotal: subtotal,
      totalTax: totalTax,
      total: total,
      globalTaxOverride: _isGlobalTaxExempt,
    );

    final payments = methods.map((m) => Payment(
      id: const Uuid().v4(),
      invoiceId: invoiceId,
      method: m,
      amount: total / methods.length, 
    )).toList();

    await _salesRepository.saveSale(
      invoice: invoice,
      items: items,
      payments: payments,
    );

    // Update expected totals
    for (final p in payments) {
      _sessionExpected[p.method] = (_sessionExpected[p.method] ?? 0.0) + p.amount;
    }

    clearCart();
  }

  Future<void> processReturn(String invoiceNumber, String reason) async {
    _isLoading = true;
    notifyListeners();
    try {
      final original = await _salesRepository.getInvoiceByNumber(invoiceNumber);
      if (original == null) {
        _errorMessage = 'Factura no encontrada: $invoiceNumber';
        return;
      }
      
      if (original.isCanceled) {
        _errorMessage = 'La factura ya está anulada.';
        return;
      }

      await _salesRepository.createCreditNote(
        originalInvoiceId: original.id,
        reason: reason,
      );
      
      _errorMessage = null;
    } catch (e) {
      _errorMessage = 'Error al procesar devolución: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
