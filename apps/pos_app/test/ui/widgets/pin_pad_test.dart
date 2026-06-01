import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
}

void _noop() {}

void _noopKey(String _) {}
