import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../../data/database/app_database.dart';
import '../../../data/daos/sales/cashier_session_dao.dart';
import '../../../data/daos/sales/cash_movement_dao.dart';
import '../../../data/models/sales/cashier_session_entity.dart';
import '../../../data/models/sales/cash_movement_entity.dart';

class CashShiftViewModel extends ChangeNotifier {
  final CashierSessionDao sessionDao;
  final CashMovementDao movementDao;
  final String currentUserId;
  final String currentUserName;
  final String currentTerminalId;

  CashierSessionEntity? _activeShift;
  CashierSessionEntity? _lastClosedShift;
  List<CashMovementEntity> _movements = [];
  bool _isLoading = false;
  String? _errorMessage;

  CashShiftViewModel({
    required this.sessionDao,
    required this.movementDao,
    required this.currentUserId,
    this.currentUserName = 'Cajero',
    this.currentTerminalId = 'term-main',
  });

  factory CashShiftViewModel.fromDatabase({
    required AppDatabase database,
    required String currentUserId,
    String currentUserName = 'Cajero',
    String currentTerminalId = 'term-main',
  }) {
    return CashShiftViewModel(
      sessionDao: database.cashierSessionDao,
      movementDao: database.cashMovementDao,
      currentUserId: currentUserId,
      currentUserName: currentUserName,
      currentTerminalId: currentTerminalId,
    );
  }

  CashierSessionEntity? get activeShift => _activeShift;
  CashierSessionEntity? get lastClosedShift => _lastClosedShift;
  bool get hasActiveShift => _activeShift != null && !_activeShift!.isClosed;
  List<CashMovementEntity> get movements => List.unmodifiable(_movements);
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  Future<void> init() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _activeShift = await sessionDao.getActiveSession();
      if (_activeShift != null) {
        _movements = await movementDao.getMovementsByShiftId(_activeShift!.id);
      } else {
        _movements = [];
      }
    } catch (e) {
      _errorMessage = 'Error al cargar turno: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
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
      final existing = await sessionDao.getActiveSession();
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
        userId: currentUserId,
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
      final now = DateTime.now().millisecondsSinceEpoch;
      final closedCount = (await sessionDao.countClosedSessions()) ?? 0;
      final zSequence = closedCount + 1;

      final diffNio = countedNio - _activeShift!.expectedNio;
      final diffUsd = countedUsd - _activeShift!.expectedUsd;

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
        expectedNio: _activeShift!.expectedNio,
        expectedUsd: _activeShift!.expectedUsd,
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
