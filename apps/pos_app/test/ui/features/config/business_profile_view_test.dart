import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view_model.dart';
import 'package:provider/provider.dart';

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}

void main() {
  late _MockLocalConfigDao mockDao;
  late BusinessProfileViewModel viewModel;

  setUpAll(() {
    registerFallbackValue(LocalConfigEntity(key: 'fallback', value: ''));
  });

  setUp(() {
    mockDao = _MockLocalConfigDao();
    viewModel = BusinessProfileViewModel(mockDao);
  });

  Widget buildWidget() {
    return ChangeNotifierProvider<BusinessProfileViewModel>.value(
      value: viewModel,
      child: const MaterialApp(
        home: BusinessProfileView(),
      ),
    );
  }

  testWidgets('BusinessProfileView synchronizes business_name and emits CONTROLLER_UPDATED: true without logging config map', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(find.text('Café Managua'), findsOneWidget);
      expect(printedLogs, contains('CONTROLLER_UPDATED: true'));
      // Ensure diagnostics do not print full ViewModel config map
      expect(printedLogs.any((log) => log.contains('loadConfig done, config:')), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });

  testWidgets('BusinessProfileView emits CONTROLLER_UPDATED: false when business_name is empty', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(printedLogs, contains('CONTROLLER_UPDATED: false'));
      expect(printedLogs.contains('CONTROLLER_UPDATED: true'), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });

  testWidgets('BusinessProfileView emits CONTROLLER_UPDATED: false on equal-config fast path', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(printedLogs, contains('CONTROLLER_UPDATED: true'));
      printedLogs.clear();

      // Trigger sync attempt when config is unchanged (equal-config fast path)
      viewModel.notifyListeners();
      await tester.pump();

      expect(printedLogs, contains('CONTROLLER_UPDATED: false'));
      expect(printedLogs.contains('CONTROLLER_UPDATED: true'), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });

  testWidgets('BusinessProfileView emits CONTROLLER_UPDATED: false when other config changes but business_name is unchanged', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(printedLogs, contains('CONTROLLER_UPDATED: true'));
      printedLogs.clear();

      // Change operation_mode without changing business_name
      viewModel.setOperationMode(TenantOperationMode.restaurant);
      await tester.pump();

      expect(printedLogs, contains('CONTROLLER_UPDATED: false'));
      expect(printedLogs.contains('CONTROLLER_UPDATED: true'), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });

  testWidgets('B2a (D-16): the fiscal range fields render the no-configurado state',
      (tester) async {
    when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
    when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildWidget());
    await tester.pumpAndSettle();

    // D-16: absence looks like absence — the range inputs start empty
    // (no prefilled 1..10000 fiction); the current-number cursor is real
    // config and is not part of this assertion.
    String textOf(String key) => tester
        .widget<TextFormField>(find.byKey(Key(key)))
        .controller!
        .text;
    expect(textOf('dgi_range_start_input'), isEmpty);
    expect(textOf('dgi_range_end_input'), isEmpty);
    // Four fields share the no-configurado state: prefix, cursor, and both
    // range bounds (D-16, JD-A-001).
    expect(find.text('Sin configurar'), findsNWidgets(4));
  });

  testWidgets('D-17: saving the profile persists the authorization backing date and document keys', (tester) async {
    when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
    when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildWidget());
    await tester.pumpAndSettle();

    // Fill the fields the form requires before its validators let the save
    // through (the authorization inputs themselves are optional).
    Future<void> fillField(String label, String text) async {
      await tester.enterText(
        find.widgetWithText(TextFormField, label),
        text,
      );
      await tester.pumpAndSettle();
    }

    await fillField('Nombre Comercial / Razón Social', 'Mi Restaurante');
    await fillField('RUC (Nicaragua)', 'A0011234567890');
    await fillField(
        'Tipo de Cambio Comercial (POS / Atención al Cliente)', '36.50');
    await fillField(
        'Tipo de Cambio Oficial BCN (Base Fiscal DGI)', '36.62');
    await fillField('Fecha de Respaldo de la Autorización', '23/09/2026');
    await fillField(
        'Documento de Respaldo', 'Resolución DGI 098-2026');

    await tester.ensureVisible(find.text('GUARDAR CONFIGURACIÓN'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('GUARDAR CONFIGURACIÓN'));
    await tester.pumpAndSettle();

    final saved = verify(() => mockDao.saveConfig(captureAny())).captured
        .whereType<LocalConfigEntity>()
        .toList();
    final byKey = {for (final e in saved) e.key: e.value};
    expect(byKey['dgi_authorization_date'], '23/09/2026');
    expect(byKey['dgi_authorization_document'], 'Resolución DGI 098-2026');
    // The existing authorization-code input must not be clobbered by the save.
    expect(byKey.containsKey('dgi_authorization_code'), isTrue);
  });
}
