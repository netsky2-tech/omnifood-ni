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

/// Geometry of the real Q80 terminal measured on hardware:
/// physical 800x1280 px at density 240 dpi -> devicePixelRatio 1.5
/// -> LOGICAL 533.3 x 853.3.
///
/// The existing server-URL tests never set a surface size, so they run at the
/// 800x600 logical default and cannot see what a 533-logical-wide screen sees.
const _q80LogicalSize = Size(800 / 1.5, 1280 / 1.5); // 533.3 x 853.3

class _MockPrinterConfigService extends Mock implements PrinterConfigService {}

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

  Future<void> pumpOnQ80(WidgetTester tester) async {
    tester.view.physicalSize = const Size(800, 1280);
    tester.view.devicePixelRatio = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final viewModel = TerminalIdentityViewModel(
      configDao: configDao,
      printerConfigService: printerConfigService,
      apiBaseUrlService: ApiBaseUrlService(configDao, isReleaseMode: false),
      buildTimeApiUrl: '',
    );

    await tester.pumpWidget(
      ChangeNotifierProvider<TerminalIdentityViewModel>.value(
        value: viewModel,
        child: const MaterialApp(home: TerminalIdentityView()),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('terminal identity card on the real Q80 width (533 logical)', () {
    testWidgets('the save/clear action row does not overflow', (tester) async {
      await pumpOnQ80(tester);

      // A RenderFlex overflow is reported as an exception by the test binding.
      expect(
        tester.takeException(),
        isNull,
        reason: 'the action row must lay out within the device width',
      );
    });

    testWidgets('Guardar is laid out and fully inside the viewport',
        (tester) async {
      await pumpOnQ80(tester);

      final save = find.byKey(const Key('save_server_url_button'));
      expect(save, findsOneWidget);

      final rect = tester.getRect(save);
      expect(
        rect.right,
        lessThanOrEqualTo(_q80LogicalSize.width),
        reason: 'Guardar must not be pushed past the right edge',
      );
      expect(rect.width, greaterThan(0), reason: 'Guardar must have width');
    });

    testWidgets('Borrar configuración guardada is laid out, not collapsed',
        (tester) async {
      await pumpOnQ80(tester);

      final clear = find.byKey(const Key('clear_server_url_button'));
      expect(clear, findsOneWidget);

      final rect = tester.getRect(clear);
      expect(
        rect.width,
        greaterThan(0),
        reason: 'a zero-width clear button is unreachable on the device',
      );
      expect(
        rect.right,
        lessThanOrEqualTo(_q80LogicalSize.width),
        reason: 'Borrar configuración guardada must stay on screen',
      );
    });

    testWidgets('an operator can actually tap Guardar and persist the URL',
        (tester) async {
      await pumpOnQ80(tester);

      await tester.enterText(
        find.byKey(const Key('server_url_field')),
        'https://api-staging.nhilospos.com/api',
      );
      await tester.pumpAndSettle();

      final save = find.byKey(const Key('save_server_url_button'));
      // At 533x853 the action row sits below the vertical fold, so the operator
      // scrolls to it. Do the same, then tap where it actually lands.
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();

      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(
        configDao.stored['api_base_url']?.value,
        'https://api-staging.nhilospos.com/api',
        reason: 'the whole point of the card is to persist a URL by touch',
      );
    });
  });
}
