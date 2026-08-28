import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/domain/services/sales/split_bill_engine.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';

void main() {
  Widget buildTestableWidget({
    required Size surfaceSize,
    required TenantConfig config,
    required double subtotal,
    required double tax,
    required TipType tipType,
    required int coverCount,
  }) {
    final evaluator = BusinessModeEvaluator(config);
    final tipCalc = TipEngine.calculate(
      subtotalNio: subtotal,
      taxNio: tax,
      discountNio: 0.0,
      tipType: tipType,
      commercialRate: 36.50,
    );

    final splitResult = evaluator.isSplitBillAllowed
        ? SplitBillEngine.splitEqual(
            subtotalNio: subtotal,
            taxNio: tax,
            tipNio: tipCalc.tipAmountNio,
            discountNio: 0.0,
            coverCount: coverCount,
            commercialRate: 36.50,
          )
        : null;

    return MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(size: surfaceSize),
        child: Scaffold(
          body: LayoutBuilder(
            builder: (context, constraints) {
              final isCompact = constraints.maxWidth < 500;

              return Padding(
                padding: const EdgeInsets.all(16.0),
                child: isCompact
                    ? SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Modo: ${config.operationMode.displayName}',
                              key: const Key('business_mode_header'),
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 8),
                            if (evaluator.canUseBuzzerPager)
                              const Text('Buzzer / Pager Habilitado', key: Key('buzzer_pager_indicator')),
                            if (evaluator.canUseTableService)
                              const Text('Salón / Mesas Habilitado', key: Key('table_service_indicator')),
                            const Divider(),
                            Text('Subtotal: C\$ ${subtotal.toStringAsFixed(2)}', key: const Key('subtotal_text')),
                            Text('IVA (15%): C\$ ${tax.toStringAsFixed(2)}', key: const Key('tax_text')),
                            if (evaluator.isSuggestedTipPromptEnabled)
                              Text('Propina (10% DGI Exenta): C\$ ${tipCalc.tipAmountNio.toStringAsFixed(2)}',
                                  key: const Key('tip_text')),
                            Text('Total: C\$ ${tipCalc.totalWithTipNio.toStringAsFixed(2)}',
                                key: const Key('total_text')),
                            if (splitResult != null) ...[
                              const SizedBox(height: 12),
                              Text('Dividido en ${splitResult.shares.length} partes iguales:',
                                  key: const Key('split_header')),
                              ...splitResult.shares.map(
                                (s) => ListTile(
                                  dense: true,
                                  title: Text(s.label),
                                  trailing: Text('C\$ ${s.totalNio.toStringAsFixed(2)}'),
                                ),
                              ),
                            ],
                          ],
                        ),
                      )
                    : Row(
                        children: [
                          Expanded(
                            flex: 1,
                            child: Card(
                              child: Padding(
                                padding: const EdgeInsets.all(16.0),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Modo: ${config.operationMode.displayName}',
                                        key: const Key('business_mode_header')),
                                    if (evaluator.canUseBuzzerPager)
                                      const Text('Buzzer / Pager Habilitado', key: Key('buzzer_pager_indicator')),
                                    if (evaluator.canUseTableService)
                                      const Text('Salón / Mesas Habilitado', key: Key('table_service_indicator')),
                                    const Spacer(),
                                    Text('Subtotal: C\$ ${subtotal.toStringAsFixed(2)}',
                                        key: const Key('subtotal_text')),
                                    Text('IVA (15%): C\$ ${tax.toStringAsFixed(2)}', key: const Key('tax_text')),
                                    if (evaluator.isSuggestedTipPromptEnabled)
                                      Text('Propina (10% DGI Exenta): C\$ ${tipCalc.tipAmountNio.toStringAsFixed(2)}',
                                          key: const Key('tip_text')),
                                    Text('Total: C\$ ${tipCalc.totalWithTipNio.toStringAsFixed(2)}',
                                        key: const Key('total_text')),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          if (splitResult != null)
                            Expanded(
                              flex: 1,
                              child: Card(
                                child: Padding(
                                  padding: const EdgeInsets.all(16.0),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('División de Cuenta (${splitResult.shares.length} comensales)',
                                          key: const Key('split_header')),
                                      const Divider(),
                                      Expanded(
                                        child: ListView.builder(
                                          itemCount: splitResult.shares.length,
                                          itemBuilder: (context, idx) {
                                            final s = splitResult.shares[idx];
                                            return ListTile(
                                              title: Text(s.label),
                                              subtitle: Text('Sub: C\$ ${s.subtotalNio.toStringAsFixed(2)} | Propina: C\$ ${s.tipNio.toStringAsFixed(2)}'),
                                              trailing: Text('C\$ ${s.totalNio.toStringAsFixed(2)}',
                                                  style: const TextStyle(fontWeight: FontWeight.bold)),
                                            );
                                          },
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
              );
            },
          ),
        ),
      ),
    );
  }

  group('Responsive E2E Test - Salon Split Bills & Tips Across Devices & Modes', () {
    testWidgets('Sunmi V2s Handheld (360x720dp) in Food Park QSR mode displays compact single column without split',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        buildTestableWidget(
          surfaceSize: const Size(360, 720),
          config: const TenantConfig(
            operationMode: TenantOperationMode.foodparkQsr,
            tenantName: 'Food Park Central',
          ),
          subtotal: 300.0,
          tax: 45.0,
          tipType: TipType.none,
          coverCount: 1,
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byKey(const Key('business_mode_header')), findsOneWidget);
      expect(find.text('Modo: Food Park / QSR'), findsOneWidget);
      expect(find.byKey(const Key('buzzer_pager_indicator')), findsOneWidget);
      expect(find.byKey(const Key('table_service_indicator')), findsNothing);
      expect(find.byKey(const Key('tip_text')), findsNothing);
      expect(find.byKey(const Key('split_header')), findsNothing);
      expect(find.text('Total: C\$ 345.00'), findsOneWidget);
    });

    testWidgets('Tablet/Desktop (1024x768dp) in Restaurant mode displays side-by-side split bills with 10% tip',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        buildTestableWidget(
          surfaceSize: const Size(1024, 768),
          config: const TenantConfig(
            operationMode: TenantOperationMode.restaurant,
            tenantName: 'Restaurante El Güegüense',
          ),
          subtotal: 1000.0,
          tax: 150.0,
          tipType: TipType.suggestedTenPercent,
          coverCount: 4,
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byKey(const Key('business_mode_header')), findsOneWidget);
      expect(find.text('Modo: Restaurante / Mesas'), findsOneWidget);
      expect(find.byKey(const Key('table_service_indicator')), findsOneWidget);
      expect(find.byKey(const Key('buzzer_pager_indicator')), findsNothing);
      expect(find.byKey(const Key('tip_text')), findsOneWidget);
      expect(find.text('Propina (10% DGI Exenta): C\$ 100.00'), findsOneWidget);
      expect(find.text('Total: C\$ 1250.00'), findsOneWidget);

      // Split bill header and 4 shares
      expect(find.byKey(const Key('split_header')), findsOneWidget);
      expect(find.text('Comensal 1'), findsOneWidget);
      expect(find.text('Comensal 2'), findsOneWidget);
      expect(find.text('Comensal 3'), findsOneWidget);
      expect(find.text('Comensal 4'), findsOneWidget);
    });

    testWidgets('Handheld Mobile (360x720dp) in Hybrid mode supports table split scroll without overflow',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        buildTestableWidget(
          surfaceSize: const Size(360, 720),
          config: const TenantConfig(
            operationMode: TenantOperationMode.hybrid,
            tenantName: 'Café Bistro Híbrido',
          ),
          subtotal: 600.0,
          tax: 90.0,
          tipType: TipType.suggestedTenPercent,
          coverCount: 3,
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byKey(const Key('business_mode_header')), findsOneWidget);
      expect(find.text('Modo: Híbrido (QSR + Mesas)'), findsOneWidget);
      expect(find.byKey(const Key('buzzer_pager_indicator')), findsOneWidget);
      expect(find.byKey(const Key('table_service_indicator')), findsOneWidget);
      expect(find.byKey(const Key('tip_text')), findsOneWidget);
      expect(find.text('Dividido en 3 partes iguales:'), findsOneWidget);
      expect(find.text('Comensal 1'), findsOneWidget);
      expect(find.text('Comensal 2'), findsOneWidget);
      expect(find.text('Comensal 3'), findsOneWidget);
    });
  });
}
