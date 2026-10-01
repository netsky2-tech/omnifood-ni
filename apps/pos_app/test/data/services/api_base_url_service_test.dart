import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/api_base_url_service.dart';
import 'package:pos_app/main.dart';

class _InMemoryLocalConfigDao implements LocalConfigDao {
  final Map<String, LocalConfigEntity> saved = <String, LocalConfigEntity>{};

  @override
  Future<void> deleteConfig(String key) async {
    saved.remove(key);
  }

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async => saved[key];

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    saved[config.key] = config;
  }
}

void main() {
  group('ApiBaseUrlService resolution order', () {
    test('persisted api_base_url wins over the build-time define', () async {
      final configDao = _InMemoryLocalConfigDao();
      await configDao.saveConfig(
        LocalConfigEntity(
          key: ApiBaseUrlService.configKey,
          value: 'https://persisted.example.com/api',
        ),
      );
      final service = ApiBaseUrlService(configDao, isReleaseMode: true);

      final resolution = await service.resolve(
        buildTimeApiUrl: 'https://define.example.com/api',
      );

      expect(resolution.url, 'https://persisted.example.com/api');
      expect(resolution.source, ApiBaseUrlSource.persistedConfig);
      expect(resolution.isConfigured, isTrue);
    });

    test('build-time define is used when nothing is persisted', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: true);

      final resolution = await service.resolve(
        buildTimeApiUrl: 'https://define.example.com/api',
      );

      expect(resolution.url, 'https://define.example.com/api');
      expect(resolution.source, ApiBaseUrlSource.buildDefine);
      expect(resolution.isConfigured, isTrue);
    });

    test('development default applies in debug when nothing else is set',
        () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      final resolution = await service.resolve(buildTimeApiUrl: '');

      expect(resolution.url, 'http://127.0.0.1:3000/api');
      expect(resolution.source, ApiBaseUrlSource.developmentDefault);
      expect(resolution.isConfigured, isTrue);
    });

    test(
        'release build with no persisted value and no define reports unconfigured',
        () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: true);

      final resolution = await service.resolve(buildTimeApiUrl: '');

      expect(resolution.url, isNull);
      expect(resolution.source, ApiBaseUrlSource.unconfigured);
      expect(resolution.isConfigured, isFalse);
    });

    test('release build with a define is configured, not unconfigured',
        () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: true);

      final resolution = await service.resolve(
        buildTimeApiUrl: 'https://fleet.example.com/api',
      );

      expect(resolution.url, 'https://fleet.example.com/api');
      expect(resolution.source, ApiBaseUrlSource.buildDefine);
    });

    test('release build with a persisted value is configured', () async {
      final configDao = _InMemoryLocalConfigDao();
      await configDao.saveConfig(
        LocalConfigEntity(
          key: ApiBaseUrlService.configKey,
          value: 'https://persisted.example.com/api',
        ),
      );
      final service = ApiBaseUrlService(configDao, isReleaseMode: true);

      final resolution = await service.resolve(buildTimeApiUrl: '');

      expect(resolution.url, 'https://persisted.example.com/api');
      expect(resolution.source, ApiBaseUrlSource.persistedConfig);
    });

    test('blank persisted value is ignored in favor of the define', () async {
      final configDao = _InMemoryLocalConfigDao();
      await configDao.saveConfig(
        LocalConfigEntity(key: ApiBaseUrlService.configKey, value: '   '),
      );
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      final resolution = await service.resolve(
        buildTimeApiUrl: 'https://define.example.com/api',
      );

      expect(resolution.url, 'https://define.example.com/api');
      expect(resolution.source, ApiBaseUrlSource.buildDefine);
    });
  });

  group('ApiBaseUrlService persistence', () {
    test('save persists the URL through the DAO', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      await service.save('https://operator.example.com/api');

      expect(
        configDao.saved[ApiBaseUrlService.configKey]?.value,
        'https://operator.example.com/api',
      );
    });

    test('a saved URL is resolved as the persisted source', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      await service.save('https://operator.example.com/api');
      final resolution = await service.resolve(
        buildTimeApiUrl: 'https://define.example.com/api',
      );

      expect(resolution.url, 'https://operator.example.com/api');
      expect(resolution.source, ApiBaseUrlSource.persistedConfig);
    });

    test('clear removes the persisted URL through the DAO', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);
      await service.save('https://operator.example.com/api');

      await service.clear();

      expect(configDao.saved.containsKey(ApiBaseUrlService.configKey), isFalse);
    });
  });

  group('ApiBaseUrlService validation (mirrors validate_api_url)', () {
    test('rejects a relative URL', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      expect(
        () => service.save('api.example.com/api'),
        throwsA(isA<ApiBaseUrlValidationException>()),
      );
      expect(configDao.saved, isEmpty);
    });

    test('rejects a value containing whitespace', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      expect(
        () => service.save('https://api.example.com/api /v1'),
        throwsA(isA<ApiBaseUrlValidationException>()),
      );
      expect(
        () => service.save(' https://api.example.com/api'),
        throwsA(isA<ApiBaseUrlValidationException>()),
      );
      expect(configDao.saved, isEmpty);
    });

    test('rejects a non-http scheme', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      expect(
        () => service.save('ftp://api.example.com/api'),
        throwsA(isA<ApiBaseUrlValidationException>()),
      );
      expect(configDao.saved, isEmpty);
    });

    test('rejects an empty host', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      expect(
        () => service.save('https:///api'),
        throwsA(isA<ApiBaseUrlValidationException>()),
      );
      expect(
        () => service.save('http://'),
        throwsA(isA<ApiBaseUrlValidationException>()),
      );
      expect(configDao.saved, isEmpty);
    });

    test('rejects an empty value', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      expect(
        () => service.save(''),
        throwsA(isA<ApiBaseUrlValidationException>()),
      );
      expect(configDao.saved, isEmpty);
    });

    test('accepts an absolute http:// URL with a non-empty host', () async {
      final configDao = _InMemoryLocalConfigDao();
      final service = ApiBaseUrlService(configDao, isReleaseMode: false);

      await service.save('http://192.168.1.50:3000/api');

      expect(
        configDao.saved[ApiBaseUrlService.configKey]?.value,
        'http://192.168.1.50:3000/api',
      );
    });
  });

  group('Dio client wiring (main.dart)', () {
    test(
        'a persisted URL wins over the build define in the client construction',
        () async {
      final configDao = _InMemoryLocalConfigDao();
      await configDao.saveConfig(
        LocalConfigEntity(
          key: ApiBaseUrlService.configKey,
          value: 'https://persisted.example.com/api',
        ),
      );

      final startup = await resolveStartupTransport(
        configDao: configDao,
        buildTimeApiUrl: 'https://define.example.com/api',
      );
      final clients = PosDioClients(baseUrl: startup.transportBaseUrl);

      expect(startup.resolution.source, ApiBaseUrlSource.persistedConfig);
      expect(clients.app.options.baseUrl, 'https://persisted.example.com/api');
      expect(
        clients.refresh.options.baseUrl,
        'https://persisted.example.com/api',
      );
      expect(clients.claim.options.baseUrl, 'https://persisted.example.com/api');
      expect(
        clients.deviceSyncExchange.options.baseUrl,
        'https://persisted.example.com/api',
      );
      expect(clients.sync.options.baseUrl, 'https://persisted.example.com/api');
    });

    test('claimDio stays bare: no interceptors may attach to it', () async {
      final configDao = _InMemoryLocalConfigDao();
      final startup = await resolveStartupTransport(
        configDao: configDao,
        buildTimeApiUrl: 'https://define.example.com/api',
      );
      final clients = PosDioClients(baseUrl: startup.transportBaseUrl);

      // "Bare" means no interceptors beyond Dio's built-in defaults (which
      // even a plain Dio() has): nothing may attach an Authorization header
      // to the pre-auth link exchange.
      final defaultDio = Dio();
      expect(
        clients.claim.interceptors.length,
        defaultDio.interceptors.length,
        reason: 'claimDio must carry only Dio\'s built-in default interceptors',
      );
    });

    test(
        'unconfigured release transport falls back to the development URL while reporting unconfigured',
        () async {
      final configDao = _InMemoryLocalConfigDao();

      final startup = await resolveStartupTransport(
        configDao: configDao,
        buildTimeApiUrl: '',
        isReleaseMode: true,
      );

      expect(startup.resolution.source, ApiBaseUrlSource.unconfigured);
      expect(startup.resolution.isConfigured, isFalse);
      expect(
        startup.transportBaseUrl,
        ApiBaseUrlService.developmentDefaultUrl,
      );
    });
  });
}
