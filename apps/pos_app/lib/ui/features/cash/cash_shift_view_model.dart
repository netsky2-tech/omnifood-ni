import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../../data/database/app_database.dart';
import '../../../data/daos/sales/cashier_session_dao.dart';
import '../../../data/daos/sales/cash_movement_dao.dart';
import '../../../data/daos/sales/payment_dao.dart';
import '../../../data/models/sales/cashier_session_entity.dart';
import '../../../data/models/sales/cash_movement_entity.dart';
import '../../../domain/models/user.dart';
import '../../../domain/repositories/auth_repository.dart';

class CashShiftViewModel extends ChangeNotifier {
  final CashierSessionDao sessionDao;
  final CashMovementDao movementDao;
  final PaymentDao? paymentDao;
  final String currentUserId;
  final String currentUserName;
  final String currentTerminalId;

  /// Issue #552: when provided, the acting user id is resolved from the
  /// identity source at action time (same per-action resolution the sale
  /// path uses via AuthRepository.getCurrentUser) instead of trusting a
  /// hard-coded literal captured at construction.
  final AuthRepository? authRepository;
  UserRole? _currentUserRole;

  CashierSessionEntity? _activeShift;
  CashierSessionEntity? _lastClosedShift;
  List<CashMovementEntity> _movements = [];
  int _pendingVouchersCount = 0;
  // Issue #529: net cash-sales totals for the active shift, cached by
  // [refreshSalesCash] and recomputed freshly at close time. `_activeShift`
  // keeps its base expected figure (opening float + manual movements);
  // the sales cash rides on top via [effectiveExpectedNio/Usd].
  double _salesCashNio = 0.0;
  double _salesCashUsd = 0.0;
  bool _isLoading = false;
  String? _errorMessage;

  CashShiftViewModel({
    required this.sessionDao,
    required this.movementDao,
    this.paymentDao,
    // Issue #552: no longer required — callers SHOULD inject authRepository
    // and let the identity source provide the acting user id. Kept as a
    // fallback for direct constructions (widget tests, isolated harnesses).
    this.currentUserId = '',
    this.currentUserName = 'Cajero',
    this.currentTerminalId = 'term-main',
    this.authRepository,
    UserRole? currentUserRole,
  }) : _currentUserRole = currentUserRole;

  factory CashShiftViewModel.fromDatabase({
    required AppDatabase database,
    String currentUserId = '',
    String currentUserName = 'Cajero',
    // D-15 (JD-A-002): identical default to SaleViewModel's
    // effectiveTerminalId — both session openers must resolve the same
    // terminal or the void guard's scoped session lookup never matches.
    String currentTerminalId = 'TERM-01',
    AuthRepository? authRepository,
    UserRole? currentUserRole,
  }) {
    return CashShiftViewModel(
      sessionDao: database.cashierSessionDao,
      movementDao: database.cashMovementDao,
      paymentDao: database.paymentDao,
      currentUserId: currentUserId,
      currentUserName: currentUserName,
      currentTerminalId: currentTerminalId,
      authRepository: authRepository,
      currentUserRole: currentUserRole,
    );
  }

  /// Issue #552: resolves the acting user id. The injected identity source
  /// wins; when it reports no logged-in user, there IS no acting user (the
  /// caller must refuse identity-stamped operations). Falls back to the
  /// constructor value only when no identity source was injected.
  Future<String?> _actingUserId() async {
    final repo = authRepository;
    if (repo != null) {
      final user = await repo.getCurrentUser();
      return user?.id;
    }
    return currentUserId.isNotEmpty ? currentUserId : null;
  }

  CashierSessionEntity? get activeShift => _activeShift;
  CashierSessionEntity? get lastClosedShift => _lastClosedShift;

  /// Issue #529: what the drawer SHOULD contain right now —
  /// opening float + manual movements (already tracked by
  /// `_activeShift.expectedNio/Usd`) + net cash sales of non-canceled
  /// invoices in the shift. Blind-count variance must be measured against
  /// this, not against the base figure.
  double get effectiveExpectedNio =>
      (_activeShift?.expectedNio ?? 0) + _salesCashNio;
  double get effectiveExpectedUsd =>
      (_activeShift?.expectedUsd ?? 0) + _salesCashUsd;

  bool get hasActiveShift => _activeShift != null && !_activeShift!.isClosed;
  List<CashMovementEntity> get movements => List.unmodifiable(_movements);
  int get pendingVouchersCount => _pendingVouchersCount;
  bool get hasPendingVouchers => _pendingVouchersCount > 0;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  UserRole? get currentUserRole => _currentUserRole;

  void setUserRole(UserRole role) {
    _currentUserRole = role;
    notifyListeners();
  }

  /// Issue #529: sums the net cash collected by NON-canceled invoices of
  /// [shiftId], bucketed per currency. For each cash payment the drawer
  /// gained `amount` in `currency` and lost `changeGiven` in
  /// `change_currency` (change may be given in the other currency, so the
  /// buckets are adjusted independently).
  Future<(double, double)> _computeSalesCashTotals(String shiftId) async {
    final dao = paymentDao;
    if (dao == null) return (0.0, 0.0);
    final cashPayments = await dao.getCashPaymentsForShift(shiftId);
    double nio = 0.0;
    double usd = 0.0;
    for (final p in cashPayments) {
      if (p.currency == 'NIO') {
        nio += p.amount;
      } else if (p.currency == 'USD') {
        usd += p.amount;
      }
      if (p.changeGiven > 0) {
        if (p.changeCurrency == 'USD') {
          usd -= p.changeGiven;
        } else {
          nio -= p.changeGiven;
        }
      }
    }
    return (nio, usd);
  }

  /// Issue #529: re-queries the net cash-sales totals so the effective
  /// expected figures reflect sales recorded after the last [init]. Called
  /// before the blind-count dialog evaluates high variance.
  Future<void> refreshSalesCash() async {
    final shift = _activeShift;
    if (shift == null) {
      _salesCashNio = 0.0;
      _salesCashUsd = 0.0;
      return;
    }
    final totals = await _computeSalesCashTotals(shift.id);
    _salesCashNio = totals.$1;
    _salesCashUsd = totals.$2;
    notifyListeners();
  }

  Future<void> init() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      // Issue #552: scope the open-shift lookup to THIS user and terminal.
      final actingUserId = await _actingUserId();
      _activeShift = actingUserId == null
          ? null
          : await sessionDao.getActiveSessionForUserAndTerminal(
              actingUserId,
              currentTerminalId,
            );
      if (_activeShift != null) {
        _movements = await movementDao.getMovementsByShiftId(_activeShift!.id);
        await refreshSalesCash();
      } else {
        _movements = [];
        _salesCashNio = 0.0;
        _salesCashUsd = 0.0;
      }
      await refreshPendingVouchersCount();
    } catch (e) {
      _errorMessage = 'Error al cargar turno: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshPendingVouchersCount() async {
    if (paymentDao != null) {
      _pendingVouchersCount = (await paymentDao!.countPendingCardPayments()) ?? 0;
    }
  }

  Future<bool> openShift({
    required double initialFloatNio,
    required double initialFloatUsd,
    String? notes,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      // Issue #552: identity comes from the identity source, mirroring
      // SaleViewModel.openSession's per-action getCurrentUser resolution.
      final actingUserId = await _actingUserId();
      if (actingUserId == null) {
        _errorMessage = 'Debe iniciar sesión para abrir caja.';
        _isLoading = false;
        notifyListeners();
        return false;
      }

      if (_currentUserRole == UserRole.waiter) {
        _errorMessage = 'No tiene permiso para abrir turno de caja.';
        _isLoading = false;
        notifyListeners();
        return false;
      }

      // Issue #552: the duplicate-shift guard is scoped to THIS user and
      // terminal — another cashier's open shift on the same terminal must
      // not block this user from opening their own shift.
      final existing = await sessionDao.getActiveSessionForUserAndTerminal(
        actingUserId,
        currentTerminalId,
      );
      if (existing != null) {
        _errorMessage = 'Ya existe un turno de caja activo en esta terminal.';
        _isLoading = false;
        notifyListeners();
        return false;
      }

      final shiftId = const Uuid().v4();
      final now = DateTime.now().millisecondsSinceEpoch;

      final session = CashierSessionEntity(
        id: shiftId,
        userId: actingUserId,
        terminalId: currentTerminalId,
        openedAt: now,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: initialFloatNio,
        openingBalanceUsd: initialFloatUsd,
        expectedNio: initialFloatNio,
        expectedUsd: initialFloatUsd,
        isClosed: false,
        notes: notes,
        syncStatus: 'pending',
      );

      await sessionDao.insertSession(session);
      _activeShift = session;
      _movements = [];
      _salesCashNio = 0.0;
      _salesCashUsd = 0.0;
      await refreshPendingVouchersCount();
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Error al abrir turno: $e';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> recordMovement({
    required String type,
    required double amountNio,
    required double amountUsd,
    required String reason,
    String? authorizedByUserId,
  }) async {
    if (_activeShift == null) {
      _errorMessage = 'No hay turno activo para registrar movimientos.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final movementId = const Uuid().v4();
      final now = DateTime.now().millisecondsSinceEpoch;

      final movement = CashMovementEntity(
        id: movementId,
        shiftId: _activeShift!.id,
        terminalId: currentTerminalId,
        type: type,
        amountNio: amountNio,
        amountUsd: amountUsd,
        reason: reason,
        authorizedByUserId: authorizedByUserId,
        timestamp: now,
        syncStatus: 'pending',
      );

      await movementDao.insertMovement(movement);

      final isCredit = type == 'CASH_IN';
      final newExpectedNio = isCredit
          ? _activeShift!.expectedNio + amountNio
          : _activeShift!.expectedNio - amountNio;
      final newExpectedUsd = isCredit
          ? _activeShift!.expectedUsd + amountUsd
          : _activeShift!.expectedUsd - amountUsd;

      final updatedShift = CashierSessionEntity(
        id: _activeShift!.id,
        userId: _activeShift!.userId,
        terminalId: _activeShift!.terminalId,
        openedAt: _activeShift!.openedAt,
        tipoModelo: _activeShift!.tipoModelo,
        closedAt: _activeShift!.closedAt,
        openingBalanceNio: _activeShift!.openingBalanceNio,
        openingBalanceUsd: _activeShift!.openingBalanceUsd,
        closingCountedNio: _activeShift!.closingCountedNio,
        closingCountedUsd: _activeShift!.closingCountedUsd,
        expectedNio: newExpectedNio,
        expectedUsd: newExpectedUsd,
        differenceNio: _activeShift!.differenceNio,
        differenceUsd: _activeShift!.differenceUsd,
        zReportSequence: _activeShift!.zReportSequence,
        isClosed: _activeShift!.isClosed,
        supervisorId: _activeShift!.supervisorId,
        notes: _activeShift!.notes,
        syncStatus: 'pending',
      );

      await sessionDao.updateSession(updatedShift);
      _activeShift = updatedShift;
      _movements = await movementDao.getMovementsByShiftId(_activeShift!.id);

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Error al registrar movimiento: $e';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> closeShiftWithBlindCount({
    required double countedNio,
    required double countedUsd,
    String? notes,
    String? supervisorId,
  }) async {
    if (_activeShift == null) {
      _errorMessage = 'No hay turno activo para cerrar.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      // Invariante Fiscal DGI: No emitir Corte Z con vouchers pendientes
      if (paymentDao != null) {
        final pendingCount = (await paymentDao!.countPendingCardPayments()) ?? 0;
        _pendingVouchersCount = pendingCount;
        if (pendingCount > 0) {
          _errorMessage =
              'Existen $pendingCount vouchers de tarjeta pendientes de conciliar. Debe conciliar todos los vouchers antes de emitir el Corte Z Fiscal.';
          _isLoading = false;
          notifyListeners();
          return false;
        }
      }

      final now = DateTime.now().millisecondsSinceEpoch;
      final closedCount = (await sessionDao.countClosedSessions()) ?? 0;
      final zSequence = closedCount + 1;

      // Issue #529: expected cash includes the net cash sales of
      // non-canceled invoices in this shift, re-queried at close time so
      // sales recorded after the last refresh are not lost. Voiding a paid
      // invoice drops its cash from this sum automatically.
      final salesTotals = await _computeSalesCashTotals(_activeShift!.id);
      final effectiveExpectedNio = _activeShift!.expectedNio + salesTotals.$1;
      final effectiveExpectedUsd = _activeShift!.expectedUsd + salesTotals.$2;

      final diffNio = countedNio - effectiveExpectedNio;
      final diffUsd = countedUsd - effectiveExpectedUsd;

      final closedShift = CashierSessionEntity(
        id: _activeShift!.id,
        userId: _activeShift!.userId,
        terminalId: _activeShift!.terminalId,
        openedAt: _activeShift!.openedAt,
        tipoModelo: _activeShift!.tipoModelo,
        closedAt: now,
        openingBalanceNio: _activeShift!.openingBalanceNio,
        openingBalanceUsd: _activeShift!.openingBalanceUsd,
        closingCountedNio: countedNio,
        closingCountedUsd: countedUsd,
        expectedNio: effectiveExpectedNio,
        expectedUsd: effectiveExpectedUsd,
        differenceNio: diffNio,
        differenceUsd: diffUsd,
        zReportSequence: zSequence,
        isClosed: true,
        supervisorId: supervisorId,
        notes: notes ?? _activeShift!.notes,
        syncStatus: 'pending',
      );

      await sessionDao.updateSession(closedShift);
      _lastClosedShift = closedShift;
      _activeShift = null;
      _movements = [];
      _salesCashNio = 0.0;
      _salesCashUsd = 0.0;

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Error al cerrar turno: $e';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
}
