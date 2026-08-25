import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
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
  });

  group('BusinessProfileViewModel FX Rates & Business Config', () {
    test('loadConfig hydrates standard business details, FX rates, and operation_mode defaults',
        () async {
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
      when(() => mockConfigDao.getConfigByKey('operation_mode'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'operation_mode', value: 'FOODPARK_QSR'));

      await viewModel.loadConfig();

      expect(viewModel.config['business_name'], 'Café Managua');
      expect(viewModel.config['commercial_exchange_rate'], '36.50');
      expect(viewModel.config['bcn_official_exchange_rate'], '36.6241');
      expect(viewModel.config['operation_mode'], 'FOODPARK_QSR');
      expect(viewModel.operationMode, TenantOperationMode.foodparkQsr);
      expect(viewModel.commercialRate, 36.50);
      expect(viewModel.bcnOfficialRate, 36.6241);
    });

    test('saveConfig persists commercial and official exchange rates and operation mode',
        () async {
      when(() => mockConfigDao.saveConfig(any())).thenAnswer((_) async {});

      await viewModel.saveConfig({
        'business_name': 'Café Managua',
        'ruc': 'J0310000000001',
        'address': 'Plaza Mayor',
        'phone': '2222-3333',
        'legal_footer': 'Gracias por su compra',
        'commercial_exchange_rate': '36.80',
        'bcn_official_exchange_rate': '36.6241',
        'operation_mode': 'RESTAURANT',
      });

      expect(viewModel.config['commercial_exchange_rate'], '36.80');
      expect(viewModel.config['operation_mode'], 'RESTAURANT');
      expect(viewModel.operationMode, TenantOperationMode.restaurant);
      expect(viewModel.commercialRate, 36.80);
      verify(() => mockConfigDao.saveConfig(any())).called(8);
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
}
