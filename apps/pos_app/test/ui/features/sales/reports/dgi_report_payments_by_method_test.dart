import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/ui/features/sales/reports/dgi_report_view_model.dart';

// ── Test fakes (mirror existing _FakeSalesRepository / _FakeAppDatabase) ──

class _FakeSalesRepo implements SalesRepository {
  final List<Invoice> invoices;
  final List<Payment> payments;
  _FakeSalesRepo({required this.invoices, required this.payments});
  @override
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId) async => invoices;
  @override
  Future<List<Payment>> getPaymentsBySessionId(String sessionId) async => payments;
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

class _FakeDb implements AppDatabase {
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

// ── D-19: cash change-overstate defect ──

void main() {
  CashierSession underTestSession() {
    return CashierSession(
      id: 'session-d19',
      userId: 'cashier-1',
      openedAt: DateTime(2025, 1, 1),
      tipoModelo: CashSessionModel.cajaCentral,
      openingBalance: 0,
      isClosed: false,
    );
  }

  group('D-19: paymentsByMethod must net cash changeGiven', () {
    test('cash payment with change reduces the cash line to net amount', () async {
      final session = underTestSession();
      // Cash tendered C$200.00, change returned C$75.00 → net cash C$125.00
      // against inv-a (total C$125.00); card C$50.00 covers inv-b in full, so
      // the breakdown (125 + 50 = 175) reconciles with totalGross (175).
      final invoices = [
        Invoice(
          id: 'inv-a',
          number: '001-001-01-00000001',
          createdAt: DateTime(2025, 1, 1, 10),
          userId: 'cashier-1',
          subtotal: 125.0,
          totalTax: 0.0,
          total: 125.0,
          isCanceled: false,
        ),
        Invoice(
          id: 'inv-b',
          number: '001-001-01-00000002',
          createdAt: DateTime(2025, 1, 1, 11),
          userId: 'cashier-1',
          subtotal: 50.0,
          totalTax: 0.0,
          total: 50.0,
          isCanceled: false,
        ),
      ];
      // Cash tendered C$200.00, change returned C$75.00 → net cash C$125.00.
      final payments = [
        Payment(
          id: 'pay-cash',
          invoiceId: 'inv-a',
          method: PaymentMethod.cash,
          amount: 200.0,
          changeGiven: 75.0,
        ),
        // Full inv-b (C$50.00) via card.
        Payment(
          id: 'pay-card',
          invoiceId: 'inv-b',
          method: PaymentMethod.card,
          amount: 50.0,
          changeGiven: 0,
        ),
      ];

      // NOTE: We do NOT set isClosed on the session because the real method
      // only reads invoices/payments, not session.isClosed.
      final vm = DgiReportViewModel(
        _FakeSalesRepo(invoices: invoices, payments: payments),
        _FakeDb(),
      );
      await vm.selectSession(session);

      final cash = vm.paymentsByMethod[PaymentMethod.cash]!;
      final card = vm.paymentsByMethod[PaymentMethod.card]!;

      // The fix: cash net should be 200 - 75 = 125.00 (what the drawer
      // actually collected), NOT the tendered 200.00.
      expect(cash, equals(125.0), reason: 'cash line must net changeGiven');

      // Card with zero change stays at 50.
      expect(card, equals(50.0), reason: 'card with zero change stays unchanged');

      // ── Reconciliation: breakdown must sum to totalGross ──
      final gross = vm.totalGross; // 125.0 + 50.0 = 175.0
      double breakdownSum = 0.0;
      vm.paymentsByMethod.forEach((_, v) => breakdownSum += v);
      expect(
        (breakdownSum - gross).abs(),
        lessThan(0.01),
        reason: 'payment-method breakdown must equal totalGross ($gross)',
      );
    });

    test('canceled invoice does not affect paymentsByMethod', () async {
      final session = underTestSession();
      final invoices = [
        Invoice(
          id: 'inv-active',
          number: '001-001-01-00000010',
          createdAt: DateTime(2025, 1, 1, 9),
          userId: 'cashier-1',
          subtotal: 50.0,
          totalTax: 7.5,
          total: 57.5,
          isCanceled: false,
        ),
        Invoice(
          id: 'inv-cancelled',
          number: '001-001-01-00000011',
          createdAt: DateTime(2025, 1, 1, 10),
          userId: 'cashier-1',
          subtotal: 30.0,
          totalTax: 4.5,
          total: 34.5,
          isCanceled: true,
        ),
      ];
      // Cash tendered 100.0, change 42.50 → net 57.50 matches active invoice.
      final payments = [
        Payment(
          id: 'pay-1',
          invoiceId: 'inv-active',
          method: PaymentMethod.cash,
          amount: 100.0,
          changeGiven: 42.50,
        ),
        // Payment for the canceled invoice — must be excluded.
        Payment(
          id: 'pay-2',
          invoiceId: 'inv-cancelled',
          method: PaymentMethod.card,
          amount: 34.50,
          changeGiven: 0,
        ),
      ];

      final vm = DgiReportViewModel(
        _FakeSalesRepo(invoices: invoices, payments: payments),
        _FakeDb(),
      );
      await vm.selectSession(session);

      expect(vm.paymentsByMethod[PaymentMethod.cash]!, equals(57.5));
      expect(vm.paymentsByMethod[PaymentMethod.card]!, equals(0),
          reason: 'payment tied to a canceled invoice must not contribute');

      // Breakdown sums to totalGross (canceled invoices excluded from gross too).
      double breakdownSum = 0.0;
      vm.paymentsByMethod.forEach((_, v) => breakdownSum += v);
      expect(
        (breakdownSum - vm.totalGross).abs(),
        lessThan(0.01),
        reason: 'breakdown must equal totalGross after excluding canceled',
      );
    });

    test('negative/absurd changeGiven is clamped so cash never goes below 0', () async {
      // A bad row: changeGiven > amount. The fix must clamp the net to 0.
      final session = underTestSession();
      final invoices = [
        Invoice(
          id: 'inv-bad',
          number: '001-001-01-00000099',
          createdAt: DateTime(2025, 1, 1, 9),
          userId: 'cashier-1',
          subtotal: 10.0,
          totalTax: 1.5,
          total: 11.5,
          isCanceled: false,
        ),
      ];
      final payments = [
        Payment(
          id: 'pay-bad',
          invoiceId: 'inv-bad',
          method: PaymentMethod.cash,
          amount: 10.0,
          changeGiven: 15.0, // more than tendered — impossible in reality but must not cause negative cash.
        ),
      ];

      final vm = DgiReportViewModel(
        _FakeSalesRepo(invoices: invoices, payments: payments),
        _FakeDb(),
      );
      await vm.selectSession(session);

      final cash = vm.paymentsByMethod[PaymentMethod.cash]!;
      expect(cash, equals(0.0), reason: 'clamped cash must be ≥ 0 when change exceeds tendered');
    });
  });
}