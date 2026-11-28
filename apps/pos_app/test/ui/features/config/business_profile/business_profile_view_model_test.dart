import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view_model.dart';

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}

void main() {
  late _MockLocalConfigDao mockConfigDao;
  late BusinessProfileViewModel viewModel;

  setUpAll(() {
    registerFallbackValue(LocalConfigEntity(key: 'fallback', value: ''));
  });

  setUp(() {
    mockConfigDao = _MockLocalConfigDao();
    viewModel = BusinessProfileViewModel(mockConfigDao);
    viewModel.setCurrentUserRole(UserRole.owner);
    when(() => mockConfigDao.getConfigByKey(any())).thenAnswer((_) async => null);
    when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});
  });

  group('BusinessProfileViewModel — CONTROL_INTERNO & Formalization Transitions', () {
    test('saving CONTROL_INTERNO with blank RUC and unconfigured sequence auto-initializes NV- and 1', () async {
      await viewModel.saveConfig({
        'business_name': 'Pulpería La Esquina',
        'ruc': '',
        'tax_regime': 'CONTROL_INTERNO',
        'dgi_prefix': '',
        'dgi_current_number': '',
        'dgi_range_start': '',
      });

      expect(viewModel.config['tax_regime'], 'CONTROL_INTERNO');
      expect(viewModel.taxRegime, TaxRegime.controlInterno);
      expect(viewModel.config['dgi_prefix'], 'NV-');
      expect(viewModel.config['dgi_current_number'], '1');

      final saved = verify(() => mockConfigDao.saveConfig(captureAny())).captured.cast<LocalConfigEntity>();
      final savedMap = {for (final e in saved) e.key: e.value};
      expect(savedMap['tax_regime'], 'CONTROL_INTERNO');
      expect(savedMap['ruc'], '');
      expect(savedMap['dgi_prefix'], 'NV-');
      expect(savedMap['dgi_current_number'], '1');
    });

    test('saving CONTROL_INTERNO does NOT overwrite existing dgi_current_number', () async {
      when(() => mockConfigDao.getConfigByKey('dgi_current_number'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_current_number', value: '42'));
      when(() => mockConfigDao.getConfigByKey('dgi_prefix'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_prefix', value: 'NV-'));

      await viewModel.saveConfig({
        'business_name': 'Pulpería La Esquina',
        'ruc': '',
        'tax_regime': 'CONTROL_INTERNO',
        'dgi_prefix': 'NV-',
        'dgi_current_number': '42',
      });

      expect(viewModel.config['dgi_current_number'], '42');
      expect(viewModel.config['dgi_prefix'], 'NV-');
    });

    test('upgrading CONTROL_INTERNO -> CUOTA_FIJA clears NV- prefix and resets consecutive to 1', () async {
      // Initial state: CONTROL_INTERNO with NV- and consecutive 15
      when(() => mockConfigDao.getConfigByKey('tax_regime'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tax_regime', value: 'CONTROL_INTERNO'));
      when(() => mockConfigDao.getConfigByKey('dgi_prefix'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_prefix', value: 'NV-'));
      when(() => mockConfigDao.getConfigByKey('dgi_current_number'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_current_number', value: '15'));
      await viewModel.loadConfig();
      expect(viewModel.taxRegime, TaxRegime.controlInterno);

      // Switch regime in UI via setTaxRegime
      viewModel.setTaxRegime(TaxRegime.cuotaFija);
      expect(viewModel.config['dgi_prefix'], '');
      expect(viewModel.config['dgi_current_number'], '1');

      // Also verify saveConfig clears NV- even if passed directly
      await viewModel.saveConfig({
        'business_name': 'Pulpería La Esquina',
        'ruc': '0011112930059D',
        'tax_regime': 'CUOTA_FIJA',
        'dgi_prefix': 'NV-',
        'dgi_current_number': '15',
      });

      expect(viewModel.config['tax_regime'], 'CUOTA_FIJA');
      expect(viewModel.config['dgi_prefix'], '');
      expect(viewModel.config['dgi_current_number'], '1');

      final saved = verify(() => mockConfigDao.saveConfig(captureAny())).captured.cast<LocalConfigEntity>();
      final savedMap = {for (final e in saved) e.key: e.value};
      expect(savedMap['dgi_prefix'], '');
      expect(savedMap['dgi_current_number'], '1');
      expect(savedMap['ruc'], '0011112930059D');
    });

    test('upgrading CONTROL_INTERNO -> REGIMEN_GENERAL replaces NV- with F- and resets consecutive to 1', () async {
      when(() => mockConfigDao.getConfigByKey('tax_regime'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tax_regime', value: 'CONTROL_INTERNO'));
      when(() => mockConfigDao.getConfigByKey('dgi_prefix'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_prefix', value: 'NV-'));
      when(() => mockConfigDao.getConfigByKey('dgi_current_number'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_current_number', value: '27'));
      await viewModel.loadConfig();

      viewModel.setTaxRegime(TaxRegime.regimenGeneral);
      expect(viewModel.config['dgi_prefix'], 'F-');
      expect(viewModel.config['dgi_current_number'], '1');

      await viewModel.saveConfig({
        'business_name': 'Ferretería El Progreso S.A.',
        'ruc': 'J0310000000001',
        'tax_regime': 'REGIMEN_GENERAL',
        'dgi_prefix': 'NV-',
        'dgi_current_number': '27',
      });

      expect(viewModel.config['tax_regime'], 'REGIMEN_GENERAL');
      expect(viewModel.config['dgi_prefix'], 'F-');
      expect(viewModel.config['dgi_current_number'], '1');

      final saved = verify(() => mockConfigDao.saveConfig(captureAny())).captured.cast<LocalConfigEntity>();
      final savedMap = {for (final e in saved) e.key: e.value};
      expect(savedMap['dgi_prefix'], 'F-');
      expect(savedMap['dgi_current_number'], '1');
      expect(savedMap['ruc'], 'J0310000000001');
    });

    test('upgrading CONTROL_INTERNO -> REGIMEN_GENERAL preserves explicit operator dgi_current_number and dgi_range_start', () async {
      when(() => mockConfigDao.getConfigByKey('tax_regime'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'tax_regime', value: 'CONTROL_INTERNO'));
      when(() => mockConfigDao.getConfigByKey('dgi_prefix'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_prefix', value: 'NV-'));
      when(() => mockConfigDao.getConfigByKey('dgi_current_number'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'dgi_current_number', value: '27'));
      await viewModel.loadConfig();

      await viewModel.saveConfig({
        'business_name': 'Ferretería El Progreso S.A.',
        'ruc': 'J0310000000001',
        'tax_regime': 'REGIMEN_GENERAL',
        'dgi_prefix': 'NV-',
        'dgi_current_number': '500',
        'dgi_range_start': '500',
      });

      expect(viewModel.config['tax_regime'], 'REGIMEN_GENERAL');
      expect(viewModel.config['dgi_prefix'], 'F-');
      expect(viewModel.config['dgi_current_number'], '500');
      expect(viewModel.config['dgi_range_start'], '500');

      final saved = verify(() => mockConfigDao.saveConfig(captureAny())).captured.cast<LocalConfigEntity>();
      final savedMap = {for (final e in saved) e.key: e.value};
      expect(savedMap['dgi_prefix'], 'F-');
      expect(savedMap['dgi_current_number'], '500');
      expect(savedMap['dgi_range_start'], '500');
      expect(savedMap['ruc'], 'J0310000000001');
    });
  });
}
