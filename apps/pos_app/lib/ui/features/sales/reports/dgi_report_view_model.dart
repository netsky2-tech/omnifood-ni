import 'package:flutter/foundation.dart';
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
    } finally {
      _isLoading = false;
      notifyListeners();
    }
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
  
  Map<PaymentMethod, double> get paymentsByMethod {
    final map = {
      PaymentMethod.cash: 0.0,
      PaymentMethod.card: 0.0,
      PaymentMethod.qr: 0.0,
    };
    for (final p in _payments) {
      final invoice = _invoices.firstWhere((i) => i.id == p.invoiceId, orElse: () => Invoice(id: '', number: '', createdAt: DateTime.now(), userId: '', subtotal: 0, totalTax: 0, total: 0));
      if (!invoice.isCanceled) {
        map[p.method] = (map[p.method] ?? 0.0) + p.amount;
      }
    }
    return map;
  }

  int get canceledCount => _invoices.where((i) => i.isCanceled).length;
  double get canceledTotal => _invoices.where((i) => i.isCanceled).fold(0.0, (sum, i) => sum + i.total);

  String generatePrintString() {
    if (_selectedSession == null) return "No hay sesión seleccionada";
    
    final buf = StringBuffer();
    buf.writeln("      OMNIFOOD NI - REPORTE X/Z      ");
    buf.writeln("------------------------------------------");
    buf.writeln("Sesión ID: ${_selectedSession!.id.substring(0, 8)}");
    buf.writeln("Apertura: ${_selectedSession!.openedAt}");
    if (_selectedSession!.isClosed) {
      buf.writeln("Cierre: ${_selectedSession!.closedAt}");
    }
    buf.writeln("------------------------------------------");
    buf.writeln("VENTAS BRUTAS:      \$${totalGross.toStringAsFixed(2)}");
    buf.writeln("IVA (15%):          \$${totalTax.toStringAsFixed(2)}");
    buf.writeln("VENTAS NETAS:       \$${totalNet.toStringAsFixed(2)}");
    buf.writeln("------------------------------------------");
    buf.writeln("POR MÉTODO DE PAGO:");
    paymentsByMethod.forEach((method, amount) {
      buf.writeln("${method.name.toUpperCase().padRight(15)} \$${amount.toStringAsFixed(2)}");
    });
    buf.writeln("------------------------------------------");
    buf.writeln("ANULACIONES:        $canceledCount (\$${canceledTotal.toStringAsFixed(2)})");
    buf.writeln("------------------------------------------");
    buf.writeln("   GRACIAS POR SU PREFERENCIA   ");
    
    return buf.toString();
  }
}
