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

  Widget buildWidget({DateTime? fiscalToday}) {
    return ChangeNotifierProvider<BusinessProfileViewModel>.value(
      value: viewModel,
      child: MaterialApp(
        home: BusinessProfileView(fiscalToday: fiscalToday),
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

  testWidgets('B2a (D-16): the fiscal fields render the no-configurado state',
      (tester) async {
    when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
    when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildWidget());
    await tester.pumpAndSettle();

    // D-16: absence looks like absence — the fiscal inputs start empty
    // (no prefilled 1..10000 fiction); the current-number cursor is real
    // config and is not part of this assertion.
    String textOf(String key) => tester
        .widget<TextFormField>(find.byKey(Key(key)))
        .controller!
        .text;
    expect(textOf('dgi_range_start_input'), isEmpty);
    // D-21 (U2 #554): the range end input is retired entirely.
    expect(find.byKey(const Key('dgi_range_end_input')), findsNothing);
    // Three fields share the no-configurado state: prefix, cursor, and the
    // consecutivo inicial (D-16, JD-A-001; range end retired by D-21).
    expect(find.text('Sin configurar'), findsNWidgets(3));
  });

  group('D-21 (U2 #554): authorization-only fiscal section', () {
    Future<void> pumpForm(WidgetTester tester) async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});
      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();
    }

    /// Fills the form's required fields so validators let a save through.
    Future<void> fillRequiredFields(WidgetTester tester) async {
      Future<void> fill(String label, String text) async {
        await tester.enterText(find.widgetWithText(TextFormField, label), text);
        await tester.pumpAndSettle();
      }

      await fill('Nombre Comercial / Razón Social', 'Mi Restaurante');
      await fill('RUC (Nicaragua)', 'J0310000000000');
      await fill('Tipo de Cambio Comercial (POS / Atención al Cliente)', '36.50');
      await fill('Tipo de Cambio Oficial BCN (Base Fiscal DGI)', '36.62');
    }

    Future<void> tapSave(WidgetTester tester) async {
      await tester.ensureVisible(find.text('GUARDAR CONFIGURACIÓN'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('GUARDAR CONFIGURACIÓN'));
      await tester.pumpAndSettle();
    }

    testWidgets('the section is retitle to AUTORIZACIÓN FISCAL DGI and the range is gone',
        (tester) async {
      await pumpForm(tester);

      expect(find.text('AUTORIZACIÓN FISCAL DGI (Disposición 09-2007)'),
          findsOneWidget);
      expect(find.text('AUTORIZACIÓN Y RANGO FISCAL DGI (Disposición 09-2007)'),
          findsNothing);
      expect(find.text('Rango Final DGI'), findsNothing);
      // Relabels (D-21): consecutivos replace the range language.
      expect(find.text('Consecutivo inicial'), findsOneWidget);
      expect(find.text('Consecutivo actual (auto-incremental)'), findsOneWidget);
      expect(find.text('Rango Inicial DGI'), findsNothing);
    });

    testWidgets('the consecutivo actual input stays editable with auto-increment help',
        (tester) async {
      await pumpForm(tester);

      final input = tester.widget<TextFormField>(
        find.byKey(const Key('dgi_current_number_input')),
      );
      expect(input.enabled, isTrue);
      expect(input.controller!.text, isEmpty);
    });

    testWidgets('an empty prefix passes validation (D-21 optional serie)', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tapSave(tester);

      // The save went through: the config was persisted without any prefix.
      verify(() => mockDao.saveConfig(any())).called(greaterThanOrEqualTo(1));
      expect(find.text('Prefijo Fiscal DGI'), findsOneWidget);
    });

    testWidgets('authorization code rejects 51 characters', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_code_input')),
        'A' * 51,
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      expect(find.text('Máximo 50 caracteres'), findsOneWidget);
      verifyNever(() => mockDao.saveConfig(any()));
    });

    testWidgets("authorization code accepts 'RES-SFC-145/2025' (slashes and hyphens)",
        (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_code_input')),
        'RES-SFC-145/2025',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      final saved = verify(() => mockDao.saveConfig(captureAny())).captured
          .whereType<LocalConfigEntity>()
          .toList();
      final byKey = {for (final e in saved) e.key: e.value};
      expect(byKey['dgi_authorization_code'], 'RES-SFC-145/2025');
    });

    testWidgets('authorization code rejects spaces', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_code_input')),
        'RES SFC 145',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      expect(find.text('Solo letras, números, guiones y barras'), findsOneWidget);
      verifyNever(() => mockDao.saveConfig(any()));
    });

    testWidgets('authorization code rejects underscores and accents', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_code_input')),
        'RES_SFC-Á-1',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      expect(find.text('Solo letras, números, guiones y barras'), findsOneWidget);
      verifyNever(() => mockDao.saveConfig(any()));
    });

    testWidgets('date pair rule: issued without expiry is rejected', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_issued_at_input')),
        '2026-01-15',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      expect(find.text('Si se indica la fecha de emisión, indique también la de vencimiento'),
          findsOneWidget);
      verifyNever(() => mockDao.saveConfig(any()));
    });

    testWidgets('date pair rule: expiry before issued is rejected', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_issued_at_input')),
        '2026-02-14',
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('dgi_authorization_expires_at_input')),
        '2026-02-13',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      expect(find.text('Debe ser mayor o igual a la fecha de emisión'), findsOneWidget);
      verifyNever(() => mockDao.saveConfig(any()));
    });

    testWidgets('date pair rule: expiry equal to issued is accepted (mirrors backend >=)',
        (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_issued_at_input')),
        '2026-02-14',
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('dgi_authorization_expires_at_input')),
        '2026-02-14',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      final saved = verify(() => mockDao.saveConfig(captureAny())).captured
          .whereType<LocalConfigEntity>()
          .toList();
      final byKey = {for (final e in saved) e.key: e.value};
      expect(byKey['dgi_authorization_issued_at'], '2026-02-14');
      expect(byKey['dgi_authorization_expires_at'], '2026-02-14');
    });

    testWidgets('date fields reject impossible calendar dates (2026-02-30)', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_issued_at_input')),
        '2026-02-30',
      );
      await tester.enterText(
        find.byKey(const Key('dgi_authorization_expires_at_input')),
        '2026-03-30',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      // DateTime.tryParse normalizes 2026-02-30 to 2026-03-02 — the validator
      // must reject it via calendar round-trip, not silently accept it.
      expect(find.text('Debe ser mayor o igual a la fecha de emisión'), findsNothing);
      expect(find.text('Use el formato ISO yyyy-MM-dd'), findsOneWidget);
      verifyNever(() => mockDao.saveConfig(any()));
    });

    testWidgets('date fields reject non-ISO formats', (tester) async {
      await pumpForm(tester);
      await fillRequiredFields(tester);

      await tester.enterText(
        find.byKey(const Key('dgi_authorization_issued_at_input')),
        '15/01/2026',
      );
      await tester.pumpAndSettle();
      await tapSave(tester);

      expect(find.text('Use el formato ISO yyyy-MM-dd'), findsOneWidget);
      verifyNever(() => mockDao.saveConfig(any()));
    });
  });

  group('D-21 (U4 #554): expiry notice at the top of the fiscal section', () {
    /// D-21/U4: [fiscalToday] is the test-only clock override that keeps
    /// these assertions deterministic (no DateTime.now() flakiness).
    final today = DateTime(2026, 6, 15);

    Future<void> pumpWithExpiry(WidgetTester tester, String? value) async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      if (value != null) {
        when(() => mockDao.getConfigByKey('dgi_authorization_expires_at'))
            .thenAnswer((_) async =>
                LocalConfigEntity(key: 'dgi_authorization_expires_at', value: value));
      }
      await tester.pumpWidget(buildWidget(fiscalToday: today));
      await tester.pumpAndSettle();
    }

    testWidgets('absent expiry renders NO notice', (tester) async {
      await pumpWithExpiry(tester, null);

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsNothing);
    });

    testWidgets('corrupt expiry renders NO notice (never invents a warning)',
        (tester) async {
      await pumpWithExpiry(tester, '31/12/2026');

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsNothing);
    });

    testWidgets('expiry within 30 days renders the amber notice with text',
        (tester) async {
      await pumpWithExpiry(tester, '2026-07-15');

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsOneWidget);
      expect(
          find.text(
              'Su código de autorización DGI vence el 2026-07-15 (en 30 días).'),
          findsOneWidget);
    });

    testWidgets('expired expiry renders the venció notice', (tester) async {
      await pumpWithExpiry(tester, '2026-06-10');

      expect(
          find.text('Su código de autorización DGI venció el 2026-06-10.'),
          findsOneWidget);
    });

    testWidgets('the notice sits at the TOP of the fiscal section',
        (tester) async {
      await pumpWithExpiry(tester, '2026-07-15');

      final sectionTitle = tester.getTopLeft(find.text(
          'AUTORIZACIÓN FISCAL DGI (Disposición 09-2007)'));
      final notice = tester.getTopLeft(
          find.byKey(const Key('fiscal_authorization_expiry_notice')));
      final prefixInput = tester.getTopLeft(
          find.byKey(const Key('dgi_prefix_input')));

      expect(notice.dy, greaterThan(sectionTitle.dy));
      expect(prefixInput.dy, greaterThan(notice.dy));
    });
  });

  testWidgets('D-21 consolidation (#551): legacy D-17 backing inputs are removed from the form', (tester) async {
    when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
    when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildWidget());
    await tester.pumpAndSettle();

    // The D-17 backing pair was removed from the form: the D-21 trio
    // (code + issued-at + expires-at) is the single authorization model.
    expect(find.byKey(const Key('dgi_authorization_date_input')), findsNothing);
    expect(find.byKey(const Key('dgi_authorization_document_input')), findsNothing);
    expect(find.text('Fecha de Respaldo de la Autorización'), findsNothing);
    expect(find.text('Documento de Respaldo'), findsNothing);
    // The D-21 inputs remain.
    expect(find.byKey(const Key('dgi_authorization_code_input')), findsOneWidget);
  });

  testWidgets('D-21 consolidation (#551): saving the profile never persists the legacy D-17 keys', (tester) async {
    when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
    when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildWidget());
    await tester.pumpAndSettle();

    Future<void> fillField(String label, String text) async {
      await tester.enterText(
        find.widgetWithText(TextFormField, label),
        text,
      );
      await tester.pumpAndSettle();
    }

    await fillField('Nombre Comercial / Razón Social', 'Mi Restaurante');
    await fillField('RUC (Nicaragua)', 'J0310000000000');
    await fillField(
        'Tipo de Cambio Comercial (POS / Atención al Cliente)', '36.50');
    await fillField(
        'Tipo de Cambio Oficial BCN (Base Fiscal DGI)', '36.62');

    await tester.ensureVisible(find.text('GUARDAR CONFIGURACIÓN'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('GUARDAR CONFIGURACIÓN'));
    await tester.pumpAndSettle();

    final saved = verify(() => mockDao.saveConfig(captureAny())).captured
        .whereType<LocalConfigEntity>()
        .toList();
    final byKey = {for (final e in saved) e.key: e.value};
    expect(byKey.containsKey('dgi_authorization_date'), isFalse);
    expect(byKey.containsKey('dgi_authorization_document'), isFalse);
  });

  group('BXW-007 U3 (#734): cloud-managed dropdowns are locked and honestly labelled', () {
    Future<void> pumpWithMarker(WidgetTester tester, String? marker) async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => marker == null
              ? null
              : LocalConfigEntity(
                  key: 'business_profile_managed_keys',
                  value: marker,
                ));
      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();
    }

    testWidgets('absent marker -> both dropdowns stay editable (fail-safe)',
        (tester) async {
      await pumpWithMarker(tester, null);

      expect(
        tester
            .widget<DropdownButtonFormField<String>>(
                find.byKey(const Key('checkout_fx_mode_dropdown')))
            .onChanged,
        isNotNull,
      );
      expect(
        tester
            .widget<DropdownButtonFormField<TenantOperationMode>>(
                find.byKey(const Key('operation_mode_dropdown')))
            .onChanged,
        isNotNull,
      );
      expect(find.textContaining('Definido por la oficina'), findsNothing);
    });

    testWidgets(
        'only checkout_fx_mode managed -> FX dropdown locked and labelled, operation mode editable',
        (tester) async {
      await pumpWithMarker(tester, 'checkout_fx_mode');

      expect(
        tester
            .widget<DropdownButtonFormField<String>>(
                find.byKey(const Key('checkout_fx_mode_dropdown')))
            .onChanged,
        isNull,
      );
      expect(
        tester
            .widget<DropdownButtonFormField<TenantOperationMode>>(
                find.byKey(const Key('operation_mode_dropdown')))
            .onChanged,
        isNotNull,
      );
      expect(find.textContaining('Definido por la oficina'), findsOneWidget);
    });

    testWidgets('both fields managed -> both dropdowns locked', (tester) async {
      await pumpWithMarker(tester, 'checkout_fx_mode,operation_mode');

      expect(
        tester
            .widget<DropdownButtonFormField<String>>(
                find.byKey(const Key('checkout_fx_mode_dropdown')))
            .onChanged,
        isNull,
      );
      expect(
        tester
            .widget<DropdownButtonFormField<TenantOperationMode>>(
                find.byKey(const Key('operation_mode_dropdown')))
            .onChanged,
        isNull,
      );
      expect(find.textContaining('Definido por la oficina'), findsNWidgets(2));
    });

    testWidgets('a form save never persists a cloud-managed field',
        (tester) async {
      await pumpWithMarker(tester, 'checkout_fx_mode,operation_mode');
      when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});

      Future<void> fill(String label, String text) async {
        await tester.enterText(find.widgetWithText(TextFormField, label), text);
        await tester.pumpAndSettle();
      }

      await fill('Nombre Comercial / Razón Social', 'Mi Restaurante');
      await fill('RUC (Nicaragua)', 'J0310000000000');
      await fill('Tipo de Cambio Comercial (POS / Atención al Cliente)', '36.50');
      await fill('Tipo de Cambio Oficial BCN (Base Fiscal DGI)', '36.62');

      await tester.ensureVisible(find.text('GUARDAR CONFIGURACIÓN'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('GUARDAR CONFIGURACIÓN'));
      await tester.pumpAndSettle();

      final saved = verify(() => mockDao.saveConfig(captureAny())).captured
          .whereType<LocalConfigEntity>()
          .toList();
      final byKey = {for (final e in saved) e.key: e.value};
      expect(byKey.containsKey('operation_mode'), isFalse);
      expect(byKey.containsKey('checkout_fx_mode'), isFalse);
      expect(byKey['business_name'], 'Mi Restaurante');
    });

    group('D-11: the commercial rate field is honest about office authority', () {
      testWidgets(
          'marker naming the rate -> rate field locked with lock icon and Definido por la oficina helper',
          (tester) async {
        await pumpWithMarker(tester, 'commercial_exchange_rate');

        final field = tester.widget<TextField>(find.descendant(
          of: find.byKey(const Key('commercial_exchange_rate_field')),
          matching: find.byType(TextField),
        ).first);
        expect(field.readOnly, isTrue,
            reason: 'the office owns the rate; the terminal must not pretend it is editable');
        expect(field.decoration?.prefixIcon, isA<Icon>().having((i) => i.icon, 'icon', Icons.lock));
        expect(
          find.textContaining('Definido por la oficina'),
          findsOneWidget,
        );
      });

      testWidgets(
          'marker naming all three fields -> rate locked alongside the dropdowns',
          (tester) async {
        await pumpWithMarker(
            tester, 'checkout_fx_mode,operation_mode,commercial_exchange_rate');

        expect(
          tester
              .widget<TextField>(find.descendant(
                of: find.byKey(const Key('commercial_exchange_rate_field')),
                matching: find.byType(TextField),
              ).first)
              .readOnly,
          isTrue,
        );
        expect(find.textContaining('Definido por la oficina'), findsNWidgets(3));
      });

      testWidgets('marker absent -> rate field stays editable (fail-safe)',
          (tester) async {
        await pumpWithMarker(tester, null);

        final field = tester.widget<TextField>(find.descendant(
          of: find.byKey(const Key('commercial_exchange_rate_field')),
          matching: find.byType(TextField),
        ).first);
        expect(field.readOnly, isFalse);
        expect(find.textContaining('Definido por la oficina'), findsNothing);
      });

      testWidgets(
          'a form save never persists the office-owned rate (skip comes for free via the managed-keys marker)',
          (tester) async {
        await pumpWithMarker(tester, 'commercial_exchange_rate');
        when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});

        Future<void> fill(String label, String text) async {
          await tester.enterText(find.widgetWithText(TextFormField, label), text);
          await tester.pumpAndSettle();
        }

        // The managed rate field is read-only: it is never typed into. Its
        // controller still carries a value ('36.50') that a stale save would
        // happily write — the marker skip is what protects it.
        await fill('Nombre Comercial / Razón Social', 'Mi Restaurante');
        await fill('RUC (Nicaragua)', 'J0310000000000');
        await fill('Tipo de Cambio Oficial BCN (Base Fiscal DGI)', '36.62');

        await tester.ensureVisible(find.text('GUARDAR CONFIGURACIÓN'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('GUARDAR CONFIGURACIÓN'));
        await tester.pumpAndSettle();

        final saved = verify(() => mockDao.saveConfig(captureAny())).captured
            .whereType<LocalConfigEntity>()
            .toList();
        final byKey = {for (final e in saved) e.key: e.value};
        expect(byKey.containsKey('commercial_exchange_rate'), isFalse,
            reason: 'the managed rate must be skipped by the existing cloud-managed save guard');
        expect(byKey['business_name'], 'Mi Restaurante');
      });
    });
  });

  group('RUC field validation', () {
    testWidgets(
        'accepts a natural-person cedula RUC (cuota fija) and still rejects malformed input',
        (tester) async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      final rucField = tester.widget<TextFormField>(
        find.widgetWithText(TextFormField, 'RUC (Nicaragua)'),
      );
      final validate = rucField.validator;
      expect(validate, isNotNull,
          reason: 'the RUC field must validate its format');

      // Cuota Fija natural person: 13 digits + check letter (the SOHO case).
      expect(validate!('0011112930059D'), isNull,
          reason: 'a natural-person RUC must be accepted, not only juridical ones');
      // Juridical person: J + 13 digits must keep working.
      expect(validate('J0310000000000'), isNull);
      // The shared validator cleans case, so lowercase must work as well.
      expect(validate('j0310000000000'), isNull);
      // Empty stays required.
      expect(validate(''), isNotNull);
      // Malformed values must still be rejected.
      expect(validate('12345'), isNotNull);
      expect(validate('X0310000000000'), isNotNull);
    });
  });
}
