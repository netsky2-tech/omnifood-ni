import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import '../../../../../core/localization/display_name_resolver.dart';
import '../../../../../core/localization/label_map.dart';
import '../../../../../domain/models/config/tax_regime.dart';
import '../../../../../domain/models/sales/invoice.dart';
import '../../../../../domain/models/sales/payment.dart';
import '../../../../../domain/models/sales/cashier_session.dart';
import '../../../../../domain/repositories/sales/sales_repository.dart';
import '../../../../../data/mappers/sales_mapper.dart';
import '../../../../../data/database/app_database.dart';

class DgiReportViewModel extends ChangeNotifier {
  final SalesRepository _salesRepository;
  final AppDatabase _database;

  DgiReportViewModel(this._salesRepository, this._database);

  List<CashierSession> _sessions = [];
  List<CashierSession> get sessions => _sessions;

  CashierSession? _selectedSession;
  CashierSession? get selectedSession => _selectedSession;

  List<Invoice> _invoices = [];
  List<Invoice> get invoices => _invoices;

  List<Payment> _payments = [];
  List<Payment> get payments => _payments;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  Future<void> loadSessions() async {
    _isLoading = true;
    notifyListeners();
    try {
      final entities = await _database.cashierSessionDao.getAllSessions();
      _sessions = entities.map(SalesMapper.toSessionDomain).toList();
      await _loadTaxRegime();
      // D-14: id→name map built once per view load (findAllUsers keeps
      // INACTIVE users for historical attribution).
      try {
        _userNamesById = await loadUserNameMap();
      } catch (_) {
        _userNamesById = const {};
      }
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Map<String, String> _userNamesById = const {};

  /// D-14: overridable seam so fakes can supply names without a database.
  @protected
  Future<Map<String, String>> loadUserNameMap() async {
    final users = await _database.userDao.findAllUsers();
    return {for (final u in users) u.id: u.name};
  }

  /// Test/fixture seam: injects a resolved id→name map without a database.
  @visibleForTesting
  void seedUserNames(Map<String, String> names) => _userNamesById = names;

  /// Resolves a stored user id to the person's display name (or the honest
  /// fallback). Never the raw id.
  String userNameFor(String? userId) =>
      resolveUserName(userId, _userNamesById);

  /// D-14/#8/#9: the session picker label is human — `dd/MM HH:mm` + the
  /// cashier's name + status — never the session id or the user id.
  String sessionLabel(CashierSession session) {
    final opened = DateFormat('dd/MM HH:mm').format(session.openedAt);
    final status = session.isClosed ? 'Cerrada' : 'ACTIVA';
    return '$opened · ${userNameFor(session.userId)} ($status)';
  }

  Future<void> selectSession(CashierSession? session) async {
    _selectedSession = session;
    if (session == null) {
      _invoices = [];
      _payments = [];
      notifyListeners();
      return;
    }

    _isLoading = true;
    notifyListeners();
    try {
      _invoices = await _salesRepository.getInvoicesBySessionId(session.id);
      _payments = await _salesRepository.getPaymentsBySessionId(session.id);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Calculated properties for the report
  double get totalGross => _invoices.where((i) => !i.isCanceled).fold(0.0, (sum, i) => sum + i.total);
  double get totalTax => _invoices.where((i) => !i.isCanceled).fold(0.0, (sum, i) => sum + i.totalTax);
  double get totalNet => totalGross - totalTax;
  
  /// Cash collected **net of change handed back**, so the breakdown reconciles
  /// with `totalGross` and with the drawer's `expected_cash` (float + NET cash
  /// sales). D-19: summing the tendered `amount` overstated cash — a C$200
  /// tender with C$75 change printed `Efectivo C$200` next to `Ventas Brutas
  /// C$125`, a phantom C$75 gap against the drawer.
  ///
  /// `changeGiven > amount` (corrupt row) is clamped to 0 so a bad record can
  /// never print negative cash. Card/QR amounts are charged amounts and carry
  /// no change. A payment whose invoice is absent from this session is counted
  /// as active (the `orElse` placeholder): dropping it would understate the
  /// method total and break reconciliation instead of improving it.
  Map<PaymentMethod, double> get paymentsByMethod {
    final map = {
      PaymentMethod.cash: 0.0,
      PaymentMethod.card: 0.0,
      PaymentMethod.qr: 0.0,
    };
    for (final p in _payments) {
      final invoice = _invoices.firstWhere((i) => i.id == p.invoiceId, orElse: () => Invoice(id: '', number: '', createdAt: DateTime.now(), userId: '', subtotal: 0, totalTax: 0, total: 0));
      if (!invoice.isCanceled) {
        var amount = p.amount;
        if (p.method == PaymentMethod.cash) {
          final change = p.changeGiven;
          amount = change > amount ? 0.0 : amount - change;
        }
        map[p.method] = (map[p.method] ?? 0.0) + amount;
      }
    }
    return map;
  }

  int get canceledCount => _invoices.where((i) => i.isCanceled).length;
  double get canceledTotal => _invoices.where((i) => i.isCanceled).fold(0.0, (sum, i) => sum + i.total);

  /// Active tenant tax regime (D-3: the regime is the single source of IVA
  /// treatment). Null until loaded or when the device has no projected regime.
  TaxRegime? _taxRegime;
  TaxRegime? get taxRegime => _taxRegime;

  Future<void> _loadTaxRegime() async {
    try {
      final configEntity = await _database.localConfigDao.getConfigByKey('tax_regime');
      _taxRegime = TaxRegime.fromString(configEntity?.value);
    } catch (_) {
      // Fail open to the plain label; never fabricate a percentage literal.
      _taxRegime = null;
    }
  }

  String generatePrintString() {
    if (_selectedSession == null) return "No hay sesión seleccionada";
    
    final buf = StringBuffer();
    buf.writeln("      OMNIFOOD NI - REPORTE X/Z      ");
    buf.writeln("------------------------------------------");
    // D-14/#7: the printed report names the cashier — never the session id
    // or the device-observed user id.
    buf.writeln("Cajero: ${userNameFor(_selectedSession!.userId)}");
    buf.writeln(
        "Apertura: ${DateFormat('dd/MM/yyyy HH:mm').format(_selectedSession!.openedAt)}");
    if (_selectedSession!.isClosed) {
      buf.writeln(
          "Cierre: ${DateFormat('dd/MM/yyyy HH:mm').format(_selectedSession!.closedAt!)}");
    }
    buf.writeln("------------------------------------------");
    buf.writeln("VENTAS BRUTAS:      \$${totalGross.toStringAsFixed(2)}");
    // D-3: regime-aware IVA treatment. Cuota Fija does not collect IVA — the
    // X/Z prints the domain fiscal notice instead of a contradicting amount.
    if (taxRegime?.isCuotaFija == true) {
      buf.writeln(taxRegime!.fiscalNotice);
    } else {
      buf.writeln("IVA:                \$${totalTax.toStringAsFixed(2)}");
    }
    buf.writeln("VENTAS NETAS:       \$${totalNet.toStringAsFixed(2)}");
    buf.writeln("------------------------------------------");
    buf.writeln("POR MÉTODO DE PAGO:");
    paymentsByMethod.forEach((method, amount) {
      // D-14/#14: Spanish labels (Efectivo / Tarjeta / Código QR) instead of
      // the raw enum names. `CÓDIGO QR` is 9 chars, inside the 15-char pad,
      // so the amount column stays aligned.
      buf.writeln(
          "${localize(method.name, kPaymentMethodLabels).toUpperCase().padRight(15)} \$${amount.toStringAsFixed(2)}");
    });
    buf.writeln("------------------------------------------");
    buf.writeln("ANULACIONES:        $canceledCount (\$${canceledTotal.toStringAsFixed(2)})");
    buf.writeln("------------------------------------------");
    buf.writeln("   GRACIAS POR SU PREFERENCIA   ");
    
    return buf.toString();
  }
}
