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
  group('resolveStartupTransport release honesty (Q5 unit C1)', () {
    test(
        'release with nothing persisted and no define must NOT fall back to '
        'the development default; the transport is unconfigured', () async {
      final startup = await resolveStartupTransport(
        configDao: _InMemoryLocalConfigDao(),
        buildTimeApiUrl: '',
        isReleaseMode: true,
      );

      expect(startup.resolution.source, ApiBaseUrlSource.unconfigured);
      expect(startup.resolution.isConfigured, isFalse);
      expect(
        startup.transportBaseUrl,
        isNot(ApiBaseUrlService.developmentDefaultUrl),
        reason:
            'a release build must not silently pretend the localhost default '
            'is a backend',
      );
      expect(
        startup.transportBaseUrl,
        isNull,
        reason: 'no Dio client may be pointed at any URL when unconfigured',
      );
    });

    test('debug with the same inputs still yields the development default',
        () async {
      final startup = await resolveStartupTransport(
        configDao: _InMemoryLocalConfigDao(),
        buildTimeApiUrl: '',
        isReleaseMode: false,
      );

      expect(startup.resolution.source, ApiBaseUrlSource.developmentDefault);
      expect(startup.transportBaseUrl, ApiBaseUrlService.developmentDefaultUrl);
    });

    test('release with a persisted URL still wins over the build define',
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
        isReleaseMode: true,
      );

      expect(startup.resolution.source, ApiBaseUrlSource.persistedConfig);
      expect(startup.transportBaseUrl, 'https://persisted.example.com/api');
    });

    test('release with only a build define still resolves the define',
        () async {
      final startup = await resolveStartupTransport(
        configDao: _InMemoryLocalConfigDao(),
        buildTimeApiUrl: 'https://define.example.com/api',
        isReleaseMode: true,
      );

      expect(startup.resolution.source, ApiBaseUrlSource.buildDefine);
      expect(startup.transportBaseUrl, 'https://define.example.com/api');
    });

    test(
        'every client built from an unconfigured transport rejects requests '
        'with the typed unconfigured exception', () async {
      final startup = await resolveStartupTransport(
        configDao: _InMemoryLocalConfigDao(),
        buildTimeApiUrl: '',
        isReleaseMode: true,
      );
      final clients = PosDioClients(baseUrl: startup.transportBaseUrl);

      for (final client in [
        clients.app,
        clients.refresh,
        clients.claim,
        clients.deviceSyncExchange,
        clients.sync,
      ]) {
        await expectLater(
          client.get<void>('/v1/health'),
          throwsA(
            isA<UnconfiguredBackendException>().having(
              (e) => e.source,
              'source',
              ApiBaseUrlSource.unconfigured,
            ),
          ),
          reason: 'no client may keep a usable URL when unconfigured',
        );
      }
    });
  });
}
