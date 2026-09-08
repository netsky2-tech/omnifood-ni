import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/navigation/route_observer.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:mockito/mockito.dart';

class MockOnPopNextCallback {
  int callCount = 0;
  void call() => callCount++;
}

/// Minimal RouteAware that replicates the exact pattern in _SaleViewState.
class _TestRouteAwareWidget extends StatefulWidget {
  final VoidCallback? onDidPopNext;

  const _TestRouteAwareWidget({this.onDidPopNext});

  @override
  State<_TestRouteAwareWidget> createState() => _TestRouteAwareState();
}

class _TestRouteAwareState extends State<_TestRouteAwareWidget> with RouteAware {
  String _regime = 'REGIMEN_GENERAL';

  void _loadCompanyTaxRegime() {
    _regime = _testDbRegime;
  }

  @override
  void initState() {
    super.initState();
    _loadCompanyTaxRegime();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    appRouteObserver.subscribe(this, ModalRoute.of(context)!);
  }

  @override
  void dispose() {
    appRouteObserver.unsubscribe(this);
    super.dispose();
  }

  @override
  void didPopNext() {
    if (mounted) {
      _loadCompanyTaxRegime();
      widget.onDidPopNext?.call();
    }
  }

  @override
  Widget build(BuildContext context) => Text('regime:$_regime');
}

/// Simulates the database backing store
String _testDbRegime = 'REGIMEN_GENERAL';

void main() {
  group('RouteObserver Wiring', () {
    setUp(() {
      _testDbRegime = 'REGIMEN_GENERAL';
    });

    testWidgets('RouteObserver is registered as singleton', (tester) async {
      expect(appRouteObserver, isA<RouteObserver>());
    });

    testWidgets('didPopNext fires on push/pop transition back to SaleView', (tester) async {
      final onPopNext = MockOnPopNextCallback();

      await tester.pumpWidget(MaterialApp(
        navigatorObservers: [appRouteObserver],
        home: _TestRouteAwareWidget(onDidPopNext: onPopNext.call),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('regime:REGIMEN_GENERAL'), findsOneWidget);

      // Push a new route (simulates navigating to config)
      final NavigatorState navigator = tester.firstState(find.byType(Navigator));
      navigator.push(MaterialPageRoute(
        builder: (_) => const Scaffold(body: Center(child: Text('Config'))),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('Config'), findsOneWidget);

      // Simulate config changed in DB
      _testDbRegime = 'CUOTA_FIJA';

      // Pop back to SaleView — didPopNext should fire
      navigator.pop();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(onPopNext.callCount, equals(1));
      expect(find.text('regime:CUOTA_FIJA'), findsOneWidget);
    });

    testWidgets('didPopNext fires after CF -> RG transition', (tester) async {
      _testDbRegime = 'CUOTA_FIJA';
      final onPopNext = MockOnPopNextCallback();

      await tester.pumpWidget(MaterialApp(
        navigatorObservers: [appRouteObserver],
        home: _TestRouteAwareWidget(onDidPopNext: onPopNext.call),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('regime:CUOTA_FIJA'), findsOneWidget);

      final NavigatorState navigator = tester.firstState(find.byType(Navigator));
      navigator.push(MaterialPageRoute(
        builder: (_) => const Scaffold(body: Center(child: Text('Config'))),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      _testDbRegime = 'REGIMEN_GENERAL';

      navigator.pop();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(onPopNext.callCount, equals(1));
      expect(find.text('regime:REGIMEN_GENERAL'), findsOneWidget);
    });

    testWidgets('unsubscribe on dispose works cleanly', (tester) async {
      await tester.pumpWidget(MaterialApp(
        navigatorObservers: [appRouteObserver],
        home: const _TestRouteAwareWidget(),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // Dispose the widget tree — unsubscribe is called
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      await tester.pump();

      expect(find.byType(_TestRouteAwareWidget), findsNothing);
    });

    testWidgets('3 sequential push/pop cycles: RG->CF->RG->CF', (tester) async {
      _testDbRegime = 'REGIMEN_GENERAL';
      final onPopNext = MockOnPopNextCallback();

      await tester.pumpWidget(MaterialApp(
        navigatorObservers: [appRouteObserver],
        home: _TestRouteAwareWidget(onDidPopNext: onPopNext.call),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      final NavigatorState navigator = tester.firstState(find.byType(Navigator));

      // Cycle 1: RG -> CF
      navigator.push(MaterialPageRoute(
        builder: (_) => const Scaffold(body: Center(child: Text('Config'))),
      ));
      await tester.pump();
      _testDbRegime = 'CUOTA_FIJA';
      navigator.pop();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('regime:CUOTA_FIJA'), findsOneWidget);

      // Cycle 2: CF -> RG
      navigator.push(MaterialPageRoute(
        builder: (_) => const Scaffold(body: Center(child: Text('Config'))),
      ));
      await tester.pump();
      _testDbRegime = 'REGIMEN_GENERAL';
      navigator.pop();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('regime:REGIMEN_GENERAL'), findsOneWidget);

      // Cycle 3: RG -> CF
      navigator.push(MaterialPageRoute(
        builder: (_) => const Scaffold(body: Center(child: Text('Config'))),
      ));
      await tester.pump();
      _testDbRegime = 'CUOTA_FIJA';
      navigator.pop();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('regime:CUOTA_FIJA'), findsOneWidget);

      expect(onPopNext.callCount, equals(3));
    });
  });
}
