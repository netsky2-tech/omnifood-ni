import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/fiscal_config_local_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view_model.dart';

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}
class _MockFiscalConfigLocalDao extends Mock implements FiscalConfigLocalDao {}

void main() {
  late _MockLocalConfigDao mockConfigDao;
  late BusinessProfileViewModel viewModel;

  setUpAll(() {
    registerFallbackValue(LocalConfigEntity(key: 'fallback', value: ''));
  });

  setUp(() {
    mockConfigDao = _MockLocalConfigDao();
    viewModel = BusinessProfileViewModel(mockConfigDao);
    // T1 (#66): the pre-existing suites assume an authorized operator —
    // owner/manager behavior must stay byte-identical to today. The denied
    // roles (cashier/waiter/unset) are covered explicitly by the dedicated
    // role-guard group below.
    viewModel.setCurrentUserRole(UserRole.owner);
  });

  group('BusinessProfileViewModel FX Rates & Business Config', () {
    test('loadConfig hydrates standard business details, FX rates, and operation_mode defaults',
        () async {
      when(() => mockConfigDao.getConfigByKey(any()))
          .thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));
      when(() => mockConfigDao.getConfigByKey('ruc'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'ruc', value: 'J0310000000001'));
      when(() => mockConfigDao.getConfigByKey('address'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'address', value: 'Plaza Mayor'));
      when(() => mockConfigDao.getConfigByKey('phone'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'phone', value: '2222-3333'));
      when(() => mockConfigDao.getConfigByKey('legal_footer'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'legal_footer', value: 'Gracias por su compra'));
      when(() => mockConfigDao.getConfigByKey('commercial_exchange_rate'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'));
      when(() => mockConfigDao.getConfigByKey('bcn_official_exchange_rate'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'));
      when(() => mockConfigDao.getConfigByKey('checkout_fx_mode'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'checkout_fx_mode', value: 'COMMERCIAL'));
      when(() => mockConfigDao.getConfigByKey('operation_mode'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'operation_mode', value: 'FOODPARK_QSR'));
      when(() => mockConfigDao.getConfigByKey('dgi_prefix'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'));
      when(() => mockConfigDao.getConfigByKey('dgi_range_start'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_range_start', value: '1'));
      when(() => mockConfigDao.getConfigByKey('dgi_range_end'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_range_end', value: '10000'));
      when(() => mockConfigDao.getConfigByKey('dgi_current_number'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_current_number', value: '550'));
      when(() => mockConfigDao.getConfigByKey('dgi_authorization_code'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_authorization_code', value: 'AUT-2026'));
      when(() => mockConfigDao.getConfigByKey('dgi_range_start'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_range_start', value: ''));
      when(() => mockConfigDao.getConfigByKey('dgi_range_end'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_range_end', value: ''));
      when(() => mockConfigDao.getConfigByKey('tax_regime'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'));

      await viewModel.loadConfig();

      expect(viewModel.config['business_name'], 'Café Managua');
      expect(viewModel.config['commercial_exchange_rate'], '36.50');
      expect(viewModel.config['bcn_official_exchange_rate'], '36.6241');
      expect(viewModel.config['checkout_fx_mode'], 'COMMERCIAL');
      expect(viewModel.checkoutFxMode, 'COMMERCIAL');
      expect(viewModel.activeCheckoutRate, 36.50);
      expect(viewModel.config['operation_mode'], 'FOODPARK_QSR');
      expect(viewModel.config['dgi_current_number'], '550');
      expect(viewModel.config['tax_regime'], 'CUOTA_FIJA');
      expect(viewModel.taxRegime?.name, 'cuotaFija');
      expect(viewModel.operationMode, TenantOperationMode.foodparkQsr);
      expect(viewModel.commercialRate, 36.50);
      expect(viewModel.bcnOfficialRate, 36.6241);
    });

    test('D-21 consolidation (#551): legacy D-17 backing keys are never read or defaulted',
        () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);

      await viewModel.loadConfig();

      // The legacy pair stays in old local_configs rows but is ignored on
      // read: never queried, never present in the config map, never
      // resurrected by loadConfig.
      verifyNever(() =>
          mockConfigDao.getConfigByKey('dgi_authorization_date'));
      verifyNever(() =>
          mockConfigDao.getConfigByKey('dgi_authorization_document'));
      expect(viewModel.config.containsKey('dgi_authorization_date'), isFalse);
      expect(viewModel.config.containsKey('dgi_authorization_document'), isFalse);
    });

    test('saveConfig persists commercial and official exchange rates and operation mode',
        () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'ruc': 'J0310000000001',
        'address': 'Plaza Mayor',
        'phone': '2222-3333',
        'legal_footer': 'Gracias por su compra',
        'commercial_exchange_rate': '36.80',
        'bcn_official_exchange_rate': '36.6241',
        'checkout_fx_mode': 'BCN_OFFICIAL',
        'operation_mode': 'RESTAURANT',
        'dgi_prefix': '001-001-01-',
        'dgi_range_start': '1',
        'dgi_current_number': '550',
        'dgi_authorization_code': 'AUT-2026',
        'tax_regime': 'REGIMEN_GENERAL',
      });

      expect(viewModel.config['commercial_exchange_rate'], '36.80');
      expect(viewModel.config['checkout_fx_mode'], 'BCN_OFFICIAL');
      expect(viewModel.activeCheckoutRate, 36.6241);
      expect(viewModel.config['operation_mode'], 'RESTAURANT');
      expect(viewModel.config['dgi_current_number'], '550');
      expect(viewModel.config['tax_regime'], 'REGIMEN_GENERAL');
      expect(viewModel.taxRegime?.name, 'regimenGeneral');
      expect(viewModel.operationMode, TenantOperationMode.restaurant);
      expect(viewModel.commercialRate, 36.80);
      verify(() => mockConfigDao.saveConfig(any())).called(14);
    });

    test('operator RUC override is deliberate: it persists under the local issuer key the printer config reads',
        () async {
      // PRODUCT DECISION (founder-pilot-fiscal-and-printer-fixture-alignment):
      // the DGI projection seeds the issuer RUC, and the operator may override it
      // locally from this screen (offline-first). The printed fiscal identity
      // follows the local value until the next fiscal resync. Do NOT "fix" this
      // by blocking the write without revisiting that decision.
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      await viewModel.saveConfig({'ruc': 'J0310000999999'});

      final saved = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .singleWhere((e) => e.key == PrinterConfigService.fiscalRucKey);

      expect(PrinterConfigService.fiscalRucKey, 'ruc');
      expect(saved.value, 'J0310000999999');
    });

    test('fetchOfficialBcnRate updates bcn_official_exchange_rate and persists it', () async {
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      final result = await viewModel.fetchOfficialBcnRate(() async => 36.7150);

      expect(result, 36.7150);
      expect(viewModel.bcnOfficialRate, 36.7150);
      expect(viewModel.config['bcn_official_exchange_rate'], '36.7150');
      verify(() => mockConfigDao.saveConfig(any())).called(1);
    });

    test('setOperationMode updates state and notifies listeners', () {
      var notified = false;
      viewModel.addListener(() => notified = true);

      viewModel.setOperationMode(TenantOperationMode.hybrid);

      expect(viewModel.operationMode, TenantOperationMode.hybrid);
      expect(viewModel.config['operation_mode'], 'HYBRID');
      expect(notified, isTrue);
    });
  });

  group('BusinessProfileViewModel business_name fallback and blank-value semantics', () {
    late _MockLocalConfigDao mockDao;
    late _MockFiscalConfigLocalDao mockFiscalDao;
    late BusinessProfileViewModel vm;
    late List<String> printedLogs;
    late DebugPrintCallback originalDebugPrint;

    setUp(() {
      mockDao = _MockLocalConfigDao();
      mockFiscalDao = _MockFiscalConfigLocalDao();
      vm = BusinessProfileViewModel(mockDao, null, null, mockFiscalDao);
      printedLogs = [];
      originalDebugPrint = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) {
        if (message != null) printedLogs.add(message);
      };
      when(() => mockDao.saveConfig(any())).thenAnswer((_) async {});
    });

    tearDown(() {
      debugPrint = originalDebugPrint;
    });

    test('whitespace business_name in local_configs is treated as absent and triggers fiscal fallback', () async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: '   '));
      when(() => mockDao.getConfigByKey('tenant_id'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tenant_id', value: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a'));

      when(() => mockFiscalDao.getByTenantId('dddb91ab-74de-4b06-aa8c-f38c6e053b5a'))
          .thenAnswer((_) async => FiscalConfigLocalEntity(
                tenantId: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a',
                revision: 1,
                fingerprint: 'fp123',
                payload: jsonEncode({
                  'businessName': 'Founder Pilot Q80 1789164022241-e9530ebc',
                  'ruc': 'J0310000000001',
                  'fiscalRegime': 'CUOTA_FIJA',
                }),
                appliedAt: '2026-03-30T00:00:00Z',
              ));

      await vm.loadConfig();

      expect(vm.config['business_name'], 'Founder Pilot Q80 1789164022241-e9530ebc');
      verify(() => mockFiscalDao.getByTenantId('dddb91ab-74de-4b06-aa8c-f38c6e053b5a')).called(1);
      verifyNever(() => mockDao.saveConfig(any()));

      expect(printedLogs, contains('PRIMARY_CONFIG_FOUND: true'));
      expect(printedLogs, contains('PRIMARY_BUSINESS_NAME_PRESENT: false'));
      expect(printedLogs, contains('FISCAL_FALLBACK_TRIGGERED: true'));
      expect(printedLogs, contains('FISCAL_BUSINESS_NAME_PRESENT: true'));
      expect(printedLogs, contains('VIEW_MODEL_BUSINESS_NAME_PRESENT: true'));
      expect(printedLogs.any((log) => log.contains('FISCAL_FALLBACK_USED')), isFalse);
    });

    test('non-blank business_name in local_configs preserves primary behavior and does not trigger fallback', () async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));
      when(() => mockDao.getConfigByKey('tenant_id'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tenant_id', value: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a'));

      await vm.loadConfig();

      expect(vm.config['business_name'], 'Café Managua');
      verifyNever(() => mockFiscalDao.getByTenantId(any()));

      expect(printedLogs, contains('PRIMARY_CONFIG_FOUND: true'));
      expect(printedLogs, contains('PRIMARY_BUSINESS_NAME_PRESENT: true'));
      expect(printedLogs, contains('FISCAL_FALLBACK_TRIGGERED: false'));
      expect(printedLogs, contains('VIEW_MODEL_BUSINESS_NAME_PRESENT: true'));
    });

    test('null business_name in local_configs triggers fiscal fallback', () async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('tenant_id'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tenant_id', value: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a'));

      when(() => mockFiscalDao.getByTenantId('dddb91ab-74de-4b06-aa8c-f38c6e053b5a'))
          .thenAnswer((_) async => FiscalConfigLocalEntity(
                tenantId: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a',
                revision: 1,
                fingerprint: 'fp123',
                payload: jsonEncode({
                  'businessName': 'Founder Pilot Q80 1789164022241-e9530ebc',
                }),
                appliedAt: '2026-03-30T00:00:00Z',
              ));

      await vm.loadConfig();

      expect(vm.config['business_name'], 'Founder Pilot Q80 1789164022241-e9530ebc');
      verify(() => mockFiscalDao.getByTenantId('dddb91ab-74de-4b06-aa8c-f38c6e053b5a')).called(1);
      verifyNever(() => mockDao.saveConfig(any()));

      expect(printedLogs, contains('PRIMARY_CONFIG_FOUND: false'));
      expect(printedLogs, contains('PRIMARY_BUSINESS_NAME_PRESENT: false'));
      expect(printedLogs, contains('FISCAL_FALLBACK_TRIGGERED: true'));
      expect(printedLogs, contains('FISCAL_BUSINESS_NAME_PRESENT: true'));
      expect(printedLogs, contains('VIEW_MODEL_BUSINESS_NAME_PRESENT: true'));
    });

    test('fiscal fallback is strictly read-only and performs zero writes to LocalConfigDao', () async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('tenant_id'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tenant_id', value: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a'));

      when(() => mockFiscalDao.getByTenantId('dddb91ab-74de-4b06-aa8c-f38c6e053b5a'))
          .thenAnswer((_) async => FiscalConfigLocalEntity(
                tenantId: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a',
                revision: 1,
                fingerprint: 'fp123',
                payload: jsonEncode({
                  'businessName': 'ReadOnly Cafe',
                  'ruc': 'J0310000000001',
                  'fiscalRegime': 'REGIMEN_GENERAL',
                }),
                appliedAt: '2026-03-30T00:00:00Z',
              ));

      await vm.loadConfig();

      expect(vm.config['business_name'], 'ReadOnly Cafe');
      expect(vm.config['ruc'], 'J0310000000001');
      expect(vm.config['tax_regime'], 'REGIMEN_GENERAL');
      // Crucial: Fallback must never write to local_configs; startup repair is the only writer.
      verifyNever(() => mockDao.saveConfig(any()));
    });

    test('when both primary and fiscal have no business name, flags absence correctly', () async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('tenant_id'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tenant_id', value: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a'));

      when(() => mockFiscalDao.getByTenantId('dddb91ab-74de-4b06-aa8c-f38c6e053b5a'))
          .thenAnswer((_) async => FiscalConfigLocalEntity(
                tenantId: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a',
                revision: 1,
                fingerprint: 'fp123',
                payload: jsonEncode({}),
                appliedAt: '2026-03-30T00:00:00Z',
              ));

      await vm.loadConfig();

      expect(vm.config['business_name'], '');
      expect(printedLogs, contains('PRIMARY_CONFIG_FOUND: false'));
      expect(printedLogs, contains('PRIMARY_BUSINESS_NAME_PRESENT: false'));
      expect(printedLogs, contains('FISCAL_FALLBACK_TRIGGERED: true'));
      expect(printedLogs, contains('FISCAL_BUSINESS_NAME_PRESENT: false'));
      expect(printedLogs, contains('VIEW_MODEL_BUSINESS_NAME_PRESENT: false'));
    });

    test('malformed fiscal payload emits boolean diagnostics and does not log payload fragments or exception text', () async {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('tenant_id'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tenant_id', value: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a'));

      const sensitivePayloadSnippet = 'Confidential Restaurant Name 12345';
      const malformedPayload = '{"businessName": "$sensitivePayloadSnippet", MALFORMED_JSON_SYNTAX}';
      when(() => mockFiscalDao.getByTenantId('dddb91ab-74de-4b06-aa8c-f38c6e053b5a'))
          .thenAnswer((_) async => FiscalConfigLocalEntity(
                tenantId: 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a',
                revision: 1,
                fingerprint: 'fp123',
                payload: malformedPayload,
                appliedAt: '2026-03-30T00:00:00Z',
              ));

      await vm.loadConfig();

      expect(vm.config['business_name'], '');
      expect(printedLogs, contains('PRIMARY_CONFIG_FOUND: false'));
      expect(printedLogs, contains('PRIMARY_BUSINESS_NAME_PRESENT: false'));
      expect(printedLogs, contains('FISCAL_FALLBACK_TRIGGERED: true'));
      expect(printedLogs, contains('FISCAL_BUSINESS_NAME_PRESENT: false'));
      expect(printedLogs, contains('FISCAL_FALLBACK_ERROR: true'));
      expect(printedLogs, contains('VIEW_MODEL_BUSINESS_NAME_PRESENT: false'));

      // Confirm no raw payload fragments or exception details are logged
      expect(printedLogs.any((log) => log.contains(sensitivePayloadSnippet)), isFalse);
      expect(printedLogs.any((log) => log.contains('MALFORMED_JSON_SYNTAX')), isFalse);
      expect(printedLogs.any((log) => log.contains('FormatException')), isFalse);
      expect(printedLogs.any((log) => log.contains('Exception')), isFalse);
    });
  });
  group('B2a (D-16/D-1): the fiscal range is nullable and never rewritten', () {
    test('the defaults map carries NO invented range fiction', () {
      // D-16 regression: the old defaults prefilled 1..10000.
      expect(
        BusinessProfileViewModel(mockConfigDao).config['dgi_range_start'],
        '',
      );
    });

    test('D-21: the retired dgi_range_end key is absent from the defaults map', () {
      final config = BusinessProfileViewModel(mockConfigDao).config;
      expect(config.containsKey('dgi_range_end'), isFalse);
    });

    test('D-21: the new authorization date keys default to empty strings', () {
      final config = BusinessProfileViewModel(mockConfigDao).config;
      expect(config['dgi_authorization_issued_at'], '');
      expect(config['dgi_authorization_expires_at'], '');
      expect(config['dgi_authorization_code'], '');
    });

    test('D-21: saveConfig drops the retired dgi_range_end key entirely, even with a value',
        () async {
      when(() => mockConfigDao.getConfigByKey(any()))
          .thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      final vm = BusinessProfileViewModel(mockConfigDao);
      await vm.saveConfig({
        'business_name': 'Mi Negocio',
        // Legacy clients/forms may still send the retired key with a value;
        // D-21 retires it: it must never be written again.
        'dgi_range_end': '10000',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      final writtenKeys = written.map((e) => e.key).toSet();
      expect(writtenKeys, isNot(contains('dgi_range_end')));
      expect(writtenKeys, contains('business_name'));
    });

    test('D-21: saveConfig persists the new authorization date keys when provided',
        () async {
      when(() => mockConfigDao.getConfigByKey(any()))
          .thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      final vm = BusinessProfileViewModel(mockConfigDao);
      await vm.saveConfig({
        'dgi_authorization_code': 'DGI-SFC-2024-00123',
        'dgi_authorization_issued_at': '2026-01-15',
        'dgi_authorization_expires_at': '2026-02-14',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      final byKey = {for (final e in written) e.key: e.value};
      expect(byKey['dgi_authorization_code'], 'DGI-SFC-2024-00123');
      expect(byKey['dgi_authorization_issued_at'], '2026-01-15');
      expect(byKey['dgi_authorization_expires_at'], '2026-02-14');
    });

    test('saving with blank range values never writes the sequence keys (D-1)',
        () async {
      when(() => mockConfigDao.getConfigByKey(any()))
          .thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      // A persisted sequence exists (set by a previous provisioning).
      final persisted = LocalConfigEntity(
        key: 'dgi_range_start',
        value: '500',
      );
      when(() => mockConfigDao.getConfigByKey('dgi_range_start'))
          .thenAnswer((_) async => persisted);

      final vm = BusinessProfileViewModel(mockConfigDao);
      await vm.saveConfig({
        'business_name': 'Mi Negocio',
        'ruc': 'A0011234567890',
        // Blank range values in the form = not configured.
        'dgi_range_start': '',
        'dgi_range_end': '',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      final byKey = {for (final e in written) e.key: e.value};
      // Other profile fields persist; the sequence keys are SKIPPED — the
      // persisted 500 cannot be resurrected as blank or rewritten.
      expect(byKey['business_name'], 'Mi Negocio');
      expect(byKey.containsKey('dgi_range_start'), isFalse);
      expect(byKey.containsKey('dgi_range_end'), isFalse);
      expect(byKey.containsKey('dgi_current_number'), isFalse);
    });

    test('saving a profile with untouched fiscal fields leaves the sequence '
        'ABSENT (JD-A-001): getNextNumber would fail closed', () async {
      when(() => mockConfigDao.getConfigByKey(any()))
          .thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      final vm = BusinessProfileViewModel(mockConfigDao);
      await vm.saveConfig({
        'business_name': 'Mi Negocio',
        'dgi_prefix': '',
        'dgi_range_start': '',
        'dgi_range_end': '',
        'dgi_current_number': '',
      });

      // Verify what was WRITTEN (the dao mock cannot both capture writes and
      // report reads): the four sequence keys must be absent from the
      // captured writes — an empty-string prefix row would foreclose the
      // activation runner's provisioning.
      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      final writtenKeys = written.map((e) => e.key).toSet();
      for (final key in [
        'dgi_prefix',
        'dgi_range_start',
        'dgi_range_end',
        'dgi_current_number',
      ]) {
        expect(writtenKeys, isNot(contains(key)), reason: key);
      }
      expect(writtenKeys, contains('business_name'));
    });

    test('saving explicit sequence values still persists them (range end retired)', () async {
      when(() => mockConfigDao.getConfigByKey(any()))
          .thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      final vm = BusinessProfileViewModel(mockConfigDao);
      await vm.saveConfig({
        'dgi_range_start': '500',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      final byKey = {for (final e in written) e.key: e.value};
      expect(byKey['dgi_range_start'], '500');
    });
  });

  group('BXW-007 U3 (#734): per-field cloud management via the managed-keys marker', () {
    test('absent marker -> both flags false, both controls editable (fail-safe)', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);

      await viewModel.loadConfig();

      expect(viewModel.isOperationModeCloudManaged, isFalse);
      expect(viewModel.isCheckoutFxModeCloudManaged, isFalse);
    });

    test('marker naming only checkout_fx_mode -> FX locked, operation mode editable (per-field)', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'checkout_fx_mode',
              ));

      await viewModel.loadConfig();

      expect(viewModel.isCheckoutFxModeCloudManaged, isTrue);
      expect(viewModel.isOperationModeCloudManaged, isFalse);
    });

    test('marker naming both fields -> both locked', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'checkout_fx_mode,operation_mode',
              ));

      await viewModel.loadConfig();

      expect(viewModel.isCheckoutFxModeCloudManaged, isTrue);
      expect(viewModel.isOperationModeCloudManaged, isTrue);
    });

    test('unknown tokens and stray whitespace are ignored without throwing', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: ' operation_mode , legacy_thing ',
              ));

      await viewModel.loadConfig();

      expect(viewModel.isOperationModeCloudManaged, isTrue);
      expect(viewModel.isCheckoutFxModeCloudManaged, isFalse);
    });

    test('a save with a cloud-managed field does not overwrite it', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'operation_mode',
              ));
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      await viewModel.loadConfig();

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'operation_mode': 'RESTAURANT',
        'checkout_fx_mode': 'BCN_OFFICIAL',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      final writtenKeys = written.map((e) => e.key).toSet();
      // The office-asserted mode is never written by a form save...
      expect(writtenKeys, isNot(contains('operation_mode')));
      // ...while the fields the office never claimed persist as today.
      expect(writtenKeys, contains('business_name'));
      expect(writtenKeys, contains('checkout_fx_mode'));
      // The in-memory state keeps the cloud value for the managed field.
      expect(viewModel.config['operation_mode'], 'FOODPARK_QSR');
      expect(viewModel.config['checkout_fx_mode'], 'BCN_OFFICIAL');
      // The flag survives the save: the field is still cloud-managed.
      expect(viewModel.isOperationModeCloudManaged, isTrue);
    });

    test(
        'a projection committing AFTER loadConfig still protects the field: '
        'saveConfig re-reads the marker instead of trusting the cached set',
        () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      // loadConfig runs while the cloud asserts nothing -> empty cached set.
      await viewModel.loadConfig();
      expect(viewModel.isOperationModeCloudManaged, isFalse);

      // A fiscal projection then commits the cloud value and the marker, but
      // the view model is never reloaded: this is the race. Trusting the
      // cached set would let the stale form overwrite the cloud value, and
      // isProjectionComplete ignores these fields, so nothing would repair it.
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'operation_mode',
              ));

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'operation_mode': 'FOODPARK_QSR',
        'checkout_fx_mode': 'BCN_OFFICIAL',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      expect(
        written.map((e) => e.key),
        isNot(contains('operation_mode')),
        reason: 'the stale form value must never overwrite the cloud value',
      );
      expect(viewModel.isOperationModeCloudManaged, isTrue);
    });

    test('marker naming only the commercial rate -> rate locked, modes editable (per-field)', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'commercial_exchange_rate',
              ));

      await viewModel.loadConfig();

      expect(viewModel.isCommercialRateCloudManaged, isTrue);
      expect(viewModel.isCheckoutFxModeCloudManaged, isFalse);
      expect(viewModel.isOperationModeCloudManaged, isFalse);
    });

    test('marker naming all three fields -> all three locked', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'checkout_fx_mode,operation_mode,commercial_exchange_rate',
              ));

      await viewModel.loadConfig();

      expect(viewModel.isCommercialRateCloudManaged, isTrue);
      expect(viewModel.isCheckoutFxModeCloudManaged, isTrue);
      expect(viewModel.isOperationModeCloudManaged, isTrue);
    });

    test('a save never overwrites a cloud-managed commercial rate', () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'commercial_exchange_rate',
              ));
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      await viewModel.loadConfig();
      final cloudRate = viewModel.config['commercial_exchange_rate'];

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'commercial_exchange_rate': '99.99',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      final writtenKeys = written.map((e) => e.key).toSet();
      // The office-asserted rate is never written by a form save...
      expect(writtenKeys, isNot(contains('commercial_exchange_rate')));
      // ...while fields the office never claimed persist as today.
      expect(writtenKeys, contains('business_name'));
      // The in-memory state keeps the cloud value for the managed field.
      expect(viewModel.config['commercial_exchange_rate'], cloudRate);
      expect(viewModel.config['commercial_exchange_rate'], isNot('99.99'));
      // The flag survives the save: the field is still cloud-managed.
      expect(viewModel.isCommercialRateCloudManaged, isTrue);
    });

    test(
        'a projection committing AFTER loadConfig still protects the rate: '
        'saveConfig re-reads the marker instead of trusting the cached set',
        () async {
      when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      await viewModel.loadConfig();
      expect(viewModel.isCommercialRateCloudManaged, isFalse);

      when(() => mockConfigDao.getConfigByKey('business_profile_managed_keys'))
          .thenAnswer((_) async => LocalConfigEntity(
                key: 'business_profile_managed_keys',
                value: 'commercial_exchange_rate',
              ));

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'commercial_exchange_rate': '99.99',
      });

      final written = verify(() => mockConfigDao.saveConfig(captureAny()))
          .captured
          .whereType<LocalConfigEntity>()
          .toList();
      expect(
        written.map((e) => e.key),
        isNot(contains('commercial_exchange_rate')),
        reason: 'the stale form value must never overwrite the cloud value',
      );
      expect(viewModel.isCommercialRateCloudManaged, isTrue);
    });
  });

  group('T1 #66: role guard on the FX fields', () {
    void stubDao() {
      when(() => mockConfigDao.getConfigByKey(any()))
          .thenAnswer((_) async => null);
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});
    }

    List<LocalConfigEntity> writtenEntries() => verify(() =>
            mockConfigDao.saveConfig(captureAny()))
        .captured
        .whereType<LocalConfigEntity>()
        .toList();

    test('cashier: saveConfig drops the three FX keys but still persists a non-FX key in the same call',
        () async {
      viewModel.setCurrentUserRole(UserRole.cashier);
      stubDao();
      expect(viewModel.canEditExchangeRates, isFalse);

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'commercial_exchange_rate': '99.99',
        'bcn_official_exchange_rate': '40.00',
        'checkout_fx_mode': 'BCN_OFFICIAL',
      });

      final byKey = {for (final e in writtenEntries()) e.key: e.value};
      expect(byKey.containsKey('commercial_exchange_rate'), isFalse);
      expect(byKey.containsKey('bcn_official_exchange_rate'), isFalse);
      expect(byKey.containsKey('checkout_fx_mode'), isFalse);
      expect(byKey['business_name'], 'Café Managua');
    });

    test('unset role is denied (fail closed): FX keys are dropped from the save',
        () async {
      // A VM whose role was never set (the view resolves the role
      // asynchronously) must deny, never allow.
      final vm = BusinessProfileViewModel(mockConfigDao);
      stubDao();
      expect(vm.canEditExchangeRates, isFalse);

      await vm.saveConfig({
        'business_name': 'Café Managua',
        'commercial_exchange_rate': '99.99',
      });

      final byKey = {for (final e in writtenEntries()) e.key: e.value};
      expect(byKey.containsKey('commercial_exchange_rate'), isFalse);
      expect(byKey['business_name'], 'Café Managua');
    });

    test('cashier: fetchOfficialBcnRate throws and leaves the stored BCN row untouched',
        () async {
      viewModel.setCurrentUserRole(UserRole.cashier);
      stubDao();

      var fetcherCalled = false;
      await expectLater(
        viewModel.fetchOfficialBcnRate(() async {
          fetcherCalled = true;
          return 40.0;
        }),
        throwsA(isA<Exception>()),
      );

      // Refused before any write and without mutating the in-memory config.
      expect(fetcherCalled, isFalse);
      verifyNever(() => mockConfigDao.saveConfig(any()));
      expect(viewModel.config['bcn_official_exchange_rate'], '36.6241');
      expect(viewModel.isFetchingBcnRate, isFalse);
    });

    test('manager: saveConfig still persists the FX keys (owner covered by the existing suites)',
        () async {
      viewModel.setCurrentUserRole(UserRole.manager);
      stubDao();
      expect(viewModel.canEditExchangeRates, isTrue);

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'commercial_exchange_rate': '37.10',
      });

      final byKey = {for (final e in writtenEntries()) e.key: e.value};
      expect(byKey['commercial_exchange_rate'], '37.10');
    });
  });
}
