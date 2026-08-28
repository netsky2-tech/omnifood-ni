import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/design_system/responsive_layout.dart';

void main() {
  group('ResponsiveBreakpoints', () {
    testWidgets('identifies handheld / mobile screen width <= 600dp', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      late bool isHandheld;
      late bool isMobile;
      late bool isTablet;
      late bool isDesktop;
      late String resolvedValue;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              isHandheld = ResponsiveBreakpoints.isHandheld(context);
              isMobile = ResponsiveBreakpoints.isMobile(context);
              isTablet = ResponsiveBreakpoints.isTablet(context);
              isDesktop = ResponsiveBreakpoints.isDesktop(context);
              resolvedValue = ResponsiveBreakpoints.value(
                context,
                mobile: 'MOBILE',
                tablet: 'TABLET',
                desktop: 'DESKTOP',
              );
              return const SizedBox();
            },
          ),
        ),
      );

      expect(isHandheld, isTrue);
      expect(isMobile, isTrue);
      expect(isTablet, isFalse);
      expect(isDesktop, isFalse);
      expect(resolvedValue, 'MOBILE');
    });

    testWidgets('identifies tablet screen width between 600dp and 900dp', (tester) async {
      tester.view.physicalSize = const Size(800, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      late bool isHandheld;
      late bool isTablet;
      late bool isDesktop;
      late String resolvedValue;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              isHandheld = ResponsiveBreakpoints.isHandheld(context);
              isTablet = ResponsiveBreakpoints.isTablet(context);
              isDesktop = ResponsiveBreakpoints.isDesktop(context);
              resolvedValue = ResponsiveBreakpoints.value(
                context,
                mobile: 'MOBILE',
                tablet: 'TABLET',
                desktop: 'DESKTOP',
              );
              return const SizedBox();
            },
          ),
        ),
      );

      expect(isHandheld, isFalse);
      expect(isTablet, isTrue);
      expect(isDesktop, isFalse);
      expect(resolvedValue, 'TABLET');
    });

    testWidgets('identifies desktop / wide screen width > 900dp', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      late bool isHandheld;
      late bool isTablet;
      late bool isDesktop;
      late String resolvedValue;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              isHandheld = ResponsiveBreakpoints.isHandheld(context);
              isTablet = ResponsiveBreakpoints.isTablet(context);
              isDesktop = ResponsiveBreakpoints.isDesktop(context);
              resolvedValue = ResponsiveBreakpoints.value(
                context,
                mobile: 'MOBILE',
                tablet: 'TABLET',
                desktop: 'DESKTOP',
              );
              return const SizedBox();
            },
          ),
        ),
      );

      expect(isHandheld, isFalse);
      expect(isTablet, isFalse);
      expect(isDesktop, isTrue);
      expect(resolvedValue, 'DESKTOP');
    });
  });

  group('ResponsiveLayout widget', () {
    testWidgets('renders mobile widget on <= 600dp width', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(
        const MaterialApp(
          home: ResponsiveLayout(
            mobile: Text('MOBILE_WIDGET'),
            tablet: Text('TABLET_WIDGET'),
            desktop: Text('DESKTOP_WIDGET'),
          ),
        ),
      );

      expect(find.text('MOBILE_WIDGET'), findsOneWidget);
      expect(find.text('TABLET_WIDGET'), findsNothing);
      expect(find.text('DESKTOP_WIDGET'), findsNothing);
    });

    testWidgets('renders desktop widget on > 900dp width', (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(
        const MaterialApp(
          home: ResponsiveLayout(
            mobile: Text('MOBILE_WIDGET'),
            tablet: Text('TABLET_WIDGET'),
            desktop: Text('DESKTOP_WIDGET'),
          ),
        ),
      );

      expect(find.text('DESKTOP_WIDGET'), findsOneWidget);
      expect(find.text('MOBILE_WIDGET'), findsNothing);
    });
  });
}
