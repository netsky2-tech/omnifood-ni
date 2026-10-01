import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/api_base_url_service.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/terminal/terminal_identity_view.dart';
import 'package:pos_app/ui/features/config/terminal/terminal_identity_view_model.dart';
import 'package:provider/provider.dart';

class _MockPrinterConfigService extends Mock implements PrinterConfigService {}

/// In-memory [LocalConfigDao] so the real [ApiBaseUrlService] exercises the
/// actual persist/clear round-trip through the DAO contract.
class _FakeLocalConfigDao implements LocalConfigDao {
  final Map<String, LocalConfigEntity> stored = {};

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async => stored[key];

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    stored[config.key] = config;
  }

  @override
  Future<void> deleteConfig(String key) async {
    stored.remove(key);
  }
}

void main() {
  late _FakeLocalConfigDao configDao;
  late _MockPrinterConfigService printerConfigService;

  setUp(() {
    configDao = _FakeLocalConfigDao();
    printerConfigService = _MockPrinterConfigService();
    when(() => printerConfigService.getPrinterConfig()).thenAnswer(
      (_) async => const PrinterConfig(
        driverType: PrinterDriverType.mock,
        paperWidthMm: 58,
      ),
    );
  });

  /// Pumps the terminal identity screen with a real [ApiBaseUrlService] over
  /// the in-memory DAO, mirroring how [main.dart] wires the view model.
  Future<void> pumpScreen(
    WidgetTester tester, {
    Map<String, String> persistedConfigs = const {},
    String buildTimeApiUrl = '',
    bool isReleaseMode = false,
  }) async {
    persistedConfigs.forEach((key, value) {
      configDao.stored[key] = LocalConfigEntity(
        key: key,
        value: value,
        description: 'test config',
      );
    });

    final viewModel = TerminalIdentityViewModel(
      configDao: configDao,
      printerConfigService: printerConfigService,
      apiBaseUrlService: ApiBaseUrlService(
        configDao,
        isReleaseMode: isReleaseMode,
      ),
      buildTimeApiUrl: buildTimeApiUrl,
    );

    await tester.pumpWidget(
      ChangeNotifierProvider<TerminalIdentityViewModel>.value(
        value: viewModel,
        child: const MaterialApp(home: TerminalIdentityView()),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('server URL configuration card', () {
    testWidgets(
        'shows a persisted URL together with its persisted-source label',
        (tester) async {
      await pumpScreen(
        tester,
        persistedConfigs: {
          ApiBaseUrlService.configKey: 'https://api.ejemplo.com/api',
        },
      );

      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('server_url_text')),
        ).data,
        equals('https://api.ejemplo.com/api'),
      );
      expect(
        tester.widget<Text>(
          find.byKey(const Key('server_url_source')),
        ).data,
        contains('guardada en este dispositivo'),
      );
    });

    testWidgets(
        'a build-define-only URL shows the define source, not the persisted one',
        (tester) async {
      await pumpScreen(
        tester,
        buildTimeApiUrl: 'https://define.ejemplo.com/api',
      );

      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('server_url_text')),
        ).data,
        equals('https://define.ejemplo.com/api'),
      );
      expect(
        tester.widget<Text>(
          find.byKey(const Key('server_url_source')),
        ).data,
        contains('compilar'),
      );
      expect(
        tester.widget<Text>(
          find.byKey(const Key('server_url_source')),
        ).data,
        isNot(contains('guardada en este dispositivo')),
      );
    });

    testWidgets(
        'an unconfigured release state shows the unconfigured message and never '
        'presents localhost as a configured server', (tester) async {
      await pumpScreen(tester, isReleaseMode: true);

      expect(
        find.byKey(const Key('server_url_unconfigured_message')),
        findsOneWidget,
      );
      expect(
        find.textContaining('sincronización no está disponible'),
        findsOneWidget,
      );
      // No effective URL is shown, and the localhost development default is
      // never presented as if it were a configured backend.
      expect(find.byKey(const Key('server_url_text')), findsNothing);
      expect(find.textContaining('127.0.0.1'), findsNothing);
    });

    testWidgets('a valid URL is accepted and persisted through the service',
        (tester) async {
      await pumpScreen(
        tester,
        buildTimeApiUrl: 'https://define.ejemplo.com/api',
      );

      await tester.ensureVisible(find.byKey(const Key('server_url_field')));
      await tester.enterText(
        find.byKey(const Key('server_url_field')),
        'https://nuevo.ejemplo.com/api',
      );
      await tester.tap(find.byKey(const Key('save_server_url_button')));
      await tester.pumpAndSettle();

      // Persisted through ApiBaseUrlService.save into the DAO.
      expect(configDao.stored[ApiBaseUrlService.configKey], isNotNull);
      expect(
        configDao.stored[ApiBaseUrlService.configKey]!.value,
        equals('https://nuevo.ejemplo.com/api'),
      );

      // The display reloads and reports the persisted source.
      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('server_url_text')),
        ).data,
        equals('https://nuevo.ejemplo.com/api'),
      );
      expect(
        tester.widget<Text>(
          find.byKey(const Key('server_url_source')),
        ).data,
        contains('guardada en este dispositivo'),
      );
      expect(find.byKey(const Key('server_url_error')), findsNothing);
    });

    testWidgets(
        'an invalid URL is rejected, shows the validation message, and persists '
        'nothing', (tester) async {
      await pumpScreen(
        tester,
        buildTimeApiUrl: 'https://define.ejemplo.com/api',
      );

      await tester.ensureVisible(find.byKey(const Key('server_url_field')));
      await tester.enterText(
        find.byKey(const Key('server_url_field')),
        'no-es-una-url',
      );
      await tester.tap(find.byKey(const Key('save_server_url_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('server_url_error')), findsOneWidget);
      // Operator-facing copy is Spanish only: the reason is carried as a
      // structured code from the service, never as its English message string.
      expect(find.textContaining('No es una URL válida'), findsOneWidget);
      expect(
        find.textContaining('Invalid API URL'),
        findsNothing,
        reason: 'the service English message must not leak to the operator',
      );
      // Nothing was persisted.
      expect(configDao.stored[ApiBaseUrlService.configKey], isNull);
      // The effective URL is still the build define.
      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('server_url_text')),
        ).data,
        equals('https://define.ejemplo.com/api'),
      );
    });

    testWidgets(
        'clearing removes the persisted value and the display falls back to the '
        'build define', (tester) async {
      await pumpScreen(
        tester,
        persistedConfigs: {
          ApiBaseUrlService.configKey: 'https://api.ejemplo.com/api',
        },
        buildTimeApiUrl: 'https://define.ejemplo.com/api',
      );

      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('server_url_text')),
        ).data,
        equals('https://api.ejemplo.com/api'),
      );

      await tester.ensureVisible(
        find.byKey(const Key('clear_server_url_button')),
      );
      await tester.tap(find.byKey(const Key('clear_server_url_button')));
      await tester.pumpAndSettle();

      expect(configDao.stored[ApiBaseUrlService.configKey], isNull);
      expect(
        tester.widget<SelectableText>(
          find.byKey(const Key('server_url_text')),
        ).data,
        equals('https://define.ejemplo.com/api'),
      );
      expect(
        tester.widget<Text>(
          find.byKey(const Key('server_url_source')),
        ).data,
        contains('compilar'),
      );
    });

    testWidgets(
        'the restart notice is present whenever an edit is possible',
        (tester) async {
      // Persisted state: editable.
      await pumpScreen(
        tester,
        persistedConfigs: {
          ApiBaseUrlService.configKey: 'https://api.ejemplo.com/api',
        },
      );
      expect(
        find.byKey(const Key('server_url_restart_notice')),
        findsOneWidget,
      );

      // Unconfigured release state: editable too, otherwise the operator
      // could never provision the terminal.
      await pumpScreen(tester, isReleaseMode: true);
      expect(
        find.byKey(const Key('server_url_restart_notice')),
        findsOneWidget,
      );
    });
  });
}
