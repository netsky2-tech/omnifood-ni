import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/main.dart';

void main() {
  const s23LogicalSize = Size(384, 823.5);

  void configureS23Viewport(WidgetTester tester) {
    tester.view.physicalSize = s23LogicalSize;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Widget wrapWithPosTheme(Widget child) {
    return MaterialApp(
      theme: buildNhilosPosTheme(),
      home: Scaffold(body: child),
    );
  }

  group('buildNhilosPosTheme ElevatedButton constraints (#950)', () {
    test('elevatedButtonTheme minimumSize uses finite width (0) and 48dp height', () {
      final theme = buildNhilosPosTheme();
      final minSize = theme.elevatedButtonTheme.style?.minimumSize?.resolve({});
      expect(minSize, isNotNull);
      expect(minSize!.width, 0.0);
      expect(minSize.width.isFinite, isTrue);
      expect(minSize.height, 48.0);
    });

    testWidgets(
      'AlertDialog with non-stretched Column renders ElevatedButton & ElevatedButton.icon without infinite width',
      (tester) async {
        configureS23Viewport(tester);

        await tester.pumpWidget(
          wrapWithPosTheme(
            AlertDialog(
              title: const Text('Confirmar acción'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ElevatedButton(
                    key: const Key('dialog_plain_btn'),
                    onPressed: () {},
                    child: const Text('Aceptar'),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    key: const Key('dialog_icon_btn'),
                    onPressed: () {},
                    icon: const Icon(Icons.person_add),
                    label: const Text('Nuevo'),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);

        final plainSize = tester.getSize(find.byKey(const Key('dialog_plain_btn')));
        final iconSize = tester.getSize(find.byKey(const Key('dialog_icon_btn')));

        expect(plainSize.height, greaterThanOrEqualTo(48.0));
        expect(plainSize.width, greaterThan(0));
        expect(plainSize.width.isFinite, isTrue);
        expect(plainSize.width, lessThan(s23LogicalSize.width));

        expect(iconSize.height, greaterThanOrEqualTo(48.0));
        expect(iconSize.width, greaterThan(0));
        expect(iconSize.width.isFinite, isTrue);
        expect(iconSize.width, lessThan(s23LogicalSize.width));
      },
    );

    testWidgets(
      'IntrinsicWidth renders ElevatedButton & ElevatedButton.icon without infinite width',
      (tester) async {
        configureS23Viewport(tester);

        await tester.pumpWidget(
          wrapWithPosTheme(
            Center(
              child: IntrinsicWidth(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ElevatedButton(
                      key: const Key('intrinsic_plain_btn'),
                      onPressed: () {},
                      child: const Text('Continuar'),
                    ),
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      key: const Key('intrinsic_icon_btn'),
                      onPressed: () {},
                      icon: const Icon(Icons.check),
                      label: const Text('Guardar'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);

        final plainSize = tester.getSize(find.byKey(const Key('intrinsic_plain_btn')));
        final iconSize = tester.getSize(find.byKey(const Key('intrinsic_icon_btn')));

        expect(plainSize.height, greaterThanOrEqualTo(48.0));
        expect(plainSize.width, greaterThan(0));
        expect(plainSize.width.isFinite, isTrue);

        expect(iconSize.height, greaterThanOrEqualTo(48.0));
        expect(iconSize.width, greaterThan(0));
        expect(iconSize.width.isFinite, isTrue);
      },
    );

    testWidgets(
      'Row with non-Expanded ElevatedButton & ElevatedButton.icon renders without infinite width',
      (tester) async {
        configureS23Viewport(tester);

        await tester.pumpWidget(
          wrapWithPosTheme(
            Row(
              children: [
                ElevatedButton(
                  key: const Key('row_plain_btn'),
                  onPressed: () {},
                  child: const Text('Cancelar'),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  key: const Key('row_icon_btn'),
                  onPressed: () {},
                  icon: const Icon(Icons.person_add),
                  label: const Text('Nuevo'),
                ),
              ],
            ),
          ),
        );

        expect(tester.takeException(), isNull);

        final plainSize = tester.getSize(find.byKey(const Key('row_plain_btn')));
        final iconSize = tester.getSize(find.byKey(const Key('row_icon_btn')));

        expect(plainSize.height, greaterThanOrEqualTo(48.0));
        expect(plainSize.width, greaterThan(0));
        expect(plainSize.width.isFinite, isTrue);

        expect(iconSize.height, greaterThanOrEqualTo(48.0));
        expect(iconSize.width, greaterThan(0));
        expect(iconSize.width.isFinite, isTrue);
      },
    );

    testWidgets(
      'Wrap renders ElevatedButton & ElevatedButton.icon cleanly at S23 viewport',
      (tester) async {
        configureS23Viewport(tester);

        await tester.pumpWidget(
          wrapWithPosTheme(
            Padding(
              padding: const EdgeInsets.all(16),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ElevatedButton(
                    key: const Key('wrap_plain_btn'),
                    onPressed: () {},
                    child: const Text('Filtrar'),
                  ),
                  ElevatedButton.icon(
                    key: const Key('wrap_icon_btn'),
                    onPressed: () {},
                    icon: const Icon(Icons.add),
                    label: const Text('Nuevo'),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);

        final plainSize = tester.getSize(find.byKey(const Key('wrap_plain_btn')));
        final iconSize = tester.getSize(find.byKey(const Key('wrap_icon_btn')));

        expect(plainSize.height, greaterThanOrEqualTo(48.0));
        expect(plainSize.width, greaterThan(0));
        expect(plainSize.width.isFinite, isTrue);

        expect(iconSize.height, greaterThanOrEqualTo(48.0));
        expect(iconSize.width, greaterThan(0));
        expect(iconSize.width.isFinite, isTrue);
      },
    );

    testWidgets(
      'SizedBox(width: double.infinity) creates explicit full-width CTA at S23 viewport',
      (tester) async {
        configureS23Viewport(tester);

        await tester.pumpWidget(
          wrapWithPosTheme(
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      key: const Key('full_width_cta'),
                      onPressed: () {},
                      child: const Text('REGISTRAR MERMA'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);

        final ctaSize = tester.getSize(find.byKey(const Key('full_width_cta')));
        expect(ctaSize.height, greaterThanOrEqualTo(48.0));
        expect(ctaSize.width, equals(s23LogicalSize.width - 32.0));
      },
    );
  });
}
