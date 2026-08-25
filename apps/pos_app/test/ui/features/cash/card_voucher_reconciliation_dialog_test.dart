import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/ui/features/cash/card_voucher_reconciliation_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/card_voucher_reconciliation_dialog.dart';
import 'package:provider/provider.dart';

class _MockPaymentDao extends Mock implements PaymentDao {}

void main() {
  late _MockPaymentDao mockPaymentDao;
  late CardVoucherReconciliationViewModel viewModel;

  setUpAll(() {
    registerFallbackValue(
      PaymentEntity(
        id: 'fallback-pay',
        invoiceId: 'fallback-inv',
        method: 'card',
        amount: 0.0,
      ),
    );
  });

  setUp(() {
    mockPaymentDao = _MockPaymentDao();
    viewModel = CardVoucherReconciliationViewModel(
      paymentDao: mockPaymentDao,
      currentUserId: 'cajero-01',
    );
  });

  Widget createWidgetUnderTest() {
    return MaterialApp(
      home: ChangeNotifierProvider<CardVoucherReconciliationViewModel>.value(
        value: viewModel,
        child: const Scaffold(
          body: CardVoucherReconciliationDialog(),
        ),
      ),
    );
  }

  group('CardVoucherReconciliationDialog Widget Tests (Slice 3.3)', () {
    testWidgets('renders list of pending vouchers and allows reconciling with auth code',
        (tester) async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final p1 = PaymentEntity(
        id: 'pay-v-w1',
        invoiceId: 'inv-widget-01',
        method: 'card',
        amount: 575.0,
        amountNio: 575.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BAC',
        cardBrand: 'VISA',
        createdAt: now,
      );

      when(() => mockPaymentDao.getPendingCardPayments())
          .thenAnswer((_) async => [p1]);
      when(() => mockPaymentDao.updatePayment(any()))
          .thenAnswer((_) async => 1);

      await viewModel.loadPendingVouchers();

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      // Verify pending voucher info displayed
      expect(find.textContaining('Reconciliación de Vouchers'), findsOneWidget);
      expect(find.textContaining('BAC'), findsOneWidget);
      expect(find.textContaining('VISA'), findsOneWidget);
      expect(find.textContaining('C\$ 575.00'), findsOneWidget);

      // Enter authorization code
      final codeInput = find.byKey(const Key('voucher_code_input_pay-v-w1'));
      expect(codeInput, findsOneWidget);
      await tester.enterText(codeInput, '998877');
      await tester.pumpAndSettle();

      // When updatePayment is called, second getPendingCardPayments returns empty
      when(() => mockPaymentDao.getPendingCardPayments())
          .thenAnswer((_) async => []);

      // Tap Conciliar button
      final reconcileBtn = find.byKey(const Key('btn_reconcile_pay-v-w1'));
      expect(reconcileBtn, findsOneWidget);
      await tester.tap(reconcileBtn);
      await tester.pumpAndSettle();

      // Verify empty state / all reconciled message
      expect(find.textContaining('Todos los vouchers han sido conciliados'), findsOneWidget);

      verify(() => mockPaymentDao.updatePayment(any(that: isA<PaymentEntity>().having(
            (p) => p.voucherCode,
            'voucherCode',
            '998877',
          ).having(
            (p) => p.reconciliationStatus,
            'reconciliationStatus',
            'CONCILIADO',
          )))).called(1);
    });

    testWidgets('allows manual override for lost vouchers with supervisor justification',
        (tester) async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final p1 = PaymentEntity(
        id: 'pay-v-w2',
        invoiceId: 'inv-widget-01',
        method: 'card',
        amount: 350.0,
        amountNio: 350.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BANPRO',
        cardBrand: 'MASTERCARD',
        createdAt: now,
      );

      when(() => mockPaymentDao.getPendingCardPayments())
          .thenAnswer((_) async => [p1]);
      when(() => mockPaymentDao.updatePayment(any()))
          .thenAnswer((_) async => 1);

      await viewModel.loadPendingVouchers();

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      // Tap Override Extraviado button
      final overrideBtn = find.byKey(const Key('btn_override_pay-v-w2'));
      expect(overrideBtn, findsOneWidget);
      await tester.tap(overrideBtn);
      await tester.pumpAndSettle();

      // Fill reason and supervisor ID in override modal
      final reasonField = find.byKey(const Key('override_reason_field'));
      expect(reasonField, findsOneWidget);
      await tester.enterText(reasonField, 'Papel de datáfono atascado');
      await tester.pumpAndSettle();

      final supField = find.byKey(const Key('override_supervisor_field'));
      expect(supField, findsOneWidget);
      await tester.enterText(supField, 'supervisor-mariana');
      await tester.pumpAndSettle();

      // When override updates, pending list is empty
      when(() => mockPaymentDao.getPendingCardPayments())
          .thenAnswer((_) async => []);

      // Submit override
      final submitOverride = find.byKey(const Key('btn_submit_override'));
      expect(submitOverride, findsOneWidget);
      await tester.tap(submitOverride);
      await tester.pumpAndSettle();

      expect(find.textContaining('Todos los vouchers han sido conciliados'), findsOneWidget);

      verify(() => mockPaymentDao.updatePayment(any(that: isA<PaymentEntity>().having(
            (p) => p.reconciliationStatus,
            'reconciliationStatus',
            'MANUAL_OVERRIDE',
          ).having(
            (p) => p.reconciledByUserId,
            'reconciledByUserId',
            'supervisor-mariana',
          )))).called(1);
    });
  });
}
