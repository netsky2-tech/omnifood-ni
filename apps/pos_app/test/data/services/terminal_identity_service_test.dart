import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';

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
  group('TerminalIdentityService', () {
    test(
      'persists build-time DEVICE_ID as the stable local identity',
      () async {
        final configDao = _InMemoryLocalConfigDao();
        final service = TerminalIdentityService(
          configDao,
          createLocalId: () => 'pos-local-generated',
        );

        final deviceId = await service.resolveDeviceId(
          buildTimeDeviceId: ' pos-terminal-build-7 ',
        );

        expect(deviceId, 'pos-terminal-build-7');
        expect(
          configDao.saved[TerminalIdentityService.localDeviceIdKey]?.value,
          'pos-terminal-build-7',
        );
      },
    );

    test(
      'reuses persisted build-time DEVICE_ID when a later build omits DEVICE_ID',
      () async {
        final configDao = _InMemoryLocalConfigDao();
        var generatedCount = 0;
        final service = TerminalIdentityService(
          configDao,
          createLocalId: () {
            generatedCount += 1;
            return 'pos-local-generated';
          },
        );

        final provisioned = await service.resolveDeviceId(
          buildTimeDeviceId: 'pos-terminal-build-7',
        );
        final laterBuildWithoutDeviceId = await service.resolveDeviceId();

        expect(provisioned, 'pos-terminal-build-7');
        expect(laterBuildWithoutDeviceId, 'pos-terminal-build-7');
        expect(generatedCount, 0);
      },
    );

    test(
      'persists one local unique identity when DEVICE_ID is absent',
      () async {
        final configDao = _InMemoryLocalConfigDao();
        var generatedCount = 0;
        final service = TerminalIdentityService(
          configDao,
          createLocalId: () {
            generatedCount += 1;
            return 'pos-local-install-abc';
          },
        );

        final first = await service.resolveDeviceId(buildTimeDeviceId: '');
        final second = await service.resolveDeviceId();

        expect(first, 'pos-local-install-abc');
        expect(second, 'pos-local-install-abc');
        expect(generatedCount, 1);
        expect(
          configDao
              .saved[TerminalIdentityService.localDeviceIdKey]
              ?.description,
          contains('offline-safe terminal identity'),
        );
      },
    );
  });
}
