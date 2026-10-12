import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/network/unconfigured_backend_interceptor.dart';
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

    group('cleartext (plain http) restricted to LAN hosts (audit S6)', () {
      Future<ApiBaseUrlValidationFailure?> validate(String url) async {
        final service = ApiBaseUrlService(
          _InMemoryLocalConfigDao(),
          isReleaseMode: false,
        );
        return ApiBaseUrlService.validateApiUrl(url);
      }

      test('accepts plain http for private IP literals', () async {
        expect(await validate('http://192.168.1.20:3000/api'), isNull);
        expect(await validate('http://10.0.0.5/api'), isNull);
        expect(await validate('http://172.16.5.4/api'), isNull);
        expect(await validate('http://172.31.255.1/api'), isNull);
      });

      test('accepts plain http for localhost and emulator loopback', () async {
        expect(await validate('http://localhost:3000/api'), isNull);
        expect(await validate('http://127.0.0.1:3000/api'), isNull);
        expect(await validate('http://10.0.2.2:3000/api'), isNull);
      });

      test('accepts plain http for single-label and .local/.lan/.internal hosts', () async {
        expect(await validate('http://nhilos-server:3000/api'), isNull);
        expect(await validate('http://nas.local/api'), isNull);
        expect(await validate('http://pos-backend.lan/api'), isNull);
        expect(await validate('http://backend.internal/api'), isNull);
      });

      test('always accepts https for any host', () async {
        expect(await validate('https://api.nhilospos.com/api'), isNull);
        expect(await validate('https://pos.example.com/api'), isNull);
      });

      test('rejects plain http to public hosts', () async {
        final failure = await validate('http://api.nhilospos.com/api');
        expect(failure, isNotNull);
        expect(failure!.reason, ApiBaseUrlValidationReason.cleartextNotAllowed);
      });

      test('rejects plain http to public IP literals', () async {
        final failure = await validate('http://8.8.8.8/api');
        expect(failure, isNotNull);
        expect(failure!.reason, ApiBaseUrlValidationReason.cleartextNotAllowed);
      });

      test('rejects 172.15.x and 172.32.x (outside the private range)', () async {
        final low = await validate('http://172.15.0.1/api');
        expect(low!.reason, ApiBaseUrlValidationReason.cleartextNotAllowed);
        final high = await validate('http://172.32.0.1/api');
        expect(high!.reason, ApiBaseUrlValidationReason.cleartextNotAllowed);
      });

      test('a rejected public cleartext URL persists nothing', () async {
        final configDao = _InMemoryLocalConfigDao();
        final service = ApiBaseUrlService(configDao, isReleaseMode: false);

        expect(
          () => service.save('http://api.nhilospos.com/api'),
          throwsA(isA<ApiBaseUrlValidationException>()),
        );
        expect(configDao.saved, isEmpty);
      });
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

  group('ApiBaseUrlService structured rejection reasons', () {
    Future<ApiBaseUrlValidationReason> rejectionReason(String input) async {
      final service =
          ApiBaseUrlService(_InMemoryLocalConfigDao(), isReleaseMode: false);
      try {
        await service.save(input);
      } on ApiBaseUrlValidationException catch (e) {
        return e.reason!;
      }
      throw StateError('expected $input to be rejected');
    }

    test('empty value reports the empty reason', () async {
      expect(await rejectionReason(''), ApiBaseUrlValidationReason.empty);
    });

    test('whitespace reports the whitespace reason', () async {
      expect(
        await rejectionReason('https://api.example.com/api /v1'),
        ApiBaseUrlValidationReason.whitespace,
      );
    });

    test('a relative URL reports the notAbsolute reason', () async {
      expect(
        await rejectionReason('api.example.com/api'),
        ApiBaseUrlValidationReason.notAbsolute,
      );
    });

    test('an empty host reports the notAbsolute reason', () async {
      expect(
        await rejectionReason('https:///api'),
        ApiBaseUrlValidationReason.notAbsolute,
      );
    });

    test('the English message is preserved for the script-mirrored contract',
        () async {
      final failure =
          ApiBaseUrlService.validateApiUrl('api.example.com/api');

      expect(failure, isNotNull);
      expect(failure!.reason, ApiBaseUrlValidationReason.notAbsolute);
      expect(failure.message, startsWith('Invalid API URL:'));
    });

    test('the notAbsolute example names the official API host, not a staging host',
        () async {
      final failure =
          ApiBaseUrlService.validateApiUrl('api.example.com/api');

      expect(failure, isNotNull);
      expect(failure!.message, contains('https://api.nhilospos.com/api'));
      expect(failure.message, isNot(contains('api-staging')));
    });

    test('a valid URL produces no failure', () {
      expect(
        ApiBaseUrlService.validateApiUrl('https://api.example.com/api'),
        isNull,
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
        'unconfigured release transport reports no URL; a release build must '
        'not silently use the localhost default',
        () async {
      final configDao = _InMemoryLocalConfigDao();

      final startup = await resolveStartupTransport(
        configDao: configDao,
        buildTimeApiUrl: '',
        isReleaseMode: true,
      );

      expect(startup.resolution.source, ApiBaseUrlSource.unconfigured);
      expect(startup.resolution.isConfigured, isFalse);
      // Supersedes the earlier assertion that transportBaseUrl fell back to
      // the development default: odd/tasks/api-url-runtime-provisioning.md
      // :73-78 requires a release build to surface an explicit unconfigured
      // state instead of pretending localhost is a backend, and the
      // ApiBaseUrlSource.unconfigured contract (api_base_url_service.dart)
      // says it must never be silently replaced by the localhost default.
      expect(
        startup.transportBaseUrl,
        isNull,
        reason: 'no Dio client may be pointed at any URL when unconfigured',
      );
      final clients = PosDioClients(baseUrl: startup.transportBaseUrl);
      await expectLater(
        clients.app.get<void>('/v1/health'),
        throwsA(isA<UnconfiguredBackendException>()),
        reason: 'an unconfigured transport must fail locally, typed, '
            'before any socket is opened',
      );
    });
  });
}
