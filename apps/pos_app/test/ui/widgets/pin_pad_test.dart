import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/design_system/nhilos_tokens.dart';
import 'package:pos_app/ui/widgets/pin_pad.dart';

void main() {
  testWidgets('renders without overflow in compact height', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 320,
              height: 300,
              child: PinPad(
                onKeyPressed: _noopKey,
                onDelete: _noop,
                onClear: _noop,
              ),
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(ElevatedButton), findsNWidgets(12));
  });

  testWidgets('adheres to Keypad Clean Slate (§18.2): no brown (#795548) or danger red on C/delete', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 320,
              height: 400,
              child: PinPad(
                onKeyPressed: _noopKey,
                onDelete: _noop,
                onClear: _noop,
              ),
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Find the buttons for 'C' and '⌫'
    final cFinder = find.widgetWithText(ElevatedButton, 'C');
    final deleteFinder = find.widgetWithText(ElevatedButton, '⌫');
    final zeroFinder = find.widgetWithText(ElevatedButton, '0');

    expect(cFinder, findsOneWidget);
    expect(deleteFinder, findsOneWidget);
    expect(zeroFinder, findsOneWidget);

    final cButton = tester.widget<ElevatedButton>(cFinder);
    final deleteButton = tester.widget<ElevatedButton>(deleteFinder);
    final zeroButton = tester.widget<ElevatedButton>(zeroFinder);

    // Verify background colors: neutral gray Slate 100 for special, pure white for numbers
    expect(
      cButton.style?.backgroundColor?.resolve({}),
      equals(NhilosColors.neutralGray),
    );
    expect(
      deleteButton.style?.backgroundColor?.resolve({}),
      equals(NhilosColors.neutralGray),
    );
    expect(
      zeroButton.style?.backgroundColor?.resolve({}),
      equals(NhilosColors.surface),
    );

    // Explicitly verify prohibition of #795548 / #79573F and #BA1A1A / Red
    const forbiddenBrown = Color(0xFF79573F);
    const forbiddenBrownAlt = Color(0xFF795548);
    const forbiddenRed = Color(0xFFBA1A1A);

    expect(cButton.style?.backgroundColor?.resolve({}), isNot(equals(forbiddenRed)));
    expect(deleteButton.style?.backgroundColor?.resolve({}), isNot(equals(forbiddenBrown)));
    expect(deleteButton.style?.backgroundColor?.resolve({}), isNot(equals(forbiddenBrownAlt)));
  });
}

void _noop() {}

void _noopKey(String _) {}
