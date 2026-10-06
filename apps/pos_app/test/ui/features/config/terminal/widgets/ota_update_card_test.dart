import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/ports/fiscal_safety_gate_port.dart';
import 'package:pos_app/domain/services/update/ota_update_coordinator.dart';
import 'package:pos_app/ui/features/config/terminal/widgets/ota_update_card.dart';

class _MockOtaUpdateCoordinator extends Mock implements OtaUpdateCoordinator {}

void main() {
  late _MockOtaUpdateCoordinator mockCoordinator;

  setUp(() {
    mockCoordinator = _MockOtaUpdateCoordinator();
  });

  Widget createWidget() {
    return MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: OtaUpdateCard(coordinator: mockCoordinator),
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
}
