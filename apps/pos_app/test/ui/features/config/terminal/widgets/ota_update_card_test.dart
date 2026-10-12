import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/ports/fiscal_safety_gate_port.dart';
import 'package:pos_app/domain/services/update/ota_discovery_service.dart';
import 'package:pos_app/domain/services/update/ota_update_coordinator.dart';
import 'package:pos_app/ui/features/config/terminal/widgets/ota_update_card.dart';

class _MockOtaUpdateCoordinator extends Mock implements OtaUpdateCoordinator {}

class _MockOtaDiscoveryService extends Mock implements OtaDiscoveryService {}

void main() {
  late _MockOtaUpdateCoordinator mockCoordinator;
  late _MockOtaDiscoveryService mockDiscovery;

  setUp(() {
    mockCoordinator = _MockOtaUpdateCoordinator();
    mockDiscovery = _MockOtaDiscoveryService();
    when(() => mockDiscovery.suppressOffer(any()))
        .thenAnswer((_) async {});
  });

  Widget createWidget({
    OtaDiscoveryService? discoveryService,
    Key? cardKey,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: OtaUpdateCard(
            key: cardKey,
            coordinator: mockCoordinator,
            discoveryService: discoveryService,
          ),
        ),
      ),
    );
  }

  final sampleManifest = ReleaseManifest(
    channel: 'pilot',
    abi: TargetAbi.arm64v8a,
    versionCode: 2002,
    versionName: '1.0.2',
    sha256: 'e' * 64,
    sizeBytes: 32357769,
    downloadUrl: Uri.parse('https://r2.test/app.apk'),
    minFromVersionCode: 2001,
    mandatory: false,
    publishedAt: DateTime.utc(2026, 10, 2),
    notes: 'Mejoras en estabilidad fiscal',
  );

  group('OtaUpdateCard — state rendering', () {
    testWidgets('renders check button in OtaInitial state', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaInitial());

      await tester.pumpWidget(createWidget());

      expect(find.byKey(const Key('ota_update_card')), findsOneWidget);
      expect(find.text('Buscar actualizaciones'), findsOneWidget);
    });

    testWidgets('renders green banner in OtaUpToDate state', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaUpToDate(2001));

      await tester.pumpWidget(createWidget());

      expect(find.textContaining('El sistema está al día'), findsOneWidget);
      expect(find.textContaining('2001'), findsOneWidget);
    });

    testWidgets('renders available update with enabled install button when gate is clear', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateClear(),
        ),
      );

      await tester.pumpWidget(createWidget());

      expect(find.text('Versión 1.0.2'), findsOneWidget);
      expect(find.text('build 2002'), findsOneWidget);
      expect(find.text('Mejoras en estabilidad fiscal'), findsOneWidget);

      final buttonFinder = find.byKey(const Key('ota_install_button'));
      expect(buttonFinder, findsOneWidget);
      final button = tester.widget<ElevatedButton>(buttonFinder);
      expect(button.enabled, isTrue);
    });

    testWidgets('disables install button and shows warning when fiscal gate is blocked', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateBlocked(
            reasons: [FiscalBlockReason.shiftOpen],
          ),
        ),
      );

      await tester.pumpWidget(createWidget());

      expect(find.text('Instalación temporalmente pausada'), findsOneWidget);
      expect(find.textContaining('Cierre la caja'), findsOneWidget);

      final buttonFinder = find.byKey(const Key('ota_install_button'));
      final button = tester.widget<ElevatedButton>(buttonFinder);
      expect(button.enabled, isFalse);
    });

    testWidgets('renders recheck button in blocked OtaUpdateAvailable state', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateBlocked(
            reasons: [FiscalBlockReason.shiftOpen],
          ),
        ),
      );

      await tester.pumpWidget(createWidget());

      expect(find.byKey(const Key('ota_recheck_button')), findsOneWidget);
      expect(find.text('Buscar actualizaciones'), findsOneWidget);
    });

    testWidgets('tapping recheck button calls checkForUpdate on coordinator', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateBlocked(
            reasons: [FiscalBlockReason.shiftOpen],
          ),
        ),
      );
      when(() => mockCoordinator.checkForUpdate()).thenAnswer((_) async {});

      await tester.pumpWidget(createWidget());

      await tester.tap(find.byKey(const Key('ota_recheck_button')));
      await tester.pump();

      verify(() => mockCoordinator.checkForUpdate()).called(1);
    });

    testWidgets('recheck button is enabled while install button stays disabled in blocked state', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateBlocked(
            reasons: [FiscalBlockReason.shiftOpen],
          ),
        ),
      );

      await tester.pumpWidget(createWidget());

      final installFinder = find.byKey(const Key('ota_install_button'));
      expect(installFinder, findsOneWidget);
      final installButton = tester.widget<ElevatedButton>(installFinder);
      expect(installButton.enabled, isFalse);

      final recheckFinder = find.byKey(const Key('ota_recheck_button'));
      expect(recheckFinder, findsOneWidget);
      final recheckButton = tester.widget<OutlinedButton>(recheckFinder);
      expect(recheckButton.enabled, isTrue);
    });

    testWidgets('does not render recheck button when gate is clear', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateClear(),
        ),
      );

      await tester.pumpWidget(createWidget());

      expect(find.byKey(const Key('ota_recheck_button')), findsNothing);
    });

    testWidgets('renders progress indicator in OtaDownloading state', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaDownloading(
          manifest: sampleManifest,
          receivedBytes: 16178884,
          totalBytes: 32357769,
        ),
      );

      await tester.pumpWidget(createWidget());

      expect(find.byKey(const Key('ota_download_progress')), findsOneWidget);
      expect(find.text('50%'), findsOneWidget);
      expect(find.textContaining('15.4 MB / 30.9 MB'), findsOneWidget);
    });

    testWidgets('renders permission required container and button in OtaPermissionRequired state', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaPermissionRequired());

      await tester.pumpWidget(createWidget());

      expect(find.text('Permiso requerido para actualizar'), findsOneWidget);
      expect(find.text('Abrir Ajustes de Seguridad'), findsOneWidget);
    });

    testWidgets('lays out cleanly on Q80 screen width (533 logical) without overflow', (tester) async {
      tester.view.physicalSize = const Size(800, 1280);
      tester.view.devicePixelRatio = 1.5;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateBlocked(
            reasons: [FiscalBlockReason.cartNotEmpty, FiscalBlockReason.shiftOpen],
          ),
        ),
      );

      await tester.pumpWidget(createWidget());
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
    });
  });

  OtaSilentOffer buildSilentOffer({
    FiscalSafetyVerdict verdict = const FiscalGateClear(),
  }) {
    return OtaSilentOffer(
      manifest: sampleManifest,
      fiscalVerdict: verdict,
      installedVersionCode: 2001,
      observedAt: DateTime.utc(2026, 10, 2),
    );
  }

  group('OtaUpdateCard — silent offer (T3b)', () {
    testWidgets('renders silent offer in OtaInitial with install enabled when gate is clear', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaInitial());
      when(() => mockDiscovery.lastOffer).thenReturn(buildSilentOffer());

      await tester.pumpWidget(createWidget(discoveryService: mockDiscovery));

      expect(find.text('Versión 1.0.2'), findsOneWidget);
      expect(find.text('build 2002'), findsOneWidget);

      final button = tester.widget<ElevatedButton>(
        find.byKey(const Key('ota_install_button')),
      );
      expect(button.enabled, isTrue);

      // The silent offer must show ONE update offer and ONE action: the
      // check action is replaced, not stacked below the offer.
      expect(find.text('Buscar actualizaciones'), findsNothing);
    });

    testWidgets('does not render silent offer as a second block when coordinator is OtaUpToDate', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaUpToDate(2001));
      when(() => mockDiscovery.lastOffer).thenReturn(buildSilentOffer());

      await tester.pumpWidget(createWidget(discoveryService: mockDiscovery));

      expect(find.text('Versión 1.0.2'), findsNothing);
      expect(find.byKey(const Key('ota_offer_dismiss_now')), findsNothing);
      expect(find.byKey(const Key('ota_offer_suppress_version')), findsNothing);
    });

    testWidgets('does not render silent offer as a second block when coordinator already shows OtaUpdateAvailable', (tester) async {
      when(() => mockCoordinator.state).thenReturn(
        OtaUpdateAvailable(
          manifest: sampleManifest,
          fiscalVerdict: const FiscalGateClear(),
        ),
      );
      when(() => mockDiscovery.lastOffer).thenReturn(buildSilentOffer());

      await tester.pumpWidget(createWidget(discoveryService: mockDiscovery));

      // The manual check result wins; no duplicate offer block and no
      // silent-offer dismissal controls next to it.
      expect(find.text('Versión 1.0.2'), findsOneWidget);
      expect(find.byKey(const Key('ota_offer_dismiss_now')), findsNothing);
      expect(find.byKey(const Key('ota_offer_suppress_version')), findsNothing);
    });

    testWidgets('"Ahora no" hides the offer for the rest of the session without calling suppressOffer', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaInitial());
      when(() => mockDiscovery.lastOffer).thenReturn(buildSilentOffer());

      await tester.pumpWidget(createWidget(discoveryService: mockDiscovery));

      await tester.tap(find.byKey(const Key('ota_offer_dismiss_now')));
      await tester.pump();

      expect(find.text('Versión 1.0.2'), findsNothing);
      expect(find.text('Buscar actualizaciones'), findsOneWidget);
      verifyNever(() => mockDiscovery.suppressOffer(any()));
    });

    testWidgets(
        'a freshly mounted card state shows the offer again (proves '
        'card-instance scope; cross-restart re-emission is covered by the '
        'discovery service tests)', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaInitial());
      when(() => mockDiscovery.lastOffer).thenReturn(buildSilentOffer());

      await tester.pumpWidget(createWidget(discoveryService: mockDiscovery));
      await tester.tap(find.byKey(const Key('ota_offer_dismiss_now')));
      await tester.pump();
      expect(find.text('Versión 1.0.2'), findsNothing);

      // A new card State must surface the offer again: the hide is held in
      // memory only. NOTE: this proves card-instance scope. Since T3c the
      // discovery service persists suppression ONLY on explicit dismissal
      // (suppressOffer), so a merely surfaced offer re-emits after a real
      // app restart — that cross-restart claim is proven by
      // ota_discovery_service_test.dart, not here.
      await tester.pumpWidget(
        createWidget(discoveryService: mockDiscovery, cardKey: UniqueKey()),
      );

      expect(find.text('Versión 1.0.2'), findsOneWidget);
    });

    testWidgets('"No avisarme de esta versión" calls suppressOffer with exactly the offer versionCode', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaInitial());
      when(() => mockDiscovery.lastOffer).thenReturn(buildSilentOffer());

      await tester.pumpWidget(createWidget(discoveryService: mockDiscovery));

      await tester.tap(find.byKey(const Key('ota_offer_suppress_version')));
      await tester.pump();

      verify(() => mockDiscovery.suppressOffer(2002)).called(1);
      expect(find.text('Versión 1.0.2'), findsNothing);
    });

    testWidgets('blocked silent offer shows amber pause block and disables install', (tester) async {
      when(() => mockCoordinator.state).thenReturn(const OtaInitial());
      when(() => mockDiscovery.lastOffer).thenReturn(
        buildSilentOffer(
          verdict: const FiscalGateBlocked(
            reasons: [FiscalBlockReason.shiftOpen],
          ),
        ),
      );

      await tester.pumpWidget(createWidget(discoveryService: mockDiscovery));

      expect(find.text('Instalación temporalmente pausada'), findsOneWidget);
      expect(find.textContaining('Cierre la caja'), findsOneWidget);

      final button = tester.widget<ElevatedButton>(
        find.byKey(const Key('ota_install_button')),
      );
      expect(button.enabled, isFalse);
    });
  });
}
