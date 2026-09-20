import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/terminal/terminal_identity_view.dart';
import 'package:pos_app/ui/features/config/terminal/terminal_identity_view_model.dart';
import 'package:provider/provider.dart';

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}

class _MockPrinterConfigService extends Mock implements PrinterConfigService {}

LocalConfigEntity _identityEntity(String value) => LocalConfigEntity(
      key: TerminalIdentityService.localDeviceIdKey,
      value: value,
      description: 'test identity',
    );

void main() {
  late _MockLocalConfigDao configDao;
  late _MockPrinterConfigService printerConfigService;

  setUpAll(() {
    registerFallbackValue(
      LocalConfigEntity(key: 'fallback-key', value: 'fallback-value'),
    );
    registerFallbackValue(const PrinterConfig());
  });

  setUp(() {
    configDao = _MockLocalConfigDao();
    printerConfigService = _MockPrinterConfigService();
    when(() => printerConfigService.getPrinterConfig()).thenAnswer(
      (_) async => const PrinterConfig(
        driverType: PrinterDriverType.sunmiV2s,
        paperWidthMm: 58,
        headerBusinessName: 'OMNIFOOD NI',
      ),
    );
  });

  Widget buildWidget(TerminalIdentityViewModel viewModel) {
    return ChangeNotifierProvider<TerminalIdentityViewModel>.value(
      value: viewModel,
      child: const MaterialApp(home: TerminalIdentityView()),
    );
  }

  TerminalIdentityViewModel buildViewModel({
    String? persistedValue,
    String buildTimeDeviceId = '',
  }) {
    when(() => configDao.getConfigByKey(any())).thenAnswer(
      (_) async =>
          persistedValue == null ? null : _identityEntity(persistedValue),
    );
    return TerminalIdentityViewModel(
      configDao: configDao,
      printerConfigService: printerConfigService,
      buildTimeDeviceId: buildTimeDeviceId,
    );
  }

  group('TerminalIdentityView', () {
    testWidgets('renders the persisted terminal id when provisioned',
        (tester) async {
      await tester.pumpWidget(buildWidget(buildViewModel(
        persistedValue: 'POS-TENANT-01',
        buildTimeDeviceId: 'POS-TENANT-01',
      )));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('terminal_id_text')), findsOneWidget);
      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('terminal_id_text')),
        ).data,
        equals('POS-TENANT-01'),
      );
    });

    testWidgets('shows the not-provisioned branch when no identity is persisted',
        (tester) async {
      await tester.pumpWidget(
        buildWidget(buildViewModel(persistedValue: null)),
      );
      await tester.pumpAndSettle();

      // No identity is provisioned yet; one is generated on first use.
      expect(find.text('Sin identidad asignada'), findsOneWidget);
      expect(
        find.textContaining('Se generará uno automáticamente'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('terminal_id_text')), findsNothing);
      expect(find.byKey(const Key('copy_terminal_id_button')), findsNothing);
    });

    testWidgets('shows the match copy when the persisted id equals the compiled id',
        (tester) async {
      await tester.pumpWidget(buildWidget(buildViewModel(
        persistedValue: 'POS-TENANT-01',
        buildTimeDeviceId: 'POS-TENANT-01',
      )));
      await tester.pumpAndSettle();

      expect(find.text('Coincide con el identificador compilado'),
          findsOneWidget);
      expect(
        find.textContaining('coincide con el identificador compilado'),
        findsOneWidget,
      );
      // The surface must never assert when or where the identity was generated.
      expect(find.textContaining('Generada en este dispositivo'), findsNothing);
      expect(find.textContaining('fue generado automáticamente'), findsNothing);
    });

    testWidgets('shows the no-match warning when the persisted id differs',
        (tester) async {
      await tester.pumpWidget(buildWidget(buildViewModel(
        persistedValue: 'pos-local-old-abc',
        buildTimeDeviceId: 'POS-TENANT-01',
      )));
      await tester.pumpAndSettle();

      expect(find.text('No coincide con el identificador compilado'),
          findsOneWidget);
      expect(
        find.textContaining('confirme que este sea el identificador correcto'),
        findsOneWidget,
      );
      expect(
        find.textContaining('identidad previa de otra inscripción'),
        findsOneWidget,
      );
    });

    testWidgets('shows the no-match warning when no id was compiled into the build',
        (tester) async {
      await tester.pumpWidget(buildWidget(buildViewModel(
        persistedValue: 'pos-local-old-abc',
        buildTimeDeviceId: '',
      )));
      await tester.pumpAndSettle();

      expect(find.text('No coincide con el identificador compilado'),
          findsOneWidget);
      expect(
        find.textContaining('identidad previa de otra inscripción'),
        findsOneWidget,
      );
    });

    testWidgets('refresh action reloads the persisted identity from the DAO',
        (tester) async {
      var persistedValue = 'POS-TENANT-01';
      when(() => configDao.getConfigByKey(any())).thenAnswer(
        (_) async => persistedValue == null
            ? null
            : _identityEntity(persistedValue),
      );
      final viewModel = TerminalIdentityViewModel(
        configDao: configDao,
        printerConfigService: printerConfigService,
        buildTimeDeviceId: 'POS-TENANT-01',
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      // mocktail counts unverified invocations per verify, so a single
      // post-refresh verify asserts the total: initial load + refresh.
      persistedValue = 'pos-local-abc-123';
      await tester.tap(find.byIcon(Icons.refresh));
      await tester.pumpAndSettle();

      verify(() => configDao.getConfigByKey(
          TerminalIdentityService.localDeviceIdKey)).called(2);
      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('terminal_id_text')),
        ).data,
        equals('pos-local-abc-123'),
      );
    });

    testWidgets(
        'copy action puts the terminal id on the clipboard and shows confirmation',
        (tester) async {
      // The flutter_test harness allows mocking the platform channel, so the
      // clipboard action is covered here rather than silently skipped.
      Object? clipboardMessage;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            clipboardMessage = call.arguments['text'];
          }
          return null;
        },
      );
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null));

      await tester.pumpWidget(buildWidget(buildViewModel(
        persistedValue: 'POS-TENANT-01',
        buildTimeDeviceId: 'POS-TENANT-01',
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('copy_terminal_id_button')));
      await tester.pumpAndSettle();

      expect(clipboardMessage, equals('POS-TENANT-01'));
      expect(find.text('Identificador copiado al portapapeles.'),
          findsOneWidget);
    });
  });
}
