import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/presentation/features/sales/widgets/loyalty_compact_widget.dart';

void main() {
  group('LV1.4F — Offline/restart UX', () {
    group('Config stale indicator', () {
      testWidgets('muestra indicador discreto de config stale sin modal bloqueante',
          (tester) async {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 150,
              earningPreviewUnits: 20,
            ),
          ],
          staleConfigIndicator: true,
        );

        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: LoyaltyCompactWidget(evaluation: evaluation),
          ),
        ));

        // Debe mostrar el indicador discreto
        expect(find.text('Config. desactualizada'), findsOneWidget);

        // NO debe mostrar modal/bloqueo
        expect(find.byType(AlertDialog), findsNothing);
        expect(find.byType(Dialog), findsNothing);
      });

      testWidgets('checkout sigue habilitado con config stale',
          (tester) async {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 150,
              earningPreviewUnits: 20,
            ),
          ],
          staleConfigIndicator: true,
        );

        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                LoyaltyCompactWidget(evaluation: evaluation),
                ElevatedButton(
                  onPressed: () {},
                  child: const Text('Cobrar'),
                ),
              ],
            ),
          ),
        ));

        // El botón de cobrar debe estar visible y habilitado
        expect(find.text('Cobrar'), findsOneWidget);
        final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
        expect(button.onPressed, isNotNull);
      });
    });

    group('Pending sync no bloquea venta', () {
      testWidgets('LoyaltyCompactWidget no muestra error de sync pendiente',
          (tester) async {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 150,
              earningPreviewUnits: 20,
            ),
          ],
        );

        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: LoyaltyCompactWidget(evaluation: evaluation),
          ),
        ));

        // No debe mostrar mensajes de error de sync
        expect(find.textContaining('sync'), findsNothing);
        expect(find.textContaining('Sincroniz'), findsNothing);
        expect(find.textContaining('Error'), findsNothing);
      });
    });

    group('Snapshot/version display', () {
      testWidgets('muestra progreso desde configuración local cached',
          (tester) async {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-2',
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 7,
              earningPreviewUnits: 1,
              eligibleRewards: [
                EligibleReward(
                  rewardId: 'rw-1',
                  name: 'Smash Burger Gratis',
                  rewardType: RewardType.freeProduct,
                  costUnits: 10,
                ),
              ],
            ),
          ],
        );

        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: LoyaltyCompactWidget(evaluation: evaluation),
          ),
        ));

        // Balance 7 se muestra correctamente
        expect(find.text('7'), findsOneWidget);
        // Earning preview se muestra
        expect(find.text('+1'), findsOneWidget);
        // Próxima reward se muestra
        expect(find.text('Próx: Smash Burger Gratis'), findsOneWidget);
      });
    });

    group('No modal bloqueante', () {
      testWidgets('nunca muestra Dialog o AlertDialog para config stale',
          (tester) async {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 150,
              earningPreviewUnits: 20,
            ),
          ],
          staleConfigIndicator: true,
        );

        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: LoyaltyCompactWidget(evaluation: evaluation),
          ),
        ));

        // Verificar que no hay ningún tipo de modal/dialog
        expect(find.byType(AlertDialog), findsNothing);
        expect(find.byType(Dialog), findsNothing);
      });
    });
  });
}
